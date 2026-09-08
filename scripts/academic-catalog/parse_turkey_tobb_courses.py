"""Parse TOBB ETU's public ABYS programme packages and current YBS plan."""
import re
from urllib.parse import parse_qs, urlparse

from parse_cyprus_courses import clean, fold, merge_courses


def tobb_course_code(value, course_code):
    direct = course_code(value)
    if direct:
        return direct
    compact = re.sub(r"\s+", "", clean(value)).upper()
    # ABYS publishes these four one-digit identifiers as real lesson pages.
    return compact if fold(compact) in {"iyd1", "iyd2", "iyd3", "iyd4"} else None


def parse_tobb_abys(document, course_code):
    courses = []
    for anchor in document.select('a[href*="/public/lesson.jsp"]'):
        label = clean(anchor.get_text(" ", strip=True))
        match = re.match(r"^(.+?)\s+-\s+(.+)$", label)
        query_code = parse_qs(urlparse(anchor.get("href", "")).query).get("lesson", [""])[0]
        identifier = tobb_course_code(query_code, course_code)
        if not match or not identifier:
            continue
        label_identifier = tobb_course_code(match[1], course_code)
        title = clean(match[2])
        if label_identifier != identifier or not 2 <= len(title) <= 200:
            continue
        courses.append({"code": identifier, "name": title, "semester": None, "kind": None})
    return merge_courses(courses)


def parse_tobb_ybs(document, course_code):
    courses = []
    for table_index, table in enumerate(document.select("table")):
        semester = None
        for row in table.select("tr"):
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.select("th,td")]
            if not cells:
                continue
            heading = re.search(r"\b(\d{1,2})\s*\.\s*donem\b", fold(" ".join(cells)))
            if heading:
                candidate = int(heading[1])
                semester = candidate if 1 <= candidate <= 12 else None
                continue
            if len(cells) < 2:
                continue
            identifier = tobb_course_code(cells[0], course_code)
            title = cells[1]
            if not identifier or not 2 <= len(title) <= 200:
                continue
            if fold(title) in {"ders adi", "dersin adi"}:
                continue
            courses.append({"code": identifier, "name": title,
                            "semester": semester if table_index == 0 else None,
                            "kind": "required" if table_index == 0 else "elective"})
    return merge_courses(courses)
