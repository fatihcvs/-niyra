"""Resolve additional official programme pages and their published curricula."""
import concurrent.futures
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, fetch, read, write
from parse_cyprus_html import base_name
from parse_cyprus_courses import clean

academic = read(ROOT / 'data/academic-catalog-2026.json')


def document(url):
    source = fetch(url)
    return source, BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser') if source['status'] == 200 else BeautifulSoup('', 'html.parser')


def programmes(uid, label):
    label = re.sub(r'\s*\*+$', '', label)
    return [p for p in academic['universities'][uid]['programs'] if base_name(p['name']) == base_name(label)]


def main():
    tasks, records = {}, []
    urls = read(ROOT / 'scripts/academic-catalog/cyprus-source-index.json')['indexUrls']
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        indexes = list(pool.map(fetch, urls))
    for source in indexes:
        url = source['url']
        if source['status'] != 200:
            continue
        soup = BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')
        source['links'] = {urljoin(url, link['href']): clean(link.get_text()) for link in soup.select('a[href]')}
        if 'kktc.itu.edu' in url:
            uid = 'kktc-itu-kktc-egitim-arastirma-yerleskeleri'
            for link in soup.select('a[href]'):
                if 'DersPlanDetay/' in link['href']:
                    heading = link.find_previous(['h2', 'h3', 'h4'])
                    matches = programmes(uid, clean(heading.get_text()))
                    if len(matches) == 1:
                        tasks[link['href']] = (uid, matches[0], 'itu', url)
        elif 'arucad.edu' in url:
            uid = 'kktc-arkin-yaratici-sanatlar-ve-tasarim-universitesi'
            faculties = {a['href'] for a in soup.select('a[href]') if '/rt-faculty/' in a['href'] and '/en/' not in a['href']}
            for faculty in faculties:
                _, doc = document(faculty)
                for link in doc.select('a[href]'):
                    if '/rt-program/' in link['href'] and '/en/' not in link['href']:
                        matches = programmes(uid, clean(link.get_text()))
                        if len(matches) == 1:
                            tasks[link['href']] = (uid, matches[0], 'arucad', faculty)
        elif 'final.edu' in url:
            uid = 'kktc-uluslararasi-final-universitesi'
            for target, label in source['links'].items():
                if '/i-2-programlar/b-' in target:
                    matches = programmes(uid, label)
                    if len(matches) > 1:
                        matches = [p for p in matches if ('İngilizce' in p['name']) == ('İngilizce' in label)]
                    if len(matches) == 1:
                        tasks[target] = (uid, matches[0], 'final-page', url)
        elif 'cau.edu' in url:
            uid = 'kktc-kibris-aydin-universitesi'
            for link in soup.select('a[href]'):
                target = urljoin(url, link['href'])
                matches = programmes(uid, clean(link.get_text()))
                if len(matches) == 1 and target.startswith('https://cau.edu.tr/'):
                    tasks[target] = (uid, matches[0], 'cau-page', url)
        elif 'kyrenia.edu' in url:
            uid = 'kktc-girne-universitesi'
            old = 'https://kyrenia.edu.tr/akademik/mufredatlar/2023-2024-akademik-yili-ve-oncesi-mufredatlar/'
            for index in [old, url]:
                _, doc = document(index)
                for row in doc.select('tr'):
                    cells = [clean(c.get_text()) for c in row.select('td')]
                    if len(cells) < 6:
                        continue
                    matches = programmes(uid, cells[2])
                    matches = [p for p in matches if ('İngilizce' in p['name']) == ('İngilizce' in cells[4])]
                    if len(matches) != 1:
                        continue
                    for link in row.select('a[href]'):
                        if '.pdf' in link['href'].lower():
                            tasks[urljoin(index, link['href'])] = (uid, matches[0], 'kyrenia-pdf', index)
        elif 'eul.edu' in url:
            uid = 'kktc-lefke-avrupa-universitesi'
            faculties = {u for u in source['links'] if '/tr/akademik/' in u}
            for faculty in faculties:
                _, doc = document(faculty)
                for link in doc.select('a[href]'):
                    target = urljoin(faculty, link['href'])
                    label = clean(link.get_text())
                    matches = programmes(uid, label)
                    if len(matches) == 1 and '/tr/akademik/' in target:
                        tasks[target] = (uid, matches[0], 'eul-page', faculty)
    write(CACHE / 'extra-curriculum-tasks.json', [{ 'url': url, 'universityId': uid, 'program': p,
        'parser': parser, 'indexUrl': index } for url, (uid, p, parser, index) in tasks.items()])
    with concurrent.futures.ThreadPoolExecutor(3) as pool:
        for i, source in enumerate(pool.map(fetch, tasks), 1):
            uid, p, parser, index = tasks[source['url']]
            records.append({**source, 'universityId': uid, 'program': p, 'parser': parser, 'indexUrl': index})
            if i % 20 == 0:
                print('Additional curricula', i, '/', len(tasks), flush=True)
    write(CACHE / 'extra-curricula.json', records)
    print('Additional curricula complete', len(records), flush=True)


if __name__ == '__main__':
    main()
