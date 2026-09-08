"""Parse SANKO University's reviewed curriculum pages and medical PDF."""
import re

from bs4 import BeautifulSoup

from parse_cyprus_courses import clean, fold, merge_courses


def _course_name(value):
    return re.sub(r"\s*(?:\*+|⃰)\s*$", "", clean(value)).strip()


def parse_sanko_html(document, course_code, course_kind):
    """Read one class page, carrying its term into adjacent elective tables."""
    courses = []
    semester = None
    elective_section = False
    for table in document.select("table"):
        for row in table.select("tr"):
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.select("th,td")]
            if not cells:
                continue
            term = re.search(r"\b([1-8])\.?\s*YARIYIL\b", " ".join(cells), re.I)
            if term:
                semester = int(term.group(1))
                elective_section = False
            if any(fold(cell) == "secmeli" for cell in cells):
                elective_section = True
            if len(cells) < 2:
                continue
            identifier = course_code(cells[0])
            title = _course_name(cells[1])
            if not identifier or not 2 <= len(title) <= 200:
                continue
            kind = course_kind(cells[2]) if len(cells) > 2 else None
            courses.append({
                "code": identifier,
                "name": title,
                "semester": semester,
                "kind": kind or ("elective" if elective_section else None),
            })
    return merge_courses(courses)


def parse_sanko_html_bundle(data, cache, course_code, course_kind):
    courses, conflicts = [], []
    for source in data.get("sources", []):
        document = BeautifulSoup((cache / source["file"]).read_bytes(), "html.parser")
        parsed, source_conflicts = parse_sanko_html(document, course_code, course_kind)
        courses.extend(parsed)
        conflicts.extend(source_conflicts)
    merged, aggregate_conflicts = merge_courses(courses)
    return merged, sorted(set(conflicts + aggregate_conflicts))


def _medicine_context(label):
    match = re.search(r"\b([1-6])\.?\s*sinif\b", fold(label))
    if not match:
        return None
    year = int(match.group(1))
    if "guz yariyili" in fold(label):
        return {"semester": (year * 2) - 1, "year": None}
    if "bahar yariyili" in fold(label):
        return {"semester": year * 2, "year": None}
    return {"semester": None, "year": year}


def parse_sanko_medicine_rows(rows, course_code, course_kind):
    """Parse the paired year columns in SANKO's current one-page medical plan."""
    contexts = [None, None]
    elective_sections = [False, False]
    courses = []
    for raw_row in rows:
        cells = [clean(value or "") for value in raw_row]
        cells += [""] * max(0, 14 - len(cells))
        for side, offset in enumerate((0, 7)):
            context = _medicine_context(cells[offset])
            if context:
                contexts[side] = context
                elective_sections[side] = False
            if fold(cells[offset]) == "secmeli dersler":
                elective_sections[side] = True
        for side, offset in enumerate((0, 7)):
            identifier = course_code(cells[offset])
            title = _course_name(cells[offset + 1])
            context = contexts[side]
            if not identifier or not 2 <= len(title) <= 200 or context is None:
                continue
            kind = course_kind(cells[offset + 2])
            record = {
                "code": identifier,
                "name": title,
                "semester": context["semester"],
                "kind": kind or ("elective" if elective_sections[side] else None),
            }
            if context["year"] is not None:
                record["year"] = context["year"]
            courses.append(record)
    return merge_courses(courses)


def parse_sanko_medicine_pdf(path, course_code, course_kind):
    import pdfplumber

    rows = []
    with pdfplumber.open(path) as document:
        for page in document.pages:
            for table in page.find_tables():
                rows.extend(table.extract())
    return parse_sanko_medicine_rows(rows, course_code, course_kind)
