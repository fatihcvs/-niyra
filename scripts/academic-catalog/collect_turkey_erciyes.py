"""Erciyes DBP: public year/programme selectors in isolated anonymous sessions."""
import hashlib
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from urllib.parse import urlencode, urljoin, quote
from urllib.request import build_opener, HTTPCookieProcessor, Request
from bs4 import BeautifulSoup
from turkey_research import CACHE, ROOT, UA, fetch, read, soup, write
from discover_turkey_courses import links, match
from parse_cyprus_courses import clean

ROOT_URL='https://dbp.erciyes.edu.tr/Default.aspx?lang=0'
UID='tr-erciyes-universitesi'


def faculty(item, university):
    opener=build_opener(HTTPCookieProcessor(CookieJar()))
    def request(url, payload=None):
        headers={'User-Agent':UA}
        if payload is not None:headers['Content-Type']='application/x-www-form-urlencoded'
        with opener.open(Request(quote(url,safe=':/?=&%+#@;,$!()*-._~'),data=payload,headers=headers),timeout=35) as response:
            return response.read(30_000_000)
    url=item['url'];doc=BeautifulSoup(request(url),'html.parser');select=doc.select_one('select[name$="DDOgrYili"]')
    choices=[(o['value'],o.get_text(' ',strip=True)) for o in select.select('option')] if select else []
    programmes=[];period=None
    for value,label in choices:
        params={e['name']:e.get('value','') for e in doc.select('input[type="hidden"][name]')}
        params.update({select['name']:value,'__EVENTTARGET':select['name'],'__EVENTARGUMENT':''})
        doc=BeautifulSoup(request(url,urlencode(params).encode()),'html.parser')
        programmes=doc.select('a[href*="/Program/Learn.aspx?"]')
        if programmes:period=label;break
    matched=[];output=[]
    for a in programmes:
        title=clean(a.get_text());program_url=urljoin(url,a['href'])
        ref={'universityId':UID,'title':title,'unit':item['unit'],'degree':item['degree'],'directoryUrl':url,'courseUrl':program_url}
        p=match(university,ref)
        if not p:continue
        ref.update(programId=p['id'],name=p['name']);matched.append(ref)
        key=hashlib.sha256(('erciyes-session:'+program_url+':'+str(period)).encode()).hexdigest()[:24]
        meta=CACHE/(key+'.meta.json')
        if meta.exists():output.append({**read(meta),'programs':[ref]});continue
        page=BeautifulSoup(request(program_url),'html.parser')
        target=next((u for u,t in links(page,program_url).items() if 'Müfredat Dersleri' in t),None)
        if not target:continue
        content=request(target);(CACHE/(key+'.body')).write_bytes(content)
        s={'url':target,'publicUrl':program_url,'file':key+'.body','status':200,'contentType':'text/html',
          'fetchedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(content).hexdigest(),
          'curriculumPeriod':period,'selection':{'year':period,'programUrl':program_url}}
        write(meta,s);output.append({**s,'programs':[ref]})
    return {'universityId':UID,'matched':matched,'directoryUrl':url},output


def main():
    doc=soup(fetch(ROOT_URL));university=read(ROOT/'data/academic-catalog-2026.json')['universities'][UID];items={}
    for a in doc.select('a[href*="/Degree/Default.aspx?FakulteKod="]'):
        li=a.find_parent('li',class_='megamenu-li');label=li.find('a',recursive=False) if li else None
        degree=clean(label.get_text()) if label else ''
        if degree not in ['LİSANS','ÖN LİSANS','ÖNLİSANS']:continue
        url=urljoin(ROOT_URL,a['href']);items[url]={'url':url,'unit':clean(a.get_text()),'degree':'bachelor' if degree=='LİSANS' else 'associate'}
    directories=[];courses=[]
    with ThreadPoolExecutor(2) as pool:
        futures={pool.submit(faculty,item,university):item for item in items.values()}
        for f in as_completed(futures):
            try:d,c=f.result();directories.append(d);courses+=c
            except Exception as e:directories.append({'universityId':UID,'matched':[],'url':futures[f]['url'],'error':str(e)})
            write(CACHE/'erciyes-directories.json',directories);write(CACHE/'erciyes-courses.json',courses)
            print('faculties',len(directories),'/',len(items),'programmes',len(courses),flush=True)


if __name__=='__main__':main()
