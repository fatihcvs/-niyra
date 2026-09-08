"""Collect missing Ankara University curricula from its public Bologna API."""
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import re

from discover_turkey_courses import normal
from turkey_research import CACHE, ROOT, fetch, read, write


UID = "tr-ankara-universitesi"
PUBLIC_ROOT = "https://bologna.ankara.edu.tr/"
API_ROOT = PUBLIC_ROOT + "api/"
PROGRAM_TYPES_URL = API_ROOT + "SbtProgramTuru/getPublicList"
PROGRAMS_URL = API_ROOT + "AkademikProgram/getPublicList"
YEARS_URL = API_ROOT + "PublicMufredatDers/getYillar"
COURSES_URL = API_ROOT + "PublicMufredatDers/getByProgram"
PROGRAM_TYPE_IDS = {
    "associate": "e0000000-0000-0000-0000-000000000001",
    "bachelor": "e0000000-0000-0000-0000-000000000002",
}
EXPECTED_SOURCE_HASHES = {
    "programTypes": "f13b1f9011945d88872985d733e2aa94bce754960b7b5211f33f2d2cb60cebdf",
    "programmes": "b109276e504abc20983a6302c83ba08097813e0dd1237162ec7859dbd27cc41e",
    "years": "544e5e09398e2d9388600c20911fdee3ced347bbf157c830f931ea86603f5328",
}
EXPECTED_ACTIVE_YEAR = 77
EXPECTED_VALIDATION_YEARS = [77, 76, 75]
EXPECTED_DIRECT_PROGRAMS = 69
EXPECTED_REMAINING = {
    "program-osym-101100640",  # Biyomedikal Muhendisligi UOLP-SUNY Buffalo
    "program-osym-101100654",  # Gayrimenkul Gelistirme ve Yonetimi UOLP
    "program-osym-101150986",  # Ayas MYO Sosyal Guvenlik
}
# Ankara's current public Bologna directory exposes one current curriculum for
# each of these older/current OSYM placement-code pairs. These are existing,
# reviewed catalogue links; every other official programme identity must remain
# one-to-one.
EXPECTED_SHARED_OFFICIAL_PROGRAMS = {
    "d504d730-4804-4a22-bdeb-426d0ddc79a5": frozenset({
        "program-osym-101100619", "program-osym-101110015",
    }),
    "de4d8c61-cf1b-476d-b1e6-c066381dd837": frozenset({
        "program-osym-101110087", "program-osym-101190413",
    }),
}
TARGET_TO_SOURCE_TITLE = {
    "Alman Dili ve Edebiyatı (Almanca)": "Alman Dili ve Edebiyatı",
    "Bulgar Dili ve Edebiyatı (Bulgarca)": "Bulgar Dili ve Edebiyatı",
    "Coğrafya": "Coğrafya (İngilizce)",
    "Ermeni Dili ve Kültürü (Ermenice)": "Ermeni Dili ve Kültürü",
    "Fransız Dili ve Edebiyatı (Fransızca)": "Fransız Dili ve Edebiyatı",
    "Leh Dili ve Edebiyatı (Lehçe)": "Leh Dili ve Edebiyatı",
    "Rus Dili ve Edebiyatı (Rusça)": "Rus Dili ve Edebiyatı",
    "Sırp Dili ve Edebiyatı": "Sırp Dili ve Edebiyatı (%30 Sırpça)",
    "Ukrayna Dili ve Edebiyatı": "Ukrayna Dili ve Edebiyatı (%30 Ukraynaca)",
    "İngiliz Dili ve Edebiyatı (İngilizce)": "İngiliz Dili ve Edebiyatı",
    "İspanyol Dili ve Edebiyatı (İspanyolca)": "İspanyol Dili ve Edebiyatı",
    "İtalyan Dili ve Edebiyatı (İtalyanca)": "İtalyan Dili ve Edebiyatı",
    "Siber Güvenlik Analistliği ve Operatörlüğü":
        "Siber Güvenlik Analistliği ve Operatörlüğü (%30 İngilizce)",
}


def source_programme_title(value):
    """Remove only Ankara's redundant degree label; keep mode and language."""
    return re.sub(r"\s*\(\s*ön\s+lisans\s*\)", "", value, flags=re.I).strip()


def source_unit_title(value):
    """Remove the degree suffix used only on Ankara's distance-learning unit."""
    return re.sub(r"\s*\(\s*ön\s+lisans\s*\)\s*$", "", value, flags=re.I).strip()


def _published_target_ids(coverage):
    current = next(item for item in coverage["universities"]
                   if item["universityId"] == UID)
    target_ids = set(current["missingProgramIds"])
    shard_path = ROOT / "data/course-catalog" / f"{UID}.json"
    if shard_path.exists():
        for record in read(shard_path).values():
            if record.get("sourceSelection", {}).get("method") == "latest-readable-current-bologna-year":
                target_ids.add(record["programId"])
    return target_ids


def match_programmes(rows, university, target_ids):
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    matched = []
    for programme in university["programs"]:
        if programme["id"] not in target_ids:
            continue
        source_title = TARGET_TO_SOURCE_TITLE.get(programme["name"], programme["name"])
        candidates = [row for row in rows
                      if row.get("isActive") is not False
                      and row.get("akademikBirim", {}).get("programTuruId")
                          == PROGRAM_TYPE_IDS[programme["degreeLevel"]]
                      and normal(source_programme_title(row.get("programAdi", "")))
                          == normal(source_title)
                      and normal(source_unit_title(row.get("akademikBirimAdi", "")))
                          == normal(units[programme["unitId"]])]
        if programme["name"] == "Hemşirelik":
            candidates = [row for row in candidates
                          if "2018 2023" not in normal(row.get("kisaAd", ""))]
        if len(candidates) != 1:
            continue
        row = candidates[0]
        matched.append({
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": programme["name"],
            "degree": programme["degreeLevel"],
            "unit": units[programme["unitId"]],
            "sourceTitle": row["programAdi"],
            "sourceUnit": row["akademikBirimAdi"],
            "teachingMode": row.get("ogretimTurAd"),
            "officialProgramId": row["id"],
            "officialProgramCode": row.get("programKodu"),
            "directoryUrl": PUBLIC_ROOT,
            "courseUrl": f"{PUBLIC_ROOT}program/{row['id']}/dersler",
        })
    counts = Counter(item["programId"] for item in matched)
    duplicates = sorted(program_id for program_id, count in counts.items() if count != 1)
    if duplicates:
        raise ValueError(f"Ankara programme identities are no longer unique: {duplicates}")
    official_targets = defaultdict(set)
    for item in matched:
        official_targets[item["officialProgramId"]].add(item["programId"])
    unexpected_shared = {
        official_id: frozenset(program_ids)
        for official_id, program_ids in official_targets.items()
        if len(program_ids) > 1
        and frozenset(program_ids) != EXPECTED_SHARED_OFFICIAL_PROGRAMS.get(official_id)
    }
    if unexpected_shared:
        raise ValueError(
            f"Ankara official programmes are shared unexpectedly: {unexpected_shared}")
    return matched


def shared_official_programmes(matched):
    official_targets = defaultdict(set)
    for item in matched:
        official_targets[item["officialProgramId"]].add(item["programId"])
    return {official_id: frozenset(program_ids)
            for official_id, program_ids in official_targets.items()
            if len(program_ids) > 1}


def _number(value):
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return 0


def _collect(reference, validation_years, directory_hash):
    attempts = []
    for year in validation_years:
        payload = {"Id": reference["officialProgramId"], "Yil": None,
                   "YilNo": year["no"]}
        source = fetch(COURSES_URL, payload, retry_failed=True)
        rows = read(CACHE / source["file"]).get("data", []) if source.get("status") == 200 else []
        course_codes = {str(row.get("dersKodu", "")).strip() for row in rows
                        if str(row.get("dersKodu", "")).strip()}
        semesters = {row.get("yariyilNo") for row in rows
                     if isinstance(row.get("yariyilNo"), int) and row["yariyilNo"] > 0}
        ects_rows = [row for row in rows if _number(row.get("akts")) > 0]
        attempt = {"yearNo": year["no"], "year": year["ad"],
                   "status": source.get("status"), "courseCodeCount": len(course_codes),
                   "semesterCount": len(semesters), "ectsRowCount": len(ects_rows)}
        attempts.append(attempt)
        if len(course_codes) < 8 or len(semesters) < 4 or len(ects_rows) < 8:
            continue
        source.update({
            "family": "ankara-reviewed-2026",
            "replacePublished": True,
            "publicUrl": reference["courseUrl"],
            "programs": [reference],
            "payload": payload,
            "curriculumPeriod": year["ad"],
            "selection": {
                "method": "latest-readable-current-bologna-year",
                "selectedYearNo": year["no"],
                "selectedYear": year["ad"],
                "attempts": attempts,
                "directorySourceHash": directory_hash,
                "sourceTitle": reference["sourceTitle"],
                "sourceUnit": reference["sourceUnit"],
                "teachingMode": reference.get("teachingMode"),
                "officialProgramId": reference["officialProgramId"],
                "sourceHash": source["sha256"],
            },
        })
        return source
    raise ValueError(f"Ankara current curriculum unreadable: {reference['programId']}")


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    coverage = read(ROOT / "data/turkey-catalog-coverage-2026.json")
    target_ids = _published_target_ids(coverage)

    type_source = fetch(PROGRAM_TYPES_URL, {}, retry_failed=True)
    programme_source = fetch(PROGRAMS_URL, {}, retry_failed=True)
    year_source = fetch(YEARS_URL, {}, retry_failed=True)
    observed = {"programTypes": type_source, "programmes": programme_source,
                "years": year_source}
    for name, source in observed.items():
        if (source.get("status") != 200
                or source.get("sha256") != EXPECTED_SOURCE_HASHES[name]):
            raise ValueError(f"Ankara {name} source changed; review programme identities")

    programme_types = read(CACHE / type_source["file"])["data"]
    for degree, identifier in PROGRAM_TYPE_IDS.items():
        expected_label = "Ön Lisans" if degree == "associate" else "Lisans"
        if not any(item["id"] == identifier and item["ad"] == expected_label
                   for item in programme_types):
            raise ValueError(f"Ankara {degree} programme type changed")

    rows = read(CACHE / programme_source["file"])["data"]
    matched = match_programmes(rows, university, target_ids)
    if len(matched) != EXPECTED_DIRECT_PROGRAMS:
        raise ValueError(f"Ankara direct match count changed: {len(matched)}")
    shared = shared_official_programmes(matched)
    if shared != EXPECTED_SHARED_OFFICIAL_PROGRAMS:
        raise ValueError(f"Ankara reviewed shared programme set changed: {shared}")
    remaining = target_ids - {reference["programId"] for reference in matched}
    if remaining != EXPECTED_REMAINING:
        raise ValueError(f"Ankara unresolved programme set changed: {sorted(remaining)}")

    years = read(CACHE / year_source["file"])["data"]
    active = next((year for year in years if year.get("aktifYilMi")), None)
    if not active or active["no"] != EXPECTED_ACTIVE_YEAR:
        raise ValueError("Ankara active curriculum year changed")
    validation_years = sorted(
        (year for year in years if year["no"] <= active["no"]),
        key=lambda year: year["no"], reverse=True)[:3]
    if [year["no"] for year in validation_years] != EXPECTED_VALIDATION_YEARS:
        raise ValueError("Ankara validation year window changed")

    sources = []
    with ThreadPoolExecutor(8) as pool:
        futures = [pool.submit(_collect, reference, validation_years,
                               programme_source["sha256"])
                   for reference in matched]
        for number, future in enumerate(as_completed(futures), 1):
            sources.append(future.result())
            if number % 15 == 0 or number == len(futures):
                print("Ankara curricula", number, "/", len(futures), flush=True)
    sources.sort(key=lambda source: source["programs"][0]["programId"])
    write(CACHE / "ankara-reviewed-courses.json", sources)
    write(CACHE / "ankara-reviewed-directories.json", [{
        "universityId": UID,
        "source": programme_source,
        "matched": matched,
        "unresolvedProgramIds": sorted(EXPECTED_REMAINING),
    }])
    print("Ankara University:", len(sources),
          "readable curricula; 3 programmes remain without an exact public programme",
          flush=True)


if __name__ == "__main__":
    main()
