"""Collect reviewed Konya Technical University department-course catalogues."""
import re
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin

from discover_turkey_courses import normal
from parse_turkey_courses import course_code
from parse_turkey_ktun_courses import parse_ktun
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-konya-teknik-universitesi"
BASE = "https://www.ktun.edu.tr"
COURSE_ENDPOINT = BASE + "/tr/Birim/BolumDersListesiGetir?id={}"
EXPECTED_CONFLICTS = {"program-osym-111350463": ["5041258"]}

# Each public department page links to its own Bölüm Dersleri page. Keeping the
# reviewed pair makes faculty, degree and programme identity independently
# checkable even though the public site uses opaque query tokens.
DEPARTMENTS = [
    ("Bilgisayar Mühendisliği", "bachelor", "Bilgisayar Ve Bilişim Bilimleri Fakültesi", "/tr/Birim/Hakkimizda/?brm=CjjgkdJ2kGZdNA6detUMmQ==", "/tr/Birim/BolumDersleri/?brm=Vcw5fqYY6fahuCPJwVMF/A=="),
    ("Yapay Zeka ve Makine Öğrenmesi", "bachelor", "Bilgisayar Ve Bilişim Bilimleri Fakültesi", "/tr/Birim/Hakkimizda/?brm=14Nor138UPTTvDv6Apnukw==", "/tr/Birim/BolumDersleri/?brm=jpARGunz+hgOEUobIiydfg=="),
    ("Yazılım Mühendisliği", "bachelor", "Bilgisayar Ve Bilişim Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=SpbdtHOPmq3Vr7JBoHq7IA==", "/tr/Birim/BolumDersleri/?brm=YD/pMTwpT/lK9/8hl/+rRg=="),
    ("İç Mimarlık", "bachelor", "Mimarlık Ve Tasarım Fakültesi", "/tr/Birim/Duyurular/?brm=g7/720EPpazuh0oxDXh6GA==", "/tr/Birim/BolumDersleri/?brm=OCfM7zT/SfAzLkok4u5pTw=="),
    ("Mimarlık", "bachelor", "Mimarlık Ve Tasarım Fakültesi", "/tr/Birim/Duyurular/?brm=G6659ogsx1G6K6szUz5SaA==", "/tr/Birim/BolumDersleri/?brm=OZc3BWmeHGYuCdEdr3h/vQ=="),
    ("Şehir ve Bölge Planlama", "bachelor", "Mimarlık Ve Tasarım Fakültesi", "/tr/Birim/Duyurular/?brm=JaS8Z4oYnTqo6TGsH/zZbg==", "/tr/Birim/BolumDersleri/?brm=cUooAtp0oyrTFJzWwhElwg=="),
    ("Elektrik-Elektronik Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=ZsobiwaZkLryYw8fWfQxOA==", "/tr/Birim/BolumDersleri/?brm=N//BGq9PDMBsE5olJo2U7w=="),
    ("Endüstri Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=2H4mH3NLjgsVdUafOdEThQ==", "/tr/Birim/BolumDersleri/?brm=LNXHiw/2qQv+6AClYHv9Qw=="),
    ("Harita Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=GtPC3+lY2w8m0+EOO75WAg==", "/tr/Birim/BolumDersleri/?brm=HUl6qpxWR42/56P+zSBflQ=="),
    ("İnşaat Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=Ej3Dbzz3349oEgtqSjv5kA==", "/tr/Birim/BolumDersleri/?brm=/shMh4g+pJe0aSih4aoAYw=="),
    ("Jeoloji Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=lmhBvI1WXmJSLDI9rbi+9w==", "/tr/Birim/BolumDersleri/?brm=dA3oWGMFgLEcMRZ0JQS3OA=="),
    ("Kimya Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=rgBRWcGggPYACfWedM49Qg==", "/tr/Birim/BolumDersleri/?brm=D1/Lz3J2WfDBetx6sbb1pQ=="),
    ("Makine Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=G4/pl1sz9VHjeDFjkrMnwQ==", "/tr/Birim/BolumDersleri/?brm=xUaF50ZQgz60DhJaBfP6Vg=="),
    ("Metalurji ve Malzeme Mühendisliği", "bachelor", "Mühendislik Ve Doğa Bilimleri Fakültesi", "/tr/Birim/Duyurular/?brm=Tb5Pus4Dq9Rh5nCrqi4KlQ==", "/tr/Birim/BolumDersleri/?brm=pXF3DHCAgqns8C8cH8H38w=="),
    ("Bilgisayar Teknolojileri", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=rD1ANYCJhoZuYWDAndCQsw==", "/tr/Birim/BolumDersleri/?brm=VQK95J99LhhQge3oIYKHYA=="),
    ("El Sanatları", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=RoJ7TrIm+gQpnAu4YQ3aLA==", "/tr/Birim/BolumDersleri/?brm=X7JhhQxeEhxxmUEyUSNx3Q=="),
    ("Elektrik ve Enerji", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=SCuj/CqWl+7lloeAQEg/LQ==", "/tr/Birim/BolumDersleri/?brm=I0KI49eAlpVBPWlv5kLT6Q=="),
    ("Elektronik ve Otomasyon", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=NjHpq7CBI+34Hn3/sWhJJQ==", "/tr/Birim/BolumDersleri/?brm=3T8v287Y2Ib8XJ2Uwd1imA=="),
    ("Gıda İşleme", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=jjzWfP/XQ2+/jpg+UjK4QQ==", "/tr/Birim/BolumDersleri/?brm=GcAd3bbWVu65HgGPo9Ck8g=="),
    ("Görsel, İşitsel Teknikler ve Medya Yapımcılığı", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=4hbRl2X3Y0Ux3RU2z1tuOQ==", "/tr/Birim/BolumDersleri/?brm=ZGoehgU09WjXs++yU4jHRw=="),
    ("İnşaat", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=CkW6BanFyGC9s11DBm29zQ==", "/tr/Birim/BolumDersleri/?brm=YrBKgVDcCTlsfoeGWUwtmA=="),
    ("Kimya ve Kimyasal İşleme Teknolojileri", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=ToIQCBNXz/ssYEj4HPiOSg==", "/tr/Birim/BolumDersleri/?brm=pyR2nEfF5yhyGc/rP9GDww=="),
    ("Makine ve Metal Teknolojileri", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=1F64UYn5VMCcnj0XynkyDw==", "/tr/Birim/BolumDersleri/?brm=R0tRieWHpnHkpFtvPSk7kQ=="),
    ("Malzeme ve Malzeme İşleme Teknolojileri", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=JTxbNitn/gvt/S3LKiyjRQ==", "/tr/Birim/BolumDersleri/?brm=X56giM438VtYWWntRwiKaw=="),
    ("Mimarlık ve Şehir Planlama", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=5MeK8SHrnv2FTvSjSm0RHg==", "/tr/Birim/BolumDersleri/?brm=HhUDzpIP/G3QmhSpbLe/QA=="),
    ("Tekstil, Giyim, Ayakkabı ve Deri", "associate", "Teknik Bilimler Meslek Yüksekokulu", "/tr/Birim/Hakkimizda/?brm=bBrLpJmoS4BZn92VMtTryA==", "/tr/Birim/BolumDersleri/?brm=JcqiABbQdWid48oohsTMsg=="),
]


def _fetch_success(url):
    source = None
    for _attempt in range(5):
        source = fetch(url, retry_failed=True)
        if source.get("status") == 200 and source.get("sha256"):
            return source
        time.sleep(0.75)
    raise ValueError(f"KTÜN official source remained unavailable: {url} / {source}")


def programme_items(document):
    items = []
    for link in document.select("a[onclick]"):
        match = re.search(r"derslistegetir\((\d+)\)", link.get("onclick", ""))
        if match:
            items.append({"programmeId": match.group(1), "title": " ".join(link.get_text(" ", strip=True).split())})
    return items


def _is_variant(title):
    return bool(re.search(r"\(\s*(?:İ\.?\s*Ö\.?|İng(?:ilizce)?)\s*\)", title, re.I))


def match_programmes(official, university):
    units = {unit["id"]: normal(unit["name"]) for unit in university["units"]}
    matched = []
    for programme in university["programs"]:
        candidates = [item for item in official
                      if item["degree"] == programme["degreeLevel"]
                      and normal(item["unit"]) == units.get(programme["unitId"])
                      and normal(item["title"]) == normal(programme["name"])]
        if len(candidates) != 1:
            raise ValueError(f"KTÜN programme identity is not unique: {programme['name']} / {len(candidates)}")
        matched.append((programme, candidates[0]))
    return matched


def _department(item):
    name, degree, unit, directory_path, course_path = item
    directory_url, course_url = BASE + directory_path, BASE + course_path
    directory_source = _fetch_success(directory_url)
    directory = soup(directory_source)
    heading = directory.select_one("h1.kingster-page-title")
    if heading is None or normal(heading.get_text(" ", strip=True)) != normal(name):
        raise ValueError(f"KTÜN department identity changed: {directory_url}")
    linked = {urljoin(directory_url, link["href"]) for link in directory.select('a[href]')
              if normal(link.get_text(" ", strip=True)) == "dersleri"}
    if course_url not in linked:
        raise ValueError(f"KTÜN department course link changed: {directory_url}")
    page_source = _fetch_success(course_url)
    page = soup(page_source)
    page_heading = page.select_one("h1.kingster-page-title")
    if page_heading is None or normal(page_heading.get_text(" ", strip=True)) != normal(name):
        raise ValueError(f"KTÜN course-page identity changed: {course_url}")
    return directory_source, [{**programme, "degree": degree, "unit": unit,
                               "department": name, "directoryUrl": directory_url,
                               "courseUrl": course_url}
                              for programme in programme_items(page) if not _is_variant(programme["title"])]


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    if len(university["programs"]) != 34:
        raise ValueError(f"KTÜN target set changed: {len(university['programs'])}")
    with ThreadPoolExecutor(max_workers=4) as pool:
        departments = list(pool.map(_department, DEPARTMENTS))
    official = [programme for _source, programmes in departments for programme in programmes]
    mappings = match_programmes(official, university)

    def collect(mapping):
        programme, item = mapping
        data_url = COURSE_ENDPOINT.format(item["programmeId"])
        source = _fetch_success(data_url)
        courses, conflicts = parse_ktun(soup(source), course_code)
        expected = EXPECTED_CONFLICTS.get(programme["id"], [])
        if conflicts != expected:
            raise ValueError(f"KTÜN reviewed course conflicts changed: {programme['name']} / {conflicts}")
        if len(courses) < 3:
            raise ValueError(f"KTÜN course catalogue is unreadable: {programme['name']} / {len(courses)}")
        reference = {
            "universityId": UID,
            "programId": programme["id"],
            "name": programme["name"],
            "title": item["title"],
            "degree": programme["degreeLevel"],
            "unit": item["unit"],
            "directoryUrl": item["courseUrl"],
            "identityEvidenceUrl": item["directoryUrl"],
        }
        result = {
            **source,
            "programs": [reference],
            "family": "ktun-reviewed-2026",
            "publicUrl": item["courseUrl"],
            "curriculumPeriod": "Resmî Bölüm Dersleri kataloğu",
            "selection": {
                "method": "reviewed-official-department-programme-id",
                "department": item["department"],
                "sourceTitle": item["title"],
                "programmeId": item["programmeId"],
            },
        }
        if expected:
            result["selectionError"] = "official-course-code-conflict:" + ",".join(conflicts)
            result["selection"]["rejectedDuplicateCourseCodes"] = conflicts
        return result, len(courses)

    with ThreadPoolExecutor(max_workers=4) as pool:
        collected = list(pool.map(collect, mappings))
    sources = [source for source, _count in collected]
    clean = [source for source in sources if not source.get("selectionError")]
    total_courses = sum(count for (source, count) in collected if not source.get("selectionError"))
    if len(clean) != 33 or total_courses != 3205:
        raise ValueError(f"KTÜN reviewed course set changed: {len(clean)} / {total_courses}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "ktun-reviewed-courses.json", sources)
    write(CACHE / "ktun-reviewed-directories.json", [{
        "universityId": UID,
        "pages": [source for source, _programmes in departments],
        "matched": [source["programs"][0] for source in sources],
        "unmatched": [],
        "unreadable": [{
            "programId": source["programs"][0]["programId"],
            "name": source["programs"][0]["name"],
            "reason": source["selectionError"],
        } for source in sources if source.get("selectionError")],
    }])
    print("Konya Technical University:", len(clean), "new programmes;",
          total_courses, "course records; unreadable:", len(sources) - len(clean), flush=True)


if __name__ == "__main__":
    main()
