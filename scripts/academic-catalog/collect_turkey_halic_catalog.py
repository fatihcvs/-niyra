"""Collect Haliç University MYO plans with an explicit official unit-name alias."""
import re
from urllib.parse import parse_qs, urlparse

from discover_turkey_courses import discover_university, normal
from parse_cyprus_courses import clean
from parse_turkey_courses import parse_tables
from turkey_research import CACHE, ROOT, collect_program_pages, read, soup, write


UID = "tr-halic-universitesi"
HOME = "https://obs.halic.edu.tr/oibs/bologna/index.aspx"
SOURCE_UNIT = "Meslek Yüksek Okulu"
REGISTRY_UNIT = "Meslek Yüksekokulu"
# Current registry programme id -> (official curSunit, selected default plan id).
TARGETS = {
    "program-osym-201900206": ("1113", "2681"),
    "program-osym-201900227": ("1114", "2679"),
    "program-osym-201900297": ("1098", "2758"),
    "program-osym-201900318": ("1099", "2762"),
    "program-osym-201950023": ("36", "2761"),
    "program-osym-201950059": ("38", "2721"),
    "program-osym-201950077": ("32", "2724"),
    "program-osym-201950111": ("24", "2726"),
    "program-osym-201950147": ("26", "2734"),
    "program-osym-201950192": ("28", "2737"),
    "program-osym-201950226": ("40", "2739"),
    "program-osym-201950298": ("34", "2746"),
    "program-osym-201950402": ("331", "2743"),
    "program-osym-201950456": ("357", "2730"),
    "program-osym-201950474": ("363", "2736"),
    "program-osym-201990457": ("1007", "2738"),
    "program-osym-201990573": ("1066", "2727"),
    "program-osym-201990601": ("1011", "2722"),
    "program-osym-201990615": ("1015", "2725"),
    "program-osym-201990650": ("1013", "2733"),
    "program-osym-201990671": ("1014", "2748"),
    "program-osym-201990685": ("355", "2749"),
    "program-osym-201990692": ("1067", "2754"),
    "program-osym-201990706": ("1012", "2760"),
    "program-osym-201991161": ("1080", "2728"),
    "program-osym-201991210": ("1082", "2731"),
    "program-osym-201991224": ("1083", "2732"),
    "program-osym-201991245": ("1084", "2735"),
    "program-osym-201991266": ("1085", "2740"),
    "program-osym-201991294": ("1086", "2741"),
    "program-osym-201991308": ("1087", "2742"),
    "program-osym-201991336": ("1088", "2744"),
    "program-osym-201991350": ("1089", "2745"),
    "program-osym-201991371": ("1090", "2747"),
    "program-osym-201991392": ("1091", "2750"),
    "program-osym-201991413": ("1092", "2751"),
    "program-osym-201991434": ("1093", "2752"),
    "program-osym-201991455": ("1094", "2753"),
    "program-osym-201991476": ("1095", "2755"),
    "program-osym-201991497": ("1096", "2756"),
    "program-osym-201991518": ("1097", "2757"),
    "program-osym-201991539": ("1100", "2763"),
}


def _alias_reference(university, discovery, programme_id, expected_cur_sunit):
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    programme = next((value for value in university["programs"] if value["id"] == programme_id), None)
    if programme is None or programme["degreeLevel"] != "associate" or units[programme["unitId"]] != REGISTRY_UNIT:
        raise ValueError(f"Haliç registry alias changed: {programme_id}")
    items = [item for item in discovery["unmatched"]
             if parse_qs(urlparse(item["url"]).query).get("curSunit") == [expected_cur_sunit]]
    if len(items) != 1:
        raise ValueError(f"Haliç source identity changed: {programme_id}")
    item = items[0]
    if (item["degree"] != "associate" or clean(item["unit"]) != SOURCE_UNIT
            or normal(item["title"]) != normal(programme["name"])):
        raise ValueError(f"Haliç unit-name alias is no longer exact: {programme_id}")
    return {
        **item,
        "title": programme["name"],
        "unit": REGISTRY_UNIT,
        "programId": programme_id,
        "name": programme["name"],
        "courseUrl": (
            "https://obs.halic.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit="
            + expected_cur_sunit
        ),
        "routeWitness": discovery["matched"][0]["routeWitness"],
    }


def _validate_plan(source):
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Haliç plan fetch failed: {source['url']}")
    document = soup(source)
    selected = document.select("select option[selected]")
    if len(selected) != 1:
        raise ValueError(f"Haliç plan selection is ambiguous: {source['url']}")
    reference = source["programs"][0]
    expected_cur_sunit, expected_plan_id = TARGETS[reference["programId"]]
    actual_cur_sunit = parse_qs(urlparse(source["url"]).query).get("curSunit", [""])[0]
    label = clean(selected[0].get_text(" ", strip=True))
    if actual_cur_sunit != expected_cur_sunit or selected[0].get("value") != expected_plan_id:
        raise ValueError(f"Haliç default plan identity changed: {source['url']}")
    if not label.startswith("2026 ("):
        raise ValueError(f"Haliç plan is no longer the current 2026 publication: {source['url']}")
    courses, conflicts = parse_tables(document)
    if len(courses) < 3 or conflicts:
        raise ValueError(f"Haliç plan is unreadable: {source['url']}")
    source.update({
        "family": "halic-2026",
        "curriculumPeriod": label,
        "selection": {
            "method": "published-default-bologna-plan",
            "curSunit": actual_cur_sunit,
            "planId": expected_plan_id,
            "planLabel": label,
            "registryAlias": True,
            "sourceUnit": SOURCE_UNIT,
            "registryUnit": REGISTRY_UNIT,
            "sourceTitle": reference["title"],
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
    if discovery.get("ambiguous") or len(discovery["matched"]) != 39:
        raise ValueError("Haliç exact-match directory set changed; review before publishing")
    aliases = [_alias_reference(university, discovery, programme_id, expected[0])
               for programme_id, expected in TARGETS.items()]
    if len({item["programId"] for item in aliases}) != len(TARGETS):
        raise ValueError("Haliç aliases do not identify unique current programmes")
    collect_program_pages([{"matched": aliases}], "halic-courses")
    sources = read(CACHE / "halic-courses.json")
    total_courses = sum(_validate_plan(source) for source in sources)
    if len(sources) != len(TARGETS) or total_courses != 4114:
        raise ValueError("Haliç current MYO plan totals changed; review before publishing")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "halic-courses.json", sources)
    write(CACHE / "halic-directories.json", [{
        "universityId": UID,
        "pages": discovery["pages"],
        "matched": [*discovery["matched"], *aliases],
        "unmatched": discovery["unmatched"],
    }])
    print("Haliç University:", len(sources), "new MYO programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
