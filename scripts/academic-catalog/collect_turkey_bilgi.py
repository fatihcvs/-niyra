"""Bilgi's published Turkish catalogue, using its anonymous language switch."""
import hashlib
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from http.cookiejar import CookieJar
from urllib.parse import urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener
from turkey_research import CACHE, ROOT, UA, fetch, read, soup, write
from discover_turkey_courses import match, normal
from parse_cyprus_courses import clean

HOME='https://ects.bilgi.edu.tr/Department'
POLICY='https://www.bilgi.edu.tr/tr/international/uluslararasi-aday-ogrenci/sikca-sorulan-sorular/'
_local=threading.local()


def turkish_page(url):
    if not url.startswith('https://ects.bilgi.edu.tr/'):
        raise ValueError('Unexpected catalogue host')
    key=hashlib.sha256(('bilgi-tr:'+url).encode()).hexdigest()[:24]
    meta=CACHE/(key+'.meta.json');body=CACHE/(key+'.body')
    if meta.exists():return read(meta)
    if not getattr(_local,'opener',None):
        # Only a public UI preference; no university account or saved cookie.
        _local.opener=build_opener(HTTPCookieProcessor(CookieJar()))
        switch='https://ects.bilgi.edu.tr/Home/SetCulture?culture=tr&returnurl=https%3A%2F%2Fects.bilgi.edu.tr%2FDepartment'
        with _local.opener.open(Request(switch,headers={'User-Agent':UA}),timeout=35) as response:response.read()
    with _local.opener.open(Request(url,headers={'User-Agent':UA}),timeout=35) as response:
        content=response.read(30_000_001)
        if len(content)>30_000_000:raise ValueError('Catalogue response too large')
        result={'url':url,'finalUrl':response.url,'status':response.status,'contentType':response.headers.get('Content-Type',''),
            'file':body.name,'fetchedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(content).hexdigest(),
            'selection':{'culture':'tr'}}
    body.write_bytes(content);write(meta,result);time.sleep(.3)
    return result


def directory():
    university=read(ROOT/'data/academic-catalog-2026.json')['universities']['tr-istanbul-bilgi-universitesi']
    doc=soup(turkish_page(HOME));policy=fetch(POLICY)
    policy_text=soup(policy).get_text(' ',strip=True)
    english_policy='Sağlık Bilimleri Fakültesi dışında İngilizcedir' in policy_text
    roots=[(urljoin(HOME,a['href']),{'Önlisans':'associate','Lisans':'bachelor'}[clean(a.get_text())])
        for a in doc.select('a[href]') if clean(a.get_text()) in {'Önlisans','Lisans'}]
    items=[]
    english_units={normal(x) for x in ['Sosyal ve Beşeri Bilimler Fakültesi','İşletme Fakültesi','Uygulamalı Bilimler Fakültesi',
        'İletişim Fakültesi','Mühendislik ve Doğa Bilimleri Fakültesi','Mimarlık Fakültesi']}
    for url,degree in roots:
        page=soup(turkish_page(url));selected=page.select_one('#ContextId option[selected]')
        period=clean(selected.get_text()) if selected else None
        for a in page.select('a[href*="/Department/Detail?"]'):
            panel=a.find_parent('div',class_='panel');heading=panel.select_one('.panel-heading a') if panel else None
            if not heading:continue
            title=clean(a.get_text());original=title;unit=clean(heading.get_text())
            course=a.parent.select_one('a[href*="/Department/Curriculum?"]')
            if not course:continue
            title=title.replace('Makina Mühendisliği','Makine Mühendisliği')
            if degree=='bachelor' and normal(unit) in english_units and english_policy:
                title+=' (İngilizce)'
            item={'title':title,'sourceTitle':original,'unit':unit,'degree':degree,'directoryUrl':url,
                'courseUrl':urljoin(url,course['href']),'curriculumPeriod':period}
            if title.endswith(' (İngilizce)'):item['identityEvidenceUrl']=POLICY
            items.append(item)
    mapped=[];unmatched=[]
    for item in {i['courseUrl']:i for i in items}.values():
        p=match(university,item)
        if p:mapped.append({**item,'universityId':'tr-istanbul-bilgi-universitesi','programId':p['id'],'name':p['name']})
        else:unmatched.append(item)
    counts=Counter(p['programId'] for p in mapped)
    return {'universityId':'tr-istanbul-bilgi-universitesi','matched':[p for p in mapped if counts[p['programId']]==1],
        'unmatched':unmatched}


def collect(item):
    source=turkish_page(item['courseUrl'])
    return {**source,'family':'bilgi','curriculumPeriod':item['curriculumPeriod'],'programs':[item]}


def main():
    entry=directory();write(CACHE/'bilgi-directories.json',[entry]);print('Bilgi matched',len(entry['matched']),flush=True)
    with ThreadPoolExecutor(2) as pool:
        result=list(pool.map(collect,entry['matched']))
    write(CACHE/'bilgi-courses.json',result);print('Bilgi responses',len(result),flush=True)


if __name__=='__main__':main()
