"""Parse Maltepe University's public ECTS and MUBIS course lists."""
import re

from bs4 import BeautifulSoup

from parse_cyprus_courses import clean, merge_courses


def _combined_course(value, course_code):
    value = clean(value)
    for separator in re.finditer(r"\s*[-–]\s*", value):
        code = course_code(value[:separator.start()])
        name = clean(value[separator.end():])
        if code and 2 <= len(name) <= 200:
            return code, name
    match = re.match(r"^([A-ZÇĞİÖŞÜ]{1,12}\s*\d{2,10}[A-ZÇĞİÖŞÜ]{0,3})\s+(.+)$", value)
    if match:
        code = course_code(match.group(1))
        name = clean(match.group(2))
        if code and 2 <= len(name) <= 200:
            return code, name
    return None


def parse_maltepe_mubis(path, course_code):
    """Read the legacy Windows-1254 MUBIS course-definition cards."""
    document = BeautifulSoup(path.read_bytes(), "html.parser", from_encoding="windows-1254")
    output = []
    for card in document.select('div[id^="RpDersTanimlari_ASPxHeadlineDersTanimlari_"]'):
        heading = card.select_one(".dxhlHeader_PlasticBlue")
        parsed = _combined_course(heading.get_text(" ", strip=True) if heading else "", course_code)
        if parsed:
            code, name = parsed
            output.append({"code": code, "name": name, "semester": None, "kind": None})
    return merge_courses(output)


def parse_maltepe_direct(document, course_code):
    """Read medical course headings published directly on the ECTS page."""
    output = []
    for paragraph in document.select(".editor-result > p"):
        if paragraph.find("strong", recursive=False) is None:
            continue
        parsed = _combined_course(paragraph.get_text(" ", strip=True), course_code)
        if parsed:
            code, name = parsed
            output.append({"code": code, "name": name, "semester": None, "kind": None})
    return merge_courses(output)
