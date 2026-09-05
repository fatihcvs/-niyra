"""Revisit public OIBS entrances recovered from current official navigation."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse, urlencode
from turkey_research import CACHE, ROOT, read, write, fetch, soup
from discover_turkey_courses import directory, match, links
from collect_turkey_web_curricula import pair
from parse_cyprus_courses import clean, fold


ROOTS = {
    'tr-manisa-celal-bayar-universitesi': 'https://obsapp.mcbu.edu.tr/oibs/bologna/index.aspx',
    'tr-hakkari-universitesi': 'https://obs.hakkari.edu.tr/oibs/bologna/index.aspx',
    'tr-istanbul-esenyurt-universitesi': 'https://obs.esenyurt.edu.tr/oibs/bologna/index.aspx',
    'tr-ibn-haldun-universitesi': 'https://obs.ihu.edu.tr/oibs/bologna/index.aspx',
}


def discover(uid, root, university):
    source = fetch(root, retry_failed=True); doc = soup(source)
    dirs = [u for u in links(doc,source.get('finalUrl',root))
        if re.search(r'/unitSelection.aspx\?type=(?:lis|myo)&',u,re.I)]
    items=[]; unmatched=[]
    for url in dirs:
        response = fetch(url,retry_failed=True)
        for item in directory(soup(response),response,uid):
            if uid!='tr-ibn-haldun-universitesi' and not match(university,item):
                unmatched.append(item);continue
            page = fetch(item['url'],retry_failed=True)
            navigation=links(soup(page),page.get('finalUrl',item['url']))
            if uid=='tr-ibn-haldun-universitesi' and not match(university,item):
                about=next((u for u in navigation if '/progAbout.aspx?' in u),None)
                if about:
                    doc=soup(fetch(about)); language=None
                    for row in doc.select('tr'):
                        cells=[clean(c.get_text(' ',strip=True)) for c in row.find_all('td',recursive=False)]
                        if len(cells)>=2 and cells[0]=='Dili':language=cells[1]
                    if language=='İngilizce':
                        title=re.sub(r'\s+Lisans Programı$','',item['title'])+' (İngilizce)'
                        item={**item,'sourceTitle':item['title'],'title':title, 'identityEvidenceUrl':about}
                if not match(university,item):unmatched.append(item);continue
            actual = [u for u in navigation
                if '/oibs/bologna/progCourses.aspx?' in u and urlparse(u).hostname==urlparse(root).hostname]
            if len(actual)==1:items.append({**item,'courseUrl':actual[0]})
    result=pair(uid,university,items);result['source']=source
    result['unmatched']+=unmatched
    return result


def collect(item):
    source={**fetch(item['courseUrl'],retry_failed=True),'programs':[item]}
    if item['universityId']=='tr-istanbul-esenyurt-universitesi':
        source['family']='esenyurt';doc=soup(source)
        choices=[]
        for option in doc.select('#cmbYillar option[value]'):
            label=clean(option.get_text())
            year=re.match(r'^(20\d{2})\b',label)
            if year and not re.search(r'\b(cap|yandal|cift anadal|dgs|yatay)\b',fold(label)):
                choices.append((int(year[1]),option['value'],label))
        latest=[c for c in choices if c[0]==max(x[0] for x in choices)] if choices else []
        if len(latest)!=1:
            return {**source,'selectionError':'ambiguous-latest-curriculum'}
        _,value,label=latest[0]
        selected=doc.select_one('#cmbYillar option[selected]')
        if not selected or selected.get('value')!=value:
            payload={x['name']:x.get('value','') for x in doc.select('input[type="hidden"][name]')}
            payload['cmbYillar']=value
            source={**fetch(item['courseUrl'],urlencode(payload).encode(),'application/x-www-form-urlencoded'),
                'programs':[item],'family':'esenyurt'}
        selected=soup(source).select_one('#cmbYillar option[selected]')
        if not selected or selected.get('value')!=value:return {**source,'selectionError':'curriculum-selection-not-confirmed'}
        source['selection']={'curriculumId':value,'curriculumName':label,'method':'public-form-select'}
    selected=soup(source).select_one('#cmbYillar option[selected]')
    if selected:source['curriculumPeriod']=clean(selected.get_text(' ',strip=True))
    return source


def main():
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities'];directories=[]
    with ThreadPoolExecutor(4) as pool:
        futures={pool.submit(discover,uid,url,universities[uid]):uid for uid,url in ROOTS.items()}
        for f in as_completed(futures):
            try: result=f.result()
            except Exception as e:result={'universityId':futures[f],'matched':[],'error':str(e)}
            directories.append(result);write(CACHE/'recovered-oibs-directories.json',directories)
            print(result['universityId'],len(result['matched']),flush=True)
    output=[]
    with ThreadPoolExecutor(6) as pool:
        futures=[pool.submit(collect,p) for d in directories for p in d['matched']]
        for f in as_completed(futures):
            output.append(f.result())
            if len(output)%25==0:write(CACHE/'recovered-oibs-courses.json',output);print('Responses',len(output),flush=True)
    write(CACHE/'recovered-oibs-courses.json',output);print('Complete',len(output),flush=True)


if __name__=='__main__':main()
