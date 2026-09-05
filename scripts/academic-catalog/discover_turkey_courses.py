"""Follow published official catalogue directories; match exact programme identities."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
from urllib.parse import parse_qs, urljoin, urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write, collect_program_pages
from parse_cyprus_courses import clean, fold


def links(doc, base):
    result = {}
    for a in doc.select('a'):
        href = a.get('href', '')
        if href and not href.startswith(('#', 'javascript:')):
            result[urljoin(base, href)] = clean(a.get_text(' ', strip=True))
        for href in re.findall(r"['\"]([^'\"]+\.aspx\?[^'\"]*)['\"]", a.get('onclick', '')):
            result[urljoin(base, href)] = clean(a.get_text(' ', strip=True))
    return result


def normal(value):
    value = fold(value)
    value = re.sub(r'\bm\.?\s*y\.?\s*o\.?\b', 'meslek yuksekokul', value)
    value = re.sub(r'\bo\.?\s*s\.?\s*b\.?\b', 'organize sanayi bolgesi', value)
    value = re.sub(r'\(\s*\d+\s*\)', '', value)
    value = re.sub(r'\b(programi|program|bolumu|bolum|pr\.|prog\.)\b', '', value)
    value = re.sub(r'\b(?:pr|prog)\.(?=\s|$)', '', value)
    value = re.sub(r'\bdekanligi\b', '', value)
    value = re.sub(r'\s+(?:on\s*lisans|lisans)\s*$', '', value)
    value = re.sub(r'\b(fakultesi|fakulte)\b', 'fakulte', value)
    value = re.sub(r'\b(yuksekokulu|yuksekokul)\b', 'yuksekokul', value)
    value = re.sub(r'\bve\b', ' ', value)
    return re.sub(r'[^a-z0-9]+', ' ', value).strip()


def match(university, item):
    # Keep language, evening/remote teaching and joint-programme qualifiers.
    name = normal(item['title'])
    units = {u['id']: normal(u['name']) for u in university['units']}
    candidates = [p for p in university['programs']
        if p['degreeLevel'] == item['degree'] and normal(p['name']) == name]
    if item.get('unit'):
        unit = normal(item['unit'])
        exact = [p for p in candidates if units.get(p['unitId']) == unit]
        if exact:
            candidates = exact
        else:
            return None
    return candidates[0] if len(candidates) == 1 else None


def directory(doc, source, uid):
    url = source.get('finalUrl', source['url'])
    items = []
    if 'unitSelection.aspx' in url:
        degree = {'lis': 'bachelor', 'myo': 'associate'}.get(parse_qs(urlparse(url).query).get('type', [''])[0])
        if not degree:
            return []
        for a in doc.select('a[href*="curSunit="]'):
            heading = a.find_previous(class_=re.compile('card-header|panel-heading'))
            if heading is None:
                heading = a.find_previous(['h2', 'h3', 'h4', 'h5', 'strong'])
            items.append({'universityId': uid, 'title': clean(a.get_text()), 'unit': clean(heading.get_text()) if heading else None,
                'degree': degree, 'url': urljoin(url, a['href']), 'directoryUrl': url, 'family': 'oibs'})
    elif '/akademik/tip/' in url:
        degree = 'associate' if '/tip/OL/' in url else 'bachelor' if '/tip/L/' in url else None
        if not degree:
            return []
        for a in doc.select('a[href*="/program_kodu/"]'):
            heading = a.find_previous('tr', class_=lambda c: c and c != 'rows')
            unit = clean(heading.get_text()) if heading else None
            items.append({'universityId': uid, 'title': clean(a.get_text()), 'unit': unit,
                'degree': degree, 'url': urljoin(url, a['href']), 'directoryUrl': url, 'family': 'eobs'})
    return items


def discover_university(home, university):
    uid = home['programs'][0]['universityId']
    seen, results, pages = set(), [], []
    pattern = re.compile(r'bologna|bilgi.?paket|ders.?katalog|course.?catalog|eğitim.?bilgi|(?<![a-z])akts|(?<![a-z])ects|/ebp/|/ebs/', re.I)
    queue = [(url, 0) for url, title in home.get('catalogLinks', []) if pattern.search(url + ' ' + title)]
    for p in university['programs']:
        for url in p.get('curriculumUrls', []):
            if '/oibs/bologna/' in url:
                queue.append((url.split('/oibs/bologna/')[0] + '/oibs/bologna/index.aspx', 0))
                break
        if queue and '/oibs/' in queue[-1][0]: break
    while queue:
        url, depth = queue.pop(0)
        if re.search(r'/oibs/bologna/?$', url, re.I):
            url = url.rstrip('/') + '/index.aspx'
        if re.search(r'/ln/en\b|[?&]lang=en\b|/print/|/pdf/', url):
            continue
        if url in seen or not url.startswith(('http://', 'https://')):
            continue
        seen.add(url)
        if len(seen) > 24: break
        source = fetch(url)
        pages.append(source)
        if source['status'] != 200: continue
        doc = soup(source)
        items = directory(doc, source, uid)
        if items:
            results.extend(items)
            continue
        if depth >= 2: continue
        for target, title in links(doc, source.get('finalUrl', url)).items():
            if ('unitSelection.aspx' in target and re.search(r'type=(lis|myo)\b', target)) or re.search(r'/akademik/tip/(OL|L)/', target):
                queue.insert(0, (target, depth+1))
            elif depth == 0 and '/oibs/bologna/' not in url and pattern.search(target + ' ' + title) and not re.search(r'koordinator|komisyon|committee|/haber|/duyuru|/event', target, re.I):
                queue.append((target, depth+1))
    matched, missing, templates = [], [], {}
    for item in {r['url']: r for r in results}.values():
        p = match(university, item)
        if not p:
            missing.append(item)
            continue
        family = item['family']
        template = templates.get(family)
        if not template:
            source = fetch(item['url'])
            page_links = links(soup(source), source.get('finalUrl', item['url']))
            choices = [u for u in page_links if ('progCourses.aspx' in u if family == 'oibs' else '/ogrenimprogrami/program_kodu/' in u)]
            if not choices: continue
            template = templates[family] = choices[0]
        if family == 'oibs':
            identifier = parse_qs(urlparse(item['url']).query)['curSunit'][0]
            target = re.sub(r'curSunit=[^&]+', 'curSunit=' + identifier, template)
        else:
            identifier = re.search(r'/program_kodu/([^/]+)', item['url'])[1]
            target = re.sub(r'/program_kodu/[^/]+', '/program_kodu/' + identifier, template)
            target = re.sub(r'/tip/[^/]+', '/tip/' + ('OL' if item['degree'] == 'associate' else 'L'), target)
        matched.append({**item, 'programId': p['id'], 'name': p['name'], 'courseUrl': target, 'routeWitness': template})
    # Multiple official departments must not be silently merged into one programme.
    counts = {}
    for m in matched: counts[m['programId']] = counts.get(m['programId'], 0) + 1
    return {'universityId': uid, 'pages': pages, 'matched': [m for m in matched if counts[m['programId']] == 1],
        'unmatched': missing, 'ambiguous': [m for m in matched if counts[m['programId']] > 1]}


def main():
    academic = read(ROOT / 'data/academic-catalog-2026.json')['universities']
    results = []
    with ThreadPoolExecutor(12) as pool:
        futures = {pool.submit(discover_university, h, academic[h['programs'][0]['universityId']]): h for h in read(CACHE / 'homepages.json')}
        for f in as_completed(futures):
            try: results.append(f.result())
            except Exception as e:
                results.append({'universityId': futures[f]['programs'][0]['universityId'], 'error': str(e), 'matched': []})
            write(CACHE / 'discovery.json', results)
            print(len(results), '/', len(futures), 'universities;', sum(len(r['matched']) for r in results), 'matches', flush=True)
    collect_program_pages(results, 'discovered-courses')


if __name__ == '__main__': main()
