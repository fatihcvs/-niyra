"""Collect reviewed Maltepe University programme course catalogues."""
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin

from discover_turkey_courses import normal
from parse_cyprus_courses import clean, fold
from parse_turkey_courses import course_code
from parse_turkey_maltepe_courses import parse_maltepe_direct, parse_maltepe_mubis
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-maltepe-universitesi"
BASE = "https://ects.maltepe.edu.tr"
YAPI_YALITIM_SOURCE = "https://aday.maltepe.edu.tr/meslek-yuksekokulu/"

UNITS = [
    ("bachelor", "Eğitim Fakültesi", "/tr/egitim-fakultesi"),
    ("bachelor", "Güzel Sanatlar Fakültesi", "/tr/guzel-sanatlar-fakultesi"),
    ("bachelor", "Hukuk Fakültesi", "/tr/hukuk-fakultesi"),
    ("bachelor", "İletişim Fakültesi", "/tr/i̇letisim-fakultesi-"),
    ("bachelor", "İnsan ve Toplum Bilimleri Fakültesi", "/tr/i̇nsan-ve-toplum-bilimleri-fakultesi"),
    ("bachelor", "İşletme ve Yönetim Bilimleri Fakültesi", "/tr/i̇sletme-ve-yonetim-bilimleri-fakultesi"),
    ("bachelor", "Mimarlık ve Tasarım Fakültesi", "/tr/mimarlik-ve-tasarim-fakultesi"),
    ("bachelor", "Mühendislik ve Doğa Bilimleri Fakültesi", "/tr/muhendislik-ve-doga-bilimleri-fakultesi"),
    ("bachelor", "Tıp Fakültesi", "/tr/tip-fakultesi"),
    ("associate", "Meslek Yüksekokulu", "/tr/meslek-yuksekokulu"),
    ("bachelor", "Hemşirelik Yüksekokulu", "/tr/hemsirelik"),
    ("bachelor", "Sağlık Bilimleri Yüksekokulu", "/tr/-saglik-bilimleri-yuksekokulu"),
]

# These labels are accepted only for the named registry programme in the same
# degree and academic unit. In particular, the older Hukuk Programı page is not
# interchangeable with the current Hukuk Bölümü page.
PROGRAMME_ALIASES = {
    "program-osym-204190404": "İngilizce Öğretmenliği Programı",
    "program-osym-204110402": "Hemşirelik",
    "program-osym-204111939": "Hukuk Bölümü",
    "program-osym-204111921": "Tıp (TR)",
    "program-osym-204110377": "TIP (İngilizce)",
}

EXPECTED_COUNTS = {
    "program-osym-204190889": 42,
    "program-osym-204190903": 52,
    "program-osym-204190917": 64,
    "program-osym-204190875": 49,
    "program-osym-204191078": 44,
    "program-osym-204110614": 45,
    "program-osym-204190406": 44,
    "program-osym-204190404": 44,
    "program-osym-204190411": 58,
    "program-osym-204190412": 59,
    "program-osym-204190413": 61,
    "program-osym-204190416": 62,
    "program-osym-204111012": 71,
    "program-osym-204111781": 72,
    "program-osym-204110111": 56,
    "program-osym-204111833": 44,
    "program-osym-204110402": 76,
    "program-osym-204112285": 73,
    "program-osym-204190370": 31,
    "program-osym-204190574": 41,
    "program-osym-204190588": 41,
    "program-osym-204190616": 33,
    "program-osym-204191057": 33,
    "program-osym-204150782": 40,
    "program-osym-204190651": 34,
    "program-osym-204190679": 29,
    "program-osym-204150825": 23,
    "program-osym-204190714": 34,
    "program-osym-204190700": 34,
    "program-osym-204150843": 31,
    "program-osym-204190602": 44,
    "program-osym-204151056": 30,
    "program-osym-204100234": 64,
    "program-osym-204190931": 71,
    "program-osym-204111578": 88,
    "program-osym-204110517": 85,
    "program-osym-204190410": 74,
    "program-osym-204111939": 90,
    "program-osym-204111118": 72,
    "program-osym-204112091": 93,
    "program-osym-204111048": 80,
    "program-osym-204112073": 75,
    "program-osym-204111921": 34,
    "program-osym-204110377": 34,
}
EXPECTED_TOTAL = 2354
EXPECTED_UNREADABLE = {
    "program-osym-204191095": "no-structured-course-catalog",
}


def _fetch_success(url):
    source = fetch(url, retry_failed=True)
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Maltepe official source is unavailable: {url} / {source}")
    return source


def programme_pages():
    pages = []
    items = []
    for degree, unit, path in UNITS:
        url = BASE + path
        source = _fetch_success(url)
        pages.append(source)
        document = soup(source)
        active = next((link for link in document.select(".accordion a[href]")
                       if urljoin(url, link["href"]) == url), None)
        if active is None:
            raise ValueError(f"Maltepe unit identity changed: {url}")
        if unit == "Hemşirelik Yüksekokulu":
            items.append({"title": "Hemşirelik", "sourceTitle": "Hemşirelik",
                          "degree": degree, "unit": unit, "programUrl": url,
                          "directoryUrl": url})
            continue
        children = active.parent.find("ul", recursive=False)
        if children is None:
            raise ValueError(f"Maltepe programme directory changed: {url}")
        for link in children.select("a[href]"):
            source_title = clean(link.get_text(" ", strip=True))
            items.append({"title": source_title, "sourceTitle": source_title,
                          "degree": degree, "unit": unit,
                          "programUrl": urljoin(url, link["href"]),
                          "directoryUrl": url})
    return pages, items


def match_programmes(items, university):
    units = {unit["id"]: normal(unit["name"]) for unit in university["units"]}
    mappings = []
    missing = []
    for programme in university["programs"]:
        unit = units[programme["unitId"]]
        candidates = [item for item in items
                      if item["degree"] == programme["degreeLevel"]
                      and normal(item["unit"]) == unit]
        alias = PROGRAMME_ALIASES.get(programme["id"])
        if alias:
            candidates = [item for item in candidates if fold(item["sourceTitle"]) == fold(alias)]
        else:
            candidates = [item for item in candidates
                          if normal(item["sourceTitle"]) == normal(programme["name"])]
        if len(candidates) == 1:
            mappings.append((programme, candidates[0]))
        elif programme["id"] in EXPECTED_UNREADABLE and not candidates:
            missing.append(programme)
        else:
            raise ValueError(f"Maltepe programme identity is not unique: {programme['name']} / {len(candidates)}")
    if {programme["id"] for programme in missing} != set(EXPECTED_UNREADABLE):
        raise ValueError(f"Maltepe unreadable set changed: {[item['id'] for item in missing]}")
    return mappings, missing


def collect_program(mapping):
    programme, item = mapping
    programme_source = _fetch_success(item["programUrl"])
    programme_document = soup(programme_source)
    course_urls = {urljoin(item["programUrl"], link["href"])
                   for link in programme_document.select("a[href]")
                   if normal(link.get_text(" ", strip=True)) == "dersler"}
    if len(course_urls) != 1:
        raise ValueError(f"Maltepe Dersler link is not unique: {programme['name']} / {len(course_urls)}")
    course_url = course_urls.pop()
    course_source = _fetch_success(course_url)
    course_document = soup(course_source)
    iframe_urls = {urljoin(course_url, frame["src"])
                   for frame in course_document.select(".editor-result iframe[src]")}
    if len(iframe_urls) == 1:
        data_url = iframe_urls.pop()
        source = _fetch_success(data_url)
        courses, conflicts = parse_maltepe_mubis(CACHE / source["file"], course_code)
        family = "maltepe-mubis-2026"
    elif not iframe_urls:
        source = course_source
        data_url = course_url
        courses, conflicts = parse_maltepe_direct(course_document, course_code)
        family = "maltepe-direct-2026"
    else:
        raise ValueError(f"Maltepe embedded course source is ambiguous: {programme['name']}")
    if conflicts:
        raise ValueError(f"Maltepe course-code conflicts changed: {programme['name']} / {conflicts}")
    if len(courses) != EXPECTED_COUNTS.get(programme["id"]):
        raise ValueError(f"Maltepe reviewed course count changed: {programme['name']} / {len(courses)}")
    reference = {
        "universityId": UID,
        "programId": programme["id"],
        "name": programme["name"],
        "title": programme["name"],
        "sourceTitle": item["sourceTitle"],
        "degree": programme["degreeLevel"],
        "unit": item["unit"],
        "directoryUrl": item["directoryUrl"],
        "identityEvidenceUrl": item["programUrl"],
    }
    return ({**source, "programs": [reference], "family": family,
             "publicUrl": course_url,
             "curriculumPeriod": "Resmî ECTS ders listesi",
             "selection": {
                 "method": "reviewed-programme-dersler-link",
                 "programUrl": item["programUrl"],
                 "courseUrl": course_url,
                 "dataUrl": data_url,
                 "sourceTitle": item["sourceTitle"],
             }}, len(courses))


def unreadable_source(programme):
    source = _fetch_success(YAPI_YALITIM_SOURCE)
    page_text = fold(soup(source).get_text(" ", strip=True))
    if "yapi yalitim teknolojisi" not in page_text or "yalitim malzemeleri" not in page_text:
        raise ValueError("Maltepe Yapı Yalıtım official programme evidence changed")
    reference = {
        "universityId": UID,
        "programId": programme["id"],
        "name": programme["name"],
        "title": programme["name"],
        "sourceTitle": "Yapı Yalıtım Teknolojisi Programı",
        "degree": programme["degreeLevel"],
        "unit": "Meslek Yüksekokulu",
        "directoryUrl": YAPI_YALITIM_SOURCE,
        "identityEvidenceUrl": YAPI_YALITIM_SOURCE,
    }
    return {**source, "programs": [reference], "family": "maltepe-mubis-2026",
            "publicUrl": YAPI_YALITIM_SOURCE,
            "curriculumPeriod": "2026-2027 program tanıtımı",
            "selectionError": EXPECTED_UNREADABLE[programme["id"]],
            "selection": {"method": "official-programme-page-without-coded-course-list",
                          "sourceTitle": reference["sourceTitle"]}}


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    if len(university["programs"]) != 45:
        raise ValueError(f"Maltepe target set changed: {len(university['programs'])}")
    pages, items = programme_pages()
    mappings, missing = match_programmes(items, university)
    with ThreadPoolExecutor(max_workers=4) as pool:
        collected = list(pool.map(collect_program, mappings))
    sources = [source for source, _count in collected]
    total_courses = sum(count for _source, count in collected)
    if len(sources) != 44 or total_courses != EXPECTED_TOTAL:
        raise ValueError(f"Maltepe reviewed set changed: {len(sources)} / {total_courses}")
    sources.extend(unreadable_source(programme) for programme in missing)
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "maltepe-reviewed-courses.json", sources)
    write(CACHE / "maltepe-reviewed-directories.json", [{
        "universityId": UID,
        "pages": pages,
        "matched": [source["programs"][0] for source in sources],
        "unmatched": [],
        "unreadable": [{"programId": programme["id"], "name": programme["name"],
                        "reason": EXPECTED_UNREADABLE[programme["id"]]}
                       for programme in missing],
    }])
    print("Maltepe University:", len(sources) - len(missing), "new programmes;",
          total_courses, "course records; unreadable:", len(missing), flush=True)


if __name__ == "__main__":
    main()
