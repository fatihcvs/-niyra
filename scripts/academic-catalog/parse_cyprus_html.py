"""Parse reviewed HTML curriculum families, matching exact programme identities."""
import re
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, read, write
from parse_cyprus_courses import clean, code, fold, merge_courses

ALIASES = {'elektrik ve elektronik muhendisligi': 'elektrik elektronik muhendisligi',
           'fizyoterapi teknikerligi': 'fizyoterapi',
           'ingilizce ogretmenligi elt': 'ingilizce ogretmenligi',
           'ekonomi': 'iktisat'}


def base_name(name):
    name = re.split(r'\s+(?:Önlisans|Lisans) Programı', name)[0]
    name = re.sub(r'\([^)]*\)', '', name)
    name = re.sub(r'[^\w]+', ' ', fold(name)).strip()
    return ALIASES.get(name, name)


def parse_emu(soup):
    courses, term = [], None
    for row in soup.select('table tr'):
        cells = [clean(c.get_text(' ', strip=True)) for c in row.select('td,th')]
        if len(cells) == 1 and re.fullmatch(r'Dönem \d+', cells[0]):
            term = int(cells[0].split()[-1])
        if len(cells) >= 8 and term and code(cells[1]) and len(cells[2]) > 3:
            if re.search(r'seçmeli|elective', cells[2], re.I):
                continue
            courses.append({'code': code(cells[1]), 'name': cells[2], 'semester': term, 'kind': None})
    return merge_courses(courses)[0]


def parse_ciu(soup):
    terms = ['birinci', 'ikinci', 'ucuncu', 'dorduncu', 'besinci', 'altinci', 'yedinci', 'sekizinci', 'dokuzuncu', 'onuncu', 'on birinci', 'on ikinci']
    courses, term, kind = [], None, None
    for node in soup.select('h4, .ciu-course-accordion__title, .ciu-course-accordion.accordion'):
        text = fold(node.get_text(' ', strip=True))
        if node.name == 'h4':
            if 'zorunlu dersler' in text:
                kind, term = 'required', None
            elif 'secmeli dersler' in text:
                kind, term = 'elective', None
        elif 'ciu-course-accordion__title' in node.get('class', []):
            term = next((i+1 for i, name in enumerate(terms) if text == name + ' donem'), None)
        else:
            label = node.select_one('.ciu-course-accordion__trigger-title')
            identifier = node.select_one('.ciu-course-accordion__code')
            if label and identifier:
                identifier = code(identifier.get_text(' ', strip=True).replace('Ders Kodu', '').strip())
                title = clean(label.get_text(' ', strip=True))
                if identifier and title and not re.search(r'seçmeli|elective', title, re.I):
                    courses.append({'code': identifier, 'name': title, 'semester': term, 'kind': kind})
    return merge_courses(courses)[0]


def parse_metu(soup):
    courses = []
    for term, table in enumerate(soup.select('table'), 1):
        if term > 12 or not table.select_one('tr.undergrad_curriculum'):
            continue
        # Each curriculum table is preceded by its actual Semester heading.
        heading = table.find_previous(string=re.compile(r'(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth) Semester'))
        names = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
        matched = next((i+1 for i, name in enumerate(names) if re.search(r'\b' + name + ' semester', str(heading).lower())), None)
        if not matched:
            continue
        term = matched
        optional = False
        for row in table.select('tr'):
            if 'Any 1 of the following set' in row.get_text():
                optional = True
            elif 'border-top:' in str(row) and not row.select('a'):
                optional = False
            identifier = row.select_one('td.short_course')
            title = row.select_one('td.course')
            if identifier and title and code(identifier.get_text()) and clean(title.get_text()):
                courses.append({'code': code(identifier.get_text()), 'name': clean(title.get_text()),
                                'semester': term, 'kind': 'elective' if optional else None})
    return merge_courses(courses)[0]


def main():
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    sources = read(CACHE / 'north-curricula.json')
    output, unmatched = {}, []
    for source in sources:
        if source['status'] != 200:
            continue
        uid = source['universityId']
        university = academic['universities'][uid]
        soup = BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')
        candidates = []
        if 'emu.edu.tr' in source['url']:
            courses = parse_emu(soup)
            for p in university['programs']:
                turkish = '(Türkçe)' in source['title']
                degree = 'associate' if 'Önlisans' in source['title'] else 'bachelor'
                if base_name(p['name']) == base_name(source['title']) and degree == p['degreeLevel'] and turkish == ('(İngilizce)' not in p['name']):
                    years = re.search(r'(\d) Yıl', source['title'])
                    if years and p.get('durationYears') != int(years.group(1)):
                        continue
                    candidates.append(p)
        elif 'ciu.edu.tr' in source['url']:
            courses = parse_ciu(soup)
            degree = 'associate' if '/onlisans/' in source['url'] else 'bachelor'
            candidates = [p for p in university['programs'] if base_name(p['name']) == base_name(source['title']) and p['degreeLevel'] == degree]
            if len(candidates) > 1:
                # Turkish and English variants have distinct official pages.
                is_turkish = 'turkce' in source['url'] or '(Türkçe)' in source['title']
                candidates = [p for p in candidates if ('(İngilizce)' not in p['name']) == is_turkish]
            if 'eczacilik' in source['url']:
                candidates = [p for p in candidates if p.get('durationYears') == (6 if 'pharmd' in source['url'] else 5)]
        elif 'catalog.metu.edu.tr' in source['url']:
            courses = parse_metu(soup)
            candidates = [p for p in university['programs'] if source['url'] in p.get('curriculumUrls', [])]
        else:
            continue
        if len(candidates) != 1 or len(courses) < 3:
            unmatched.append({'title': source['title'], 'url': source['url'], 'matches': len(candidates), 'courses': len(courses)})
            continue
        p = candidates[0]
        output[f"{uid}:{p['id']}"] = {'universityId': uid, 'programId': p['id'], 'programName': p['name'],
            'authority': 'Orta Doğu Teknik Üniversitesi — Kuzey Kıbrıs Kampüsü' if 'catalog.metu.edu.tr' in source['url'] else university['officialName'], 'sourceUrl': source['url'], 'verifiedAt': source['fetchedAt'][:10],
            'coverage': 'partial', 'sourceHash': source['sha256'], 'courses': courses}
    write(CACHE / 'north-course-candidates.json', output)
    write(CACHE / 'north-course-unmatched.json', unmatched)
    print('North candidates', len(output), 'courses', sum(len(p['courses']) for p in output.values()))
    from collections import Counter
    print(Counter(p['universityId'] for p in output.values()))


if __name__ == '__main__':
    main()
