"""Conservative import of regulator-published course distribution tables.

The academic catalogue supplies the programme identity; a PDF never creates a
new degree. Unknown semester/type remain null. Placeholder slots, ambiguous
codes and a second alternative study plan are excluded and reported.
"""
import collections
import re
import unicodedata
from cyprus_research import CACHE, ROOT, read, write


def clean(value):
    return ' '.join(str(value or '').split())


def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', clean(value).casefold().replace('ı', 'i'))
                   if not unicodedata.combining(c))


def code(value):
    value = re.sub(r'\s+', '', clean(value)).strip('*')
    # A real course identifier, not an elective slot or a list of alternatives.
    if re.fullmatch(r'[A-ZΑ-ΩİŞĞÜÖÇ]{2,10}[-.]?\d{2,5}[A-ZΑ-Ω]{0,2}(?:_[A-Z])?', value):
        return value
    return None


def kind(value):
    value = re.sub(r'\s+', '', fold(value))
    if any(s in value for s in ['electiv', 'optional', 'επιλογ', 'optionnel', 'secmeli']):
        if any(s in value for s in ['compuls', 'required', 'υποχρε']):
            return None
        return 'elective'
    if any(s in value for s in ['compuls', 'required', 'mandatory', 'υποχρε', 'obligatoire', 'zorunlu']):
        return 'required'
    if value in ['core', 'r', 'c', 'υ', 'υβ', 'req.', 'req', 'cb']:
        return 'required'
    if value in ['e', 'ε']:
        return 'elective'
    return None


ORDINALS = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5, 'sixth': 6,
            'πρωτο': 1, 'δευτερο': 2, 'τριτο': 3, 'τεταρτο': 4, 'τεταρτo': 4, 'πεμπτο': 5, 'εκτο': 6}
LETTERS = {'a': 1, 'α': 1, 'b': 2, 'β': 2, 'c': 3, 'γ': 3, 'd': 4, 'δ': 4,
           'e': 5, 'ε': 5, 'f': 6, 'στ': 6, 'g': 7, 'ζ': 7, 'h': 8, 'η': 8,
           'i': 9, 'θ': 9, 'j': 10, 'ι': 10}


def period(value):
    text = fold(value)
    text = re.sub(r'\b(?:yariyil|donem)\b', 'semester', text)
    text = re.sub(r'\b(?:yil|sinif)\b', 'year', text)
    text = re.sub(r'\bguz\b', 'fall semester', text)
    text = re.sub(r'\bbahar\b', 'spring semester', text)
    if re.search(r'\d{1,2}(?:st|nd|rd|th)?\s*(?:and|&|/)\s*\d{1,2}(?:st|nd|rd|th)?\s*semester', text):
        return None, None
    year = None
    match = re.search(r'(?:year|ετος)\s*(?:no\s*)?(\d)|\b(\d)(?:st|nd|rd|th|ο)?\s*(?:academic\s*)?(?:year|ετος)', text)
    if match:
        year = int(match.group(1) or match.group(2))
    for word, n in ORDINALS.items():
        if re.search(r'\b' + word + r'\s+(?:academic\s*)?(?:year|ετος)', text):
            year = n
    term = None
    matches = re.findall(r'(?:semester|εξαμηνο)\s*(\d{1,2})(?!\d)|\b(\d{1,2})(?:st|nd|rd|th|ο|o|°|\.)?\s*(?:academic\s*)?(?:semester|εξαμηνο)', text)
    numbers = {int(a or b) for a, b in matches}
    if len(numbers) == 1:
        term = numbers.pop()
    elif len(numbers) > 1:
        return None, year
    if term is None:
        match = re.search(r'\b([a-jα-ι]|στ)[’\'΄′´]?\s+(?:semester|εξαμηνο)|(?:semester|εξαμηνο)\s+([a-jα-ι]|στ)\b', text)
        if match:
            term = LETTERS.get(match.group(1) or match.group(2))
    if term is None and year:
        if any(w in text for w in ['χειμερινο', 'fall semester', 'winter semester']):
            term = year * 2 - 1
        elif any(w in text for w in ['εαρινο', 'spring semester']):
            term = year * 2
    if term and year and term <= 2 and year > 1:
        term += (year - 1) * 2
    return (term if term and 1 <= term <= 12 else None), (year if year and 1 <= year <= 6 else None)


def merge_courses(courses):
    grouped = collections.defaultdict(list)
    for course in courses:
        grouped[course['code']].append(course)
    result, conflicts = [], []
    for key, items in grouped.items():
        if len({re.sub(r'\W+', '', fold(c['name'])) for c in items}) > 1:
            conflicts.append(key)
            continue
        value = dict(items[0])
        terms = sorted({c['semester'] for c in items if c['semester'] is not None})
        if len(terms) > 1:
            value['semester'] = None
            value['offeredSemesters'] = terms
            value.pop('year', None)
        kinds = {c['kind'] for c in items}
        if len(kinds) > 1:
            value['kind'] = None
        result.append(value)
    return result, conflicts


def parse_document(document):
    courses, skipped = [], collections.Counter()
    plans, resets = [], []
    term, year, highest, alternative = None, None, 0, False
    last_kind = None
    columns = {}
    for page in document['pages']:
        lines = page['text'].splitlines()
        if courses and any(re.match(r'^(?:κατευθυνση|track\s+[a-z0-9]|speciali[sz]ation\s*:|concentration\s*:)', fold(line)) for line in lines[:4]):
            alternative = True
        # Elective pools following the plan have no prescribed semester.
        if any(re.match(r'^(?:μαθηματα.*επιλογης|elective courses|list of elective|restricted electives|free electives)', fold(line)) for line in lines[:3]):
            term, year, last_kind = None, None, 'elective'
        # Only use a page heading if there is one unambiguous semester on it.
        headings = {period(line) for line in page['text'].splitlines()
                    if len(line) < 120 and re.search(r'Semester|Εξάμηνο|ΕΞΑΜΗΝΟ', line)}
        headings = {h for h in headings if h[0]}
        page_period = next(iter(headings)) if len(headings) == 1 else None
        for table in page['tables']:
            if not table or max(map(len, table)) < 3:
                continue
            width = max(map(len, table))
            headers = [fold(' '.join(clean(row[i]) for row in table[:8] if len(row) > i)) for i in range(width)]
            title_columns = [i for i, h in enumerate(headers) if re.search(r'course\s*(?:name|title)|ονομα\s*μαθηματος|ders\s*adi', h)]
            code_columns = [i for i, h in enumerate(headers) if re.search(r'course\s*code|κωδικος\s*μαθηματος|ders\s*kodu', h)]
            if len(title_columns) == 1 and len(code_columns) == 1:
                columns[width] = (title_columns[0], code_columns[0])
            combined = []
            for original in table:
                row = [clean(v) for v in original]
                if width in columns and combined:
                    title_index, code_index = columns[width]
                    previous = combined[-1]
                    nonempty = [i for i, v in enumerate(row) if v]
                    if (nonempty == [title_index] and len(previous) > code_index and code(previous[code_index])
                        and not re.search(r'total|συνολο|semester|εξαμηνο|elective|επιλογης', fold(row[title_index]))):
                        previous[title_index] += ' ' + row[title_index]
                        continue
                if any(row):
                    combined.append(row)
            for row in combined:
                values = [clean(v) for v in row]
                nonempty = [v for v in values if v]
                if not nonempty:
                    continue
                row_text = ' | '.join(nonempty)
                codes = [(i, code(v)) for i, v in enumerate(values) if code(v)]
                if not codes:
                    if len(nonempty) <= 3 and re.match(r'^(?:μαθηματα.*επιλογης|elective courses|list of elective|restricted electives|free electives)', fold(row_text)):
                        term, year, last_kind = None, None, 'elective'
                    p, y = period(row_text) if len(nonempty) <= 3 else (None, None)
                    if p:
                        if p < highest:
                            plans.append(courses)
                            courses = []
                            resets.append(p)
                            highest = 0
                        term, year = p, y
                        highest = max(highest, p)
                        last_kind = None
                    if len(nonempty) <= 2 and any(w in fold(row_text) for w in ['core', 'electives:', 'compulsory courses']):
                        last_kind = kind(row_text.replace('ECTS', '').replace('|', '').strip())
                    continue
                if alternative:
                    skipped['alternative-plan'] += 1
                    continue
                if len(codes) != 1:
                    skipped['multiple-codes'] += 1
                    continue
                index, identifier = codes[0]
                # Course distributions put the name immediately beside the code.
                before = [v for v in values[:index] if v]
                after = [v for v in values[index+1:] if v]
                if width in columns:
                    title_index, code_index = columns[width]
                    title = values[title_index] if len(values) > title_index and code_index == index else None
                else:
                    title = before[-1] if before and len(before[-1]) > 3 and sum(c.isalpha() for c in before[-1]) >= 3 and kind(before[-1]) is None else None
                    if title is None and not before and after and len(after[0]) > 3 and sum(c.isalpha() for c in after[0]) >= 3:
                        title = after[0]
                if not title or len(title) > 200 or re.search(r'course code|course name|course title|κωδικος|τυπος μαθηματος|ects|\bects\b', fold(title)):
                    skipped['unreadable-title'] += 1
                    continue
                if fold(title) in ['elective', 'free elective', 'restricted elective', 'technical elective'] or re.match(r'^\d+\s*\(', title):
                    skipped['placeholder'] += 1
                    continue
                prefix = re.sub(r'[-.\d].*', '', identifier)
                if (re.match(r'^total\s+\d+\s+courses', fold(title))
                    or re.search(r'elective course\s+or\b', fold(title))
                    or (title.isalpha() and title.isupper() and (title.startswith(prefix) or prefix.startswith(title)))):
                    skipped['placeholder'] += 1
                    continue
                source_kind = next((kind(v) for v in before[:-1] if kind(v)), None) if title in before else last_kind
                if any('specialization' in fold(v) or 'specialisation' in fold(v) for v in before[:-1]):
                    skipped['specialization-course'] += 1
                    continue
                current_term, current_year = (term, year) if term else ((None, None) if last_kind == 'elective' else page_period or (None, None))
                item = {'code': identifier, 'name': title, 'semester': current_term, 'kind': source_kind,
                        'sourcePage': page['page']}
                if current_year:
                    item['year'] = current_year
                courses.append(item)
    if plans:
        plans.append(courses)
        first = plans[0]
        if min(resets) > 1:
            # A track begins part way through the degree. Retain the shared
            # prefix, not the mandatory courses of an arbitrarily chosen track.
            courses = [c for c in first if c['semester'] is not None and c['semester'] < min(resets)]
        else:
            # Full alternative plans (often Greek/English copies): only course
            # identifiers present in every plan can be asserted for the degree.
            nonempty = [p for p in plans if p]
            common = set.intersection(*({c['code'] for c in p} for p in nonempty)) if nonempty else set()
            courses = [c for c in first if c['code'] in common]
            for course in courses:
                versions = [c for plan in nonempty for c in plan if c['code'] == course['code']]
                if len({c['semester'] for c in versions}) > 1:
                    course['semester'] = None
                    course.pop('year', None)
                if len({c['kind'] for c in versions}) > 1:
                    course['kind'] = None
        skipped['alternative-plan-courses'] = sum(map(len, plans)) - len(courses)
    courses, conflicts = merge_courses(courses)
    skipped['conflicting-code'] = len(conflicts)
    return courses, dict(skipped)


def main():
    academic = read(ROOT / 'data/academic-catalog-2026.json')
    candidates, report = {}, []
    for source in read(CACHE / 'cyqaa-downloads.json'):
        extracted = CACHE / (source['file'] + '.tables.json')
        if not extracted.exists():
            report.append({'sourceUrl': source['url'], 'programs': source['programs'], 'status': 'fetch-failed'})
            continue
        doc = read(extracted)
        courses, skipped = parse_document(doc) if not doc.get('error') else ([], {'invalid-pdf': 1})
        report.append({'sourceUrl': source['url'], 'programs': source['programs'], 'courses': len(courses), 'skipped': skipped})
        if len(courses) < 3:
            continue
        for ref in source['programs']:
            uid, pid = ref['universityId'], ref['programId']
            existing = candidates.get(f'{uid}:{pid}')
            if existing and len(existing['courses']) >= len(courses):
                continue
            candidates[f'{uid}:{pid}'] = {
                'universityId': uid, 'programId': pid, 'programName': ref['name'],
                'authority': 'CYQAA / ΔΙΠΑΕ · ' + academic['universities'][uid]['officialName'],
                'sourceUrl': source['url'], 'verifiedAt': source['fetchedAt'][:10],
                'coverage': 'partial', 'courses': courses,
                'sourceHash': source['sha256'],
            }
    write(CACHE / 'cyqaa-course-candidates.json', candidates)
    write(CACHE / 'cyqaa-course-review.json', report)
    print('Candidates', len(candidates), 'courses', sum(len(p['courses']) for p in candidates.values()))
    print(collections.Counter(p['universityId'] for p in candidates.values()))


if __name__ == '__main__':
    main()
