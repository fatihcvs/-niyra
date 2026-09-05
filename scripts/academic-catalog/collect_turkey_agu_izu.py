"""Follow the public AGUCAT and IZU undergraduate catalogues and their linked plans."""
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, urlencode
from turkey_research import CACHE, ROOT, read, write, fetch, soup
from discover_turkey_courses import match, links
from collect_turkey_web_curricula import pair
from parse_cyprus_courses import clean, fold


AGU_NAMES = {
    'ELECTRICAL-ELECTRONICS ENGINEERING': 'Elektrik-Elektronik Mühendisliği',
    'INDUSTRIAL ENGINEERING': 'Endüstri Mühendisliği', 'CIVIL ENGINEERING': 'İnşaat Mühendisliği',
    'MECHANICAL ENGINEERING': 'Makine Mühendisliği', 'COMPUTER ENGINEERING': 'Bilgisayar Mühendisliği',
    'ARCHITECTURE': 'Mimarlık', 'BUSINESS ADMINISTRATION': 'İşletme',
    'MOLECULAR BIOLOGY AND GENETICS': 'Moleküler Biyoloji ve Genetik', 'BIOENGINEERING': 'Biyomühendislik',
    'ECONOMICS': 'Ekonomi', 'PSYCHOLOGY': 'Psikoloji',
    'POLITICAL SCIENCE AND INTERNATIONAL RELATION': 'Siyaset Bilimi ve Uluslararası İlişkiler',
    'MATERIALS SCIENCE AND NANOTECHNOLOGY ENGINEERING': 'Malzeme Bilimi ve Nanoteknoloji Mühendisliği',
}
AGU_UNITS = {
    'FACULTY OF ENGINEERING': 'Mühendislik Fakültesi', 'FACULTY OF ARCHITECTURE': 'Mimarlık Fakültesi',
    'FACULTY OF MANAGERIAL SCIENCES': 'Yönetim Bilimleri Fakültesi',
    'FACULTY OF LIFE AND NATURAL SCIENCES': 'Yaşam ve Doğa Bilimleri Fakültesi',
    'SCHOOL OF HUMANITIES AND SOCIAL SCIENCES': 'İnsan ve Toplum Bilimleri Fakültesi',
}


def agu(university):
    url = 'https://cat.agu.edu.tr/Department'
    language_url = 'https://ydyo-en.agu.edu.tr/why_emi'
    language = fold(soup(fetch(language_url)).get_text(' ', strip=True))
    assert re.search(r'all faculty programs.*are taught in english', language), 'AGU language evidence changed'
    items = []
    for row in soup(fetch(url)).select('tr'):
        cs = row.find_all('td', recursive=False)
        if len(cs) != 2: continue
        a = cs[1].select_one('a[href*="/Department/DepartmentContent/"]')
        original = clean(cs[1].get_text(' ', strip=True)); unit = AGU_UNITS.get(clean(cs[0].get_text()))
        if not a or original not in AGU_NAMES or not unit: continue
        public = urljoin(url, a['href']); doc = soup(fetch(public))
        if not re.search(r"Qualification Awarded\s+(?:Bachelor|First Cycle \(Bachelor|Undergraduate /)", doc.get_text(' ', strip=True)): continue
        item = {'title': AGU_NAMES[original]+' (İngilizce)', 'sourceTitle': original, 'unit': unit,
            'degree': 'bachelor', 'directoryUrl': url, 'identityEvidenceUrl': language_url}
        if not match(university, item): continue
        target = next((u for u,t in links(doc, public).items() if t == 'Course Structure'
            and urlparse(u).hostname == 'cat.agu.edu.tr'), None)
        if target: items.append({**item, 'courseUrl': target, 'family': 'agu'})
    return pair('tr-abdullah-gul-universitesi', university, items)


def izu(university):
    url = 'https://www.izu.edu.tr/icerik/tum-programlar'
    client_url = 'https://www.izu.edu.tr/Common/Js/fakultemenu.js'
    client = fetch(client_url)
    script = (CACHE/client['file']).read_text(encoding='utf-8') if client['status'] == 200 else ''
    assert "case 'DersPlaniveAkts'" in script and '/MyWidgets/FacultyPages/DersPlaniAktsKredileri.aspx' in script
    items = []
    for table in soup(fetch(url)).select('table.handbook-degree-listing'):
        headers = table.select('thead tr')[0].find_all('th', recursive=False)
        if len(headers) < 2 or clean(headers[1].get_text()) != 'Lisans': continue
        for row in table.select('tbody tr'):
            cs = row.find_all('td', recursive=False)
            if len(cs) < 2: continue
            a = cs[1].select_one('a[href]')
            if not a: continue
            title = clean(cs[0].get_text(' ', strip=True)); public = urljoin(url, a['href'])
            if '/bolumler/' not in public or urlparse(public).hostname != 'www.izu.edu.tr': continue
            doc = soup(fetch(public)); faculty_path = urlparse(public).path.split('/bolumler/')[0]
            unit = next((clean(x.get_text(' ', strip=True)) for x in doc.select('a[href]')
                if urlparse(urljoin(public,x['href'])).path.rstrip('/') == faculty_path), None)
            tab = doc.select_one('a[page-type="DersPlaniveAkts"][data-lang][data-bot][data-abn]')
            item = {'title': title, 'unit': unit, 'degree': 'bachelor', 'directoryUrl': url}
            if not unit or not tab or not match(university,item): continue
            params = {k: tab['data-'+v] for k,v in [('lang','lang'),('bot','bot'),('abn','abn')]}
            target = urljoin(url, '/MyWidgets/FacultyPages/DersPlaniAktsKredileri.aspx')+'?'+urlencode(params)
            items.append({**item, 'courseUrl':target, 'publicUrl':public, 'family':'izu',
                'selection': {'clientUrl':client_url, 'parameters':params}})
    return pair('tr-istanbul-sabahattin-zaim-universitesi', university, items)


def collect(item):
    source = {**fetch(item['courseUrl']), 'programs':[item], 'family':item['family']}
    if item.get('publicUrl'): source['publicUrl'] = item['publicUrl']
    if item.get('selection'): source['selection'] = item['selection']
    selected = soup(source).select_one(('#cmbYillar' if item['family']=='agu' else '#ddlYears')+' option[selected]')
    if selected: source['curriculumPeriod'] = clean(selected.get_text(' ',strip=True))
    return source


def main():
    academic = read(ROOT/'data/academic-catalog-2026.json')['universities']
    with ThreadPoolExecutor(2) as pool:
        futures = [pool.submit(agu,academic['tr-abdullah-gul-universitesi']),
            pool.submit(izu,academic['tr-istanbul-sabahattin-zaim-universitesi'])]
        directories = [f.result() for f in futures]
    write(CACHE/'agu-izu-directories.json', directories)
    print('Matched',[(d['universityId'],len(d['matched'])) for d in directories],flush=True)
    with ThreadPoolExecutor(4) as pool:
        output = list(pool.map(collect,[p for d in directories for p in d['matched']]))
    write(CACHE/'agu-izu-courses.json',output)
    print('Responses',len(output),flush=True)


if __name__=='__main__': main()
