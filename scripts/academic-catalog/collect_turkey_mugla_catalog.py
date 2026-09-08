"""Collect reviewed Muğla Sıtkı Koçman University Bologna plans."""
import re
from urllib.parse import parse_qs, urlparse

from discover_turkey_courses import discover_university, normal
from parse_cyprus_courses import clean
from parse_turkey_courses import parse_tables
from turkey_research import CACHE, ROOT, collect_program_pages, fetch, read, soup, write


UID = "tr-mugla-sitki-kocman-universitesi"
HOME = "https://obs.mu.edu.tr/oibs/bologna/index.aspx"
BASE = "https://obs.mu.edu.tr/oibs/bologna/"

# Current registry programme id -> official curSunit. These are the current
# programmes that the generic discovery pass could not join because the public
# directory retains an IKMEP suffix, omits an English-language qualifier, or
# uses the degree title for Medicine/Veterinary Medicine.
TARGETS = {
    "program-osym-107610416": "361",
    "program-osym-107650672": "401",
    "program-osym-107650293": "403",
    "program-osym-107650627": "414",
    "program-osym-107650636": "415",
    "program-osym-107650699": "416",
    "program-osym-107650399": "417",
    "program-osym-107650424": "418",
    "program-osym-107650733": "413",
    "program-osym-107650681": "405",
    "program-osym-107650972": "407",
    "program-osym-107650336": "409",
    "program-osym-107650857": "410",
    "program-osym-107651273": "1670",
    "program-osym-107650645": "430",
    "program-osym-107650575": "431",
    "program-osym-107690361": "4476",
    "program-osym-107650927": "432",
    "program-osym-107650221": "394",
    "program-osym-107650787": "395",
    "program-osym-107650663": "396",
    "program-osym-107650248": "398",
    "program-osym-107650512": "425",
    "program-osym-107651034": "436",
    "program-osym-107650521": "426",
    "program-osym-107651185": "1441",
    "program-osym-107650778": "427",
    "program-osym-107651167": "1469",
    "program-osym-107650487": "423",
    "program-osym-107650839": "424",
    "program-osym-107690152": "3274",
    "program-osym-107650018": "370",
    "program-osym-107650909": "372",
    "program-osym-107650054": "375",
    "program-osym-107650063": "378",
    "program-osym-107650796": "379",
    "program-osym-107650654": "382",
    "program-osym-107650115": "383",
    "program-osym-107650954": "384",
    "program-osym-107650142": "385",
    "program-osym-107650812": "386",
    "program-osym-107650045": "374",
    "program-osym-107651307": "390",
    "program-osym-107650196": "391",
    "program-osym-107650884": "392",
    "program-osym-107650893": "393",
    "program-osym-107690198": "3596",
    "program-osym-107610364": "253",
    "program-osym-107610585": "1955",
    "program-osym-107610382": "332",
    "program-osym-107610373": "333",
    "program-osym-107690287": "4014",
    "program-osym-107610231": "173",
}

EXPECTED_UNRESOLVED = {
    "program-osym-107690290",
    "program-osym-107690291",
    "program-osym-107690292",
}


def _source_title_for(programme):
    if programme["name"] == "Tıp":
        return "Tıp Fakültesi"
    if programme["name"] == "Veteriner":
        return "Veteriner Fakültesi"
    return re.sub(r"\s*\(İngilizce\)\s*$", "", programme["name"], flags=re.I)


def _source_title_base(value):
    return re.sub(r"\s*\(\s*İKMEP\s*\)\s*$", "", value, flags=re.I).strip()


def _source_unit_for(value):
    if value == "Muğla Sağlık Hizmetleri Meslek Yüksekokulu (Marmaris)":
        return "Muğla Sağlık Hizmetleri Meslek Yüksekokulu"
    return value


def _reviewed_reference(university, discovery, programme_id, expected_cur_sunit):
    programmes = {programme["id"]: programme for programme in university["programs"]}
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    programme = programmes.get(programme_id)
    if programme is None or programme["degreeLevel"] not in {"associate", "bachelor"}:
        raise ValueError(f"Muğla registry target changed: {programme_id}")
    items = [
        item for item in [*discovery["unmatched"], *discovery["ambiguous"]]
        if parse_qs(urlparse(item["url"]).query).get("curSunit") == [expected_cur_sunit]
    ]
    if len(items) != 1:
        raise ValueError(f"Muğla source identity changed: {programme_id} / {expected_cur_sunit}")
    item = items[0]
    registry_unit = units[programme["unitId"]]
    if (item["degree"] != programme["degreeLevel"]
            or normal(_source_title_base(item["title"])) != normal(_source_title_for(programme))
            or normal(item["unit"]) != normal(_source_unit_for(registry_unit))):
        raise ValueError(
            f"Muğla reviewed alias is no longer exact: {programme_id} / "
            f"{item['unit']} / {item['title']}"
        )
    return {
        **item,
        "sourceTitle": item["title"],
        "sourceUnit": item["unit"],
        "title": programme["name"],
        "unit": registry_unit,
        "programId": programme_id,
        "name": programme["name"],
        "registryAlias": True,
        "courseUrl": f"{BASE}progCourses.aspx?lang=tr&curSunit={expected_cur_sunit}",
        "identityEvidenceUrl": f"{BASE}progAbout.aspx?lang=tr&curSunit={expected_cur_sunit}",
    }


def _validate_plan(source):
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Muğla plan fetch failed: {source['url']}")
    document = soup(source)
    selected = document.select("select option[selected]")
    if len(selected) != 1:
        raise ValueError(f"Muğla plan selection is ambiguous: {source['url']}")
    reference = source["programs"][0]
    expected_cur_sunit = TARGETS[reference["programId"]]
    actual_cur_sunit = parse_qs(urlparse(source["url"]).query).get("curSunit", [""])[0]
    label = clean(selected[0].get_text(" ", strip=True))
    if actual_cur_sunit != expected_cur_sunit or not str(selected[0].get("value", "")).isdigit():
        raise ValueError(f"Muğla selected plan identity changed: {source['url']}")
    if re.search(r"yandal|çift anadal|\baf\b|çoğaltılıyor", label, re.I):
        raise ValueError(f"Muğla selected plan is an alternative/draft: {source['url']} / {label}")
    courses, conflicts = parse_tables(document)
    if len(courses) < 3 or conflicts:
        raise ValueError(f"Muğla selected plan is unreadable: {source['url']}")

    evidence = fetch(reference["identityEvidenceUrl"], retry_failed=True)
    if evidence.get("status") != 200 or not evidence.get("sha256"):
        raise ValueError(f"Muğla programme profile fetch failed: {reference['identityEvidenceUrl']}")
    profile_text = clean(soup(evidence).get_text(" ", strip=True))
    if reference["name"].endswith("(İngilizce)") and not re.search(r"\bDili\s+İngilizce\b", profile_text, re.I):
        raise ValueError(f"Muğla English language evidence changed: {reference['programId']}")

    alias_type = "official-title-suffix"
    if reference["name"].endswith("(İngilizce)"):
        alias_type = "official-language-profile"
    elif reference["name"] in {"Tıp", "Veteriner"}:
        alias_type = "official-degree-title"
    elif reference["name"] == "Mahkeme Büro Hizmetleri":
        alias_type = "official-duplicate-draft-excluded"
    elif reference["sourceUnit"] != reference["unit"]:
        alias_type = "official-unit-location"
    source.update({
        "family": "mugla-reviewed-2026",
        "curriculumPeriod": label,
        "selection": {
            "method": "published-default-bologna-plan",
            "curSunit": actual_cur_sunit,
            "planId": selected[0]["value"],
            "planLabel": label,
            "registryAlias": True,
            "aliasType": alias_type,
            "sourceTitle": reference["sourceTitle"],
            "sourceUnit": reference["sourceUnit"],
            "registryTitle": reference["name"],
            "registryUnit": reference["unit"],
            "degree": reference["degree"],
            "identityEvidenceUrl": reference["identityEvidenceUrl"],
            "identityEvidenceHash": evidence["sha256"],
            **({
                "excludedCurSunit": "4675",
                "excludedReason": "published-plan-label-marks-clone-in-progress",
            } if reference["name"] == "Mahkeme Büro Hizmetleri" else {}),
            **({"language": "İngilizce"} if reference["name"].endswith("(İngilizce)") else {}),
        },
    })
    return len(courses)


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    if set(TARGETS) & EXPECTED_UNRESOLVED:
        raise ValueError("Muğla target and unresolved programme sets overlap")
    discovery = discover_university({
        "programs": [{"universityId": UID}],
        "catalogLinks": [[HOME, "Bologna bilgi paketi"]],
    }, university)
    references = [
        _reviewed_reference(university, discovery, programme_id, cur_sunit)
        for programme_id, cur_sunit in TARGETS.items()
    ]
    duplicate = fetch(f"{BASE}progCourses.aspx?lang=tr&curSunit=4675", retry_failed=True)
    duplicate_selected = soup(duplicate).select("select option[selected]")
    if (duplicate.get("status") != 200 or len(duplicate_selected) != 1
            or "çoğaltılıyor" not in clean(duplicate_selected[0].get_text(" ", strip=True)).casefold()):
        raise ValueError("Muğla Mahkeme Büro Hizmetleri duplicate draft evidence changed")
    collect_program_pages([{"matched": references}], "mugla-reviewed-courses")
    sources = read(CACHE / "mugla-reviewed-courses.json")
    total_courses = sum(_validate_plan(source) for source in sources)
    if len(sources) != len(TARGETS) or total_courses != 3807:
        raise ValueError("Muğla reviewed programme set changed; review before publishing")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    write(CACHE / "mugla-reviewed-courses.json", sources)
    write(CACHE / "mugla-reviewed-directories.json", [{
        "universityId": UID,
        "pages": discovery["pages"],
        "matched": references,
        "unmatched": discovery["unmatched"],
        "ambiguous": discovery["ambiguous"],
    }])
    print("Muğla Sıtkı Koçman University:", len(sources), "new programmes;",
          total_courses, "course records", flush=True)


if __name__ == "__main__":
    main()
