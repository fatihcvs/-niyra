"""Read older published curriculum choices when the new academic year is empty."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
from http.cookiejar import CookieJar
import json
import re
from urllib.parse import urlencode, urlparse, urljoin, parse_qs
from urllib.request import build_opener, HTTPCookieProcessor, Request
from turkey_research import CACHE, UA, fetch, read, soup, write
from parse_turkey_courses import parse_source, PARSER_VERSION


def duzce(source):
    doc=soup(source);select=doc.select_one('#BolognaYil')
    if not select:return None
    for option in select.select('option')[1:3]:
        year=option['value'];url=source['url']
        payload={'yilNo':year,'bolumOgretimTurNo':parse_qs(urlparse(url).query)['bot'][0],
            'returnURL':urlparse(url).path+'?'+urlparse(url).query}
        key=hashlib.sha256((url+'\n'+json.dumps(payload)).encode()).hexdigest()[:24]
        path=CACHE/(key+'.meta.json')
        if path.exists():result=read(path)
        else:
            result={'url':url,'file':key+'.body','status':0,'fetchedAt':datetime.now(timezone.utc).isoformat(),
                'curriculumPeriod':option.get_text(' ',strip=True),'publicUrl':url,
                'selectionUrl':urljoin(url,'/tr-TR/Home/BolognaYilGuncelle'),'selection':{'yilNo':year}}
            # An isolated anonymous cookie jar only stores the site's year selector.
            # It is discarded after this programme; cookies are never persisted.
            opener=build_opener(HTTPCookieProcessor(CookieJar()))
            def request(target,body=None):
                headers={'User-Agent':UA}
                if body is not None:headers['Content-Type']='application/json'
                with opener.open(Request(target,data=json.dumps(body).encode() if body is not None else None,headers=headers),timeout=35) as response:
                    return response.read(30_000_000)
            try:
                request(url);request(result['selectionUrl'],payload);content=request(url)
                (CACHE/result['file']).write_bytes(content)
                result.update(status=200,sha256=hashlib.sha256(content).hexdigest(),contentType='text/html')
            except Exception as e:result['error']=str(e)
            write(path,result)
        courses,_=parse_source(result)
        if len(courses)>=3:return {**result,'programs':source['programs']}
    return None


def oibs(source):
    doc=soup(source);select=doc.select_one('select[name="cmbYillar"]')
    if not select:return None
    for option in select.select('option')[1:4]:
        label=option.get_text(' ',strip=True)
        if re.search(r'yandal|çift anadal|\bçap\b|\baf\b',label,re.I):continue
        params={e['name']:e.get('value','') for e in doc.select('input[type="hidden"][name]')}
        params.update({'cmbYillar':option['value'],'__EVENTTARGET':'cmbYillar','__EVENTARGUMENT':''})
        result=fetch(source['url'],urlencode(params).encode(),'application/x-www-form-urlencoded')
        courses,_=parse_source(result)
        if len(courses)>=3:
            return {**result,'programs':source['programs'],'curriculumPeriod':label,
                'selection':{'cmbYillar':option['value']},'publicUrl':source['url']}
    return None


def main():
    sources=[]
    for name in ['known','discovered-courses','additional-courses','ecatalog-courses']:
        file=CACHE/(name+'.json')
        if file.exists():sources+=read(file)
    candidates=[]
    for s in {s['file']:s for s in sources}.values():
        if s['status']!=200:continue
        if 'ebs.duzce.edu.tr' in s['url']:
            if 'Seçili yıl için Aktif müfredat yok' in soup(s).get_text():candidates.append((duzce,s))
        elif '/oibs/bologna/progCourses.aspx' in s['url']:
            parsed=CACHE/(s['file']+'.'+PARSER_VERSION+'.parsed.json')
            if parsed.exists() and len(read(parsed)['courses'])<3:candidates.append((oibs,s))
    previous=CACHE/'previous-plan-courses.json'
    output=read(previous) if previous.exists() else []
    recovered={s['programs'][0]['programId'] for s in output}
    candidates=[(fn,s) for fn,s in candidates if s['programs'][0]['programId'] not in recovered]
    with ThreadPoolExecutor(8) as pool:
        futures=[pool.submit(fn,source) for fn,source in candidates]
        for count,f in enumerate(as_completed(futures),1):
            try:
                if result:=f.result():output.append(result)
            except Exception as e:print(type(e).__name__,str(e)[:100],flush=True)
            write(CACHE/'previous-plan-courses.json',output)
            if count%15==0:print('checked',count,'/',len(futures),'recovered',len(output),flush=True)
    print('complete',len(candidates),'checked',len(output),'recovered',flush=True)


if __name__=='__main__':main()
