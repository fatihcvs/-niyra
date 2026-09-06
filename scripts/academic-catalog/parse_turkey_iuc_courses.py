"""Parse Istanbul University-Cerrahpasa's official print-curriculum JSON."""
import re

from parse_cyprus_courses import clean, merge_courses


def iuc_course_code(value):
    """Accept IUC's compact codes, including official forms such as MBSE00A1."""
    value = re.sub(r"\s+", "", clean(value)).upper()
    if (2 <= len(value) <= 20 and re.fullmatch(r"[A-ZÇĞİÖŞÜ]{2,12}[A-ZÇĞİÖŞÜ0-9-]{1,12}", value)
            and re.search(r"\d", value)):
        return value
    return None


def parse_iuc_print(document, course_kind):
    envelope = document.get("Object") if isinstance(document, dict) else None
    if not isinstance(envelope, dict):
        return [], ["iuc-print-object-missing"]
    rows = []
    for semester_table in envelope.get("YariyilTabloList") or []:
        if not isinstance(semester_table, dict):
            continue
        for item in semester_table.get("MufDersList") or []:
            if not isinstance(item, dict):
                continue
            identifier = iuc_course_code(item.get("DersKodu"))
            title = clean(item.get("DersAdi"))
            if not identifier or not 2 <= len(title) <= 200:
                continue
            semester = item.get("Yariyil")
            if type(semester) is not int or not 1 <= semester <= 12:
                semester = None
            rows.append({
                "code": identifier,
                "name": title,
                "semester": semester,
                "kind": course_kind(item.get("Tip")),
            })
    return merge_courses(rows)
