"""Read the same public Bologna JSON requests issued by university UBYS pages."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from itertools import zip_longest
import re
from urllib.parse import urljoin, urlencode
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import match, normal


def discover(uid, url, university):
    home = fetch(url)
    button = soup(home).select_one('#btn-unit')
    # Parameters must be explicitly published by this anonymous catalogue page.
    if not button or button.get('data-dont-use-privilage') != 'True':
        return {'universityId': uid, 'source': home, 'matched': [], 'error': 'public-directory-unavailable'}
    criteria = {'DontUsePrivilage': True}
    for attr, key in [('data-get-only-active-for-bologna', 'GetOnlyActiveForBologna'), ('data-show-only-unit-single-program', 'ShowOnlyUnitSingleProgram')]:
        if button.get(attr) == 'True': criteria[key] = True
    source = fetch(urljoin(url, '/AIS/Common/Helper/GetUnitProgramDataSource'), {'criter': criteria}, retry_failed=True)
    if source['status'] != 200:
        return {'universityId': uid, 'source': source, 'matched': []}
    data = read(CACHE / source['file'])
    units = {r['Id']: r for r in data if not r['IsAcademicProgram']}
    matched = []
    for r in data:
        degree = {10601: 'associate', 10602: 'bachelor'}.get(r.get('EducationQualificatinDegree'))
        if not r['IsAcademicProgram'] or not degree or r.get('Status') != 10201: continue
        # Programme-type 10501 is the ordinary primary programme. Other types
        # remain unresolved until their exact public labels can be matched.
        if r.get('ProgramType') != 10501: continue
        parent, visited = units.get(r['ParentId']), set()
        program_parent = parent
        unit = None
        while parent and parent['Id'] not in visited:
            visited.add(parent['Id'])
            if any(s in normal(parent['Name']) for s in ['fakulte', 'yuksekokul', 'konservatuvar']):
                unit = parent['Name']; break
            parent = units.get(parent.get('ParentId'))
        title=r['Name'];evidence=None
        if uid=='tr-izmir-katip-celebi-universitesi' and re.match(r'^(?:Ön\s*)?Lisans(?:\s*\(|$)',title,re.I):
            # This public tree names the degree at the leaf and the subject at
            # its parent. Preserve 100% language and MTOK track annotations.
            annotations=re.findall(r'\(([^)]+)\)',title)
            title=re.sub(r'\s+(?:Bölümü|Fakültesi)$','',program_parent['Name']) if program_parent else ''
            for annotation in annotations:
                label=normal(annotation)
                if label in ['100 ingilizce']:title+=' (İngilizce)'
                elif label in ['m t o k','mtok']:title+=' (M.T.O.K.)'
                elif label not in ['turkce','30 ingilizce','30 arapca']:title+=' ('+annotation+')'
            title=title.replace('Orman Endüstri Mühendisliği','Orman Endüstrisi Mühendisliği')
        if uid=='tr-canakkale-onsekiz-mart-universitesi':
            title=re.sub(r'\s*\(NÖ\)|--(?:Ön\s*)?Lisans\s*-\s*Normal Öğretim\s*$','',title)
            labelled=re.match(r'^(?:Ön\s*)?Lisans\s*-\s*Normal Öğretim\s*(?:-\s*)?(.*)$',title.strip(),re.I)
            if labelled:
                remainder=labelled[1].strip()
                if not remainder or remainder.startswith('('):
                    title=re.sub(r'\s+(?:Bölümü|Fakültesi)$','',program_parent['Name']) if program_parent else ''
                    for annotation in re.findall(r'\(([^)]+)\)',remainder):
                        if any(normal(annotation)==normal(u['name']) for u in university['units']):unit=annotation
                        elif normal(annotation) in ['100 ingilizce']:title+=' (İngilizce)'
                        else:title+=' ('+annotation+')'
                else:title=remainder
            # A trailing MYO label repeats the separately published faculty path.
            suffix=re.search(r'\s*\(([^)]+)\)\s*$',title)
            if suffix and unit and normal(suffix[1]) in normal(unit):title=title[:suffix.start()].strip()
        if uid=='tr-izmir-yuksek-teknoloji-enstitusu' and 'ingilizce' not in normal(title):
            # Explicit institution-wide language declaration, not name inference.
            evidence='https://uio.iyte.edu.tr/2026-2027-egitim-ogretim-yili-lisans-programlarina-yurtdisindan-ogrenci-basvurulari/'
            title+=' (İngilizce)'
        item = {'universityId': uid, 'title': title, 'sourceTitle': r['Name'], 'unit': unit, 'degree': degree}
        if evidence:item['identityEvidenceUrl']=evidence
        p = match(university, item)
        if not p or not r.get('CurriculumId') or not r.get('EncryptedCurriculumId'): continue
        params = {'apid': r['AcademicProgramId'], 'apIdStr': r['EncryptedAcademicProgramId'],
            'curId': r['CurriculumId'], 'curIdStr': r['EncryptedCurriculumId']}
        public = urljoin(url, 'Index') + '?' + urlencode({'id': r['EncryptedAcademicProgramId'], 'apIdStr': r['EncryptedAcademicProgramId'], 'culture': 'tr-TR'})
        matched.append({**item, 'programId': p['id'], 'name': p['name'], 'payload': params,
            'courseUrl': urljoin(url, 'SearchCurriculumDetail'), 'publicUrl': public, 'directoryUrl': url})
    counts = {}
    for m in matched: counts[m['programId']] = counts.get(m['programId'], 0)+1
    return {'universityId': uid, 'source': source, 'matched': [m for m in matched if counts[m['programId']] == 1]}


def main():
    a = read(ROOT / 'data/academic-catalog-2026.json')['universities']
    # Published catalogue links: COMU education faculty and Bartin BUBP portal.
    roots = {
        'tr-canakkale-onsekiz-mart-universitesi':'https://ubys.comu.edu.tr/AIS/OutcomeBasedLearning/Home/Index?culture=tr-TR',
        'tr-bartin-universitesi':'https://ubys.bartin.edu.tr/AIS/OutcomeBasedLearning/Home/Index',
        'tr-kastamonu-universitesi':'https://ubys.kastamonu.edu.tr/AIS/OutcomeBasedLearning/Home/Index?culture=tr-TR',
    }
    homes=read(CACHE / 'homepages.json')
    if (CACHE/'additional-homepages.json').exists():homes+=read(CACHE/'additional-homepages.json')
    for h in homes:
        for url, _ in h.get('catalogLinks', []):
            if '/AIS/OutcomeBasedLearning/Home/' in url:
                roots[h['programs'][0]['universityId']] = url
    for u in read(CACHE / 'discovery.json'):
        for p in u.get('pages', []):
            url = p.get('finalUrl', p['url'])
            if '/AIS/OutcomeBasedLearning/Home/' in url: roots[u['universityId']] = url
    directories = []
    with ThreadPoolExecutor(8) as pool:
        futures = {pool.submit(discover, uid, url, a[uid]): uid for uid,url in roots.items()}
        for f in as_completed(futures):
            try: directories.append(f.result())
            except Exception as e: directories.append({'universityId': futures[f], 'error': str(e), 'matched': []})
            write(CACHE / 'ubys-directories.json', directories)
            print('directories', len(directories), 'matches', sum(len(d['matched']) for d in directories), flush=True)
    def collect(p):
        return {**fetch(p['courseUrl'], p['payload']), 'publicUrl': p['publicUrl'], 'programs': [p], 'family': 'ubys', 'payload': p['payload']}
    output = []
    with ThreadPoolExecutor(12) as pool:
        futures = [pool.submit(collect,p) for batch in zip_longest(*(d['matched'] for d in directories)) for p in batch if p]
        for f in as_completed(futures):
            output.append(f.result())
            if len(output) % 30 == 0:
                write(CACHE / 'ubys-courses.json', output)
                print('courses', len(output), '/', len(futures), flush=True)
    write(CACHE / 'ubys-courses.json', output)


if __name__ == '__main__': main()
