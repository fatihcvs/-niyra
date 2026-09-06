"""Catalogue entry points with checked evidence; never infer a programme URL."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse
import hashlib
import re
from bs4 import ParserRejectedMarkup
from turkey_research import CACHE, ROOT, fetch, read, soup, write, fair_tasks
from discover_turkey_courses import links


def build():
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
    candidates=defaultdict(dict)
    browser_verified=defaultdict(list)
    # Successfully matched public directories are direct evidence of a catalogue.
    for name in ['discovery','additional-discovery','refined-discovery','expanded-discovery',
                 'ubys-directories','ecatalog-directories','institution-directories','more-directories',
                 'kocaeli-directories','istanbul-directories','language-directories','iau-directories']:
        path=CACHE/(name+'.json')
        if not path.exists():continue
        for d in read(path):
            for p in d.get('matched',[]):
                if p.get('directoryUrl'):
                    candidates[d['universityId']][p['directoryUrl']]='matched-programme-directory'
            for source in d.get('pages',[]):
                body=CACHE/source.get('file','')
                if (source.get('browserCapture') and source.get('status')==200 and body.is_file()
                        and re.fullmatch(r'[a-f0-9]{64}',source.get('sha256',''))):
                    if hashlib.sha256(body.read_bytes()).hexdigest()!=source['sha256']:continue
                    browser_verified[d['universityId']].append({
                        'url':source.get('publicUrl',source['url']),
                        'checkedAt':source['fetchedAt'][:10],
                        'sourceHash':source['sha256'],
                        'evidence':'matched-programme-directory'})
    for name in ['homepages','additional-homepages','expanded-homepages']:
        path=CACHE/(name+'.json')
        if not path.exists():continue
        for h in read(path):
            uid=h['programs'][0]['universityId']
            for url,title in h.get('catalogLinks',[]):
                if re.search(r'koordinator|komisyon|committee|/haber|/duyuru|rb-challenge|/event|\.pdf(?:$|\?)',url,re.I):continue
                candidates[uid].setdefault(url,'catalogue-navigation')
    tasks=defaultdict(list)
    for uid,urls in candidates.items():
        for url,basis in urls.items():
            if url.startswith('http://'):url='https://'+url[7:]
            if url.startswith('https://'):tasks[url].append((uid,basis))
    result=defaultdict(list,{uid:list(values) for uid,values in browser_verified.items()})
    with ThreadPoolExecutor(12) as pool:
        futures={pool.submit(fetch,url):refs for url,refs in fair_tasks(tasks)}
        for f in as_completed(futures):
            s=f.result()
            if s['status']!=200 or not s.get('sha256'):continue
            if re.search(r'(?:application/pdf|octet-stream|image/)', s.get('contentType', ''), re.I):continue
            final=s.get('finalUrl',s['url'])
            if not final.startswith('https://') or re.search(r'challenge|login|signin',final,re.I):continue
            try:doc=soup(s)
            except ParserRejectedMarkup:continue
            title=doc.title.get_text(' ',strip=True) if doc.title else ''
            if re.search('access denied|just a moment|security check|captcha',title,re.I):continue
            navigation=links(doc,final)
            degree_links=any(re.search(r'unitSelection|/akademik/tip/(?:L|OL)/|/dereceprogramlari/[01]|/home/(?:lisans|onlisans)|/birim/dersplan|/program/|ects.*(?:cycle|program)|/DegreePrograms',u,re.I) for u in navigation)
            for uid,basis in futures[f]:
                if basis=='catalogue-navigation' and not degree_links:continue
                result[uid].append({'url':final,'checkedAt':s['fetchedAt'][:10],
                    'sourceHash':s['sha256'],'evidence':basis})
    output={}
    for uid,u in academic.items():
        if u['region']!='Türkiye':continue
        # At most two degree entrances per hostname; retain distinct official systems.
        chosen=[];hosts=defaultdict(int)
        for c in sorted(result[uid],key=lambda c:(c['evidence']!='matched-programme-directory',len(c['url']),c['url'])):
            host=urlparse(c['url']).hostname
            if hosts[host]>=2 or any(c['url']==v['url'] for v in chosen):continue
            chosen.append(c);hosts[host]+=1
        output[uid]={'catalogs':chosen[:4], 'status':'catalogue-checked' if chosen else 'no-verified-entry'}
    write(ROOT/'data/turkey-catalog-sources-2026.json',output)
    print('Verified catalogue entrances:',sum(bool(u['catalogs']) for u in output.values()),'/',len(output),flush=True)


if __name__=='__main__':build()
