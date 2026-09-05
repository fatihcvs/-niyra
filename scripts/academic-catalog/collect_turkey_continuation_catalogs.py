"""Follow Kultur and Ankara Medipol catalogues and explicit UBYS teaching labels."""
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, urlencode
from turkey_research import CACHE, ROOT, read, write, fetch, soup
from discover_turkey_courses import match, normal, links
from collect_turkey_web_curricula import pair
from collect_turkey_ubys import discover as ubys_discover
from parse_cyprus_courses import clean, fold
from collect_turkey_language_labels import expand_language


def normalize_ubys_label(title, unit):
    # Strip only a complete ordinary teaching label, never a minor or old plan.
    title=re.sub(r'\s+Birinci Öğretim (?:Ön\s*)?Lisans Anadal Programı$', '', title, flags=re.I)
    title=re.sub(r'\s+İkinci Öğretim (?:Ön\s*)?Lisans Anadal Programı$', ' (İÖ)', title, flags=re.I)
    unit=re.sub(r'\s+Müdürlüğü$', '', unit or '', flags=re.I)
    # A campus suffix may repeat the independently supplied academic unit.
    title=re.sub(r'\(([^)]+)\)', lambda m: '' if normal(m[1]) and normal(m[1])==normal(unit).split(' meslek ')[0] else m[0], title)
    return clean(title), clean(unit)


def kultur(university):
    uid='tr-istanbul-kultur-universitesi';items=[]
    aliases={'Yabancı Diller Eğitimi Bölümü İngiliz Dili Eğitimi Anabilim Dalı':'İngilizce Öğretmenliği',
        'Temel Eğitim Bölümü Okul Öncesi Eğitimi Anabilim Dalı':'Okul Öncesi Öğretmenliği',
        'Eğitim Bilimleri Bölümü Rehberlik ve Psikolojik Danışmanlık Anabilim Dalı':'Rehberlik ve Psikolojik Danışmanlık',
        'Özel Eğitim Bölümü':'Özel Eğitim Öğretmenliği','Alternatif Enerji Kaynakları':'Alternatif Enerji Kaynakları Teknolojisi'}
    for level,degree in [(1,'bachelor'),(3,'associate')]:
        url=f'https://akademikpaket.iku.edu.tr/TR/ects.php?p={level}&r=0';doc=soup(fetch(url))
        for a in doc.select('a[href*="ects_bolum.php?"]'):
            parent=a.find_parent('td',class_='ects');header=parent.find('strong') if parent else None
            if not header:continue
            original=clean(a.get_text(' ',strip=True));unit=clean(header.get_text(' ',strip=True))
            title=re.sub(r'\s*\(Türkçe\)','',original,flags=re.I).rstrip(' *')
            title=aliases.get(title,title)
            page_url=urljoin(url,a['href']);page=fetch(page_url);d=soup(page)
            language=re.search(r'(?:ogretim|egitim) dili\s+(?:%\s*100\s+)?ingilizce',fold(d.get_text(' ',strip=True)))
            if degree=='bachelor' and 'Türkçe' not in original and not title.endswith('(İngilizce)') and language:
                title+=' (İngilizce)'
            item={'title':title,'sourceTitle':original,'unit':unit,'degree':degree,'directoryUrl':url}
            if language:item['identityEvidenceUrl']=page_url
            if not match(university,item):continue
            target=next((u for u,t in links(d,page_url).items() if t=='Program Ders Planı' and urlparse(u).hostname=='akademikpaket.iku.edu.tr'),None)
            if target:items.append({**item,'courseUrl':target})
    return pair(uid,university,items)


def medipol(university):
    uid='tr-ankara-medipol-universitesi';home='https://mebis.ankaramedipol.edu.tr/ProgramBilgi?lang=tr';items=[]
    doc=soup(fetch(home))
    for a in doc.select('a[data-url*="/ProgramListesi?"]'):
        degree={'Önlisans Programları':'associate','Lisans Programları':'bachelor'}.get(a.get('title'))
        if not degree:continue
        url=urljoin(home,a['data-url']);unit=None
        for row in soup(fetch(url)).select('tr'):
            header=row.select_one('td[colspan] strong')
            if header:unit=clean(header.get_text(' ',strip=True));continue
            for link in row.select('a[href*="/ProgramBilgileri?"]'):
                original=clean(link.get_text(' ',strip=True))
                item={'title':original,'unit':unit,'degree':degree,'directoryUrl':url}
                if not match(university,item):continue
                public=urljoin(home,link['href']);page=soup(fetch(public))
                tab=page.select_one('a[data-url*="/ProgramDersPlani?"]')
                if tab:items.append({**item,'publicUrl':public,'courseUrl':urljoin(public,tab['data-url'])})
    return pair(uid,university,items)


def altinbas_labels(university):
    uid='tr-altinbas-universitesi'
    directory=next(d for d in read(CACHE/'more-directories.json') if d['universityId']==uid)
    items=[{**item,'sourceTitle':item['title'],'title':expand_language(item['title'])}
        for item in directory.get('unmatched',[]) if '/CourseStructure?' in item.get('courseUrl','')]
    return pair(uid,university,items)


def ubys_labels(uid,url,university):
    original=ubys_discover(uid,url,university);source=original['source']
    if source['status']!=200 or '/GetUnitProgramDataSource' not in source['url']:
        return {'universityId':uid,'matched':[],'source':source}
    rows=read(CACHE/source['file']);units={r['Id']:r for r in rows if not r['IsAcademicProgram']};items=[]
    for r in rows:
        degree={10601:'associate',10602:'bachelor'}.get(r.get('EducationQualificatinDegree'))
        if not r['IsAcademicProgram'] or not degree or r.get('Status')!=10201 or r.get('ProgramType')!=10501:continue
        if not r.get('CurriculumId') or not r.get('EncryptedCurriculumId'):continue
        parent=units.get(r['ParentId']);visited=set();unit=None
        while parent and parent['Id'] not in visited:
            visited.add(parent['Id'])
            if any(s in normal(parent['Name']) for s in ['fakulte','yuksekokul','konservatuvar']):unit=parent['Name'];break
            parent=units.get(parent.get('ParentId'))
        title,unit=normalize_ubys_label(r['Name'],unit)
        if title==r['Name'] and unit==clean(parent['Name'] if parent else ''):continue
        item={'universityId':uid,'title':title,'sourceTitle':r['Name'],'unit':unit,'degree':degree,'directoryUrl':url}
        p=match(university,item)
        if not p:continue
        payload={'apid':r['AcademicProgramId'],'apIdStr':r['EncryptedAcademicProgramId'],
            'curId':r['CurriculumId'],'curIdStr':r['EncryptedCurriculumId']}
        public=urljoin(url,'Index')+'?'+urlencode({'id':r['EncryptedAcademicProgramId'],'apIdStr':r['EncryptedAcademicProgramId'],'culture':'tr-TR'})
        items.append({**item,'programId':p['id'],'name':p['name'],'payload':payload,
            'courseUrl':urljoin(url,'SearchCurriculumDetail'),'publicUrl':public})
    counts=Counter(i['programId'] for i in items)
    return {'universityId':uid,'matched':[i for i in items if counts[i['programId']]==1],'source':source}


def collect(item):
    source=fetch(item['courseUrl'],item.get('payload'))
    source={**source,'programs':[item]}
    if item.get('publicUrl'):source['publicUrl']=item['publicUrl']
    if item.get('payload'):source.update(family='ubys',payload=item['payload'])
    if item['universityId']=='tr-istanbul-kultur-universitesi' and source['status']==200:
        selected=soup(source).select_one('select[name="colors"] option[selected]')
        if selected:source['curriculumPeriod']=clean(selected.get_text()).replace(' Akademik Yıl','')
    return source


def main():
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
    directories=[kultur(academic['tr-istanbul-kultur-universitesi']),medipol(academic['tr-ankara-medipol-universitesi']),
        altinbas_labels(academic['tr-altinbas-universitesi'])]
    roots={'tr-munzur-universitesi':'https://ubys.munzur.edu.tr/AIS/OutcomeBasedLearning/Home/Index'}
    for name in ['ubys-directories','ktu-ikcu-directories','bau-yalova-directories','ecatalog-directories','institution-directories']:
        path=CACHE/(name+'.json')
        if not path.exists():continue
        for d in read(path):
            for p in d.get('matched',[]):
                url=p.get('directoryUrl','')
                if '/AIS/OutcomeBasedLearning/Home/' in url:roots[d['universityId']]=url;break
    with ThreadPoolExecutor(4) as pool:
        directories+=list(pool.map(lambda pair:ubys_labels(pair[0],pair[1],academic[pair[0]]),roots.items()))
    published=set(read(ROOT/'data/course-catalog-index-2026.json')['programs'])
    previous=CACHE/'continuation-directories.json'
    if previous.exists():published-={p['universityId']+':'+p['programId'] for d in read(previous) for p in d['matched']}
    for d in directories:d['matched']=[p for p in d['matched'] if p['universityId']+':'+p['programId'] not in published]
    write(previous,directories)
    print('New matches',[(d['universityId'],len(d['matched'])) for d in directories],flush=True)
    # Each host is additionally limited by the shared fetcher's semaphore.
    items=[p for d in directories for p in d['matched']]
    with ThreadPoolExecutor(6) as pool:results=list(pool.map(collect,items))
    write(CACHE/'continuation-courses.json',results);print('Responses',len(results),flush=True)


if __name__=='__main__':main()
