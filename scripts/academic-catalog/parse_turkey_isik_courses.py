"""Işık curriculum accordions with an explicitly selected published plan."""
import re
from parse_cyprus_courses import clean, fold, merge_courses


def parse_isik(doc, selection_label, course_code, course_kind, heading_period):
    accordions = doc.select('.accordion-item > .accordion-header')
    if accordions:
        if not selection_label:
            return [], ['isik-curriculum-selection-required']
        selected = [heading for heading in accordions
                    if clean(heading.get_text(' ', strip=True)) == selection_label]
        if len(selected) != 1:
            return [], ['isik-curriculum-selection-not-found']
        scope = selected[0].find_parent(class_='accordion-item')
    else:
        scope = doc

    output = []
    for table in scope.select('table'):
        mapping = None
        semester = None
        for row in table.select('tr'):
            if row.find_parent('table') != table:
                continue
            values = [clean(cell.get_text(' ', strip=True))
                      for cell in row.find_all(['td', 'th'], recursive=False)]
            names = [fold(value) for value in values]
            code_index = next((i for i, name in enumerate(names)
                               if name in ['slot kodu', 'slot code', 'ders kodu']), None)
            name_index = next((i for i, name in enumerate(names)
                               if name in ['slot adi', 'slot name', 'ders adi']), None)
            if code_index is not None and name_index is not None:
                mapping = {
                    'code': code_index,
                    'name': name_index,
                    'kind': next((i for i, name in enumerate(names)
                                  if name in ['tur', 'type', 'ders turu']), None),
                }
                continue
            nonempty = [value for value in values if value]
            if len(nonempty) <= 4:
                candidate, _ = heading_period(' '.join(nonempty))
                if candidate:
                    semester = candidate
            if mapping is None or max(mapping['code'], mapping['name']) >= len(values):
                continue
            identifier = course_code(values[mapping['code']])
            title = values[mapping['name']]
            if not identifier or not 2 <= len(title) <= 200:
                continue
            if re.search(r'^(?:toplam|total)\b|\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[ivx\d])',
                         fold(title)):
                continue
            kind_text = (values[mapping['kind']]
                         if mapping['kind'] is not None and mapping['kind'] < len(values) else '')
            output.append({'code': identifier, 'name': title, 'semester': semester,
                           'kind': course_kind(kind_text)})
    return merge_courses(output)


def parse_isik_pdf_tables(tables, course_code, heading_period):
    """Parse extracted paired-semester tables and the elective appendix."""
    output = []
    for table in tables:
        periods = {0: None, 6: None}
        elective = False
        for original in table:
            values = [clean(value or '') for value in original]
            nonempty = [value for value in values if value]
            if len(nonempty) == 1 and fold(nonempty[0]) == 'electives':
                elective = True
                continue
            for start in [0, 6]:
                if start < len(values):
                    semester, _ = heading_period(values[start])
                    if semester:
                        periods[start] = semester
            if any(fold(value) in ['course name', 'ders adi'] for value in values):
                continue
            starts = [0] if len(values) < 8 else [0, 6]
            for start in starts:
                if start + 1 >= len(values):
                    continue
                identifier = course_code(values[start])
                title = values[start + 1]
                if not identifier or not 2 <= len(title) <= 200:
                    continue
                if re.search(r'^(?:semester credits|total)\b|\b(?:area|general|science|project) elective\b',
                             fold(title)):
                    continue
                output.append({'code': identifier, 'name': title,
                               'semester': None if elective else periods.get(start),
                               'kind': 'elective' if elective else None})
    return merge_courses(output)


def parse_isik_pdf(path, course_code, heading_period):
    """Parse Işık's paired-semester curriculum PDF and its elective appendix."""
    import pdfplumber
    with pdfplumber.open(path) as document:
        tables = [table for page in document.pages for table in page.extract_tables()]
    return parse_isik_pdf_tables(tables, course_code, heading_period)
