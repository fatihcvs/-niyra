"""Collect GAU's official programme tabs and their semester course tables."""
import concurrent.futures
import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, fetch, read, write
from parse_cyprus_courses import clean, code, fold, merge_courses
from parse_cyprus_html import base_name


def soup(source):
    return BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser') if source['status'] == 200 else BeautifulSoup('', 'html.parser')


def name(value):
    return base_name(value).replace('makina muhendisligi', 'makine muhendisligi')


def main():
    uid = 'kktc-girne-amerikan-universitesi'
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][uid]
    root = 'https://www.gau.edu.tr/'
    home = soup(fetch(root))
    faculties = {urljoin(root, a['href']) for a in home.select('a[href]') if urlparse(urljoin(root, a['href'])).netloc == 'www.gau.edu.tr'
        and re.search(r'^/[^/]+(?:fakultesi|okulu)$', urlparse(a['href']).path)}
    tasks = {}
    indexes = list(faculties)
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for source in pool.map(fetch, faculties):
            indexes.extend(urljoin(source['url'], a['href']) for a in soup(source).select('a[href]')
                           if 'bolumler.html' in a['href'])
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for source in pool.map(fetch, sorted(set(indexes))):
            for link in soup(source).select('a[href]'):
                target = urljoin(source['url'], link['href'])
                matches = [p for p in university['programs'] if name(p['name']) == name(clean(link.get_text()))]
                if len(matches) > 1:
                    turkish = 'turkce' in fold(link.get_text())
                    matches = [p for p in matches if ('İngilizce' not in p['name']) == turkish]
                if len(matches) == 1 and target.startswith(root) and target != source['url']:
                    tasks[target] = matches[0]
    candidates, report = {}, []
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for source in pool.map(fetch, tasks):
            p = tasks[source['url']]
            document = soup(source)
            headings = [name(h.get_text()) for h in document.select('h1,h2,h3')]
            if name(p['name']) not in headings:
                report.append({'url': source['url'], 'program': p['name'], 'reason': 'heading-mismatch'})
                continue
            courses = []
            for link in document.select('a[href^="#semester"]'):
                label = clean(link.get_text())
                section = document.find(id=link['href'][1:])
                if not section:
                    continue
                match = re.search(r'(\d+)\.\s*Yarıyıl', label)
                term = int(match.group(1)) if match else None
                course_kind = 'elective' if 'secmeli' in fold(label) else None
                for row in section.select('tr'):
                    cells = [clean(c.get_text(' ', strip=True)) for c in row.find_all(['td','th'], recursive=False)]
                    if len(cells) >= 5 and code(cells[0]) and len(cells[1]) >= 2 and not re.search(r'elective|seçmeli', cells[1], re.I):
                        courses.append({'code': code(cells[0]), 'name': cells[1], 'semester': term, 'kind': course_kind})
            courses, conflicts = merge_courses(courses)
            report.append({'url': source['url'], 'program': p['name'], 'courses': len(courses), 'conflicts': conflicts})
            if len(courses) >= 3:
                candidates[f"{uid}:{p['id']}"] = {'universityId': uid, 'programId': p['id'], 'programName': p['name'],
                    'authority': university['officialName'], 'sourceUrl': source['url'], 'verifiedAt': source['fetchedAt'][:10],
                    'sourceHash': source['sha256'], 'coverage': 'partial', 'courses': courses}
    write(CACHE / 'gau-course-candidates.json', candidates)
    write(CACHE / 'gau-course-review.json', report)
    print('GAU', len(candidates), 'programmes', sum(len(p['courses']) for p in candidates.values()), 'courses')


if __name__ == '__main__':
    main()
