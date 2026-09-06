"""Collect every current Iskenderun Technical University programme plan."""
import re
from urllib.parse import parse_qs, urlparse

from discover_turkey_courses import discover_university
from parse_cyprus_courses import clean
from parse_turkey_courses import parse_tables
from turkey_research import CACHE, ROOT, collect_program_pages, read, soup, write


UID = "tr-iskenderun-teknik-universitesi"
HOME = "https://obs.iste.edu.tr/oibs/bologna/index.aspx"
# Official programme id -> (curSunit, selected default plan id).
TARGETS = {
    "program-osym-110710025": ("5652", "9805"),
    "program-osym-110710034": ("5650", "10084"),
    "program-osym-110710043": ("5654", "10082"),
    "program-osym-110710061": ("5658", "10079"),
    "program-osym-110710113": ("5705", "10074"),
    "program-osym-110710122": ("5593", "10004"),
    "program-osym-110710131": ("5673", "9970"),
    "program-osym-110710149": ("5672", "10085"),
    "program-osym-110750078": ("1699", "10105"),
    "program-osym-110750139": ("1766", "10104"),
    "program-osym-110750157": ("1776", "10086"),
    "program-osym-110750175": ("1555", "10103"),
    "program-osym-110750184": ("1784", "10088"),
    "program-osym-110750193": ("1421", "9517"),
    "program-osym-110750227": ("1790", "10106"),
    "program-osym-110750236": ("2110", "10095"),
    "program-osym-110750245": ("1370", "9529"),
    "program-osym-110750263": ("1794", "10099"),
    "program-osym-110750281": ("1375", "10100"),
    "program-osym-110750306": ("1451", "10098"),
    "program-osym-110750315": ("1798", "10101"),
    "program-osym-110750324": ("1800", "9532"),
    "program-osym-110750333": ("1802", "10094"),
    "program-osym-110790015": ("5693", "10093"),
    "program-osym-110790016": ("5681", "10081"),
    "program-osym-110790018": ("5696", "9964"),
    "program-osym-110790019": ("5697", "9724"),
    "program-osym-110790020": ("5708", "9470"),
    "program-osym-110790021": ("5712", "9832"),
    "program-osym-110790023": ("5707", "9963"),
    "program-osym-110790024": ("5692", "9965"),
    "program-osym-110790025": ("5715", "9873"),
    "program-osym-110790026": ("5716", "9502"),
    "program-osym-110790027": ("5735", "10087"),
    "program-osym-110790028": ("5726", "10096"),
    "program-osym-110790030": ("5739", "9772"),
    "program-osym-110790031": ("5737", "10071"),
    "program-osym-110790032": ("5738", "9744"),
    "program-osym-110790033": ("5732", "9520"),
    "program-osym-110790034": ("5734", "9598"),
    "program-osym-110790035": ("5727", "9817"),
    "program-osym-110790036": ("5728", "10078"),
    "program-osym-110790037": ("5731", "10077"),
    "program-osym-110790038": ("5730", "10072"),
    "program-osym-110790039": ("5733", "10039"),
    "program-osym-110790046": ("5772", "10107"),
    "program-osym-110790053": ("5773", "10110"),
    "program-osym-110790060": ("5774", "10109"),
    "program-osym-110790067": ("5778", "9708"),
    "program-osym-110790074": ("5674", "9712"),
    "program-osym-110790081": ("5782", "9802"),
    "program-osym-110790088": ("5784", "9804"),
    "program-osym-110790095": ("5780", "9953"),
    "program-osym-110790102": ("5781", "9959"),
    "program-osym-110790109": ("5787", "10062"),
}


def _validate_plan(source):
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"ISTE plan fetch failed: {source['url']}")
    document = soup(source)
    selected = document.select("select option[selected]")
    if len(selected) != 1:
        raise ValueError(f"ISTE plan selection is ambiguous: {source['url']}")
    reference = source["programs"][0]
    expected_cur_sunit, expected_plan_id = TARGETS[reference["programId"]]
    actual_cur_sunit = parse_qs(urlparse(source["url"]).query).get("curSunit", [""])[0]
    label = clean(selected[0].get_text(" ", strip=True))
    if actual_cur_sunit != expected_cur_sunit or selected[0].get("value") != expected_plan_id:
        raise ValueError(f"ISTE default plan identity changed: {source['url']}")
    if not re.search(r"\b(?:19|20)\d{2}\b", label):
        raise ValueError(f"ISTE plan has no published period: {source['url']}")
    courses, conflicts = parse_tables(document, "iste")
    if len(courses) < 3 or conflicts:
        raise ValueError(f"ISTE plan is unreadable: {source['url']}")
    source.update({
        "family": "iste-2026",
        "curriculumPeriod": label,
        "selection": {
            "method": "published-default-bologna-plan",
            "curSunit": actual_cur_sunit,
            "planId": expected_plan_id,
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
        raise ValueError("ISTE directory contains ambiguous current programme identities")
    matched = {item["programId"]: item for item in discovery["matched"]}
    if set(matched) != set(TARGETS):
        raise ValueError("ISTE current programme set changed; review before publishing")
    for programme_id, (expected_cur_sunit, _) in TARGETS.items():
        actual = parse_qs(urlparse(matched[programme_id]["courseUrl"]).query).get("curSunit", [""])[0]
        if actual != expected_cur_sunit:
            raise ValueError(f"ISTE curSunit changed: {programme_id}")
    collect_program_pages([{"matched": list(matched.values())}], "iste-courses")
    sources = read(CACHE / "iste-courses.json")
    total_courses = sum(_validate_plan(source) for source in sources)
    if len(sources) != len(TARGETS) or total_courses != 9231:
        raise ValueError("ISTE current plan totals changed; review before publishing")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "iste-courses.json", sources)
    write(CACHE / "iste-directories.json", [{
        "universityId": UID,
        "pages": discovery["pages"],
        "matched": discovery["matched"],
        "unmatched": discovery["unmatched"],
    }])
    print("Iskenderun Technical University:", len(sources), "current programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
