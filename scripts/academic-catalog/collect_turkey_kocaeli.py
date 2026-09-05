"""Kocaeli's published ColdFusion navigation and printable curriculum pages."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
import re
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import match
from parse_cyprus_courses import clean

BASE='https://ects.kocaeli.edu.tr/'
UID='tr-kocaeli-universitesi'

def programmes(unit,degree,level):
 payload={'Fakulteid':unit['name'],'Dilid':0,'Islem':level,'bolumKontrol':4}
 source=fetch(BASE+'AkademikDuzey.cfm',urlencode(payload).encode(),'application/x-www-form-urlencoded')
 items=[]
 for a in soup(source).select('a#BolumListe'):
  language,diploma=a['data'].split('[;]')
  # PrintBolum on the public landing page defines this exact route.
  url=BASE+'BolumBilgiDetay.cfm?'+urlencode({'Bolumid':a['name'],'Dilid':language,'DipTurid':diploma,'Yazdir':1})
  items.append({'degree':degree,'unit':clean(unit.get_text()),'courseUrl':url,'directoryUrl':BASE,'shortTitle':clean(a.get_text())})
 return items

def collect(item,university):
 source=fetch(item['courseUrl']);doc=soup(source);header=doc.select_one('h4')
 if not header:return {**source,'programs':[]}
 lines=[clean(t) for t in header.stripped_strings]
 if len(lines)!=3 or lines[0]!='KOCAELİ ÜNİVERSİTESİ':return {**source,'programs':[]}
 item={**item,'title':lines[2],'unit':lines[1]};p=match(university,item)
 if not p:return {**source,'programs':[],'unmatched':item}
 ref={**item,'universityId':UID,'programId':p['id'],'name':p['name']}
 result={**source,'programs':[ref]}
 # The printed page includes one published course-list year.
 periods=set(re.findall(r'\b(20\d{2}\s*/\s*20\d{2})\s*(?:Ders Listesi|Ders Planı)',doc.get_text(' ',strip=True),re.I))
 if len(periods)==1:result['curriculumPeriod']=next(iter(periods))
 return result

def main():
 university=read(ROOT/'data/academic-catalog-2026.json')['universities'][UID];items=[]
 for degree,level in [('bachelor',1),('associate',2)]:
  source=fetch(BASE+'AkademikDuzey.cfm',f'Islem={level}&Dilid=0'.encode(),'application/x-www-form-urlencoded')
  with ThreadPoolExecutor(4) as pool:
   for result in pool.map(lambda u:programmes(u,degree,level),soup(source).select('a#FakulteListe')):items+=result
 print('published programmes',len(items),flush=True)
 output=[]
 with ThreadPoolExecutor(4) as pool:
  futures=[pool.submit(collect,item,university) for item in items]
  for f in as_completed(futures):
   output.append(f.result())
   if len(output)%20==0:write(CACHE/'kocaeli-courses.json',output);print('courses',len(output),'matched',sum(bool(s['programs']) for s in output),flush=True)
 write(CACHE/'kocaeli-courses.json',output)
 write(CACHE/'kocaeli-directories.json',[{'universityId':UID,'matched':[p for s in output for p in s['programs']],
  'unmatched':[s['unmatched'] for s in output if s.get('unmatched')]}])

if __name__=='__main__':main()
