"""Follow the Turkish-language switch published by an English-default catalogue."""
from turkey_research import CACHE, ROOT, read, write, collect_program_pages
from discover_turkey_courses import discover_university


def main():
    universities=read(ROOT/'data/academic-catalog-2026.json')['universities']
    uid='tr-istinye-universitesi'
    home={'programs':[{'universityId':uid}], 'catalogLinks':[
        ('https://ects.istinye.edu.tr/bilgipaketi/eobsakts/index/ln/tr','Ders kataloğu')]}
    directory=discover_university(home,universities[uid])
    write(CACHE/'language-directories.json',[directory])
    collect_program_pages([directory],'language-courses')


if __name__=='__main__':main()
