"""Çağ's curriculum cards: explicit semester headings and course-name links."""
import re
from parse_cyprus_courses import clean, fold, merge_courses

ORDINALS = ['birinci', 'ikinci', 'ucuncu', 'dorduncu', 'besinci', 'altinci',
            'yedinci', 'sekizinci', 'dokuzuncu', 'onuncu', 'on birinci', 'on ikinci']


def parse_cag(doc, course_code, course_kind):
    output = []
    for card in doc.select('.page-lead-content-inner .card'):
        heading = card.select_one('.card-header')
        if not heading:
            continue
        period = re.search(r'([^,]+) yariyil\b', fold(heading.get_text(' ', strip=True)))
        if not period or period[1].strip() not in ORDINALS:
            continue
        semester = ORDINALS.index(period[1].strip()) + 1
        for table in card.select('table'):
            header = table.select_one('thead tr')
            if not header:
                continue
            names = [fold(c.get_text(' ', strip=True)) for c in header.find_all(['td', 'th'], recursive=False)]
            required = ['ders kodu', 'ders', 'dersin sekli']
            if not all(n in names for n in required):
                continue
            code_index, name_index, kind_index = [names.index(n) for n in required]
            for row in table.select('tbody tr'):
                if row.find_parent('table') != table:
                    continue
                cells = row.find_all(['td', 'th'], recursive=False)
                if len(cells) <= max(code_index, name_index, kind_index):
                    continue
                code = course_code(cells[code_index].get_text())
                # Download, lecturer and category labels are not the course title.
                link = cells[name_index].find('a', title='Ders hakkında')
                name = clean(link.get_text(' ', strip=True)) if link else ''
                if not code or not 2 <= len(name) <= 200:
                    continue
                if re.search(r'\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[ivx\d])', fold(name)):
                    continue
                output.append({'code': code, 'name': name, 'semester': semester,
                               'kind': course_kind(cells[kind_index].get_text())})
    return merge_courses(output)
