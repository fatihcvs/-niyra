"""Collect current Özyeğin undergraduate plans from its public directory and SIS."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import match, normal
from parse_cyprus_courses import clean

UID = 'tr-ozyegin-universitesi'
DIRECTORY = 'https://www.ozyegin.edu.tr/tr/ders-planlari'
AGENT_BROWSER_VERSION = '0.36.0'

PROGRAMMES = [
    ('Hukuk', 'Hukuk', 'Hukuk Fakültesi'),
    ('Bilgisayar Mühendisliği (İngilizce)', 'Bilgisayar Mühendisliği', 'Mühendislik Fakültesi'),
    ('Elektrik-Elektronik Mühendisliği (İngilizce)', 'Elektrik - Elektronik Mühendisliği', 'Mühendislik Fakültesi'),
    ('Endüstri Mühendisliği (İngilizce)', 'Endüstri Mühendisliği', 'Mühendislik Fakültesi'),
    ('Makine Mühendisliği (İngilizce)', 'Makina Mühendisliği', 'Mühendislik Fakültesi'),
    ('Yapay Zeka ve Veri Mühendisliği (İngilizce)', 'Yapay Zeka ve Veri Mühendisliği', 'Mühendislik Fakültesi'),
    ('İnşaat Mühendisliği (İngilizce)', 'İnşaat Mühendisliği', 'Mühendislik Fakültesi'),
    ('Ekonomi (İngilizce)', 'Ekonomi', 'İşletme Fakültesi'),
    ('Uluslararası Finans (İngilizce)', 'Uluslararası Finans', 'İşletme Fakültesi'),
    ('Uluslararası Ticaret ve İşletmecilik (İngilizce)', 'Uluslararası Ticaret ve İşletmecilik', 'İşletme Fakültesi'),
    ('Yönetim Bilişim Sistemleri (İngilizce)', 'Yönetim Bilişim Sistemleri', 'İşletme Fakültesi'),
    ('İşletme (İngilizce)', 'İşletme', 'İşletme Fakültesi'),
    ('Gastronomi ve Mutfak Sanatları (İngilizce)', 'Gastronomi ve Mutfak Sanatları', 'Uygulamalı Bilimler Fakültesi'),
    ('Otel Yöneticiliği (İngilizce)', 'Otel Yöneticiliği', 'Uygulamalı Bilimler Fakültesi'),
    ('Havacılık Yönetimi (İngilizce)', 'Havacılık Yönetimi', 'Havacılık ve Uzay Bilimleri Fakültesi'),
    ('Pilotaj (İngilizce)', 'Pilotaj', 'Havacılık ve Uzay Bilimleri Fakültesi'),
    ('Antropoloji (İngilizce)', 'Antropoloji', 'Sosyal Bilimler Fakültesi'),
    ('Psikoloji (İngilizce)', 'Psikoloji', 'Sosyal Bilimler Fakültesi'),
    ('Uluslararası İlişkiler (İngilizce)', 'Uluslararası İlişkiler', 'Sosyal Bilimler Fakültesi'),
    ('Endüstriyel Tasarım (İngilizce)', 'Endüstriyel Tasarım', 'Mimarlık ve Tasarım Fakültesi'),
    ('Mimarlık (İngilizce)', 'Mimarlık (İngilizce)', 'Mimarlık ve Tasarım Fakültesi'),
    ('İletişim ve Tasarımı (İngilizce)', 'İletişim ve Tasarımı', 'Mimarlık ve Tasarım Fakültesi'),
    ('İç Mimarlık ve Çevre Tasarımı (İngilizce)', 'İç Mimarlık ve Çevre Tasarımı', 'Mimarlık ve Tasarım Fakültesi'),
]

PAGE_TITLES = {
    # The central directory uses the current ÖSYM title while the programme
    # page retains the university's longer academic label.
    'Pilotaj': ('Pilot Eğitimi',),
    # The programme and language labels are separate navigation elements.
    'Mimarlık (İngilizce)': ('Mimarlık', 'İngilizce Program'),
}

CAPTURE_EXPRESSION = r'''JSON.stringify((()=>{
 const grid=Object.values(window).find(value=>value?.Class==='ListGrid'&&
   value.getFields?.().some(field=>field.name==='CODE')&&value.getFields?.().some(field=>field.name==='TITLE'));
 if(!grid)return null;
 return {fields:grid.getFields().map(field=>({name:field.name,title:field.title})),
  rows:Array.from({length:grid.getTotalRows()},(_,index)=>{const row=grid.getRecord(index);return {
   group:row?.groupValue??null,code:row?.CODE??null,title:row?.TITLE??null,credits:row?.CREDITS??null};})};
})())'''


def browser_command(session, *arguments, timeout=90):
    executable = shutil.which('npx.cmd') or shutil.which('npx')
    if not executable:
        raise RuntimeError('npx is required to capture the public Özyeğin SIS plan')
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
    # A newly launched agent-browser daemon may inherit stdout on Windows.
    # A real file keeps subprocess completion independent from pipe EOF.
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as input_file:
        if expression is not None:
            input_file.write(expression.encode('utf-8'))
            input_file.seek(0)
        result = subprocess.run(command_line, shell=True, stdout=output, stderr=subprocess.STDOUT,
                                stdin=input_file if expression is not None else None,
                                timeout=timeout, env=environment)
        output.seek(0)
        text = output.read().decode('utf-8', errors='replace').strip()
    if result.returncode:
        raise RuntimeError('agent-browser failed: ' + text)
    return text


def capture_plan(sis_url, code, program_page_url):
    key = 'ozyegin-' + hashlib.sha256((sis_url + program_page_url).encode()).hexdigest()[:24]
    body_path = CACHE / (key + '.body')
    meta_path = CACHE / (key + '.meta.json')
    if body_path.exists() and meta_path.exists():
        meta = read(meta_path)
        body = body_path.read_bytes()
        if (meta.get('status') == 200 and meta.get('sha256') == hashlib.sha256(body).hexdigest()
                and json.loads(body)['programCode'] == code):
            return meta
    captured = None
    last_error = None
    attempts = max(1, min(3, int(os.environ.get('KAMPIRA_OZYEGIN_ATTEMPTS', '3'))))
    for attempt in range(attempts):
        session = 'kampira-ozyegin-' + hashlib.sha256(code.encode()).hexdigest()[:10] + '-' + str(attempt)
        try:
            browser_command(session, 'open', sis_url)
            browser_command(session, 'wait', '--load', 'networkidle')
            encoded = browser_command(session, 'eval', CAPTURE_EXPRESSION)
            value = json.loads(encoded)
            captured = json.loads(value) if isinstance(value, str) else value
            if not captured or not captured.get('fields') or 'rows' not in captured:
                raise ValueError('Özyeğin SIS programme grid is unavailable: ' + code)
            break
        except Exception as error:
            last_error = error
        finally:
            try:
                browser_command(session, 'close', timeout=30)
            except Exception:
                pass
    if captured is None:
        raise last_error
    payload = {'programCode': code, 'sisUrl': sis_url, 'programPageUrl': program_page_url,
               **captured}
    body = (json.dumps(payload, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    body_path.write_bytes(body)
    meta = {'url': sis_url, 'publicUrl': program_page_url,
            'fetchedAt': datetime.now(timezone.utc).isoformat(), 'file': body_path.name,
            'status': 200, 'contentType': 'application/json; charset=utf-8',
            'sha256': hashlib.sha256(body).hexdigest(), 'browserCapture': f'agent-browser@{AGENT_BROWSER_VERSION}'}
    write(meta_path, meta)
    return meta


def main():
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][UID]
    directory_source = fetch(DIRECTORY, retry_failed=True)
    if directory_source['status'] != 200:
        raise ValueError('Özyeğin programme-plan directory is unavailable')
    document = soup(directory_source)
    heading = next((node for node in document.select('h2,h3')
                    if clean(node.get_text(' ', strip=True)) == 'Lisans Programları Ders Planları'), None)
    table = heading.find_next('table') if heading else None
    if table is None:
        raise ValueError('Özyeğin undergraduate plan table is unavailable')
    headers = [clean(cell.get_text(' ', strip=True)) for cell in table.select_one('thead tr').find_all(['td', 'th'], recursive=False)]
    matched, sources = [], []
    for registry_title, directory_title, unit in PROGRAMMES:
        reference = {'title': registry_title, 'unit': unit, 'degree': 'bachelor', 'directoryUrl': DIRECTORY}
        program = match(university, reference)
        if not program:
            raise ValueError('Özyeğin programme identity does not match registry: ' + registry_title)
        anchors = [anchor for anchor in table.select('a[href]')
                   if clean(anchor.get_text(' ', strip=True)) == directory_title]
        if len(anchors) != 1:
            raise ValueError('Özyeğin current directory does not uniquely list: ' + registry_title)
        cell = anchors[0].find_parent('td')
        column = list(cell.parent.find_all('td', recursive=False)).index(cell)
        if column >= len(headers) or normal(headers[column]) != normal(unit):
            raise ValueError('Özyeğin directory unit mismatch: ' + registry_title)
        programme_page = urljoin(directory_source.get('finalUrl', DIRECTORY), anchors[0]['href'])
        reference.update(universityId=UID, programId=program['id'], name=program['name'],
                         courseUrl=programme_page, identityEvidenceUrl=DIRECTORY)
        page_source = fetch(programme_page, retry_failed=True)
        if page_source['status'] != 200:
            sources.append({**page_source, 'family': 'ozyegin', 'programs': [reference],
                            'publicUrl': programme_page,
                            'selection': {'method': 'programme-page-unavailable',
                                          'directoryHash': directory_source['sha256']}})
            matched.append(reference)
            print('Özyeğin', len(matched), '/', len(PROGRAMMES), registry_title,
                  'programme-page-unavailable', flush=True)
            continue
        page_url = page_source.get('finalUrl', programme_page)
        page_document = soup(page_source)
        page_titles = PAGE_TITLES.get(directory_title, (directory_title,))
        page_text = normal(page_document.get_text(' ', strip=True))
        if any(normal(page_title) not in page_text for page_title in page_titles):
            raise ValueError('Özyeğin programme page identity mismatch: ' + registry_title)
        iframe_urls = [urljoin(page_url, iframe['src']) for iframe in page_document.select('iframe[src]')
                       if 'ProgramCoursePlanWeb' in iframe['src']]
        if len(iframe_urls) != 1:
            raise ValueError('Özyeğin programme page has no unique SIS plan: ' + registry_title)
        sis_url = iframe_urls[0]
        parsed = urlparse(sis_url)
        codes = parse_qs(parsed.query).get('code', [])
        if parsed.hostname != 'sis.ozyegin.edu.tr' or parsed.path != '/OZU_GWT/WEB/ProgramCoursePlanWeb' or len(codes) != 1:
            raise ValueError('Özyeğin SIS plan URL is invalid: ' + registry_title)
        code = codes[0]
        if not re.fullmatch(r'[A-Z0-9() ]{2,24}', code):
            raise ValueError('Özyeğin SIS programme code is invalid: ' + registry_title)
        sis_url = 'https://sis.ozyegin.edu.tr/OZU_GWT/WEB/ProgramCoursePlanWeb?' + urlencode({'locale': 'tr', 'code': code})
        reference['courseUrl'] = page_url
        try:
            source = capture_plan(sis_url, code, page_url)
        except Exception as error:
            source = {'url': sis_url, 'publicUrl': page_url,
                      'fetchedAt': datetime.now(timezone.utc).isoformat(), 'status': 0,
                      'error': str(error), 'browserCapture': f'agent-browser@{AGENT_BROWSER_VERSION}'}
        source.update(family='ozyegin', programs=[reference], publicUrl=page_url,
                      selection={'method': 'published-current-sis-program-plan', 'code': code,
                                 'directoryHash': directory_source['sha256'],
                                 'programmePageHash': page_source['sha256']})
        sources.append(source)
        matched.append(reference)
        print('Özyeğin', len(matched), '/', len(PROGRAMMES), registry_title, code,
              'captured' if source['status'] == 200 else 'unavailable', flush=True)
    ids = [item['programId'] for item in matched]
    if len(ids) != len(set(ids)) or len(ids) != len(university['programs']):
        raise ValueError('Özyeğin current registry coverage is incomplete or ambiguous')
    write(CACHE / 'ozyegin-courses.json', sources)
    write(CACHE / 'ozyegin-directories.json', [{'universityId': UID, 'source': directory_source,
                                                 'matched': matched, 'unmatched': []}])
    print('Özyeğin:', len(matched), 'matched; 0 missing', flush=True)


if __name__ == '__main__':
    main()
