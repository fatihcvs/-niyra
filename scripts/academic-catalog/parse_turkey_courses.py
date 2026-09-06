"""Conservative course-table adapters: explicit headings, no inferred course facts."""
import re
import hashlib
import json
from pathlib import Path
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from turkey_research import CACHE, ROOT, read, soup, write
from parse_cyprus_courses import clean, fold, merge_courses
from parse_cyprus_html import parse_metu
from parse_cyprus_extra import parse_itu
from discover_turkey_courses import match as match_program
from parse_turkey_late_courses import parse_baskent, parse_erciyes, parse_subu, parse_igdir, parse_ktu, parse_bilgi, parse_afsu
from parse_turkey_continuation_courses import parse_agu, parse_izu, parse_esenyurt
from parse_turkey_foundation_courses import parse_foundation_tables, parse_demiroglu, parse_antalya
from parse_turkey_kion_courses import parse_kion
from parse_turkey_pdf_courses import parse_pdf
from parse_turkey_cag_courses import parse_cag
from parse_turkey_cankaya_courses import parse_cankaya
from parse_turkey_isik_courses import parse_isik, parse_isik_pdf
from parse_turkey_ozyegin_courses import parse_ozyegin
from parse_turkey_tedu_courses import parse_tedu
from parse_turkey_esogu_courses import parse_esogu_docx
from parse_turkey_iau_courses import parse_iau

ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth']
PARSER_VERSION = hashlib.sha256(b''.join((Path(__file__).parent / f).read_bytes() for f in
    ['parse_turkey_courses.py','turkey_research.py','parse_cyprus_courses.py','parse_cyprus_html.py','parse_cyprus_extra.py','parse_turkey_late_courses.py','parse_turkey_continuation_courses.py','parse_turkey_foundation_courses.py','parse_turkey_kion_courses.py','parse_turkey_pdf_courses.py','parse_turkey_cag_courses.py','parse_turkey_cankaya_courses.py','parse_turkey_isik_courses.py','parse_turkey_ozyegin_courses.py','parse_turkey_tedu_courses.py','parse_turkey_esogu_courses.py','parse_turkey_iau_courses.py'])).hexdigest()[:12]
# Family-specific versions keep the previously verified national parse cache
# intact when an isolated source adapter is added.
LEGACY_PARSER_VERSION = 'dfab660ddd5d'
ESOGU_PARSER_VERSION = 'b04a8d91a72f'


def course_code(value):
    value = re.sub(r'\s+', '', clean(value)).upper()
    if re.fullmatch(r'[A-ZÇĞİÖŞÜΑ-Ω]{1,12}(?:[-_][A-ZÇĞİÖŞÜ]{1,8})*[_-]?\d{2,10}[A-ZÇĞİÖŞÜ]{0,3}(?:-(?:19|20)\d{2})?|\d{5,16}|\d{4}\.\d{6}(?:\.\d{1,3})?', value) and len(value) <= 20:
        return value
    return None


def course_kind(value):
    value = fold(value)
    if value in ['zorunlu', 'zorunlu ders', 'ortak zorunlu ders', 'z', 'required', 'compulsory', 'mandatory', 'normal ders (zorunlu)']: return 'required'
    if value in ['secmeli', 's', 'elective', 'optional', 'secmeli ders']: return 'elective'
    return None


def heading_period(value, year=None):
    value = fold(value)
    roman=re.search(r'\b(XII|XI|IX|VIII|VII|VI|IV|III|II|X|V|I)\s*\.\s*(?:YARIYIL|DÖNEM)\b',value.upper())
    if roman:return ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'].index(roman[1])+1,None
    match = re.search(r'\b(\d{1,2})\s*\.?\s*(yariyil|donem|semester)\b', value)
    if match and 1 <= int(match[1]) <= 12:
        return int(match[1]), None
    match = re.search(r'\b(?:donem|semester)\s+(\d{1,2})\b',value)
    if match and 1 <= int(match[1]) <= 12:return int(match[1]),None
    match = re.search(r'\b(\d)\s*\.?\s*(sinif|yil)\b', value)
    if match: year = int(match[1])
    for i, name in enumerate(ORDINALS):
        if name + ' semester' in value: return i+1, None
        if name + ' year' in value: year = i+1
    if year and re.search(r'\b(guz|autumn|fall)\b', value): return 2*year-1, year
    if year and re.search(r'\b(bahar|spring)\b', value): return 2*year, year
    return None, year


def cells(row):
    return [clean(c.get_text(' ', strip=True)) for c in row.find_all(['td', 'th'], recursive=False)]


def parse_tables(doc, family='generic'):
    output = []
    for table in doc.select('table'):
        # Only the main undergraduate curriculum, never minors/graduate tables.
        if family == 'bilkent':
            section = table.find_previous('h2')
            if section and re.search(r'MINOR|DOUBLE MAJOR|(?<!UNDER)GRADUATE',section.get_text(),re.I):continue
        heading = table.find_previous(['h3', 'h4', 'h5', 'h6'])
        if family == 'pamukkale':
            heading = table.find_previous('span', id=re.compile('LabelYariyilBaslik|LabelSecmeli.*Baslik'))
        term, year = heading_period(heading.get_text()) if heading else (None, None)
        if family == 'ohu':
            tab=table.find_parent('div',class_='tab-pane')
            label=doc.find('a',href='#'+tab['id']) if tab and tab.get('id') else None
            year=heading_period(label.get_text())[1] if label else None
        if family == 'bilkent' and heading:
            y = heading.find_previous('h4', string=re.compile('YEAR'))
            term, year = heading_period(heading.get_text(), heading_period(y.get_text())[1] if y else None)
        mapping = None
        # Istanbul's thead contains bare th children, without a tr.
        head = table.find('thead', recursive=False)
        rows = ([head] if head and not head.select('tr') else []) + table.select('tr')
        for row in rows:
            if row.name == 'tr' and row.find_parent('table') != table: continue
            values = cells(row)
            names = [fold(v) for v in values]
            code_idx = next((i for i, n in enumerate(names) if n in ['ders kodu', 'dersin kodu', 'ders kod', 'kod', 'kodu', 'code', 'course code']), None)
            name_idx = next((i for i, n in enumerate(names) if n in ['ders adi', 'dersin adi', 'ders ad', 'ders', 'ad', 'course name', 'course title']), None)
            if code_idx is not None and name_idx is not None:
                mapping = {'code': code_idx, 'name': name_idx,
                    'kind': next((i for i,n in enumerate(names) if n in ['ders turu','dersin turu','ders tur','ders tipi','zorunlu/secmeli','z/s','tur','etiket','type','zorunlu mu?']), None),
                    'requiredBoolean': 'zorunlu mu?' in names,
                    'season': next((i for i,n in enumerate(names) if n == 'donem'), None)}
                continue
            nonempty = [v for v in values if v]
            if len(nonempty) <= 3 and len(' '.join(nonempty)) < 120:
                text = ' '.join(nonempty)
                p, y = heading_period(text, year)
                if p or re.search(r'\b\d\s*\.?\s*(?:Yıl|Sınıf)\b', text, re.I): term, year = p, y
                if re.fullmatch(r'(?:Seçmeli Dersler|Elective Courses)(?:\s*\([^)]*\))?', text, re.I): term, year = None, None
            if mapping is None: continue
            if max(mapping['code'], mapping['name']) >= len(values): continue
            identifier = course_code(values[mapping['code']])
            title = values[mapping['name']]
            if not identifier or not 2 <= len(title) <= 200: continue
            if re.search(r'^(?:toplam|total)\b|\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[IVX\d])', fold(title)): continue
            k = values[mapping['kind']] if mapping['kind'] is not None and mapping['kind'] < len(values) else ''
            if family == 'cukurova': k = k.split()[-1] if k else ''
            t = term
            if year and mapping['season'] is not None and mapping['season'] < len(values):
                season = values[mapping['season']]
                t = 2*year-1 if season == 'G' else 2*year if season == 'B' else None
            record = {'code': identifier, 'name': title, 'semester': t, 'kind': course_kind(k)}
            if mapping.get('requiredBoolean'):
                record['kind'] = 'required' if fold(k)=='evet' else 'elective' if fold(k)=='hayir' else None
            if year and t is None: record['year'] = year
            output.append(record)
    return merge_courses(output)


def parse_bogazici(doc):
    output = []
    for table in doc.select('table'):
        term, _ = heading_period(' '.join(c.get_text() for c in table.select('tr')[:1]))
        if not term: continue
        for row in table.select('tr'):
            v = cells(row)
            if len(v) >= 3 and course_code(v[0]) and len(v[1]) > 2:
                output.append({'code': course_code(v[0]), 'name': v[1], 'semester': term, 'kind': None})
    return merge_courses(output)


def parse_combined(doc, family):
    """Catalogues that print code and title inside one labelled course cell."""
    output=[]
    for table in doc.select('table'):
        if table.select('table'):continue
        heading=table.find_previous(class_='panel-heading') if family=='adu' else table.find_previous(['h4','h5','h6'])
        term,year=heading_period(heading.get_text()) if heading else (None,None)
        if not term:continue
        for row in table.select('tr'):
            cs=row.find_all(['td','th'],recursive=False)
            if family=='adu':
                if len(cs)<6:continue
                parts=cs[1].find_all('div',recursive=False)
                if len(parts)!=2:continue
                identifier=course_code(parts[1].get_text());title=clean(parts[0].get_text());k=cs[2].get_text()
            else:
                if len(cs)<5:continue
                a=cs[0].select_one('a[href*="DersBilgileri?"]')
                if not a:continue
                parts=clean(a.get_text()).split(' ',1)
                if len(parts)!=2:continue
                identifier=course_code(parts[0]);title=parts[1];k=cs[1].get_text()
            if identifier and 2<=len(title)<=200:
                output.append({'code':identifier,'name':title,'semester':term,'kind':course_kind(k)})
    return merge_courses(output)


def _parse_source(source):
    if source['status'] != 200: return [], []
    if source.get('selectionError'):return [], [source['selectionError']]
    url = source['url']
    if source.get('family')=='cankaya':return parse_cankaya(read(CACHE/source['file']),course_code)
    if source.get('family')=='isik':return parse_isik(soup(source), source.get('selection', {}).get('label'), course_code, course_kind, heading_period)
    if source.get('family')=='isik-pdf':return parse_isik_pdf(CACHE/source['file'], course_code, heading_period)
    if source.get('family')=='ozyegin':return parse_ozyegin(read(CACHE/source['file']), course_code)
    if source.get('family')=='tedu':return parse_tedu(read(CACHE/source['file']), course_code, heading_period)
    if source.get('family')=='esogu-docx':return parse_esogu_docx(CACHE/source['file'],course_code,course_kind)
    if source.get('family')=='iau':return parse_iau(soup(source),course_code,heading_period)
    if source.get('family')=='cag':return parse_cag(soup(source),course_code,course_kind)
    if source.get('family')=='kion':return parse_kion(soup(source),course_code,course_kind)
    if source.get('family')=='piri-pdf':return parse_pdf(CACHE/source['file'],course_code,course_kind,heading_period)
    if source.get('family') in ['khas','gsu']:return parse_foundation_tables(soup(source),source['family'],course_code,course_kind,heading_period)
    if source.get('family')=='demiroglu':return parse_demiroglu(soup(source),course_code,course_kind)
    if source.get('family')=='antalya':return parse_antalya(soup(source),course_code)
    if source.get('family') == 'esenyurt':return parse_esenyurt(soup(source),course_code,course_kind)
    if source.get('family') == 'agu':return parse_agu(soup(source),course_code,course_kind)
    if source.get('family') == 'izu':return parse_izu(soup(source),course_code,course_kind)
    if 'katalog.ktu.edu.tr' in url:return parse_ktu(soup(source),course_code,course_kind,heading_period)
    if source.get('family') == 'bilgi':return parse_bilgi(soup(source),course_code,course_kind)
    if source.get('family') == 'afsu':return parse_afsu(read(CACHE/source['file']),course_code)
    if 'ebp.igdir.edu.tr' in url:return parse_igdir(soup(source),parse_tables)
    if source.get('family')=='subu':return parse_subu(read(CACHE/source['file']),course_code,course_kind,heading_period)
    if 'truva.baskent.edu.tr' in url:return parse_baskent(soup(source),course_code)
    if 'dbp.erciyes.edu.tr' in url:return parse_erciyes(soup(source),course_code,course_kind,heading_period)
    if source.get('family') == 'erdogan':
        output=[]
        groups=read(CACHE/source['file']).get('Data',{}).get('MufredatDersler',[])
        if isinstance(groups,str):groups=json.loads(groups)
        for g in groups:
            candidates=[(c,g.get('yariYil'),None) for c in (g.get('dersler') or []) if not c.get('dersGrubuMu')]
            for pool in (g.get('dersgruplari') or []):
                candidates += [(c,pool.get('sure'),course_kind(pool.get('j_dersGrubuTuruAdi') or '')) for c in (pool.get('dersGruplariDersleri') or [])]
            for c,term,pool_kind in candidates:
                code=course_code(c.get('j_dersKodu') or c.get('j_derskodu') or '')
                name=clean(c.get('j_dersAdi') or c.get('j_ders') or '')
                if not code or not 2<=len(name)<=200:continue
                annual=fold(c.get('j_yillikYariyillikAdi') or '')=='yillik'
                record={'code':code,'name':name,'semester':term if not annual and term in range(1,13) else None,
                    'kind':course_kind(c.get('j_dersGrubuTuruAdi') or '') or pool_kind}
                if annual and c.get('sinif') in range(1,7):record['year']=c['sinif']
                output.append(record)
        return merge_courses(output)
    if source.get('family') == 'ataturk':
        output=[]
        for row in read(CACHE/source['file']):
            c=course_code(row.get('DersKodu',''));name=clean(row.get('DersAdi',''))
            name=re.sub(r'\s*\('+re.escape(str(row.get('DersID','')))+r'\)\s*\[-?\d+\]\s*$','',name)
            term=int(row['Donem']) if str(row.get('Donem','')).isdigit() else None
            if c and 2<=len(name)<=200:
                output.append({'code':c,'name':name,'semester':term if term in range(1,13) else None,'kind':course_kind(row.get('DersTipi',''))})
        return merge_courses(output)
    if source.get('family') == 'ubys':
        result = []
        data = read(CACHE / source['file'])
        eligible = [c for c in (data.get('CurriculumDetails') or []) if c.get('IsApproved') and c.get('IsActiveForBologna')]
        curricula = [c for c in eligible if c.get('EncryptedId') == source['payload']['curIdStr']]
        # Some public UBYS responses redact numeric IDs and re-encrypt their IDs.
        # A single approved active plan in this programme-scoped response is usable;
        # multiple unmatched plans remain ambiguous and are never combined.
        if not curricula and len(eligible)==1:curricula=eligible
        if len(curricula) != 1: return [], ['unresolved-current-curriculum']
        curriculum = curricula[0]
        for row in curriculum.get('CurriculumCources') or []:
            if row.get('IsDeleted') or not row.get('IsActiveForBologna') or row.get('SpecializationId'): continue
            term = row.get('SemesterNo')
            annual = curriculum.get('IsAnnual')
            pool = row.get('ElectivePool')
            candidates = [(c, 'elective') for c in (pool.get('ElectivePoolCourses') or [])] if pool else [(row.get('Course'), None)]
            for course, k in candidates:
                if not course or course.get('IsDeleted'): continue
                c, name = course_code(course.get('Code','')), clean(course.get('Name',''))
                if not c or not 2 <= len(name) <= 200: continue
                record = {'code': c, 'name': name, 'semester': term if not annual and term in range(1,13) else None, 'kind': k}
                if annual and term in range(1,7): record['year'] = term
                result.append(record)
        return merge_courses(result)
    if source.get('family') == 'ankara':
        result = []
        for row in read(CACHE / source['file']).get('data', []):
            c = course_code(row.get('dersKodu', ''))
            name = clean(row.get('dersAdi', ''))
            term = row.get('yariyilNo')
            if c and 2 <= len(name) <= 200:
                result.append({'code': c, 'name': name, 'semester': term if term in range(1,13) else None,
                    'kind': 'elective' if row.get('secmeliGrupKodu') else None})
        return merge_courses(result)
    doc = soup(source)
    if 'akts.adu.edu.tr' in url:return parse_combined(doc,'adu')
    if 'ebs.bilecik.edu.tr' in url:return parse_combined(doc,'bilecik')
    if 'catalog.metu.edu.tr' in url: return parse_metu(doc), []
    if '/DersPlanDetay/' in url: return parse_itu(doc), []
    if 'bogazici.edu.tr' in url: return parse_bogazici(doc)
    family = 'bilkent' if 'catalog.bilkent.edu.tr' in url else 'cukurova' if 'ebs.cu.edu.tr' in url else 'pamukkale' if 'ebs.pusula.pau.edu.tr' in url else 'ohu' if 'ohu.edu.tr' in url else 'generic'
    if '/oibs/bologna/progCourses.aspx' in url:
        selected = doc.select_one('select option[selected]')
        if selected and re.search('yandal|çift anadal|af müfredat|sayılı.*af', selected.get_text(), re.I): return [], ['alternative-default-plan']
    return parse_tables(doc, family)


def parse_source(source):
    if source['status'] != 200:return [], []
    version = ({'esogu-docx': ESOGU_PARSER_VERSION, 'iau': PARSER_VERSION}
               .get(source.get('family'), LEGACY_PARSER_VERSION))
    file = CACHE / (source['file'] + '.' + version + '.' + parse_identity(source) + '.parsed.json')
    if file.exists():
        result=read(file)
        return result['courses'],result['conflicts']
    courses,conflicts=_parse_source(source)
    write(file,{'courses':courses,'conflicts':conflicts})
    return courses,conflicts


def parse_identity(source):
    value = json.dumps({'file': source['file'], 'url': source['url'],
                        'family': source.get('family'), 'selection': source.get('selection')},
                       ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def main():
    academic = read(ROOT / 'data/academic-catalog-2026.json')['universities']
    sources = []
    inputs={}
    for name in ['known', 'hydrated', 'discovered-courses', 'ubys-courses', 'additional-courses', 'ecatalog-courses', 'previous-plan-courses', 'refined-courses', 'institution-courses', 'more-courses', 'expanded-courses', 'kocaeli-courses', 'istanbul-courses', 'language-courses', 'iau-courses']:
        file = CACHE / (name + '.json')
        if file.exists():
            inputs[file.name]=hashlib.sha256(file.read_bytes()).hexdigest()
            sources += read(file)
    versions={'default':LEGACY_PARSER_VERSION,'esogu-docx':ESOGU_PARSER_VERSION,'iau':PARSER_VERSION}
    write(CACHE/'parse-receipt.json',{'complete':False,'inputs':inputs,'parserVersion':PARSER_VERSION,'parserVersions':versions})
    records, issues = {}, []
    # Deduplicate response bodies before workers write their parse caches.
    pending = {parse_identity(s):s for s in sources if s['status']==200}
    pending_items = list(pending.items())
    # Submitting the whole national catalogue at once retains thousands of
    # futures and decoded source bodies. Bounded batches keep full parser-version
    # rebuilds within production workstation memory while still using workers.
    with ProcessPoolExecutor(max_workers=4) as pool:
        for offset in range(0, len(pending_items), 128):
            batch = pending_items[offset:offset + 128]
            futures = [pool.submit(parse_source, source) for _, source in batch]
            for future in futures:
                future.result()
            if offset == 0 or offset + len(batch) == len(pending_items) or (offset + len(batch)) % 1024 == 0:
                print('parse cache', offset + len(batch), '/', len(pending_items), flush=True)
    for number, source in enumerate(sources,1):
        courses, conflicts = parse_source(source) if source['status']==200 else ([],[])
        if conflicts: issues.append({'url': source['url'], 'conflicts': conflicts})
        if len(courses) < 3: continue
        if len({r['programId'] for r in source['programs']})>1 and any(not r.get('degree') for r in source['programs']):
            issues.append({'url':source['url'],'conflicts':['shared-source-without-programme-identity']})
            continue
        for ref in source['programs']:
            uid, pid = ref['universityId'], ref['programId']
            u = academic[uid]
            p = next(p for p in u['programs'] if p['id'] == pid)
            if ref.get('degree') and match_program(u, ref) != p:
                issues.append({'url': source['url'], 'program': pid, 'conflicts': ['programme-identity-mismatch']})
                continue
            record = {'universityId': uid, 'programId': pid, 'programName': p['name'], 'authority': u['officialName'],
                'sourceUrl': source.get('publicUrl', source['url']), 'verifiedAt': source['fetchedAt'][:10],
                'coverage': 'partial', 'sourceHash': source['sha256'], 'courses': courses}
            if source.get('publicUrl'):
                record['dataSourceUrl'] = source['url']
                if source.get('payload'): record['sourceRequest'] = source['payload']
            if ref.get('directoryUrl'): record['directoryUrl'] = ref['directoryUrl']
            if ref.get('identityEvidenceUrl'): record['identityEvidenceUrl']=ref['identityEvidenceUrl']
            if source.get('curriculumPeriod') or source.get('period'):
                record['curriculumPeriod'] = source.get('curriculumPeriod', source.get('period'))
            if source.get('selection'): record['sourceSelection'] = source['selection']
            key = f'{uid}:{pid}'
            if key not in records: records[key] = record
        if number%1000==0:
            write(CACHE / 'turkey-course-candidates.json', records)
            print('parsed',number,'/',len(sources),'programmes',len(records),flush=True)
    write(CACHE / 'turkey-course-candidates.json', records)
    write(CACHE / 'parser-issues.json', issues)
    assert all(hashlib.sha256((CACHE/name).read_bytes()).hexdigest()==value for name,value in inputs.items()), 'Research inputs changed during parsing; run again.'
    write(CACHE/'parse-receipt.json',{'complete':True,'inputs':inputs,'parserVersion':PARSER_VERSION,'parserVersions':versions,
        'sourceCount':len(sources),'programCount':len(records),
        'candidateHash':hashlib.sha256((CACHE/'turkey-course-candidates.json').read_bytes()).hexdigest()})
    print('Programmes', len(records), 'courses', sum(len(r['courses']) for r in records.values()), 'universities', len({r['universityId'] for r in records.values()}))
    print(Counter(r['universityId'] for r in records.values()))


if __name__ == '__main__': main()
