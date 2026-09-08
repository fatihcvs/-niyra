"""Parse Sabanci University's public undergraduate outcome matrices."""
from bs4 import BeautifulSoup

from parse_cyprus_courses import clean, merge_courses


def parse_sabanci_matrix(document, course_code):
    courses = []
    for table in document.select("table"):
        heading = table.find_previous(class_="class-header")
        category = clean(heading.get_text(" ", strip=True)) if heading else ""
        kind = "required" if category == "Required Courses" else (
            "elective" if category == "Core Electives" else None)
        for row in table.select("tr"):
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.select("th,td")]
            if len(cells) < 2:
                continue
            identifier = course_code(cells[0])
            title = cells[1]
            if not identifier or not 2 <= len(title) <= 200 or title == "Course Name":
                continue
            courses.append({"code": identifier, "name": title,
                            "semester": None, "kind": kind})
    return merge_courses(courses)


def parse_sabanci_bundle(data, cache, course_code):
    courses, conflicts = [], []
    for source in data.get("sources", []):
        document = BeautifulSoup((cache / source["file"]).read_bytes(), "html.parser")
        parsed, source_conflicts = parse_sabanci_matrix(document, course_code)
        courses.extend(parsed)
        conflicts.extend(source_conflicts)
    merged, aggregate_conflicts = merge_courses(courses)
    return merged, sorted(set(conflicts + aggregate_conflicts))
