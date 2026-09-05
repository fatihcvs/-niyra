"""Collect current Işık undergraduate curricula from its public programme pages."""
import re
from urllib.parse import urljoin
from turkey_research import CACHE, ROOT, fetch, read, soup, write
from discover_turkey_courses import match, normal
from parse_cyprus_courses import clean

UID = 'tr-isik-universitesi'
DIRECTORY = 'https://www.isikun.edu.tr/ogrenci/bolumler'
BASE = 'https://www.isikun.edu.tr/akademik/'

PROGRAMMES = [
    ('Bilgisayar Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/bilgisayar-muhendisligi/bilgisayar-muhendisligi-lisans/ders-programi', 'Bilgisayar Mühendisliği Lisans Programı - 2026'),
    ('Biyomedikal Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/elektrik-elektronik-muhendisligi/biyomedikal-muhendisligi-lisans/ders-programi', 'Biyomedikal Mühendisliği Lisans Programı - 2026'),
    ('Elektrik-Elektronik Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/elektrik-elektronik-muhendisligi/lisans/ders-programi', 'Elektrik-Elektronik Mühendisliği Lisans Programı - 2026'),
    ('Endüstri Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/endustri-muhendisligi/lisans-ingilizce/ders-programi', 'Endüstri Mühendisliği Lisans Programı - 2026'),
    ('Makine Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/makine-muhendisligi/lisans-ingilizce/ders-programi', 'Makine Mühendisliği Lisans Programı (İngilizce) - 2026'),
    ('Mekatronik Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/makine-muhendisligi/mekatronik-muhendisligi/ders-programi', 'Mekatronik Mühendisliği Lisans Programı - 2026'),
    ('Yazılım Mühendisliği (İngilizce)', 'Mühendislik ve Doğa Bilimleri Fakültesi', 'bachelor', 'mdbf/bilgisayar-muhendisligi/yazilim-muhendisligi-lisans/ders-programi', 'Yazılım Mühendisliği Lisans Programı - 2026'),
    ('Psikoloji', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/psikoloji/psikoloji-turkce/ders-programi', 'Psikoloji Türkçe Programı Güncel Müfredat (2026)'),
    ('Psikoloji (İngilizce)', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/psikoloji/psikoloji-ingilizce/ders-programi', 'Psychology İngilizce Programının Güncel Müfredatı (2026)'),
    ('Uluslararası Ticaret ve Finansman (İngilizce)', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/isletme/uluslararasi-ticaret-ve-finansman/ders-programi', 'Uluslararası Ticaret ve Finansman Lisans Programı (İngilizce) (2026)'),
    ('Uluslararası İlişkiler (İngilizce)', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/uluslararasi-iliskiler/lisans-turkce/ders-programi', 'Uluslararası İlişkiler Bölümü Lisans Programı Güncel Müfredat (2026)'),
    ('Yönetim Bilişim Sistemleri', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/enformasyon-teknolojileri/yonetim-bilisim-sistemleri-turkce/ders-programi', 'Yönetim Bilişim Sistemleri (2026)'),
    ('Yönetim Bilişim Sistemleri (İngilizce)', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/enformasyon-teknolojileri/yonetim-bilisim-sistemleri-ingilizce/ders-programi', 'Yönetim Bilişim Sistemleri (2026)'),
    ('İktisat (İngilizce)', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/ekonomi-iktisat/ekonomi-lisans/ders-programi', 'Lisans İktisat-Economics: Economics (2026)'),
    ('İşletme (İngilizce)', 'İktisadi, İdari ve Sosyal Bilimler Fakültesi', 'bachelor', 'iisbf/isletme/isletme-ingilizce/ders-programi', 'İşletme Bölümü Lisans Programı (İngilizce) (2026)'),
    ('Endüstriyel Tasarım', 'Sanat, Tasarım ve Mimarlık Fakültesi', 'bachelor', 'stmf/endustriyel-tasarim/ders-programi', 'D.ID.ENT-280'),
    ('Görsel İletişim Tasarımı', 'Sanat, Tasarım ve Mimarlık Fakültesi', 'bachelor', 'stmf/gorsel-iletisim-tasarimi/lisans/ders-programi', 'Görsel İletişim Tasarımı (Türkçe) Lisans Programı 2024 - Devam'),
    ('Mimarlık (İngilizce)', 'Sanat, Tasarım ve Mimarlık Fakültesi', 'bachelor', 'stmf/mimarlik/ders-programi', 'Mimarlık (İngilizce) Lisans Programı 2021-Devam'),
    ('Sinema ve Televizyon', 'Sanat, Tasarım ve Mimarlık Fakültesi', 'bachelor', 'stmf/sinema-ve-televizyon/lisans/ders-programi', '2024-2025 Müfredat'),
    ('İç Mimarlık ve Çevre Tasarımı', 'Sanat, Tasarım ve Mimarlık Fakültesi', 'bachelor', 'stmf/ic-mimarlik-ve-cevre-tasarimi/lisans-turkce/ders-programi', 'İç Mimarlık ve Çevre Tasarımı (Türkçe) Lisans Programı 2026- Devam (GÜNCEL), Ders Programı'),
    ('İç Mimarlık ve Çevre Tasarımı (İngilizce)', 'Sanat, Tasarım ve Mimarlık Fakültesi', 'bachelor', 'stmf/ic-mimarlik-ve-cevre-tasarimi/lisans-ingilizce/ders-programi', 'İç Mimarlık ve Çevre Tasarımı (İngilizce) Lisans Programı 2026- Devam (GÜNCEL)'),
    ('Ameliyathane Hizmetleri', 'Meslek Yüksekokulu', 'associate', 'myo/ameliyathane-hizmetleri/ders-programi', 'Ameliyathane Hizmetleri Programı'),
    ('Anestezi', 'Meslek Yüksekokulu', 'associate', 'myo/anestezi/ders-programi', 'Anestezi Programı'),
    ('Bilgisayar Programcılığı', 'Meslek Yüksekokulu', 'associate', 'myo/bilgisayar-programciligi/ders-programi', 'Bilgisayar Programcılığı Programı'),
    ('Bilişim Güvenliği Teknolojisi', 'Meslek Yüksekokulu', 'associate', 'myo/bilisim-guvenligi/ders-programi', 'Bilişim Güvenliği Teknolojileri Programı'),
    ('Dış Ticaret', 'Meslek Yüksekokulu', 'associate', 'myo/dis-ticaret/ders-programi', 'Dış Ticaret Programı'),
    ('Fizyoterapi', 'Meslek Yüksekokulu', 'associate', 'myo/fizyoterapi/ders-programi', 'Fizyoterapi Programı'),
    ('Grafik Tasarımı', 'Meslek Yüksekokulu', 'associate', 'myo/grafik-tasarimi/ders-programi', 'Grafik Tasarım Programı'),
    ('Optisyenlik', 'Meslek Yüksekokulu', 'associate', 'myo/optisyenlik/ders-programi', 'Optisyenlik Programı'),
    ('Tıbbi Görüntüleme Teknikleri', 'Meslek Yüksekokulu', 'associate', 'myo/tibbi-goruntuleme-teknikleri/ders-programi', 'Tıbbi Görüntüleme Teknikleri Programı'),
    ('Tıbbi Laboratuvar Teknikleri', 'Meslek Yüksekokulu', 'associate', 'myo/tibbi-laboratuvar-teknikleri/ders-programi', 'Tıbbi Laboratuvar Teknikleri Programı'),
    ('İlk ve Acil Yardım', 'Meslek Yüksekokulu', 'associate', 'myo/ilk-ve-acil-yardim/ders-programi', 'İlk ve Acil Yardım Programı'),
]

DIRECTORY_TITLES = {
    # The current university directory uses the field label while ÖSYM keeps
    # the diploma programme name.
    'Grafik Tasarımı': 'Grafik Tasarım',
}

PDF_PLANS = {
    'İç Mimarlık ve Çevre Tasarımı (İngilizce)': {
        'url': 'https://www.isikun.edu.tr/sites/default/files/2026-08/inar-yeni-mufredat-2026-2027-son.pdf',
        'period': '2026-2027',
    },
}


def curriculum_period(label):
    found = re.search(r'((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)?\d{2}))?', label)
    if not found:
        return None
    start, end = found.groups()
    if not end:
        return start
    if len(end) == 2:
        end = start[:2] + end
    return start + '-' + end


def main():
    university = read(ROOT / 'data/academic-catalog-2026.json')['universities'][UID]
    directory_source = fetch(DIRECTORY)
    directory_text = normal(soup(directory_source).get_text(' ', strip=True))
    matched, courses = [], []
    for title, unit, degree, path, label in PROGRAMMES:
        reference = {'title': title, 'unit': unit, 'degree': degree,
                     'courseUrl': BASE + path, 'directoryUrl': DIRECTORY}
        program = match(university, reference)
        if not program:
            raise ValueError('Işık programme identity does not match registry: ' + title)
        base_title = re.sub(r'\s*\(İngilizce\)$', '', title)
        directory_title = DIRECTORY_TITLES.get(title, title)
        if normal(directory_title) not in directory_text:
            raise ValueError('Işık current directory no longer lists: ' + title)
        page_source = fetch(reference['courseUrl'])
        document = soup(page_source)
        breadcrumb = clean(document.select_one('.breadcrumb').get_text(' ', strip=True)) if document.select_one('.breadcrumb') else ''
        if normal(base_title) not in normal(breadcrumb):
            raise ValueError('Işık programme breadcrumb mismatch: ' + title)
        labels = [clean(heading.get_text(' ', strip=True))
                  for heading in document.select('.accordion-item > .accordion-header')]
        if labels.count(label) != 1:
            raise ValueError('Işık selected curriculum is unavailable: ' + title)
        reference.update(universityId=UID, programId=program['id'], name=program['name'],
                         identityEvidenceUrl=DIRECTORY)
        selection = {'method': 'published-current-curriculum-section', 'label': label}
        pdf_plan = PDF_PLANS.get(title)
        if pdf_plan:
            heading = next(node for node in document.select('.accordion-item > .accordion-header')
                           if clean(node.get_text(' ', strip=True)) == label)
            scope = heading.find_parent(class_='accordion-item')
            links = [urljoin(reference['courseUrl'], anchor['href']) for anchor in scope.select('a[href]')]
            if links.count(pdf_plan['url']) != 1:
                raise ValueError('Işık selected PDF is unavailable: ' + title)
            source = {**fetch(pdf_plan['url']), 'publicUrl': reference['courseUrl']}
            period = pdf_plan['period']
            family = 'isik-pdf'
            selection['documentUrl'] = pdf_plan['url']
        else:
            source = page_source
            period = curriculum_period(label)
            family = 'isik'
        courses.append({**source, 'family': family, 'programs': [reference], 'selection': selection,
                        **({'curriculumPeriod': period} if period else {})})
        matched.append(reference)
    ids = [item['programId'] for item in matched]
    if len(ids) != len(set(ids)):
        raise ValueError('Işık programme routes are ambiguous')
    missing = [program for program in university['programs'] if program['id'] not in set(ids)]
    write(CACHE / 'isik-courses.json', courses)
    write(CACHE / 'isik-directories.json', [{'universityId': UID, 'source': directory_source,
                                             'matched': matched, 'unmatched': missing}])
    print('Işık:', len(matched), 'matched;', len(missing), 'without a coded curriculum', flush=True)
    print('Missing:', [program['name'] for program in missing], flush=True)


if __name__ == '__main__':
    main()
