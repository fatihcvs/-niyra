"""Collect Çankaya's anonymous information-pack API using its public web client."""
from datetime import datetime, timezone
import hashlib
import json
import re
import time
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen
from turkey_research import CACHE, ROOT, UA, fetch, read, soup, write
from discover_turkey_courses import match
from parse_cyprus_courses import clean, fold

UID = 'tr-cankaya-universitesi'
HOME = 'https://bilgipaketi.cankaya.edu.tr/'
POLICY = 'https://www.cankaya.edu.tr/universite/genelbilgiler.php'
API = 'https://ogbs.cankaya.edu.tr/Api/InformationPack'


class PublicCatalog:
    def __init__(self):
        self.home = fetch(HOME)
        script = soup(self.home).select_one('script[type="module"][src^="/assets/index-"]')
        if script is None:
            raise ValueError('Public catalogue client is unavailable')
        self.client = fetch(urljoin(HOME, script['src']))
        body = (CACHE / self.client['file']).read_text(encoding='utf-8-sig')
        if 'baseURL:"' + API + '"' not in body:
            raise ValueError('Public catalogue API has changed')
        for route in ['/bachelors', '/associate', '/program-detay/:id']:
            if 'path:"' + route + '"' not in body:
                raise ValueError('Public programme navigation has changed')
        header = re.search(r'Authorization:"(Bearer [^"]+)"', body)
        if not header:
            raise ValueError('Public client configuration is unavailable')
        # The anonymous website supplies this header itself. Never log, hardcode
        # or serialize it; only use it on the observed public catalogue API.
        self._header = header[1]

    def get(self, endpoint, params):
        if endpoint not in ['/Fakulteler', '/Bolumler', '/WsPersonel', '/GrupDersleri']:
            raise ValueError('Not a public curriculum endpoint')
        url = API + endpoint + '?' + urlencode(params)
        key = hashlib.sha256(('cankaya-public:' + url).encode()).hexdigest()[:24]
        meta_path = CACHE / (key + '.meta.json')
        if meta_path.exists() and read(meta_path)['status'] == 200:
            return read(meta_path)
        result = {'url': url, 'file': key + '.body',
                  'fetchedAt': datetime.now(timezone.utc).isoformat()}
        try:
            request = Request(url, headers={'User-Agent': UA, 'Authorization': self._header})
            with urlopen(request, timeout=35) as response:
                body = response.read(10_000_001)
                if len(body) > 10_000_000:
                    raise ValueError('Public response exceeds download limit')
                json.loads(body)
                result.update(status=response.status, contentType=response.headers.get('Content-Type', ''),
                              sha256=hashlib.sha256(body).hexdigest())
            (CACHE / result['file']).write_bytes(body)
        except Exception as error:
            result.update(status=getattr(error, 'code', 0), error=type(error).__name__)
        write(meta_path, result)
        time.sleep(.3)
        return result


def programme_reference(raw, faculty, degree, policy_text):
    title = re.sub(r'\s*\((?:Ön Lisans|Lisans)\)\s*$', '', clean(raw['ProgramAdi']))
    unit = clean(faculty['FakTurkce'])
    # This is the official unit's spacing variant, not a faculty reassignment.
    if unit == 'Çankaya Meslek Yüksek Okulu':
        unit = 'Çankaya Meslek Yüksekokulu'
    exceptions = ['adalet meslek yuksekokulu', 'hukuk fakultesi',
                  'halkla iliskiler ve reklamcilik bolumu turkce']
    policy_verified = 'ogretim dili %100 ingilizcedir' in policy_text and all(x in policy_text for x in exceptions)
    turkish = title in ['Hukuk', 'Halkla İlişkiler ve Reklamcılık'] or 'Adalet Meslek' in unit
    if not policy_verified:
        raise ValueError('Official language policy requires review')
    if not turkish and title != 'İngilizce Mütercim ve Tercümanlık' and '(ingilizce)' not in fold(title):
        title += ' (İngilizce)'
    pid = str(raw['ProgramId'])
    if not pid.isdigit():
        raise ValueError('Invalid public programme identity')
    return {'title': title, 'sourceTitle': raw['ProgramAdi'], 'unit': unit,
            'degree': degree, 'universityId': UID, 'officialProgramId': pid,
            'directoryUrl': urljoin(HOME, 'bachelors' if degree == 'bachelor' else 'associate'),
            'courseUrl': urljoin(HOME, 'program-detay/' + pid) + '?' + urlencode({'n': raw['ProgramAdi'], 'ne': raw['ProgramAdiEn']}),
            'identityEvidenceUrl': POLICY}


def selected_plan(rows, pid):
    # Match the public client's curriculumList[0], never merge alternatives.
    if not isinstance(rows, list) or not rows:
        return None
    first = rows[0]
    if not isinstance(first, list) or len(first) < 8 or str(first[7]) != str(pid):
        raise ValueError('Curriculum programme identity does not match')
    if not str(first[0]).isdigit() or not clean(first[2]):
        raise ValueError('Invalid selected curriculum')
    return {'id': str(first[0]), 'name': clean(first[2])}


def courses(client, reference):
    pid = reference['officialProgramId']
    plans = client.get('/WsPersonel', {'method': 700, 'methodNo': 11, 'Params': pid})
    if plans['status'] != 200:
        return {**plans, 'programs': [reference]}
    plan = selected_plan(read(CACHE / plans['file']), pid)
    if not plan:
        return {**plans, 'family': 'cankaya', 'programs': [reference]}
    source = client.get('/WsPersonel', {'method': 700, 'methodNo': 14, 'Params': '3;' + pid + ';' + plan['id']})
    if source['status'] != 200:
        return {**source, 'programs': [reference]}
    rows = read(CACHE / source['file'])
    if not isinstance(rows, list) or any(not isinstance(r, list) or len(r) < 14 or str(r[0]) != plan['id'] for r in rows):
        raise ValueError('Courses do not belong to the selected curriculum')
    groups, pages = [], [plans, source]
    for row in rows:
        if str(row[5]).strip() != 'ELEC':
            continue
        params = {'BimKodu': row[2], 'MufredatNo': row[0], 'BolumKodu': row[1]}
        group = client.get('/GrupDersleri', params)
        pages.append(group)
        if group['status'] == 200:
            members = read(CACHE / group['file'])
            if not isinstance(members, list):
                raise ValueError('Invalid elective pool response')
            groups.append({'parent': row, 'courses': members})
    envelope = {'programId': pid, 'curriculum': plan, 'courses': rows, 'groups': groups}
    body = (json.dumps(envelope, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    key = hashlib.sha256(('cankaya-selected-plan:' + pid + ':' + plan['id']).encode()).hexdigest()[:24]
    (CACHE / (key + '.body')).write_bytes(body)
    result = {'url': source['url'], 'publicUrl': reference['courseUrl'], 'status': 200,
              'file': key + '.body', 'sha256': hashlib.sha256(body).hexdigest(),
              'contentType': 'application/json', 'family': 'cankaya', 'programs': [reference],
              'fetchedAt': max(p['fetchedAt'] for p in pages), 'curriculumPeriod': plan['name'],
              'selection': {'method': 'public-client-default-curriculum', 'curriculumId': plan['id'],
                            'officialProgramId': pid, 'clientUrl': client.client['url'],
                            'clientHash': client.client['sha256'],
                            'assembly': 'selected-curriculum-and-its-elective-pools',
                            'sourcePages': [{'url': p['url'], 'sha256': p['sha256'], 'status': 200}
                                            for p in pages if p['status'] == 200],
                            'unavailablePages': [p['url'] for p in pages if p['status'] != 200],
                            'emptyElectivePools': sum(not g['courses'] for g in groups)}}
    write(CACHE / (key + '.meta.json'), result)
    return result


def main():
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][UID]
    client = PublicCatalog()
    policy = fetch(POLICY)
    policy_text = fold(soup(policy).get_text(' ', strip=True))
    matched, unmatched, directories = [], [], []
    for code, degree in [('L', 'bachelor'), ('O', 'associate')]:
        root = client.get('/Fakulteler', {'Program': code})
        if root['status'] != 200:
            raise ValueError('Public faculty directory unavailable')
        for faculty in read(CACHE / root['file']):
            if 'fakulte' not in fold(faculty['FakTurkce']) and 'meslek' not in fold(faculty['FakTurkce']):
                continue
            source = client.get('/Bolumler', {'Program': code, 'FakNo': faculty['FakNo']})
            if source['status'] != 200:
                raise ValueError('Public programme directory unavailable')
            directories.append(source)
            for raw in read(CACHE / source['file']):
                ref = programme_reference(raw, faculty, degree, policy_text)
                program = match(university, ref)
                if program:
                    matched.append({**ref, 'programId': program['id'], 'name': program['name']})
                else:
                    unmatched.append(ref)
    ids = [r['programId'] for r in matched]
    if len(ids) != len(set(ids)):
        raise ValueError('Ambiguous official programme mapping')
    write(CACHE / 'cankaya-directories.json', [{'universityId': UID, 'matched': matched,
          'unmatched': unmatched, 'sources': directories, 'policy': policy}])
    output = []
    for ref in matched:
        source = courses(client, ref)
        output.append(source)
        write(CACHE / 'cankaya-courses.json', output)
        print('Çankaya', len(output), '/', len(matched), ref['name'], source['status'], flush=True)


if __name__ == '__main__':
    main()
