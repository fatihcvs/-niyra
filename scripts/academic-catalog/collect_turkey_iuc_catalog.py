"""Complete IUC curricula through its public print-curriculum JSON service."""
import re
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from discover_turkey_courses import links
from parse_cyprus_courses import clean, fold
from parse_turkey_iuc_courses import parse_iuc_print
from parse_turkey_courses import course_kind
from turkey_research import CACHE, ROOT, fetch, read, soup, write


UID = "tr-istanbul-universitesi-cerrahpasa"
API = "https://ebs.iuc.edu.tr/Home/GetPrintMufredatDersListesi"
CURRENT_YEAR = 2026
EXPECTED_TOTAL = 921

# These exact directory matches publish no server-rendered table for their
# selected plan. The public print service is the same page's data source.
EXACT_TARGET_IDS = {
    "program-osym-111610864",
    "program-osym-111650078",
    "program-osym-111650103",
    "program-osym-111650175",
    "program-osym-111650236",
    "program-osym-111650378",
    "program-osym-111650484",
    "program-osym-111650545",
    "program-osym-111650599",
    "program-osym-111650615",
    "program-osym-111650633",
    "program-osym-111650678",
    "program-osym-111650687",
    "program-osym-111650712",
    "program-osym-111650845",
    "program-osym-111650854",
    "program-osym-111650996",
    "program-osym-111651031",
    "program-osym-111690459",
    "program-osym-111690608",
    "program-osym-111690694",
    "program-osym-111690695",
    "program-osym-111690696",
    "program-osym-111690697",
    "program-osym-111690698",
    "program-osym-111690699",
    "program-osym-111690700",
    "program-osym-111690749",
    "program-osym-111690756",
}

# The directory captions omit instruction language. Each programme's official
# general-information page explicitly supplies the language used by ÖSYM.
LANGUAGE_ALIASES = {
    "program-osym-111610397": ("ALMANCA ÖĞRETMENLİĞİ", "Almanca"),
    "program-osym-111610422": ("FRANSIZCA ÖĞRETMENLİĞİ", "Fransızca"),
    "program-osym-111610449": ("İNGİLİZCE ÖĞRETMENLİĞİ", "İngilizce"),
}

FALLBACK_YEARS = {
    "program-osym-111610864": 2025,
    "program-osym-111690749": 2025,
}

EXPECTED_CONFLICTS = {
    "program-osym-111610864": ["ODAI0001"],
    "program-osym-111690749": ["ODAING01"],
    "program-osym-111610449": ["AEIO4002"],
}


def _programme(university, programme_id):
    return next((item for item in university["programs"] if item["id"] == programme_id), None)


def _unit_name(university, programme):
    return next(item["name"] for item in university["units"] if item["id"] == programme["unitId"])


def _language_value(document):
    values = []
    for row in document.select("tr"):
        cells = [clean(cell.get_text(" ", strip=True)) for cell in row.select("th,td")]
        if len(cells) >= 2 and fold(cells[0]) == "egitim dili":
            values.append(cells[1])
    return values


def _alias_reference(university, directory, programme_id, source_title, language):
    programme = _programme(university, programme_id)
    if programme is None or not programme["name"].endswith(f"({language})"):
        raise ValueError(f"IUC registry language alias changed: {programme_id}")
    unit = _unit_name(university, programme)
    items = [item for item in directory["unmatched"]
             if clean(item["title"]) == source_title and fold(item["unit"]) == fold(unit)
             and item["degree"] == programme["degreeLevel"]]
    if len(items) != 1:
        raise ValueError(f"IUC official language source is ambiguous: {programme_id}")
    item = items[0]
    page = fetch(item["programUrl"])
    document = soup(page)
    if _language_value(document) != [language]:
        raise ValueError(f"IUC instruction language changed: {programme_id}")
    course_urls = [url for url in links(document, page.get("finalUrl", page["url"]))
                   if "/home/dersprogram/" in url.lower()]
    if len(course_urls) != 1:
        raise ValueError(f"IUC curriculum route is ambiguous: {programme_id}")
    return {
        **item,
        "title": programme["name"],
        "unit": unit,
        "courseUrl": course_urls[0],
        "universityId": UID,
        "programId": programme_id,
        "name": programme["name"],
        "identityEvidenceUrl": item["programUrl"],
        "instructionLanguage": language,
    }


def _selected_url(url, year):
    parts = urlsplit(url)
    query = parse_qs(parts.query)
    query["yil"] = [str(year)]
    return urlunsplit((parts.scheme, parts.netloc, parts.path,
                       urlencode(query, doseq=True), parts.fragment))


def _source_page(reference, year):
    public_url = _selected_url(reference["courseUrl"], year)
    source = fetch(public_url)
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"IUC curriculum page fetch failed: {public_url}")
    body = (CACHE / source["file"]).read_text(encoding="utf-8-sig", errors="replace")
    matches = re.findall(r"var\s+bID\s*=\s*(\d+)", body)
    if len(set(matches)) != 1:
        raise ValueError(f"IUC official unit identity missing: {public_url}")
    model = parse_qs(urlsplit(public_url).query).get("model", [""])[0]
    return public_url, matches[0], model


def _api_response(reference, public_url, unit_id, year, model):
    payload = {"request": {
        "birimID": unit_id,
        "yil": year,
        "Language": "tr",
        "Model": model,
    }}
    source = fetch(API, payload, "application/json; charset=utf-8", retry_failed=True)
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"IUC print-curriculum request failed: {reference['programId']}")
    document = read(CACHE / source["file"])
    envelope = document.get("Object") if document.get("IsSuccess") is True else None
    if not isinstance(envelope, dict):
        raise ValueError(f"IUC print-curriculum response failed: {reference['programId']}")
    if envelope.get("AkademikYil") != year:
        raise ValueError(f"IUC curriculum year changed: {reference['programId']}")
    if fold(clean(envelope.get("DiplomaProgrami"))) != fold(clean(reference["sourceTitle"])):
        raise ValueError(f"IUC response programme identity changed: {reference['programId']}")
    if fold(clean(envelope.get("Fakulte"))) != fold(clean(reference["unit"])):
        raise ValueError(f"IUC response unit identity changed: {reference['programId']}")
    courses, conflicts = parse_iuc_print(document, course_kind)
    source.update({
        "family": "iuc-print",
        "programs": [reference],
        "publicUrl": public_url,
        "payload": payload,
        "curriculumPeriod": str(year),
    })
    return source, courses, conflicts


def _collect(reference):
    programme_id = reference["programId"]
    year = FALLBACK_YEARS.get(programme_id, CURRENT_YEAR)
    public_url, unit_id, model = _source_page(reference, year)
    source, courses, conflicts = _api_response(reference, public_url, unit_id, year, model)
    expected_conflicts = EXPECTED_CONFLICTS.get(programme_id, [])
    if len(courses) < 3 or sorted(conflicts) != expected_conflicts:
        raise ValueError(f"IUC curriculum parse changed: {programme_id}")
    selection = {
        "method": "official-print-curriculum-json",
        "academicYear": year,
        "officialUnitId": unit_id,
        "model": model or None,
        "sourceTitle": reference["sourceTitle"],
        "degree": reference["degree"],
        "excludedConflictingCourseCodes": conflicts,
    }
    if reference.get("instructionLanguage"):
        selection["instructionLanguage"] = reference["instructionLanguage"]
        selection["instructionLanguageEvidenceUrl"] = reference["identityEvidenceUrl"]
    if year != CURRENT_YEAR:
        current_url, current_unit_id, current_model = _source_page(reference, CURRENT_YEAR)
        newer, newer_courses, newer_conflicts = _api_response(
            reference, current_url, current_unit_id, CURRENT_YEAR, current_model)
        if newer_courses or newer_conflicts:
            raise ValueError(f"IUC newer curriculum is no longer empty: {programme_id}")
        selection["newerEmptyPlan"] = {
            "academicYear": CURRENT_YEAR,
            "sourceHash": newer["sha256"],
            "dataSourceUrl": newer["url"],
            "sourceRequest": newer["payload"],
        }
    source["selection"] = selection
    return source, len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    directory = next(item for item in read(CACHE / "istanbul-directories.json")
                     if item["universityId"] == UID)
    exact = {item["programId"]: item for item in directory["matched"]
             if item["programId"] in EXACT_TARGET_IDS}
    if set(exact) != EXACT_TARGET_IDS:
        raise ValueError("IUC exact target directory set changed; review before publishing")
    aliases = {
        programme_id: _alias_reference(university, directory, programme_id, *expected)
        for programme_id, expected in LANGUAGE_ALIASES.items()
    }
    references = {**exact, **aliases}
    if len(references) != 32:
        raise ValueError("IUC target programme identities are not unique")
    sources, total_courses = [], 0
    for programme_id in sorted(references):
        source, count = _collect(references[programme_id])
        sources.append(source)
        total_courses += count
        print(programme_id, count, "courses", flush=True)
    print("IUC reviewed total:", total_courses, flush=True)
    if total_courses != EXPECTED_TOTAL:
        raise ValueError("IUC reviewed course total changed; review before publishing")
    write(CACHE / "iuc-courses.json", sources)
    alias_titles = {title for title, _ in LANGUAGE_ALIASES.values()}
    write(CACHE / "iuc-directories.json", [{
        "universityId": UID,
        "matched": list(references.values()),
        "unmatched": [item for item in directory["unmatched"] if item["title"] not in alias_titles],
    }])
    print("Istanbul University-Cerrahpasa:", len(sources), "new programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
