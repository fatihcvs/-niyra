"""Replay witnessed public KION programme routes and verify their visible titles."""
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from turkey_research import CACHE,ROOT,fetch,read,write,soup
from discover_turkey_courses import normal,match
from collect_turkey_web_curricula import pair
from parse_cyprus_courses import clean,fold

PROVIDERS={'kostu':'tr-kocaeli-saglik-ve-teknoloji-universitesi','mayis':'tr-istanbul-29-mayis-universitesi'}


def collect(provider,settings,row,university):
    title,faculty,programme=row
    degree='associate' if faculty in ([2,8] if provider=='kostu' else [30]) else 'bachelor'
    directory=settings[degree+'Directory']
    params={'lang':'tr-TR','academicYear':settings['academicYear'],'facultyId':faculty,'programId':programme,'menuType':'unit'}
    def load():return fetch(settings['host']+'/Pages/CoursePlan.aspx?'+urlencode(params),retry_failed=True)
    source=load();doc=soup(source);current_url=source['url']
    heading=next((clean(f.get_text()) for f in doc.select('font[color="Gray"]') if ' - ' in f.get_text()),'')
    if not heading:return {'error':'missing-public-programme-title','url':current_url}
    unit,name=heading.rsplit(' - ',1)
    if normal(name)!=normal(title):return {'error':'witness-title-mismatch','url':current_url}
    item={'title':title,'sourceTitle':title,'unit':unit,'degree':degree,'directoryUrl':directory,'courseUrl':current_url,'family':'kion','identityEvidenceUrl':current_url}
    if provider=='mayis' and title=='İngiliz Dili ve Edebiyatı':
        policy='https://edebiyat.29mayis.edu.tr/tr/ingiliz-dili-ve-edebiyati-bolumu'
        if 'programin egitim dili ingilizcedir' in fold(soup(fetch(policy)).get_text(' ',strip=True)):
            item.update(title=title+' (İngilizce)',identityEvidenceUrl=policy)
    if provider=='kostu' and title in ['İŞLETME (%30 İNG)','ULUSLARARASI TİCARET VE FİNANSMAN (%30 İNG)']:
        policy='https://kocaelisaglik.edu.tr/sik-sorulan-sorular/'
        if 'isletme, uluslararasi ticaret ve finansman bolumunde %30 ingilizce zorunlulugu bulunmaktadir' in fold(soup(fetch(policy,retry_failed=True)).get_text(' ',strip=True)):
            item.update(title=title.removesuffix(' (%30 İNG)'),identityEvidenceUrl=policy)
    p=match(university,item)
    if not p:return {'unmatched':item}
    current_rows=len(doc.select('#Content_Content_gridCoursePlan_DXMainTable tr[id*="DXDataRow"]'))
    selection_reason='current-listed-year'
    if provider=='mayis':
        # The 2025 selection and resulting route were witnessed in the official UI.
        # Require that this programme page also offers that exact year label.
        if "'value':'2025','text':'2025 - 2026'" in str(doc):
            params['academicYear']='2025';previous_source=load();previous_doc=soup(previous_source)
            previous_heading=next((clean(f.get_text()) for f in previous_doc.select('font[color="Gray"]') if ' - ' in f.get_text()),'')
            previous_rows=len(previous_doc.select('#Content_Content_gridCoursePlan_DXMainTable tr[id*="DXDataRow"]'))
            if normal(previous_heading)==normal(heading) and previous_rows>=3 and current_rows<previous_rows/2:
                source=previous_source;doc=previous_doc;item['courseUrl']=source['url']
                selection_reason='sparse-current-year-uses-richer-public-previous-year'
            else:params['academicYear']=settings['academicYear']
    selected=doc.select_one('#TopPanel_comboAcademicYear_I')
    year=doc.select_one('#TopPanel_comboAcademicYear_VI')
    if not selected or not year or year.get('value')!=str(params['academicYear']):return {'error':'unconfirmed-year-selection','url':source['url']}
    reference={**item,'programId':p['id'],'universityId':PROVIDERS[provider],'name':p['name']}
    return {'item':reference,'source':{**source,'programs':[reference],'family':'kion','curriculumPeriod':selected.get('value'),
        'selection':{'academicYear':year['value'],'method':'witnessed-public-year-selector','navigationWitness':current_url,'currentYearCourseRows':current_rows,'reason':selection_reason}}}


def main():
    witness=read(ROOT/'scripts/academic-catalog/kion-navigation-2026.json')
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities'];directories=[];courses=[]
    for provider,uid in PROVIDERS.items():
        settings=witness[provider];university=universities[uid]
        with ThreadPoolExecutor(4) as pool:results=list(pool.map(lambda row:collect(provider,settings,row,university),settings['rows']))
        items=[r['item'] for r in results if r.get('item')];directory=pair(uid,university,items)
        directory['source']=fetch(settings['bachelorDirectory']);directory['unmatched']+=[r['unmatched'] for r in results if r.get('unmatched')]
        directory['errors']=[r for r in results if r.get('error')];directories.append(directory)
        eligible={p['programId'] for p in directory['matched']}
        courses += [r['source'] for r in results if r.get('item',{}).get('programId') in eligible]
        write(CACHE/'kion-directories.json',directories);write(CACHE/'kion-courses.json',courses)
        print(uid,'matched',len(directory['matched']),'unmatched',len(directory['unmatched']),'errors',len(directory['errors']),flush=True)


if __name__=='__main__':main()
