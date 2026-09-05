"""Map the shared Bologna MYO tree using current official MYO/SHMYO lists."""
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from turkey_research import CACHE,ROOT,fetch,read,write,soup
from discover_turkey_courses import links,normal
from collect_turkey_web_curricula import pair
from parse_cyprus_courses import clean


def main():
    uid='tr-istanbul-nisantasi-universitesi';u=read(ROOT/'data/academic-catalog-2026.json')['universities'][uid]
    lists=[('Meslek Yüksekokulu','https://myo.nisantasi.edu.tr/bolumler/2'),
        ('Sağlık Hizmetleri Meslek Yüksekokulu','https://shmyo.nisantasi.edu.tr/bolumler')]
    mapping={}
    for unit,url in lists:
        source=fetch(url);doc=soup(source);navigation=links(doc,url)
        assert source['status']==200 and doc.title and normal(unit) in normal(doc.title.get_text())
        assert any(urlparse(href).hostname=='ebp.nisantasi.edu.tr' for href in navigation)
        for href,title in navigation.items():
            if urlparse(href).hostname!=urlparse(url).hostname or not urlparse(href).path.startswith('/bolum/'):continue
            title=re.sub(r'\s+TR$','',clean(title))
            mapping.setdefault(normal(title),[]).append((unit,url))
    original=next(d for d in read(CACHE/'ecatalog-directories.json') if d['universityId']==uid)
    items=[]
    for item in original.get('unmatched',[]):
        if item['degree']!='associate' or normal(item.get('unit',''))!='nisantasi meslek yuksekokul':continue
        choices=set(mapping.get(normal(item['title']),[]))
        if len(choices)!=1:continue
        unit,evidence=next(iter(choices))
        items.append({**item,'sourceUnit':item['unit'],'unit':unit,'identityEvidenceUrl':evidence})
    result=pair(uid,u,items);write(CACHE/'nisantasi-directories.json',[result])
    def collect(p):return {**fetch(p['courseUrl'],retry_failed=True),'programs':[p]}
    with ThreadPoolExecutor(4) as pool:output=list(pool.map(collect,result['matched']))
    write(CACHE/'nisantasi-courses.json',output)
    print('Nisantasi matched',len(result['matched']),'unmatched',len(result['unmatched']),flush=True)


if __name__=='__main__':main()
