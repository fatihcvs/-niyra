"""Build the housing catalogue from cached primary sources, never from invented data.

Inputs: sync-housing-sources.py caches, the existing campus match report and
reviewed housing-editorial-2026.json. Output contains facts and source links;
raw HTML is kept locally for audit, not shipped to the browser.
"""
import collections
import hashlib
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone, timedelta
from housing_geo import fold, distance, prepare_feature, inside, boundary_rings

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / '.sites-runtime/housing'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, data):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    temporary.replace(path)


def safe_url(value):
    return value if isinstance(value, str) and re.match(r'^https?://[^\s]+$', value) else ''


def main():
    universities = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import { universities } from './lib/university-catalog.ts'; process.stdout.write(JSON.stringify(universities));"], cwd=ROOT, encoding='utf-8'))
    university_by_id = {u['id']: u for u in universities}
    # A rebuild must never make an old cached source appear freshly researched.
    checked_at = datetime.fromtimestamp((CACHE / 'gsb-directories.json').stat().st_mtime, timezone(timedelta(hours=3))).date().isoformat()
    gsb = read(CACHE / 'gsb-directories.json')
    details = {d['id']: d for d in read(CACHE / 'gsb-details.json')} if (CACHE / 'gsb-details.json').exists() else {}
    borders = [(f['properties']['shapeName'], prepare_feature(f)) for f in read(CACHE / 'tur-adm1.geojson')['features']]
    north = boundary_rings(read(CACHE / 'north-cyprus-geometry.json')['elements'][0])

    def cyprus_city(address, region):
        value = fold(address)
        cities = [('gazimagusa', 'Gazimağusa'), ('famagusta', 'Gazimağusa'), ('lefke', 'Lefke'), ('guzelyurt', 'Güzelyurt'), ('girne', 'Girne'), ('kyrenia', 'Girne'), ('iskele', 'İskele'), ('lefkos', 'Lefkoşa'), ('nicosia', 'Lefkoşa'), ('dikmen', 'Lefkoşa'), ('gonyeli', 'Lefkoşa')] if region == 'Kuzey Kıbrıs' else [('pafos', 'Pafos'), ('paphos', 'Pafos'), ('larnaka', 'Larnaka'), ('larnaca', 'Larnaka'), ('limassol', 'Limassol'), ('lemesos', 'Limassol'), ('nicosia', 'Nicosia'), ('lefkosia', 'Nicosia'), ('strovolos', 'Nicosia')]
        return next((city for key, city in cities if key in value), '')

    def locality(lat, lon):
        for name, geometry in borders:
            if inside((lon, lat), geometry):
                return name, 'Türkiye'
        if 34.5 < lat < 35.8 and 32.1 < lon < 34.7:
            return '', 'Kuzey Kıbrıs' if inside((lon, lat), north) else 'Kıbrıs Cumhuriyeti'
        return '', ''

    source_places = read(ROOT / 'data/campus-places-2026.json')['places']
    anchor_report = read(ROOT / 'research/housing-campus-inputs-2026.json')
    raw_anchors = anchor_report['anchorTags']
    official_campuses = read(ROOT / 'data/campus-place-official-sources-2026.json')['records']
    editorial = read(ROOT / 'data/housing-editorial-2026.json')
    campuses = []
    exclusions = []
    for anchor in anchor_report['selectedAnchors']:
        # A distance education office or administrative bureau is not a residential campus.
        if re.search(r'\b(aof|aöf)\b|burosu|bürosu', fold(anchor['name'])):
            exclusions.append({'anchor': anchor['osm'], 'reason': 'administrative-office'})
            continue
        u = university_by_id[anchor['universityId']]
        city, region = locality(anchor['latitude'], anchor['longitude'])
        if region != u['region']:
            exclusions.append({'anchor': anchor['osm'], 'reason': 'region-mismatch'})
            continue
        tags = raw_anchors[anchor['osm']]
        if any(c['universityId'] == u['id'] and c['latitude'] is not None and
               distance((c['latitude'], c['longitude']), (anchor['latitude'], anchor['longitude'])) < 400 for c in campuses):
            continue
        campuses.append({'id': f"{u['id']}:{anchor['osm'].replace('/', '-')}", 'universityId': u['id'],
                         'name': anchor['name'], 'city': city or tags.get('addr:city', ''), 'region': region,
                         'latitude': anchor['latitude'], 'longitude': anchor['longitude'],
                         'address': '', 'sourceUrl': f"https://www.openstreetmap.org/{anchor['osm']}"})

    province_names = {fold(name): name for name, _ in borders}
    for official in official_campuses:
        if official.get('kind') == 'administrative' and official['universityId'] != 'cy-cosmos-open-university':
            continue
        match = next((p for p in source_places if p['universityId'] == official['universityId'] and p['name'] == official['name']), None)
        lat, lon = (match.get('latitude'), match.get('longitude')) if match else (None, None)
        u = university_by_id[official['universityId']]
        city = next((v for k, v in province_names.items() if re.search(rf'\b{re.escape(k)}\b', fold(official['address']))), '') if u['region'] == 'Türkiye' else cyprus_city(official['address'], u['region'])
        campuses.append({'id': f"{u['id']}:official-{hashlib.sha256(official['name'].encode()).hexdigest()[:8]}",
                         'universityId': u['id'], 'name': official['name'], 'city': city, 'region': u['region'],
                         'latitude': lat, 'longitude': lon, 'address': official['address'], 'sourceUrl': official['sourceUrl']})
    for campus in editorial['campuses']:
        if campus.get('replaces'):
            campuses = [c for c in campuses if c['id'] not in campus['replaces']]
        campuses.append({k: v for k, v in campus.items() if k != 'replaces'})
    campuses.sort(key=lambda c: (c['universityId'], c.get('priority', 50)))

    # Do not accidentally fall back to the Ankara office for Ahmet Yesevi's Kazakhstan campuses.
    for u in universities:
        if not any(c['universityId'] == u['id'] for c in campuses):
            exclusions.append({'universityId': u['id'], 'reason': 'campus-needs-source'})

    places = []
    rejected_coordinates = []
    for directory in gsb['directories']:
        for row in directory['records']:
            region = 'Kuzey Kıbrıs' if row['provinceSlug'] == 'kibris' else 'Türkiye'
            detail = details.get(row['id'], {})
            lat = lon = None
            for point in detail.get('coordinates', []):
                point_city, point_region = locality(*point)
                if point_region == region and (region != 'Türkiye' or fold(point_city) == fold(row['city'])):
                    lat, lon = point
                    break
            if detail.get('coordinates') and lat is None:
                rejected_coordinates.append({'id': row['id'], 'reason': 'published-point-outside-province'})
            gender = {'kiz': 'female', 'erkek': 'male', 'karma': 'mixed', 'ayri': 'mixed'}.get(fold(row['gender']), 'unknown')
            places.append({'id': row['id'], 'name': row['name'], 'kind': 'public_dorm' if row['kind'] == 'public' else 'private_dorm',
                           'city': cyprus_city(row['address'], region) if region == 'Kuzey Kıbrıs' else row['city'], 'region': region,
                           'address': row['address'] if len(row['address'].strip(' 0.-')) > 3 else '', 'latitude': lat, 'longitude': lon,
                           'gender': gender, 'phone': row['phone'], 'website': '', 'capacity': row['capacity'], 'features': [],
                           'description': '', 'universityIds': [],
                           'source': {'type': 'government', 'url': row['detailUrl'] or row['sourceUrl'], 'checkedAt': row['checkedAt']},
                           'coordinateSourceUrl': detail.get('url', '') if lat is not None else ''})

    osm = read(CACHE / 'osm-housing.json')
    osm_checked_at = datetime.fromisoformat(osm['osm3s']['timestamp_osm_base'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=3))).date().isoformat()
    used_osm = []
    for element in osm['elements']:
        tags = element['tags']
        name = tags.get('name:tr') or tags.get('name') or tags.get('name:en') or ''
        if len(name) < 4 or re.search(r'lisesi|lise pansiyonu|ortaokul|ilkokul|imam hatip|kuran kursu|kur.an kursu|mudurlugu|yurt yonetimi|mosque|camii', fold(name)):
            continue
        if any(tags.get(k) in ['yes', 'construction', 'disused', 'abandoned'] for k in ['disused', 'abandoned', 'demolished', 'construction']):
            continue
        point = element.get('center', element)
        lat, lon = point['lat'], point['lon']
        # Limit the published map layer to named accommodation within 5 km of a known campus.
        close = [c for c in campuses if c['latitude'] is not None and abs(c['latitude']-lat) < .05 and abs(c['longitude']-lon) < .07
                 and distance((lat, lon), (c['latitude'], c['longitude'])) <= 5000]
        if not close:
            continue
        city, region = locality(lat, lon)
        if not any(c['region'] == region for c in close):
            continue
        kind = tags.get('tourism')
        if kind not in ['hotel', 'hostel', 'guest_house', 'apartment']:
            # Generic named blocks are not independently useful dormitory listings.
            if not re.search(r'yurt|dorm|residence|student|hall|konuk|misafir|ogrenci', fold(name)):
                continue
            kind = 'dorm'
        # Official GSB coordinates and matching distinctive name identify the same facility.
        key = re.sub(r'\b(kyk|gsb|ozel|yuksekogrenim|yuksekogretim|ogrenci|yurdu|yurt|kiz|erkek|dormitory)\b', ' ', fold(name))
        key = re.sub(r'\W+', ' ', key).strip()
        duplicate = False
        for official in places:
            if official['region'] != region or official['latitude'] is None or abs(official['latitude']-lat) > .004:
                continue
            official_key = re.sub(r'\b(kyk|gsb|ozel|yuksekogrenim|yuksekogretim|ogrenci|yurdu|yurt|kiz|erkek|dormitory)\b', ' ', fold(official['name']))
            official_key = re.sub(r'\W+', ' ', official_key).strip()
            if len(key) >= 5 and key == official_key and distance((lat, lon), (official['latitude'], official['longitude'])) < 300:
                duplicate = True; break
        if duplicate:
            continue
        if any(fold(p['name']) == fold(name) and p['latitude'] is not None and abs(p['latitude']-lat) < .003
               and distance((lat, lon), (p['latitude'], p['longitude'])) < 180 for p in used_osm):
            continue
        url = f"https://www.openstreetmap.org/{element['type']}/{element['id']}"
        address = tags.get('addr:full') or ', '.join(filter(None, [tags.get('addr:street'), tags.get('addr:housenumber'), tags.get('addr:suburb'), tags.get('addr:district'), tags.get('addr:city')]))
        features = []
        if tags.get('internet_access') == 'wlan': features.append('Wi-Fi')
        if tags.get('wheelchair') == 'yes': features.append('Tekerlekli sandalye erişimi')
        gender = 'female' if tags.get('female') == 'yes' and tags.get('male') == 'no' else 'male' if tags.get('male') == 'yes' and tags.get('female') == 'no' else 'unknown'
        p = {'id': f"osm-{element['type']}-{element['id']}", 'name': name, 'kind': kind, 'city': city or tags.get('addr:city', ''),
             'region': region, 'address': address, 'latitude': lat, 'longitude': lon, 'gender': gender,
             'phone': tags.get('contact:phone') or tags.get('phone', ''), 'website': safe_url(tags.get('contact:website') or tags.get('website')),
             'capacity': None, 'features': features, 'description': '', 'universityIds': [],
             'source': {'type': 'openstreetmap', 'url': url, 'checkedAt': osm_checked_at}, 'coordinateSourceUrl': url}
        used_osm.append(p)
    places.extend(used_osm)
    for record in editorial['places']:
        places = [p for p in places if p['id'] not in record.get('replaces', [])]
        places.append({k: v for k, v in record.items() if k != 'replaces'})
    excluded_ids = {p['id'] for p in editorial.get('excludedPlaces', [])}
    places = [p for p in places if p['id'] not in excluded_ids]
    checked_at = max(p['source']['checkedAt'] for p in places)

    coverage = []
    for u in universities:
        uc = [c for c in campuses if c['universityId'] == u['id']]
        nearby_ids = set()
        city_ids = set()
        for c in uc:
            for p in places:
                if u['id'] in p['universityIds']:
                    nearby_ids.add(p['id'])
                if c['city'] and fold(p['city']) == fold(c['city']) and p['region'] == c['region']:
                    city_ids.add(p['id'])
                if c['latitude'] is not None and p['latitude'] is not None and p['region'] == c['region'] and abs(c['latitude']-p['latitude']) < .05 and abs(c['longitude']-p['longitude']) < .07:
                    if distance((c['latitude'], c['longitude']), (p['latitude'], p['longitude'])) <= 5000:
                        nearby_ids.add(p['id'])
        coverage.append({'universityId': u['id'], 'universityName': u['name'], 'campuses': len(uc),
                         'locatedCampuses': sum(c['latitude'] is not None for c in uc), 'nearbyOrUniversityRecords': len(nearby_ids), 'cityRecords': len(city_ids)})
    meta = {'version': '2026.1', 'checkedAt': checked_at, 'universityCount': len(universities), 'campusCount': len(campuses),
            'recordCount': len(places), 'maxNearbyMeters': 5000, 'sourceCounts': dict(collections.Counter(p['source']['type'] for p in places)),
            'kindCounts': dict(collections.Counter(p['kind'] for p in places)), 'gsbDetailResponses': len(details),
            'osmSnapshotAt': osm.get('osm3s', {}).get('timestamp_osm_base'), 'distanceMethod': 'haversine-campus-point-straight-line',
            'attribution': ['© OpenStreetMap contributors, ODbL 1.0', 'geoBoundaries / William & Mary, OpenStreetMap, CC BY-SA 2.0', 'GSB public institutional directories']}
    write(ROOT / 'data/housing-catalog-2026.json', {'meta': meta, 'campuses': campuses, 'places': places})
    write(ROOT / 'research/housing-coverage-2026.json', {'meta': meta, 'universities': coverage, 'excludedAnchors': exclusions, 'rejectedCoordinates': rejected_coordinates})
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    print('NO RECORDS', [c['universityName'] for c in coverage if not c['nearbyOrUniversityRecords'] and not c['cityRecords']])


if __name__ == '__main__':
    main()
