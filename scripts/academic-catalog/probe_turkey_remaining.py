"""Verify additional public catalogue hosts for institutions still lacking sources."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write, fair_tasks
from discover_turkey_courses import normal

def main():
 academic=read(ROOT/'data/academic-catalog-2026.json')['universities'];logos=read(ROOT/'data/university-logos-2026.json')['logos']
 mapped=set()
 for name in ['known','discovered-courses','additional-courses','ubys-courses','ecatalog-courses','refined-courses','institution-courses']:
  for s in read(CACHE/(name+'.json')):
   for p in s.get('programs',[]):mapped.add(p['universityId'])
 homes=read(CACHE/'homepages.json')+read(CACHE/'additional-homepages.json')
 existing={urlparse(u).hostname for h in homes for u,t in h.get('catalogLinks',[])}
 tasks={}
 for uid,u in academic.items():
  if u['region']!='Türkiye' or uid in mapped:continue
  domain=urlparse(logos.get(uid,{}).get('officialWebsite','')).hostname
  if not domain or not domain.endswith(('.edu.tr','.edu.kz','.edu')):continue
  domain=domain.removeprefix('www.')
  for prefix in ['ebp','eobs','ebs','bologna','akts','ects','katalog','bilgipaketi']:
   host=prefix+'.'+domain
   if host not in existing:tasks['https://'+host+'/']=[uid]
 verified=defaultdict(list);audit=[]
 with ThreadPoolExecutor(16) as pool:
  futures={pool.submit(fetch,url):uids for url,uids in fair_tasks(tasks)}
  for f in as_completed(futures):
   s=f.result();uid=futures[f][0];audit.append({**s,'universityId':uid})
   if s['status']==200:
    d=soup(s);visible=normal(d.get_text(' ',strip=True));core=normal(academic[uid]['officialName']).replace('universitesi','').strip().split()
    if core and all(w in visible.split() for w in core) and any(w in visible for w in ['bilgi paket','katalog','bologna','ects','akts']):
     verified[uid].append([s.get('finalUrl',s['url']),'Resmî ders kataloğu'])
   if len(audit)%25==0:
    write(CACHE/'remaining-probe-audit.json',audit)
    write(CACHE/'expanded-homepages.json',[{'programs':[{'universityId':uid}],'catalogLinks':ls,'method':'verified-institution-domain-endpoint'} for uid,ls in verified.items()])
    print('checked',len(audit),'/',len(tasks),'catalogues',sum(map(len,verified.values())),flush=True)
 write(CACHE/'remaining-probe-audit.json',audit)
 write(CACHE/'expanded-homepages.json',[{'programs':[{'universityId':uid}],'catalogLinks':ls,'method':'verified-institution-domain-endpoint'} for uid,ls in verified.items()])

if __name__=='__main__':main()
