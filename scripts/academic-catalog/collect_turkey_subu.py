"""SUBU's anonymous catalogue APIs as published by its public web client.

The public client declares the directory and teaching-plan endpoints. This
collector sends no Authorization header and uses no account or browser token.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlencode
from turkey_research import CACHE, ROOT, fetch, read, write
from discover_turkey_courses import match

BASE='https://ebsapi.bys.subu.edu.tr/'
UID='tr-sakarya-uygulamali-bilimler-universitesi'


def public(path):
    source=fetch(BASE+path)
    return read(CACHE/source['file']) if source['status']==200 else []


def main():
    university=read(ROOT/'data/academic-catalog-2026.json')['universities'][UID]
    years=public('api/AkademikYil/GetAkademikYilList')
    selected=next(y for y in years['akademikYilList'] if y['id']==years['seciliAkademikYil'])
    faculties={};departments={}
    for degree,fpath,dpath in [('bachelor','GetLisansList','GetLisansListByUstBirimId'),('associate','GetOnLisansList','GetOnLisansAltBirimList')]:
        faculties.update({n['id']:{**n,'degree':degree} for n in public('api/Birim/'+fpath)})
        departments.update({n['id']:n for n in public('api/Birim/'+dpath)})
    matched=[]
    for n in public('api/Birim/GetBirimListByUstBirimId'):
        parent=departments.get(n['ustBirimId']);unit=faculties.get(parent['ustBirimId']) if parent else None
        if not unit:continue
        item={'universityId':UID,'title':n['ad'],'degree':unit['degree'],'unit':unit['ad'],
            'directoryUrl':'https://ebs.bys.subu.edu.tr/'}
        p=match(university,item)
        if not p:continue
        query={'bi':n['ustBirimId'],'pi':n['id'],'ay':selected['id'],'ic':''}
        params={'birimId':n['id'],'akademikYilId':selected['id'],'dilTuruId':2001}
        item.update(programId=p['id'],name=p['name'],publicUrl='https://ebs.bys.subu.edu.tr/BolumDetay?'+urlencode(query),
            courseUrl=BASE+'api/OgretimPlaniDers/GetOgretimPlaniDersListByBirimIdAndAkademikYilId?'+urlencode(params))
        matched.append(item)
    counts={}
    for m in matched:counts[m['programId']]=counts.get(m['programId'],0)+1
    matched=[m for m in matched if counts[m['programId']]==1]
    write(CACHE/'subu-directories.json',[{'universityId':UID,'matched':matched}])
    output=[]
    with ThreadPoolExecutor(2) as pool:
        futures={pool.submit(fetch,p['courseUrl']):p for p in matched}
        for f in as_completed(futures):
            p=futures[f];output.append({**f.result(),'family':'subu','publicUrl':p['publicUrl'],
                'curriculumPeriod':selected['ad'],'programs':[p]})
            if len(output)%20==0:write(CACHE/'subu-courses.json',output);print('courses',len(output),'/',len(matched),flush=True)
    write(CACHE/'subu-courses.json',output)


if __name__=='__main__':main()
