"""AFSU public Bologna API, whose routes and selection rules are in its web client."""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from turkey_research import CACHE, ROOT, fetch, read, write
from discover_turkey_courses import match, normal

BASE='https://ekampus.afsu.edu.tr/bologna/'
CLIENT=BASE+'src_main_webapp_bootstrap_ts.4f405bca6a9dc58f.js'
MENU=BASE+'src_main_webapp_app_modules_bologna_akademik_sol-menu_sol-menu_component_ts.5270d1572ccb54ef.js'
DIRECTORY=BASE+'services/referanslar-servis/api/publics/listeleByBolognaBirim'
UID='tr-afyonkarahisar-saglik-bilimleri-universitesi'


def api(service,method,identifier):
    return fetch(BASE+'services/'+service+'/api/publics/'+method+'/'+identifier)


def directory():
    university=read(ROOT/'data/academic-catalog-2026.json')['universities'][UID]
    source=fetch(DIRECTORY);tree=read(CACHE/source['file']);items=[]
    for group in tree:
        for unit in group.get('birimMenuResponses') or []:
            degree={'FAKULTE':'bachelor','MESLEK_YUKSEKOKULU':'associate'}.get(unit.get('birimTur'))
            if not degree:continue
            for program in unit.get('birimMenuResponses') or []:
                if program.get('birimTur')!='ONLISANS_LISANS_PROGRAMI':continue
                items.append({'title':program['label'],'unit':unit['label'],'degree':degree,
                    'directoryUrl':BASE,'directoryDataUrl':DIRECTORY,'courseUrl':BASE+'prog?progId='+program['id'],
                    'sourceProgramId':program['id']})
    mapped=[];unmatched=[]
    for item in items:
        p=match(university,item)
        if p:mapped.append({**item,'universityId':UID,'programId':p['id'],'name':p['name']})
        else:unmatched.append(item)
    counts=Counter(p['programId'] for p in mapped)
    return {'universityId':UID,'matched':[p for p in mapped if counts[p['programId']]==1],'unmatched':unmatched}


def collect(item):
    detail=api('bologna-servis','getirByBirimToId',item['sourceProgramId'])
    value=read(CACHE/detail['file'])
    if (value.get('birimId')!=item['sourceProgramId'] or normal(value.get('ad',''))!=normal(item['title'])
        or value.get('ogrenimTur')!='NORMAL_OGRETIM'
        or (value.get('ogrenimSure')==2)!=(item['degree']=='associate')):
        raise ValueError('AFSU programme identity does not match its directory')
    years=api('obs-servis','listeleByBirimYilBologna',value['birimId']);choices=read(CACHE/years['file'])
    if not choices:return {**detail,'programs':[item]}
    # The public UI defaults to the first returned plan; no inferred end year.
    choice=choices[0];result=api('bologna-servis','listeleBolognaTumDersler',choice['id'])
    return {**result,'family':'afsu','publicUrl':item['courseUrl'],'programs':[item],
        'curriculumPeriod':choice['ad'],'selection':{'curriculumId':choice['id'],'curriculumLabel':choice['ad'],
        'catalogueYear':choice['baslangicYil'],'directoryDataUrl':DIRECTORY,'clientUrl':CLIENT,'selectionClientUrl':MENU}}


def main():
    for url in [CLIENT,MENU]:
        if fetch(url)['status']!=200:raise ValueError('Public client evidence unavailable')
    entry=directory();write(CACHE/'afsu-directories.json',[entry]);print('AFSU matched',len(entry['matched']),flush=True)
    with ThreadPoolExecutor(2) as pool:result=list(pool.map(collect,entry['matched']))
    write(CACHE/'afsu-courses.json',result);print('AFSU responses',len(result),flush=True)


if __name__=='__main__':main()
