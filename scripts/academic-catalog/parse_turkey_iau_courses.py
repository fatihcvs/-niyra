"""Parse Istanbul Aydin University's public EBS course-plan tables."""
import re

from parse_cyprus_courses import clean, fold, merge_courses


def _cells(row):
    return [clean(cell.get_text(" ", strip=True))
            for cell in row.find_all(["td", "th"], recursive=False)]


def _kind(value):
    value = fold(value)
    if "secmeli" in value:
        return "elective"
    if "zorunlu" in value:
        return "required"
    return None


def _pool_period(table):
    match = re.fullmatch(r"SanalSecmeli_([1-6])x([0-2])", table.get("id", ""))
    if not match:
        return None, None
    year, half = int(match[1]), int(match[2])
    return ((year - 1) * 2 + half, year) if half else (None, year)


def parse_iau(document, course_code, heading_period):
    output = []
    for table in document.select("table.list, table[id^='SanalSecmeli_']"):
        rows = table.find_all("tr", recursive=False)
        if not rows:
            continue
        is_pool = bool(table.get("id", "").startswith("SanalSecmeli_"))
        semester, year = _pool_period(table) if is_pool else heading_period(rows[0].get_text(" "))
        mapping = None
        if is_pool:
            # The first empty cell holds the expand icon; ID, code, title and
            # type occupy the following four columns.
            mapping = {"code": 2, "name": 3, "kind": 4}
        for row in rows:
            values = _cells(row)
            names = [fold(value) for value in values]
            if not is_pool:
                code_index = next((index for index, name in enumerate(names) if name == "kodu"), None)
                title_index = next((index for index, name in enumerate(names) if name == "ders adi"), None)
                if code_index is not None and title_index is not None:
                    mapping = {
                        "code": code_index,
                        "name": title_index,
                        "kind": next((index for index, name in enumerate(names)
                                      if name == "dersin turu"), None),
                    }
                    continue
            if mapping is None or max(mapping["code"], mapping["name"]) >= len(values):
                continue
            identifier = course_code(values[mapping["code"]])
            title = values[mapping["name"]]
            if not identifier or not 2 <= len(title) <= 200:
                continue
            if re.search(r"^(?:toplam|total)\b|\bsecmeli\s+ders\s+modulu\b", fold(title)):
                continue
            kind_index = mapping.get("kind")
            kind = _kind(values[kind_index]) if kind_index is not None and kind_index < len(values) else None
            record = {"code": identifier, "name": title, "semester": semester, "kind": kind}
            if year is not None and semester is None:
                record["year"] = year
            output.append(record)
    return merge_courses(output)
