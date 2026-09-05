"""Cached, rate-limited primary-source collection for the Cyprus catalogue.

Run from the repository root with Python 3. Collection never edits product data.
Each fetched source retains its URL, status, checksum and actual retrieval time.
"""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import time
import subprocess
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / '.sites-runtime/cyprus-expansion'
CACHE.mkdir(parents=True, exist_ok=True)
AGENT = 'KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def fetch(url, payload=None):
    key = hashlib.sha256((url + (payload.decode() if payload else '')).encode()).hexdigest()[:24]
    meta_path = CACHE / f'{key}.meta.json'
    body_path = CACHE / f'{key}.body'
    cached = read(meta_path) if meta_path.exists() else None
    if cached and not ('CERTIFICATE_VERIFY_FAILED' in cached.get('error', '') and not cached.get('nativeTlsAttempted')):
        return cached
    meta = {'url': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'file': body_path.name}
    try:
        request = urllib.request.Request(urllib.parse.quote(url, safe=':/?=&%+#@;,$!()*-._~'), data=payload, headers={'User-Agent': AGENT})
        with urllib.request.urlopen(request, timeout=90) as response:
            content = response.read()
            meta.update(status=response.status, finalUrl=response.url, contentType=response.headers.get('Content-Type', ''),
                        sha256=hashlib.sha256(content).hexdigest(), bytes=len(content))
        body_path.write_bytes(content)
    except Exception as error:
        meta.update(status=getattr(error, 'code', 0), error=str(error))
        # Windows curl uses the system trust store; keep TLS validation enabled.
        if 'CERTIFICATE_VERIFY_FAILED' in str(error) and not payload and shutil.which('curl.exe'):
            meta['nativeTlsAttempted'] = True
            result = subprocess.run(['curl.exe', '--silent', '--show-error', '--fail', '--location',
                '--max-time', '90', '--user-agent', AGENT, '--output', str(body_path),
                '--write-out', '%{http_code}\n%{url_effective}\n%{content_type}', url], capture_output=True, text=True)
            if result.returncode == 0:
                status, final_url, content_type = result.stdout.split('\n', 2)
                content = body_path.read_bytes()
                meta.update(status=int(status), finalUrl=final_url, contentType=content_type,
                            sha256=hashlib.sha256(content).hexdigest(), bytes=len(content))
                meta.pop('error', None)
    write(meta_path, meta)
    time.sleep(.3)
    return meta


def cyqaa():
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    tasks = {}
    for uid, university in academic['universities'].items():
        if university['region'] != 'Kıbrıs Cumhuriyeti':
            continue
        for programme in university['programs']:
            for url in programme.get('curriculumUrls', []):
                if 'dipae.ac.cy/' in url and url.lower().endswith('.pdf'):
                    tasks.setdefault(url, []).append({'universityId': uid, 'programId': programme['id'], 'name': programme['name']})
    output = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(fetch, tasks):
            output.append({**result, 'programs': tasks[result['url']]})
            if len(output) % 25 == 0:
                write(CACHE / 'cyqaa-downloads.json', output)
                print(f"CYQAA {len(output)}/{len(tasks)}, success {sum(r['status'] == 200 for r in output)}", flush=True)
    write(CACHE / 'cyqaa-downloads.json', output)
    print('CYQAA complete', len(output), flush=True)


def places():
    query = '''[out:json][timeout:180];(
      nwr["name"]["amenity"~"^(university|college|research_institute|library|coworking_space|internet_cafe|cafe|restaurant|fast_food|food_court|community_centre|cinema|theatre|arts_centre|events_venue|hospital|clinic|pharmacy|doctors|dentist|bus_station|ferry_terminal|taxi|bicycle_rental|bank|atm|post_office)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["building"~"^(university|college|library)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["office"~"^(educational_institution|research)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["leisure"~"^(sports_centre|fitness_centre|stadium|sports_hall|pitch|swimming_pool|park|garden)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["tourism"~"^(museum|gallery|attraction)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["highway"="bus_stop"](34.5,32.1,35.8,34.7);
      nwr["name"]["public_transport"~"^(station|stop_position|platform)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["shop"~"^(supermarket|convenience|books|copyshop|stationery|mall|department_store|laundry|computer)$"](34.5,32.1,35.8,34.7);
      nwr["name"]["place"~"^(suburb|neighbourhood|quarter|town|village)$"](34.5,32.1,35.8,34.7);
    );out center tags;'''
    result = fetch('https://overpass-api.de/api/interpreter', urllib.parse.urlencode({'data': query}).encode())
    if result['status'] != 200:
        raise RuntimeError(result)
    data = read(CACHE / result['file'])
    if data.get('remark'):
        raise RuntimeError(data['remark'])
    write(CACHE / 'cyprus-places-source.json', {**result, 'query': query, 'snapshot': data.get('osm3s', {}).get('timestamp_osm_base')})
    write(CACHE / 'cyprus-places.json', data)
    print('Cyprus named place elements:', len(data['elements']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['cyqaa', 'places'])
    args = parser.parse_args()
    {'cyqaa': cyqaa, 'places': places}[args.mode]()
