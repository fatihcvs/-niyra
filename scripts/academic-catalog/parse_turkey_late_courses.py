"""Explicit institution layouts that do not use ordinary column headings."""
import re
from parse_cyprus_courses import clean, fold, merge_courses


def is_placeholder(name):
    return bool(re.search(r'^(?:toplam|total)\b|\b(?:secmeli|elective)\s*(?:ders|course|grup|group|[IVX\d])',fold(name)))


def parse_baskent(doc, code):
    result=[]
    ordinals=['birinci','ikinci','ucuncu','dorduncu','besinci','altinci','yedinci','sekizinci','dokuzuncu','onuncu','on birinci','on ikinci']
    for table in doc.select('table'):
        if table.select('table'):continue
        term=None;kind=None
        for row in table.select('tr'):
            header=row.select_one('th.baslik[colspan]')
            if header:
                label=fold(header.get_text(' ',strip=True));term=None
                term=next((i+1 for i,word in reversed(list(enumerate(ordinals))) if re.search(r'\b'+word+r'\s+yariyil',label)),None)
                kind='elective' if 'secmeli' in label else 'required' if 'zorunlu' in label else None
                continue
            cells=row.find_all('td',recursive=False)
            if len(cells)<6:continue
            identifier=code(cells[0].get_text());name=clean(cells[1].get_text())
            if not identifier or not 2<=len(name)<=200 or is_placeholder(name):continue
            result.append({'code':identifier,'name':name,'semester':term,'kind':kind})
    return merge_courses(result)


def parse_erciyes(doc, code, kind, period):
    result=[]
    for table in doc.select('table.my-table88'):
        heading=table.find_previous('nav')
        term,year=period(heading.get_text(' ',strip=True)) if heading else (None,None)
        for row in table.select('tr'):
            cells=row.find_all('td',recursive=False)
            if len(cells)!=6:continue
            identifier=code(cells[0].get_text());name=clean(cells[1].get_text())
            if not identifier or not 2<=len(name)<=200 or is_placeholder(name):continue
            record={'code':identifier,'name':name,'semester':term,'kind':kind(cells[2].get_text())}
            if year:record['year']=year
            result.append(record)
    return merge_courses(result)


def parse_subu(groups, code, kind, period):
    result=[]
    for group in groups:
        for row in group.get('planListe') or []:
            if row.get('silindimi') or row.get('ogretimPlaniDersDurumTuru')!='Aktif':continue
            if row.get('dersTuru')=='Seçmeli Ders Grubu':continue
            identifier=code(str(row.get('birimKodu') or '')+str(row.get('dersKodu') or ''))
            name=clean(row.get('dersAd'));term,year=period(row.get('yariyilTuru') or '')
            if not identifier or not 2<=len(name)<=200 or is_placeholder(name):continue
            record={'code':identifier,'name':name,'semester':term,'kind':kind(row.get('dersTuru') or '')}
            if year:record['year']=year
            result.append(record)
    return merge_courses(result)


def parse_igdir(doc, parse_tables):
    # This catalogue publishes untranslated resource keys around actual rows.
    labels={'[DersKodu]':'Ders Kodu','[DersAdi]':'Ders Adı','[DersTuru]':'Ders Türü',
        '[Donem]':'Dönem','[Zorunlu]':'Zorunlu','[Secmeli]':'Seçmeli'}
    for node in doc.find_all(string=re.compile(r'\[(?:DersKodu|DersAdi|DersTuru|Donem|Zorunlu|Secmeli)\]')):
        value=str(node)
        for key,text in labels.items():value=value.replace(key,text)
        node.replace_with(value)
    return parse_tables(doc)


def parse_ktu(doc, code, kind, period):
    """Year pages interleave seasonal plans and unassigned elective pools."""
    output=[]
    for table in doc.select('table#bilgehan'):
        year=None;term=None
        for row in table.select('tr'):
            cells=row.find_all(['td','th'],recursive=False)
            values=[clean(c.get_text(' ',strip=True)) for c in cells]
            if len(values)==1:
                label=fold(values[0]);p,y=period(values[0],year)
                if re.fullmatch(r'[1-6]\.\s*yil',label):year=y;term=None
                elif re.fullmatch(r'(?:guz|bahar) donemi',label):term=p
                elif 'secmeli' in label:term=None
                continue
            if len(values)!=6 or not cells[0].select_one('a[href*="course.aspx"]'):continue
            identifier=code(values[0]);name=values[1]
            if identifier and 2<=len(name)<=200 and not is_placeholder(name):
                output.append({'code':identifier,'name':name,'semester':term,'kind':kind(values[4])})
    return merge_courses(output)


def parse_bilgi(doc, code, kind):
    """A numbered term restarts each class year; elective group labels are not courses."""
    output=[]
    for table in doc.select('table'):
        if table.select('table'):continue
        heading=table.find_previous_sibling('div')
        label=fold(heading.get_text(' ',strip=True)) if heading else ''
        period=re.search(r'\b(?:sinif|level)\s*:\s*([1-6])\s*\|\s*(?:donem|semester)\s*:\s*([12])\b',label)
        if not period:continue
        term=(int(period[1])-1)*2+int(period[2])
        for row in table.select('tbody > tr'):
            cells=row.find_all('td',recursive=False)
            if len(cells)!=5 or not cells[0].select_one('a[href*="/Course/Detail?"]'):continue
            identifier=code(cells[0].get_text());name=clean(cells[1].get_text(' ',strip=True))
            if identifier and 2<=len(name)<=200 and not is_placeholder(name):
                output.append({'code':identifier,'name':name,'semester':term,'kind':kind(cells[2].get_text())})
    return merge_courses(output)


def parse_afsu(groups, code):
    """Retain actual nested courses, with the source's annual or semester group."""
    output=[]
    def visit(row,term,year,depth=0):
        if depth>12:raise ValueError('Unexpected curriculum nesting')
        identifier=code(row.get('dersKod') or '');name=clean(row.get('adi'))
        if row.get('id') and identifier and 2<=len(name)<=200 and not is_placeholder(name):
            record={'code':identifier,'name':name,'semester':term,
                'kind':{'ZORUNLU':'required','SECMELI':'elective','ALAN_DISI':'elective'}.get(row.get('dersSecimTipi'))}
            if year:record['year']=year
            output.append(record)
        for child in (row.get('childDersList') or [])+(row.get('dersResponseList') or []):
            visit(child,term,year,depth+1)
    for group in groups:
        annual=re.fullmatch(r'S([1-6])',group.get('sinif') or '')
        semester=re.fullmatch(r'YY([1-9]|1[0-2])',group.get('yariYil') or '')
        term=int(semester[1]) if semester and not group.get('sinif') else None
        year=int(annual[1]) if annual else None
        for row in group.get('ders') or []:visit(row,term,year)
    return merge_courses(output)
