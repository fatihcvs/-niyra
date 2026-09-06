"""Read the official ESOGU course-plan tables embedded in DOCX packages."""
import re
import zipfile
from xml.etree import ElementTree

from parse_cyprus_courses import clean, fold, merge_courses


WORD = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def _text(element):
    paragraphs=[]
    for paragraph in element.iter(WORD+'p'):
        value=''.join(node.text or '' for node in paragraph.iter(WORD+'t'))
        if clean(value):paragraphs.append(clean(value))
    return clean(' '.join(paragraphs))


def _tables(path):
    with zipfile.ZipFile(path) as package:
        with package.open('word/document.xml') as document:
            for _,table in ElementTree.iterparse(document,events=('end',)):
                if table.tag!=WORD+'tbl':continue
                rows=[]
                for row in table.findall(WORD+'tr'):
                    rows.append([_text(cell) for cell in row.findall(WORD+'tc')])
                yield rows
                table.clear()


def _identity(rows, course_code):
    for row_number,row in enumerate(rows):
        labels=[fold(value) for value in row]
        code_index=next((index for index,label in enumerate(labels) if label in ['dersin kodu','ders kodu']),None)
        name_index=next((index for index,label in enumerate(labels) if label in ['dersin adi','ders adi']),None)
        if code_index is None or name_index is None:continue
        code_value=row[code_index+1] if code_index+1<len(row) and fold(row[code_index+1]) not in ['dersin adi','ders adi'] else ''
        name_value=row[name_index+1] if name_index+1<len(row) and fold(row[name_index+1]) not in ['dersin kodu','ders kodu'] else ''
        if (not code_value or not name_value) and row_number+1<len(rows):
            next_row=rows[row_number+1]
            code_value=code_value or (next_row[code_index] if code_index<len(next_row) else '')
            name_value=name_value or (next_row[name_index] if name_index<len(next_row) else '')
        identifier=course_code(code_value);title=clean(name_value)
        if identifier and 2<=len(title)<=200:return identifier,title
    return None


def _semester(rows):
    roman={'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10,'XI':11,'XII':12}
    header=next((index for index,row in enumerate(rows) if any(fold(value)=='yariyil' for value in row)),None)
    if header is None:return None
    for row in rows[header+1:header+4]:
        if not row:continue
        value=clean(row[0]).upper().strip('. ')
        if value in roman:return roman[value]
        if value.isdigit() and 1<=int(value)<=12:return int(value)
    return None


def _period(value):
    value=fold(value)
    match=re.search(r'(?:semester\s*#?\s*|\b)(\d{1,2})\s*\.?\s*yariyil\b|semester\s*#?\s*(\d{1,2})',value)
    if match:
        period=int(match[1] or match[2])
        return period if 1<=period<=12 else None
    names={'birinci':1,'ikinci':2,'ucuncu':3,'dorduncu':4,'besinci':5,'altinci':6,
        'yedinci':7,'sekizinci':8,'dokuzuncu':9,'onuncu':10,'on birinci':11,'on ikinci':12}
    return next((period for name,period in names.items() if re.search(r'\b'+name+r'\s+yariyil\b',value)),None)


def _study_year(value):
    match=re.fullmatch(r'([1-6])\s*\.?\s*(?:yil|sinif)',fold(value))
    return int(match[1]) if match else None


def _kind(rows, course_kind):
    for row in rows:
        for value in row:
            direct=course_kind(value)
            if direct:return direct
            marked=fold(value).replace('✕','x').replace('✖','x').replace('×','x').replace('*','x')
            if re.search(r'zorunlu\s*\([^)]*x[^)]*\)',marked):return 'required'
            if re.search(r'secmeli\s*\([^)]*x[^)]*\)',marked):return 'elective'
    return None


def parse_esogu_tables(tables, course_code, course_kind):
    plans=[];details=[];pending=None
    last_year=0;carried_mapping=None;detail_year=None
    for rows in tables:
        labels_in_table={fold(value) for row in rows for value in row}
        has_plan_header='akts' in labels_in_table and bool(labels_in_table.intersection(
            {'ders adi','dersin adi','course title','course name'})) and bool(labels_in_table.intersection(
            {'ders kodu','dersin kodu','kodu','course code'}))
        mapping=carried_mapping if not has_plan_header else None
        table_courses=[]
        season=None;semester=None;year=None
        initial_year=next((_study_year(value) for row in rows[:3] for value in row if _study_year(value)),None)
        has_season=any(re.fullmatch(r'(?:guz|bahar) donemi',fold(' '.join(row))) for row in rows)
        if initial_year:year=initial_year
        elif has_season:year=last_year+1
        else:year=last_year or None
        for values in rows:
            labels=[fold(value) for value in values]
            code_index=next((index for index,label in enumerate(labels) if label in ['ders kodu','dersin kodu','kodu','course code']),None)
            name_index=next((index for index,label in enumerate(labels) if label in ['ders adi','dersin adi','course title','course name']),None)
            type_index=next((index for index,label in enumerate(labels) if label in ['z/s','ders turu','turu']),None)
            ects_index=next((index for index,label in enumerate(labels) if label=='akts'),None)
            if ects_index is None:ects_index=next((index for index,label in enumerate(labels) if label=='ects'),None)
            # Programme-plan tables publish code, title and ECTS together. This
            # excludes the later one-course detail forms in the same document.
            if code_index is not None and name_index is not None and ects_index is not None:
                mapping={'code':code_index,'name':name_index,'kind':type_index}
                continue
            joined=fold(' '.join(values))
            published_period=_period(joined)
            if published_period:semester=published_period;season=None;continue
            published_year=next((_study_year(value) for value in values if _study_year(value)),None)
            if published_year:year=published_year;last_year=max(last_year,year);continue
            if re.fullmatch(r'guz donemi',joined):season='fall';semester=None;continue
            if re.fullmatch(r'bahar donemi',joined):season='spring';semester=None;continue
            if not mapping:continue
            required_indexes=[mapping['code'],mapping['name']]
            if max(required_indexes)>=len(values):continue
            identifier=course_code(values[mapping['code']])
            title=clean(values[mapping['name']])
            if not identifier or not 2<=len(title)<=200:continue
            if re.search(r'^(?:toplam|total)\b|\b(?:secmeli|elective)\s*(?:ders|course|grup|group)',fold(title)):continue
            term=semester
            if term is None and season and year:term=year*2-1 if season=='fall' else year*2
            if term is None and year is None:continue
            kind=course_kind(values[mapping['kind']]) if mapping['kind'] is not None and mapping['kind']<len(values) else None
            course={'code':identifier,'name':title,'semester':term,'kind':kind}
            if term is None:course['year']=year
            table_courses.append(course)
        if table_courses:
            plans.extend(table_courses)
            if year:last_year=max(last_year,year)
            carried_mapping=mapping if semester is None and season is None and year else None
            continue

        context_year=next((_study_year(value) for row in rows for value in row if _study_year(value)),None)
        if context_year:detail_year=context_year
        identity=_identity(rows,course_code)
        if identity:
            if pending and (pending.get('semester') is not None or pending.get('year')):details.append(pending)
            pending={'code':identity[0],'name':identity[1],'semester':None,'kind':None}
            if detail_year:pending['year']=detail_year
        elif len(rows)==1 and len(rows[0])==2:
            identifier=course_code(rows[0][0]);title=clean(rows[0][1])
            if identifier and 2<=len(title)<=200:
                details.append({'code':identifier,'name':title,'semester':None,'kind':None})
        if not pending:continue
        semester=_semester(rows)
        if semester is not None:pending['semester']=semester
        kind=_kind(rows,course_kind)
        if kind:pending['kind']=kind
    if pending and (pending.get('semester') is not None or pending.get('year')):details.append(pending)
    plan_codes={course['code'] for course in plans}
    return merge_courses(plans+[course for course in details if course['code'] not in plan_codes])


def _parse_all_tables(tables, course_code, course_kind):
    return parse_esogu_tables(tables,course_code,course_kind)


def parse_esogu_docx(path, course_code, course_kind):
    try:
        return _parse_all_tables(_tables(path),course_code,course_kind)
    except (KeyError, ElementTree.ParseError, zipfile.BadZipFile):
        return [], ['invalid-official-docx-package']
