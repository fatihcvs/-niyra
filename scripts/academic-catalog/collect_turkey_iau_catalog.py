"""Materialize public Istanbul Aydin EBS plans captured in a real browser."""
import base64
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import re

from discover_turkey_courses import match, normal
from parse_cyprus_courses import clean, fold
from turkey_research import CACHE, ROOT, write


UID = "tr-istanbul-aydin-universitesi"
DIRECTORIES = {
    "bachelor": "https://ebs.aydin.edu.tr/tr/index.iau?Page=AB&Type=L",
    "associate": "https://ebs.aydin.edu.tr/tr/index.iau?Page=AB&Type=OL",
}
ALIASES = {
    "program-osym-202412658": ("255", "01080", "ozel egitim"),
    "program-osym-202410644": ("14", "01010", "ingilizce ogretmenligi"),
    "program-osym-202452648": ("112", "11040", "bilgisayar programciligi ue"),
    "program-osym-202452912": ("72", "10151", "halkla iliskiler tanitim meslek yuksekokul"),
    "program-osym-202457365": ("525", "10498", "sivil hava ulastirma isletmeciligi ing"),
    "program-osym-202450749": ("98", "10310", "turist rehberligi"),
    "program-osym-202490632": ("43", "06060", "uluslararasi ticaret finansman ing"),
    "program-osym-202410768": ("19", "02020", "ingiliz dili edebiyati"),
}


def _capture_folder():
    configured = os.environ.get("KAMPIRA_IAU_CAPTURE_DIR")
    return Path(configured) if configured else CACHE / "iau-browser"


def _load_capture(path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value.get("sources"), list):
        raise ValueError(f"invalid browser capture array: {path.name}")
    return value


def _materialize(raw, prefix, captured_at):
    body = base64.b64decode(raw["bodyBase64"], validate=True)
    digest = hashlib.sha256(body).hexdigest()
    path = CACHE / f"iau-{prefix}-{digest[:24]}.body"
    path.write_bytes(body)
    return {
        "url": raw["url"],
        "publicUrl": raw.get("publicUrl", raw["url"]),
        "status": raw["status"],
        "file": path.name,
        "fetchedAt": captured_at or datetime.now(timezone.utc).isoformat(),
        "sha256": digest,
        "contentType": raw.get("contentType", "text/html; charset=UTF-8"),
        "browserCapture": "public-browser-session",
    }


def _directory_items(source, degree):
    from bs4 import BeautifulSoup

    body = (CACHE / source["file"]).read_bytes().decode("utf-8")
    document = BeautifulSoup(body, "html.parser")
    items = []
    for heading in document.select("th.blue"):
        unit = clean(heading.get_text(" ", strip=True))
        details = heading.find_parent("tr").find_next_sibling("tr")
        if details is None:
            continue
        for cell in details.select("td[onclick*='getBolum']"):
            text = clean(cell.get_text(" ", strip=True))
            found = re.search(r"getBolum\('([0-9]+)'", cell.get("onclick", ""))
            identity = re.match(r"^([0-9]{5})\s*-\s*(.+)$", text)
            if found and identity:
                items.append({
                    "bk": found[1],
                    "code": identity[1],
                    "title": identity[2],
                    "unit": unit,
                    "degree": degree,
                    "directoryUrl": source["url"],
                    "directoryHash": source["sha256"],
                })
    return list({item["bk"]: item for item in items}.values())


def _match_programmes(university, items):
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    by_bk = {item["bk"]: item for item in items}
    matched = []
    for item in items:
        programme = match(university, item)
        if programme:
            matched.append((programme, item, False))
    matched_ids = {programme["id"] for programme, _, _ in matched}
    for programme_id, (bk, source_code, source_title) in ALIASES.items():
        programme = next((value for value in university["programs"] if value["id"] == programme_id), None)
        item = by_bk.get(bk)
        if programme is None or item is None or programme["id"] in matched_ids:
            raise ValueError(f"invalid IAU programme alias: {programme_id} -> {bk}")
        if item["code"] != source_code or normal(item["title"]) != source_title:
            raise ValueError(f"IAU programme alias identity changed: {programme_id} -> {bk}")
        source_unit = re.sub(r"\s*\(UE\)\s*$", "", item["unit"], flags=re.I)
        if (programme["degreeLevel"] != item["degree"]
                or normal(units[programme["unitId"]]) != normal(source_unit)):
            raise ValueError(f"IAU programme alias changed: {programme_id} -> {bk}")
        matched.append((programme, item, True))
        matched_ids.add(programme["id"])
    if len(matched_ids) != len(university["programs"]):
        missing = sorted(programme["id"] for programme in university["programs"]
                         if programme["id"] not in matched_ids)
        raise ValueError(f"IAU current registry coverage is incomplete: {missing}")
    counts = {}
    for programme, _, _ in matched:
        counts[programme["id"]] = counts.get(programme["id"], 0) + 1
    if any(count != 1 for count in counts.values()):
        raise ValueError("IAU directory maps more than once to a registry programme")
    return matched


def _validate_plan(source, item):
    from bs4 import BeautifulSoup

    body = (CACHE / source["file"]).read_bytes().decode("utf-8")
    document = BeautifulSoup(body, "html.parser")
    if document.title is None or "ders plani" not in fold(document.title.get_text(" ")):
        raise ValueError(f"IAU course-plan page is unavailable: {item['bk']}")
    export = document.select_one("a[href*='BolumDersleri_Excel']")
    row_text = clean(export.find_parent("tr").get_text(" ", strip=True)) if export else ""
    identity = re.fullmatch(r"([0-9]{5})-(.+)-", row_text)
    if (identity is None or identity[1] != item["code"]
            or normal(identity[2]) != normal(item["title"])):
        raise ValueError(f"IAU course-plan identity changed: {item['bk']}")
    page_text = fold(document.get_text(" ", strip=True))
    expected_degree = "duzeyi: lisans" if item["degree"] == "bachelor" else "duzeyi: onlisans"
    english_degree = ("duzeyi: bachelor's degree" if item["degree"] == "bachelor"
                      else "duzeyi: associate degree")
    untranslated_degree = (f"duzeyi: tr_ebs_global_dersduzeyleri_l_{item['bk']}"
                           if item["degree"] == "bachelor"
                           else f"duzeyi: tr_ebs_global_dersduzeyleri_ol_{item['bk']}")
    if (expected_degree not in page_text and english_degree not in page_text
            and untranslated_degree not in page_text):
        raise ValueError(f"IAU course-plan degree changed: {item['bk']}")
    tables = 0
    rows = 0
    for table in document.select("table.list"):
        values = [fold(cell.get_text(" ", strip=True)) for cell in table.find_all(["td", "th"])]
        if "kodu" not in values or "ders adi" not in values:
            continue
        tables += 1
        rows += sum(bool(re.search(r"[A-Z\u00c7\u011e\u0130\u00d6\u015e\u00dc]{1,12}\s*\d{2,10}",
                                   clean(row.get_text(" ", strip=True)).upper()))
                    for row in table.find_all("tr", recursive=False))
    if tables == 0 or rows < 3:
        raise ValueError(f"IAU course-plan tables are empty: {item['bk']}")


def main():
    capture_folder = _capture_folder()
    directory_capture = _load_capture(capture_folder / "iau-directories-raw.json.gz")
    directory_sources = []
    directory_items = []
    for raw in directory_capture["sources"]:
        degree = next((key for key, url in DIRECTORIES.items() if raw.get("url") == url), None)
        if degree is None or raw.get("status") != 200:
            raise ValueError("IAU degree directory capture changed")
        source = _materialize(raw, f"directory-{degree}", directory_capture.get("capturedAt"))
        directory_sources.append(source)
        directory_items.extend(_directory_items(source, degree))
    if len(directory_items) != 164:
        raise ValueError(f"IAU directory count changed: {len(directory_items)}")

    university = json.loads((ROOT / "data/academic-catalog-2026.json").read_text(encoding="utf-8"))["universities"][UID]
    matched = _match_programmes(university, directory_items)
    raw_courses = {}
    for capture_path in sorted(capture_folder.glob("iau-courses-*.json.gz")):
        capture = _load_capture(capture_path)
        for raw in capture["sources"]:
            bk = str(raw.get("bk", ""))
            if bk in raw_courses:
                raise ValueError(f"duplicate IAU course capture: {bk}")
            raw_courses[bk] = (raw, capture.get("capturedAt"))
    expected_bks = {item["bk"] for _, item, _ in matched}
    if set(raw_courses) != expected_bks:
        raise ValueError(f"IAU capture set mismatch: missing={sorted(expected_bks-set(raw_courses))}, extra={sorted(set(raw_courses)-expected_bks)}")

    sources = []
    references = []
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    for programme, item, alias in sorted(matched, key=lambda value: value[0]["id"]):
        raw, captured_at = raw_courses[item["bk"]]
        expected_url = f"https://ebs.aydin.edu.tr/tr/index.iau?BK={item['bk']}&DersTuru=0&Page=BolumDersleri"
        if raw.get("status") != 200 or raw.get("url") != expected_url:
            raise ValueError(f"IAU course capture failed: {item['bk']}")
        source = _materialize(raw, f"plan-{item['bk']}", captured_at)
        _validate_plan(source, item)
        reference = {
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": programme["name"],
            "unit": units[programme["unitId"]],
            "degree": programme["degreeLevel"],
            "courseUrl": expected_url,
            "directoryUrl": item["directoryUrl"],
            "identityEvidenceUrl": item["directoryUrl"],
        }
        source.update({
            "family": "iau",
            "programs": [reference],
            "selection": {
                "method": "published-default-ebs-plan",
                "bk": item["bk"],
                "directoryCode": item["code"],
                "directoryTitle": item["title"],
                "directoryHash": item["directoryHash"],
                "registryAlias": alias,
            },
        })
        sources.append(source)
        references.append(reference)
    unmatched = [item for item in directory_items if item["bk"] not in expected_bks]
    write(CACHE / "iau-courses.json", sources)
    write(CACHE / "iau-directories.json", [{
        "universityId": UID,
        "pages": directory_sources,
        "matched": references,
        "unmatched": unmatched,
    }])
    print("Istanbul Aydin University:", len(references), "matched;",
          len(unmatched), "non-registry directory entries excluded;",
          len(sources), "course plans captured", flush=True)


if __name__ == "__main__":
    main()
