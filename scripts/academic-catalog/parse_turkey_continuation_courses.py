"""Adapters for explicitly labelled AGUCAT and IZU course tables."""
import re
from parse_cyprus_courses import clean, fold, merge_courses


def parse_agu(doc, course_code, course_kind):
    output = []
    for table in doc.select('table#grdBolognaDersler'):
        semester = None; mapping = None
        for row in table.select('tr'):
            values = [clean(c.get_text(' ',strip=True)) for c in row.find_all(['td','th'],recursive=False)]
            names = [fold(v) for v in values]
            term = next((re.fullmatch(r'(-?\d+)\.\s*Semester Course Plan',v,re.I) for v in values
                if re.fullmatch(r'(-?\d+)\.\s*Semester Course Plan',v,re.I)),None)
            if term:
                number = int(term[1]); semester = number if 1 <= number <= 12 else None
                mapping = None
                continue
            if 'course code' in names and 'course name' in names and 'compulsory/elective' in names:
                mapping = [names.index(n) for n in ['course code','course name','compulsory/elective']]
                continue
            if not semester or not mapping or len(values) <= max(mapping): continue
            code, name, kind = [values[i] for i in mapping]; code = course_code(code)
            if not code or not 2 <= len(name) <= 200: continue
            if re.search(r'\b(?:transfer elective|elective (?:course|group))\b',fold(name)): continue
            output.append({'code':code,'name':name,'semester':semester,'kind':course_kind(kind)})
    return merge_courses(output)


def parse_izu(doc, course_code, course_kind):
    output = []
    for table in doc.select('table.table'):
        heading = table.select_one('thead tr th[colspan]')
        term = re.fullmatch(r'(\d+)\.\s*Yarıyıl(?: Seçmeli Dersler)?',clean(heading.get_text()),re.I) if heading else None
        if not term or not 1 <= int(term[1]) <= 12: continue
        mapping = None
        for row in table.select('tr'):
            values = [clean(c.get_text(' ',strip=True)) for c in row.find_all(['td','th'],recursive=False)]
            names = [fold(v) for v in values]
            if all(n in names for n in ['kodu','adi','turu']):
                mapping = [names.index(n) for n in ['kodu','adi','turu']]; continue
            if not mapping or len(values) <= max(mapping): continue
            code, name, kind = [values[i] for i in mapping]; code = course_code(code)
            if not code or not 2 <= len(name) <= 200: continue
            if re.search(r'\bsecmeli ders\b',fold(name)) or fold(name) == 'izu ortak secmeli': continue
            kind = 'elective' if fold(kind) in ['bolum secmeli','bolum disi secmeli','izu ortak secmeli'] else course_kind(kind)
            output.append({'code':code,'name':name,'semester':int(term[1]),'kind':kind})
    return merge_courses(output)


def parse_esenyurt(doc, course_code, course_kind):
    """Read the selected plan and its explicitly linked elective pool children."""
    output=[];groups=set()
    for table in doc.select('table#grdBolognaDersler'):
        semester=None;mapping=None
        for row in table.select('tr'):
            if row.find_parent('table')!=table:continue
            values=[clean(c.get_text(' ',strip=True)) for c in row.find_all(['td','th'],recursive=False)]
            names=[fold(v) for v in values]
            heading=next((re.fullmatch(r'(-?\d+)\.\s*Yarıyıl Ders Planı',v,re.I) for v in values
                if re.fullmatch(r'(-?\d+)\.\s*Yarıyıl Ders Planı',v,re.I)),None)
            if heading:
                term=int(heading[1]);semester=term if 1<=term<=12 else None;mapping=None;groups=set();continue
            if all(n in names for n in ['ders kodu','ders adi','zorunlu/secmeli']):
                mapping=[names.index(n) for n in ['ders kodu','ders adi','zorunlu/secmeli']];continue
            if not semester or not mapping or len(values)<=max(mapping):continue
            code,name,kind=[values[i] for i in mapping]
            group=row.select_one('span.expandCollapse[id^="span_"]')
            if group:
                if course_kind(kind)=='elective':groups.add('collapse_'+group['id'].removeprefix('span_'))
                continue
            identifier=course_code(code)
            if not identifier and re.fullmatch(r'\d{2,4}[A-Z]{1,4}\d{2,5}(?:_\d{1,2})?',code):identifier=code
            if not identifier or not 2<=len(name)<=200:continue
            if re.search(r'\b(?:secmeli ders|ders havuzu|secmeli [ivx\d]+)\b',fold(name)):continue
            pool=next((c for c in row.get('class',[]) if c.startswith('collapse_')),None)
            if pool and pool not in groups:continue
            output.append({'code':identifier,'name':name,'semester':semester,
                'kind':'elective' if pool else course_kind(kind)})
    return merge_courses(output)
