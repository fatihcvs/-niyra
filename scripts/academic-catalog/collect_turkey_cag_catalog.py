"""Use Çağ's published faculty menus to retain programme and degree identity."""
import re
from urllib.parse import urljoin
from turkey_research import CACHE, ROOT, fetch, read, write, soup
from discover_turkey_courses import normal, match
from parse_cyprus_courses import clean, fold

UID = 'tr-cag-universitesi'
DIRECTORY = 'https://www.cag.edu.tr/tr/hizmetler-bilgi-paketi'
POLICY = 'https://www.cag.edu.tr/tr/adaylara-bilgi-sikca-sorulan-sorular'


def entries(doc, url):
    heading = doc.select_one('.page-lead-header h1')
    if not heading:
        return []
    unit = clean(heading.get_text(' ', strip=True))
    if 'enstitu' in fold(unit) or 'yabanci diller' in fold(unit):
        return []
    degree = 'associate' if 'meslek yuksekokul' in fold(unit) else 'bachelor'
    output = []
    menu = doc.select_one('#sidemenu')
    if not menu:
        return output
    groups = [(li.find('a', recursive=False), li.find('ul', recursive=False))
              for li in menu.find_all('li', recursive=False)]
    if normal(unit) == 'hukuk fakulte':
        groups.append((None, menu))
    for label, group in groups:
        if group is None:
            continue
        children = [li.find('a', href=True, recursive=False) for li in group.find_all('li', recursive=False)]
        children = [a for a in children if a]
        plan = next((a for a in children if clean(a.get_text()) == 'Ders Planı'), None)
        profile = next((a for a in children if clean(a.get_text()) in ['Program Tanımı', 'Program Tanıtımı']), None)
        if plan is None or profile is None:
            continue
        title = clean(label.get_text(' ', strip=True)) if label else 'Hukuk'
        title = re.sub(r'\s*\(\s*IACBE Akreditasyonu\s*-\s*TYÇ\)$', '', title)
        output.append({'title': title, 'unit': unit, 'degree': degree,
                       'directoryUrl': url, 'profileUrl': urljoin(url, profile['href']),
                       'courseUrl': urljoin(url, plan['href'])})
    return output


def main():
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][UID]
    root = fetch(DIRECTORY)
    doc = soup(root)
    link = doc.find('a', href=re.compile('hukuk-program-tanimi-2'))
    if link is None:
        raise ValueError('Official programme directory table is unavailable')
    urls = {urljoin(DIRECTORY, a['href']).split('#')[0]
            for row in link.find_parent('table').select('tr')
            for cell in row.find_all('td', recursive=False)[:2]
            for a in cell.select('a[href]')}
    items = {}
    for url in sorted(urls):
        for item in entries(soup(fetch(url)), url):
            items[item['courseUrl']] = item
    policy = fetch(POLICY)
    language_list = next((fold(p.get_text(' ', strip=True)) for p in soup(policy).select('.faq-answer')
                          if 'egitim dili ingilizce olan bolumler' in fold(p.get_text())), '')
    matched, unmatched, courses = [], [], []
    for item in items.values():
        profile = fetch(item['profileUrl'])
        language = None
        for row in soup(profile).select('tr'):
            cells = row.find_all(['td', 'th'], recursive=False)
            if len(cells) == 2 and fold(cells[0].get_text()) in ['program dili', 'programin dili']:
                language = fold(cells[1].get_text(' ', strip=True))
        reference = dict(item)
        if item['degree'] == 'bachelor' and '(ingilizce)' not in fold(item['title']):
            if language == 'ingilizce' or (fold(item['title']) in language_list
                    and item['title'] not in ['Hukuk', 'İngilizce Mütercim ve Tercümanlık']):
                reference['title'] += ' (İngilizce)'
                reference['identityEvidenceUrl'] = item['profileUrl'] if language == 'ingilizce' else POLICY
        program = match(university, reference)
        if not program:
            unmatched.append(reference)
            continue
        reference.update(universityId=UID, programId=program['id'], name=program['name'])
        source = fetch(item['courseUrl'])
        matched.append(reference)
        courses.append({**source, 'family': 'cag', 'programs': [reference],
                        'selection': {'method': 'official-faculty-programme-menu',
                                      'profileUrl': item['profileUrl'], 'programTitle': item['title']}})
    write(CACHE / 'cag-courses.json', courses)
    write(CACHE / 'cag-directories.json', [{'universityId': UID, 'source': root,
                                         'matched': matched, 'unmatched': unmatched}])
    print('Çağ:', len(matched), 'matched programmes;', len(unmatched), 'unmatched', flush=True)
    print('Matched:', [m['name'] for m in matched], flush=True)


if __name__ == '__main__':
    main()
