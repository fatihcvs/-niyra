"""Resolve CAU programme IDs from its public ECTS directory and import courses."""
import re
import concurrent.futures
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, fetch, read, write
from parse_cyprus_courses import clean, code, kind, merge_courses
from parse_cyprus_html import base_name

NAMES = {'PHYSIOTHERAPY AND REHABILITATION': 'Fizyoterapi ve Rehabilitasyon', 'NURSING': 'Hemşirelik',
    'LAW': 'Hukuk', 'COMPUTER ENGINEERING': 'Bilgisayar Mühendisliği',
    'ELECTRICAL AND ELECTRONICS ENGINEERING': 'Elektrik-Elektronik Mühendisliği',
    'MECHATRONICS ENGINEERING': 'Mekatronik Mühendisliği',
    'INTERIOR ARCHITECTURE & ENVIRONMENTAL DESIGN': 'İç Mimarlık ve Çevre Tasarımı',
    'GASTRONOMY AND CULINARY ARTS': 'Gastronomi ve Mutfak Sanatları',
    'CIVIL AVIATION CABIN SERVICES': 'Sivil Havacılık Kabin Hizmetleri',
    'TOURIST GUIDANCE': 'Turist Rehberliği', 'PHYSIOTHERAPY': 'Fizyoterapi', 'PHYSIOTERAPY': 'Fizyoterapi',
    'OPTICIANRY': 'Optisyenlik', 'FIRST AND EMERGENCY AID': 'İlk ve Acil Yardım', 'PSYCHOLOGY': 'Psikoloji'}


def main():
    uid = 'kktc-kibris-aydin-universitesi'
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][uid]
    tasks = {}
    for level, degree in [('L', 'bachelor'), ('OL', 'associate')]:
        index = f'https://ebs.cau.edu.tr/index.cau?Page=AB&Type={level}'
        source = fetch(index)
        if source['status'] != 200:
            continue
        soup = BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')
        for cell in soup.select('[onclick]'):
            match = re.search(r"getBolum\('(\d+)'", cell['onclick'])
            title = clean(cell.get_text(' ', strip=True))
            label = re.sub(r'^\d+\s*-\s*', '', re.sub(r'\s*\([^)]*\).*$', '', title))
            if not match or label not in NAMES:
                continue
            english = '(ENGLISH)' in title
            candidates = [p for p in university['programs'] if p['degreeLevel'] == degree
                and base_name(p['name']) == base_name(NAMES[label]) and ('İngilizce' in p['name']) == english]
            if len(candidates) == 1:
                url = f'https://ebs.cau.edu.tr/index.cau?Page=BolumDersleri&BK={match.group(1)}&DersTuru=0&ln=tr'
                tasks[url] = candidates[0]
    output, report = {}, []
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for source in pool.map(fetch, tasks):
            if source['status'] != 200:
                report.append(source)
                continue
            soup = BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')
            courses, term = [], None
            for row in soup.select('tr'):
                cells = [clean(c.get_text(' ', strip=True)) for c in row.find_all(['td', 'th'], recursive=False)]
                if len(cells) == 1 and len(cells[0]) < 140:
                    heading = re.search(r'(\d)\.\s*Year\s*(Fall|Spring)', cells[0])
                    if heading:
                        term = int(heading.group(1)) * 2 - (1 if heading.group(2) == 'Fall' else 0)
                if len(cells) == 8 and code(cells[2]) and len(cells[3]) >= 2 and kind(cells[4]):
                    courses.append({'code': code(cells[2]), 'name': cells[3], 'semester': term, 'kind': kind(cells[4])})
            courses, conflicts = merge_courses(courses)
            p = tasks[source['url']]
            report.append({'program': p['name'], 'sourceUrl': source['url'], 'courses': len(courses), 'conflicts': conflicts})
            if len(courses) >= 3:
                output[f"{uid}:{p['id']}"] = {'universityId': uid, 'programId': p['id'], 'programName': p['name'],
                    'authority': university['officialName'], 'sourceUrl': source['url'], 'verifiedAt': source['fetchedAt'][:10],
                    'sourceHash': source['sha256'], 'coverage': 'partial', 'courses': courses}
    write(CACHE / 'cau-course-candidates.json', output)
    write(CACHE / 'cau-course-review.json', report)
    print('CAU', len(output), 'programmes', sum(len(p['courses']) for p in output.values()), 'courses')


if __name__ == '__main__':
    main()
