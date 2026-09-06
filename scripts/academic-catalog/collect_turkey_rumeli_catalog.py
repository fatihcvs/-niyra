"""Collect newly published current Istanbul Rumeli University plans."""
import re
from urllib.parse import parse_qs, urlparse

from discover_turkey_courses import discover_university, normal
from parse_cyprus_courses import clean
from parse_turkey_courses import parse_tables
from turkey_research import CACHE, ROOT, collect_program_pages, read, soup, write


UID = "tr-istanbul-rumeli-universitesi"
HOME = "https://obs.rumeli.edu.tr/oibs/bologna/index.aspx"
TARGETS = {
    "program-osym-208151225": "1057",
    "program-osym-208110329": "1034",
    "program-osym-208151309": "1062",
    "program-osym-208151323": "1063",
}


def _validate_plan(source):
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Rumeli plan fetch failed: {source['url']}")
    document = soup(source)
    selected = document.select("select option[selected]")
    if len(selected) != 1:
        raise ValueError(f"Rumeli plan selection is ambiguous: {source['url']}")
    reference = source["programs"][0]
    label = clean(selected[0].get_text(" ", strip=True))
    if not re.search(r"(?:^| )" + re.escape(normal(reference["title"])) + r"(?: |$)", normal(label)):
        raise ValueError(f"Rumeli selected plan identity changed: {source['url']}")
    courses, conflicts = parse_tables(document)
    if len(courses) < 3 or conflicts:
        raise ValueError(f"Rumeli selected plan is unreadable: {source['url']}")
    year = re.search(r"\b(?:19|20)\d{2}\b", label)
    if year is None or not str(selected[0].get("value", "")).isdigit():
        raise ValueError(f"Rumeli selected plan has no stable identity: {source['url']}")
    cur_sunit = parse_qs(urlparse(source["url"]).query).get("curSunit", [""])[0]
    source.update({
        "family": "rumeli-2026",
        "curriculumPeriod": year[0],
        "selection": {
            "method": "published-default-bologna-plan",
            "curSunit": cur_sunit,
            "planId": selected[0]["value"],
            "planLabel": label,
            "sourceTitle": reference["title"],
            "unit": reference["unit"],
            "degree": reference["degree"],
        },
    })
    return len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    discovery = discover_university({
        "programs": [{"universityId": UID}],
        "catalogLinks": [[HOME, "Bologna bilgi paketi"]],
    }, university)
    if discovery.get("ambiguous"):
        raise ValueError("Rumeli directory contains ambiguous current programme identities")
    matched = []
    for programme_id, expected_cur_sunit in TARGETS.items():
        items = [item for item in discovery["matched"] if item["programId"] == programme_id]
        if len(items) != 1:
            raise ValueError(f"Rumeli target identity changed: {programme_id}")
        actual = parse_qs(urlparse(items[0]["courseUrl"]).query).get("curSunit", [""])[0]
        if actual != expected_cur_sunit:
            raise ValueError(f"Rumeli curSunit changed: {programme_id}")
        matched.append(items[0])
    collect_program_pages([{"matched": matched}], "rumeli-courses")
    sources = read(CACHE / "rumeli-courses.json")
    total_courses = sum(_validate_plan(source) for source in sources)
    if len(sources) != len(TARGETS) or total_courses != 507:
        raise ValueError("Rumeli newly published plan set changed; review before publishing")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "rumeli-courses.json", sources)
    write(CACHE / "rumeli-directories.json", [{
        "universityId": UID,
        "pages": discovery["pages"],
        "matched": discovery["matched"],
        "unmatched": discovery["unmatched"],
    }])
    print("Istanbul Rumeli University:", len(sources), "new programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
