"""Collect missing Marmara curricula from the public MEOBS catalogue."""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
import re
from urllib.parse import urljoin, urlparse

from discover_turkey_courses import normal
from parse_cyprus_courses import clean
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-marmara-universitesi"
BASE_URL = "https://meobs.marmara.edu.tr"
DIRECTORIES = {
    "associate": f"{BASE_URL}/Program/programlar-hakkinda-bilgi/on-lisans-900001",
    "bachelor": f"{BASE_URL}/Program/programlar-hakkinda-bilgi/lisans-900002",
}
EXPECTED_DIRECTORY_HASHES = {
    "associate": "7fbff4062d58419b482c2f5ed0017d69ef7d61e61f6eda452643b367efc9f04b",
    "bachelor": "c6f6201a7e536681e90f3fe4148a9f2ba9c68bc5673901f555d254a334170d60",
}
EXPECTED_DIRECTORY_COUNTS = {"associate": 50, "bachelor": 217}
EXPECTED_DIRECT_PROGRAMS = 74
EXPECTED_SUPPORT_PROGRAMS = 77
EXPECTED_ALIASES = 10
EXPECTED_REMAINING = {"program-osym-107290337"}
EXPECTED_UNAVAILABLE_PROGRAMS = {
    "program-osym-107200416", "program-osym-107200423", "program-osym-107200430",
    "program-osym-107200437", "program-osym-107200444", "program-osym-107200458",
    "program-osym-107200472", "program-osym-107200479", "program-osym-107200486",
    "program-osym-107210395", "program-osym-107210402", "program-osym-107210411",
    "program-osym-107250022", "program-osym-107250428", "program-osym-107250437",
    "program-osym-107250455", "program-osym-107250464", "program-osym-107250473",
    "program-osym-107250507", "program-osym-107250552", "program-osym-107250613",
    "program-osym-107290337", "program-osym-107290434", "program-osym-107290436",
    "program-osym-107290590", "program-osym-107290653",
}
EXPECTED_READABLE_PROGRAMS = 59
TARGET_SOURCE_TITLES = {
    "Eczacılık Fakültesi": "Eczacılık",
    "Fransızca Öğretmenliği": "Fransızca Öğretmenliği (Fransızca)",
    "Hukuk Fakültesi": "Hukuk",
    "Hukuk Fakültesi (UOLP-Uluslararası Saraybosna Üniversitesi)":
        "Hukuk (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "Tıp Fakültesi (İngilizce)": "Tıp (İngilizce)",
    "İngilizce Öğretmenliği (UOLP- Uluslararası Saraybosna Üniversitesi)":
        "İngilizce Öğretmenliği (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
    "İşletme (İngilizce) (UOLP-Uluslararsı Saraybosna Üniversitesi)":
        "İşletme (İngilizce) (UOLP-Uluslararası Saraybosna Üniversitesi)",
}
PLACEMENT_ALIASES = {
    "program-osym-107290436": "program-osym-107211181",  # Ilahiyat (Arapca)
    "program-osym-107290434": "program-osym-107210465",  # Ilahiyat
    "program-osym-107290590": "program-osym-107210959",  # Ilahiyat (Ingilizce)
    "program-osym-107290206": "program-osym-107290207",  # Bilgisayar Muhendisligi
    "program-osym-107211021": "program-osym-107211012",  # Elektrik-Elektronik Muhendisligi
    "program-osym-107210905": "program-osym-107210898",  # Makine Muhendisligi
    "program-osym-107210923": "program-osym-107210914",  # Mekatronik Muhendisligi
    "program-osym-107210941": "program-osym-107210932",  # Metalurji ve Malzeme Muhendisligi
    "program-osym-107290667": "program-osym-107290639",  # Siber Guvenlik Muhendisligi
    "program-osym-107211048": "program-osym-107211039",  # Tekstil Muhendisligi
}


def _directory_entries(source, degree):
    document = soup(source)
    current_unit = ""
    parent_name = ""
    entries = []
    degree_label = "Önlisans" if degree == "associate" else "Lisans"
    for element in document.select('h2, h4, a[href*="/ProgramTanitim/"]'):
        label = clean(element.get_text(" ", strip=True))
        if element.name == "h2":
            current_unit = label
            parent_name = ""
            continue
        if element.name == "h4":
            parent_name = label
            continue

        title = label
        if re.match(rf"^{degree_label}\s*\(", label, flags=re.I):
            title = re.sub(r"\s+Fakültesi$", "", parent_name, flags=re.I)
            for language in ["İngilizce", "Almanca", "Fransızca", "Arapça"]:
                if re.search(language, label, flags=re.I) and f"({language})" not in title:
                    title += f" ({language})"
        elif re.search(rf"\s+-\s+{degree_label}\s*\(", label, flags=re.I):
            title = re.sub(
                rf"\s+-\s+{degree_label}\s*\([^)]+\)$", "", label, flags=re.I)
        title = TARGET_SOURCE_TITLES.get(title, title)
        duration = re.search(r"(\d+)\s*yıllık", label, flags=re.I)
        entries.append({
            "degree": degree,
            "unit": current_unit,
            "title": title,
            "sourceTitle": label,
            "durationYears": int(duration.group(1)) if duration else None,
            "url": urljoin(BASE_URL, element["href"]),
            "directoryUrl": DIRECTORIES[degree],
        })
    return entries


def _published_target_ids(university, coverage):
    current = next(item for item in coverage["universities"]
                   if item["universityId"] == UID)
    target_ids = set(current["missingProgramIds"])
    shard_path = ROOT / "data/course-catalog" / f"{UID}.json"
    if shard_path.exists():
        for record in read(shard_path).values():
            if record.get("sourceSelection", {}).get("method") == "first-official-current-plan":
                target_ids.add(record["programId"])
    return target_ids


def _match_direct(entries, university, target_ids):
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    matched = []
    for programme in university["programs"]:
        if programme["id"] not in target_ids or programme["id"] in PLACEMENT_ALIASES:
            continue
        candidates = [entry for entry in entries
                      if entry["degree"] == programme["degreeLevel"]
                      and normal(entry["unit"]) == normal(units[programme["unitId"]])
                      and normal(entry["title"]) == normal(programme["name"])]
        if len(candidates) > 1:
            same_duration = [entry for entry in candidates
                             if entry["durationYears"] == programme["durationYears"]]
            if same_duration:
                candidates = same_duration
        if len(candidates) != 1:
            continue
        matched.append({
            **candidates[0],
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": programme["name"],
            "unit": units[programme["unitId"]],
            "sourceUnit": candidates[0]["unit"],
        })
    counts = Counter(item["programId"] for item in matched)
    duplicates = sorted(program_id for program_id, count in counts.items() if count != 1)
    if duplicates:
        raise ValueError(f"Marmara programme identities are no longer unique: {duplicates}")
    return matched


def _current_plan(reference):
    programme_page = fetch(reference["url"], retry_failed=True)
    if programme_page.get("status") != 200:
        programme_page.update({
            "family": "marmara-reviewed-2026",
            "publicUrl": reference["url"],
            "programs": [reference],
            "selectionError": "programme-page-unavailable",
            "selection": {"method": "reviewed-programme-page",
                          "reason": "programme-page-unavailable"},
        })
        return programme_page
    options = [option for option in soup(programme_page).select("option[tip]")
               if option.get("tip", "").casefold() == "guncel"
               and option.get("value", "").startswith("?")]
    if not options:
        programme_page.update({
            "family": "marmara-reviewed-2026",
            "publicUrl": reference["url"],
            "programs": [reference],
            "selectionError": "no-current-plan",
            "selection": {
                "method": "reviewed-programme-page",
                "reason": "no-current-plan",
                "directoryUrl": reference["directoryUrl"],
                "sourceTitle": reference["sourceTitle"],
                "sourceUnit": reference["sourceUnit"],
                "programmeSourceHash": programme_page["sha256"],
            },
        })
        return programme_page
    selected = options[0]
    query = selected["value"]
    curriculum_url = urljoin(BASE_URL, "/Mufredat/DersListesi" + query)
    curriculum = fetch(curriculum_url, retry_failed=True)
    document = soup(curriculum)
    course_rows = [row for row in document.select("table tr")
                   if len(row.find_all(["td", "th"], recursive=False)) >= 3
                   and re.search(r"[A-ZÇĞİÖŞÜ]{2,8}\s*\d{2,4}", row.get_text(" "))]
    if curriculum.get("status") != 200 or len(course_rows) < 3:
        curriculum.update({
            "family": "marmara-reviewed-2026",
            "publicUrl": reference["url"],
            "programs": [reference],
            "selectionError": "current-plan-unreadable",
            "selection": {
                "method": "first-official-current-plan",
                "reason": "current-plan-unreadable",
                "selectedQuery": query,
                "programmeSourceHash": programme_page["sha256"],
            },
        })
        return curriculum
    current_labels = [clean(option.get_text(" ", strip=True)) for option in options]
    curriculum.update({
        "family": "marmara-reviewed-2026",
        "publicUrl": reference["url"],
        "curriculumPeriod": current_labels[0],
        "programs": [reference],
        "selection": {
            "method": "first-official-current-plan",
            "currentPlanLabels": current_labels,
            "selectedLabel": current_labels[0],
            "selectedQuery": query,
            "directoryUrl": reference["directoryUrl"],
            "sourceTitle": reference["sourceTitle"],
            "sourceUnit": reference["sourceUnit"],
            "programmeSourceHash": programme_page["sha256"],
            "sourceHash": curriculum["sha256"],
        },
    })
    return curriculum


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    coverage = read(ROOT / "data/turkey-catalog-coverage-2026.json")
    target_ids = _published_target_ids(university, coverage)

    entries = []
    directory_sources = {}
    for degree, url in DIRECTORIES.items():
        source = fetch(url, retry_failed=True)
        if (source.get("status") != 200
                or source.get("sha256") != EXPECTED_DIRECTORY_HASHES[degree]):
            raise ValueError(f"Marmara {degree} directory changed; review identities")
        parsed = _directory_entries(source, degree)
        if len(parsed) != EXPECTED_DIRECTORY_COUNTS[degree]:
            raise ValueError(f"Marmara {degree} directory count changed: {len(parsed)}")
        entries.extend(parsed)
        directory_sources[degree] = source

    support_ids = target_ids | set(PLACEMENT_ALIASES.values())
    support = _match_direct(entries, university, support_ids)
    direct = [reference for reference in support
              if reference["programId"] in target_ids]
    if len(direct) != EXPECTED_DIRECT_PROGRAMS:
        raise ValueError(f"Marmara direct match count changed: {len(direct)}")
    if len(support) != EXPECTED_SUPPORT_PROGRAMS:
        raise ValueError(f"Marmara support match count changed: {len(support)}")
    direct_by_id = {reference["programId"]: reference for reference in support}
    if not set(PLACEMENT_ALIASES.values()).issubset(direct_by_id):
        raise ValueError("Marmara placement alias base programme changed")
    remaining = target_ids - set(direct_by_id) - set(PLACEMENT_ALIASES)
    if remaining != EXPECTED_REMAINING:
        raise ValueError(f"Marmara unresolved programme set changed: {sorted(remaining)}")

    collected_by_id = {}
    with ThreadPoolExecutor(8) as pool:
        futures = {pool.submit(_current_plan, reference): reference
                   for reference in support}
        for number, future in enumerate(as_completed(futures), 1):
            reference = futures[future]
            collected_by_id[reference["programId"]] = future.result()
            if number % 15 == 0 or number == len(futures):
                print("Marmara curricula", number, "/", len(futures), flush=True)
    sources_by_id = {reference["programId"]: collected_by_id[reference["programId"]]
                     for reference in direct}

    programmes = {programme["id"]: programme for programme in university["programs"]}
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    for target_id, base_id in PLACEMENT_ALIASES.items():
        target = programmes[target_id]
        base = programmes[base_id]
        if (target["degreeLevel"] != base["degreeLevel"]
                or target["unitId"] != base["unitId"]
                or normal(target["name"].replace("(M.T.O.K.)", "")) != normal(base["name"])):
            raise ValueError(f"Marmara placement alias scope changed: {target_id}")
        source = deepcopy(collected_by_id[base_id])
        reference = {
            **deepcopy(source["programs"][0]),
            "programId": target_id,
            "name": target["name"],
            "title": target["name"],
            "unit": units[target["unitId"]],
            "registryAlias": True,
        }
        source["programs"] = [reference]
        source["selection"] = {
            **source["selection"],
            "registryAlias": True,
            "aliasType": "osym-placement-variant",
            "baseProgramId": base_id,
            "baseProgramName": base["name"],
            "qualifier": "M.T.O.K.",
        }
        sources_by_id[target_id] = source

    # The registry has one aggregate Film Design and Direction programme. MEOBS
    # publishes only three separate Film Image, Screenplay and Direction plans,
    # so none can be selected without inventing an aggregate curriculum.
    film_id = next(iter(EXPECTED_REMAINING))
    film = programmes[film_id]
    unavailable = deepcopy(directory_sources["bachelor"])
    unavailable.update({
        "family": "marmara-reviewed-unavailable",
        "selectionError": "aggregate-programme-has-only-specialisation-curricula",
        "programs": [{
            "universityId": UID,
            "programId": film_id,
            "name": film["name"],
            "title": film["name"],
            "degree": film["degreeLevel"],
            "unit": units[film["unitId"]],
        }],
        "selection": {
            "method": "reviewed-official-directory",
            "reason": "aggregate-programme-has-only-specialisation-curricula",
            "observedSourceTitles": [
                "Film Görüntüsü", "Film Görüntüleme", "Film Senaryosu", "Film Yönetimi"],
        },
    })
    sources_by_id[film_id] = unavailable

    sources = [sources_by_id[program_id] for program_id in sorted(sources_by_id)]
    if len(sources) != EXPECTED_DIRECT_PROGRAMS + EXPECTED_ALIASES + 1:
        raise ValueError("Marmara reviewed source count changed")
    unavailable_ids = {source["programs"][0]["programId"] for source in sources
                       if source.get("selectionError")}
    if unavailable_ids != EXPECTED_UNAVAILABLE_PROGRAMS:
        raise ValueError(f"Marmara unavailable set changed: {sorted(unavailable_ids)}")
    if len(sources) - len(unavailable_ids) != EXPECTED_READABLE_PROGRAMS:
        raise ValueError("Marmara readable programme count changed")
    write(CACHE / "marmara-reviewed-courses.json", sources)
    write(CACHE / "marmara-reviewed-directories.json", [{
        "universityId": UID,
        "source": directory_sources[degree],
        "matched": [reference for reference in direct if reference["degree"] == degree],
        "unresolvedProgramIds": sorted(EXPECTED_REMAINING),
    } for degree in ["associate", "bachelor"]])
    print("Marmara University:", EXPECTED_READABLE_PROGRAMS,
          "readable curricula;", len(unavailable_ids),
          "programmes remain without an exact current curriculum", flush=True)


if __name__ == "__main__":
    main()
