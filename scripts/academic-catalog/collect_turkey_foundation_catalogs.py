"""Follow official foundation-university directories and language declarations."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, parse_qs, urlparse
from turkey_research import CACHE, ROOT, read, write, fetch, soup
from discover_turkey_courses import links, match
from collect_turkey_web_curricula import pair
from collect_turkey_language_labels import expand_language
from collect_turkey_more_catalogs import erdogan_courses
from parse_cyprus_courses import clean, fold


def khas(university):
    root='https://bologna.khas.edu.tr/';url=urljoin(root,'lisans');items=[]
    for a in soup(fetch(url)).select('ul.list-icons a[href^="program/"]'):
        unit=a.find_previous('h2');title=clean(a.get_text());public=urljoin(root,a['href'])
        if not unit:continue
        doc=soup(fetch(public));text=clean(doc.get_text(' ',strip=True))
        language=re.search(r'Eğitim Türü ve Dili\s+(.+?)\s+Adres ve İletişim',text)
        if language and fold(language[1]).rstrip('.') in ['orgun egitim, ingilizce','orgun, ingilizce',
                'orgun egitim, ingilizce (% 100)',"orgun egitim. egitim dili ingilizce'dir"]:
            title+=' (İngilizce)'
        item={'title':title,'sourceTitle':clean(a.get_text()),'unit':clean(unit.get_text()),
            'degree':'bachelor','directoryUrl':url,'identityEvidenceUrl':public}
        if not match(university,item):continue
        actual=[u for u,t in links(doc,root).items() if t=='Ders Planları' and urlparse(u).hostname=='bologna.khas.edu.tr']
        if len(actual)==1:items.append({**item,'courseUrl':actual[0],'family':'khas'})
    return pair('tr-kadir-has-universitesi',university,items)


def gsu(university):
    url='https://ects.gsu.edu.tr/';policy=urljoin(url,'tr/home/page/dil-politikasi')
    text=fold(soup(fetch(policy)).get_text(' ',strip=True))
    assert 'egitim-ogretim faaliyetlerini agirlikli olarak fransizca dilinde' in text
    items=[]
    for a in soup(fetch(url)).select('a[href^="/tr/program/index/"]'):
        title=clean(a.get_text());unit=a.find_parent('div').find('h3')
        if not unit or re.search('Yüksek Lisans|Doktora',title):continue
        unit=clean(unit.get_text());degree='associate' if 'Meslek' in unit else 'bachelor'
        if degree=='bachelor':title=re.sub(r'\s+Lisans Programı$','',title)+' (Fransızca)'
        item={'title':title,'sourceTitle':clean(a.get_text()),'unit':unit,'degree':degree,
            'directoryUrl':url,'identityEvidenceUrl':policy}
        if not match(university,item):continue
        public=urljoin(url,a['href']);doc=soup(fetch(public))
        target=next((u for u,t in links(doc,public).items() if t=='Öğretim Programı'),None)
        if target:items.append({**item,'courseUrl':target,'family':'gsu'})
    return pair('tr-galatasaray-universitesi',university,items)


def demiroglu(university):
    url='https://akts.demiroglu.bilim.edu.tr/';doc=soup(fetch(url));items=[]
    dirs={u:('associate' if 'Önlisans' in t else 'bachelor') for u,t in links(doc,url).items()
        if t in ['Lisans Programları','Önlisans Programları']}
    for directory,degree in dirs.items():
        for a in soup(fetch(directory)).select('a[href*="ProgramBilgiGetir?txtProgram="]'):
            unit=a.find_previous('b')
            if not unit:continue
            public=urljoin(url,a['href'])
            items.append({'title':clean(a.get_text()),'unit':clean(unit.get_text()),'degree':degree,
                'directoryUrl':directory,'courseUrl':public,'family':'demiroglu'})
    return pair('tr-demiroglu-bilim-universitesi',university,items)


def toros(university):
    url='https://toros.edu.tr/bologna/programlar';items=[]
    for a in soup(fetch(url)).select('a.bologna-program-link'):
        block=a.find_parent(class_='bologna-faculty-block');heading=block.select_one('.bologna-faculty-title')
        if not heading:continue
        unit=clean(heading.get_text());degree='associate' if 'meslek' in fold(unit) else 'bachelor'
        if 'enstitu' in fold(unit):continue
        title=expand_language(clean(a.get_text()));public=urljoin(url,a['href'])
        item={'title':title,'sourceTitle':clean(a.get_text()),'unit':unit,'degree':degree,
            'directoryUrl':url,'courseUrl':public,'family':'toros'}
        if not match(university,item):continue
        iframe=soup(fetch(public)).select_one('iframe[src*="BLGNDersBilgiPaketi/SubIcerik"]')
        if not iframe:continue
        frame=urljoin(public,iframe['src']);doc=soup(fetch(frame))
        client=next((urljoin(frame,s['src']) for s in doc.select('script[src]') if 'SubIcerik.js?' in s['src']),None)
        if not client:continue
        source=fetch(client);script=(CACHE/source['file']).read_text('utf-8') if source['status']==200 else ''
        if not all(t in script for t in ['GetMufredat','MufredatDerslerListele','return b.ID - a.ID']):continue
        items.append({**item,'clientWitnessUrl':client})
    return pair('tr-toros-universitesi',university,items)


def collect(item):
    source=erdogan_courses(item) if item['family']=='toros' else {**fetch(item['courseUrl']),'family':item['family']}
    source['programs']=[item]
    if item['family']=='demiroglu':source['curriculumPeriod']=parse_qs(urlparse(item['courseUrl']).query)['txtYil'][0]
    return source


def main():
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities'];directories=[]
    tasks=[(khas,'tr-kadir-has-universitesi'),(gsu,'tr-galatasaray-universitesi'),
        (demiroglu,'tr-demiroglu-bilim-universitesi'),(toros,'tr-toros-universitesi')]
    with ThreadPoolExecutor(4) as pool:
        futures={pool.submit(fn,academic[uid]):uid for fn,uid in tasks}
        for f in as_completed(futures):
            try:result=f.result()
            except Exception as e:result={'universityId':futures[f],'matched':[],'error':str(e)}
            directories.append(result);write(CACHE/'foundation-directories.json',directories)
            print(result['universityId'],len(result['matched']),result.get('error',''),flush=True)
    output=[]
    with ThreadPoolExecutor(8) as pool:
        for f in as_completed([pool.submit(collect,p) for d in directories for p in d['matched']]):
            output.append(f.result());write(CACHE/'foundation-courses.json',output)
    print('Responses',len(output),flush=True)


if __name__=='__main__':main()
