"""Parse Düzce University's public programme curriculum tables."""
import re

from parse_cyprus_courses import clean, fold, merge_courses


def parse_duzce(document, course_code, course_kind):
    courses = []
    for table in document.select("table.table"):
        heading = table.find_previous("h5")
        period = re.fullmatch(r"(\d{1,2})\s*\.?\s*yariyil", fold(heading.get_text(" ", strip=True)) if heading else "")
        if period is None:
            continue
        semester = int(period.group(1))
        if not 1 <= semester <= 12:
            continue
        headers = [re.sub(r"[^a-z0-9]+", " ", fold(cell.get_text(" ", strip=True))).strip()
                   for cell in table.select("thead tr:last-child th")]
        if len(headers) < 3 or headers[:3] != ["kodu", "ders adi", "zorunlu mu"]:
            continue
        for row in table.select("tbody tr"):
            cells = row.find_all(["td", "th"], recursive=False)
            if len(cells) < 3:
                continue
            code = course_code(cells[0].get_text(" ", strip=True))
            link = cells[1].select_one('a[href*="/Ders/Index/"]')
            name = clean(link.get_text(" ", strip=True)) if link else ""
            if code and 2 <= len(name) <= 200:
                required = fold(cells[2].get_text(" ", strip=True))
                courses.append({
                    "code": code,
                    "name": name,
                    "semester": semester,
                    "kind": "required" if required == "evet" else "elective" if required == "hayir" else None,
                })
    return merge_courses(courses)
