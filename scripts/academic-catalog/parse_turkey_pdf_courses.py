"""Labelled PDF curriculum tables, including independently headed side-by-side terms."""
import re
from parse_cyprus_courses import clean,fold,merge_courses


def parse_pdf_tables(tables,course_code,course_kind,heading_period):
    output=[]
    for table in tables:
        term,_=heading_period(table.get('heading',''))
        periods=[(0,term)];mapping=[];elective=False
        for row in table['rows']:
            values=[clean(v or '') for v in row];names=[fold(v) for v in values]
            nonempty=[v for v in values if v]
            if len(nonempty)==1 and re.fullmatch(r'(?:\w+\s+)?(?:secmeli dersler|elective courses)(?:\s+listesi)?',fold(nonempty[0])):
                # A pool can occupy just the left half of a formerly paired table.
                periods=[(0,None)];mapping=[];elective=True
                continue
            labelled=[(i,heading_period(v)[0]) for i,v in enumerate(values) if heading_period(v)[0]]
            if labelled and len(nonempty)<=4:
                periods=labelled;elective=False
                continue
            codes=[i for i,v in enumerate(names) if v in ['ders kodu','dersin kodu','course code']]
            titles=[i for i,v in enumerate(names) if v in ['ders adi','dersin adi','course name','course title']]
            if codes and titles:
                mapping=[]
                for number,c in enumerate(codes):
                    end=codes[number+1] if number+1<len(codes) else len(values)
                    n=next((i for i in titles if c<i<end),None)
                    k=next((i for i in range(c,end) if names[i] in ['ders turu','dersin turu','z/s','type']),None)
                    if n is not None:mapping.append((c,n,k,next((p for i,p in reversed(periods) if i<=c),None)))
                continue
            for c,n,k,semester in mapping:
                if max(c,n)>=len(values):continue
                code=course_code(re.sub(r'\*+$','',values[c]).strip());name=values[n]
                if not code or not 2<=len(name)<=200 or '(cid:' in name:continue
                if re.search(r'^(?:toplam|total)\b|\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[ivx\d])',fold(name)):continue
                kind='elective' if elective else course_kind(values[k]) if k is not None and k<len(values) else None
                output.append({'code':code,'name':name,'semester':semester,'kind':kind})
    return merge_courses(output)


def parse_pdf(path,course_code,course_kind,heading_period):
    import pdfplumber
    tables=[]
    with pdfplumber.open(path) as document:
        for page in document.pages:
            for table in page.find_tables():
                x0,top,x1,_=table.bbox
                heading=page.crop((x0,max(0,top-36),x1,top)).extract_text() or ''
                tables.append({'heading':heading,'rows':table.extract()})
    return parse_pdf_tables(tables,course_code,course_kind,heading_period)
