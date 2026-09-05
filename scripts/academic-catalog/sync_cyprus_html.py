"""Collect official Cyprus curriculum pages using links published by providers."""
import concurrent.futures
import re
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from cyprus_research import CACHE, ROOT, fetch, read, write


def soup(source):
    if source['status'] != 200:
        return BeautifulSoup('', 'html.parser')
    return BeautifulSoup((CACHE / source['file']).read_bytes(), 'html.parser')


def collect():
    tasks = {}
    emu = 'https://www.emu.edu.tr/tr/programlar/695'
    for link in soup(fetch(emu)).select('a[href]'):
        url = urljoin(emu, link['href'])
        if '/programlar/' in url and re.search(r'/(?:[^/]+)-(?:lisans|onlisans)-programi', url) and 'yuksek-lisans' not in url:
            tasks[url.split('?')[0] + '?tab=curriculum'] = 'kktc-dogu-akdeniz-universitesi'
    root = 'https://prospective.ciu.edu.tr/tr/programlar'
    queue, seen = [root], set()
    while queue:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        for link in soup(fetch(url)).select('a[href]'):
            target = urljoin(root, link['href'])
            if target.startswith(root) and re.search(r'/programlar/(lisans|onlisans)/', target):
                tasks[target] = 'kktc-uluslararasi-kibris-universitesi'
            elif target.startswith(root + '?') and 'page=' in target and target not in seen:
                queue.append(target)
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    for uid, university in academic['universities'].items():
        if uid.startswith('kktc-'):
            for programme in university['programs']:
                for url in programme.get('curriculumUrls', []):
                    tasks[url] = uid
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, source in enumerate(pool.map(fetch, tasks), 1):
            doc = soup(source)
            title = doc.find('h1')
            results.append({**source, 'universityId': tasks[source['url']],
                            'title': title.get_text(' ', strip=True) if title else ''})
            if i % 20 == 0:
                print('Official HTML', i, '/', len(tasks), flush=True)
    write(CACHE / 'north-curricula.json', results)
    print('Official HTML complete', len(results), flush=True)


if __name__ == '__main__':
    collect()
