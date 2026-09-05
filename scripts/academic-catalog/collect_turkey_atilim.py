"""Atılım's degree directories plus its current published language listing."""
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
from turkey_research import CACHE, ROOT, fetch, read, soup, write, collect_program_pages
from discover_turkey_courses import match, normal, links
from parse_cyprus_courses import clean
from collect_turkey_web_curricula import pair

UID='tr-atilim-universitesi'
POLICY='https://ic.atilim.edu.tr/tr/lisans/'


def main():
    university=read(ROOT/'data/academic-catalog-2026.json')['universities'][UID]
    language=defaultdict(set);evidence={}
    for policy_url in [POLICY,'https://ic.atilim.edu.tr/tr/yuksekokul/']:
        for a in soup(fetch(policy_url)).select('a[href]'):
            title=clean(a.get_text());label=re.fullmatch(r'(.+)\s+\((İNG|TR)\)',title)
            if label:
                language[normal(label[1])].add(label[2]);evidence[normal(label[1])]=policy_url
    items=[]
    for path,degree in [('lisans','bachelor'),('onlisans','associate')]:
        url='https://www.atilim.edu.tr/tr/ects/site-courses/programlar/'+path
        doc=soup(fetch(url))
        for a in doc.select('.detail-container.ects a[href$="/info/Description"]'):
            header=a.find_previous('h3');unit=clean(header.get_text()) if header else None
            if not unit or 'Enstitüsü' in unit:continue
            if unit=='Meslek Yüksekokulu':unit='Atılım Meslek Yüksekokulu'
            original=clean(a.get_text());title=re.sub(r'\s+Fakültesi Lisans Programı$','',original)
            title=re.sub(r'\s*\(Türkçe\)','',title,flags=re.I)
            identity=evidence.get(normal(title))
            # Translation-programme names already specify their language in the registry.
            if degree=='bachelor' and '(' not in title and language.get(normal(title))=={'İNG'} and title!='İngilizce Mütercim ve Tercümanlık':
                title+=' (İngilizce)'
            item={'title':title,'sourceTitle':original,'unit':unit,'degree':degree,'directoryUrl':url,
                'programUrl':urljoin(url,a['href'])}
            if identity and title.endswith(' (İngilizce)') and not original.endswith(' (İngilizce)'):item['identityEvidenceUrl']=identity
            if match(university,item):items.append(item)
    def curriculum(item):
        url=item['programUrl'];doc=soup(fetch(url))
        target=next((u for u,t in links(doc,url).items() if u.endswith('/info/CourseStructure')),None)
        return {**item,'courseUrl':target} if target else None
    with ThreadPoolExecutor(2) as pool:items=[i for i in pool.map(curriculum,items) if i]
    result=pair(UID,university,items);write(CACHE/'atilim-directories.json',[result])
    print('Atılım matched',len(result['matched']),flush=True)
    collect_program_pages([result],'atilim-courses')


if __name__=='__main__':main()
