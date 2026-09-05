"""Collect Tarsus programme curricula from its public Bologna directory."""
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import match, normal
from collect_turkey_more_catalogs import erdogan_courses
from parse_cyprus_courses import clean

UID = 'tr-tarsus-universitesi'
ROOTS = [
    ('associate', 'https://bologna.tarsus.edu.tr/tr/programlar/5367'),
    ('bachelor', 'https://bologna.tarsus.edu.tr/tr/programlar/5368'),
]


def programme_items(doc, url, degree):
    output = []
    for anchor in doc.select('a[href*="programId="]'):
        group = anchor.find_parent('ul')
        unit_node = group.parent.find('a', recursive=False) if group and group.parent else None
        if unit_node is None:
            continue
        unit = clean(unit_node.get_text(' ', strip=True))
        if unit == 'REKTÖRLÜK':
            continue
        source_title = clean(anchor.get_text(' ', strip=True))
        title = re.sub(r'\s+PR$', '', source_title)
        pid = parse_qs(urlparse(anchor['href']).query).get('programId', [''])[0]
        if not pid.isdigit():
            continue
        target = url.split('?')[0] + '?programId=' + pid
        output.append({'title': title, 'sourceTitle': source_title, 'unit': unit,
                       'degree': degree, 'officialProgramId': pid,
                       'courseUrl': target, 'directoryUrl': url})
    return output


def current_plan_confirms(rows, title):
    active = [plan for plan in rows if plan.get('bolognaMufredatAktif')
              and plan.get('mufredatTuruTxt') == 'Ana Müfredat']
    return bool(active and normal(title) in normal(max(active, key=lambda plan: plan['ID']).get('mufredatAdi', '')))


def main():
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][UID]
    matched, unmatched = [], []
    for degree, url in ROOTS:
        for item in programme_items(soup(fetch(url)), url, degree):
            program = match(university, item)
            if not program:
                unmatched.append(item)
                continue
            # The two new directory labels ending in "PR" are accepted only
            # when the programme's own active main curriculum names the same
            # subject without that UI suffix.
            if item['sourceTitle'] != item['title']:
                plans = fetch('https://obsogrenci.tarsus.edu.tr/BLGNDersBilgiPaketi/GetMufredat',
                              {'programId': int(item['officialProgramId']), 'diller': 'tr'})
                if plans['status'] != 200:
                    unmatched.append(item)
                    continue
                if not current_plan_confirms(read(CACHE / plans['file']).get('Data', []), item['title']):
                    unmatched.append(item)
                    continue
                item['identityEvidenceUrl'] = item['courseUrl']
            matched.append({**item, 'universityId': UID, 'programId': program['id'], 'name': program['name']})
    ids = [item['programId'] for item in matched]
    if len(ids) != len(set(ids)):
        raise ValueError('Ambiguous Tarsus programme routes')
    directory = {'universityId': UID, 'matched': matched, 'unmatched': unmatched}
    write(CACHE / 'tarsus-directories.json', [directory])
    with ThreadPoolExecutor(4) as pool:
        courses = list(pool.map(erdogan_courses, matched))
    courses = [{**source, 'programs': [item]} for source, item in zip(courses, matched)]
    write(CACHE / 'tarsus-courses.json', courses)
    print('Tarsus:', len(matched), 'matched;', len(unmatched), 'unmatched;',
          sum(source['status'] == 200 for source in courses), 'course responses', flush=True)


if __name__ == '__main__':
    main()
