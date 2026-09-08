"""Collect SANKO University's seven current undergraduate curricula."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import re
from urllib.parse import urljoin

from parse_cyprus_courses import clean, fold
from parse_turkey_courses import course_code, course_kind
from parse_turkey_sanko_courses import parse_sanko_html_bundle, parse_sanko_medicine_pdf
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-sanko-universitesi"
SBF_DIRECTORY = (
    "https://www.sanko.edu.tr/fakulteler/saglik-bilimleri-fakultesi/"
    "saglik-bilimleri-fakultesi-ogretim-programi-mufredat/"
)
SBF_PERIOD = "2025-2026 EĞİTİM-ÖĞRETİM YILI MÜFREDATI"
MYO_DIRECTORY = (
    "https://www.sanko.edu.tr/yuksekokul/saglik-hizmetleri-myo/"
    "saglik-hizmetleri-meslek-yuksek-okulu-ogretim-programimufredat/"
)
MYO_PERIOD = "2024-2025 EĞİTİM-ÖĞRETİM YILI MÜFREDATI"
MEDICINE_DIRECTORY = (
    "https://www.sanko.edu.tr/fakulteler/tip-fakultesi/ogretim-programi-mufredat/"
)
MEDICINE_PERIOD = "2026-2027 EĞİTİM-ÖĞRETİM YILI"

HTML_PROGRAMMES = {
    "program-osym-207710035": {
        "name": "Fizyoterapi ve Rehabilitasyon",
        "unit": "Sağlık Bilimleri Fakültesi",
        "degree": "bachelor",
        "label": "Fizyoterapi ve Rehabilitasyon Bölümü Öğretim Programı",
        "directory": SBF_DIRECTORY,
        "period": SBF_PERIOD,
        "classes": 4,
        "count": 92,
        "witnesses": {"FTR111", "FTR403", "FTR404"},
    },
    "program-osym-207710053": {
        "name": "Hemşirelik",
        "unit": "Sağlık Bilimleri Fakültesi",
        "degree": "bachelor",
        "label": "Hemşirelik Bölümü Öğretim Programı",
        "directory": SBF_DIRECTORY,
        "period": SBF_PERIOD,
        "classes": 4,
        "count": 90,
        "witnesses": {"HEM111", "HEM205", "HEM422"},
    },
    "program-osym-207710109": {
        "name": "Ameliyathane Hizmetleri",
        "unit": "Sağlık Hizmetleri Meslek Yüksekokulu",
        "degree": "associate",
        "label": "AMELİYATHANE HİZMETLERİ PROGRAMI",
        "directory": MYO_DIRECTORY,
        "period": MYO_PERIOD,
        "classes": 2,
        "count": 36,
        "witnesses": {"AME101", "AME202", "MYO212"},
    },
    "program-osym-207710100": {
        "name": "Anestezi",
        "unit": "Sağlık Hizmetleri Meslek Yüksekokulu",
        "degree": "associate",
        "label": "ANESTEZİ PROGRAMI",
        "directory": MYO_DIRECTORY,
        "period": MYO_PERIOD,
        "classes": 2,
        "count": 45,
        "witnesses": {"ANE101", "ANE203", "MYO212"},
    },
    "program-osym-207710106": {
        "name": "Tıbbi Görüntüleme Teknikleri",
        "unit": "Sağlık Hizmetleri Meslek Yüksekokulu",
        "degree": "associate",
        "label": "TIBBİ GÖRÜNTÜLEME TEKNİKLERİ PROGRAMI",
        "directory": MYO_DIRECTORY,
        "period": MYO_PERIOD,
        "classes": 2,
        "count": 44,
        "witnesses": {"TGT101", "TGT207", "MYO212"},
    },
    "program-osym-207710103": {
        "name": "İlk ve Acil Yardım",
        "unit": "Sağlık Hizmetleri Meslek Yüksekokulu",
        "degree": "associate",
        "label": "İLK VE ACİL YARDIM PROGRAMI",
        "directory": MYO_DIRECTORY,
        "period": MYO_PERIOD,
        "classes": 2,
        "count": 41,
        "witnesses": {"İAY103", "İAY203", "MYO212"},
    },
}
MEDICINE_ID = "program-osym-207710071"
MEDICINE_COUNT = 73
EXPECTED_TOTAL = sum(value["count"] for value in HTML_PROGRAMMES.values()) + MEDICINE_COUNT


def content(document):
    return document.select_one(".entry-content") or document


def exact_link(document, label, base_url):
    anchors = [anchor for anchor in content(document).select("a[href]")
               if fold(clean(anchor.get_text(" ", strip=True))) == fold(label)]
    if len(anchors) != 1:
        raise ValueError(f"SANKO reviewed link changed: {label} / {len(anchors)}")
    return urljoin(base_url, anchors[0]["href"])


def checked_page(url, identity):
    source = fetch(url, retry_failed=True)
    if source.get("status") != 200:
        raise ValueError(f"SANKO page is unavailable: {url}")
    document = soup(source)
    page_title = clean(document.title.get_text(" ", strip=True)) if document.title else ""
    headings = clean(" ".join(heading.get_text(" ", strip=True)
                              for heading in document.select("h1,h2,h3,h4,h5")))
    if fold(identity) not in fold(page_title + " " + headings):
        raise ValueError(f"SANKO page identity changed: {identity} / {page_title}")
    return source


def period_page(directory_url, period):
    directory = checked_page(directory_url, "Sanko Üniversitesi")
    url = exact_link(soup(directory), period, directory.get("finalUrl", directory_url))
    page = checked_page(url, period.split(" EĞİTİM", 1)[0])
    return directory, page


def class_pages(programme_source, count):
    matches = {}
    for anchor in content(soup(programme_source)).select("a[href]"):
        label = clean(anchor.get_text(" ", strip=True))
        match = re.fullmatch(r"([1-6])\.?\s*Sınıf\s+(?:Eğitim|Öğretim)\s+Programı", label, re.I)
        if match:
            class_number = int(match.group(1))
            matches.setdefault(class_number, []).append(urljoin(
                programme_source.get("finalUrl", programme_source["url"]), anchor["href"]
            ))
    if (set(matches) != set(range(1, count + 1))
            or any(len(urls) != 1 for urls in matches.values())):
        raise ValueError(f"SANKO class-page set changed: {programme_source['url']} / {matches}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(lambda item: checked_page(item[1][0], "Sınıf"), matches.items()))
    return sources


def reference(programme, programme_id, directory_url, programme_url):
    return {
        "universityId": UID,
        "programId": programme_id,
        "name": programme["name"],
        "title": programme["name"],
        "sourceTitle": programme["name"],
        "degree": programme["degree"],
        "unit": programme["unit"],
        "directoryUrl": directory_url,
        "identityEvidenceUrl": programme_url,
        "courseUrl": programme_url,
    }


def collect_html_programme(programme_id, programme, period_source):
    programme_url = exact_link(
        soup(period_source), programme["label"], period_source.get("finalUrl", period_source["url"])
    )
    programme_source = checked_page(programme_url, programme["name"])
    sources = class_pages(programme_source, programme["classes"])
    bundle = {"sources": sources}
    bundle_path = CACHE / ("sanko-" + programme_id.rsplit("-", 1)[-1] + "-bundle.json")
    write(bundle_path, bundle)
    courses, conflicts = parse_sanko_html_bundle(bundle, CACHE, course_code, course_kind)
    codes = {course["code"] for course in courses}
    if conflicts or len(courses) != programme["count"] or not programme["witnesses"] <= codes:
        raise ValueError(
            f"SANKO reviewed curriculum changed: {programme['name']} / "
            f"{len(courses)} / {conflicts} / {sorted(programme['witnesses'] - codes)}"
        )
    return {
        "url": programme_url,
        "finalUrl": programme_url,
        "fetchedAt": max(source["fetchedAt"] for source in sources),
        "file": bundle_path.name,
        "status": 200,
        "contentType": "application/json",
        "sha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
        "programs": [reference(programme, programme_id, programme["directory"], programme_url)],
        "family": "sanko-html-bundle-2026",
        "publicUrl": programme_url,
        "curriculumPeriod": programme["period"],
        "selection": {
            "method": "reviewed-current-class-page-union",
            "period": programme["period"],
            "periodPageUrl": period_source.get("finalUrl", period_source["url"]),
            "classPageUrls": [source.get("finalUrl", source["url"]) for source in sources],
        },
    }


def collect_medicine(programme):
    directory, period = period_page(MEDICINE_DIRECTORY, MEDICINE_PERIOD)
    expected_label = "2026-2027 Eğitim-Öğretim Yılı Öğretim Programı"
    anchors = [anchor for anchor in content(soup(period)).select("a[href]")
               if fold(clean(anchor.get_text(" ", strip=True))) == fold(expected_label)]
    if len(anchors) != 1:
        raise ValueError(f"SANKO medicine PDF link changed: {len(anchors)}")
    pdf_url = urljoin(period.get("finalUrl", period["url"]), anchors[0]["href"])
    pdf = fetch(pdf_url, retry_failed=True)
    if pdf.get("status") != 200 or "pdf" not in pdf.get("contentType", "").lower():
        raise ValueError("SANKO current medicine curriculum PDF is unavailable")
    courses, conflicts = parse_sanko_medicine_pdf(CACHE / pdf["file"], course_code, course_kind)
    codes = {course["code"] for course in courses}
    if conflicts or len(courses) != MEDICINE_COUNT or not {"TIP101", "TIP556", "TIP631", "SEC601"} <= codes:
        raise ValueError(f"SANKO reviewed medicine plan changed: {len(courses)} / {conflicts}")
    programme_data = {
        "name": programme["name"], "unit": "Tıp Fakültesi", "degree": programme["degreeLevel"]
    }
    pdf.update({
        "programs": [reference(
            programme_data, MEDICINE_ID, MEDICINE_DIRECTORY, period.get("finalUrl", period["url"])
        )],
        "family": "sanko-medicine-pdf-2026",
        "publicUrl": period.get("finalUrl", period["url"]),
        "curriculumPeriod": MEDICINE_PERIOD,
        "selection": {
            "method": "reviewed-current-senate-approved-medical-plan",
            "period": MEDICINE_PERIOD,
            "directoryUrl": MEDICINE_DIRECTORY,
            "directoryHash": directory["sha256"],
            "curriculumPdfUrl": pdf.get("finalUrl", pdf["url"]),
        },
    })
    return pdf


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    registry = {programme["id"]: programme for programme in university["programs"]}
    expected_ids = {*HTML_PROGRAMMES, MEDICINE_ID}
    if set(registry) != expected_ids or len(registry) != 7:
        raise ValueError("SANKO registry programme set changed")
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    for programme_id, expected in HTML_PROGRAMMES.items():
        actual = registry[programme_id]
        if (actual["name"], actual["degreeLevel"], units[actual["unitId"]]) != (
            expected["name"], expected["degree"], expected["unit"]
        ):
            raise ValueError(f"SANKO registry programme identity changed: {programme_id}")
    medicine = registry[MEDICINE_ID]
    if (medicine["name"], medicine["degreeLevel"], units[medicine["unitId"]]) != (
        "Tıp", "bachelor", "Tıp Fakültesi"
    ):
        raise ValueError("SANKO registry medicine identity changed")

    sbf_directory, sbf_period = period_page(SBF_DIRECTORY, SBF_PERIOD)
    myo_directory, myo_period = period_page(MYO_DIRECTORY, MYO_PERIOD)
    period_sources = {SBF_DIRECTORY: sbf_period, MYO_DIRECTORY: myo_period}
    sources = [
        collect_html_programme(programme_id, programme, period_sources[programme["directory"]])
        for programme_id, programme in HTML_PROGRAMMES.items()
    ]
    sources.append(collect_medicine(registry[MEDICINE_ID]))
    if sum(len(parse_sanko_html_bundle(read(CACHE / source["file"]), CACHE, course_code, course_kind)[0])
           for source in sources if source["family"] == "sanko-html-bundle-2026") + MEDICINE_COUNT != EXPECTED_TOTAL:
        raise ValueError("SANKO reviewed course total changed")
    sources.sort(key=lambda source: source["programs"][0]["programId"])
    write(CACHE / "sanko-reviewed-courses.json", sources)
    write(CACHE / "sanko-reviewed-programmes.json", [{
        "universityId": UID,
        "directories": [sbf_directory, myo_directory],
        "matched": [source["programs"][0] for source in sources],
        "unmatched": [],
        "courseCounts": {
            source["programs"][0]["programId"]: (
                MEDICINE_COUNT if source["family"] == "sanko-medicine-pdf-2026"
                else HTML_PROGRAMMES[source["programs"][0]["programId"]]["count"]
            ) for source in sources
        },
    }])
    print("SANKO University:", len(sources), "programmes;", EXPECTED_TOTAL, "course records", flush=True)
    for source in sources:
        programme_id = source["programs"][0]["programId"]
        count = MEDICINE_COUNT if programme_id == MEDICINE_ID else HTML_PROGRAMMES[programme_id]["count"]
        print(programme_id, count, flush=True)


if __name__ == "__main__":
    main()
