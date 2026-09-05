"""Newly verified BAU and Yalova public catalogue entrances."""
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write, collect_program_pages
from discover_turkey_courses import discover_university, links, match, normal
from collect_turkey_ubys import discover as ubys_directory
from collect_turkey_web_curricula import pair
from collect_turkey_language_labels import expand_language

POLICY='https://aday.bau.edu.tr/sikca-sorulan-sorular/derslerin-ne-kadari-ingilizce-isleniyor/'
YALOVA='https://ubs.yalova.edu.tr/AIS/OutcomeBasedLearning/Home/Index?id=39Lrhuik8DkQWEZkyw9E7g!xGGx!!xGGx!&apIdStr=39Lrhuik8DkQWEZkyw9E7g!xGGx!!xGGx!&culture=tr-TR'


def bau(university):
    uid='tr-bahcesehir-universitesi'
    directory=discover_university({'programs':[{'universityId':uid}],
        'catalogLinks':[('https://akts.bau.edu.tr/bilgipaketi/','Bilgi Paketi')]},university)
    policy=soup(fetch(POLICY)).get_text(' ',strip=True)
    english_policy='egitim dilinin tamami ingilizcedir' in normal(policy)
    items=list(directory['matched'])
    for item in directory['unmatched']:
        if item.get('family')!='eobs':continue
        original=item['title'];title=expand_language(original)
        unit=re.sub(r'yüksek okulu','Yüksekokulu',item.get('unit') or '',flags=re.I)
        item={**item,'title':title,'sourceTitle':original,'unit':unit}
        if not match(university,item) and item['degree']=='bachelor' and english_policy and '(' not in original:
            item['title']+=' (İngilizce)';item['identityEvidenceUrl']=POLICY
        if not match(university,item):continue
        page=fetch(item['url']);navigation=links(soup(page),page.get('finalUrl',item['url']))
        course=next((u for u in navigation if '/ogrenimprogrami/program_kodu/' in u
            and urlparse(u).hostname==urlparse(item['url']).hostname),None)
        if course:items.append({**item,'courseUrl':course})
    return pair(uid,university,items)


def main():
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
    b=bau(academic['tr-bahcesehir-universitesi'])
    y=ubys_directory('tr-yalova-universitesi',YALOVA,academic['tr-yalova-universitesi'])
    # Keep the catalogue entrance clean; the programme URL has its own source ID.
    for p in y['matched']:p['directoryUrl']='https://ubs.yalova.edu.tr/AIS/OutcomeBasedLearning/Home/Index'
    write(CACHE/'bau-yalova-directories.json',[b,y]);print('BAU',len(b['matched']),'Yalova',len(y['matched']),flush=True)
    collect_program_pages([b],'bau-courses')
    def collect(p):
        return {**fetch(p['courseUrl'],p['payload']),'publicUrl':p['publicUrl'],'programs':[p],'family':'ubys','payload':p['payload']}
    with ThreadPoolExecutor(2) as pool:result=list(pool.map(collect,y['matched']))
    write(CACHE/'bau-yalova-courses.json',read(CACHE/'bau-courses.json')+result)


if __name__=='__main__':main()
