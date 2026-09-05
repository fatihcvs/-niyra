"""Check public catalogue endpoints on registered university domains.

An endpoint is accepted only when its rendered page identifies the university.
The actual programme IDs and course routes still come from published directories.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import discover_university, normal


def probe(uid, university, domain, existing):
    core = normal(university['officialName']).replace('universitesi','').replace('universite','').strip().split()
    links = []
    # Endpoint families are discovery candidates, never assumed to be evidence.
    for host, path in [('obs', '/oibs/bologna/index.aspx'), ('ubys', '/AIS/OutcomeBasedLearning/Home/Index?culture=tr-TR')]:
        target = f'https://{host}.{domain}{path}'
        if any(f'://{host}.{domain}/' in url for url in existing): continue
        source = fetch(target)
        if source['status'] != 200: continue
        doc = soup(source)
        visible = normal(doc.get_text(' ',strip=True))
        if core and all(word in visible.split() for word in core):
            if doc.select_one('#btn-unit') or 'Bilgi Paketi' in doc.get_text():
                links.append([target,'Resmî ders bilgi paketi'])
    return {'programs':[{'universityId':uid}], 'catalogLinks':links, 'method':'verified-institution-domain-endpoint'}


def main():
    universities = read(ROOT/'data/academic-catalog-2026.json')['universities']
    logos = read(ROOT/'data/university-logos-2026.json')['logos']
    homes = {h['programs'][0]['universityId']:h for h in read(CACHE/'homepages.json')}
    additional=[]
    with ThreadPoolExecutor(16) as pool:
        futures=[]
        for uid,u in universities.items():
            if u['region'] != 'Türkiye': continue
            domain = urlparse(logos.get(uid,{}).get('officialWebsite','')).hostname
            if not domain:continue
            domain=domain.removeprefix('www.')
            # Registered academic domains only; avoid probing generic hosts.
            if not domain.endswith(('.edu.tr','.edu.kz','.edu')):continue
            futures.append(pool.submit(probe,uid,u,domain,[url for url,_ in homes.get(uid,{}).get('catalogLinks',[])]))
        for f in as_completed(futures):
            h=f.result();additional.append(h)
            write(CACHE/'additional-homepages.json',additional)
            if len(additional)%20==0:print('institutions',len(additional),'new catalogues',sum(len(h['catalogLinks']) for h in additional),flush=True)
    results=[]
    with ThreadPoolExecutor(10) as pool:
        futures=[pool.submit(discover_university,h,universities[h['programs'][0]['universityId']]) for h in additional if h['catalogLinks']]
        for f in as_completed(futures):
            results.append(f.result());write(CACHE/'additional-discovery.json',results)
            print('new programmes',sum(len(r['matched']) for r in results),flush=True)
    tasks={}
    for r in results:
        for p in r['matched']:tasks.setdefault(p['courseUrl'],[]).append(p)
    output=[]
    with ThreadPoolExecutor(14) as pool:
        futures={pool.submit(fetch,url):refs for url,refs in tasks.items()}
        for f in as_completed(futures):
            output.append({**f.result(),'programs':futures[f]})
            if len(output)%50==0:
                write(CACHE/'additional-courses.json',output);print('courses',len(output),'/',len(tasks),flush=True)
    write(CACHE/'additional-courses.json',output)


if __name__=='__main__':main()
