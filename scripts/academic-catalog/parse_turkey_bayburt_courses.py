"""Parse reviewed Bayburt University curriculum sections conservatively."""
import re

from parse_cyprus_courses import clean, fold, merge_courses


def bayburt_course_code(value):
    """Accept Bayburt's plan-suffixed codes, including GT210.1B2."""
    value = re.sub(r"\s+", "", clean(value)).upper()
    if (3 <= len(value) <= 24
            and re.fullmatch(r"[A-ZÇĞİÖŞÜ]{1,12}[A-ZÇĞİÖŞÜ0-9.-]{1,20}", value)
            and re.search(r"\d", value)):
        return value
    return None


def _course_tables(node):
    candidates = [node] if getattr(node, "name", None) == "table" else node.find_all("table")
    result = []
    for table in candidates:
        for row in table.find_all("tr"):
            if row.find_parent("table") != table:
                continue
            names = [fold(cell.get_text(" ", strip=True))
                     for cell in row.find_all(["th", "td"], recursive=False)]
            if (len(names) >= 4 and names[0] == "ders kodu"
                    and names[2] == "ders adi" and names[3] == "ders turu"):
                result.append(table)
                break
    return result


def _selected_scope(document, selection):
    method = selection.get("method") if isinstance(selection, dict) else None
    accordion = document.select_one("#accordion-mufredat")
    if method == "reviewed-current-heading":
        if accordion is None:
            return None, ["bayburt-curriculum-accordion-missing"]
        headings = accordion.find_all("h3", recursive=False)
        labels = [clean(heading.get_text(" ", strip=True)) for heading in headings]
        if labels != selection.get("headings"):
            return None, ["bayburt-curriculum-headings-changed"]
        matches = [heading for heading, label in zip(headings, labels)
                   if label == selection.get("label")]
        if len(matches) != 1:
            return None, ["bayburt-current-curriculum-not-unique"]
        section = matches[0].find_next_sibling("div")
        if section is None:
            return None, ["bayburt-current-curriculum-section-missing"]
        return section, []
    if method == "single-official-plan":
        if accordion is not None or selection.get("headings") != []:
            return None, ["bayburt-single-curriculum-structure-changed"]
        return document, []
    return None, ["bayburt-curriculum-selection-required"]


def parse_bayburt(document, selection, course_kind, heading_period):
    scope, issues = _selected_scope(document, selection)
    if issues:
        return [], issues
    tables = _course_tables(scope)
    if len(tables) != 1:
        return [], ["bayburt-current-course-table-not-unique"]

    courses = []
    semester = None
    mapping = None
    seen_semesters = set()
    for row in tables[0].find_all("tr"):
        if row.find_parent("table") != tables[0]:
            continue
        values = [clean(cell.get_text(" ", strip=True))
                  for cell in row.find_all(["th", "td"], recursive=False)]
        names = [fold(value) for value in values]
        if (len(names) >= 4 and names[0] == "ders kodu"
                and names[2] == "ders adi" and names[3] == "ders turu"):
            mapping = {"code": 0, "name": 2, "kind": 3}
            continue
        nonempty = [value for value in values if value]
        if len(nonempty) <= 2:
            label = " ".join(nonempty)
            period, _ = heading_period(label)
            if period:
                semester = period
                seen_semesters.add(period)
            elif "secmeli ders" in fold(label):
                # Pools published after the four-term plan have no assigned term.
                semester = None
            continue
        if mapping is None or len(values) <= mapping["kind"]:
            continue
        identifier = bayburt_course_code(values[mapping["code"]])
        title = values[mapping["name"]]
        if (not identifier or not 2 <= len(title) <= 200
                or re.search(r"secmeli ders(?:ler)? grubu", fold(title))):
            continue
        courses.append({
            "code": identifier,
            "name": title,
            "semester": semester,
            "kind": course_kind(values[mapping["kind"]]),
        })
    expected_semesters = set(selection.get("semesters", [1, 2, 3, 4]))
    if seen_semesters != expected_semesters:
        return [], ["bayburt-semester-plan-changed"]
    return merge_courses(courses)
