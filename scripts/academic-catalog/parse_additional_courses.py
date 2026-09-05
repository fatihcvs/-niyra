"""Reviewed Ada Kent, BAU Cyprus and ELU HTML curriculum formats.

Published column headings determine periods; course numbers never do. The
2026-27 Ada software plan is separate from its historical plan on the same page.
"""
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
from urllib.parse import urlparse
import json
import re
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, fetch, read, write
from parse_cyprus_courses import clean, code, fold, period, merge_courses


def parse_bau(soup, url, programme):
    # The page renders only year one initially. Its public Nuxt payload holds
    # the remaining year tabs as well as OTHER programmes: require exact slug.
    script = soup.select_one('script#__NUXT_DATA__')
    if not script:
        return []
    values = json.loads(script.get_text())
    slug = urlparse(url).path.rstrip('/').split('/')[-1]
    plans = []
    for node in values:
        if not isinstance(node, dict) or not all(k in node for k in ['slug', 'syllabus', 'degree_level', 'duration']):
            continue
        if values[node['slug']] != slug:
            continue
        degree = {'undergraduate': 'associate', 'bachelor': 'bachelor'}.get(values[node['degree_level']])
        if degree != programme['degreeLevel'] or int(values[node['duration']]) != programme['durationYears']:
            return []
        courses = []
        for ref in values[node['syllabus']]:
            item = {key: values[index] for key, index in values[ref].items()}
            identifier, title = code(item['course_code']), clean(item['course_name'])
            year, season = item['year'], item['semester']
            if not identifier or not title or not isinstance(year, int) or not 1 <= year <= 6 or season not in ['fall', 'spring']:
                continue
            courses.append({'code': identifier, 'name': title, 'semester': year * 2 - (season == 'fall'), 'kind': None})
        plans.append(merge_courses(courses)[0])
    if not plans or any(p != plans[0] for p in plans):
        return []
    return plans[0]


def parse_tables(soup, family):
    courses = []
    tables = [t for t in soup.select('table') if not t.find_parent('table')]
    if family == 'ada-software':
        tables = [t for t in tables if re.search(r'2026\s*-\s*2027', t.get_text())]
    for table in tables:
        heading = table.find_previous(['h2', 'h3', 'h4'])
        table_term, _ = period(heading.get_text(' ', strip=True)) if heading and family == 'bau' else (None, None)
        terms = []
        for row in table.select('tr'):
            if row.find_parent('table') is not table:
                continue
            cells = []
            for cell in row.find_all(['td', 'th'], recursive=False):
                cells.extend([clean(cell.get_text(' ', strip=True))] * int(cell.get('colspan', 1)))
            identifiers = [(i, code(cell)) for i, cell in enumerate(cells) if code(cell)]
            if not identifiers:
                explicit = [(i, period(cell)[0]) for i, cell in enumerate(cells) if period(cell)[0]]
                if explicit:
                    # The heading may be over the title cell or a whole half.
                    terms = list(dict.fromkeys(term for _, term in explicit))
                continue
            for order, (i, identifier) in enumerate(identifiers):
                if i + 1 >= len(cells):
                    continue
                title = cells[i + 1]
                if len(title) < 3 or len(title) > 200 or re.search(r'elective|seçmeli|course name', title, re.I):
                    continue
                term = table_term
                if len(terms) == len(identifiers):
                    term = terms[order]
                elif len(terms) == 1:
                    term = terms[0]
                # A short/missing right-hand row cannot borrow the left period.
                source_kind = None
                if family.startswith('ada') and i + 2 < len(cells):
                    source_kind = {'Z': 'required', 'S': 'elective'}.get(cells[i + 2])
                courses.append({'code': identifier, 'name': title, 'semester': term, 'kind': source_kind})
    return merge_courses(courses)[0]


def main():
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    tasks = [
        ('kktc-ada-kent-universitesi', 'program-osym-301410045', 'https://adakent.edu.tr/psikoloji-mufredat/', 'ada'),
        ('kktc-ada-kent-universitesi', 'program-osym-301410066', 'https://adakent.edu.tr/yazilim-mufredat/', 'ada-software'),
        ('kktc-ada-kent-universitesi', 'program-osym-301410035', 'https://adakent.edu.tr/dis-mufredat/', 'ada'),
        ('kktc-avrupa-liderlik-universitesi', 'program-elu-computer-engineering', 'https://elu.edu.tr/program/computer-engineering.html', 'elu'),
    ]
    source = fetch('https://www.baucyprus.edu.tr/academics/architecture-and-engineering-faculty')
    soup = BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')
    mapping = {'Computer Engineering': '301710070', 'Software Engineering': '301710021',
        'Architecture': '301710014', 'Management Information Systems': '301710056',
        'Psychology': '301710012', 'Financial Technology': '301700129',
        'Political Science and International Relations': '301710010', 'Computer Programming': '301700101',
        'Business Administration': '301710011', 'Gastronomy and Culinary Arts': '301710042',
        'Robotics and Artificial Intelligence': '301700115'}
    for link in soup.select('a[href]'):
        label = clean(link.get_text(' ', strip=True))
        if label in mapping and '/programs/' in link['href']:
            tasks.append(('kktc-bahcesehir-kibris-universitesi', 'program-osym-' + mapping[label], urljoin(source['url'], link['href']), 'bau'))
    tasks = list(dict.fromkeys(tasks))
    output, report = {}, []
    with ThreadPoolExecutor(max_workers=3) as pool:
        for task, source in zip(tasks, pool.map(fetch, [t[2] for t in tasks])):
            uid, pid, url, family = task
            university = academic['universities'][uid]
            programme = next(p for p in university['programs'] if p['id'] == pid)
            courses = []
            if source['status'] == 200:
                soup = BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')
                courses = parse_bau(soup, url, programme) if family == 'bau' else parse_tables(soup, family)
            report.append({'url': url, 'status': source['status'], 'courses': len(courses)})
            if len(courses) < 3:
                continue
            output[f'{uid}:{pid}'] = {'universityId': uid, 'programId': pid, 'programName': programme['name'],
                'sourceUrl': url, 'authority': university['officialName'], 'verifiedAt': source['fetchedAt'][:10],
                'sourceHash': source['sha256'], 'coverage': 'partial', 'courses': courses}
    write(CACHE / 'additional-course-candidates.json', output)
    write(CACHE / 'additional-course-review.json', report)
    print('Additional', len(output), 'programmes', sum(len(p['courses']) for p in output.values()), 'courses')


if __name__ == '__main__':
    main()
