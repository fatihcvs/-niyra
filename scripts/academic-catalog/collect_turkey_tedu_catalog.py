"""Collect current TED University undergraduate plans from official pages."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
from urllib.parse import urljoin, urlparse

from discover_turkey_courses import match, normal
from parse_cyprus_courses import clean
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = 'tr-ted-universitesi'
DIRECTORY = 'https://www.tedu.edu.tr/akademik'
AGENT_BROWSER_VERSION = '0.36.0'

# Registry title, exact registry unit, department host, official directory label,
# current plan path, published programme block id, and plan year.
PROGRAMMES = [
    ('Okul Öncesi Öğretmenliği (İngilizce)', 'Eğitim Fakültesi', 'ece',
     'Temel Eğitim Bölümü Okul Öncesi Eğitimi Anabilim Dalı', '/ece/program2', '50000051', '2021'),
    ('Rehberlik ve Psikolojik Danışmanlık (İngilizce)', 'Eğitim Fakültesi', 'gpc',
     'Eğitim Bilimleri Bölümü Rehberlik ve Psikolojik Danışmanlık Anabilim Dalı', '/ogretim-programi', '50000053', '2021'),
    ('Sınıf Öğretmenliği (İngilizce)', 'Eğitim Fakültesi', 'ege',
     'Temel Eğitim Bölümü Sınıf Eğitimi Anabilim Dalı', '/ege/program2', '50000052', '2021'),
    ('İngilizce Öğretmenliği (İngilizce)', 'Eğitim Fakültesi', 'ele',
     'Yabancı Diller Eğitimi Bölümü İngiliz Dili Eğitimi Anabilim Dalı', '/ele/program2', '50019620', '2021'),
    ('Bilgisayar Mühendisliği (İngilizce)', 'Mühendislik Fakültesi', 'cmpe',
     'Bilgisayar Mühendisliği Bölümü', '/ogretim-programi', '50000057', '2025'),
    ('Elektrik-Elektronik Mühendisliği (İngilizce)', 'Mühendislik Fakültesi', 'ee',
     'Elektrik-Elektronik Mühendisliği Bölümü', '/ogretim-programi', '50000058', '2025'),
    ('Endüstri Mühendisliği (İngilizce)', 'Mühendislik Fakültesi', 'ie',
     'Endüstri Mühendisliği Bölümü', '/ogretim-programi', '50000059', '2025'),
    ('Makine Mühendisliği (İngilizce)', 'Mühendislik Fakültesi', 'me',
     'Makine Mühendisliği Bölümü', '/ogretim-programi', '50003779', '2025'),
    ('Yazılım Mühendisliği (İngilizce)', 'Mühendislik Fakültesi', 'seng',
     'Yazılım Mühendisliği Bölümü', '/ogretim-programi-2025', '50142692', '2025'),
    ('İnşaat Mühendisliği (İngilizce)', 'Mühendislik Fakültesi', 'ce',
     'İnşaat Mühendisliği Bölümü', '/ogretim-programi', '50003780', '2025'),
    ('Matematik (İngilizce)', 'Fen-Edebiyat Fakültesi', 'math',
     'Matematik Bölümü', '/ogretim-programi-2022', '50070623', '2022'),
    ('Psikoloji (İngilizce)', 'Fen-Edebiyat Fakültesi', 'psy',
     'Psikoloji Bölümü', '/ogretim-programi-2022', None, '2022'),
    ('Sosyoloji (İngilizce)', 'Fen-Edebiyat Fakültesi', 'soc',
     'Sosyoloji Bölümü', '/ogretim-programi-2022', '50044642', '2022'),
    ('İngiliz Dili ve Edebiyatı (İngilizce)', 'Fen-Edebiyat Fakültesi', 'ell',
     'İngiliz Dili ve Edebiyatı Bölümü', '/ogretim-programi-2022', '50079443', '2022'),
    ('Endüstriyel Tasarım (İngilizce)', 'Mimarlık Ve Tasarım Fakültesi', 'id',
     'Endüstriyel Tasarım Bölümü', '/ogretim-programi', '50017909', '2022'),
    ('Görsel İletişim Tasarımı (İngilizce)', 'Mimarlık Ve Tasarım Fakültesi', 'vcode',
     'Görsel İletişim Tasarımı Bölümü', '/ogretim-programi', '50157970', '2022'),
    ('Mimarlık (İngilizce)', 'Mimarlık Ve Tasarım Fakültesi', 'arch',
     'Mimarlık Bölümü', '/ogretim-programi', '50000060', '2022'),
    ('İç Mimarlık ve Çevre Tasarımı (İngilizce)', 'Mimarlık Ve Tasarım Fakültesi', 'iaed',
     'İç Mimarlık ve Çevre Tasarımı Bölümü', '/ogretim-programi-0', '50079447', '2022'),
    ('Şehir ve Bölge Planlama (İngilizce)', 'Mimarlık Ve Tasarım Fakültesi', 'city',
     'Şehir ve Bölge Planlama Bölümü', '/ogretim-programi', '50031442', '2022'),
    ('Siyaset Bilimi ve Uluslararası İlişkiler (İngilizce)', 'İktisadi Ve İdari Bilimler Fakültesi', 'psir',
     'Siyaset Bilimi ve Uluslararası İlişkiler Bölümü', '/ogretim-programi-2022', '50000056', '2022'),
    ('İktisat (İngilizce)', 'İktisadi Ve İdari Bilimler Fakültesi', 'econ',
     'İktisat Bölümü', '/ogretim-programi-2022', '50000054', '2022'),
    ('İşletme (İngilizce)', 'İktisadi Ve İdari Bilimler Fakültesi', 'ba',
     'İşletme Bölümü', '/ogretim-programi-2022', '50000055', '2022'),
]

CAPTURE_EXPRESSION = r'''JSON.stringify((()=>({
 url:location.href,
 tables:[...document.querySelectorAll('.tedu_program_block table.program-table')].map(table=>({
  heading:table.querySelector('thead tr:first-child')?.innerText?.trim()||null,
  rows:[...table.querySelectorAll('tbody tr')].map(row=>{
   const cells=[...row.querySelectorAll(':scope > td')].map(cell=>cell.innerText.trim());
   return {code:cells[0]||null,title:cells[1]||null};
  })
 }))
}))())'''


def browser_command(session, *arguments, timeout=90):
    executable = shutil.which('npx.cmd') or shutil.which('npx')
    if not executable:
        raise RuntimeError('npx is required to capture the public TED University plan')
    environment = {**os.environ, 'NO_COLOR': '1'}
    arguments = list(arguments)
    expression = None
    if arguments and arguments[0] == 'eval':
        expression = arguments[1]
        arguments = ['eval', '--stdin']
    command = [executable, '--yes', f'agent-browser@{AGENT_BROWSER_VERSION}',
               '--session', session, '--max-output', '200000', *arguments]
    command_line = subprocess.list2cmdline(command)
    for argument in arguments:
        if any(character in argument for character in '&|<>^') and ' ' not in argument:
            command_line = command_line.replace(argument, '"' + argument + '"')
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as input_file:
        if expression is not None:
            input_file.write(expression.encode('utf-8'))
            input_file.seek(0)
        result = subprocess.run(command_line, shell=True, stdout=output, stderr=subprocess.STDOUT,
                                stdin=input_file if expression is not None else None,
                                timeout=timeout, env=environment)
        output.seek(0)
        captured_output = output.read().decode('utf-8', errors='replace').strip()
    if result.returncode:
        raise RuntimeError('agent-browser failed: ' + captured_output)
    return captured_output


def capture_plan(page_url, block_id, plan_year):
    key = 'tedu-' + hashlib.sha256((page_url + block_id + plan_year).encode()).hexdigest()[:24]
    body_path = CACHE / (key + '.body')
    meta_path = CACHE / (key + '.meta.json')
    if body_path.exists() and meta_path.exists():
        meta = read(meta_path)
        body = body_path.read_bytes()
        if (meta.get('status') == 200 and meta.get('sha256') == hashlib.sha256(body).hexdigest()
                and json.loads(body).get('blockId') == block_id):
            return meta
    captured = None
    last_error = None
    attempts = max(1, min(3, int(os.environ.get('KAMPIRA_TEDU_ATTEMPTS', '3'))))
    for attempt in range(attempts):
        session = 'kampira-tedu-' + hashlib.sha256(block_id.encode()).hexdigest()[:10] + '-' + str(attempt)
        try:
            browser_command(session, 'open', page_url)
            browser_command(session, 'wait', '--load', 'networkidle')
            encoded = browser_command(session, 'eval', CAPTURE_EXPRESSION)
            value = json.loads(encoded)
            captured = json.loads(value) if isinstance(value, str) else value
            real_rows = [row for table in (captured or {}).get('tables', []) for row in table.get('rows', [])
                         if any(character.isdigit() for character in clean(row.get('code')))]
            if len(real_rows) < 3:
                raise ValueError('TED University programme tables are unavailable: ' + block_id)
            break
        except Exception as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(8 * (attempt + 1))
        finally:
            try:
                browser_command(session, 'close', timeout=30)
            except Exception:
                pass
    if captured is None or len([row for table in captured.get('tables', []) for row in table.get('rows', [])
                                if any(character.isdigit() for character in clean(row.get('code')))]) < 3:
        raise last_error or ValueError('TED University programme tables are unavailable: ' + block_id)
    payload = {'blockId': block_id, 'planYear': plan_year, 'programPageUrl': page_url, **captured}
    body = (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    body_path.write_bytes(body)
    meta = {'url': page_url, 'publicUrl': page_url, 'fetchedAt': datetime.now(timezone.utc).isoformat(),
            'file': body_path.name, 'status': 200, 'contentType': 'application/json; charset=utf-8',
            'sha256': hashlib.sha256(body).hexdigest(),
            'browserCapture': f'agent-browser@{AGENT_BROWSER_VERSION}'}
    write(meta_path, meta)
    time.sleep(6)
    return meta


def main():
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][UID]
    directory_source = fetch(DIRECTORY, retry_failed=True)
    if directory_source['status'] != 200:
        raise ValueError('TED University academic directory is unavailable')
    directory_document = soup(directory_source)
    base_url = directory_source.get('finalUrl', DIRECTORY)
    matched, sources = [], []
    for registry_title, unit, subdomain, directory_label, plan_path, block_id, plan_year in PROGRAMMES:
        reference = {'title': registry_title, 'unit': unit, 'degree': 'bachelor',
                     'directoryUrl': DIRECTORY}
        program = match(university, reference)
        if not program:
            raise ValueError('TED University programme identity does not match registry: ' + registry_title)
        anchors = []
        for anchor in directory_document.select('a[href]'):
            target = urljoin(base_url, anchor['href'])
            if (clean(anchor.get_text(' ', strip=True)) == directory_label
                    and urlparse(target).hostname == f'{subdomain}.tedu.edu.tr'):
                anchors.append(anchor)
        if len(anchors) != 1:
            raise ValueError('TED University directory does not uniquely list: ' + registry_title)
        page_url = f'https://{subdomain}.tedu.edu.tr{plan_path}'
        reference.update(universityId=UID, programId=program['id'], name=program['name'],
                         courseUrl=page_url, identityEvidenceUrl=DIRECTORY)
        page_source = fetch(page_url, retry_failed=True)
        if page_source['status'] != 200:
            raise ValueError('TED University current plan page is unavailable: ' + registry_title)
        page_document = soup(page_source)
        if block_id is None:
            # The current Psychology page links a PDF whose embedded fonts have no
            # usable character map. Publishing corrupted course names would invent data.
            key = 'tedu-' + hashlib.sha256((page_url + plan_year + ':unreadable').encode()).hexdigest()[:24]
            body_path = CACHE / (key + '.body')
            payload = {'planYear': plan_year, 'programPageUrl': page_url, 'tables': [],
                       'unreadableReason': 'published-current-plan-has-no-machine-readable-course-text'}
            body = (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
            body_path.write_bytes(body)
            source = {'url': page_url, 'publicUrl': page_url,
                      'fetchedAt': datetime.now(timezone.utc).isoformat(), 'status': 200,
                      'file': body_path.name, 'sha256': hashlib.sha256(body).hexdigest(),
                      'contentType': 'application/json; charset=utf-8', 'machineReadable': False,
                      'family': 'tedu', 'programs': [reference],
                      'selection': {'method': 'published-current-plan-unreadable', 'year': plan_year,
                                    'directoryHash': directory_source['sha256'],
                                    'programmePageHash': page_source['sha256']}}
        else:
            settings = page_document.select_one('script[data-drupal-selector="drupal-settings-json"]')
            try:
                blocks = json.loads(settings.string).get('ajaxBlocks', {}) if settings and settings.string else {}
            except json.JSONDecodeError as error:
                raise ValueError('TED University plan configuration is invalid: ' + registry_title) from error
            expected_key = 'program_config_' + block_id
            if list(blocks) != [expected_key]:
                raise ValueError('TED University current plan is not unique: ' + registry_title)
            config = blocks[expected_key]
            if (config.get('plugin_id') != 'tedu_program_block' or config.get('block_id') != expected_key
                    or str(config.get('bolum_id')) != block_id or str(config.get('year')) != plan_year):
                raise ValueError('TED University plan identity changed: ' + registry_title)
            try:
                source = capture_plan(page_url, block_id, plan_year)
            except Exception as error:
                source = {'url': page_url, 'publicUrl': page_url,
                          'fetchedAt': datetime.now(timezone.utc).isoformat(), 'status': 0,
                          'error': str(error), 'browserCapture': f'agent-browser@{AGENT_BROWSER_VERSION}'}
            source.update(family='tedu', programs=[reference], publicUrl=page_url,
                          selection={'method': 'published-current-programme-block', 'year': plan_year,
                                     'blockId': block_id, 'directoryHash': directory_source['sha256'],
                                     'programmePageHash': page_source['sha256']})
        sources.append(source)
        matched.append(reference)
        print('TED', len(matched), '/', len(PROGRAMMES), registry_title,
              'captured' if source.get('machineReadable', source['status'] == 200) else 'unreadable', flush=True)
    ids = [item['programId'] for item in matched]
    if len(ids) != len(set(ids)) or len(ids) != len(university['programs']):
        raise ValueError('TED University current registry coverage is incomplete or ambiguous')
    write(CACHE / 'tedu-courses.json', sources)
    write(CACHE / 'tedu-directories.json', [{'universityId': UID, 'source': directory_source,
                                             'matched': matched, 'unmatched': []}])
    print('TED University:', len(matched), 'matched; 0 directory misses;',
          sum(source.get('machineReadable', source['status'] == 200) for source in sources),
          'readable plans', flush=True)


if __name__ == '__main__':
    main()
