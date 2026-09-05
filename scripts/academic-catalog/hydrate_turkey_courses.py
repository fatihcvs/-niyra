"""Resolve public curriculum pages that load their course tables separately."""
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urljoin
from turkey_research import CACHE, fetch, read, soup, write


def resolve(s):
    url = s['url']
    doc = soup(s)
    if 'bologna.ankara.edu.tr/program/' in url:
        years_source = fetch('https://bologna.ankara.edu.tr/api/PublicMufredatDers/getYillar', {})
        years = read(CACHE / years_source['file'])['data']
        active = next(y for y in years if y['aktifYilMi'])
        years = sorted([y for y in years if y['no'] <= active['no']], key=lambda y: y['no'], reverse=True)[:3]
        for year in years:
            payload = {'Id': url.split('/program/')[1].split('/')[0], 'Yil': None, 'YilNo': year['no']}
            source = fetch('https://bologna.ankara.edu.tr/api/PublicMufredatDers/getByProgram', payload)
            if source['status'] != 200: continue
            rows = read(CACHE / source['file']).get('data', [])
            if len(rows) >= 3:
                return {**source, 'programs': s['programs'], 'publicUrl': url, 'payload': payload, 'period': year['ad'], 'family': 'ankara'}
    elif 'meobs.marmara.edu.tr/ProgramTanitim/' in url:
        arguments = re.findall(r'loadMufredatDersListesi\("(\?[^"\n]+)"\)', str(doc))
        if arguments:
            source = fetch(urljoin(url, '/Mufredat/DersListesi') + arguments[0])
            return {**source, 'programs': s['programs'], 'publicUrl': url, 'family': 'marmara'}
    elif 'obs.itu.edu.tr/public/DersPlan/DersPlanlariList' in url:
        choices = []
        for a in doc.select('a[href*="DersPlanDetay/"]'):
            row = a.find_parent('tr')
            text = row.get_text(' ', strip=True) if row else ''
            if 'Sonrası' in text and not re.search('ÇAP|Çift Anadal|Yandal', text, re.I):
                choices.append(urljoin(url, a['href']))
        if len(choices) == 1:
            source = fetch(choices[0])
            return {**source, 'programs': s['programs'], 'directoryUrl': url, 'family': 'itu'}
    return None


def main():
    sources = [s for s in read(CACHE / 'known.json') if s['status'] == 200 and any(h in s['url'] for h in ['bologna.ankara', 'meobs.marmara', 'obs.itu'])]
    output = []
    with ThreadPoolExecutor(10) as pool:
        for result in pool.map(resolve, sources):
            if result: output.append(result)
            if len(output) % 25 == 0:
                write(CACHE / 'hydrated.json', output)
                print(len(output), '/', len(sources), flush=True)
    write(CACHE / 'hydrated.json', output)


if __name__ == '__main__': main()
