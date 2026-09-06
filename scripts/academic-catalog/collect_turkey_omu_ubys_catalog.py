"""Collect currently missing Ondokuz Mayis curricula from the public OMU UBYS catalogue."""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
import re
from urllib.parse import urlencode, urljoin, urlparse

from discover_turkey_courses import normal
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "omu"
ROOT_URL = "https://ubys.omu.edu.tr/AIS/OutcomeBasedLearning/Home/Index?culture=tr-TR"
DIRECTORY_URL = "https://ubys.omu.edu.tr/AIS/Common/Helper/GetUnitProgramDataSource"
COURSE_URL = "https://ubys.omu.edu.tr/AIS/OutcomeBasedLearning/Home/SearchCurriculumDetail"
EXPECTED_DIRECTORY_HASH = "b1f3dd7aed328b3554bce2eb66380d8fb6c45f5bdd201e462459d1c1766b0be4"
EXPECTED_DIRECT_PROGRAMS = 91
EXPECTED_REMAINING = {
    "program-osym-108290495",  # Active Kenevir Dokumaciligi leaf has no curriculum.
    "program-osym-108250973",  # Active Elektrik (IO) leaf has no curriculum; plain Elektrik is inactive.
}
UNAVAILABLE_EVIDENCE = {
    "program-osym-108290495": [
        {"sourceTitle": "Kenevir Dokumacılığı", "academicProgramId": 5712,
         "status": 10201, "curriculumId": None},
        {"sourceTitle": "Kenevir Dokuma Tezgahtarlığı", "academicProgramId": 5462,
         "status": 10203, "curriculumId": 6221},
    ],
    "program-osym-108250973": [
        {"sourceTitle": "Elektrik", "academicProgramId": 3068,
         "status": 10203, "curriculumId": 4176},
        {"sourceTitle": "Elektrik (İÖ)", "academicProgramId": 3072,
         "status": 10201, "curriculumId": None},
    ],
}
BASE_THEOLOGY_ID = "program-osym-108210302"
MTOK_THEOLOGY_ID = "program-osym-108290343"


def target_unit_identity(value):
    """Remove only registry location suffixes absent from the same official OMU unit."""
    return normal(re.sub(r"\s*\((?:Bafra|Çarşamba)\)\s*$", "", value, flags=re.I))


def source_unit_identity(value):
    """Remove only administrative office suffixes added by the UBYS unit tree."""
    return normal(re.sub(r"\s+(?:Dekanlığı|Müdürlüğü)\s*$", "", value, flags=re.I))


def programme_title(value):
    """Apply narrow labels explicitly used by OMU and the current registry."""
    value = re.sub(r"\s*\(UE\)\s*$", " (Uzaktan Öğretim)", value, flags=re.I)
    if re.match(r"^İngilizce\s+", value, flags=re.I):
        value = re.sub(r"\s*\(İngilizce\)\s*$", "", value, flags=re.I)
    if normal(value) == normal("Emlak ve Emlak Yönetimi"):
        value = "Emlak Yönetimi"
    return value


def _academic_unit(row, units):
    parent = units.get(row.get("ParentId"))
    visited = set()
    while parent and parent["Id"] not in visited:
        visited.add(parent["Id"])
        if any(label in normal(parent["Name"])
               for label in ["fakulte", "yuksekokul", "konservatuvar"]):
            return parent["Name"]
        parent = units.get(parent.get("ParentId"))
    return None


def match_missing_programmes(rows, university, missing_ids):
    units = {row["Id"]: row for row in rows if not row["IsAcademicProgram"]}
    target_units = {unit["id"]: unit["name"] for unit in university["units"]}
    matched = []
    for row in rows:
        degree = {10601: "associate", 10602: "bachelor"}.get(
            row.get("EducationQualificatinDegree"))
        if (not row.get("IsAcademicProgram") or not degree
                or row.get("Status") != 10201 or row.get("ProgramType") != 10501):
            continue
        source_unit = _academic_unit(row, units)
        candidates = [programme for programme in university["programs"]
            if programme["id"] in missing_ids
            and programme["degreeLevel"] == degree
            and normal(programme["name"]) == normal(programme_title(row["Name"]))
            and target_unit_identity(target_units[programme["unitId"]])
                == source_unit_identity(source_unit or "")]
        if len(candidates) != 1:
            continue
        programme = candidates[0]
        matched.append({
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": programme_title(row["Name"]),
            "sourceTitle": row["Name"],
            "unit": source_unit,
            "degree": degree,
            "curriculumId": row.get("CurriculumId"),
            "encryptedCurriculumId": row.get("EncryptedCurriculumId"),
            "academicProgramId": row.get("AcademicProgramId"),
            "encryptedAcademicProgramId": row.get("EncryptedAcademicProgramId"),
        })
    counts = Counter(item["programId"] for item in matched)
    duplicates = {program_id for program_id, count in counts.items() if count > 1}
    if duplicates:
        raise ValueError(f"OMU programme identities are no longer unique: {sorted(duplicates)}")
    return [item for item in matched
            if item["curriculumId"] and item["encryptedCurriculumId"]
            and item["academicProgramId"] and item["encryptedAcademicProgramId"]]


def _reference(item):
    payload = {
        "apid": item["academicProgramId"],
        "apIdStr": item["encryptedAcademicProgramId"],
        "curId": item["curriculumId"],
        "curIdStr": item["encryptedCurriculumId"],
    }
    public_url = urljoin(ROOT_URL, "Index") + "?" + urlencode({
        "id": item["encryptedAcademicProgramId"],
        "apIdStr": item["encryptedAcademicProgramId"],
        "culture": "tr-TR",
    })
    return {
        **item,
        "payload": payload,
        "courseUrl": COURSE_URL,
        "publicUrl": public_url,
        "directoryUrl": ROOT_URL,
    }


def _collect(reference, directory_hash):
    source = fetch(COURSE_URL, reference["payload"], retry_failed=True)
    source.update({
        "family": "omu-ubys-2026",
        "publicUrl": reference["publicUrl"],
        "programs": [reference],
        "payload": reference["payload"],
        "selection": {
            "method": "exact-active-public-ubys-curriculum",
            "directorySourceHash": directory_hash,
            "sourceTitle": reference["sourceTitle"],
            "sourceUnit": reference["unit"],
            "academicProgramId": reference["academicProgramId"],
            "curriculumId": reference["curriculumId"],
        },
    })
    return source


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    coverage = read(ROOT / "data/turkey-catalog-coverage-2026.json")
    current = next(item for item in coverage["universities"] if item["universityId"] == UID)
    missing_ids = set(current["missingProgramIds"])
    # A completed build writes this exact official host into the newly covered
    # programme. Include those IDs so the collector remains reproducible after
    # the package has already been generated and committed.
    target_ids = missing_ids | {programme["id"] for programme in university["programs"]
        if any(urlparse(url).hostname == "ubys.omu.edu.tr"
               for url in programme.get("curriculumUrls", []))}

    home = fetch(ROOT_URL, retry_failed=True)
    button = soup(home).select_one("#btn-unit")
    if not button or button.get("data-dont-use-privilage") != "True":
        raise ValueError("OMU public UBYS directory is unavailable")
    directory = fetch(DIRECTORY_URL, {"criter": {
        "DontUsePrivilage": True,
        "GetOnlyActiveForBologna": True,
        "ShowOnlyUnitSingleProgram": True,
    }}, retry_failed=True)
    if directory.get("status") != 200 or directory.get("sha256") != EXPECTED_DIRECTORY_HASH:
        raise ValueError("OMU public UBYS directory changed; review programme identities")
    rows = read(CACHE / directory["file"])
    direct = match_missing_programmes(rows, university, target_ids)
    if len(direct) != EXPECTED_DIRECT_PROGRAMS:
        raise ValueError(f"OMU direct match count changed: {len(direct)}")

    direct_ids = {item["programId"] for item in direct}
    if BASE_THEOLOGY_ID not in direct_ids:
        raise ValueError("OMU current Ilahiyat curriculum is missing")
    remaining = target_ids - direct_ids - {MTOK_THEOLOGY_ID}
    if remaining != EXPECTED_REMAINING:
        raise ValueError(f"OMU unresolved programme set changed: {sorted(remaining)}")

    references = [_reference(item) for item in direct]
    sources = []
    with ThreadPoolExecutor(12) as pool:
        futures = [pool.submit(_collect, reference, directory["sha256"])
                   for reference in references]
        for number, future in enumerate(as_completed(futures), 1):
            source = future.result()
            if source.get("status") != 200:
                raise ValueError(f"OMU curriculum request failed: {source.get('status')}")
            sources.append(source)
            if number % 20 == 0 or number == len(futures):
                print("OMU curricula", number, "/", len(futures), flush=True)

    theology = next(source for source in sources
                    if source["programs"][0]["programId"] == BASE_THEOLOGY_ID)
    alias = deepcopy(theology)
    alias_programme = next(programme for programme in university["programs"]
                           if programme["id"] == MTOK_THEOLOGY_ID)
    alias_reference = {
        **deepcopy(theology["programs"][0]),
        "programId": MTOK_THEOLOGY_ID,
        "name": alias_programme["name"],
        "title": alias_programme["name"],
        "registryAlias": True,
    }
    alias["programs"] = [alias_reference]
    alias["selection"] = {
        **alias["selection"],
        "registryAlias": True,
        "aliasType": "osym-placement-variant",
        "baseProgramId": BASE_THEOLOGY_ID,
        "baseProgramName": theology["programs"][0]["name"],
        "qualifier": "M.T.O.K.",
    }
    sources.append(alias)

    # Keep explicit programme-scoped attempts for the two genuine gaps. The
    # coverage builder can then distinguish an inspected empty current source
    # from a programme that was never matched.
    for programme_id in sorted(EXPECTED_REMAINING):
        programme = next(item for item in university["programs"]
                         if item["id"] == programme_id)
        unavailable = deepcopy(directory)
        unavailable.update({
            "family": "omu-ubys-unavailable",
            "publicUrl": ROOT_URL,
            "programs": [{
                "universityId": UID,
                "programId": programme_id,
                "name": programme["name"],
            }],
            "selection": {
                "method": "reviewed-public-ubys-directory",
                "directorySourceHash": directory["sha256"],
                "reason": "active-programme-has-no-current-curriculum-id",
                "observedLeaves": UNAVAILABLE_EVIDENCE[programme_id],
            },
        })
        sources.append(unavailable)
    sources.sort(key=lambda source: source["programs"][0]["programId"])

    write(CACHE / "omu-ubys-courses.json", sources)
    write(CACHE / "omu-ubys-directories.json", [{
        "universityId": UID,
        "source": directory,
        "matched": references + [alias_reference],
        "unresolvedProgramIds": sorted(EXPECTED_REMAINING),
    }])
    print("Ondokuz Mayis University: 92 new programme records;",
          "2 current programmes remain without a public curriculum",
          flush=True)


if __name__ == "__main__":
    main()
