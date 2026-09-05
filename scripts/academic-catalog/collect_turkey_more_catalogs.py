"""Published HTML directories and their linked curricula; no guessed programme IDs."""
import hashlib
import json
import re
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.cookiejar import CookieJar
from urllib.request import build_opener, HTTPCookieProcessor, Request
from urllib.parse import urljoin, urlparse, parse_qs
from turkey_research import CACHE, ROOT, UA, fetch, read, soup, write, fair_tasks
from discover_turkey_courses import match, links
from parse_cyprus_courses import clean

ROOTS={
 'tr-istanbul-gelisim-universitesi':[('bachelor','https://gbs.gelisim.edu.tr/icerik/2-1'),('associate','https://gbs.gelisim.edu.tr/icerik/1-1')],
 'tr-tekirdag-namik-kemal-universitesi':[('bachelor','https://bilgipaketi.nku.edu.tr:443/nku/akademikliste/m/5559/2'),('associate','https://bilgipaketi.nku.edu.tr:443/nku/akademikliste/m/5559/3')],
 'tr-nigde-omer-halisdemir-universitesi':[('bachelor','https://www.ohu.edu.tr/akts/bilgipaketi/lisans'),('associate','https://www.ohu.edu.tr/akts/bilgipaketi/onlisans')],
 'tr-recep-tayyip-erdogan-universitesi':[('bachelor','https://bologna2.erdogan.edu.tr/tr/programlar/5368'),('associate','https://bologna2.erdogan.edu.tr/tr/programlar/5367')],
 'tr-cankiri-karatekin-universitesi':[('bachelor','https://cakubologna.karatekin.edu.tr/tr/programlar/5368'),('associate','https://cakubologna.karatekin.edu.tr/tr/programlar/5367')],
 'tr-isparta-uygulamali-bilimler-universitesi':[(None,'https://akts.isparta.edu.tr/Public/EctsIndex.aspx')],
 'tr-sakarya-universitesi':[(None,'https://ebs.sakarya.edu.tr/')],
 'tr-yeditepe-universitesi':[('bachelor','https://akts.yeditepe.edu.tr/tr/Ects/DegreePrograms?D=L'),('associate','https://akts.yeditepe.edu.tr/tr/Ects/DegreePrograms?D=O')],
 'tr-altinbas-universitesi':[('bachelor','https://auects.altinbas.edu.tr/web/Ects/DegreePrograms?D=L'),('associate','https://auects.altinbas.edu.tr/web/Ects/DegreePrograms?D=O')],
 'tr-baskent-universitesi':[('bachelor','https://truva.baskent.edu.tr/bilgipaketi/?dil=TR&menu=akademik&inner=lisans'),('associate','https://truva.baskent.edu.tr/bilgipaketi/?dil=TR&menu=akademik&inner=onLisans')],
 'tr-yildiz-teknik-universitesi':[('bachelor','https://bologna.yildiz.edu.tr/index.php?r=program/bachelor')],
}

def directory(uid, roots, university):
 items=[]
 for degree,url in roots:
  doc=soup(fetch(url))
  if 'bologna.yildiz.edu.tr' in url:
   aliases={'Bilgisayar ve Öğretim Teknolojileri Eğitimi':'Bilgisayar ve Öğretim Teknolojileri Öğretmenliği',
    'Fen Bilgisi Eğitimi':'Fen Bilgisi Öğretmenliği','İlköğretim Matematik Eğitimi':'İlköğretim Matematik Öğretmenliği',
    'Okulöncesi Eğitimi':'Okul Öncesi Öğretmenliği','Sosyal Bilgiler Eğitimi':'Sosyal Bilgiler Öğretmenliği',
    'Türkçe Eğitimi':'Türkçe Öğretmenliği','Fransızca Mütercim Tercümanlık':'Fransızca Mütercim ve Tercümanlık',
    'Elektronik & Haberleşme Mühendisliği':'Elektronik ve Haberleşme Mühendisliği',
    'Metalürji ve Malzeme Mühendisliği':'Metalurji ve Malzeme Mühendisliği'}
   for a in doc.select('a[href*="program/view"]'):
    title=clean(a.get_text());original=title;english=bool(re.search(r'\(%100 İngilizce\)$',title,re.I))
    title=re.sub(r'\s+\(2018 versiyon\)$','',title,flags=re.I)
    title=re.sub(r'\s+\(%(?:30|100) İngilizce\)$','',title,flags=re.I)
    title=re.sub(r'\s+Lisans Programı$','',title,flags=re.I)
    title=aliases.get(title,title)+(' (İngilizce)' if english else '')
    items.append({'title':title,'sourceTitle':original,'degree':degree,'courseUrl':urljoin(url,a['href']),'directoryUrl':url})
   continue
  if 'truva.baskent.edu.tr' in url:
   for a in doc.select('#bolumler a[href]'):
    title=clean(a.get_text())
    if 'Programı' not in title or '(*)' in title:continue
    node=a.find('li');heading=node.find_previous('li',class_='list1') if node else None
    if not heading:continue
    title=re.sub(r'\s*\(Türkçe\)','',title,flags=re.I)
    page=fetch(urljoin(url,a['href']));ls=links(soup(page),page.get('finalUrl',page['url']))
    course=next((u for u,t in ls.items() if 'inner=katalog&' in u),None)
    if course:items.append({'title':title,'unit':clean(heading.get_text()),'degree':degree,'courseUrl':course,'directoryUrl':url})
   continue
  if 'ebs.sakarya.edu.tr' in url:
   for a in doc.select('a[href*="/Birim/DersPlan/"]'):
    container=a.find_parent('div',attrs={'data-parent':re.compile(r'^#(?:lisans|onlisans)Container$',re.I)})
    if not container:continue
    label=doc.find('a',href='#'+container['id'])
    if not label:continue
    title=clean(a.get_text())
    if '(Eski Plan)' in title:continue
    title=title.replace('(Yeni Plan)','').strip()
    degree='associate' if container['data-parent'].lower()=='#onlisanscontainer' else 'bachelor'
    items.append({'title':title,'unit':clean(label.get_text()),'degree':degree,'courseUrl':urljoin(url,a['href']),'directoryUrl':url})
   continue
  if 'isparta' in url:
   for a in doc.select('a[href*="EctsShowCycle.aspx?BirimNo="]'):
    unit=re.sub(r'^\d+\s*-\s*','',clean(a.get_text()))
    if 'ENSTİTÜ' in unit:continue
    degree='associate' if 'MESLEK YÜKSEKOKULU' in unit else 'bachelor'
    s=fetch(urljoin(url,a['href']))
    for p in soup(s).select('a[href*="EctsShowProgramDetails.aspx?"]'):
     title=re.sub(r'^\d+\s*-\s*','',clean(p.get_text()))
     items.append({'title':title,'unit':unit,'degree':degree,'courseUrl':urljoin(url,p['href']),'directoryUrl':url,'family':'isparta'})
   continue
  for a in doc.select('a[href]'):
   href=a['href']; title=clean(a.get_text());unit=None;course=None
   if 'gelisim' in url and '/bolum-genel-bilgiler-' in href:
    h=a.find_previous('h5');unit=clean(h.get_text()) if h else None
    if re.search(r'\(K\)',title):continue
    s=fetch(urljoin(url,href));course=next((u for u,t in links(soup(s),s['url']).items() if '/ders-plani-' in u),None)
   elif 'nku.' in url and '/bolum/m/' in href:
    h=a.find_previous('h3');unit=clean(h.get_text()) if h else None;course=urljoin(url,href)
   elif 'ohu.' in url and a.get('id')=='lnkDersler':
    row=a.find_parent('tr');title=clean(row.select_one('td').get_text())
    h=a.find_parent('table').find_previous('label');unit=clean(h.get_text()) if h else None;course=urljoin(url,href)
   elif urlparse(url).hostname in {'bologna2.erdogan.edu.tr','cakubologna.karatekin.edu.tr'} and '?programId=' in href:
    parent=a.find_parent('ul').parent;h=parent.find('span',recursive=False) or parent.find('a',recursive=False)
    unit=clean(h.get_text()) if h else None;course=urljoin(url,href)
   elif '/Ects/ProgramDetail?' in href:
    h=a.find_parent('ul').find_previous_sibling('li')
    unit=clean(h.get_text()) if h else None
    title=re.sub(r'\s+FAKÜLTESİ(?=\s*\()','',title)
    page=fetch(urljoin(url,href));ls=links(soup(page),page.get('finalUrl',page['url']))
    course=next((u for u,t in ls.items() if re.search(r'ders.*(?:plan|yapı)|müfredat|curriculum',t,re.I)),None)
    if not course:course=urljoin(url,href)
   if course:items.append({'title':title,'unit':unit,'degree':degree,'courseUrl':course,'directoryUrl':url})
 mapped=[]
 for item in {i['courseUrl']:i for i in items}.values():
  p=match(university,item)
  if p:mapped.append({**item,'universityId':uid,'programId':p['id'],'name':p['name']})
 counts={}
 for m in mapped:counts[m['programId']]=counts.get(m['programId'],0)+1
 return {'universityId':uid,'matched':[m for m in mapped if counts[m['programId']]==1],
  'unmatched':[i for i in items if not match(university,i)]}

def isparta_courses(item):
 """The public catalogue carries programme selection in an anonymous session."""
 url=item['courseUrl'];key=hashlib.sha256(('isparta-session:'+url).encode()).hexdigest()[:24]
 meta=CACHE/(key+'.meta.json');body=CACHE/(key+'.body')
 if meta.exists():return read(meta)
 opener=build_opener(HTTPCookieProcessor(CookieJar()))
 with opener.open(Request(url,headers={'User-Agent':UA}),timeout=35) as r:html=r.read()
 from bs4 import BeautifulSoup
 d=BeautifulSoup(html,'html.parser');a=d.select_one('a[href*="EctsShowProgramDetailsCourseStructure.aspx"]')
 if not a:return fetch(url)
 target=urljoin(url,a['href'])
 with opener.open(Request(target,headers={'User-Agent':UA}),timeout=35) as r:content=r.read();status=r.status
 body.write_bytes(content)
 result={'url':target,'publicUrl':url,'status':status,'file':body.name,'fetchedAt':datetime.now(timezone.utc).isoformat(),
  'sha256':hashlib.sha256(content).hexdigest(),'selection':{'programUrl':url},'contentType':'text/html'}
 write(meta,result);return result

def erdogan_courses(item):
 page=fetch(item['courseUrl']);iframe=soup(page).select_one('iframe[src*="BLGNDersBilgiPaketi/SubIcerik"]')
 if not iframe:return page
 url=urljoin(item['courseUrl'],iframe['src']);s=fetch(url);d=soup(s)
 pid=int(parse_qs(urlparse(url).query)['programID'][0]);years=d.select_one('#jsonYillar')
 if not years:return s
 selected=next((y for y in json.loads(years['value']) if y.get('selected')),None)
 api=urljoin(url,'/BLGNDersBilgiPaketi/GetMufredat');plans=fetch(api,{'programId':pid,'diller':'tr'})
 if plans['status']!=200 or not selected:return s
 choices=[p for p in read(CACHE/plans['file']).get('Data',[]) if p.get('bolognaMufredatAktif') and p.get('mufredatTuruTxt')=='Ana Müfredat']
 if not choices:return s
 # SubIcerik.js explicitly selects the highest-ID active curriculum.
 chosen=max(choices,key=lambda p:p['ID']);payload={'mufredatId':chosen['ID'],'diller':'tr','yilID':selected['ID']}
 result=fetch(urljoin(url,'/BLGNDersBilgiPaketi/MufredatDerslerListele'),payload)
 return {**result,'family':'erdogan','payload':payload,'publicUrl':item['courseUrl'],'curriculumPeriod':selected['value'],
  'selection':{'curriculumName':chosen['mufredatAdi']}}

def collect(item):
 if item.get('family')=='isparta':s=isparta_courses(item)
 elif urlparse(item['courseUrl']).hostname in {'bologna2.erdogan.edu.tr','cakubologna.karatekin.edu.tr'}:s=erdogan_courses(item)
 else:s=fetch(item['courseUrl'])
 return {**s,'programs':[item]}

def main():
 academic=read(ROOT/'data/academic-catalog-2026.json')['universities'];directories=[]
 with ThreadPoolExecutor(6) as pool:
  futures={pool.submit(directory,uid,roots,academic[uid]):uid for uid,roots in ROOTS.items()}
  for f in as_completed(futures):
   try:r=f.result()
   except Exception as e:r={'universityId':futures[f],'error':str(e),'matched':[]}
   directories.append(r);write(CACHE/'more-directories.json',directories);print(r['universityId'],len(r['matched']),flush=True)
 tasks={p['courseUrl']:p for d in directories for p in d['matched']};output=[]
 with ThreadPoolExecutor(12) as pool:
  futures=[pool.submit(collect,p) for url,p in fair_tasks(tasks)]
  for f in as_completed(futures):
   try:output.append(f.result())
   except Exception as e:print(type(e).__name__,str(e)[:120],flush=True)
   if len(output)%30==0:write(CACHE/'more-courses.json',output);print('courses',len(output),'/',len(tasks),flush=True)
 if (CACHE/'erciyes-courses.json').exists():output+=read(CACHE/'erciyes-courses.json')
 if (CACHE/'erciyes-directories.json').exists():
  directories+=read(CACHE/'erciyes-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'subu-courses.json').exists():output+=read(CACHE/'subu-courses.json')
 if (CACHE/'subu-directories.json').exists():
  directories+=read(CACHE/'subu-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'ktu-ikcu-courses.json').exists():output+=read(CACHE/'ktu-ikcu-courses.json')
 if (CACHE/'ktu-ikcu-directories.json').exists():
  directories+=read(CACHE/'ktu-ikcu-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'web-curricula-courses.json').exists():output+=read(CACHE/'web-curricula-courses.json')
 if (CACHE/'web-curricula-directories.json').exists():
  directories+=read(CACHE/'web-curricula-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'bilgi-courses.json').exists():output+=read(CACHE/'bilgi-courses.json')
 if (CACHE/'bilgi-directories.json').exists():
  directories+=read(CACHE/'bilgi-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'afsu-courses.json').exists():output+=read(CACHE/'afsu-courses.json')
 if (CACHE/'afsu-directories.json').exists():
  directories+=read(CACHE/'afsu-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'language-label-courses.json').exists():output+=read(CACHE/'language-label-courses.json')
 if (CACHE/'language-label-directories.json').exists():
  directories+=read(CACHE/'language-label-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'atilim-courses.json').exists():output+=read(CACHE/'atilim-courses.json')
 if (CACHE/'atilim-directories.json').exists():
  directories+=read(CACHE/'atilim-directories.json');write(CACHE/'more-directories.json',directories)
 if (CACHE/'bau-yalova-courses.json').exists():output+=read(CACHE/'bau-yalova-courses.json')
 if (CACHE/'bau-yalova-directories.json').exists():
  directories+=read(CACHE/'bau-yalova-directories.json');write(CACHE/'more-directories.json',directories)
 for prefix in ['continuation','agu-izu','recovered-oibs','foundation','antalya','kion','recovered-ubys','nisantasi','piri','cag','cankaya','tarsus']:
  if (CACHE/(prefix+'-courses.json')).exists():output+=read(CACHE/(prefix+'-courses.json'))
  if (CACHE/(prefix+'-directories.json')).exists():directories+=read(CACHE/(prefix+'-directories.json'))
 write(CACHE/'more-directories.json',directories)
 write(CACHE/'more-courses.json',output)

if __name__=='__main__':main()
