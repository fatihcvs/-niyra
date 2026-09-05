"""Use Antalya Bilim's public programme tree and selected active curriculum."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlencode
from turkey_research import ROOT,CACHE,fetch,soup,read,write
from discover_turkey_courses import match
from collect_turkey_web_curricula import pair
from parse_cyprus_courses import clean,fold


def embedded(doc,name):
    for script in doc.select('script'):
        text=script.get_text();marker='const '+name+' = '
        if marker in text:return json.JSONDecoder().raw_decode(text.split(marker,1)[1])[0]
    return None


def main():
    uid='tr-antalya-bilim-universitesi';root='https://dersbilgipaketi.antalya.edu.tr/'
    url=root+'index.php?lang=tr';doc=soup(fetch(url))
    script=doc.select_one('script[src*="assets/js/dashboard.js"]');client_url=urljoin(url,script['src'])
    client=fetch(client_url);code=(CACHE/client['file']).read_text('utf-8')
    assert 'get_curriculum_periods.php?program_id=${programId}' in code
    assert 'course-details.php?id=${programId}&curriculum_id=${latestPeriod.id}' in code
    ignored=re.search(r'const SUPERSEDED_PROGRAM_IDS = \[(.*?)\];',code,re.S)
    ignored=set(map(int,re.findall(r'\b\d+\b',re.sub(r'//[^\n]*','',ignored[1])))) if ignored else set()
    units={u['id']:u for u in embedded(doc,'apiUnits')['data']}
    university=read(ROOT/'data/academic-catalog-2026.json')['universities'][uid]
    candidates=[]
    for p in embedded(doc,'apiPrograms')['data']:
        if p.get('status')!=10201 or p['id'] in ignored or p.get('deleted_at'):continue
        if re.search(r'pasif|inactive|cap|cift|yandal|minor',fold(p['name'])):continue
        unit=units.get(p['unit_id']);parent=unit;faculty=None
        while parent and parent.get('parent_id'):
            if re.search(r'fakultesi|meslek yuksekokulu',fold(parent['name'])):faculty=parent;break
            parent=units.get(parent['parent_id'])
        if not faculty or not unit:continue
        degree='associate' if 'meslek' in fold(faculty['name']) else 'bachelor'
        if not re.search(r'\b(?:on\s*)?lisans\b',fold(p['name'])) or re.search(r'yuksek|doktora',fold(p['name'])):continue
        candidates.append((p,unit,faculty,degree))
    def collect(candidate):
        p,unit,faculty,degree=candidate
        periods_url=root+'get_curriculum_periods.php?'+urlencode({'program_id':p['id'],'lang':'tr'})
        response=fetch(periods_url)
        if response['status']!=200:return None
        periods=read(CACHE/response['file']).get('data',[])
        if not periods:return None
        selected=max(periods,key=lambda x:x['id'])
        if selected.get('status')!=10201:return None
        target=root+'course-details.php?'+urlencode({'id':p['id'],'curriculum_id':selected['id'],'lang':'tr'})
        source=fetch(target);page=soup(source);title=unit['name']
        language=re.search(r'Program Dili\s+(.+?)\s+Eğitim Süresi',page.get_text(' ',strip=True))
        if language and language[1]=='İngilizce' and 'ingilizce' not in fold(title):title+=' (İngilizce)'
        item={'universityId':uid,'title':title,'unit':faculty['name'],'degree':degree,'directoryUrl':url,
            'courseUrl':target,'identityEvidenceUrl':target,'family':'antalya','sourceTitle':unit['name']}
        record=match(university,item)
        if not record:return None
        item.update(programId=record['id'],name=record['name'])
        return {**source,'programs':[item],'family':'antalya','curriculumPeriod':selected['name'],
            'selection':{'curriculumId':selected['id'],'periodsUrl':periods_url,'clientUrl':client_url}}
    with ThreadPoolExecutor(4) as pool:output=[r for r in pool.map(collect,candidates) if r]
    directory=pair(uid,university,[s['programs'][0] for s in output])
    allowed={p['programId'] for p in directory['matched']}
    output=[s for s in output if s['programs'][0]['programId'] in allowed]
    write(CACHE/'antalya-directories.json',[directory]);write(CACHE/'antalya-courses.json',output)
    print('Antalya',len(candidates),'candidates',len(output),'matched',flush=True)


if __name__=='__main__':main()
