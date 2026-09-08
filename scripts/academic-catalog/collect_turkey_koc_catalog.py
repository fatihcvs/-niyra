"""Collect Koç University's reviewed public undergraduate curricula."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import threading
import time
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from parse_turkey_courses import course_code
from parse_turkey_koc_courses import (
    parse_koc_curriculum,
    parse_koc_medicine,
    parse_koc_nursing,
)
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-koc-universitesi"
APPLICATION_DIRECTORY = "https://apply.ku.edu.tr/courses"
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
              "AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/152.0.0.0 Safari/537.36")

PROGRAMMES = {
    "program-osym-203910018": ("BA Archaeology and History of Art", "17-ba-archaeology-and-history-art", "Archaeology and History of Art", "https://cssh.ku.edu.tr/en/programs/archaeology-and-history-of-art/curriculum/", "curriculum"),
    "program-osym-203910036": ("BA Philosophy", "21-ba-philosophy", "Philosophy", "https://cssh.ku.edu.tr/en/programs/philosophy/curriculum/", "curriculum"),
    "program-osym-203910829": ("BA Comparative Literature", "18-ba-comparative-literature", "Comparative Literature", "https://cssh.ku.edu.tr/en/programs/comparative-literature/curriculum/", "curriculum"),
    "program-osym-203910715": ("BA Media and Visual Arts", "23-ba-media-and-visual-arts", "Media and Visual Arts", "https://cssh.ku.edu.tr/en/programs/media-and-visual-arts/curriculum/", "curriculum"),
    "program-osym-203910124": ("BA Psychology", "20-ba-psychology", "Psychology", "https://cssh.ku.edu.tr/en/programs/psychology/curriculum/", "curriculum"),
    "program-osym-203910169": ("BA Sociology", "22-ba-sociology", "Sociology", "https://cssh.ku.edu.tr/en/programs/sociology/curriculum/", "curriculum"),
    "program-osym-203910187": ("BA History", "19-ba-history", "History", "https://cssh.ku.edu.tr/en/programs/history/curriculum/", "curriculum"),
    "program-osym-203910699": ("MD Medicine", "11", "Medicine", "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/", "medicine"),
    "program-osym-203910054": ("BSc Physics", "25-bsc-physics", "Physics", "https://science.ku.edu.tr/en/programs/physics/undergraduate-programs/curriculum/", "curriculum"),
    "program-osym-203910099": ("BSc Chemistry", "24-bsc-chemistry", "Chemistry", "https://science.ku.edu.tr/en/programs/chemistry/undergraduate-programs/curriculum/", "curriculum"),
    "program-osym-203910115": ("BSc Mathematics", "26-bsc-mathematics", "Mathematics", "https://science.ku.edu.tr/en/programs/mathematics/undergraduate-programs/curriculum/", "curriculum"),
    "program-osym-203910557": ("BSc Molecular Biology and Genetics", "27-bsc-molecular-biology-and-genetics", "Molecular Biology and Genetics", "https://science.ku.edu.tr/en/programs/molecular-biology-and-genetics/undergraduate-programs/curriculum/", "curriculum"),
    "program-osym-203910845": ("BSc Nursing", "34-bsc-nursing", "Nursing", "https://nursing.ku.edu.tr/en/education/undergraduate/courses/", "nursing"),
    "program-osym-203910354": ("BSc Computer Engineering", "29-bsc-computer-engineering", "Computer Engineering", "https://eng.ku.edu.tr/en/computer-engineering/undergraduate/curriculum/", "curriculum"),
    "program-osym-203910381": ("BSc Electrical and Electronics Engineering", "30-bsc-electrical-and-electronics-engineering", "Electrical and Electronics Engineering", "https://eng.ku.edu.tr/en/electrical-and-electronics-engineering/undergraduate/curriculum/", "curriculum"),
    "program-osym-203910415": ("BSc Industrial Engineering", "31-bsc-industrial-engineering", "Industrial Engineering", "https://eng.ku.edu.tr/en/industrial-engineering/undergraduate/curriculum/", "curriculum"),
    "program-osym-203910442": ("BSc Chemical and Biological Engineering", "28-bsc-chemical-and-biological-engineering", "Chemical and Biological Engineering", "https://eng.ku.edu.tr/en/chemical-and-biological-engineering/undergraduate/curriculum/", "curriculum"),
    "program-osym-203910478": ("BSc Mechanical Engineering", "32-bsc-mechanical-engineering", "Mechanical Engineering", "https://eng.ku.edu.tr/en/mechanical-engineering/undergraduate/curriculum/", "curriculum"),
    "program-osym-203910787": ("BA Law", "33-ba-law", "Law", "https://law.ku.edu.tr/egitim/ders-plani/", "curriculum"),
    "program-osym-203910266": ("BA Economics", "15-ba-economics", "Economics", "https://case.ku.edu.tr/en/programs/economics/curriculum/", "curriculum"),
    "program-osym-203910327": ("BA International Relations", "16-ba-international-relations", "International Relations", "https://case.ku.edu.tr/en/programs/international-relations/curriculum/", "curriculum"),
    "program-osym-203910293": ("BA Business Administration", "12-ba-business-administration", "Business Administration", "https://case.ku.edu.tr/en/programs/business-administration/curriculum/", "curriculum"),
}

MEDICINE_YEARS = [
    (1, "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/1-year-freshman/"),
    (2, "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/2-year-pre-clinic-1st-year/"),
    (3, "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/3-year-pre-clinic-2nd-year/"),
    (4, "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/4-year-clinic-1st-year/"),
    (5, "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/5-year-clinic-2nd-year/"),
    (6, "https://medicine.ku.edu.tr/en/education/undergraduate-medical-education/academic-program/6-year-internship/"),
]

# Filled after the source set and parser are reviewed together. Counts are
# deliberately per programme so a silent page redesign cannot pass on totals.
EXPECTED_COUNTS = {
    "program-osym-203910018": 17,
    "program-osym-203910036": 15,
    "program-osym-203910054": 139,
    "program-osym-203910099": 168,
    "program-osym-203910115": 157,
    "program-osym-203910124": 23,
    "program-osym-203910169": 16,
    "program-osym-203910187": 11,
    "program-osym-203910266": 187,
    "program-osym-203910293": 295,
    "program-osym-203910327": 199,
    "program-osym-203910354": 191,
    "program-osym-203910381": 225,
    "program-osym-203910415": 172,
    "program-osym-203910442": 185,
    "program-osym-203910478": 198,
    "program-osym-203910557": 178,
    "program-osym-203910699": 49,
    "program-osym-203910715": 17,
    "program-osym-203910787": 132,
    "program-osym-203910829": 20,
    "program-osym-203910845": 25,
}
EXPECTED_TOTAL = 2619
EXPECTED_CONFLICTS = {
    "program-osym-203910327": ["INTL350"],
}

_guard = threading.Lock()
_host_limits = defaultdict(lambda: threading.Semaphore(2))


def fetch_koc(url, retry_failed=False):
    """Cache a public Koç page using the browser-compatible UA its WAF accepts."""
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    meta_path, body_path = CACHE / (key + ".meta.json"), CACHE / (key + ".body")
    with _guard:
        if meta_path.exists():
            cached = read(meta_path)
            if cached.get("status") == 200 or not retry_failed:
                return cached
    host = urlparse(url).hostname
    with _guard:
        host_limit = _host_limits[host]
    error = None
    with host_limit:
        for attempt in range(3):
            meta = {"url": url, "fetchedAt": datetime.now(timezone.utc).isoformat(),
                    "file": body_path.name, "requestProfile": "public-browser-compatible"}
            try:
                request = Request(quote(url, safe=":/?=&%+#@;,$!()*-._~"),
                                  headers={"User-Agent": BROWSER_UA,
                                           "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"})
                with urlopen(request, timeout=70) as response:
                    content = response.read(30_000_001)
                    if len(content) > 30_000_000:
                        raise ValueError("Source exceeds research download limit")
                    meta.update(status=response.status, finalUrl=response.url,
                                contentType=response.headers.get("Content-Type", ""),
                                sha256=hashlib.sha256(content).hexdigest())
                body_path.write_bytes(content)
                write(meta_path, meta)
                return meta
            except Exception as caught:
                error = caught
                meta.update(status=getattr(caught, "code", 0), error=str(caught))
                if attempt < 2:
                    time.sleep(1 + attempt)
    write(meta_path, meta)
    raise ValueError(f"Koç official source is unavailable: {url} / {error}")


def reference(programme, source_title, identity_url, unit_names):
    return {
        "universityId": UID,
        "programId": programme["id"],
        "name": programme["name"],
        "title": programme["name"],
        "sourceTitle": source_title,
        "degree": programme["degreeLevel"],
        "unit": unit_names[programme["unitId"]],
        "directoryUrl": APPLICATION_DIRECTORY,
        "identityEvidenceUrl": identity_url,
    }


def verify_identity(programme, config, unit_names):
    identity_title, application_slug, source_title, source_url, family = config
    identity_url = f"https://apply.ku.edu.tr/courses/course/{application_slug}"
    identity_source = fetch(identity_url, retry_failed=True)
    if identity_source.get("status") != 200:
        raise ValueError(f"Koç application identity is unavailable: {identity_url}")
    heading = soup(identity_source).select_one("h1")
    actual = " ".join(heading.get_text(" ", strip=True).split()) if heading else ""
    if actual != identity_title:
        raise ValueError(f"Koç application identity changed: {identity_url} / {actual}")
    return programme, source_title, source_url, family, identity_url, unit_names


def collect_standard(item):
    programme, source_title, source_url, family, identity_url, unit_names = item
    source = fetch_koc(source_url, retry_failed=True)
    if family == "nursing":
        courses, conflicts = parse_koc_nursing(soup(source), course_code)
        source_family = "koc-nursing-2026"
        method = "reviewed-public-undergraduate-course-cards"
    else:
        courses, conflicts = parse_koc_curriculum(soup(source), course_code)
        source_family = "koc-curriculum-2026"
        method = "reviewed-eight-semester-curriculum"
    if conflicts != EXPECTED_CONFLICTS.get(programme["id"], []):
        raise ValueError(f"Koç course-code conflicts changed: {programme['name']} / {conflicts}")
    expected = EXPECTED_COUNTS.get(programme["id"])
    if expected is not None and len(courses) != expected:
        raise ValueError(f"Koç reviewed course count changed: {programme['name']} / {len(courses)}")
    ref = reference(programme, source_title, identity_url, unit_names)
    return ({**source, "programs": [ref], "family": source_family,
             "publicUrl": source.get("finalUrl", source_url),
             "curriculumPeriod": "Güncel resmî lisans ders planı",
             "selection": {"method": method, "identityTitle": identity_title_for(programme["id"]),
                           "identityUrl": identity_url, "sourceTitle": source_title,
                           **({"excludedConflictingCourseCodes": conflicts} if conflicts else {})}}, len(courses))


def identity_title_for(programme_id):
    return PROGRAMMES[programme_id][0]


def collect_medicine(item):
    programme, source_title, source_url, _family, identity_url, unit_names = item
    main_source = fetch_koc(source_url, retry_failed=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        year_sources = list(pool.map(lambda value: (value[0], fetch_koc(value[1], retry_failed=True)), MEDICINE_YEARS))
    bundle = {"sources": [{**source, "year": year} for year, source in year_sources]}
    bundle_path = CACHE / "koc-medicine-reviewed-bundle.json"
    write(bundle_path, bundle)
    courses, conflicts = parse_koc_medicine(bundle, CACHE, course_code)
    if conflicts:
        raise ValueError(f"Koç Medicine course-code conflicts changed: {conflicts}")
    expected = EXPECTED_COUNTS.get(programme["id"])
    if expected is not None and len(courses) != expected:
        raise ValueError(f"Koç reviewed course count changed: {programme['name']} / {len(courses)}")
    ref = reference(programme, source_title, identity_url, unit_names)
    source = {
        "url": source_url,
        "finalUrl": main_source.get("finalUrl", source_url),
        "fetchedAt": max(source["fetchedAt"] for _year, source in year_sources),
        "file": bundle_path.name,
        "status": 200,
        "contentType": "application/json",
        "sha256": hashlib.sha256(bundle_path.read_bytes()).hexdigest(),
        "programs": [ref],
        "family": "koc-medicine-2026",
        "publicUrl": main_source.get("finalUrl", source_url),
        "curriculumPeriod": "Güncel resmî altı yıllık tıp programı",
        "selection": {"method": "reviewed-six-public-medical-year-pages",
                      "identityTitle": identity_title_for(programme["id"]),
                      "identityUrl": identity_url, "sourceTitle": source_title,
                      "yearUrls": [url for _year, url in MEDICINE_YEARS]},
    }
    return source, len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    programmes = {programme["id"]: programme for programme in university["programs"]}
    if set(programmes) != set(PROGRAMMES) or len(programmes) != 22:
        raise ValueError(f"Koç target set changed: {len(programmes)}")
    unit_names = {unit["id"]: unit["name"] for unit in university["units"]}
    identities = [verify_identity(programmes[program_id], config, unit_names)
                  for program_id, config in PROGRAMMES.items()]
    medicine = next(item for item in identities if item[3] == "medicine")
    standards = [item for item in identities if item[3] != "medicine"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        collected = list(pool.map(collect_standard, standards))
    collected.append(collect_medicine(medicine))
    sources = [source for source, _count in collected]
    counts = {source["programs"][0]["programId"]: count
              for source, count in collected}
    total = sum(counts.values())
    if len(sources) != 22 or (EXPECTED_TOTAL is not None and total != EXPECTED_TOTAL):
        raise ValueError(f"Koç reviewed set changed: {len(sources)} / {total}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "koc-reviewed-courses.json", sources)
    write(CACHE / "koc-reviewed-programmes.json", [{
        "universityId": UID,
        "applicationDirectory": APPLICATION_DIRECTORY,
        "matched": [source["programs"][0] for source in sources],
        "unmatched": [],
        "courseCounts": counts,
    }])
    print("Koç University:", len(sources), "new programmes;", total,
          "course records", flush=True)
    for program_id in sorted(counts):
        print(program_id, counts[program_id], flush=True)


if __name__ == "__main__":
    main()
