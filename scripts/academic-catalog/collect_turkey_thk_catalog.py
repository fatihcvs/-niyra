"""Collect current public THKU Bologna plans with exact programme identity."""
import re
from urllib.parse import parse_qs, urlparse

from discover_turkey_courses import discover_university, normal
from parse_cyprus_courses import clean
from parse_turkey_courses import parse_tables
from turkey_research import CACHE, ROOT, collect_program_pages, read, soup, write


UID = "tr-turk-hava-kurumu-universitesi"
HOME = "https://sis.thk.edu.tr/oibs/bologna/index.aspx"
DIRECTORIES = {
    "bachelor": "https://sis.thk.edu.tr/oibs/bologna/unitSelection.aspx?type=lis&lang=tr",
    "associate": "https://sis.thk.edu.tr/oibs/bologna/unitSelection.aspx?type=myo&lang=tr",
}
ALIASES = {
    "program-osym-205750275": {
        "curSunit": "6487",
        "sourceTitle": "Uçak Bakım ve Onarım (Türkçe)",
        "unit": "Hava Ulaştırma Fakültesi",
        "degree": "bachelor",
    },
}


def _identity_stem(value):
    value = normal(value)
    value = re.sub(
        r"\b(?:19|20)\d{2}\b|\b(?:tc|yabanci|tr|en|ingilizce|turkce)\b",
        " ", value,
    )
    return re.sub(r"\s+", " ", value).strip()


def _alias_reference(university, discovery, programme_id, expected):
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    programme = next(
        (value for value in university["programs"] if value["id"] == programme_id), None
    )
    if programme is None:
        raise ValueError(f"THKU registry alias disappeared: {programme_id}")
    items = [item for item in discovery["unmatched"]
             if parse_qs(urlparse(item["url"]).query).get("curSunit") == [expected["curSunit"]]]
    if len(items) != 1:
        raise ValueError(f"THKU alias directory identity changed: {programme_id}")
    item = items[0]
    if (clean(item["title"]) != expected["sourceTitle"]
            or clean(item["unit"]) != expected["unit"]
            or item["degree"] != expected["degree"]
            or units[programme["unitId"]] != expected["unit"]
            or programme["degreeLevel"] != expected["degree"]):
        raise ValueError(f"THKU registry alias changed: {programme_id}")
    course_url = (
        "https://sis.thk.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit="
        + expected["curSunit"]
    )
    return {
        **item,
        "title": programme["name"],
        "sourceTitle": expected["sourceTitle"],
        "programId": programme_id,
        "name": programme["name"],
        "courseUrl": course_url,
        "routeWitness": discovery["matched"][0]["routeWitness"],
    }


def _validate_plan(source):
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"THKU plan fetch failed: {source['url']}")
    document = soup(source)
    selected = document.select("select option[selected]")
    if len(selected) != 1:
        raise ValueError(f"THKU plan selection is ambiguous: {source['url']}")
    reference = source["programs"][0]
    label = clean(selected[0].get_text(" ", strip=True))
    source_title = reference.get("sourceTitle", reference["title"])
    if _identity_stem(label) != _identity_stem(source_title):
        raise ValueError(f"THKU selected plan identity changed: {source['url']}")
    year = re.search(r"\b(?:19|20)\d{2}\b", label)
    if year is None or not str(selected[0].get("value", "")).isdigit():
        raise ValueError(f"THKU selected plan has no stable identity: {source['url']}")
    courses, conflicts = parse_tables(document)
    if len(courses) < 3 or conflicts:
        raise ValueError(f"THKU selected plan is unreadable: {source['url']}")
    cur_sunit = parse_qs(urlparse(source["url"]).query).get("curSunit", [""])[0]
    source.update({
        "family": "thk",
        "curriculumPeriod": year[0],
        "selection": {
            "method": "published-default-bologna-plan",
            "curSunit": cur_sunit,
            "planId": selected[0]["value"],
            "planLabel": label,
            "sourceTitle": source_title,
            "unit": reference["unit"],
            "degree": reference["degree"],
            "registryAlias": bool(reference.get("sourceTitle")),
        },
    })
    return len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    home = {
        "programs": [{"universityId": UID}],
        "catalogLinks": [[HOME, "Bologna bilgi paketi"]],
    }
    discovery = discover_university(home, university)
    if discovery.get("ambiguous"):
        raise ValueError("THKU directory contains ambiguous current programme identities")
    matched = list(discovery["matched"])
    for programme_id, expected in ALIASES.items():
        matched.append(_alias_reference(university, discovery, programme_id, expected))
    programme_ids = {item["programId"] for item in matched}
    expected_ids = {item["id"] for item in university["programs"]}
    if programme_ids != expected_ids or len(matched) != len(programme_ids):
        raise ValueError(
            "THKU current registry coverage is incomplete: "
            + str(sorted(expected_ids - programme_ids))
        )
    collect_program_pages([{"matched": matched}], "thk-courses")
    sources = read(CACHE / "thk-courses.json")
    total_courses = 0
    for source in sources:
        total_courses += _validate_plan(source)
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "thk-courses.json", sources)
    write(CACHE / "thk-directories.json", [{
        "universityId": UID,
        "pages": discovery["pages"],
        "matched": matched,
        "unmatched": discovery["unmatched"],
    }])
    print(
        "Turkish Aeronautical Association University:", len(matched),
        "current programmes;", total_courses, "course records",
        flush=True,
    )


if __name__ == "__main__":
    main()
