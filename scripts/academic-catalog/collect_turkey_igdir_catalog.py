"""Collect exact Iğdır University associate curricula with sequential retries."""
import json
import re
import time
from urllib.parse import urljoin

from discover_turkey_courses import normal
from parse_turkey_courses import parse_source
from turkey_research import CACHE, ROOT, fetch, read, write


UID = "tr-igdir-universitesi"
BASE = "https://ebp.igdir.edu.tr"
DIRECTORY_URL = BASE + "/DereceProgramlari/0"
TREE_URL = BASE + "/DereceProgramlari/GetJson/0?lang=tr-TR"
EXPECTED_UNLINKED = {"Fotoğrafçılık ve Kameramanlık", "Kimya Teknolojisi"}


def _fetch_success(url):
    source = None
    for attempt in range(4):
        source = fetch(url, retry_failed=True)
        if source.get("status") == 200 and source.get("sha256"):
            return source
        time.sleep(0.75 * (attempt + 1))
    raise ValueError(f"Iğdır official source remained unavailable: {url} / {source}")


def _official_programmes():
    source = _fetch_success(TREE_URL)
    tree = json.loads((CACHE / source["file"]).read_text(encoding="utf-8-sig"))
    if not isinstance(tree, list) or len(tree) != 4:
        raise ValueError(f"Iğdır associate unit directory changed: {len(tree) if isinstance(tree, list) else 0}")
    result = []
    for source_unit in tree:
        for programme in source_unit.get("children") or []:
            for leaf in programme.get("children") or []:
                href = (leaf.get("a_attr") or {}).get("href")
                if not href:
                    continue
                result.append({
                    "unit": source_unit["text"].strip(),
                    "name": programme["text"].strip(),
                    "degreeName": leaf["text"].strip(),
                    "url": urljoin(BASE, href),
                })
    if len(result) != 71:
        raise ValueError(f"Iğdır published associate plan count changed: {len(result)}")
    return source, result


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    associates = [programme for programme in university["programs"]
                  if programme["degreeLevel"] == "associate"]
    if len(associates) != 43:
        raise ValueError(f"Iğdır registry associate count changed: {len(associates)}")
    directory_source, official = _official_programmes()
    sources = []
    for programme in associates:
        if programme["name"] in EXPECTED_UNLINKED:
            continue
        unit = units[programme["unitId"]]
        matches = [item for item in official
                   if normal(item["unit"]) == normal(unit)
                   and normal(item["name"]) == normal(programme["name"])
                   and normal(item["degreeName"]) == normal(programme["name"])]
        if len(matches) != 1:
            raise ValueError(f"Iğdır programme identity is not unique: {unit} / {programme['name']} / {len(matches)}")
        item = matches[0]
        source = _fetch_success(item["url"])
        route = re.fullmatch(r".*/DereceProgramlari/Detay/0/(\d+)/(\d+)/(\d+)", item["url"])
        if route is None:
            raise ValueError(f"Iğdır stable programme route changed: {item['url']}")
        reference = {
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": programme["name"],
            "degree": "associate",
            "unit": unit,
            "directoryUrl": DIRECTORY_URL,
        }
        source.update({
            "family": "igdir-reviewed-2026",
            "programs": [reference],
            "selection": {
                "method": "exact-official-programme-route",
                "degree": "associate",
                "sourceUnit": item["unit"],
                "sourceTitle": item["name"],
                "unitId": route[1],
                "programmeId": route[2],
                "universityCode": route[3],
            },
        })
        courses, conflicts = parse_source(source)
        if len(courses) < 3 or conflicts:
            raise ValueError(f"Iğdır course plan is unreadable: {item['url']} / {len(courses)} / {conflicts}")
        sources.append(source)
        print("Iğdır curricula", len(sources), "/", len(associates) - len(EXPECTED_UNLINKED), flush=True)

    total_courses = sum(len(parse_source(source)[0]) for source in sources)
    if len(sources) != 41 or total_courses != 2851:
        raise ValueError(f"Iğdır reviewed programme set changed: {len(sources)}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "igdir-reviewed-courses.json", sources)
    write(CACHE / "igdir-reviewed-directories.json", [{
        "universityId": UID,
        "pages": [directory_source],
        "matched": [source["programs"][0] for source in sources],
        "unmatched": sorted(EXPECTED_UNLINKED),
    }])
    print("Iğdır University:", len(sources), "new associate programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
