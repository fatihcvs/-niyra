"""Read KTÜ's published year pages and İKÇÜ's public programme tree."""
import hashlib
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import match, normal, links
from collect_turkey_ubys import discover
from parse_cyprus_courses import clean


def ktu_directory(university):
    url='https://ktu.edu.tr/tr/katalog';source=fetch(url)
    # The page mixes UTF-8 with a few legacy bytes outside the catalogue.
    # Unreadable programme labels are rejected instead of guessed.
    doc=BeautifulSoup((CACHE/source['file']).read_bytes().decode('utf-8',errors='replace'),'html.parser')
    matched=[];unmatched=[]
    aliases={'Diş Hekimliği':'Diş Hekimliği','Eczacılık':'Eczacılık',
        'Makina Mühendisliği':'Makine Mühendisliği','Orman Endüstri Mühendisliği':'Orman Endüstrisi Mühendisliği'}
    for selector,degree in [('#v-pills-profile','associate'),('#v-pills-messages','bachelor')]:
        for a in doc.select(selector+' a[href*="generalinfo.aspx"]'):
            unit=a.find_parent('div',class_='ms-2').select_one('.fw-bold').get_text(strip=True)
            original=clean(a.get_text());parts=original.split('/',1)
            subject=clean(parts[1]).lstrip('-').strip() if len(parts)>1 else ''
            language=re.findall(r'%\s*(\d+)\s*(İngilizce|Rusça)',subject,re.I)
            subject=re.sub(r'-?\s*%\s*\d+\s*(İngilizce|Rusça)','',subject,flags=re.I).strip()
            title=subject or re.sub(r'\s+BÖLÜMÜ(?:\s+BÖLÜMÜ)?$','',parts[0]).strip()
            for old,new in aliases.items():
                if normal(title)==normal(old):title=new
            for percent,lang in language:
                if percent=='100':title+=' ('+lang+')'
            item={'title':title,'sourceTitle':original,'unit':unit,'degree':degree,
                'courseUrl':a['href'],'directoryUrl':url,'universityId':'tr-karadeniz-teknik-universitesi'}
            p=match(university,item) if '\ufffd' not in title+unit else None
            if p:matched.append({**item,'programId':p['id'],'name':p['name']})
            else:unmatched.append(item)
    counts={}
    for item in matched:counts[item['programId']]=counts.get(item['programId'],0)+1
    return {'universityId':'tr-karadeniz-teknik-universitesi','matched':[x for x in matched if counts[x['programId']]==1],'unmatched':unmatched}


def ktu_courses(item):
    page=fetch(item['courseUrl']);doc=soup(page)
    urls=[u for u,t in links(doc,item['courseUrl']).items() if '/semester.aspx?' in u and re.search(r'\b[1-6]\.\s*Yıl',t)]
    pages=[fetch(url) for url in urls]
    good=[s for s in pages if s['status']==200]
    if not good:return {**page,'programs':[item]}
    content=b'\n'.join((CACHE/s['file']).read_bytes() for s in good)
    key=hashlib.sha256(('ktu-year-pages:'+item['courseUrl']).encode()).hexdigest()[:24]
    (CACHE/(key+'.body')).write_bytes(content)
    periods={clean(soup(s).select_one('select option[selected]').get_text()).split(' ')[0]
        for s in good if soup(s).select_one('select option[selected]')}
    if len(periods)>1:
        return {**page,'programs':[item],'selection':{'issue':'inconsistent-periods-across-year-pages'}}
    result={'url':item['courseUrl'],'publicUrl':item['courseUrl'],'status':200,'file':key+'.body',
        'fetchedAt':max(s['fetchedAt'] for s in good),'sha256':hashlib.sha256(content).hexdigest(),
        'contentType':'text/html','programs':[item],
        'selection':{'assembly':'concatenated-public-year-pages','sourcePages':[
            {'url':s['url'],'sha256':s['sha256'],'status':s['status']} for s in good],
            'unavailablePages':[s['url'] for s in pages if s['status']!=200]}}
    if len(periods)==1:result['curriculumPeriod']=next(iter(periods))
    write(CACHE/(key+'.meta.json'),result)
    return result


def main():
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
    kd=ktu_directory(academic['tr-karadeniz-teknik-universitesi'])
    ik=discover('tr-izmir-katip-celebi-universitesi','https://ubs.ikc.edu.tr/AIS/OutcomeBasedLearning/Home/Index',academic['tr-izmir-katip-celebi-universitesi'])
    directories=[kd,ik];write(CACHE/'ktu-ikcu-directories.json',directories)
    print('directories',[(d['universityId'],len(d['matched'])) for d in directories],flush=True)
    def collect(item):
        if item['universityId']==kd['universityId']:return ktu_courses(item)
        return {**fetch(item['courseUrl'],item['payload']),'publicUrl':item['publicUrl'],
            'family':'ubys','payload':item['payload'],'programs':[item]}
    output=[]
    with ThreadPoolExecutor(4) as pool:
        futures=[pool.submit(collect,p) for d in directories for p in d['matched']]
        for f in as_completed(futures):
            output.append(f.result())
            if len(output)%20==0:print('courses',len(output),'/',len(futures),flush=True)
    write(CACHE/'ktu-ikcu-courses.json',output)


if __name__=='__main__':main()
