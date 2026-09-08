"""Collect Sabanci's programme matrices for its three admission groups."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
from urllib.parse import parse_qs, urljoin, urlparse

from parse_cyprus_courses import clean
from parse_turkey_courses import course_code
from parse_turkey_sabanci_courses import parse_sabanci_bundle, parse_sabanci_matrix
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-sabanci-universitesi"
DIRECTORY = "https://ects.sabanciuniv.edu/tr/akademik-programlar/lisans-programlari"
PROGRAMMES = {
    "Bilgisayar Bilimi ve Mühendisliği": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSCS", 68),
    "Veri Bilimi ve Analitiği": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSDSA", 65),
    "Elektronik Mühendisliği": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSEE", 65),
    "Endüstri Mühendisliği": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSMS", 70),
    "Malzeme Bilimi ve Nano Mühendislik": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSMAT", 78),
    "Mekatronik Mühendisliği": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSME", 75),
    "Moleküler Biyoloji, Genetik ve Biyomühendislik": ("Mühendislik ve Doğa Bilimleri Fakültesi", "BSBIO", 74),
    "Ekonomi": ("Sanat ve Sosyal Bilimler Fakültesi", "BAECON", 42),
    "Görsel Sanatlar ve Görsel İletişim Tasarımı": ("Sanat ve Sosyal Bilimler Fakültesi", "BAVACD", 44),
    "Psikoloji": ("Sanat ve Sosyal Bilimler Fakültesi", "BAPSY", 46),
    "Siyaset Bilimi ve Uluslararası İlişkiler": ("Sanat ve Sosyal Bilimler Fakültesi", "BAPSIR", 49),
    "Yönetim Bilimleri": ("Yönetim Bilimleri Fakültesi", "BAMAN", 42),
}
GROUPS = {
    "Mühendislik ve Doğa Bilimleri Fakültesi": ("program-osym-205110092", 229),
    "Sanat ve Sosyal Bilimler Fakültesi": ("program-osym-205110056", 111),
    "Yönetim Bilimleri Fakültesi": ("program-osym-205110135", 42),
}
EXPECTED_TOTAL = 382


def directory_links(document, base_url):
    output = {}
    for title, (expected_unit, _matrix_code, _expected_count) in PROGRAMMES.items():
        anchors = [anchor for anchor in document.select("a[href]")
                   if clean(anchor.get_text(" ", strip=True)) == title]
        if len(anchors) != 1:
            raise ValueError(f"Sabanci undergraduate programme link changed: {title} / {len(anchors)}")
        unit = anchors[0].find_previous("h3")
        actual_unit = clean(unit.get_text(" ", strip=True)) if unit else ""
        if actual_unit != expected_unit:
            raise ValueError(f"Sabanci programme faculty changed: {title} / {actual_unit}")
        output[title] = urljoin(base_url, anchors[0]["href"])
    return output


def collect_matrix(item):
    title, programme_url = item
    unit, expected_code, expected_count = PROGRAMMES[title]
    programme_source = fetch(programme_url, retry_failed=True)
    if programme_source.get("status") != 200:
        raise ValueError(f"Sabanci programme page is unavailable: {title}")
    page_title = clean(soup(programme_source).title.get_text(" ", strip=True))
    if title not in page_title:
        raise ValueError(f"Sabanci programme identity changed: {title} / {page_title}")
    matrix_links = [urljoin(programme_url, anchor["href"])
                    for anchor in soup(programme_source).select("a[href]")
                    if "undergraduate-course-program-outcomes" in anchor.get("href", "")]
    if len(matrix_links) != 1:
        raise ValueError(f"Sabanci programme matrix link changed: {title} / {len(matrix_links)}")
    matrix_url = matrix_links[0]
    matrix_code = parse_qs(urlparse(matrix_url).query).get("program", [""])[0]
    if matrix_code != expected_code:
        raise ValueError(f"Sabanci matrix identity changed: {title} / {matrix_code}")
    matrix_source = fetch(matrix_url, retry_failed=True)
    if matrix_source.get("status") != 200:
        raise ValueError(f"Sabanci matrix is unavailable: {title}")
    courses, conflicts = parse_sabanci_matrix(soup(matrix_source), course_code)
    if conflicts or len(courses) != expected_count:
        raise ValueError(f"Sabanci reviewed matrix changed: {title} / {len(courses)} / {conflicts}")
    return {**matrix_source, "programmeTitle": title, "programmeUrl": programme_url,
            "programmeSourceHash": programme_source["sha256"], "faculty": unit,
            "matrixCode": matrix_code}, courses


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    programmes = {programme["id"]: programme for programme in university["programs"]}
    if set(programmes) != {value[0] for value in GROUPS.values()} or len(programmes) != 3:
        raise ValueError("Sabanci admission programme groups changed")
    directory_source = fetch(DIRECTORY, retry_failed=True)
    if directory_source.get("status") != 200:
        raise ValueError("Sabanci undergraduate ECTS directory is unavailable")
    links = directory_links(soup(directory_source), directory_source.get("finalUrl", DIRECTORY))
    with ThreadPoolExecutor(max_workers=4) as pool:
        matrices = list(pool.map(collect_matrix, links.items()))
    grouped = {}
    for unit, (program_id, expected_count) in GROUPS.items():
        selected = [source for source, _courses in matrices if source["faculty"] == unit]
        bundle = {"sources": selected}
        bundle_path = CACHE / ("sabanci-" + program_id.rsplit("-", 1)[-1] + "-bundle.json")
        write(bundle_path, bundle)
        courses, conflicts = parse_sabanci_bundle(bundle, CACHE, course_code)
        if conflicts or len(courses) != expected_count:
            raise ValueError(f"Sabanci faculty course union changed: {unit} / {len(courses)} / {conflicts}")
        programme = programmes[program_id]
        reference = {"universityId": UID, "programId": program_id, "name": programme["name"],
                     "title": programme["name"], "sourceTitle": unit,
                     "degree": programme["degreeLevel"], "unit": unit,
                     "directoryUrl": DIRECTORY, "identityEvidenceUrl": DIRECTORY,
                     "courseUrl": DIRECTORY}
        grouped[unit] = {
            "url": DIRECTORY, "finalUrl": DIRECTORY,
            "fetchedAt": max(source["fetchedAt"] for source in selected),
            "file": bundle_path.name, "status": 200, "contentType": "application/json",
            "sha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
            "programs": [reference], "family": "sabanci-faculty-bundle-2026",
            "publicUrl": DIRECTORY,
            "curriculumPeriod": "Güncel resmî lisans ders-yeterlilik matrisleri",
            "selection": {"method": "reviewed-faculty-programme-matrix-union",
                          "directoryUrl": DIRECTORY, "directoryHash": directory_source["sha256"],
                          "faculty": unit,
                          "includedProgrammes": [source["programmeTitle"] for source in selected],
                          "programmeUrls": [source["programmeUrl"] for source in selected],
                          "matrixUrls": [source.get("finalUrl", source["url"]) for source in selected]},
        }
    sources = [grouped[unit] for unit in GROUPS]
    if sum(GROUPS[unit][1] for unit in GROUPS) != EXPECTED_TOTAL:
        raise ValueError("Sabanci reviewed total changed")
    write(CACHE / "sabanci-reviewed-courses.json", sources)
    write(CACHE / "sabanci-reviewed-programmes.json", [{
        "universityId": UID, "directoryUrl": DIRECTORY, "directorySource": directory_source,
        "matched": [source["programs"][0] for source in sources], "unmatched": [],
        "courseCounts": {source["programs"][0]["programId"]: GROUPS[source["programs"][0]["unit"]][1]
                         for source in sources},
    }])
    print("Sabanci University:", len(sources), "admission groups;", EXPECTED_TOTAL,
          "course records from", len(matrices), "degree programmes", flush=True)
    for source in sources:
        print(source["programs"][0]["programId"],
              GROUPS[source["programs"][0]["unit"]][1], flush=True)


if __name__ == "__main__":
    main()
