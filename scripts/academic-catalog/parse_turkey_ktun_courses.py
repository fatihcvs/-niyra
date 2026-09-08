"""Parse Konya Technical University's public department-course tables."""
import re

from parse_cyprus_courses import clean, fold, merge_courses


def parse_ktun(document, course_code):
    courses = []
    for table in document.select("table"):
        heading = table.select_one("h5")
        period = re.fullmatch(r"donem\s*(\d{1,2})", fold(heading.get_text(" ", strip=True)) if heading else "")
        if period is None:
            continue
        semester = int(period.group(1))
        if not 1 <= semester <= 12:
            continue
        headers = [re.sub(r"[^a-z0-9]+", " ", fold(cell.get_text(" ", strip=True))).strip()
                   for cell in table.select("thead tr:last-child th")]
        if len(headers) < 3 or headers[:3] != ["ders kodu", "ders adi", "akts ects"]:
            continue
        for row in table.select("tbody tr"):
            cells = row.find_all(["td", "th"], recursive=False)
            if len(cells) < 3:
                continue
            link = cells[1].select_one('a[href*="/Birim/DersIcerik/"]')
            code = course_code(cells[0].get_text(" ", strip=True))
            name = clean(link.get_text(" ", strip=True)) if link else ""
            if code and 2 <= len(name) <= 200:
                courses.append({
                    "code": code,
                    "name": name,
                    "semester": semester,
                    "kind": None,
                })
    return merge_courses(courses)
