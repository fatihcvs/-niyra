"""Revisit explicit language abbreviations, keeping faculty and programme identity."""
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse
from turkey_research import CACHE, ROOT, fetch, read, soup, write, collect_program_pages
from discover_turkey_courses import match, links


def expand_language(title):
    title=re.sub(r'\(\s*(?:TR|Türkçe)\s*\)','',title,flags=re.I)
    title=re.sub(r'\(\s*EN\s*\)','(İngilizce)',title,flags=re.I)
    # Mixed EN/TR, other languages and teaching-mode qualifiers stay distinct.
    return re.sub(r'\s+',' ',title).strip()


def linked_course(item):
    page=fetch(item['url']);navigation=links(soup(page),page.get('finalUrl',item['url']))
    course=next((u for u in navigation if '/oibs/bologna/progCourses.aspx' in u
        and urlparse(u).hostname==urlparse(item['url']).hostname),None)
    return {**item,'courseUrl':course} if course else None


def main():
    academic=read(ROOT/'data/academic-catalog-2026.json')['universities']
    published=set(read(ROOT/'data/course-catalog-index-2026.json')['programs'])|set(read(ROOT/'data/official-course-catalog-2026.json')['programs'])
    previous=CACHE/'language-label-directories.json'
    if previous.exists():
        published-={d['universityId']+':'+p['programId'] for d in read(previous) for p in d['matched']}
    candidates={}
    for name in ['discovery','additional-discovery','refined-discovery','expanded-discovery']:
        path=CACHE/(name+'.json')
        if not path.exists():continue
        for directory in read(path):
            uid=directory['universityId']
            for item in directory.get('unmatched',[]):
                if item.get('family')!='oibs':continue
                title=expand_language(item['title'])
                if title==item['title']:continue
                item={**item,'sourceTitle':item['title'],'title':title}
                p=match(academic[uid],item)
                if p and uid+':'+p['id'] not in published:
                    candidates[item['url']]={**item,'universityId':uid,'programId':p['id'],'name':p['name']}
    groups=defaultdict(list)
    for item in candidates.values():groups[(item['universityId'],item['programId'])].append(item)
    candidates=[g[0] for g in groups.values() if len(g)==1]
    directories=defaultdict(list)
    with ThreadPoolExecutor(6) as pool:
        for item in pool.map(linked_course,candidates):
            if item:directories[item['universityId']].append(item)
    results=[{'universityId':uid,'matched':items} for uid,items in directories.items()]
    write(CACHE/'language-label-directories.json',results)
    print('Language labels',[(d['universityId'],len(d['matched'])) for d in results],flush=True)
    collect_program_pages(results,'language-label-courses')


if __name__=='__main__':main()
