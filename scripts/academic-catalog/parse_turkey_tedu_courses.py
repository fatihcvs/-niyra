"""Parse browser-captured TED University programme tables."""
import re

from parse_cyprus_courses import clean, fold, merge_courses


def _codes(value, course_code):
    value = clean(value).upper()
    direct = course_code(value)
    if direct:
        return [direct]
    # TED's official identifiers also use a one-letter old/new plan suffix.
    if re.fullmatch(r'[A-ZÇĞİÖŞÜ]{1,12}\s*\d{2,10}[A-ZÇĞİÖŞÜ]{0,3}-[A-Z]', value):
        return [re.sub(r'\s+', '', value)]
    # TED publishes a few shared-prefix alternatives such as TUR 101/150.
    shared = re.fullmatch(r'([A-ZÇĞİÖŞÜ]{1,12})\s*(\d{2,10}[A-ZÇĞİÖŞÜ]{0,3})\s*/\s*(\d{2,10}[A-ZÇĞİÖŞÜ]{0,3})', value)
    if shared:
        candidates = [course_code(shared[1] + shared[2]), course_code(shared[1] + shared[3])]
        return candidates if all(candidates) and len(set(candidates)) == 2 else []
    explicit = re.fullmatch(r'([A-ZÇĞİÖŞÜ]{1,12}\s*\d{2,10}[A-ZÇĞİÖŞÜ]{0,3})\s*/\s*([A-ZÇĞİÖŞÜ]{1,12}\s*\d{2,10}[A-ZÇĞİÖŞÜ]{0,3})', value)
    if explicit:
        candidates = [course_code(explicit[1]), course_code(explicit[2])]
        return candidates if all(candidates) and len(set(candidates)) == 2 else []
    return []


def parse_tedu(data, course_code, heading_period):
    output = []
    for table in data.get('tables', []):
        semester, _ = heading_period(table.get('heading'))
        if semester is None:
            match = re.search(r'\b(?:yariyil|donem|semester)\s*(\d{1,2})\b', fold(table.get('heading')))
            semester = int(match[1]) if match and 1 <= int(match[1]) <= 12 else None
        if semester is None:
            continue
        for row in table.get('rows', []):
            title = clean(row.get('title'))
            identifiers = _codes(row.get('code'), course_code)
            if not identifiers or not 2 <= len(title) <= 200:
                continue
            if re.search(r'^(?:toplam|total)\b|\b(?:secmeli|elective)\s*(?:ders|course|grup|group)', fold(title)):
                continue
            for identifier in identifiers:
                output.append({'code': identifier, 'name': title, 'semester': semester, 'kind': None})
    return merge_courses(output)
