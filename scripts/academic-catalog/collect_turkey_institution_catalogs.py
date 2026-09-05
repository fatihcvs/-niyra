"""Adapters for Selçuk, Pamukkale and Atatürk's published programme directories."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import re
from urllib.parse import urljoin, urlencode, parse_qs, urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write, fair_tasks
from discover_turkey_courses import match
from parse_cyprus_courses import clean


def selcuk(university):
    items=[]
    for degree,label in [('bachelor','lisans'),('associate','onlisans')]:
        url=f'https://bologna.selcuk.edu.tr/tr/partialBirimListele/?id={label}'
        d=soup(fetch(url))
        for a in d.select('a[href*="/Dersler/"]'):
            parents=a.find_parents('li');title=parents[0].find('text');unit=parents[-1].find('text')
            if not title or not unit:continue
            items.append({'title':clean(title.get_text()),'unit':clean(unit.get_text()),'degree':degree,
                'courseUrl':urljoin(url,a['href']),'directoryUrl':f'https://bologna.selcuk.edu.tr/tr/Birimler/{label}'})
    return items


def pamukkale(university):
    url='https://ebs.pusula.pau.edu.tr/bilgigoster/DereceProgram.aspx?lng=1'
    d=soup(fetch(url));items=[]
    for a in d.select('a[href*="Program.aspx?"]'):
        params=parse_qs(urlparse(a['href']).query)
        degree={'1':'associate','3':'bachelor'}.get(params.get('dzy',[''])[0])
        if not degree or '(Aktif)' not in a.get_text():continue
        h=a.find_previous('a',href=re.compile('BirimBilgi.aspx'))
        title=re.sub(r'^\d+\s+|\s*\(Aktif\)\s*$','',clean(a.get_text()))
        items.append({'title':title,'unit':clean(h.get_text()) if h else None,'degree':degree,
            'courseUrl':urljoin(url,a['href']),'directoryUrl':url})
    return items


def ataturk(university):
    items=[]
    for bt,degree in [('1','associate'),('2','bachelor')]:
        api=f'https://obs.atauni.edu.tr/moduller/islem/eobs/getirBirimlerByBtId/{bt}/'
        source=fetch(api)
        if source['status']!=200:continue
        queue=[(n,n['label']) for n in read(CACHE/source['file'])]
        seen=set()
        while queue:
            current=queue;queue=[]
            with ThreadPoolExecutor(4) as pool:
                futures={pool.submit(fetch,api+n['id']):(n,unit) for n,unit in current if n['id'] not in seen}
                for f in as_completed(futures):
                    node,unit=futures[f];seen.add(node['id']);s=f.result()
                    if s['status']!=200:continue
                    for n in read(CACHE/s['file']):
                        if str(n.get('bt_id')) in ['21','33']:
                            title=re.sub(r'\s*\(\d+\)\s*$','',n['label'])
                            url='https://obs.atauni.edu.tr/moduller/dbp/eobs/birimDetay/'+n['id']+'/'+n['label']
                            items.append({'title':title,'unit':unit,'degree':degree,'courseUrl':url,
                                'directoryUrl':f'https://obs.atauni.edu.tr/moduller/dbp/eobs/birimListe/{bt}','family':'ataturk'})
                        elif str(n.get('inode')).lower()=='true':queue.append((n,unit))
    return items


def collect(item):
    s=fetch(item['courseUrl'])
    if item.get('family')!='ataturk':
        result={**s,'programs':[item]}
        if 'ebs.pusula.pau.edu.tr' in item['courseUrl']:
            selected=soup(s).select_one('select[id$="ddlDonem"] option[selected]')
            if selected:result['curriculumPeriod']=selected.get_text(' ',strip=True)
        return result
    d=soup(s);program=d.select_one('#program_id');years=d.select('#ay_id option')
    if not program:return {**s,'programs':[item]}
    for year in [o for o in years if re.match(r'202[4-6]\b',o.get_text())][:3]:
        payload={'ay_id':year['value'],'program_id':program['value']}
        source=fetch('https://obs.atauni.edu.tr/moduller/islem/eobs/getirProgramMufredat',urlencode(payload).encode(),'application/x-www-form-urlencoded')
        if source['status']!=200:continue
        rows=read(CACHE/source['file'])
        if isinstance(rows,list) and len(rows)>=3:
            return {**source,'programs':[item],'family':'ataturk','payload':payload,'publicUrl':item['courseUrl'],
                'curriculumPeriod':year.get_text(' ',strip=True)}
    return {**s,'programs':[item]}


def main():
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities'];directories=[]
    adapters={'tr-selcuk-universitesi':selcuk,'tr-pamukkale-universitesi':pamukkale,'tr-ataturk-universitesi':ataturk}
    with ThreadPoolExecutor(3) as pool:
        futures={pool.submit(fn,universities[uid]):uid for uid,fn in adapters.items()}
        for f in as_completed(futures):
            uid=futures[f];items=f.result();matched=[]
            for item in {i['courseUrl']:i for i in items}.values():
                p=match(universities[uid],item)
                if p:matched.append({**item,'universityId':uid,'programId':p['id'],'name':p['name']})
            counts={}
            for m in matched:counts[m['programId']]=counts.get(m['programId'],0)+1
            directories.append({'universityId':uid,'matched':[m for m in matched if counts[m['programId']]==1],
                'unmatched':[i for i in items if not match(universities[uid],i)]})
            write(CACHE/'institution-directories.json',directories)
            print(uid,len(directories[-1]['matched']),'programmes',flush=True)
    tasks={p['courseUrl']:p for d in directories for p in d['matched']};output=[]
    with ThreadPoolExecutor(10) as pool:
        futures=[pool.submit(collect,p) for url,p in fair_tasks(tasks)]
        for f in as_completed(futures):
            try:output.append(f.result())
            except Exception as e:print(type(e).__name__,str(e)[:100],flush=True)
            if len(output)%25==0:
                write(CACHE/'institution-courses.json',output);print('courses',len(output),'/',len(tasks),flush=True)
    write(CACHE/'institution-courses.json',output)


if __name__=='__main__':main()
