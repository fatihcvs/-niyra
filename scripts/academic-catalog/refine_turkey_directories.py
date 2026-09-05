"""Revisit catalogue navigation after new families/links have been identified."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from turkey_research import CACHE, ROOT, read, write, collect_program_pages
from discover_turkey_courses import discover_university

def main():
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities']
    prior={r['universityId']:r for r in read(CACHE/'discovery.json')}
    existing={m['courseUrl'] for r in prior.values() for m in r['matched']}
    results=[]
    homes=read(CACHE/'homepages.json')
    with ThreadPoolExecutor(12) as pool:
        futures={pool.submit(discover_university,h,universities[h['programs'][0]['universityId']]):h['programs'][0]['universityId']
            for h in homes if len(prior.get(h['programs'][0]['universityId'],{}).get('matched',[])) < len(universities[h['programs'][0]['universityId']]['programs'])}
        for f in as_completed(futures):
            try:
                r=f.result();r['matched']=[m for m in r['matched'] if m['courseUrl'] not in existing];results.append(r)
            except Exception as e:results.append({'universityId':futures[f],'error':str(e),'matched':[]})
            write(CACHE/'refined-discovery.json',results)
            if len(results)%25==0:print('universities',len(results),'new programmes',sum(len(r['matched']) for r in results),flush=True)
    collect_program_pages(results,'refined-courses')

if __name__=='__main__':main()
