"""Collect Ahmet Yesevi University's published programme study plans."""
from urllib.parse import unquote, urljoin

from parse_turkey_courses import _parse_source
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-ahmet-yesevi-universitesi"
HOME_URL = "https://ayu.edu.kz/"
TURTEP_ROOT = "https://www.turtep.edu.tr/"


PROGRAMMES = {
    "program-osym-403910273": {
        "key": "tde", "code": "6B02333", "sourceTitle": "Şetel filologiyası (Türk tili)",
        "page": "https://ayu.edu.kz/birimler/kz/54-turk-filolojisi-bolumu/programlar/6B02333",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/BB_6B02333_2025.pdf",
        "label": "ББ 6В02333-Шетел филологиясы (түрік тілі)", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 55, "witnesses": {"HOK1171", "TTMT4305"},
    },
    "program-osym-403990046": {
        "key": "turkology", "code": "6B02267", "sourceTitle": "Türkoloji",
        "page": "https://ayu.edu.kz/birimler/kz/54-turk-filolojisi-bolumu/programlar/6B02267",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/BB_6B02267_2025.pdf",
        "label": "ББ 2025 жыл-6В02267-Түркітану", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 51, "witnesses": {"HK1101", "PGPT4302"},
        "registryAlias": "Çağdaş Türk Lehçeleri ve Edebiyatları",
    },
    "program-osym-403910255": {
        "key": "eng", "code": "6B02332", "sourceTitle": "Şetel filologiyası (İngiliz tili)",
        "page": "https://ayu.edu.kz/birimler/kz/54-ingiliz-filolojisi-ve-ceviri-isleri-bolumu/programlar/6B02332",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/6B02332%20-%20%D0%A8%D0%B5%D1%82%D0%B5%D0%BB%20%D1%84%D0%B8%D0%BB%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D1%8F%D1%81%D1%8B%20(%D0%B0%D2%93%D1%8B%D0%BB%D1%88%D1%8B%D0%BD%20%D1%82%D1%96%D0%BB%D1%96)%202025.pdf",
        "label": "1 курс ББ - 6В02332 Шетел философиясы", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 48, "witnesses": {"HK1171", "DA4314"},
    },
    "program-osym-403990081": {
        "key": "computer", "code": "6B06182", "sourceTitle": "Bilgisayar Mühendisliği",
        "page": "https://ayu.edu.kz/birimler/kz/231-bilgisayar-muhendisligi-bolumu/programlar/6B06182",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/2025-2026_6%D0%9206182-%D0%9A%D0%BE%D0%BC%D0%BF%D1%8C%D1%8E%D1%82%D0%B5%D1%80%D0%BB%D1%96%D0%BA%20%D0%B8%D0%BD%D0%B6%D0%B5%D0%BD%D0%B5%D1%80%D0%B8%D1%8F.docx",
        "label": "Білім беру бағдарламасы 2025-2026", "period": "2025-2026",
        "family": "ayu-docx-2026", "count": 47, "witnesses": {"HOK1133", "AOTICS4351"},
    },
    "program-osym-403990088": {
        "key": "electric", "code": "6B07153", "sourceTitle": "Elektrik Enerjisi Mühendisliği",
        "page": "https://ayu.edu.kz/birimler/kz/243-elektrik-enerjisi-muhendisligi/programlar/6B07153",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/%D0%91%D0%91%D0%91%202025-2026-6%D0%9207153-%D0%AD%D0%BB%D0%B5%D0%BA%D1%82%D1%80%20%D1%8D%D0%BD%D0%B5%D1%80%D0%B3%D0%B5%D1%82%D0%B8%D0%BA%D0%B0%D1%81%D1%8B.pdf",
        "label": "БББ 2025-2026-6В07153 - Электр энергетикасы", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 56, "witnesses": {"HK1101", "DLT4256"},
        "registryAlias": "Elektrik-Elektronik Mühendisliği",
    },
    "program-osym-403990102": {
        "key": "machine", "code": "6B07189", "sourceTitle": "Makine Mühendisliği",
        "page": "https://ayu.edu.kz/birimler/kz/243-makine-muhendisligi/programlar/6B07189",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/%D0%91%D0%91%D0%91%202025-2026-6%D0%9207189%20-%20%D0%9C%D0%B0%D1%88%D0%B8%D0%BD%D0%B0%20%D0%B6%D0%B0%D1%81%D0%B0%D1%83.pdf",
        "label": "БББ 2025-2026 6В07189 - Машина жасау", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 59, "witnesses": {"HK1100", "UMD4309"},
    },
    "program-osym-403990109": {
        "key": "ai", "code": "6B06198", "sourceTitle": "Yapay Zeka ve Veri Analizi",
        "page": "https://ayu.edu.kz/birimler/kz/231-bilgisayar-muhendisligi-bolumu/programlar/6B06198",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/2025-2026_6%D0%9206198%20-%20%D0%96%D0%B0%D1%81%D0%B0%D0%BD%D0%B4%D1%8B%20%D0%B8%D0%BD%D1%82%D0%B5%D0%BB%D0%BB%D0%B5%D0%BA%D1%82%20%D0%B6%D3%99%D0%BD%D0%B5%20%D0%B4%D0%B5%D1%80%D0%B5%D0%BA%D1%82%D0%B5%D1%80%D0%B4%D1%96%20%D1%82%D0%B0%D0%BB%D0%B4%D0%B0%D1%83(2).docx",
        "label": "Білім беру бағдарламасы 2025-2026", "period": "2025-2026",
        "family": "ayu-docx-2026", "count": 43, "witnesses": {"IKT1103", "OZRT4335"},
    },
    "program-osym-403910158": {
        "key": "ybs", "code": "TÜRTEP-5", "sourceTitle": "Yönetim Bilişim Sistemleri Lisans",
        "page": "https://www.turtep.edu.tr/index.php?bolum=5&sayfa=akademik_programlar_detay",
        "url": "https://www.turtep.edu.tr/index.php?bolum=5&sayfa=akademik_programlar_detay",
        "label": "Yönetim Bilişim Sistemleri Lisans", "period": "Yayımlanmış güncel TÜRTEP müfredatı",
        "family": "ayu-turtep-2026", "count": 49, "witnesses": {"TİŞL-101", "TYBS-408"},
        "expectedSemesters": 8,
    },
    "program-osym-403990039": {
        "key": "journalism", "code": "6B03239", "sourceTitle": "Gazetecilik",
        "page": "https://ayu.edu.kz/birimler/kz/152-gazetecilik-bolumu/programlar/6B03239",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/BB_6V03239_zhurnalistika.pdf",
        "label": "BB 6B03239 Jurnalistika", "period": "2023-2024",
        "family": "ayu-pdf-2026", "count": 56, "witnesses": {"HK1101", "RYM43103"},
        "unlinkedOfficialAsset": True,
    },
    "program-osym-403990025": {
        "key": "dentistry", "code": "6B10189", "sourceTitle": "Diş Hekimliği",
        "page": "https://ayu.edu.kz/birimler/kz/476-dis-hekimligi/programlar/6B10189",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/%D0%91%D0%91-2025%2C%206%D0%9210189%20%D0%A1%D1%82%D0%BE%D0%BC%D0%B0%D1%82%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D1%8F.pdf",
        "label": "ББ-2025, 6В10189 Стоматология", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 76, "witnesses": {"HK1101", "INT6501"},
        "expectedSemesters": 12,
    },
    "program-osym-403990032": {
        "key": "theology", "code": "6B02229", "sourceTitle": "İlahiyat",
        "page": "https://ayu.edu.kz/birimler/kz/144-ilahiyat/programlar/6B02229",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/260%20%D0%A2%D0%B5%D0%BE%D0%BB%D0%BE%D0%B3%D0%B8%D1%8F%20%D0%91%D0%91%202025%20%D0%B1%D0%B5%D0%BA%D1%96%D1%82%D1%96%D0%BB%D0%B3%D0%B5%D0%BD.docx",
        "label": "ББ 6В02229 Теология 2025-2026 ж.", "period": "2025-2026",
        "family": "ayu-docx-2026", "count": 65, "witnesses": {"HK1121", "TIL4307"},
    },
    "program-osym-403990095": {
        "key": "public", "code": "6B04141", "sourceTitle": "Kamu ve Yerel Yönetim",
        "page": "https://ayu.edu.kz/birimler/kz/91-isletme-ve-turizm-bolumu/programlar/6B04141",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/6%D0%9204141-%D0%93%D0%9C%D0%A3%20%D0%91%D0%91%202025-26.pdf",
        "label": "6В04141-ГМУ ББ 2025", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 57, "witnesses": {"HOK1171", "IMP43100"},
        "registryAlias": "Kamu Yönetimi",
    },
    "program-osym-403990074": {
        "key": "tourism", "code": "6B11157", "sourceTitle": "Turizm",
        "page": "https://ayu.edu.kz/birimler/kz/91-isletme-ve-turizm-bolumu/programlar/6B11157",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/6%D0%9211157-%D0%A2%D1%83%D1%80%D0%B8%D0%B7%D0%BC%20%D0%91%D0%91%202025-26.pdf",
        "label": "6В11157-Туризм ББ 2025", "period": "2025-2026",
        "family": "ayu-pdf-2026", "count": 56, "witnesses": {"HK1171", "TOBAPIT3398"},
        "registryAlias": "Turizm İşletmeciliği",
    },
    "program-osym-403910052": {
        "key": "ir", "code": "6B03138", "sourceTitle": "Uluslararası İlişkiler",
        "page": "https://ayu.edu.kz/birimler/kz/125-uluslararasi-iliskiler/programlar/6B03138",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/6%D0%9203138-%D0%A5%D0%B0%D0%BB%D1%8B%D2%9B%D0%B0%D1%80%D0%B0%D0%BB%D1%8B%D2%9B%20%D2%9B%D0%B0%D1%82%D1%8B%D0%BD%D0%B0%D1%81%D1%82%D0%B0%D1%80%20%D0%B1%D1%96%D0%BB%D1%96%D0%BC%20%D0%B1%D0%B5%D1%80%D1%83%20%D0%B1%D0%B0%D2%93%D0%B4%D0%B0%D1%80%D0%BB%D0%B0%D0%BC%D0%B0%D1%81%D1%8B%202025-2029.pdf",
        "label": "6B03138-Халықаралық қатынастар 2025-2029", "period": "2025-2029",
        "family": "ayu-pdf-2026", "count": 41, "witnesses": {"HOK1101", "DPAE4343"},
    },
    "program-osym-403910264": {
        "key": "russian", "code": "6B01717", "sourceTitle": "Rus Dili ve Edebiyatı Öğretmenliği",
        "page": "https://ayu.edu.kz/birimler/kz/54-rus-dili-ve-edebiyati-bolumu/programlar/6B01717",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/BBB_6B01717_Orys_t%C4%B1l%C4%B1_men_adebiet%C4%B1.pdf",
        "label": "БББ 6В01717 - Орыс тілі мен әдебиеті", "period": "Yayımlanmış güncel eğitim programı",
        "family": "ayu-pdf-2026", "count": 52, "witnesses": {"HK1171", "MRL4314"},
    },
    "program-osym-403990060": {
        "key": "history", "code": "6B01615", "sourceTitle": "Tarih Öğretmenliği",
        "page": "https://ayu.edu.kz/birimler/kz/152-tarih-bolumu/programlar/6B01615",
        "url": "https://ayu.edu.kz/admin/ckeditor_files/files/6V01615_TarihBBB-2023-2024.pdf",
        "label": "6В01615-Тарих-БББ-2023-2024", "period": "2023-2024",
        "family": "ayu-pdf-2026", "count": 44, "witnesses": {"IK1171", "HOTN4311"},
    },
    "program-osym-403950015": {
        "key": "computer-programming", "code": "TÜRTEP-1", "sourceTitle": "Bilgisayar Programcılığı Ön Lisans",
        "page": "https://www.turtep.edu.tr/index.php?bolum=1&sayfa=akademik_programlar_detay",
        "url": "https://www.turtep.edu.tr/index.php?bolum=1&sayfa=akademik_programlar_detay",
        "label": "Bilgisayar Programcılığı Ön Lisans", "period": "Yayımlanmış güncel TÜRTEP müfredatı",
        "family": "ayu-turtep-2026", "count": 28, "witnesses": {"TBPÖ-101", "TBPÖ-208"},
        "expectedSemesters": 4,
    },
}

EXPECTED_TOTAL = sum(item["count"] for item in PROGRAMMES.values())


def canonical_url(value):
    return unquote(value).rstrip("/").lower()


def published_terms(courses):
    result = set()
    for course in courses:
        if course.get("semester"):
            result.add(course["semester"])
        result.update(course.get("offeredSemesters", []))
    return result


def page_links(source):
    base = source.get("finalUrl", source["url"])
    return {canonical_url(urljoin(base, anchor.get("href", "")))
            for anchor in soup(source).select("a[href]")}


def pdf_contains_program_code(source, code):
    import pdfplumber
    latin = code.lower()
    cyrillic = code.replace("B", "В").lower()
    with pdfplumber.open(CACHE / source["file"]) as document:
        for page in document.pages:
            text = (page.extract_text() or "").lower()
            if latin in text or cyrillic in text:
                return True
    return False


def programme_reference(programme, units, config):
    reference = {
        "universityId": UID,
        "programId": programme["id"],
        "title": programme["name"],
        "unit": units[programme["unitId"]],
        "degree": programme["degreeLevel"],
        "directoryUrl": config["page"],
        "identityEvidenceUrl": config["page"],
        "sourceTitle": config["sourceTitle"],
        "officialProgrammeCode": config["code"],
    }
    if config.get("registryAlias"):
        reference["registryAlias"] = config["registryAlias"]
    return reference


def collect_programme(programme, units, config):
    page_source = fetch(config["page"], retry_failed=True)
    if page_source.get("status") != 200:
        raise ValueError(f"AYU programme page unavailable: {programme['id']}")

    reference = programme_reference(programme, units, config)
    source = {
        **fetch(config["url"], retry_failed=True),
        "publicUrl": config["page"],
        "programs": [reference],
        "family": config["family"],
        "curriculumPeriod": config["period"],
        "expectedSemesters": config.get("expectedSemesters", 8),
        "selection": {
            "method": ("exact-program-code-in-official-plan-and-program-page"
                       if config.get("unlinkedOfficialAsset")
                       else "exact-current-plan-linked-from-official-programme-page"),
            "programmePage": config["page"],
            "programmePageHash": page_source["sha256"],
            "officialProgrammeCode": config["code"],
            "sourceTitle": config["sourceTitle"],
            "publishedLabel": config["label"],
            "registryTitle": programme["name"],
            "registryUnit": units[programme["unitId"]],
        },
    }
    if source.get("status") != 200:
        raise ValueError(f"AYU study plan unavailable: {programme['id']}")

    if config["family"] == "ayu-turtep-2026":
        page_text = " ".join(soup(source).get_text(" ", strip=True).split())
        expected_title = config["label"]
        expected_duration = f"Normal eğitim süresi {config['expectedSemesters']} dönemdir."
        if expected_title not in page_text or expected_duration not in page_text:
            raise ValueError(f"AYU TÜRTEP programme identity changed: {programme['id']}")
    elif config.get("unlinkedOfficialAsset"):
        if not pdf_contains_program_code(source, config["code"]):
            raise ValueError(f"AYU official plan identity changed: {programme['id']}")
    elif canonical_url(config["url"]) not in page_links(page_source):
        raise ValueError(f"AYU selected study plan link changed: {programme['id']}")

    courses, conflicts = _parse_source(source)
    codes = {course["code"] for course in courses}
    expected_terms = set(range(1, config.get("expectedSemesters", 8) + 1))
    if (len(courses) != config["count"] or conflicts
            or not config["witnesses"] <= codes
            or published_terms(courses) != expected_terms):
        raise ValueError(
            f"AYU reviewed curriculum changed: {programme['id']} / "
            f"{len(courses)} / {sorted(conflicts)} / {sorted(published_terms(courses))}"
        )
    return source, page_source, reference


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    registry = {programme["id"]: programme for programme in university["programs"]}
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    if set(registry) != set(PROGRAMMES) or len(registry) != 17:
        raise ValueError("AYU registry programme set changed")

    home_source = fetch(HOME_URL, retry_failed=True)
    turtep_source = fetch(TURTEP_ROOT, retry_failed=True)
    if home_source.get("status") != 200 or turtep_source.get("status") != 200:
        raise ValueError("AYU public programme entrances are unavailable")

    sources = []
    matched = []
    programme_pages = []
    for programme_id in sorted(PROGRAMMES):
        source, page_source, reference = collect_programme(
            registry[programme_id], units, PROGRAMMES[programme_id]
        )
        sources.append(source)
        matched.append(reference)
        programme_pages.append(page_source)

    if sum(PROGRAMMES[item]["count"] for item in PROGRAMMES) != EXPECTED_TOTAL:
        raise ValueError("AYU reviewed course total changed")
    write(CACHE / "ayu-reviewed-courses.json", sources)
    write(CACHE / "ayu-reviewed-programmes.json", [{
        "universityId": UID,
        "homeSource": home_source,
        "turtepSource": turtep_source,
        "pages": programme_pages,
        "matched": matched,
        "unmatched": [],
        "courseCounts": {programme_id: config["count"]
                         for programme_id, config in PROGRAMMES.items()},
    }])
    print("Ahmet Yesevi University:", len(sources), "programmes;",
          EXPECTED_TOTAL, "unambiguous course records", flush=True)
    for source in sources:
        programme_id = source["programs"][0]["programId"]
        print(programme_id, PROGRAMMES[programme_id]["count"], flush=True)


if __name__ == "__main__":
    main()
