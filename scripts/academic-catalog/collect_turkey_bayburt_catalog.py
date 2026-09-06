"""Publish reviewed Bayburt curricula omitted by the generic parser."""
from parse_cyprus_courses import clean
from parse_turkey_bayburt_courses import parse_bayburt
from parse_turkey_courses import course_kind, heading_period
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-bayburt-universitesi"
EXPECTED = {
    "program-osym-101850194": {
        "sourceHash": "c095a1178eaa856c57a19e3ec2abecbd452d315da77b87f4ba7215a4fcd72094",
        "headings": ["Gıda Teknolojisi (Bologna 2-2019)",
                     "Gıda İşleme (Bologna 3 İşletmede Mesleki Uygulama 3+1 Müfredatı 2026)"],
        "label": "Gıda İşleme (Bologna 3 İşletmede Mesleki Uygulama 3+1 Müfredatı 2026)",
        "count": 19,
    },
    "program-osym-101850255": {
        "sourceHash": "807d15cf9b89c497e05dde442fa810ce5ad3fe95aae63ca59b6c2431f6361bf7",
        "headings": ["İnşaat Teknolojisi (Bologna 2-2019)",
                     "İnşaat Teknolojisi (Bologna 3 3+1 Uygulama 2024)"],
        "label": "İnşaat Teknolojisi (Bologna 3 3+1 Uygulama 2024)",
        "count": 32,
    },
    "program-osym-101850201": {
        "sourceHash": "d73b69c615fae4f7e85d18d5a07be1b055f08dcff93c81c920963f05c1740136",
        "headings": ["Laborant ve Veteriner Sağlık (Bologna 3- 2019)",
                     "Laborant ve Veteriner Sağlık (Bologna 4 2025)"],
        "label": "Laborant ve Veteriner Sağlık (Bologna 4 2025)",
        "count": 44,
    },
    "program-osym-101890133": {
        "sourceHash": "383bfca2c02de0ecbbf05e77fa0bdb768fa1e5a74b08aeab17af47b0b6cb4378",
        "headings": ["İlk ve Acil Yardım (Bologna 2)", "İlk ve Acil Yardım (Bologna 3)"],
        "label": "İlk ve Acil Yardım (Bologna 3)",
        "count": 81,
    },
    "program-osym-101890147": {
        "sourceHash": "3e4748a8e785d248f72de7ce7a0d6e35fc24538a1d4edf9a36be921189876277",
        "headings": [], "label": None, "count": 67,
    },
    "program-osym-101890196": {
        "sourceHash": "a02cb98d9f188023fa402ce72bd3f38fde08ee61ed04da780682822aeb3f503f",
        "headings": ["Yaşlı Bakımı (Bologna 2)",
                     "Yaşlı Bakımı Bologna 3 Müfredatı (İşletmede Mesleki Uygulama (2+2) 2026)"],
        "label": "Yaşlı Bakımı Bologna 3 Müfredatı (İşletmede Mesleki Uygulama (2+2) 2026)",
        "count": 19,
    },
    "program-osym-101850167": {
        "sourceHash": "7ae1bf7b6723512fd4eae0a10840266b5e2bccfff23cc46f1d1eb9ba6ac9d015",
        "headings": ["Bankacılık ve Sigortacılık (Bologna 2 - 2017)",
                     "Bankacılık ve Sigortacılık (Bologna 3 - 2024)"],
        "label": "Bankacılık ve Sigortacılık (Bologna 3 - 2024)",
        "count": 48,
    },
    "program-osym-101850176": {
        "sourceHash": "e4b0a80f889a2f3aac7d1130f61760631f115cd54e7d30e360dfc687cac2462e",
        "headings": [], "label": None, "count": 52,
    },
    "program-osym-101850088": {
        "sourceHash": "6a29a0215ca38b36f9fcc33b08022961dc29f1ee47c679a4cb33ea284112b4f2",
        "headings": [], "label": None, "count": 50,
    },
    "program-osym-101850291": {
        "sourceHash": "46bfac1080312ee4a61bacb9d3c9e957935adbc4fdbb0234b929d4706a3fdc21",
        "headings": [], "label": None, "count": 90,
    },
    "program-osym-101890062": {
        "sourceHash": "28bd6ecfeb9824e78451b44288b5c1392102d6c335264f8375e4c5b6812b55a1",
        "headings": ["İlahiyat (Bologna Müfredatı)",
                     "2016 İlahiyat (Bologna Müfredatı)",
                     "2019 İlahiyat (Bologna Müfredatı)",
                     "2023-Formasyon Müfredatı İlahiyat"],
        "label": "2023-Formasyon Müfredatı İlahiyat",
        "semesters": list(range(1, 9)),
        "count": 130,
    },
    "program-osym-101850097": {
        "sourceHash": "e839404f7b5c81c631ba6832e013d74215c5f05b980c001e890b87f3fb32246c",
        "headings": ["Büro Yönetimi ve Yönetici Asistanlığı Bologna 2 (2017)",
                     "Büro Yönetimi ve Yönetici Asistanlığı Bologna 3 (2024)",
                     "Posta Hizmetleri Öğrencileri için Büro Yönetimi ve Sekreterlik Eşdeğer Müfredatı"],
        "label": "Büro Yönetimi ve Yönetici Asistanlığı Bologna 3 (2024)",
        "count": 74,
    },
}
EXPECTED_TOTAL = 706

ALIASES = {
    "program-osym-101890062": ("program-osym-101810132", "İlahiyat"),
    "program-osym-101850097": (None,
        "Büro Hizmetleri ve Sekreterlik Bölümü Büro Yönetimi ve Yönetici Asistanlığı"),
}


def _references():
    directory = next(item for item in read(CACHE / "ecatalog-directories.json")
                     if item["universityId"] == UID)
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    references = {item["programId"]: item for item in directory["matched"]
                  if item["programId"] in EXPECTED and item["programId"] not in ALIASES}
    programmes = {item["id"]: item for item in university["programs"]}
    units = {item["id"]: item["name"] for item in university["units"]}
    for programme_id, (source_programme_id, source_title) in ALIASES.items():
        pool = directory["matched"] if source_programme_id else directory["unmatched"]
        candidates = [item for item in pool
                      if ((item.get("programId") == source_programme_id) if source_programme_id
                          else clean(item["title"]) == source_title)]
        if len(candidates) != 1:
            raise ValueError(f"Bayburt alias source changed: {programme_id}")
        source = candidates[0]
        programme = programmes[programme_id]
        if (source["degree"] != programme["degreeLevel"]
                or clean(source["unit"]) != clean(units[programme["unitId"]])):
            raise ValueError(f"Bayburt alias scope changed: {programme_id}")
        references[programme_id] = {
            **source,
            "universityId": UID,
            "sourceTitle": source["title"],
            "title": programme["name"],
            "programId": programme_id,
            "name": programme["name"],
            "registryAlias": True,
        }
    if set(references) != set(EXPECTED):
        raise ValueError("Bayburt target programme identities changed")
    return directory, references


def _selection(expected):
    if expected["label"] is None:
        return {"method": "single-official-plan", "headings": [],
                "semesters": expected.get("semesters", [1, 2, 3, 4])}
    return {
        "method": "reviewed-current-heading",
        "headings": expected["headings"],
        "label": expected["label"],
        "semesters": expected.get("semesters", [1, 2, 3, 4]),
    }


def main():
    directory, references = _references()
    sources = []
    total = 0
    for programme_id in sorted(references):
        reference = references[programme_id]
        expected = EXPECTED[programme_id]
        source = fetch(reference["courseUrl"])
        if source.get("status") != 200 or source.get("sha256") != expected["sourceHash"]:
            raise ValueError(f"Bayburt official source changed: {programme_id}")
        selection = _selection(expected)
        courses, conflicts = parse_bayburt(soup(source), selection, course_kind, heading_period)
        if conflicts or (expected["count"] is not None and len(courses) != expected["count"]):
            raise ValueError(f"Bayburt curriculum parse changed: {programme_id}: {conflicts}")
        period = expected["label"] or "Tek resmî yayımlanmış plan"
        source.update({
            "family": "bayburt-reviewed",
            "programs": [reference],
            "curriculumPeriod": period,
            "selection": {**selection, "sourceHash": source["sha256"],
                          "sourceTitle": reference.get("sourceTitle", reference["title"]),
                          "registryAlias": bool(reference.get("registryAlias"))},
        })
        sources.append(source)
        total += len(courses)
        print(programme_id, len(courses), "courses", flush=True)
    if EXPECTED_TOTAL is not None and total != EXPECTED_TOTAL:
        raise ValueError("Bayburt reviewed course total changed")
    write(CACHE / "bayburt-courses.json", sources)
    write(CACHE / "bayburt-directories.json", [{
        "universityId": UID,
        "matched": list(references.values()),
        "unmatched": [item for item in directory["unmatched"]
                      if item["url"] not in {reference["url"] for reference in references.values()}],
    }])
    print("Bayburt University:", len(sources), "new programmes;", total,
          "course records", flush=True)


if __name__ == "__main__":
    main()
