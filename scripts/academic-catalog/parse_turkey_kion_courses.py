"""KION public course grid: column names and row periods, never layout guesses."""
import re
from parse_cyprus_courses import clean,fold,merge_courses


def parse_kion(doc,course_code,course_kind):
    table=doc.select_one('#Content_Content_gridCoursePlan_DXMainTable')
    if not table:return [],['missing-kion-course-grid']
    header=table.select_one('tr[id$="DXHeadersRow0"]')
    if not header:return [],['missing-kion-course-headings']
    names=[fold(c.get_text(' ',strip=True)) for c in header.find_all(['td','th'],recursive=False)]
    required=['donem','ders kodu','ders adi','ders tipi']
    if not all(n in names for n in required):return [],['unrecognized-kion-course-headings']
    indices=[names.index(n) for n in required];output=[]
    for row in table.select('tr[id*="DXDataRow"]'):
        if row.find_parent('table')!=table:continue
        values=[clean(c.get_text(' ',strip=True)) for c in row.find_all(['td','th'],recursive=False)]
        if len(values)<=max(indices):continue
        term,code,name,kind=[values[i] for i in indices]
        if not term.isdigit() or not 1<=int(term)<=12:continue
        # These providers publish alphabetic internship codes in the code column.
        identifier=course_code(code) or (code if re.fullmatch(r'[A-ZÇĞİÖŞÜ]{3,16}',code) else None)
        if not identifier or not 2<=len(name)<=200:continue
        if re.search(r'\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[ivx\d])|^secmeli$',fold(name)):continue
        output.append({'code':identifier,'name':name,'semester':int(term),'kind':course_kind(kind)})
    return merge_courses(output)
