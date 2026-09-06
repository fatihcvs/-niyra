"""Collect missing current Yaşar University plans with explicit language evidence."""
import re
from urllib.parse import parse_qs, urlparse

from discover_turkey_courses import discover_university, normal
from parse_cyprus_courses import clean
from parse_turkey_courses import parse_tables
from turkey_research import CACHE, ROOT, collect_program_pages, fetch, read, soup, write


UID = "tr-yasar-universitesi"
HOME = "https://obs.yasar.edu.tr/oibs/bologna/index.aspx"


def _identity_stem(value):
    value = normal(value)
    value = re.sub(r"\b(?:19|20)\d{2}\b|\b(?:ingilizce|30 ing|30|tc|yabanci|tr|en)\b", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _language_evidence(cur_sunit, programme, item):
    url = f"https://obs.yasar.edu.tr/oibs/bologna/progAbout.aspx?curSunit={cur_sunit}&lang=tr"
    source = fetch(url)
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Yaşar language evidence is unavailable: {url}")
    text = clean(soup(source).get_text(" ", strip=True))
    language = next(
        (clean(node.find_next().get_text(" ", strip=True)) for node in soup(source).find_all(
            string=lambda value: value and clean(value) == "Dili"
        ) if node.find_next()),
        None,
    )
    expected = "İngilizce" if "ingilizce" in normal(programme["name"]) else "%30 İngilizce"
    if language != expected:
        raise ValueError(
            f"Yaşar language identity changed for {programme['id']}: {language!r} != {expected!r}"
        )
    if expected == "%30 İngilizce" and "30 ing" not in normal(item["title"]):
        raise ValueError(f"Yaşar partial-English directory label disappeared: {item['url']}")
    if expected == "İngilizce" and not re.search(r"\bDili\s+İngilizce\b", text):
        raise ValueError(f"Yaşar English language declaration disappeared: {url}")
    return {"url": url, "hash": source["sha256"], "language": language}


def _missing_references(university, discovery):
    units = {unit["id"]: normal(unit["name"]) for unit in university["units"]}
    already = {item["programId"] for item in discovery["matched"]}
    references = []
    for item in discovery["unmatched"]:
        candidates = [programme for programme in university["programs"]
                      if programme["id"] not in already
                      and programme["degreeLevel"] == item["degree"]
                      and units[programme["unitId"]] == normal(item["unit"])
                      and _identity_stem(programme["name"]) == _identity_stem(item["title"])]
        if not candidates:
            continue
        if len(candidates) != 1:
            raise ValueError(f"Yaşar programme identity is ambiguous: {item['title']}")
        programme = candidates[0]
        cur_sunit = parse_qs(urlparse(item["url"]).query).get("curSunit", [""])[0]
        if not cur_sunit.isdigit():
            raise ValueError(f"Yaşar programme has no stable curSunit: {item['url']}")
        evidence = _language_evidence(cur_sunit, programme, item)
        references.append({
            **item,
            "title": programme["name"],
            "sourceTitle": item["title"],
            "programId": programme["id"],
            "name": programme["name"],
            "courseUrl": (
                "https://obs.yasar.edu.tr/oibs/bologna/progCourses.aspx?lang=tr&curSunit="
                + cur_sunit
            ),
            "identityEvidenceUrl": evidence["url"],
            "languageEvidence": evidence,
            "routeWitness": discovery["matched"][0]["routeWitness"],
        })
        already.add(programme["id"])
    return references


def _validate_plan(source):
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Yaşar plan fetch failed: {source['url']}")
    document = soup(source)
    selected = document.select("select option[selected]")
    if len(selected) != 1:
        raise ValueError(f"Yaşar plan selection is ambiguous: {source['url']}")
    reference = source["programs"][0]
    label = clean(selected[0].get_text(" ", strip=True))
    source_stem = _identity_stem(reference["sourceTitle"]).replace("makina", "makine")
    label_stem = _identity_stem(label).replace("makina", "makine")
    if not re.search(r"(?:^| )" + re.escape(source_stem) + r"(?: |$)", label_stem):
        raise ValueError(f"Yaşar selected plan identity changed: {source['url']}")
    courses, conflicts = parse_tables(document)
    if len(courses) < 3 or conflicts:
        raise ValueError(f"Yaşar selected plan is unreadable: {source['url']}")
    year = re.search(r"\b(?:19|20)\d{2}\b", label)
    if year is None or not str(selected[0].get("value", "")).isdigit():
        raise ValueError(f"Yaşar selected plan has no stable identity: {source['url']}")
    cur_sunit = parse_qs(urlparse(source["url"]).query).get("curSunit", [""])[0]
    source.update({
        "family": "yasar",
        "curriculumPeriod": year[0],
        "selection": {
            "method": "published-default-bologna-plan",
            "curSunit": cur_sunit,
            "planId": selected[0]["value"],
            "planLabel": label,
            "sourceTitle": reference["sourceTitle"],
            "unit": reference["unit"],
            "degree": reference["degree"],
            "language": reference["languageEvidence"]["language"],
            "languageEvidenceUrl": reference["languageEvidence"]["url"],
            "languageEvidenceHash": reference["languageEvidence"]["hash"],
        },
    })
    return len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    discovery = discover_university({
        "programs": [{"universityId": UID}],
        "catalogLinks": [[HOME, "Bologna bilgi paketi"]],
    }, university)
    if discovery.get("ambiguous"):
        raise ValueError("Yaşar directory contains ambiguous current programme identities")
    missing = _missing_references(university, discovery)
    programme_ids = {item["programId"] for item in [*discovery["matched"], *missing]}
    expected_ids = {item["id"] for item in university["programs"]}
    if programme_ids != expected_ids or len(missing) != 27:
        raise ValueError(
            "Yaşar current registry coverage is incomplete: "
            + str(sorted(expected_ids - programme_ids))
        )
    collect_program_pages([{"matched": missing}], "yasar-courses")
    sources = read(CACHE / "yasar-courses.json")
    total_courses = sum(_validate_plan(source) for source in sources)
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "yasar-courses.json", sources)
    write(CACHE / "yasar-directories.json", [{
        "universityId": UID,
        "pages": discovery["pages"],
        "matched": [*discovery["matched"], *missing],
        "unmatched": [item for item in discovery["unmatched"]
                      if item["url"] not in {value["url"] for value in missing}],
    }])
    print("Yaşar University:", len(missing), "new programmes;", total_courses,
          "course records", flush=True)


if __name__ == "__main__":
    main()
