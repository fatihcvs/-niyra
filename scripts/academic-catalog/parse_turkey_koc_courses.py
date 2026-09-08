"""Parse Koç University's public undergraduate curriculum pages."""
import re

from bs4 import BeautifulSoup

from parse_cyprus_courses import clean, fold, merge_courses


YEAR_NAMES = {"freshman": 1, "sophomore": 2, "junior": 3, "senior": 4}


def _term(value):
    value = fold(value)
    year = next((number for name, number in YEAR_NAMES.items() if name in value), None)
    semester = re.search(r"\bsemester\s*([12])\b", value)
    if year and semester:
        return (year - 1) * 2 + int(semester.group(1))
    return None


def _kind(value):
    value = fold(value)
    if "elective" in value:
        return "elective"
    if "required" in value or "common core" in value:
        return "required"
    return None


def _heading_course(value, course_code):
    value = clean(value)
    match = re.match(r"^([A-ZÇĞİÖŞÜ]{2,12}\s*\d{2,4}[A-ZÇĞİÖŞÜ]?)\s*\*?\s*(?:[/\-–]\s*)?(.+)$", value)
    if not match:
        return None
    identifier = course_code(match.group(1))
    title = clean(match.group(2))
    if not identifier or not 2 <= len(title) <= 200:
        return None
    return identifier, title


def parse_koc_curriculum(document, course_code):
    """Read the eight-semester tables and their explicitly listed elective options."""
    courses = []
    curriculum = document.select_one("#accordionCurriculum")
    if curriculum is None:
        return [], ["missing-curriculum-accordion"]
    for item in curriculum.select(".accordion-item"):
        heading = item.select_one(".accordion-header")
        semester = _term(heading.get_text(" ", strip=True) if heading else "")
        table = item.find("table")
        if table is None:
            continue
        for row in table.select("tbody > tr"):
            values = row.find_all("td", recursive=False)
            if len(values) < 3:
                continue
            code_text = next(values[0].stripped_strings, "")
            name_text = next(values[1].stripped_strings, "")
            identifier = course_code(code_text)
            kind = _kind(values[2].get_text(" ", strip=True))
            if identifier and 2 <= len(clean(name_text)) <= 200:
                courses.append({"code": identifier, "name": clean(name_text),
                                "semester": semester, "kind": kind})
            # Pool rows (AREA, ARHU, SOSC, SCTH, ETHC) publish the actual
            # eligible courses in the first cell's popover. Only leaf list
            # items contain one explicit code/title pair.
            for option in values[0].select("li"):
                if option.find("li") is not None:
                    continue
                text = re.sub(r"^(?:OR|XOR|AND)\s+", "", clean(option.get_text(" ", strip=True)), flags=re.I)
                parsed = _heading_course(text.replace(":", " -", 1), course_code)
                if parsed:
                    option_code, option_name = parsed
                    courses.append({"code": option_code, "name": option_name,
                                    "semester": semester, "kind": "elective"})
    return merge_courses(courses)


def parse_koc_nursing(document, course_code):
    """Read the School of Nursing's public undergraduate course cards."""
    courses = []
    for heading in document.select("a.elementor-toggle-title"):
        parsed = _heading_course(heading.get_text(" ", strip=True), course_code)
        if parsed:
            identifier, title = parsed
            courses.append({"code": identifier, "name": title,
                            "semester": None, "kind": None})
    return merge_courses(courses)


def parse_koc_medicine(bundle, cache, course_code):
    """Read the six public medical-year pages captured in a reviewed bundle."""
    courses = []
    for source in bundle.get("sources", []):
        path = cache / source["file"]
        document = BeautifulSoup(path.read_bytes(), "html.parser")
        year = source["year"]
        for heading in document.select(".e-n-accordion-item-title-text, a.elementor-toggle-title"):
            parsed = _heading_course(heading.get_text(" ", strip=True), course_code)
            if parsed:
                identifier, title = parsed
                courses.append({"code": identifier, "name": title,
                                "semester": None, "year": year, "kind": None})
        for row in document.select("table tr"):
            values = [clean(cell.get_text(" ", strip=True))
                      for cell in row.find_all(["th", "td"], recursive=False)]
            if len(values) < 2:
                continue
            identifier = course_code(values[0])
            title = values[1]
            if identifier and 2 <= len(title) <= 200:
                courses.append({"code": identifier, "name": title,
                                "semester": None, "year": year, "kind": None})
    return merge_courses(courses)
