"""Named settlement centres in Turkey, matched to sourced campus coordinates."""
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
import hashlib
import json
import time
from housing_geo import distance, fold

ROOT=Path(__file__).resolve().parents[2]
CACHE=ROOT/'.sites-runtime/turkey-areas'
QUERY='''[out:json][timeout:150];
area["ISO3166-1"="TR"]["admin_level"="2"]->.country;
node(area.country)["place"~"^(neighbourhood|suburb|quarter|town|village)$"]["name"];
out body;'''


def read(path):return json.loads(path.read_text('utf8'))
def write(path,value):
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n','utf8');temp.replace(path)


def main():
    CACHE.mkdir(parents=True,exist_ok=True)
    source=CACHE/'areas.json';meta=CACHE/'source.json'
    if not source.exists():
        (CACHE/'query.overpassql').write_text(QUERY,'utf8')
        for endpoint in ['https://overpass.private.coffee/api/interpreter','https://overpass-api.de/api/interpreter']:
            try:
                print('Requesting',endpoint,flush=True)
                req=Request(endpoint,data=urlencode({'data':QUERY}).encode(),headers={
                    'User-Agent':'KampiraCampusCatalog/1.0 (+https://github.com/fatihcvs/-niyra)',
                    'Content-Type':'application/x-www-form-urlencoded'})
                with urlopen(req,timeout=180) as response:raw=response.read(30_000_001)
                if len(raw)>30_000_000:raise ValueError('Source exceeds size limit')
                data=json.loads(raw)
                if data.get('remark') or not data.get('elements'):raise ValueError(data.get('remark') or 'Empty area response')
                source.write_bytes(raw)
                write(meta,{'url':endpoint,'query':QUERY,'checkedAt':datetime.now(timezone.utc).date().isoformat(),
                    'sourceHash':hashlib.sha256(raw).hexdigest(),'snapshotAt':data.get('osm3s',{}).get('timestamp_osm_base')})
                break
            except Exception as e:print(type(e).__name__,str(e)[:160],flush=True);time.sleep(5)
        else:raise RuntimeError('No complete area source could be downloaded')
    provenance=read(meta);data=read(source)
    assert hashlib.sha256(source.read_bytes()).hexdigest()==provenance['sourceHash']
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
    campuses=read(ROOT/'data/housing-catalog-2026.json')['campuses']
    coordinates=defaultdict(list)
    for c in campuses:
        if academic[c['universityId']]['region']=='Türkiye' and c['latitude'] is not None and c['longitude'] is not None:
            coordinates[c['universityId']].append(c)
    bins=defaultdict(list)
    for n in data['elements']:
        bins[(int(n['lat']*10),int(n['lon']*10))].append(n)
    places=[];coverage=[]
    for uid,u in academic.items():
        if u['region']!='Türkiye':continue
        candidates={}
        for campus in coordinates[uid]:
            y,x=int(campus['latitude']*10),int(campus['longitude']*10)
            for a in range(y-1,y+2):
                for b in range(x-1,x+2):
                    for node in bins[(a,b)]:
                        meters=distance((campus['latitude'],campus['longitude']),(node['lat'],node['lon']))
                        if meters>5000:continue
                        prior=candidates.get(node['id'])
                        if not prior or meters<prior[0]:candidates[node['id']]=(meters,campus,node)
        selected=[];per_campus=defaultdict(int)
        for meters,campus,n in sorted(candidates.values(),key=lambda c:c[0]):
            name=n['tags'].get('name:tr') or n['tags']['name']
            if per_campus[campus['id']]>=5:continue
            if any(fold(p['name'])==fold(name) and distance((p['latitude'],p['longitude']),(n['lat'],n['lon']))<1000 for p in selected):continue
            selected.append({'id':f"catalog:{uid}:area-node-{n['id']}",'universityId':uid,'name':name,'category':'area',
                'description':'Kampüs çevresindeki mahalle veya yerleşim. Mesafe haritadaki bölge merkezine kuş uçuşudur.',
                'address':n['tags'].get('addr:full',''),'latitude':n['lat'],'longitude':n['lon'],
                'accessibility':[],'openingHours':'','distanceMeters':round(meters),'campusName':campus['name'],
                'source':{'type':'openstreetmap','label':'OpenStreetMap','url':f"https://www.openstreetmap.org/node/{n['id']}",
                    'osmElement':f"node/{n['id']}",'checkedAt':provenance['checkedAt']},
                'campusId':campus['id'],'campusSourceUrl':campus['sourceUrl']})
            per_campus[campus['id']]+=1
        places+=selected
        coverage.append({'universityId':uid,'locatedCampuses':len(coordinates[uid]),'nearbyAreas':len(selected)})
    write(ROOT/'data/turkey-campus-areas-2026.json',{'checkedAt':provenance['checkedAt'],'snapshotAt':provenance['snapshotAt'],
        'sourceHash':provenance['sourceHash'],'areaRadiusMeters':5000,'coverage':coverage,'places':places})
    print('Areas',len(places),'universities',sum(bool(c['nearbyAreas']) for c in coverage),'/',len(coverage),flush=True)


if __name__=='__main__':main()
