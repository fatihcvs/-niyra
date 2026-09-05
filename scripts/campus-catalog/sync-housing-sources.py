"""Cache public GSB directories and OSM accommodation for reproducible research.

Run from the repository root with Python 3. No credentials or third-party packages.
Existing responses are reused; remove an individual cache file to refresh it.
"""
import argparse
import concurrent.futures
import hashlib
import html
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

CACHE = pathlib.Path('.sites-runtime/housing')
CACHE.mkdir(parents=True, exist_ok=True)
AGENT = 'Kampira-Campus-Research/1.0 (+https://github.com/fatihcvs/-niyra)'


def fetch(url, path, data=None):
    if path.exists():
        return path.read_text(encoding='utf-8')
    req = urllib.request.Request(url, data=data, headers={'User-Agent': AGENT})
    with urllib.request.urlopen(req, timeout=240) as response:
        text = response.read().decode('utf-8-sig')
    path.write_text(text, encoding='utf-8')
    return text


def plain(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()


def sync_gsb():
    paths = fetch('https://kygm.gsb.gov.tr/StaticPages/map/js/paths.js', CACHE / 'paths.js')
    provinces = [(m[1], re.search(r"metin:\s*'([^']+)'", m[2])[1])
                 for m in re.finditer(r'(\w+):\s*\{([^}]+)\}', paths, re.S) if 'metin:' in m[2]]
    assert len(provinces) == 82, len(provinces)  # 81 provinces and the GSB Cyprus directory.
    tasks = [(kind, slug, city) for slug, city in provinces for kind in ['public', 'private']]

    def read(task):
        kind, slug, city = task
        domain = 'kygm.gsb.gov.tr' if kind == 'public' else 'ozelbarinmahizmetleri.gsb.gov.tr'
        endpoint = 'gettesis' if kind == 'public' else 'getozeltesis'
        url = f'https://{domain}/Ajax/{endpoint}.aspx?il={slug}'
        path = CACHE / f'{kind}-{slug}.html'
        was_cached = path.exists()
        data = fetch(url, path)
        rows = []
        cards = re.split(r'<div\s+class="col-md-6\b[^\"]*"[^>]*>', data, flags=re.I)[1:]
        for card in cards:
            heading = re.search(r'<span class="style1">(.*?)</span>', card, re.S)
            if not heading:
                raise ValueError(f'Facility card without a name: {url}')
            name, rest = plain(heading[1]), card[heading.end():]
            fields = re.findall(r'<span class="style1">([^<]+)</span>(.*?)(?:<br\s*/>|</div>)', rest, re.S)
            fields = {plain(k).rstrip(' :'): plain(v) for k, v in fields}
            if name.rstrip(' :') in ['Tipi', 'Telefon', 'Faks', 'Adres', 'Kapasite']:
                raise ValueError(f'Field label misread as facility name: {url}')
            external = re.search(r'tesis(?:popupac|popac)\(\x27([^\x27]+)', rest)
            external_id = external[1].split(',')[0] if external else hashlib.sha256((name + fields['Adres']).encode()).hexdigest()[:16]
            rows.append({'id': f'gsb-{kind}-{external_id}', 'name': name, 'kind': kind,
                         'city': city, 'provinceSlug': slug, 'address': fields['Adres'],
                         'gender': fields.get('Tipi', ''), 'phone': fields.get('Telefon', ''),
                         'capacity': int(fields['Kapasite']) if fields.get('Kapasite', '').isdigit() else None,
                         'sourceUrl': url, 'checkedAt': datetime.fromtimestamp(path.stat().st_mtime, timezone(timedelta(hours=3))).date().isoformat(),
                         'detailUrl': f"https://{domain}/ajax/{'tesispopup' if kind == 'public' else 'OzelYurtPopup'}.aspx?id={external_id}&il={external[1].split(',')[1]}" if external else ''})
        if not was_cached:
            time.sleep(0.4)
        return {'kind': kind, 'city': city, 'sourceUrl': url, 'sha256': hashlib.sha256(data.encode()).hexdigest(), 'records': rows}

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(read, tasks):
            results.append(result)
            print(result['kind'], result['city'], len(result['records']), flush=True)
    payload = {'retrievedAt': datetime.now(timezone.utc).isoformat(), 'directories': results}
    (CACHE / 'gsb-directories.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print('GSB complete:', sum(len(x['records']) for x in results), flush=True)


def sync_details():
    source = json.loads((CACHE / 'gsb-directories.json').read_text(encoding='utf-8'))
    rows = [r for directory in source['directories'] for r in directory['records']]

    def read(row):
        url = row['detailUrl']
        path = CACHE / f"detail-{row['id']}.html"
        was_cached = path.exists()
        try:
            data = fetch(url, path)
            coords = re.findall(r'google\.com/maps/[^"\s]*[?&](?:amp;)?query=\(?\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)', html.unescape(data))
            points = list(dict.fromkeys((float(a), float(b)) for a, b in coords))
            return {'id': row['id'], 'url': url, 'coordinates': points,
                    'sha256': hashlib.sha256(data.encode()).hexdigest()}
        except Exception as error:
            return {'id': row['id'], 'url': url, 'coordinates': [], 'error': str(error)}
        finally:
            if not was_cached:
                time.sleep(0.6)  # Two workers, at most ~3 requests/second; persistent cache.

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(read, rows):
            results.append(result)
            if len(results) % 50 == 0:
                (CACHE / 'gsb-details.json').write_text(json.dumps(results, ensure_ascii=False), encoding='utf-8')
                print(f"Details {len(results)}/{len(rows)}; maps {sum(bool(x['coordinates']) for x in results)}; errors {sum('error' in x for x in results)}", flush=True)
    (CACHE / 'gsb-details.json').write_text(json.dumps(results, ensure_ascii=False), encoding='utf-8')
    print('GSB details complete', len(results), flush=True)


def sync_osm():
    query = '''[out:json][timeout:180];(
      nwr["building"="dormitory"](34.0,25.0,43.0,45.0);
      nwr["amenity"="dormitory"](34.0,25.0,43.0,45.0);
      nwr["tourism"~"^(hotel|hostel|guest_house|apartment)$"](34.0,25.0,43.0,45.0);
    );out center tags;'''
    (CACHE / 'housing.overpassql').write_text(query, encoding='utf-8')
    payload = urllib.parse.urlencode({'data': query}).encode()
    result = fetch('https://overpass-api.de/api/interpreter', CACHE / 'osm-housing.json', payload)
    parsed = json.loads(result)
    if parsed.get('remark'):
        raise RuntimeError(parsed['remark'])
    print('OSM accommodation elements:', len(parsed['elements']), flush=True)


def sync_geography():
    metadata = json.loads(fetch('https://www.geoboundaries.org/api/current/gbOpen/TUR/ADM1/', CACHE / 'tur-adm1-meta.json'))
    geometry_url = metadata['gjDownloadURL'].replace('.geojson', '_simplified.geojson')
    borders = json.loads(fetch(geometry_url, CACHE / 'tur-adm1.geojson'))
    assert len(borders['features']) == 81, 'Expected all 81 province boundaries'
    query = '[out:json][timeout:180];rel(2514541);out body geom;'
    boundary = json.loads(fetch('https://overpass-api.de/api/interpreter', CACHE / 'north-cyprus-geometry.json',
                               urllib.parse.urlencode({'data': query}).encode()))
    assert boundary['elements'][0].get('members'), 'Region geometry is missing'
    print('Geography complete: 81 provinces and Cyprus region geometry', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', choices=['gsb', 'osm', 'details', 'geography'])
    args = parser.parse_args()
    {'gsb': sync_gsb, 'osm': sync_osm, 'details': sync_details, 'geography': sync_geography}[args.source]()
