"""Institution-published HTML curricula, keeping faculty and language identity."""
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin, urlparse, parse_qs, urlencode
from turkey_research import CACHE, ROOT, fetch, read, soup, write, collect_program_pages
from discover_turkey_courses import match, normal, links
from parse_cyprus_courses import clean


def pair(uid, university, items):
    matched=[];unmatched=[]
    for item in {i['courseUrl']:i for i in items}.values():
        p=match(university,item)
        if p:matched.append({**item,'universityId':uid,'programId':p['id'],'name':p['name']})
        else:unmatched.append(item)
    groups=defaultdict(list)
    for p in matched:groups[p['programId']].append(p)
    return {'universityId':uid,'matched':[g[0] for g in groups.values() if len(g)==1],'unmatched':unmatched}


def medipol(uid, university, home):
    doc=soup(fetch(home));base='https://'+urlparse(home).netloc
    units={u:t for u,t in links(doc,home).items() if re.fullmatch(re.escape(base)+r'/akademik/(?:fakulteler|yuksekokullar|meslek-yuksekokullari)/[^/?#]+',u)}
    unit_names={normal(u['name']):u['name'] for u in university['units']}
    items=[]
    for unit_url,label in units.items():
        unit_doc=soup(fetch(unit_url))
        h=unit_doc.find('h1');unit_title=clean(h.get_text()) if h else label
        unit=unit_names.get(normal(unit_title)) or unit_names.get(normal(label))
        if not unit:continue
        degree='associate' if '/meslek-yuksekokullari/' in unit_url else 'bachelor'
        children={u:t for u,t in links(unit_doc,unit_url).items() if re.fullmatch(re.escape(unit_url)+r'/(?:bolumler|programlar)/[^/?#]+',u)}
        # Single-programme faculties publish their curriculum on the unit page.
        candidates=[(unit_url,re.sub(r'\s+Fakültesi$','',unit_title))] if not children else list(children.items())
        for url,title in candidates:
            title=re.sub(r'\s*\(Türkçe\)','',title,flags=re.I)
            item={'title':title,'unit':unit,'degree':degree,'directoryUrl':unit_url}
            if not match(university,item):continue
            page=soup(fetch(url));ls=links(page,url)
            course=next((u.split('#')[0] for u,t in ls.items() if u.startswith(url+'/') and re.search(r'/(?:program-hakkinda|program-bilgileri)(?:#.*)?$',u)),None)
            if course:items.append({**item,'courseUrl':course})
    return pair(uid,university,items)


def ogu(university):
    uid='tr-eskisehir-osmangazi-universitesi';items=[]
    aliases={'Bilgisayar ve Öğretim Teknolojileri Eğitimi':'Bilgisayar ve Öğretim Teknolojileri Öğretmenliği',
        'Fen Bilgisi':'Fen Bilgisi Öğretmenliği','Matematik':'İlköğretim Matematik Öğretmenliği',
        'Okul Öncesi':'Okul Öncesi Öğretmenliği','Özel Eğitim':'Özel Eğitim Öğretmenliği',
        'Sınıf Öğretmenl':'Sınıf Öğretmenliği','RPD':'Rehberlik ve Psikolojik Danışmanlık'}
    for path,degree in [('Lisans','bachelor'),('Onlisans','associate')]:
        url='https://ects.ogu.edu.tr/'+path;doc=soup(fetch(url))
        for a in doc.select('a[href^="/'+path+'/Program/"]'):
            unit_link=a.find_previous('a',href=re.compile(r'^/Birimler/Index/'))
            if not unit_link:continue
            unit=clean(unit_link.get_text());original=clean(a.get_text())
            version=re.search(r'\((20\d\d)\)$',original)
            title=re.sub(r'\s*\(20\d\d\)$','',original)
            title=re.sub(r'\s+Bölümü$','',title)
            if unit=='Eğitim Fakültesi':title=aliases.get(title,title)
            title=title.replace('Hukuk Fakültesi','Hukuk')
            item={'title':title,'sourceTitle':original,'unit':unit,'degree':degree,
                'directoryUrl':url,'courseUrl':urljoin(url,a['href'])}
            if version:item['planYear']=int(version[1])
            items.append(item)
    # The catalogue lists old and revised teacher plans together; keep the
    # latest explicitly labelled revision for the same subject and faculty.
    newest={}
    for item in items:
        key=(normal(item['title']),normal(item['unit']))
        newest[key]=max(newest.get(key,0),item.get('planYear',0))
    items=[i for i in items if i.get('planYear',0)==newest[(normal(i['title']),normal(i['unit']))]]
    return pair(uid,university,items)


def ieu(university):
    uid='tr-izmir-ekonomi-universitesi';items=[]
    evidence='https://oim.ieu.edu.tr/tr/ingilizce-hazirlik-sinavi'
    policy=fetch(evidence)
    if policy['status']!=200:raise ValueError('IEU language policy unavailable')
    assert "programlarının tümünde eğitim dili %100 İngilizce" in soup(policy).get_text(' ',strip=True), 'IEU language declaration changed'
    aliases={'Grafik Tasarım':'Grafik Tasarımı','Tıp Fakültesi':'Tıp','İngilizce Mütercim Tercümanlık':'İngilizce Mütercim ve Tercümanlık',
        'İçmimarlık ve Çevre Tasarımı':'İç Mimarlık ve Çevre Tasarımı','İç Mekân Tasarımı':'İç Mekan Tasarımı'}
    # Translation programmes already name their language in the registry.
    unqualified={'Hukuk','Hemşirelik','Fizyoterapi ve Rehabilitasyon','Beslenme ve Diyetetik','İngilizce Mütercim ve Tercümanlık'}
    for path,degree in [('firstCycle.php','bachelor'),('shortCycle.php','associate')]:
        url='https://ects.ieu.edu.tr/new/'+path+'?lang=tr';doc=soup(fetch(url))
        for a in doc.select('a[href*="akademik.php?section="]'):
            table=a.find_parent('table');heading=table.find_previous('h4') if table else None
            if not heading:continue
            unit=clean(heading.get_text());original=clean(a.get_text())
            title=re.sub(r'\s*\(Türkçe\)','',original,flags=re.I)
            title=re.sub(r'\s+(?:Bölümü|Programı)$','',title)
            title=aliases.get(title,title)
            if degree=='bachelor' and title not in unqualified:title+=' (İngilizce)'
            target=urljoin(url,a['href']);page=soup(fetch(target+'&lang=tr'))
            course=next((u for u,t in links(page,target).items() if 'sid=curr' in u),None)
            if not course:continue
            # Public UI carries subject and locale in its anonymous session.
            # Keep those published values in the bookmarkable curriculum URL.
            params=parse_qs(urlparse(target).query);params.update(lang=['tr'],sid=['curr'])
            course=course.split('?')[0]+'?'+urlencode({k:v[0] for k,v in params.items()})
            identity_evidence=evidence
            if title=='Tıp (İngilizce)':
                identity_evidence='https://www.ieu.edu.tr/tr/bylaws/type/read/id/91'
                medicine=fetch(identity_evidence)
                assert medicine['status']==200 and 'dışında İngilizcedir' in soup(medicine).get_text(' ',strip=True), 'Medicine language declaration changed'
            items.append({'title':title,'sourceTitle':original,'unit':unit,'degree':degree,
                'courseUrl':course,'directoryUrl':url,'identityEvidenceUrl':identity_evidence})
    return pair(uid,university,items)


def main():
    a=read(ROOT/'data/academic-catalog-2026.json')['universities']
    work=[lambda:medipol('tr-istanbul-medipol-universitesi',a['tr-istanbul-medipol-universitesi'],'https://www.medipol.edu.tr/akts-bilgi-paketi'),
        lambda:medipol('tr-ankara-medipol-universitesi',a['tr-ankara-medipol-universitesi'],'https://www.ankaramedipol.edu.tr/ogrenci/akts-bilgi-paketi-0'),
        lambda:ogu(a['tr-eskisehir-osmangazi-universitesi']),lambda:ieu(a['tr-izmir-ekonomi-universitesi'])]
    directories=[]
    with ThreadPoolExecutor(4) as pool:
        for f in as_completed([pool.submit(fn) for fn in work]):
            d=f.result();directories.append(d);print(d['universityId'],len(d['matched']),flush=True)
            write(CACHE/'web-curricula-directories.json',directories)
    collect_program_pages(directories,'web-curricula-courses')


if __name__=='__main__':main()
