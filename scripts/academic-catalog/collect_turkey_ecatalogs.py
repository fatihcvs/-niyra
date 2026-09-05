"""Public EBP, ABP and institution-specific HTML programme directories."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
from turkey_research import CACHE, ROOT, fetch, read, soup, write, fair_tasks
from discover_turkey_courses import links, match, normal
from parse_cyprus_courses import clean

ROOTS = {
    'omu': 'https://ubs.omu.edu.tr/ogrenci/ebp/organizasyon.aspx?Mod=1&kultur=tr-TR',
    'tr-ege-universitesi':'https://ebp.ege.edu.tr/DereceProgramlari/1',
    'tr-anadolu-universitesi':'https://abp.anadolu.edu.tr/tr/akademik/lisans',
    'tr-bursa-uludag-universitesi':'https://bilgipaketi.uludag.edu.tr/Programlar/Index/33',
    'tr-aydin-adnan-menderes-universitesi':'https://akts.adu.edu.tr/',
    'tr-bilecik-seyh-edebali-universitesi':'https://ebs.bilecik.edu.tr/Bolumler?BolumAd=Lisans',
    'tr-duzce-universitesi':'https://ebs.duzce.edu.tr/tr-TR/Program/Index/2',
    'tr-izmir-tinaztepe-universitesi':'https://ebp.tinaztepe.edu.tr/DereceProgramlari/1?lang=tr-TR',
    'tr-istanbul-nisantasi-universitesi':'https://ebp.nisantasi.edu.tr/dereceprogramlari/1',
    'tr-ordu-universitesi':'https://bologna.odu.edu.tr/dereceprogramlari/1',
    'tr-yozgat-bozok-universitesi':'https://ebp.bozok.edu.tr/DereceProgramlari/1',
    'tr-eskisehir-teknik-universitesi':'https://akts.eskisehir.edu.tr/tr/akademik/lisans',
}


def discover(uid, root, university):
    first=fetch(root); d=soup(first); dirs={root}
    for url,title in links(d,first.get('finalUrl',root)).items():
        if normal(title) in ['lisans','onlisans','on lisans','lisans programlari','onlisans programlari']:
            dirs.add(url.strip())
    items=[]
    for url in dirs:
        s=fetch(url);doc=soup(s)
        degree='associate' if re.search(r'/onLisans\b|Mod=0\b|Program/Index/1\b|Programlar/Index/21\b|degree-programmes/2\b|DereceProgramlari/0\b',url,re.I) else 'bachelor'
        # EBP publishes a jsTree endpoint containing programme, unit and language.
        api=re.search(r'"url"\s*:\s*"([^"\n]*DereceProgramlari/GetJson/[^"\n]+)"',str(doc))
        if api:
            src=fetch(urljoin(url,api[1])); tree=read(CACHE/src['file']) if src['status']==200 else []
            def walk(nodes,unit=None,parent=None):
                for n in nodes:
                    title=clean(n['text']); href=(n.get('a_attr') or {}).get('href')
                    if not unit:walk(n.get('children') or [],title,None)
                    elif n.get('children'):walk(n['children'],unit,title)
                    elif href and '/Detay/' in href:
                        title=parent or title
                        language=re.search(r'\((İngilizce|Almanca|Fransızca|Arapça)\)',n['text'])
                        if language and language[0] not in title:title+=' '+language[0]
                        items.append({'title':title,'unit':unit,'degree':degree,'url':urljoin(url,href),'courseUrl':urljoin(url,href),'directoryUrl':url})
            walk(tree)
        for a in doc.select('a[href]'):
            href=a['href'];title=clean(a.get_text());unit=None;target=urljoin(url,href)
            if 'organizasyon.aspx' in href and 'program=' in href:
                h=a.find_previous('span',class_='UstBirimNode');unit=clean(h.get_text()) if h else None
                course=target
            elif '/program/programProfili/' in href or '/program/hakkinda/' in href:
                h=a.find_previous('a',href=re.compile('/birim/genelBilgi/'));unit=clean(h.get_text()) if h else None
                course=None
            elif '/programme-detail/' in href:
                p=a.find_parent('li',class_='list-group-item');h=p.find(['div','span','b','strong','a'],recursive=False) if p else None
                unit=clean(h.get_text()) if h else None;course=None
            elif '/Program/Bolum?BolumNo=' in href:
                parents=list(a.parents)
                panel=next((p for p in parents if p.get('id') in ['onLisansPanel','lisansPanel','lisansUstuPanel']),None)
                if not panel or panel['id']=='lisansUstuPanel':continue
                degree='associate' if panel['id']=='onLisansPanel' else 'bachelor'
                card=next((p for p in parents if 'collapse' in p.get('class',[])),None)
                unit=card.get('id','').replace('-',' ') if card else None;course=None
            elif '/Bolum/OgretimProgrami/' in href:
                title=title.replace('(Normal Öğretim)','').strip()
                parent=a.parent.parent.parent
                h=parent.find('a',recursive=False)
                unit=clean(h.get_text()) if h else None;course=target
            else:continue
            items.append({'title':title,'unit':unit,'degree':degree,'url':target,'courseUrl':course,'directoryUrl':url})
        for row in doc.select('tr[onclick]'):
            m=re.search(r"location.href='([^']*Programlar/Detay/[^']+)'",row['onclick'])
            if not m:continue
            heading=row.find_previous(['h3','h4','h5','strong'])
            items.append({'title':clean(row.get_text()),'unit':clean(heading.get_text()) if heading else None,
                'degree':degree,'url':urljoin(url,m[1]),'courseUrl':urljoin(url,m[1]),'directoryUrl':url})
    mapped=[]
    for item in {x['url']:x for x in items}.values():
        p=match(university,item)
        if not p:continue
        if not item['courseUrl']:
            s=fetch(item['url']); ls=links(soup(s),s.get('finalUrl',item['url']))
            choices=[u for u in ls if re.search(r'/course-structure/|/program/dersler/|/Program/DersPlani\?',u)]
            if len(choices)!=1:continue
            item['courseUrl']=choices[0]
        mapped.append({**item,'universityId':uid,'programId':p['id'],'name':p['name']})
    counts={}
    for m in mapped:counts[m['programId']]=counts.get(m['programId'],0)+1
    return {'universityId':uid,'matched':[m for m in mapped if counts[m['programId']]==1],
        'unmatched':[i for i in items if not match(university,i)]}


def main():
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities'];directories=[]
    if (CACHE/'expanded-homepages.json').exists():
        for h in read(CACHE/'expanded-homepages.json'):
            for url,title in h['catalogLinks']:
                source=fetch(url)
                degree=next((u for u,t in links(soup(source),source.get('finalUrl',url)).items()
                    if re.search(r'/DereceProgramlari/1\b',u,re.I)),None)
                if degree:ROOTS[h['programs'][0]['universityId']]=degree
    with ThreadPoolExecutor(8) as pool:
        futures={pool.submit(discover,uid,url,universities[uid]):uid for uid,url in ROOTS.items()}
        for f in as_completed(futures):
            try:directories.append(f.result())
            except Exception as e:directories.append({'universityId':futures[f],'error':str(e),'matched':[]})
            write(CACHE/'ecatalog-directories.json',directories)
            print('directories',len(directories),'matches',sum(len(d['matched']) for d in directories),flush=True)
    tasks={}
    for d in directories:
        for p in d['matched']:tasks.setdefault(p['courseUrl'],[]).append(p)
    output=[]
    with ThreadPoolExecutor(14) as pool:
        futures={pool.submit(fetch,url):refs for url,refs in fair_tasks(tasks)}
        for f in as_completed(futures):
            output.append({**f.result(),'programs':futures[f]})
            if len(output)%40==0:
                write(CACHE/'ecatalog-courses.json',output);print('courses',len(output),'/',len(tasks),flush=True)
    write(CACHE/'ecatalog-courses.json',output)


if __name__=='__main__':main()
