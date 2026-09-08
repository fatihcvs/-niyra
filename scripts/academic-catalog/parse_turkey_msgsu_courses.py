"""Parse reviewed Mimar Sinan Fine Arts University curricula.

The university publishes two kinds of official records: compact teaching-plan
tables and multi-page course-information forms.  This adapter keeps those
formats separate so a term is recorded only when the source states the full
semester (or both class and season).
"""
import re

from parse_cyprus_courses import clean, fold, merge_courses


ROMAN = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6,
    "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12,
}


def _semester(value):
    value = fold(value)
    explicit = re.search(r"\b(1[0-2]|[1-9])\s*\.?\s*yariyil\b", value)
    if explicit:
        return int(explicit.group(1))
    class_number = re.search(r"\b([1-6])\s*\.?\s*sinif\b", value)
    if class_number and re.search(r"\bguz\b", value):
        return int(class_number.group(1)) * 2 - 1
    if class_number and re.search(r"\bbahar\b", value):
        return int(class_number.group(1)) * 2
    stripped = clean(value).upper().strip(" ./-")
    if stripped.isdigit() and 1 <= int(stripped) <= 12:
        return int(stripped)
    return ROMAN.get(stripped)


def _codes(value, course_code):
    result = []
    for candidate in re.split(r"[\n,;/]+", clean(value)):
        code = course_code(candidate)
        if code and code not in result:
            result.append(code)
    return result


def _title(value):
    value = clean(value)
    value = re.sub(r"\s*\(\*+\)\s*", " ", value)
    value = re.sub(r"\s*\(Yeni\)\s*$", "", value, flags=re.I)
    value = re.sub(r"\s*\*+$", "", value)
    return clean(value).strip(" /-")


def _canonical_title(code, title):
    """Resolve two labels that the same current plan assigns to one code."""
    if code == "ETB455":
        return "Değişim Programı Öğrencileri İçin Endüstriyel Tasarım Proje"
    if code in {"MYG101", "MYG102", "MYG103", "MYG104",
                "MYG201", "MYG202", "MYG203", "MYG204"}:
        return re.sub(r"\s*-?\s*[AB]$", "", title)
    return title


def _header_mapping(row, require_name=True):
    values = [fold(cell or "") for cell in row]
    code = next((index for index, value in enumerate(values)
                 if (value == "kodu" or re.search(r"\b(?:dersin|ders)\s*kodu\b", value))
                 and "eski" not in value and "birim" not in value), None)
    name = next((index for index, value in enumerate(values)
                 if re.search(r"\b(?:dersin|ders)\s*adi(?:\b|\s+ve)", value)
                 and "ingilizce" not in value), None)
    if code is None or (require_name and name is None):
        return None
    return {
        "code": code,
        "name": name,
        "kind": next((index for index, value in enumerate(values)
                      if "zorunlu" in value or "dersin turu" in value), None),
        "status": next((index for index, value in enumerate(values)
                        if "dersin durumu" in value), None),
        "period": next((index for index, value in enumerate(values)
                        if "donemi" in value or "yariyili" in value), None),
        "class": next((index for index, value in enumerate(values)
                       if value in {"sinifi", "sinif"}), None),
    }


def parse_msgsu_plan_pdf(path, course_code, course_kind, page_count=None):
    """Read explicit class/term teaching-plan tables and current course pools."""
    import pdfplumber

    courses = []
    with pdfplumber.open(path) as document:
        pages = document.pages[:page_count] if page_count else document.pages
        for page in pages:
            page_text = page.extract_text() or ""
            page_semester = _semester(page_text[:500])
            for table in page.extract_tables():
                mapping = None
                semester = page_semester
                kind = None
                for row in table:
                    values = [clean(cell or "") for cell in row]
                    joined = " ".join(value for value in values if value)
                    row_semester = _semester(joined)
                    if row_semester:
                        semester = row_semester
                    normalized = fold(joined)
                    if re.search(r"\b(?:serbest\s+)?secmeli ders", normalized):
                        kind = "elective"
                    elif re.search(r"\b(?:ortak\s+)?zorunlu ders", normalized):
                        kind = "required"
                    header = _header_mapping(row)
                    if header:
                        mapping = header
                        continue
                    if not mapping or max(mapping["code"], mapping["name"]) >= len(values):
                        continue
                    title = _title(values[mapping["name"]])
                    if (not 2 <= len(title) <= 200
                            or re.search(r"\bkapali\b|\bcourse is closed\b", fold(title))
                            or re.search(r"^(?:toplam|secmeli ders|dersin adi)", fold(title))):
                        continue
                    status_index = mapping["status"]
                    if status_index is not None and status_index < len(values):
                        status = fold(values[status_index])
                        if status in {"k", "kapali", "closed"}:
                            continue
                    row_kind = kind
                    kind_index = mapping["kind"]
                    if kind_index is not None and kind_index < len(values):
                        row_kind = course_kind(values[kind_index]) or row_kind
                    row_semester = semester
                    period_index = mapping["period"]
                    if period_index is not None and period_index < len(values):
                        row_semester = _semester(values[period_index]) or row_semester
                    class_index = mapping["class"]
                    if (row_semester is None and class_index is not None
                            and class_index < len(values) and period_index is not None
                            and period_index < len(values)):
                        row_semester = _semester(
                            f"{values[class_index]} sınıf {values[period_index]}"
                        )
                    for code in _codes(values[mapping["code"]], course_code):
                        courses.append({
                            "code": code, "name": _canonical_title(code, title),
                            "semester": row_semester, "kind": row_kind,
                        })
    return merge_courses(courses)


def _name_from_rows(rows, header_number, mapping, values):
    if mapping.get("name") is not None and mapping["name"] < len(values):
        title = _title(values[mapping["name"]])
        if title:
            return title
    for row in reversed(rows[:header_number]):
        cells = [clean(cell or "") for cell in row]
        for index, cell in enumerate(cells):
            label = fold(cell)
            if re.match(r"^dersin adi(?:\s*/.*)?$", label):
                candidates = [value for value in cells[index + 1:] if value]
                if candidates:
                    return _title(candidates[0].split(" / ", 1)[0])
            match = re.match(r"^dersin adi\s*/\s*(.+)$", cell, re.I)
            if match and "ingilizce adı" not in fold(match.group(1)):
                return _title(match.group(1).split(" / ", 1)[0])
    return ""


def _parse_form_tables(page, course_code, course_kind):
    courses = []
    for table in page.extract_tables():
        for number, row in enumerate(table[:-1]):
            mapping = _header_mapping(row, require_name=False)
            if not mapping:
                continue
            for data_row in table[number + 1:number + 5]:
                values = [clean(cell or "") for cell in data_row]
                if mapping["code"] >= len(values):
                    continue
                codes = _codes(values[mapping["code"]], course_code)
                if not codes:
                    continue
                title = _name_from_rows(table, number, mapping, values)
                if not 2 <= len(title) <= 200:
                    break
                period = (values[mapping["period"]]
                          if mapping["period"] is not None and mapping["period"] < len(values) else "")
                class_value = (values[mapping["class"]]
                               if mapping["class"] is not None and mapping["class"] < len(values) else "")
                semester = _semester(period)
                if semester is None and class_value:
                    semester = _semester(f"{class_value} sınıf {period}")
                kind_value = (values[mapping["kind"]]
                              if mapping["kind"] is not None and mapping["kind"] < len(values) else "")
                for code in codes:
                    courses.append({
                        "code": code, "name": _canonical_title(code, title),
                        "semester": semester, "kind": course_kind(kind_value),
                    })
                break
    return courses


def _parse_form_text(page_text, course_code, course_kind):
    """Fallback for older or malformed borderless undergraduate forms."""
    top = page_text[:1800]
    normalized = fold(top)
    if ("yuksek lisans" in normalized
            or not re.search(r"(?:on\s+)?lisans\s+ders\s+(?:bilgi|tanitim)\s+formu", normalized)):
        return []
    lines = [clean(line) for line in page_text.splitlines() if clean(line)]
    title = ""
    for number, line in enumerate(lines[:18]):
        if fold(line).startswith("dersin adi"):
            value = re.sub(r"^Dersin Adı\s*/?\s*", "", line, flags=re.I)
            if value.strip(" /-") and fold(value) not in {"dersin ingilizce adi", ""}:
                title = value.split(" / ", 1)[0]
            elif number + 1 < len(lines):
                title = lines[number + 1].split(" / ", 1)[0]
            break
    title = _title(title)
    if not 2 <= len(title) <= 200:
        return []
    header = next((number for number, line in enumerate(lines[:24])
                   if "kodu" in fold(line) and "donemi" in fold(line)), None)
    if header is None or header + 1 >= len(lines):
        return []
    match = None
    for values in lines[header + 1:header + 5]:
        match = re.match(r"([A-Za-zÇĞİÖŞÜçğıöşü]+\s*\d{2,4}[A-Za-z]?)\s+"
                         r"(Güz|Bahar|I{1,3}|IV|VI{0,3}|IX|X(?:I{0,2})?|[1-9])\b\s*"
                         r"([^\d]{0,45})", values, re.I)
        if match:
            break
    if not match:
        return []
    code = course_code(match.group(1))
    if not code:
        return []
    return [{
        "code": code, "name": title, "semester": _semester(match.group(2)),
        "kind": course_kind(clean(match.group(3)).split()[0] if match.group(3) else ""),
    }]


def parse_msgsu_forms_pdf(path, course_code, course_kind):
    """Read one official course-information header from each form."""
    import pdfplumber

    courses = []
    with pdfplumber.open(path) as document:
        for page in document.pages:
            page_text = page.extract_text() or ""
            normalized = fold(page_text[:2200])
            if any(marker in normalized for marker in (
                    "yuksek lisans", "doktora", "lisansustu", "graduate course")):
                continue
            page_courses = (_parse_form_tables(page, course_code, course_kind)
                            if "kodu" in normalized and "dersin adi" in normalized else [])
            if not page_courses:
                page_courses = _parse_form_text(page_text, course_code, course_kind)
            courses.extend(page_courses)
    return merge_courses(courses)


def parse_msgsu_forms_bundle(data, cache, course_code, course_kind):
    """Union complementary official Güz/Bahar form books for one programme."""
    courses = []
    conflicts = []
    for source in data.get("sources", []):
        parsed, source_conflicts = parse_msgsu_forms_pdf(
            cache / source["file"], course_code, course_kind
        )
        courses.extend(parsed)
        conflicts.extend(source_conflicts)
    merged, merge_conflicts = merge_courses(courses)
    return merged, list(dict.fromkeys(conflicts + merge_conflicts))


def _bullet_courses(value, semester, kind, course_code):
    courses = []
    matches = list(re.finditer(r"(?:^|\n)\s*[•]\s*([A-ZÇĞİÖŞÜ]{2,8}\s*\d{2,4})\s+", value))
    for number, match in enumerate(matches):
        end = matches[number + 1].start() if number + 1 < len(matches) else len(value)
        code = course_code(match.group(1))
        title = clean(value[match.end():end])
        title = re.sub(r"\s*(?:IÇINDEKILERE DON|İÇİNDEKİLERE DÖN).*", "", title, flags=re.I)
        if code and 2 <= len(title) <= 200:
            courses.append({"code": code, "name": title, "semester": semester, "kind": kind})
    return courses


def parse_msgsu_sociology_pdf(path, course_code):
    """Read the explicit 2025-2026 undergraduate plan from its two-column spread."""
    import pdfplumber

    courses = []
    with pdfplumber.open(path) as document:
        # Published PDF pages 27-29 contain the complete undergraduate plan.
        left_27 = document.pages[26].crop((0, 0, document.pages[26].width / 2, document.pages[26].height)).extract_text() or ""
        right_27 = document.pages[26].crop((document.pages[26].width / 2, 0, document.pages[26].width, document.pages[26].height)).extract_text() or ""
        pieces = re.split(r"\b2\.\s*SI", left_27, maxsplit=1)
        courses += _bullet_courses(pieces[0], 1, "required", course_code)
        if len(pieces) == 2:
            courses += _bullet_courses(pieces[1], 3, "required", course_code)
        split_at = right_27.rfind("BAHAR DÖNEMİ")
        courses += _bullet_courses(right_27[:split_at], 2, "required", course_code)
        courses += _bullet_courses(right_27[split_at:], 4, "required", course_code)

        page_28 = document.pages[27]
        left_28 = page_28.crop((0, 0, page_28.width / 2, page_28.height)).extract_text() or ""
        right_28 = page_28.crop((page_28.width / 2, 0, page_28.width, page_28.height)).extract_text() or ""
        pieces = re.split(r"\b4\.\s*SI", left_28, maxsplit=1)
        courses += _bullet_courses(pieces[0], 5, "required", course_code)
        if len(pieces) == 2:
            required, *elective = re.split(
                r"BÖLÜM İÇİ SEÇMELİ DERSLER", pieces[1], maxsplit=1
            )
            courses += _bullet_courses(required, 7, "required", course_code)
            if elective:
                courses += _bullet_courses(elective[0], None, "elective", course_code)
        split_at = right_28.rfind("BAHAR DÖNEMİ")
        courses += _bullet_courses(right_28[:split_at], 6, "required", course_code)
        courses += _bullet_courses(right_28[split_at:], None, "elective", course_code)
        # The required fourth-year spring block ends immediately before the
        # second Bahar heading; its two courses are assigned explicitly.
        for course in courses:
            if course["code"] in {"SOS402", "SOS499"}:
                course["semester"] = 8

        page_29 = document.pages[28]
        for start, end in [(0, page_29.width / 2), (page_29.width / 2, page_29.width)]:
            value = page_29.crop((start, 0, end, page_29.height)).extract_text() or ""
            courses += _bullet_courses(value, None, "elective", course_code)
    title_fixes = {
        "INK01": "Atatürk İlke ve İnkılapları Tarihi I",
        "INK02": "Atatürk İlke ve İnkılapları Tarihi II",
        "SOS356": "Gençlik Sosyolojisi",
        "SOS359": "Çocuk ve Çocukluk Sosyolojisi",
        "SOS432": "Metin Analizleri II",
    }
    courses = [{**course, "name": title_fixes.get(course["code"], course["name"])}
               for course in courses]
    return merge_courses(courses)


def parse_msgsu_digital_bundle(data, cache, course_code, course_kind):
    """Read the five class pages and separate elective page of Digital Game Design."""
    from bs4 import BeautifulSoup

    courses = []
    for source in data.get("sources", []):
        body = (cache / source["file"]).read_bytes()
        document = BeautifulSoup(body, "html.parser")
        heading = clean(document.get_text(" ", strip=True)[:600])
        default_semester = _semester(heading)
        default_kind = "elective" if "secmeli-dersler" in source.get("url", "") else None
        table_semesters = source.get("tableSemesters", [])
        table_kinds = source.get("tableKinds", [])
        for table_number, table in enumerate(document.select("table")):
            semester = (table_semesters[table_number]
                        if table_number < len(table_semesters) else default_semester)
            mapping = None
            current_kind = (table_kinds[table_number]
                            if table_number < len(table_kinds) else default_kind)
            for row in table.select("tr"):
                values = [clean(cell.get_text(" ", strip=True)) for cell in row.select("th,td")]
                if not values:
                    continue
                joined = " ".join(values)
                row_semester = _semester(joined)
                if row_semester:
                    semester = row_semester
                if "secmeli" in fold(joined):
                    current_kind = "elective"
                elif "zorunlu" in fold(joined):
                    current_kind = "required"
                header = _header_mapping(values)
                if header:
                    mapping = header
                    continue
                if not mapping or max(mapping["code"], mapping["name"]) >= len(values):
                    continue
                code = course_code(values[mapping["code"]])
                title = _title(values[mapping["name"]])
                if code and 2 <= len(title) <= 200:
                    courses.append({
                        "code": code, "name": title, "semester": semester,
                        "kind": current_kind,
                    })
    return merge_courses(courses)
