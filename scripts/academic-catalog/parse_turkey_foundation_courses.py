"""Institution-specific public tables and curriculum JSON, without inferred facts."""
import json
import re
from parse_cyprus_courses import clean,fold,merge_courses


def parse_foundation_tables(doc,family,course_code,course_kind,heading_period):
    output=[]
    for table in doc.select('table'):
        term=None;mapping=None
        heading=table.find_previous(['h2','h3','h4','h5'])
        if family=='khas' and heading:term,_=heading_period(heading.get_text())
        for row in table.select('tr'):
            if row.find_parent('table')!=table:continue
            values=[clean(c.get_text(' ',strip=True)) for c in row.find_all(['td','th'],recursive=False)]
            names=[fold(v) for v in values]
            if family=='gsu' and len(values)==1:
                term,_=heading_period(values[0]);continue
            required=['kod','ders'] if family=='khas' else ['ders kodu','dersin adi']
            if all(n in names for n in required):
                kind=next((i for i,n in enumerate(names) if n in ['tipi (z/s)','ders tipi','turu']),None)
                mapping=[names.index(required[0]),names.index(required[1]),kind]
                # KHas lists university/department elective pools after all terms.
                if family=='khas' and 'ders tipi' in names:term=None
                continue
            if not mapping or mapping[2] is None or len(values)<=max(mapping):continue
            code,name,kind=[values[i] for i in mapping];identifier=course_code(code)
            if not identifier and family=='gsu' and re.fullmatch(r'[A-Z]{2,8}\d{2,5}-[A-Z]',code):identifier=code
            if not identifier or not 2<=len(name)<=200:continue
            if re.search(r'\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[ivx\d])|^secmeli$',fold(name)):continue
            output.append({'code':identifier,'name':name,'semester':term,'kind':course_kind(kind)})
    return merge_courses(output)


def parse_demiroglu(doc,course_code,course_kind):
    output=[]
    for table in doc.select('table'):
        term=None;is_curriculum=False
        for row in table.select('tr'):
            if row.find_parent('table')!=table:continue
            cells=row.find_all(['td','th'],recursive=False)
            values=[clean(c.get_text(' ',strip=True)) for c in cells]
            if values[:3]==['Ders Kodu','Ders Adı','Ders Türü']:is_curriculum=True;continue
            if not is_curriculum:continue
            heading=re.fullmatch(r'Yıl (\d+) Semester (\d+)',clean(' '.join(values)))
            if heading:
                year,half=map(int,heading.groups());term=2*(year-1)+half if 1<=year<=6 and half in [1,2] else None;continue
            if not term or len(cells)<3:continue
            pools=cells[0].select('ul li a[href*="DersGetir?"]')
            if pools:
                titles=[clean(s) for s in cells[1].stripped_strings];kinds=[clean(s) for s in cells[2].stripped_strings]
                if len(titles)!=len(pools)+1 or len(kinds)!=len(titles):continue
                candidates=[(a.get_text(),titles[i+1],kinds[i+1]) for i,a in enumerate(pools)]
            else:candidates=[tuple(values[:3])]
            for code,name,kind in candidates:
                identifier=course_code(code)
                if not identifier or not 2<=len(name)<=200 or fold(name).startswith('secmeli'):continue
                output.append({'code':identifier,'name':name,'semester':term,'kind':course_kind(kind)})
    return merge_courses(output)


def parse_antalya(doc,course_code):
    def embedded(name):
        for script in doc.select('script'):
            text=script.get_text();marker='const '+name+' = '
            if marker in text:return json.JSONDecoder().raw_decode(text.split(marker,1)[1])[0]
        return None
    plan=embedded('coursePlan');electives=embedded('electiveCourses');output=[];pools={}
    if not isinstance(plan,list):return [],['unrecognized-antalya-curriculum']
    for row in plan:
        if row.get('status')!=10201:continue
        term=row.get('semester');term=term if type(term)==int and 1<=term<=12 else None
        if row.get('course_type')=='elective_pool' and row.get('elective_pool_id'):
            pools.setdefault(row['elective_pool_id'],set()).add(term);continue
        if row.get('course_type')!='course' or not row.get('course_id'):continue
        code=course_code(row.get('code',''));name=clean(row.get('course_name') or '')
        if code and 2<=len(name)<=200:output.append({'code':code,'name':name,'semester':term,'kind':None})
    for row in electives if isinstance(electives,list) else []:
        terms=pools.get(row.get('elective_pool_id'))
        if not terms:continue
        code=course_code(row.get('code',''));name=clean(row.get('name') or '')
        if code and 2<=len(name)<=200:
            for term in terms:output.append({'code':code,'name':name,'semester':term,'kind':'elective'})
    return merge_courses(output)
