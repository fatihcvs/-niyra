"""Validate researched programme/course identities and build local catalogues.

This command does not push or deploy. Fetch/extract/parse commands must run first.
"""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlparse
from cyprus_research import CACHE, ROOT, read, write


def build():
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    catalog = read(ROOT / 'data/official-course-catalog-2026.json')
    # Rebuild this region from the current reviewed candidates. A source that
    # later fails validation must not survive from an earlier generated file.
    catalog['programs'] = {key: value for key, value in catalog['programs'].items()
        if academic['universities'].get(value['universityId'], {}).get('region')
        not in ['Kuzey Kıbrıs', 'Kıbrıs Cumhuriyeti']}
    candidates = {}
    for name in ['cyqaa', 'north', 'extra', 'cau', 'gau', 'additional', 'neu']:
        file = CACHE / f'{name}-course-candidates.json'
        if not file.exists() and name != 'neu':
            raise FileNotFoundError(f'Research/parser output is missing: {file.name}; refusing to publish an incomplete build')
        if file.exists():
            candidates.update(read(file))
    rejected = []
    for key, record in candidates.items():
        university = academic['universities'].get(record['universityId'])
        assert university and university['region'] in ['Kuzey Kıbrıs', 'Kıbrıs Cumhuriyeti'], key
        programme = next((p for p in university['programs'] if p['id'] == record['programId']), None)
        assert programme and programme['name'] == record['programName'], key
        assert key == f"{record['universityId']}:{record['programId']}", key
        assert urlparse(record['sourceUrl']).scheme == 'https', key
        assert re.fullmatch(r'\d{4}-\d{2}-\d{2}', record['verifiedAt']), key
        assert re.fullmatch(r'[a-f0-9]{64}', record['sourceHash']), key
        courses, seen = [], set()
        for course in record['courses']:
            reason = None
            if not 2 <= len(course['code']) <= 20 or not 2 <= len(course['name']) <= 200:
                reason = 'field-length'
            if course['semester'] is not None and not 1 <= course['semester'] <= 12:
                reason = 'invalid-semester'
            if course['kind'] not in ['required', 'elective', None]:
                reason = 'invalid-kind'
            code = course['code'].replace('i', 'İ').upper().replace(' ', '')
            if code in seen:
                reason = 'duplicate-code'
            if reason:
                rejected.append({'program': key, 'code': course['code'], 'reason': reason})
                continue
            seen.add(code)
            courses.append(course)
        if len(courses) < 3:
            continue
        catalog['programs'][key] = {**record, 'courses': courses}
        programme['curriculumUrls'] = list(dict.fromkeys([record['sourceUrl'], *programme.get('curriculumUrls', [])]))
        programme['curriculumAuthority'] = record['authority']
    today = datetime.now(timezone.utc).date().isoformat()
    all_programmes = list(catalog['programs'].values())
    catalog['meta'].update(version='2026.09.05.1', updatedAt=max(p['verifiedAt'] for p in all_programmes),
        method='Official institution curriculum pages and CYQAA course-distribution PDFs matched to exact programme IDs. Source checksums and PDF pages are retained. Alternative plans are not merged into a single mandatory curriculum.',
        limitations='Only source-backed course rows are listed. Unknown semesters or course types are null. Programmes with partial coverage retain manual entry; alternative tracks and unreadable or uncoded elective slots may be omitted.',
        stats={'programCount': len(all_programmes), 'courseCount': sum(len(p['courses']) for p in all_programmes),
               'universityCount': len({p['universityId'] for p in all_programmes}),
               'partialProgramCount': sum(p.get('coverage') == 'partial' for p in all_programmes),
               'totalAcademicProgramCount': academic['meta']['stats']['programCount']})
    academic['meta']['version'] = '2026.20'
    academic['meta']['updatedAt'] = today
    academic['meta']['stats']['curriculumLinkCount'] = sum(bool(p.get('curriculumUrls')) for u in academic['universities'].values() for p in u['programs'])
    write(ROOT / 'data/official-course-catalog-2026.json', catalog)
    file = ROOT / 'data/academic-catalog-2026.json'
    temp = file.with_suffix('.json.tmp')
    temp.write_text(json.dumps(academic, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    temp.replace(file)
    places = read(ROOT / 'data/cyprus-campus-places-2026.json')
    geo = {r['universityId']: r for r in places['coverage']}
    coverage = []
    for uid, university in academic['universities'].items():
        if university['region'] not in ['Kuzey Kıbrıs', 'Kıbrıs Cumhuriyeti']:
            continue
        programmes = []
        for p in university['programs']:
            structured = catalog['programs'].get(f"{uid}:{p['id']}")
            programmes.append({'programId': p['id'], 'name': p['name'],
                'status': 'partial' if structured else 'source-linked' if p.get('curriculumUrls') else 'source-needed',
                'courseCount': len(structured['courses']) if structured else 0,
                'sourceUrl': structured['sourceUrl'] if structured else next(iter(p.get('curriculumUrls', [])), None)})
        coverage.append({'universityId': uid, 'name': university['officialName'], 'programCount': len(programmes),
            'structuredProgramCount': sum(p['courseCount'] > 0 for p in programmes),
            'courseCount': sum(p['courseCount'] for p in programmes),
            'nearbyPlaceCount': geo.get(uid, {}).get('nearbyPlaces', 0),
            'nearbyAreaCount': geo.get(uid, {}).get('nearbyAreas', 0), 'programs': programmes})
    write(ROOT / 'data/cyprus-catalog-coverage-2026.json', {'checkedAt': today, 'universities': coverage})
    write(CACHE / 'publication-rejections.json', rejected)
    print(json.dumps(catalog['meta']['stats']))
    print('Cyprus', sum(u['structuredProgramCount'] for u in coverage), 'of', sum(u['programCount'] for u in coverage), 'programmes with course rows; rejected rows', len(rejected))


if __name__ == '__main__':
    build()
