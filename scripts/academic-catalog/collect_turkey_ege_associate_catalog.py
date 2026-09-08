"""Collect reviewed Ege University associate curricula from its official EBP."""
import json
import re
import time
from collections import defaultdict
from urllib.parse import urljoin

from discover_turkey_courses import normal
from parse_turkey_courses import parse_source
from turkey_research import CACHE, ROOT, fetch, read, write


UID = "tr-ege-universitesi"
BASE = "https://ebp.ege.edu.tr"
DIRECTORY_URL = BASE + "/DereceProgramlari/0"
TREE_URL = BASE + "/DereceProgramlari/GetJson/0?lang=tr-TR"
TARGET_PROGRAM_IDS = {
    "program-osym-103451269", "program-osym-103451181", "program-osym-103450668",
    "program-osym-103451312", "program-osym-103451287", "program-osym-103451278",
    "program-osym-103450923", "program-osym-103450023", "program-osym-103451375",
    "program-osym-103451666", "program-osym-103451233", "program-osym-103450147",
    "program-osym-103451303", "program-osym-103490659", "program-osym-103490666",
    "program-osym-103451296", "program-osym-103490357", "program-osym-103450456",
    "program-osym-103450129", "program-osym-103450156", "program-osym-103451163",
    "program-osym-103450898", "program-osym-103450226", "program-osym-103490356",
    "program-osym-103451657", "program-osym-103451684", "program-osym-103451012",
    "program-osym-103451057", "program-osym-103490554", "program-osym-103450792",
    "program-osym-103450765",
}


def _fetch_success(url):
    source = None
    for _attempt in range(10):
        source = fetch(url, retry_failed=True)
        if source.get("status") == 200 and source.get("sha256"):
            return source
        time.sleep(0.9)
    raise ValueError(f"Ege official source remained unavailable: {url} / {source}")


def _clean_official_name(value):
    value = re.sub(r"\s*\(\s*İKMEP\s*\)\s*", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\s*\(\s*[ab]\s*\)\s*", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"\s+", " ", value).strip()
    if normal(value) == normal("Otonom Sistemleri Teknikerliği"):
        return "Otonom Sistemler Teknikerliği"
    return value


def _catalogue_name(value):
    return re.sub(r"\s*\((?:Erkek|Kız)\)\s*$", "", value, flags=re.IGNORECASE).strip()


def _official_programmes():
    source = _fetch_success(TREE_URL)
    tree = json.loads((CACHE / source["file"]).read_text(encoding="utf-8-sig"))
    if not isinstance(tree, list) or len(tree) != 12:
        raise ValueError(f"Ege associate unit directory changed: {len(tree) if isinstance(tree, list) else 0}")
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
    if len(result) != 86:
        raise ValueError(f"Ege published associate plan count changed: {len(result)}")
    return source, result


def _select_match(programme, unit, official):
    candidates = [item for item in official
                  if normal(item["unit"]) == normal(unit)
                  and normal(_clean_official_name(item["name"])) == normal(_catalogue_name(programme["name"]))]
    if programme["name"] in {"Eczane Hizmetleri", "Engelli Bakımı ve Rehabilitasyon"}:
        candidates = [item for item in candidates if "uzaktan" not in normal(item["degreeName"])]
    if programme["name"] in {"Sivil Hava Ulaştırma İşletmeciliği", "Uçak Teknolojisi"}:
        candidates = [item for item in candidates if "turkce" in normal(item["degreeName"])]
    if len(candidates) != 1:
        raise ValueError(f"Ege programme identity is not unique: {unit} / {programme['name']} / {len(candidates)}")
    return candidates[0]


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    targets = [programme for programme in university["programs"]
               if programme["id"] in TARGET_PROGRAM_IDS]
    if len(targets) != 31 or any(programme["degreeLevel"] != "associate" for programme in targets):
        raise ValueError(f"Ege reviewed associate target set changed: {len(targets)}")
    directory_source, official = _official_programmes()
    programmes_by_url = defaultdict(list)
    selections = {}
    for programme in targets:
        unit = units[programme["unitId"]]
        item = _select_match(programme, unit, official)
        route = re.fullmatch(r".*/DereceProgramlari/Detay/0/(\d+)/(\d+)/(\d+)", item["url"])
        if route is None:
            raise ValueError(f"Ege stable programme route changed: {item['url']}")
        programmes_by_url[item["url"]].append({
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": programme["name"],
            "degree": "associate",
            "unit": unit,
            "directoryUrl": DIRECTORY_URL,
        })
        selections[item["url"]] = {
            "method": "reviewed-official-programme-route",
            "degree": "associate",
            "sourceUnit": item["unit"],
            "sourceTitle": item["name"],
            "sourceDegree": item["degreeName"],
            "unitId": route[1],
            "programmeId": route[2],
            "universityCode": route[3],
        }

    if len(programmes_by_url) != 30:
        raise ValueError(f"Ege reviewed official route count changed: {len(programmes_by_url)}")
    sources = []
    for url, references in programmes_by_url.items():
        source = _fetch_success(url)
        source.update({
            "family": "ege-associate-reviewed-2026",
            "programs": references,
            "selection": selections[url],
        })
        courses, conflicts = parse_source(source)
        if len(courses) < 3 or conflicts:
            raise ValueError(f"Ege course plan is unreadable: {url} / {len(courses)} / {conflicts}")
        sources.append(source)
        print("Ege associate curricula", len(sources), "/", len(programmes_by_url), flush=True)

    total_courses = sum(len(parse_source(source)[0]) * len(source["programs"]) for source in sources)
    if total_courses != 2161:
        raise ValueError(f"Ege reviewed course set changed: {total_courses}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "ege-associate-reviewed-courses.json", sources)
    write(CACHE / "ege-associate-reviewed-directories.json", [{
        "universityId": UID,
        "pages": [directory_source],
        "matched": [reference for source in sources for reference in source["programs"]],
        "sharedOfficialPlans": [{
            "sourceUrl": source["url"],
            "programIds": [reference["programId"] for reference in source["programs"]],
        } for source in sources if len(source["programs"]) > 1],
        "unmatched": ["İlahiyat (M.T.O.K.)"],
    }])
    print("Ege University:", len(targets), "new associate programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
