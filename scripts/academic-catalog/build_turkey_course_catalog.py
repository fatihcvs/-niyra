"""Publish validated Turkey records in university shards, preserving other regions."""
from collections import defaultdict
from datetime import datetime, timezone
import json
import hashlib
import re
import subprocess
from urllib.parse import urlparse
from turkey_research import CACHE, ROOT, read, write
from parse_turkey_courses import PARSER_VERSION
from curriculum_metadata import selected_oibs_curriculum, retain_matching_metadata


def compact(path, data):
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_bytes((json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8'))
    temp.replace(path)


def build():
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    legacy = read(ROOT / 'data/official-course-catalog-2026.json')
    candidates = read(CACHE / 'turkey-course-candidates.json')
    receipt=read(CACHE/'parse-receipt.json')
    assert receipt['complete'], 'Parsing has not completed.'
    assert receipt['parserVersion']==PARSER_VERSION, 'The parser changed; run it again.'
    assert receipt['programCount']==len(candidates)
    assert receipt['candidateHash']==hashlib.sha256((CACHE/'turkey-course-candidates.json').read_bytes()).hexdigest()
    assert all(hashlib.sha256((CACHE/name).read_bytes()).hexdigest()==value for name,value in receipt['inputs'].items()), 'Sources changed; parse again.'
    sources={s.get('sha256'):s for name in receipt['inputs'] for s in read(CACHE/name)}
    previous_shards={}
    shards, index = defaultdict(dict), {}
    for key, r in sorted(candidates.items()):
        if key in legacy['programs']: continue
        r=dict(r)
        u = academic['universities'].get(r['universityId'])
        assert u and u['region'] == 'Türkiye', key
        p = next((p for p in u['programs'] if p['id'] == r['programId']), None)
        assert p and p['name'] == r['programName'], key
        uid=r['universityId']
        if uid not in previous_shards:
            result=subprocess.run(['git','show',f'HEAD:data/course-catalog/{uid}.json'],cwd=ROOT,capture_output=True)
            previous_shards[uid]=json.loads(result.stdout) if result.returncode==0 else {}
        retain_matching_metadata(r,previous_shards[uid].get(key))
        if '/oibs/bologna/progCourses.aspx' in r['sourceUrl']:
            source=sources[r['sourceHash']]
            body=(CACHE/source['file']).read_bytes()
            assert hashlib.sha256(body).hexdigest()==r['sourceHash'], key
            selected=selected_oibs_curriculum(body.decode('utf-8-sig'))
            if selected:
                if r.get('sourceSelection',{}).get('cmbYillar'):
                    assert r['sourceSelection']['cmbYillar']==selected['sourceSelection']['cmbYillar'], key
                r['curriculumPeriod']=selected['curriculumPeriod']
                r['sourceSelection']={**r.get('sourceSelection',{}),**selected['sourceSelection']}
        assert key == f"{r['universityId']}:{r['programId']}", key
        assert urlparse(r['sourceUrl']).scheme == 'https', key
        assert re.fullmatch(r'[a-f0-9]{64}', r['sourceHash']), key
        assert len(r['courses']) >= 3, key
        seen = set()
        for c in r['courses']:
            assert 2 <= len(c['code']) <= 20 and 2 <= len(c['name']) <= 200, (key, c)
            assert c['kind'] in ['required', 'elective', None], (key,c)
            assert c['semester'] is None or type(c['semester']) is int and 1 <= c['semester'] <= 12, (key,c)
            assert c.get('year') is None or 1 <= c['year'] <= 6, (key,c)
            code = c['code'].upper().replace(' ', '')
            assert code not in seen, (key,c)
            seen.add(code)
        shards[r['universityId']][key] = r
        index[key] = {k:r[k] for k in ['universityId','programId','programName','coverage']}
        index[key]['courseCount'] = len(r['courses'])
        p['curriculumUrls'] = list(dict.fromkeys([r['sourceUrl'], *p.get('curriculumUrls',[])]))
        if r['universityId']=='tr-yildiz-teknik-universitesi' and urlparse(r['sourceUrl']).hostname=='bologna.yildiz.edu.tr':
            p['curriculumUrls']=[url for url in p['curriculumUrls'] if urlparse(url).hostname!='www.bologna.yildiz.edu.tr']
        p['curriculumAuthority'] = r['authority']
        p['curriculumPeriod'] = r.get('curriculumPeriod')
    folder = ROOT / 'data/course-catalog'
    folder.mkdir(exist_ok=True)
    published=subprocess.run(['git','show','HEAD:data/course-catalog-index-2026.json'],cwd=ROOT,capture_output=True)
    if published.returncode==0:
        old=set(json.loads(published.stdout)['programs'])
        removed=old-set(index)
        if removed:raise ValueError(f'{len(removed)} previously published programmes would be removed. Audit the source changes before publishing.')
    for uid, programmes in shards.items(): compact(folder / (uid + '.json'), programmes)
    # A shrinking research result must not leave stale published shard files.
    for file in folder.glob('*.json'):
        if file.stem not in shards: file.unlink()
    today = datetime.now(timezone.utc).date().isoformat()
    all_records = {**index, **{key: {**r, 'courseCount':len(r['courses'])} for key,r in legacy['programs'].items()}}
    coverage = []
    attempts=defaultdict(list)
    for file in receipt['inputs']:
        for source in read(CACHE/file):
            ambiguous=len({p['programId'] for p in source['programs']})>1 and any(not p.get('degree') for p in source['programs'])
            for p in source['programs']:
                attempts[f"{p['universityId']}:{p['programId']}"].append((source['status'],ambiguous))
    for uid,u in academic['universities'].items():
        if u['region'] != 'Türkiye': continue
        records = [all_records[f"{uid}:{p['id']}"] for p in u['programs'] if f"{uid}:{p['id']}" in all_records]
        missing=[p['id'] for p in u['programs'] if f"{uid}:{p['id']}" not in all_records]
        reasons={}
        for pid in missing:
            checked=attempts[f'{uid}:{pid}']
            readable=[status for status,ambiguous in checked if not ambiguous]
            reasons[pid]=('programme-source-not-matched' if not checked else 'ambiguous-programme-source' if not readable
                else 'no-readable-curriculum' if 200 in readable else 'source-unavailable')
        coverage.append({'universityId':uid,'name':u['officialName'],'programCount':len(u['programs']),
            'structuredProgramCount':len(records),'courseCount':sum(r['courseCount'] for r in records),
            'linkedProgramCount':sum(bool(p.get('curriculumUrls')) for p in u['programs']),
            'missingProgramIds':missing,'missingReasons':reasons})
    write(ROOT / 'data/turkey-catalog-coverage-2026.json', {'checkedAt':today,'universities':coverage,
        'research':{'sourceCount':receipt['sourceCount'],'parserVersion':receipt['parserVersion'],'manifestHashes':receipt['inputs']}})
    meta = {**legacy['meta'], 'version':'2026.09.05.7', 'updatedAt':today,
        'method':'Official university curriculum pages and public Bologna course data, matched to programme, degree, language and academic unit. Course source checksums are retained.',
        'stats':{'programCount':len(all_records),'courseCount':sum(r['courseCount'] for r in all_records.values()),
            'universityCount':len({r['universityId'] for r in all_records.values()}),
            'partialProgramCount':sum(r.get('coverage') == 'partial' for r in all_records.values()),
            'totalAcademicProgramCount':academic['meta']['stats']['programCount']}}
    compact(ROOT / 'data/course-catalog-index-2026.json', {'meta':meta,'programs':index})
    academic['meta']['version'] = '2026.26'
    for source in academic['meta']['sources']:
        if source['id']=='yildiz-bologna-curricula-2026':source['url']=source['url'].replace('https://www.bologna.yildiz.edu.tr/','https://bologna.yildiz.edu.tr/')
    academic['meta']['updatedAt'] = today
    academic['meta']['stats']['curriculumLinkCount'] = sum(bool(p.get('curriculumUrls')) for u in academic['universities'].values() for p in u['programs'])
    compact(ROOT / 'data/academic-catalog-2026.json', academic)
    print(meta['stats'])
    print('Turkey:',sum(u['structuredProgramCount'] for u in coverage),'/',sum(u['programCount'] for u in coverage),'programmes;',sum(u['courseCount'] for u in coverage),'courses')


if __name__ == '__main__': build()
