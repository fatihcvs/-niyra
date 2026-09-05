"""Resumable public-source collection for Turkey's programme curricula.

No account or cookie is used. Responses and content hashes stay in an ignored
research cache; only validated programme records are published separately.
"""
import argparse
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import threading
import time
from urllib.parse import urljoin, urlparse, quote
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.sites-runtime/turkey-courses'
CACHE.mkdir(parents=True, exist_ok=True)
UA = 'KampiraAcademicCatalog/1.0 (+https://github.com/fatihcvs/-niyra)'
_guard = threading.Lock()
_locks, _hosts = {}, {}


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path, data):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes((json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    temporary.replace(path)


def fair_tasks(tasks):
    """Interleave hosts so one slow site cannot occupy every worker slot."""
    hosts=defaultdict(deque)
    for url,refs in tasks.items():hosts[urlparse(url).hostname].append((url,refs))
    while hosts:
        for host in list(hosts):
            yield hosts[host].popleft()
            if not hosts[host]:del hosts[host]


def collect_program_pages(directories, output_name):
    tasks={}
    for directory in directories:
        for p in directory['matched']:tasks.setdefault(p['courseUrl'],[]).append(p)
    output=[]
    with ThreadPoolExecutor(16) as pool:
        futures={pool.submit(fetch,url):refs for url,refs in fair_tasks(tasks)}
        for f in as_completed(futures):
            output.append({**f.result(),'programs':futures[f]})
            if len(output)%50==0:
                write(CACHE/(output_name+'.json'),output)
                print('courses',len(output),'/',len(tasks),flush=True)
    write(CACHE/(output_name+'.json'),output)


def fetch(url, payload=None, content_type=None, retry_failed=False):
    body = json.dumps(payload, ensure_ascii=False).encode() if isinstance(payload, (dict, list)) else payload
    key = hashlib.sha256(url.encode() + (body or b'')).hexdigest()[:24]
    with _guard:
        lock = _locks.setdefault(key, threading.Lock())
        host = _hosts.setdefault(urlparse(url).hostname, threading.Semaphore(2))
    meta_path, body_path = CACHE / (key + '.meta.json'), CACHE / (key + '.body')
    with lock:
        if meta_path.exists():
            cached=read(meta_path)
            if cached['status']==200 or not retry_failed:return cached
        meta = {'url': url, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'file': body_path.name}
        with host:
            try:
                headers = {'User-Agent': UA}
                if body is not None:
                    headers['Content-Type'] = content_type or 'application/json'
                request = Request(quote(url, safe=':/?=&%+#@;,$!()*-._~'), data=body, headers=headers)
                with urlopen(request, timeout=35) as response:
                    content = response.read(30_000_001)
                    if len(content) > 30_000_000:
                        raise ValueError('Source exceeds research download limit')
                    meta.update(status=response.status, finalUrl=response.url,
                        contentType=response.headers.get('Content-Type', ''), sha256=hashlib.sha256(content).hexdigest())
                body_path.write_bytes(content)
            except Exception as error:
                meta.update(status=getattr(error, 'code', 0), error=str(error))
                # Schannel can validate chains absent from Python's trust store.
                if any(e in str(error) for e in ['CERTIFICATE_VERIFY_FAILED','UNSAFE_LEGACY_RENEGOTIATION_DISABLED','SSLV3_ALERT_HANDSHAKE_FAILURE']):
                    arguments=[]
                    if body is not None:
                        request_path=CACHE/(key+'.request')
                        request_path.write_bytes(body)
                        arguments=['--header','Content-Type: '+(content_type or 'application/json'),'--data-binary','@'+str(request_path)]
                    result = subprocess.run(['curl.exe', '--silent', '--show-error', '--fail', '--location',
                        '--max-time', '35', '--user-agent', UA, '--output', str(body_path),
                        '--write-out', '%{http_code}\n%{url_effective}\n%{content_type}', *arguments, url], capture_output=True, text=True, errors='replace')
                    if result.returncode == 0:
                        status, final_url, content_type = result.stdout.split('\n', 2)
                        content = body_path.read_bytes()
                        meta.update(status=int(status), finalUrl=final_url, contentType=content_type,
                            sha256=hashlib.sha256(content).hexdigest(), nativeTls=True)
                        meta.pop('error', None)
            write(meta_path, meta)
            time.sleep(.25)
        return meta


def soup(source):
    if source['status'] != 200:return BeautifulSoup('', 'html.parser')
    content=(CACHE/source['file']).read_bytes()
    # Some official pages retain an obsolete single-byte charset declaration.
    try:content=content.decode('utf-8-sig')
    except UnicodeDecodeError:pass
    return BeautifulSoup(content, 'html.parser')


def linked_sources(document, base):
    pattern = re.compile(r'bologna|bilgi.?paket|ders.?katalog|course.?catalog|eğitim.?bilgi|eğitim.?öğretim.?bilgi|akts|ects|/ebp/|/ebs/', re.I)
    return list({urljoin(base, a['href']).replace('http://','https://',1): a.get_text(' ', strip=True) for a in document.select('a[href]')
        if pattern.search(a['href'] + ' ' + a.get_text()) and urljoin(base, a['href']).startswith(('https://','http://'))}.items())


def collect(mode):
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    universities = {uid: u for uid, u in academic['universities'].items() if u['region'] == 'Türkiye'}
    tasks = {}
    if mode == 'homepages':
        logos = read(ROOT / 'data/university-logos-2026.json')['logos']
        for uid in universities:
            url = logos.get(uid, {}).get('officialWebsite')
            if url:
                tasks.setdefault(url.replace('http://', 'https://', 1), []).append({'universityId': uid})
    else:
        for uid, u in universities.items():
            for p in u['programs']:
                for url in p.get('curriculumUrls', []):
                    tasks.setdefault(url, []).append({'universityId': uid, 'programId': p['id'], 'name': p['name']})
    output = []
    with ThreadPoolExecutor(10) as pool:
        futures = {pool.submit(fetch, url): refs for url, refs in fair_tasks(tasks)}
        for future in as_completed(futures):
            source = future.result()
            source = {**source, 'programs': futures[future]}
            if mode == 'homepages' and source['status'] == 200:
                source['catalogLinks'] = linked_sources(soup(source), source.get('finalUrl', source['url']))
            output.append(source)
            if len(output) % 25 == 0:
                write(CACHE / (mode + '.json'), output)
                print(mode, len(output), '/', len(tasks), 'ok', sum(s['status'] == 200 for s in output), flush=True)
    write(CACHE / (mode + '.json'), output)
    print(mode, 'complete', len(output), 'ok', sum(s['status'] == 200 for s in output), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['homepages', 'known'])
    collect(parser.parse_args().mode)
