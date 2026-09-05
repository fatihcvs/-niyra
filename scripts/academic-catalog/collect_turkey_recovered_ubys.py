"""Collect current public UBYS entrances discovered outside the homepage crawl."""
from concurrent.futures import ThreadPoolExecutor
from turkey_research import CACHE,ROOT,read,write,fetch
from collect_turkey_ubys import discover

ROOTS={
    'tr-gaziantep-islam-bilim-ve-teknoloji-universitesi':'https://ubys.gibtu.edu.tr/ais/outcomebasedlearning/home/index?culture=tr-tr',
    'tr-ardahan-universitesi':'https://ubys.ardahan.edu.tr/AIS/OutcomeBasedLearning/Home/Index',
}


def main():
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities']
    directories=[discover(uid,url,universities[uid]) for uid,url in ROOTS.items()]
    write(CACHE/'recovered-ubys-directories.json',directories)
    def collect(p):
        return {**fetch(p['courseUrl'],p['payload']),'publicUrl':p['publicUrl'],'programs':[p],'family':'ubys','payload':p['payload']}
    with ThreadPoolExecutor(4) as pool:output=list(pool.map(collect,[p for d in directories for p in d['matched']]))
    write(CACHE/'recovered-ubys-courses.json',output)
    print('Collected',len(output),'public curricula',flush=True)


if __name__=='__main__':main()
