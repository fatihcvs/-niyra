"""Follow official faculty navigation to programme-specific PDF curricula."""
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin
from turkey_research import CACHE,ROOT,fetch,read,write,soup
from discover_turkey_courses import links,normal,match
from parse_cyprus_courses import clean,fold

UID='tr-piri-reis-universitesi'
DMYO='https://dmyo.pirireis.edu.tr/'
ENGINEERING='https://muhendislik.pirireis.edu.tr/'
POLICY='https://aday.pirireis.edu.tr/sikca-sorulan-sorular/'
PROGRAMMES=DMYO+'hakkimizda/bolum-ve-programlar/'


def programme_pages(url):
    queue=[url];seen=set();pages=[]
    while queue and len(seen)<8:
        link=queue.pop(0)
        if link in seen:continue
        seen.add(link);source=fetch(link,retry_failed=True);doc=soup(source)
        pages.append((source,doc))
        meta=doc.find('meta',attrs={'http-equiv':re.compile('refresh',re.I)})
        if meta:
            target=re.search(r'url\s*=\s*[\'\"]?([^\'\">]+)',meta.get('content',''),re.I)
            if target and urljoin(link,target[1].strip()).startswith(url):queue.append(urljoin(link,target[1].strip()))
        queue += [u for u,t in links(doc,link).items() if u.startswith(url) and u not in seen and re.search(r'dosya|müfredat|ders plan|eğitim plan',t,re.I)]
    return pages


def collect(item,university,policies,english_engineering):
    url,label=item;associate=url.startswith(DMYO);pages=programme_pages(url)
    options=[]
    for page,doc in pages:
        for pdf,caption in links(doc,page['url']).items():
            title=fold(caption)
            if not pdf.lower().endswith('.pdf') or 'ders plani' not in title or re.search(r'once|secmeli|ingilizce',title):continue
            if associate:
                name=re.sub(r'\s+(?:Programı\s+)?Ders Planı.*$','',caption).replace('&','ve')
                if name=='Sualtı Teknolojisi':name='Su Altı Teknolojisi'
                language=policies.get(normal(name).replace(' ',''))
                if not language:continue
                if '%100 ingilizce' in language:name+=' (İngilizce)'
                evidence=PROGRAMMES
            else:
                if not english_engineering:continue
                heading=next((clean(h.get_text()) for _,d in pages for h in d.select('h1,h2,h3,h4') if 'Mühendisliği' in h.get_text()),'')
                name=re.sub(r'\s+Hakkında$','',heading)+' (İngilizce)';evidence=POLICY
            reference={'title':name,'unit':'Denizcilik Meslek Yüksekokulu' if associate else 'Mühendislik Fakültesi',
                'degree':'associate' if associate else 'bachelor','directoryUrl':page['url'],'courseUrl':pdf,'identityEvidenceUrl':evidence}
            program=match(university,reference)
            if not program:continue
            years=re.findall(r'\b(?:19|20)\d{2}\b',caption)
            options.append((int(years[0]) if years else 0,caption,reference,program))
    if not options:return {'unavailable':url}
    latest=max(o[0] for o in options);options=[o for o in options if o[0]==latest]
    options=list({o[2]['courseUrl']:o for o in options}.values())
    if len(options)!=1:return {'ambiguous':url}
    _,caption,reference,program=options[0];source=fetch(reference['courseUrl'],retry_failed=True)
    if source['status']!=200:return {'unavailable':reference['courseUrl']}
    import pdfplumber
    with pdfplumber.open(CACHE/source['file']) as pdf:
        header=(pdf.pages[0].extract_text() or '')[:900]
    # Confirm programme identity in the PDF itself, above its course rows.
    expected=normal(re.sub(r'\s*\(İngilizce\)$','',reference['title'])).replace(' ','')
    # The linked maritime-engineering PDF misspells this word in its heading;
    # both its programme-page link and programme directory spell it correctly.
    checked_header=normal(header).replace('gemi makineleri isletmecilgi','gemi makineleri isletmeciligi')
    if expected not in checked_header.replace(' ',''):return {'headerMismatch':source['url'],'header':header[:500]}
    reference.update(universityId=UID,programId=program['id'],name=program['name'])
    selection={'method':'official-programme-pdf-link','linkLabel':caption,'programUrl':url,'headerVerified':True}
    period=re.search(r'\b(20\d{2}-20\d{2} Akademik Yılı ve Sonrası)\b',caption)
    source={**source,'family':'piri-pdf','programs':[reference],'selection':selection}
    if period:source['curriculumPeriod']=period[1]
    return {'item':reference,'source':source}


def main():
    u=read(ROOT/'data/academic-catalog-2026.json')['universities'][UID]
    doc=soup(fetch(PROGRAMMES));policies={}
    for li in doc.select('li'):
        text=clean(li.get_text(' ',strip=True))
        if re.search(r'\(%(?:30|100) İngilizce',text):
            policies[normal(text.split('(')[0]).replace(' ','')]=fold(text)
    english='fakulte genelinde egitim dili ingilizcedir' in fold(soup(fetch(POLICY)).get_text(' ',strip=True))
    programmes={}
    for root in [DMYO,ENGINEERING]:
        programmes.update({url:t for url,t in links(soup(fetch(root)),root).items() if re.fullmatch(re.escape(root)+r'(?:programlar|bolumler)/[^/]+/',url)})
    with ThreadPoolExecutor(4) as pool:results=list(pool.map(lambda item:collect(item,u,policies,english),programmes.items()))
    courses=[r['source'] for r in results if r.get('source')]
    write(CACHE/'piri-courses.json',courses)
    write(CACHE/'piri-directories.json',[{'universityId':UID,'source':fetch(PROGRAMMES),'matched':[r['item'] for r in results if r.get('item')],
        'unmatched':[],'unavailable':[r for r in results if not r.get('source')]}])
    print('Piri Reis',len(courses),'PDF programmes; unavailable:',[r for r in results if not r.get('source')],flush=True)


if __name__=='__main__':main()
