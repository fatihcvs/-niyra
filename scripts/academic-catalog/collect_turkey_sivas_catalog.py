"""Collect Sivas University of Science and Technology's public UBYS curricula."""
from concurrent.futures import ThreadPoolExecutor

from collect_turkey_ubys import discover
from parse_turkey_courses import _parse_source
from turkey_research import CACHE, ROOT, fetch, read, write


UID = "tr-sivas-bilim-ve-teknoloji-universitesi"
ROOT_URL = "https://ubys.sivas.edu.tr/AIS/OutcomeBasedLearning/Home/Index?culture=tr-TR"
EXPECTED_COUNTS = {
    "program-osym-111900101": 125,
    "program-osym-111900108": 119,
    "program-osym-111900115": 121,
    "program-osym-111900122": 126,
    "program-osym-111900129": 59,
    "program-osym-111900136": 107,
    "program-osym-111900143": 136,
    "program-osym-111900150": 114,
    "program-osym-111900157": 126,
    "program-osym-111900164": 88,
    "program-osym-111900171": 143,
}
EXPECTED_CONFLICTS = {
    "program-osym-111900164": {
        "MME312", "MME314", "MME316", "MME318", "MME320", "MME322", "MME323", "MME324",
    },
}
WITNESSES = {
    "program-osym-111900101": {"CNG201", "CNG412"},
    "program-osym-111900108": {"EEE201", "EEE498"},
    "program-osym-111900115": {"AEE201", "AEE408"},
    "program-osym-111900122": {"BİK301", "BİK402"},
    "program-osym-111900129": {"İHA101", "İHA202"},
    "program-osym-111900136": {"CHE203", "CHE406"},
    "program-osym-111900143": {"ME201", "ME416"},
    "program-osym-111900150": {"HTTR203", "TDB102"},
    "program-osym-111900157": {"ANE201", "ANE408"},
    "program-osym-111900164": {"MME201", "MME40X"},
    "program-osym-111900171": {"TBB201", "TBB402"},
}
EXPECTED_TOTAL = sum(EXPECTED_COUNTS.values())


def active_curriculum(source, payload):
    data = read(CACHE / source["file"])
    eligible = [item for item in (data.get("CurriculumDetails") or [])
                if item.get("IsApproved") and item.get("IsActiveForBologna")]
    selected = [item for item in eligible if item.get("EncryptedId") == payload["curIdStr"]]
    if not selected and len(eligible) == 1:
        selected = eligible
    if len(selected) != 1:
        raise ValueError(f"Sivas active curriculum changed: {len(selected)} / {len(eligible)}")
    return selected[0]


def collect_programme(item, directory_hash):
    source = {
        **fetch(item["courseUrl"], item["payload"], retry_failed=True),
        "publicUrl": item["publicUrl"],
        "programs": [item],
        "family": "sivas-ubys-2026",
        "payload": item["payload"],
    }
    if source.get("status") != 200:
        raise ValueError(f"Sivas curriculum is unavailable: {item['programId']}")
    curriculum = active_curriculum(source, item["payload"])
    source.update({
        "curriculumPeriod": curriculum.get("Name") or "Güncel etkin öğretim planı",
        "selection": {
            "method": "exact-approved-active-public-ubys-curriculum",
            "directoryUrl": ROOT_URL,
            "directoryHash": directory_hash,
            "sourceTitle": item["sourceTitle"],
            "unit": item["unit"],
            "curriculumName": curriculum.get("Name"),
        },
    })
    courses, conflicts = _parse_source(source)
    programme_id = item["programId"]
    expected_conflicts = EXPECTED_CONFLICTS.get(programme_id, set())
    codes = {course["code"] for course in courses}
    if (len(courses) != EXPECTED_COUNTS[programme_id]
            or set(conflicts) != expected_conflicts
            or not WITNESSES[programme_id] <= codes):
        raise ValueError(
            f"Sivas reviewed curriculum changed: {programme_id} / "
            f"{len(courses)} / {sorted(conflicts)}"
        )
    return source


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    registry = {programme["id"]: programme for programme in university["programs"]}
    if set(registry) != set(EXPECTED_COUNTS) or len(registry) != 11:
        raise ValueError("Sivas registry programme set changed")

    home_source = fetch(ROOT_URL, retry_failed=True)
    if home_source.get("status") != 200:
        raise ValueError("Sivas public UBYS entrance is unavailable")
    directory = discover(UID, ROOT_URL, university)
    matched = {item["programId"]: item for item in directory.get("matched", [])}
    if directory.get("error") or set(matched) != set(EXPECTED_COUNTS):
        raise ValueError(
            f"Sivas public UBYS programme set changed: {directory.get('error')} / {sorted(matched)}"
        )
    directory_hash = directory["source"]["sha256"]
    with ThreadPoolExecutor(max_workers=8) as pool:
        sources = list(pool.map(
            lambda item: collect_programme(item, directory_hash),
            (matched[programme_id] for programme_id in sorted(matched)),
        ))
    if sum(EXPECTED_COUNTS.values()) != EXPECTED_TOTAL:
        raise ValueError("Sivas reviewed course total changed")
    write(CACHE / "sivas-reviewed-courses.json", sources)
    write(CACHE / "sivas-reviewed-programmes.json", [{
        "universityId": UID,
        "homeSource": home_source,
        "directorySource": directory["source"],
        "matched": [matched[programme_id] for programme_id in sorted(matched)],
        "unmatched": [],
        "courseCounts": EXPECTED_COUNTS,
        "expectedConflicts": {
            programme_id: sorted(conflicts)
            for programme_id, conflicts in EXPECTED_CONFLICTS.items()
        },
    }])
    print("Sivas University of Science and Technology:", len(sources),
          "programmes;", EXPECTED_TOTAL, "unambiguous course records", flush=True)
    for source in sources:
        programme_id = source["programs"][0]["programId"]
        print(programme_id, EXPECTED_COUNTS[programme_id], flush=True)


if __name__ == "__main__":
    main()
