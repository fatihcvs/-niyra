"""Collect reviewed Düzce University programme curricula from its public EBS."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, urljoin, urlparse

from discover_turkey_courses import normal
from parse_cyprus_courses import clean
from parse_turkey_courses import course_code, course_kind
from parse_turkey_duzce_courses import parse_duzce
from turkey_research import CACHE, ROOT, UA, fetch, read, soup, write


UID = "tr-duzce-universitesi"
BASE = "https://ebs.duzce.edu.tr"
DIRECTORIES = [
    ("associate", BASE + "/tr-TR/Program/Index/1"),
    ("bachelor", BASE + "/tr-TR/Program/Index/2"),
]
TARGET_IDS = {
    "program-osym-103310176", "program-osym-103310185", "program-osym-103310361",
    "program-osym-103310494", "program-osym-103310528", "program-osym-103310573",
    "program-osym-103350096", "program-osym-103350166", "program-osym-103350184",
    "program-osym-103350193", "program-osym-103350306", "program-osym-103350342",
    "program-osym-103350351", "program-osym-103350369", "program-osym-103350387",
    "program-osym-103350396", "program-osym-103350448", "program-osym-103350457",
    "program-osym-103350518", "program-osym-103350554", "program-osym-103350703",
    "program-osym-103350757", "program-osym-103390160", "program-osym-103390166",
    "program-osym-103390168", "program-osym-103390197", "program-osym-103390202",
    "program-osym-103390223", "program-osym-103390258", "program-osym-103390265",
    "program-osym-103390272", "program-osym-103390300",
}

# These are narrow, reviewed aliases in the university's own programme tree.
# Degree and academic unit still have to match exactly after the unit alias.
PROGRAMME_ALIASES = {
    "program-osym-103310494": "Türkçe Eğitimi",
    "program-osym-103310528": "İngilizce Öğretmenliği",
    "program-osym-103350757": "Arıcılık",
    "program-osym-103390160": "Makine,Resim ve Konstrüksiyon",
    "program-osym-103390197": "İlahiyat",
}
UNIT_ALIASES = {"Meslek Yüksekokulu": "Düzce Meslek Yüksekokulu"}
EXPECTED_CONFLICTS = {
    "program-osym-103390166": {"INS327", "INS433"},
    "program-osym-103390168": {"AEM426"},
}
EXPECTED_UNREADABLE = {
    "program-osym-103390166": "official-course-code-conflict:INS327,INS433",
    "program-osym-103390223": "no-readable-curriculum",
    "program-osym-103390258": "no-readable-curriculum",
    "program-osym-103390265": "no-readable-curriculum",
}
EXPECTED_TOTAL = 2725


def _fetch_success(url):
    source = fetch(url, retry_failed=True)
    if source.get("status") != 200 or not source.get("sha256"):
        raise ValueError(f"Düzce official source is unavailable: {url} / {source}")
    return source


def _programme_title(value):
    return re.sub(r"\s*\((?:Normal|İkinci) Öğretim\)\s*$", "", clean(value), flags=re.I)


def directory_programmes(source, degree):
    programmes = []
    for link in soup(source).select('a[href*="/Bolum/OgretimProgrami/"]'):
        source_title = clean(link.get_text(" ", strip=True))
        if re.search(r"\(İkinci Öğretim\)\s*$", source_title, re.I):
            continue
        group = link.find_parent("ul", class_="unstyled")
        holder = group.find_parent("li") if group else None
        heading = holder.find("b", recursive=False) if holder else None
        if heading is None:
            raise ValueError(f"Düzce directory unit identity changed: {source['url']}")
        programmes.append({
            "title": _programme_title(source_title),
            "sourceTitle": source_title,
            "unit": clean(heading.get_text(" ", strip=True)),
            "degree": degree,
            "courseUrl": urljoin(source["url"], link["href"]),
            "directoryUrl": source["url"],
        })
    return programmes


def match_programmes(official, university):
    units = {unit["id"]: unit["name"] for unit in university["units"]}
    matched = []
    targets = {programme["id"]: programme for programme in university["programs"]
               if programme["id"] in TARGET_IDS}
    if set(targets) != TARGET_IDS:
        raise ValueError(f"Düzce target registry changed: {len(targets)} / {len(TARGET_IDS)}")
    for programme_id in sorted(targets):
        programme = targets[programme_id]
        target_title = PROGRAMME_ALIASES.get(programme_id, programme["name"])
        registry_unit = units[programme["unitId"]]
        target_unit = UNIT_ALIASES.get(registry_unit, registry_unit)
        candidates = [item for item in official
                      if item["degree"] == programme["degreeLevel"]
                      and normal(item["title"]) == normal(target_title)
                      and normal(item["unit"]) == normal(target_unit)]
        if len(candidates) != 1:
            raise ValueError(f"Düzce programme identity is not unique: {programme['name']} / {len(candidates)}")
        matched.append((programme, registry_unit, candidates[0]))
    return matched


def _curl(arguments):
    result = subprocess.run([
        "curl.exe", "--silent", "--show-error", "--fail", "--location",
        "--max-time", "35", "--user-agent", UA, *arguments,
    ], capture_output=True, text=True, errors="replace")
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"curl exited {result.returncode}")
    return result.stdout


def _selected_year_source(url, year, period):
    parsed = urlparse(url)
    teaching_id = parse_qs(parsed.query)["bot"][0]
    return_path = parsed.path + "?" + parsed.query
    payload = {
        "yilNo": year,
        "bolumOgretimTurNo": teaching_id,
        "returnURL": return_path,
    }
    identity = url + "\n" + json.dumps(payload, ensure_ascii=False, sort_keys=True)
    key = hashlib.sha256(("duzce-reviewed-2026\n" + identity).encode()).hexdigest()[:24]
    meta_path = CACHE / (key + ".meta.json")
    body_path = CACHE / (key + ".body")
    if meta_path.exists() and body_path.exists():
        cached = read(meta_path)
        if cached.get("status") == 200 and cached.get("sha256") == hashlib.sha256(body_path.read_bytes()).hexdigest():
            return cached

    cookie_path = CACHE / ("." + key + ".cookies")
    request_path = CACHE / ("." + key + ".request")
    initial_path = CACHE / ("." + key + ".initial")
    response_path = CACHE / ("." + key + ".response")
    temporary_body = CACHE / ("." + key + ".body.tmp")
    selection_url = BASE + "/tr-TR/Home/BolognaYilGuncelle"
    try:
        request_path.write_bytes(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
        _curl(["--cookie-jar", str(cookie_path), "--cookie", str(cookie_path), "--output", str(initial_path), url])
        _curl(["--cookie-jar", str(cookie_path), "--cookie", str(cookie_path),
               "--header", "Content-Type: application/json", "--data-binary", "@" + str(request_path),
               "--output", str(response_path), selection_url])
        report = _curl(["--cookie-jar", str(cookie_path), "--cookie", str(cookie_path),
                        "--output", str(temporary_body), "--write-out",
                        "%{http_code}\n%{url_effective}\n%{content_type}", url])
        status, final_url, content_type = report.split("\n", 2)
        if int(status) != 200:
            raise ValueError(f"Düzce selected year returned HTTP {status}: {url}")
        temporary_body.replace(body_path)
        result = {
            "url": url,
            "file": body_path.name,
            "status": 200,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "finalUrl": final_url,
            "contentType": content_type,
            "sha256": hashlib.sha256(body_path.read_bytes()).hexdigest(),
            "nativeTls": True,
            "publicUrl": url,
            "selectionUrl": selection_url,
            "curriculumPeriod": period,
            "selection": {"method": "official-academic-year-selector", "yilNo": year},
        }
        write(meta_path, result)
        return result
    finally:
        for path in [cookie_path, request_path, initial_path, response_path, temporary_body]:
            path.unlink(missing_ok=True)


def _selection_identity(source, expected_year=None):
    document = soup(source)
    selected_year = document.select_one("#BolognaYil option[selected]")
    selected_plan = document.select_one("#Mufredat option[selected]") or document.select_one("#Mufredat option")
    if selected_year is None or selected_plan is None or selected_plan.get("value") in [None, "0"]:
        return None
    if expected_year is not None and selected_year.get("value") != expected_year:
        raise ValueError(f"Düzce academic-year selection changed: {source['url']}")
    return {
        "academicYear": clean(selected_year.get_text(" ", strip=True)),
        "curriculumId": selected_plan.get("value"),
        "curriculumLabel": clean(selected_plan.get_text(" ", strip=True)),
    }


def collect_programme(mapping):
    programme, registry_unit, item = mapping
    current = _fetch_success(item["courseUrl"])
    courses, conflicts = parse_duzce(soup(current), course_code, course_kind)
    identity = _selection_identity(current)
    rejected = []
    current_year = soup(current).select_one("#BolognaYil option[selected]")
    current_period = clean(current_year.get_text(" ", strip=True)) if current_year else None
    if conflicts:
        expected = EXPECTED_CONFLICTS.get(programme["id"])
        if expected is None or not set(conflicts).issubset(expected):
            raise ValueError(f"Düzce unexpected current course-code conflict: {programme['name']} / {conflicts}")
        rejected.append({
            "academicYear": identity["academicYear"] if identity else current_period,
            "curriculumId": identity["curriculumId"] if identity else None,
            "conflicts": conflicts,
            "sourceHash": current["sha256"],
        })
    source = current if len(courses) >= 3 and not conflicts and identity else None
    reviewed_years = [{
        "academicYear": current_period,
        "curriculumId": identity["curriculumId"] if identity else None,
        "courseCount": len(courses),
    }]
    if source is not None:
        source = {
            **source,
            "publicUrl": item["courseUrl"],
            "curriculumPeriod": identity["academicYear"],
            "selection": {"method": "official-current-default-curriculum", **identity},
        }
    else:
        year_options = soup(current).select("#BolognaYil option")
        for option in year_options:
            year = option.get("value")
            if not year or option.has_attr("selected"):
                continue
            candidate = _selected_year_source(item["courseUrl"], year, clean(option.get_text(" ", strip=True)))
            candidate_courses, candidate_conflicts = parse_duzce(soup(candidate), course_code, course_kind)
            candidate_identity = _selection_identity(candidate, year)
            reviewed_years.append({
                "academicYear": candidate_identity["academicYear"] if candidate_identity else clean(option.get_text(" ", strip=True)),
                "curriculumId": candidate_identity["curriculumId"] if candidate_identity else None,
                "courseCount": len(candidate_courses),
            })
            if candidate_conflicts:
                expected = EXPECTED_CONFLICTS.get(programme["id"])
                if expected is None or not set(candidate_conflicts).issubset(expected):
                    raise ValueError(f"Düzce unexpected course-code conflict: {programme['name']} / {candidate_conflicts}")
                rejected.append({
                    "academicYear": candidate_identity["academicYear"] if candidate_identity else clean(option.get_text(" ", strip=True)),
                    "curriculumId": candidate_identity["curriculumId"] if candidate_identity else None,
                    "conflicts": candidate_conflicts,
                    "sourceHash": candidate["sha256"],
                })
                continue
            if len(candidate_courses) >= 3 and candidate_identity:
                courses, conflicts, identity, source = candidate_courses, candidate_conflicts, candidate_identity, candidate
                source["selection"] = {**source["selection"], **identity}
                break
    if source is None and rejected:
        found = {conflict for entry in rejected for conflict in entry["conflicts"]}
        if found != EXPECTED_CONFLICTS.get(programme["id"]):
            raise ValueError(f"Düzce reviewed conflicts changed: {programme['name']} / {sorted(found)}")
        return None, 0, {
            "programId": programme["id"],
            "name": programme["name"],
            "reason": "official-course-code-conflict:" + ",".join(sorted(found)),
            "sourceUrl": item["courseUrl"],
            "reviewedAcademicYears": rejected,
        }
    if source is None:
        return None, 0, {
            "programId": programme["id"],
            "name": programme["name"],
            "reason": "no-readable-curriculum",
            "sourceUrl": item["courseUrl"],
            "reviewedAcademicYears": reviewed_years,
        }
    if len(courses) < 3 or conflicts or identity is None:
        raise ValueError(f"Düzce selected curriculum is invalid: {programme['name']}")
    reference = {
        "universityId": UID,
        "programId": programme["id"],
        "name": programme["name"],
        "sourceTitle": item["sourceTitle"],
        "title": programme["name"],
        "degree": programme["degreeLevel"],
        "unit": registry_unit,
        "sourceUnit": item["unit"],
        "directoryUrl": item["directoryUrl"],
        "identityEvidenceUrl": item["directoryUrl"],
    }
    if programme["id"] in PROGRAMME_ALIASES:
        reference["reviewedAlias"] = PROGRAMME_ALIASES[programme["id"]]
    selection = {
        **source["selection"],
        "sourceTitle": item["sourceTitle"],
        "sourceUnit": item["unit"],
    }
    if rejected:
        selection["skippedConflictingAcademicYears"] = rejected
    return {
        **source,
        "programs": [reference],
        "family": "duzce-reviewed-2026",
        "publicUrl": item["courseUrl"],
        "selection": selection,
    }, len(courses), None


def main():
    university = read(ROOT / "data/academic-catalog-2026.json")["universities"][UID]
    if len(university["programs"]) != 111:
        raise ValueError(f"Düzce programme registry changed: {len(university['programs'])}")
    directory_sources = [(_fetch_success(url), degree) for degree, url in DIRECTORIES]
    official = [programme for source, degree in directory_sources
                for programme in directory_programmes(source, degree)]
    mappings = match_programmes(official, university)
    with ThreadPoolExecutor(max_workers=2) as pool:
        collected = list(pool.map(collect_programme, mappings))
    sources = [source for source, _count, _unreadable in collected if source is not None]
    unreadable = [entry for _source, _count, entry in collected if entry is not None]
    total_courses = sum(count for _source, count, _unreadable in collected)
    unreadable_reasons = {entry["programId"]: entry["reason"] for entry in unreadable}
    if (len(sources) != 28 or total_courses != EXPECTED_TOTAL
            or unreadable_reasons != EXPECTED_UNREADABLE):
        raise ValueError(f"Düzce reviewed source set changed: {len(sources)} / {total_courses} courses / unreadable {unreadable_reasons}")
    sources.sort(key=lambda value: value["programs"][0]["programId"])
    mapping_by_id = {programme["id"]: (programme, registry_unit, item)
                     for programme, registry_unit, item in mappings}
    unreadable_sources = []
    for entry in unreadable:
        programme, registry_unit, item = mapping_by_id[entry["programId"]]
        unreadable_sources.append({
            **_fetch_success(item["courseUrl"]),
            "programs": [{
                "universityId": UID,
                "programId": programme["id"],
                "name": programme["name"],
                "sourceTitle": item["sourceTitle"],
                "title": programme["name"],
                "degree": programme["degreeLevel"],
                "unit": registry_unit,
                "sourceUnit": item["unit"],
                "directoryUrl": item["directoryUrl"],
                "identityEvidenceUrl": item["directoryUrl"],
            }],
            "family": "duzce-reviewed-2026",
            "publicUrl": item["courseUrl"],
            "selectionError": entry["reason"],
            "selection": {
                "method": "reviewed-unreadable-official-curricula",
                "sourceTitle": item["sourceTitle"],
                "sourceUnit": item["unit"],
                "reviewedAcademicYears": entry["reviewedAcademicYears"],
            },
        })
    write(CACHE / "duzce-reviewed-courses.json", sorted(
        sources + unreadable_sources,
        key=lambda value: value["programs"][0]["programId"],
    ))
    write(CACHE / "duzce-reviewed-directories.json", [{
        "universityId": UID,
        "pages": [source for source, _degree in directory_sources],
        "matched": [source["programs"][0] for source in sources],
        "unmatched": [],
        "unreadable": unreadable,
    }])
    current = sum(source["selection"]["method"] == "official-current-default-curriculum" for source in sources)
    print("Düzce University:", len(sources), "new programmes;", total_courses,
          "course records; current:", current, "previous year:", len(sources) - current,
          "unreadable:", len(unreadable), flush=True)
    for entry in unreadable:
        print("unreadable", entry["programId"], entry["name"], entry["reason"], flush=True)


if __name__ == "__main__":
    main()
