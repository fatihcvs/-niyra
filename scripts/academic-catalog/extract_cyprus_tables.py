"""Extract cached CYQAA PDF tables for source review; never publishes courses.

Requires pdfplumber. Pages, rows and original text are retained so that import
rules can reject ambiguous layouts instead of guessing course metadata.
"""
import concurrent.futures
import logging
from cyprus_research import CACHE, read, write


def extract(source):
    import pdfplumber
    logging.getLogger('pdfminer').setLevel(logging.ERROR)
    target = CACHE / (source['file'] + '.tables.json')
    if target.exists():
        return read(target)
    result = {'url': source['url'], 'file': source['file'], 'pages': []}
    try:
        with pdfplumber.open(CACHE / source['file']) as document:
            for number, page in enumerate(document.pages, 1):
                result['pages'].append({'page': number, 'text': page.extract_text() or '',
                                        'tables': page.extract_tables()})
    except Exception as error:
        result['error'] = str(error)
    write(target, result)
    return {'url': result['url'], 'pages': len(result['pages']), 'error': result.get('error')}


if __name__ == '__main__':
    sources = [s for s in read(CACHE / 'cyqaa-downloads.json') if s['status'] == 200]
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for i, result in enumerate(pool.map(extract, sources), 1):
            if i % 25 == 0 or result.get('error'):
                print('PDF tables', i, '/', len(sources), result.get('error') or '', flush=True)
