"""Collect reviewed Atatürk University open-education curricula."""
import json
import re
import time
from urllib.parse import urlencode

from bs4 import BeautifulSoup

from discover_turkey_courses import normal
from parse_turkey_courses import parse_source
from turkey_research import CACHE, ROOT, fetch, read, write


UID = "tr-ataturk-universitesi"
UNIT = "Açık ve Uzaktan Öğretim Fakültesi"
DIRECTORY_URL = "https://obs.atauni.edu.tr/moduller/dbp/eobs/birimListe/2"
TREE_API = "https://obs.atauni.edu.tr/moduller/islem/eobs/getirBirimlerByBtId/2/"
COURSE_API = "https://obs.atauni.edu.tr/moduller/islem/eobs/getirProgramMufredat"
TARGET_PROGRAM_IDS = {
    "program-osym-101490698", "program-osym-101490649", "program-osym-101490817",
    "program-osym-101490677", "program-osym-101490719", "program-osym-101490852",
    "program-osym-101490803", "program-osym-101490740", "program-osym-101490621",
    "program-osym-101490691", "program-osym-101490572", "program-osym-101490593",
    "program-osym-101490775", "program-osym-101490831", "program-osym-101490705",
    "program-osym-101490600", "program-osym-101490635", "program-osym-101490754",
    "program-osym-101490586", "program-osym-101490796", "program-osym-101490565",
    "program-osym-101490684", "program-osym-101490558", "program-osym-101490607",
    "program-osym-101490628", "program-osym-101490782", "program-osym-101490768",
    "program-osym-101490838", "program-osym-101490726", "program-osym-101490670",
    "program-osym-101490824", "program-osym-101490579", "program-osym-101490761",
}
EXPECTED_CONFLICTS = {
    "program-osym-101490635": ["RKR1007"],
    "program-osym-101490740": ["ORT2003"],
    "program-osym-101490775": ["LOJ1006", "ORT2002"],
}


def _fetch_success(url, payload=None, content_type=None):
    source = None
    for _attempt in range(6):
        source = fetch(url, payload, content_type, retry_failed=True)
        if source.get("status") == 200 and source.get("sha256"):
            return source
        time.sleep(0.75)
    raise ValueError(f"Atatürk official source remained unavailable: {url} / {source}")


def _official_programmes():
    root_source = _fetch_success(TREE_API + "3993")
    queue = list(read(CACHE / root_source["file"]))
    seen = set()
    leaves = []
    while queue:
        node = queue.pop(0)
        if node["id"] in seen:
            continue
        seen.add(node["id"])
        if str(node.get("bt_id")) in {"21", "33"}:
            raw_title = re.sub(r"\s*\(\d+\)\s*$", "", node["label"]).strip()
            match = re.fullmatch(r"(.+?)\s+(Önlisans|Lisans)\s+Programı", raw_title)
            if match:
                leaves.append({
                    "name": match[1].strip(),
                    "degree": "associate" if match[2] == "Önlisans" else "bachelor",
                    "officialTitle": raw_title,
                    "programmeId": str(node["id"]),
                    "url": "https://obs.atauni.edu.tr/moduller/dbp/eobs/birimDetay/"
                           + str(node["id"]) + "/" + node["label"],
                })
            continue
        if str(node.get("inode")).lower() != "true":
            continue
        source = _fetch_success(TREE_API + node["id"])
        children = read(CACHE / source["file"])
        queue.extend(children if isinstance(children, list) else [children])
    if len(leaves) != 49:
        raise ValueError(f"Atatürk open-education programme directory changed: {len(leaves)}")
    return root_source, leaves


def _catalogue_name(value):
    value = re.sub(r"\s*\(Açıköğretim\)\s*$", "", value).strip()
    return re.sub(r"\s*\(Önlisans\)\s*$", "", value).strip()


def _current_curriculum(item, programme):
    page = _fetch_success(item["url"])
    document = BeautifulSoup((CACHE / page["file"]).read_bytes(), "html.parser")
    programme_field = document.select_one("#program_id")
    if programme_field is None or programme_field.get("value") != item["programmeId"]:
        raise ValueError(f"Atatürk programme page identity changed: {item['url']}")
    year = next((option for option in document.select("#ay_id option")
                 if re.match(r"2026\s*-\s*2027\b", option.get_text(" ", strip=True))), None)
    if year is None:
        raise ValueError(f"Atatürk current academic year is missing: {item['url']}")
    payload = urlencode({"ay_id": year["value"], "program_id": item["programmeId"]}).encode()
    source = _fetch_success(COURSE_API, payload, "application/x-www-form-urlencoded")
    rows = json.loads((CACHE / source["file"]).read_text(encoding="utf-8-sig"))
    if not isinstance(rows, list) or len(rows) < 3:
        raise ValueError(f"Atatürk current curriculum is unreadable: {item['url']}")
    reference = {
        "universityId": UID,
        "programId": programme["id"],
        "name": programme["name"],
        "title": programme["name"],
        "sourceTitle": item["officialTitle"],
        "degree": programme["degreeLevel"],
        "unit": UNIT,
        "directoryUrl": DIRECTORY_URL,
    }
    selection = {
        "method": "reviewed-official-programme-route",
        "sourceTitle": item["officialTitle"],
        "degree": item["degree"],
        "programmeId": item["programmeId"],
        "academicYearId": year["value"],
    }
    return {
        **source,
        "programs": [reference],
        "family": "ataturk-open-reviewed-2026",
        "payload": {"ay_id": year["value"], "program_id": item["programmeId"]},
        "publicUrl": item["url"],
        "curriculumPeriod": year.get_text(" ", strip=True),
        "selection": selection,
    }


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    targets = [programme for programme in university["programs"]
               if programme["id"] in TARGET_PROGRAM_IDS]
    if len(targets) != 33 or any("Açıköğretim" not in programme["name"] for programme in targets):
        raise ValueError(f"Atatürk open-education target set changed: {len(targets)}")
    directory_source, official = _official_programmes()
    mappings = []
    for programme in targets:
        candidates = [item for item in official
                      if item["degree"] == programme["degreeLevel"]
                      and normal(item["name"]) == normal(_catalogue_name(programme["name"]))]
        excluded = None
        if programme["id"] == "program-osym-101490691" and len(candidates) == 2:
            candidates.sort(key=lambda item: int(item["programmeId"]))
            excluded = candidates[1]["programmeId"]
            candidates = candidates[:1]
        if len(candidates) != 1:
            raise ValueError(f"Atatürk open programme identity is not unique: {programme['name']} / {len(candidates)}")
        mappings.append((programme, candidates[0], excluded))

    sources = []
    for programme, item, excluded in mappings:
        source = _current_curriculum(item, programme)
        if excluded:
            duplicate = next(candidate for candidate in official if candidate["programmeId"] == excluded)
            duplicate_source = _current_curriculum(duplicate, programme)
            selected_courses, selected_conflicts = parse_source(source)
            duplicate_courses, duplicate_conflicts = parse_source(duplicate_source)
            if selected_conflicts or duplicate_conflicts or selected_courses != duplicate_courses:
                raise ValueError("Atatürk duplicate Halkla İlişkiler plans no longer agree")
            source["selection"]["excludedEquivalentProgrammeId"] = excluded
        courses, conflicts = parse_source(source)
        expected_conflicts = EXPECTED_CONFLICTS.get(programme["id"], [])
        if conflicts != expected_conflicts:
            raise ValueError(
                f"Atatürk reviewed course conflicts changed: {programme['name']} / {conflicts}"
            )
        if expected_conflicts:
            source["selectionError"] = "official-course-code-conflict:" + ",".join(conflicts)
            source["selection"]["rejectedDuplicateCourseCodes"] = conflicts
            sources.append(source)
            print("Atatürk open curricula", len(sources), "/", len(mappings),
                  "(unreadable:", ",".join(conflicts) + ")", flush=True)
            continue
        if len(courses) < 3 or conflicts:
            raise ValueError(f"Atatürk course plan is unreadable: {item['url']} / {len(courses)} / {conflicts}")
        sources.append(source)
        print("Atatürk open curricula", len(sources), "/", len(mappings), flush=True)

    total_courses = sum(len(parse_source(source)[0]) for source in sources)
    if total_courses != 1035:
        raise ValueError(f"Atatürk reviewed open-education course set changed: {total_courses}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "ataturk-open-reviewed-courses.json", sources)
    write(CACHE / "ataturk-open-reviewed-directories.json", [{
        "universityId": UID,
        "pages": [directory_source],
        "matched": [source["programs"][0] for source in sources],
        "unmatched": ["Fransızca Öğretmenliği", "Tıp (KKTC Uyruklu)"],
        "unreadable": [{
            "programId": source["programs"][0]["programId"],
            "name": source["programs"][0]["name"],
            "reason": source["selectionError"],
        } for source in sources if source.get("selectionError")],
    }])
    print("Atatürk University:", len(sources) - len(EXPECTED_CONFLICTS),
          "new open-education programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
