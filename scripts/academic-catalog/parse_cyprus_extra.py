"""Import additional reviewed Cyprus HTML/PDF curriculum formats."""
import concurrent.futures
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, fetch, read, write
from extract_cyprus_tables import extract
from parse_cyprus_courses import code, clean, fold, kind, period, merge_courses, parse_document


def doc(source):
    return BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')


def parse_itu(soup):
    courses = []
    for table in soup.select('table'):
        match = re.search(r'(\d+)\.\s*Yarıyıl', table.get_text(' ', strip=True))
        if not match:
            continue
        term = int(match.group(1))
        for row in table.select('tr'):
            cells = [clean(c.get_text(' ', strip=True)) for c in row.select('td')]
            if len(cells) >= 9 and code(cells[0]) and cells[1] and cells[3] in ['Z', 'S']:
                courses.append({'code': code(cells[0]), 'name': cells[1], 'semester': term,
                                'kind': 'required' if cells[3] == 'Z' else 'elective'})
    return merge_courses(courses)[0]


def parse_arucad(soup):
    courses, highest = [], 0
    for row in soup.select('table tr'):
        cells = [clean(c.get_text(' ', strip=True)) for c in row.find_all(['td', 'th'], recursive=False)]
        if len(cells) >= 10 and cells[1].isdigit() and code(cells[2]) and cells[3]:
            term = int(cells[1])
            if term < highest:
                break  # The next historical curriculum is a separate plan.
            highest = max(highest, term)
            if not re.search(r'seçmeli|elective', cells[3], re.I):
                courses.append({'code': code(cells[2]), 'name': cells[3], 'semester': term, 'kind': None})
    return merge_courses(courses)[0]


def pdf_courses(source, family):
    extract(source)
    document = read(CACHE / (source['file'] + '.tables.json'))
    if document.get('error'):
        return []
    courses, _ = parse_document(document)
    if family == 'eul-page':
        # Handbooks also publish a linear curriculum with an explicit year,
        # season and type. Course descriptions do not match this row grammar.
        year, term = None, None
        extra = []
        for page in document['pages']:
            for line in page['text'].splitlines():
                year_match = re.fullmatch(r'(\d)\.\s*Sınıf', line.strip())
                if year_match:
                    year = int(year_match.group(1)); term = None
                if year and 'Güz Dönemi' in line:
                    term = year * 2 - 1
                if year and 'Bahar Dönemi' in line:
                    term = year * 2
                match = re.match(r'^([A-ZİŞĞÜÖÇ]{2,10}\d{2,4})\s*[–-]\s*(.+?)\s*\([\d., ]+\).*?(Zorunlu|Seçmeli)', line)
                if match and term:
                    extra.append({'code': match.group(1), 'name': match.group(2), 'semester': term,
                                  'kind': kind(match.group(3)), 'sourcePage': page['page']})
        if len(extra) > len(courses):
            courses = merge_courses(extra)[0]
    return courses


def process(record):
    if record['status'] != 200:
        return {'record': record, 'courses': [], 'reason': 'fetch-failed'}
    family, source = record['parser'], record
    if family == 'final-page' and ('ingilizce' in source['url']) != ('İngilizce' in record['program']['name']):
        return {'record': record, 'courses': [], 'reason': 'language-variant-mismatch'}
    soup = None if family == 'kyrenia-pdf' else doc(source)
    if family == 'itu':
        courses = parse_itu(soup)
    elif family == 'arucad':
        courses = parse_arucad(soup)
    elif family == 'kyrenia-pdf':
        courses = pdf_courses(source, family)
    elif family in ['eul-page', 'final-page']:
        if family == 'final-page':
            links = [a for a in soup.select('a[href]') if 'mufredat-ve-ders-katalogu' in a['href']]
            if links:
                # Links on this programme page are authoritative navigation.
                target = urljoin(source['url'], links[0]['href'])
                source = fetch(target)
                if source['status'] != 200:
                    return {'record': record, 'source': source, 'courses': [], 'reason': 'curriculum-page-failed'}
                soup = doc(source)
        links = [a for a in soup.select('a[href]') if '.pdf' in a['href'].lower()
                 and re.search(r'program el kitab|müfredat|curriculum|ders katalog', a.get_text(' ', strip=True), re.I)]
        if not links:
            return {'record': record, 'courses': [], 'reason': 'no-curriculum-pdf'}
        links.sort(key=lambda a: bool(re.search(r'öncesi|before', a.get_text(), re.I)))
        source = fetch(urljoin(source['url'], links[0]['href']))
        if source['status'] != 200:
            return {'record': record, 'source': source, 'courses': [], 'reason': 'pdf-fetch-failed'}
        courses = pdf_courses(source, family)
    else:
        courses = []
    return {'record': record, 'source': source, 'courses': courses}


def main():
    records = read(CACHE / 'extra-curricula.json')
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    candidates, report = {}, []
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for i, result in enumerate(pool.map(process, records), 1):
            record, courses = result['record'], result['courses']
            source = result.get('source', record)
            uid, p = record['universityId'], record['program']
            report.append({'universityId': uid, 'programId': p['id'], 'programName': p['name'],
                'sourceUrl': source['url'], 'sourceFile': source['file'], 'parser': record['parser'],
                'courses': len(courses), 'reason': result.get('reason')})
            if len(courses) >= 3:
                key = f"{uid}:{p['id']}"
                candidate = {'universityId': uid, 'programId': p['id'], 'programName': p['name'],
                    'authority': academic['universities'][uid]['officialName'], 'sourceUrl': source['url'],
                    'verifiedAt': source['fetchedAt'][:10], 'sourceHash': source['sha256'], 'coverage': 'partial', 'courses': courses}
                existing = candidates.get(key)
                if not existing or len(courses) > len(existing['courses']) or '2024-2025' in record['indexUrl']:
                    candidates[key] = candidate
            if i % 20 == 0:
                print('Extra parsed', i, '/', len(records), 'programs', len(candidates), flush=True)
    write(CACHE / 'extra-course-candidates.json', candidates)
    write(CACHE / 'extra-course-review.json', report)
    print('Extra candidates', len(candidates), 'courses', sum(len(p['courses']) for p in candidates.values()), flush=True)


if __name__ == '__main__':
    main()
