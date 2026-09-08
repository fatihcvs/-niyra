"""Collect TOBB ETU's official undergraduate programme course packages."""
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse

from discover_turkey_courses import match, normal
from parse_cyprus_courses import clean
from parse_turkey_courses import course_code
from parse_turkey_tobb_courses import parse_tobb_abys, parse_tobb_ybs
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-tobb-ekonomi-ve-teknoloji-universitesi"
DIRECTORY = "https://www.etu.edu.tr/tr/sayfa/tyyc-bilgi-paketleri"
YBS_PLAN = "https://www.etu.edu.tr/tr/bolum/yonetim-bilisim-sistemleri/ders-mufredati"
ALIASES = {
    "Yapay Zeka Mühendisliği": "Yapay Zeka Mühendisliği (İngilizce)",
    "İngiliz Dili ve Edebiyatı": "İngiliz Dili ve Edebiyatı (İngilizce)",
}
EXPECTED_COUNTS = {
    "program-osym-205400157": 74,
    "program-osym-205410026": 60,
    "program-osym-205410035": 69,
    "program-osym-205410044": 67,
    "program-osym-205410062": 78,
    "program-osym-205410105": 61,
    "program-osym-205410123": 53,
    "program-osym-205410141": 52,
    "program-osym-205410168": 57,
    "program-osym-205410265": 145,
    "program-osym-205410371": 74,
    "program-osym-205410405": 104,
    "program-osym-205410486": 74,
    "program-osym-205410502": 66,
    "program-osym-205410511": 52,
    "program-osym-205410698": 63,
    "program-osym-205410962": 49,
    "program-osym-205410971": 89,
    "program-osym-205411033": 71,
    "program-osym-205411103": 75,
    "program-osym-205490115": 54,
    "program-osym-205490116": 46,
}
EXPECTED_TOTAL = 1533


def undergraduate_links(document, base_url):
    heading = next((item for item in document.select("h2")
                    if clean(item.get_text(" ", strip=True)) == "Lisans Programları"), None)
    if heading is None:
        raise ValueError("TOBB ETU undergraduate directory heading is unavailable")
    links = []
    for node in heading.find_all_next():
        if node.name == "h2":
            break
        if node.name != "a" or "/public/program.jsp" not in node.get("href", ""):
            continue
        target = urljoin(base_url, node["href"])
        if urlparse(target).hostname != "abys.etu.edu.tr":
            continue
        unit_heading = node.find_previous("h3")
        links.append({"title": clean(node.get_text(" ", strip=True)),
                      "unit": clean(unit_heading.get_text(" ", strip=True)) if unit_heading else None,
                      "url": target})
    return links


def collect_program(item):
    programme, directory_title, identity_url, unit_name = item
    identity = fetch(identity_url, retry_failed=True)
    if identity.get("status") != 200:
        raise ValueError(f"TOBB ETU ABYS programme is unavailable: {identity_url}")
    heading = soup(identity).select_one("h1")
    actual = clean(heading.get_text(" ", strip=True)) if heading else ""
    if normal(actual) != normal(directory_title):
        raise ValueError(f"TOBB ETU programme identity changed: {identity_url} / {actual}")
    is_ybs = programme["id"] == "program-osym-205400157"
    source = fetch(YBS_PLAN, retry_failed=True) if is_ybs else identity
    if source.get("status") != 200:
        raise ValueError(f"TOBB ETU course source is unavailable: {programme['name']}")
    parser = parse_tobb_ybs if is_ybs else parse_tobb_abys
    courses, conflicts = parser(soup(source), course_code)
    if conflicts:
        raise ValueError(f"TOBB ETU course-code conflicts changed: {programme['name']} / {conflicts}")
    expected = EXPECTED_COUNTS[programme["id"]]
    if len(courses) != expected:
        raise ValueError(f"TOBB ETU reviewed course count changed: {programme['name']} / {len(courses)}")
    course_url = YBS_PLAN if is_ybs else identity_url
    reference = {"universityId": UID, "programId": programme["id"], "name": programme["name"],
                 "title": programme["name"], "sourceTitle": directory_title,
                 "degree": programme["degreeLevel"], "unit": unit_name,
                 "directoryUrl": DIRECTORY, "identityEvidenceUrl": identity_url,
                 "courseUrl": course_url}
    output = {**source, "programs": [reference],
              "family": "tobb-ybs-curriculum-2026" if is_ybs else "tobb-abys-2026",
              "publicUrl": course_url,
              "curriculumPeriod": "Güncel resmî lisans ders planı" if is_ybs else "Güncel resmî lisans ders bilgi paketi",
              "selection": {"method": "reviewed-current-ybs-curriculum" if is_ybs else "reviewed-public-abys-programme-package",
                            "directoryUrl": DIRECTORY, "directoryTitle": directory_title,
                            "identityUrl": identity_url, "identityTitle": actual}}
    return output, len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    directory_source = fetch(DIRECTORY, retry_failed=True)
    if directory_source.get("status") != 200:
        raise ValueError("TOBB ETU TYYC directory is unavailable")
    directory_document = soup(directory_source)
    links = undergraduate_links(directory_document, directory_source.get("finalUrl", DIRECTORY))
    if len(links) != 22:
        raise ValueError(f"TOBB ETU undergraduate directory changed: {len(links)}")
    unit_names = {unit["id"]: unit["name"] for unit in university["units"]}
    matched = []
    for link in links:
        registry_title = ALIASES.get(link["title"], link["title"])
        programme = match(university, {"title": registry_title, "unit": link["unit"], "degree": "bachelor"})
        if not programme:
            raise ValueError(f"TOBB ETU programme does not match registry: {link}")
        matched.append((programme, link["title"], link["url"], unit_names[programme["unitId"]]))
    ids = [item[0]["id"] for item in matched]
    if len(ids) != len(set(ids)) or set(ids) != set(EXPECTED_COUNTS):
        raise ValueError("TOBB ETU current registry coverage is incomplete or ambiguous")
    with ThreadPoolExecutor(max_workers=4) as pool:
        collected = list(pool.map(collect_program, matched))
    sources = [source for source, _count in collected]
    counts = {source["programs"][0]["programId"]: count for source, count in collected}
    total = sum(counts.values())
    if total != EXPECTED_TOTAL:
        raise ValueError(f"TOBB ETU reviewed set changed: {len(sources)} / {total}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "tobb-reviewed-courses.json", sources)
    write(CACHE / "tobb-reviewed-programmes.json", [{
        "universityId": UID, "directoryUrl": DIRECTORY,
        "directorySource": directory_source,
        "matched": [source["programs"][0] for source in sources], "unmatched": [],
        "courseCounts": counts,
    }])
    print("TOBB ETU:", len(sources), "programmes;", total, "course records", flush=True)
    for program_id in sorted(counts):
        print(program_id, counts[program_id], flush=True)


if __name__ == "__main__":
    main()
