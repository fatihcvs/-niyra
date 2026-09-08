"""Collect Mimar Sinan Fine Arts University's published curricula."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from urllib.parse import unquote, urljoin

from parse_cyprus_courses import clean, fold
from parse_turkey_courses import course_code, course_kind
from parse_turkey_msgsu_courses import (
    parse_msgsu_digital_bundle,
    parse_msgsu_forms_bundle,
    parse_msgsu_forms_pdf,
    parse_msgsu_plan_pdf,
    parse_msgsu_sociology_pdf,
)
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-mimar-sinan-guzel-sanatlar-universitesi"
HOME_URL = "https://msgsu.edu.tr/"
PUBLISHED_FORMS = "Resmî bölüm sayfasında yayımlanan ders bilgi formları"


PROGRAMMES = {
    "program-osym-107590293": {
        "title": "Endüstriyel Tasarım", "slug": "endustriyel-tasarim",
        "department": "https://msgsu.edu.tr/akademik/mimarlik-fakultesi/bolumler/endustriyel-tasarim/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2026/02/Endustriyel-Tasarim-Bolumu-Ogretim-Plani.pdf"],
        "family": "msgsu-plan-pdf-2026", "period": "2025-2026", "count": 71,
        "witnesses": {"ETB113", "ETB499", "ETB461S"}, "terms": set(range(1, 9)),
    },
    "program-osym-107510092": {
        "title": "Mimarlık", "slug": "mimarlik",
        "department": "https://msgsu.edu.tr/akademik/mimarlik-fakultesi/bolumler/mimarlik/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2025/09/2025-2026_MIMARLIKBOLUMU_OGRETIMPLANI_WEB.pdf"],
        "family": "msgsu-plan-pdf-2026", "period": "2025-2026", "pageCount": 16,
        "count": 129, "witnesses": {"MIM121", "MIM4058S"}, "terms": set(range(1, 9)),
    },
    "program-osym-107510144": {
        "title": "İç Mimarlık", "slug": "ic-mimarlik",
        "department": "https://msgsu.edu.tr/akademik/mimarlik-fakultesi/bolumler/ic-mimarlik/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2025/09/IcMimarlikBolumu-Lisans-OgretimPlani.pdf"],
        "family": "msgsu-plan-pdf-2026", "period": "2025-2026", "pageCount": 14,
        "count": 68, "witnesses": {"ICM117", "STS201S"}, "terms": set(range(1, 9)),
    },
    "program-osym-107510108": {
        "title": "Şehir ve Bölge Planlama", "slug": "sehir-ve-bolge-planlama",
        "department": "https://msgsu.edu.tr/akademik/mimarlik-fakultesi/bolumler/sehir-ve-bolge-planlama/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2024/10/SBPB_2024-2025_ders_icerik.pdf"],
        "family": "msgsu-plan-pdf-2026", "period": "2024-2025", "pageCount": 13,
        "count": 104, "witnesses": {"PLN101", "PLN396S"}, "terms": set(range(1, 9)),
    },
    "program-osym-107510083": {
        "title": "Sinema ve Televizyon", "slug": "sinema-televizyon",
        "department": "https://msgsu.edu.tr/akademik/guzel-sanatlar-fakultesi/bolumler/sinema-televizyon/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2026/03/STV.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 17,
        "witnesses": {"STV105", "STV387S"},
    },
    "program-osym-107510011": {
        "title": "Arkeoloji", "slug": "arkeoloji",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/arkeoloji/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/arkeoloji.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 73,
        "witnesses": {"ARK101", "ARK458"},
    },
    "program-osym-107510117": {
        "title": "Felsefe", "slug": "felsefe",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/felsefe/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/fef_felsefe.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 41,
        "witnesses": {"FEL101", "FEL441"}, "conflicts": {"FEL-307"},
    },
    "program-osym-107510135": {
        "title": "Fizik", "slug": "fizik",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/fizik/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/fizik.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 50,
        "witnesses": {"FIZ101", "FIZ481"},
    },
    "program-osym-107510038": {
        "title": "Matematik", "slug": "matematik",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/matematik/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/matematik.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 47,
        "witnesses": {"MAT104", "MAT497"},
    },
    "program-osym-107510047": {
        "title": "Sanat Tarihi", "slug": "sanat-tarihi",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/sanat-tarihi/",
        "urls": [
            "https://msgsu.edu.tr/wp-content/uploads/2023/03/guz-donemi-son.pdf",
            "https://msgsu.edu.tr/wp-content/uploads/2023/03/bahar-donemi-son.pdf",
        ],
        "family": "msgsu-forms-bundle-2026", "period": PUBLISHED_FORMS, "count": 87,
        "witnesses": {"STA101", "STA458"}, "conflicts": {"STA203", "STA333"},
    },
    "program-osym-107510056": {
        "title": "Sosyoloji", "slug": "sosyoloji",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/sosyoloji/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2025/10/Sosyoloji-Bilgi-Paketi-2025-Son-hali.pdf"],
        "family": "msgsu-sociology-pdf-2026", "period": "2025-2026", "count": 73,
        "witnesses": {"SOS101", "SOS499", "SOS432"}, "terms": set(range(1, 9)),
    },
    "program-osym-107510065": {
        "title": "Tarih", "slug": "tarih",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/tarih/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/tarih_bolumu_ders_tanitim_formlari.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 89,
        "witnesses": {"TAR101", "TAR497"},
    },
    "program-osym-107510074": {
        "title": "Türk Dili ve Edebiyatı", "slug": "turk-dili-ve-edebiyati",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/turk-dili-ve-edebiyati-bolumu/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2026/08/TDE-Ogretim-Planinin-Bolumun-Internet-Sayfasina-Eklenmesi-Hak.pdf"],
        "family": "msgsu-plan-pdf-2026", "period": "2026-2027", "pageCount": 17,
        "count": 91, "witnesses": {"TDE111", "TDE474S"}, "terms": set(range(1, 9)),
    },
    "program-osym-107510029": {
        "title": "İstatistik", "slug": "istatistik",
        "department": "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/istatistik/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/istatistik.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 70,
        "witnesses": {"IST101", "ING042"},
    },
    "program-osym-107590295": {
        "title": "Kültür Varlıklarını Koruma ve Onarım", "slug": "kultur-varliklari",
        "department": "https://msgsu.edu.tr/akademik/kultur-varliklarini-koruma-ve-onarim-yuksekokulu-2/kultur-varliklarini-koruma-ve-onarim-bolum/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2024/02/Form4-Tumu2.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 66,
        "witnesses": {"KVK111", "KVK499"},
    },
    "program-osym-107550055": {
        "title": "Giyim Üretim Teknolojisi", "slug": "giyim-uretim-teknolojisi",
        "department": "https://msgsu.edu.tr/akademik/meslek-yuksekokulu/bolumler/giyim-uretim-teknolojisi-programi/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2023/10/Giyim-Uretim-Teknolojisi-Programi-guncel-ders-bilgi-formlari__0.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 39,
        "witnesses": {"INK001", "MYG204", "YBD022"}, "conflicts": {"MYG111"},
    },
    "program-osym-107550019": {
        "title": "Mimari Restorasyon", "slug": "mimari-restorasyon",
        "department": "https://msgsu.edu.tr/akademik/meslek-yuksekokulu/bolumler/mimari-restorasyon-programi/",
        "urls": ["https://msgsu.edu.tr/wp-content/uploads/2022/07/2._mimari_restorasyon_ders_icerikleri.pdf"],
        "family": "msgsu-forms-pdf-2026", "period": PUBLISHED_FORMS, "count": 46,
        "witnesses": {"ING021", "MYR245", "TUR002"}, "terms": set(range(1, 5)),
    },
    "program-osym-107590323": {
        "title": "Dijital Oyun Tasarımı", "slug": "dijital-oyun-tasarimi",
        "department": "https://msgsu.edu.tr/akademik/iletisim-fakultesi/bolumler/dijital-oyun-tasarimi/",
        "urls": [
            "https://msgsu.edu.tr/akademik/iletisim-fakultesi/bolumler/dijital-oyun-tasarimi/ogretim-plani/",
            "https://msgsu.edu.tr/akademik/iletisim-fakultesi/bolumler/dijital-oyun-tasarimi/ogretim-plani-2-sinif/",
            "https://msgsu.edu.tr/akademik/iletisim-fakultesi/bolumler/dijital-oyun-tasarimi/ogretim-plani-3-sinif/",
            "https://msgsu.edu.tr/akademik/iletisim-fakultesi/bolumler/dijital-oyun-tasarimi/ogretim-plani-4-sinif/",
            "https://msgsu.edu.tr/akademik/iletisim-fakultesi/bolumler/dijital-oyun-tasarimi/ogretim-plani-secmeli-dersler/",
        ],
        "family": "msgsu-digital-bundle-2026", "period": "2026-2027", "count": 95,
        "witnesses": {"DOT101", "DOT401", "DOT358S"}, "terms": set(range(1, 9)),
    },
}

PSYCHOLOGY_ID = "program-osym-107500101"
PSYCHOLOGY_URL = "https://msgsu.edu.tr/akademik/fen-edebiyat-fakultesi/bolumler/psikoloji-bolumu/"
EXPECTED_TOTAL = sum(item["count"] for item in PROGRAMMES.values())


def canonical_url(value):
    return unquote(value).rstrip("/").lower()


def page_links(source):
    base = source.get("finalUrl", source["url"])
    return {canonical_url(urljoin(base, anchor.get("href", "")))
            for anchor in soup(source).select("a[href]")}


def checked_page(url, identity):
    source = fetch(url, retry_failed=True)
    if source.get("status") != 200:
        raise ValueError(f"MSGSU page unavailable: {url}")
    text = clean(soup(source).get_text(" ", strip=True))
    if fold(identity) not in fold(text):
        raise ValueError(f"MSGSU page identity changed: {url} / {identity}")
    return source


def reference(programme, units, config):
    return {
        "universityId": UID,
        "programId": programme["id"],
        "name": programme["name"],
        "title": programme["name"],
        "sourceTitle": config["title"],
        "degree": programme["degreeLevel"],
        "unit": units[programme["unitId"]],
        "directoryUrl": config["department"],
        "identityEvidenceUrl": config["department"],
        "courseUrl": config["urls"][0],
    }


def bundle_source(config, sources, bundle_name, ref):
    bundle = {"sources": sources}
    bundle_path = CACHE / bundle_name
    write(bundle_path, bundle)
    return {
        "url": config["urls"][0],
        "finalUrl": sources[0].get("finalUrl", sources[0]["url"]),
        "fetchedAt": max(source["fetchedAt"] for source in sources),
        "file": bundle_path.name,
        "status": 200,
        "contentType": "application/json",
        "sha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
        "programs": [ref],
        "family": config["family"],
        "publicUrl": config["department"],
        "curriculumPeriod": config["period"],
        "selection": {
            "method": "reviewed-official-complementary-source-union",
            "sourceUrls": [source.get("finalUrl", source["url"]) for source in sources],
        },
    }


def parse_source(source, config):
    family = config["family"]
    if family == "msgsu-plan-pdf-2026":
        return parse_msgsu_plan_pdf(
            CACHE / source["file"], course_code, course_kind, config.get("pageCount")
        )
    if family == "msgsu-forms-pdf-2026":
        return parse_msgsu_forms_pdf(CACHE / source["file"], course_code, course_kind)
    if family == "msgsu-sociology-pdf-2026":
        return parse_msgsu_sociology_pdf(CACHE / source["file"], course_code)
    if family == "msgsu-forms-bundle-2026":
        return parse_msgsu_forms_bundle(read(CACHE / source["file"]), CACHE, course_code, course_kind)
    if family == "msgsu-digital-bundle-2026":
        return parse_msgsu_digital_bundle(read(CACHE / source["file"]), CACHE, course_code, course_kind)
    raise ValueError(f"Unknown MSGSU parser family: {family}")


def digital_sources(config):
    with ThreadPoolExecutor(max_workers=2) as pool:
        sources = list(pool.map(lambda url: checked_page(url, "Öğretim Planı"), config["urls"]))
    semesters = [[1, 2, None], [3, 3, 4, 4], [5, 5, 6, 6],
                 [7, 7, 8, 8], [None, None]]
    kinds = [["required", "required", None],
             ["required", "elective", "required", "elective"],
             ["required", "elective", "required", "elective"],
             ["required", "elective", "required", "elective"],
             ["elective", "elective"]]
    return [{**source, "tableSemesters": semesters[number], "tableKinds": kinds[number]}
            for number, source in enumerate(sources)]


def collect_programme(programme, units, config):
    department = checked_page(config["department"], config["title"])
    links = page_links(department)
    if canonical_url(config["urls"][0]) not in links:
        raise ValueError(f"MSGSU curriculum link changed: {programme['id']}")
    ref = reference(programme, units, config)
    if config["family"] == "msgsu-digital-bundle-2026":
        sources = digital_sources(config)
        if "2026-2027" not in clean(soup(sources[0]).get_text(" ", strip=True)):
            raise ValueError("MSGSU Digital Game Design curriculum period changed")
        source = bundle_source(config, sources, "msgsu-digital-bundle.json", ref)
    elif config["family"] == "msgsu-forms-bundle-2026":
        if not all(canonical_url(url) in links for url in config["urls"]):
            raise ValueError("MSGSU Art History source set changed")
        sources = [fetch(url, retry_failed=True) for url in config["urls"]]
        if any(item.get("status") != 200 or "pdf" not in item.get("contentType", "").lower()
               for item in sources):
            raise ValueError("MSGSU Art History form bundle unavailable")
        source = bundle_source(config, sources, "msgsu-art-history-bundle.json", ref)
    else:
        source = fetch(config["urls"][0], retry_failed=True)
        if source.get("status") != 200 or "pdf" not in source.get("contentType", "").lower():
            raise ValueError(f"MSGSU curriculum PDF unavailable: {programme['id']}")
        source.update({
            "programs": [ref], "family": config["family"],
            "publicUrl": config["department"], "curriculumPeriod": config["period"],
            "selection": {
                "method": "exact-official-department-linked-curriculum",
                "departmentHash": department["sha256"],
                "pageCount": config.get("pageCount"),
            },
        })
    courses, conflicts = parse_source(source, config)
    codes = {course["code"] for course in courses}
    published_terms = {course["semester"] for course in courses if course.get("semester")}
    if (len(courses) != config["count"]
            or set(conflicts) != config.get("conflicts", set())
            or not config["witnesses"] <= codes
            or (config.get("terms") and not config["terms"] <= published_terms)):
        raise ValueError(
            f"MSGSU reviewed curriculum changed: {programme['id']} / {len(courses)} / "
            f"{sorted(conflicts)} / {sorted(config['witnesses'] - codes)} / {sorted(published_terms)}"
        )
    return source, department, ref


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    registry = {programme["id"]: programme for programme in university["programs"]}
    expected_ids = {*PROGRAMMES, PSYCHOLOGY_ID}
    if set(registry) != expected_ids or len(registry) != 19:
        raise ValueError("MSGSU registry programme set changed")
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    for programme_id, config in PROGRAMMES.items():
        if registry[programme_id]["name"] != config["title"]:
            raise ValueError(f"MSGSU registry programme identity changed: {programme_id}")

    home = checked_page(HOME_URL, "Mimar Sinan Güzel Sanatlar Üniversitesi")
    psychology = checked_page(PSYCHOLOGY_URL, "Psikoloji")
    curriculum_labels = [anchor.get_text(" ", strip=True) for anchor in soup(psychology).select("a[href]")
                         if any(marker in fold(anchor.get_text(" ", strip=True))
                                for marker in ("ogretim plani", "ders bilgi", "mufredat", "course catalog"))]
    if curriculum_labels:
        raise ValueError(f"MSGSU Psychology now publishes a curriculum: {curriculum_labels}")

    sources = []
    departments = []
    matched = []
    for programme_id in sorted(PROGRAMMES):
        source, department, ref = collect_programme(
            registry[programme_id], units, PROGRAMMES[programme_id]
        )
        sources.append(source)
        departments.append(department)
        matched.append(ref)
        print(programme_id, PROGRAMMES[programme_id]["count"], flush=True)
    if sum(PROGRAMMES[item]["count"] for item in PROGRAMMES) != EXPECTED_TOTAL:
        raise ValueError("MSGSU reviewed course total changed")
    sources.sort(key=lambda source: source["programs"][0]["programId"])
    write(CACHE / "msgsu-reviewed-courses.json", sources)
    write(CACHE / "msgsu-reviewed-programmes.json", [{
        "universityId": UID,
        "homeSource": home,
        "departments": departments,
        "matched": matched,
        "unmatched": [{
            "programId": PSYCHOLOGY_ID,
            "title": registry[PSYCHOLOGY_ID]["name"],
            "directoryUrl": PSYCHOLOGY_URL,
            "reason": "official-department-page-has-no-published-curriculum",
            "evidenceHash": psychology["sha256"],
        }],
        "courseCounts": {programme_id: config["count"]
                         for programme_id, config in PROGRAMMES.items()},
    }])
    print("Mimar Sinan Fine Arts University:", len(sources),
          "programmes;", EXPECTED_TOTAL, "course records; 1 explicit unmatched", flush=True)


if __name__ == "__main__":
    main()
