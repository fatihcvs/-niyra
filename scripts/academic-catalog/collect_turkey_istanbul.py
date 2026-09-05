"""Istanbul and Istanbul-Cerrahpasa's public treeview catalogue directories."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlencode
import re
from turkey_research import CACHE, ROOT, fetch, read, soup, write, collect_program_pages
from discover_turkey_courses import match, links
from parse_cyprus_courses import clean

ROOTS={'tr-istanbul-universitesi':'https://ebs.istanbul.edu.tr/',
 'tr-istanbul-universitesi-cerrahpasa':'https://ebs.iuc.edu.tr/'}

def directory(uid,base,university):
 items=[]
 for degree,path in [('bachelor','home/lisans'),('associate','home/onlisans')]:
  url=urljoin(base,path);doc=soup(fetch(url));api=re.search(r"\$\.get\('([^']*getdata[^']+)'",str(doc))
  if not api:continue
  source=fetch(urljoin(base,api[1]))
  if source['status']!=200:continue
  def walk(nodes,unit=None):
   for n in nodes:
    if n.get('nodes'):walk(n['nodes'],unit or clean(n['text']))
    elif (n.get('guid') or n.get('id') and n.get('text_url')) and unit:
     title=clean(n['text'])
     title=re.sub(r',?\s*(?:ÖN\s*)?LİSANS PROGRAMI\s*,?','',title,flags=re.I)
     title=re.sub(r'\s*\((?:ÖRGÜN ÖĞRETİM|TÜRKÇE)\)','',title,flags=re.I).strip(' ,')
     query={'id':n['guid']} if n.get('guid') else {'id':n['id'],'birim':n['text_url']}
     items.append({'title':title,'sourceTitle':n['text'],'unit':unit,'degree':degree,
      'programUrl':urljoin(base,'home/program?'+urlencode(query)),'directoryUrl':url})
  walk(read(CACHE/source['file']))
 matches=[]
 for item in items:
  p=match(university,item)
  if not p:continue
  s=fetch(item['programUrl']);ls=links(soup(s),s.get('finalUrl',s['url']))
  course=next((u for u,t in ls.items() if '/home/dersprogram/' in u.lower()),None)
  if course:matches.append({**item,'courseUrl':course,'universityId':uid,'programId':p['id'],'name':p['name']})
 counts={}
 for m in matches:counts[m['programId']]=counts.get(m['programId'],0)+1
 return {'universityId':uid,'matched':[m for m in matches if counts[m['programId']]==1],
  'unmatched':[i for i in items if not match(university,i)]}

def main():
 academic=read(ROOT/'data/academic-catalog-2026.json')['universities'];dirs=[]
 with ThreadPoolExecutor(2) as pool:
  futures=[pool.submit(directory,uid,root,academic[uid]) for uid,root in ROOTS.items()]
  for f in as_completed(futures):
   d=f.result();dirs.append(d);write(CACHE/'istanbul-directories.json',dirs);print(d['universityId'],len(d['matched']),flush=True)
 collect_program_pages(dirs,'istanbul-courses')

if __name__=='__main__':main()
