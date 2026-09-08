"""Parse Ahmet Yesevi University's multilingual reviewed study plans."""
from collections import Counter
from difflib import SequenceMatcher
import re
from statistics import median
from zipfile import ZipFile

from lxml import etree

from parse_cyprus_courses import clean, fold, merge_courses


WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
LATIN = "A-Za-zÇĞİÖŞÜçğıöşü"
CODE_RE = re.compile(
    rf"[{LATIN}][{LATIN}()/.+_-]{{0,18}}(?:\s+[{LATIN}()/.+_-]{{1,5}})?\s*"
    r"\d{2,5}(?:\s*[,;/]\s*\d{2,5})?"
)


def _normalized_code(value):
    value = clean(value).upper()
    value = re.sub(r"\s+", "", value)
    value = re.sub(r"/{3,}", "//", value)
    value = value.strip(".,;:/+-")
    # A few multilingual rows concatenate four language-specific prefixes.
    # The final prefix belongs to the displayed Latin/English course title and
    # keeps the official numeric range within the catalogue's 20-character key.
    if len(value) > 20 and "/" in value:
        final = re.search(rf"([{LATIN}]{{1,8}}\d{{2,5}}(?:[,;/]\d{{2,5}})?)$", value)
        if final:
            value = final.group(1)
    if (not 3 <= len(value) <= 36
            or not re.fullmatch(
                rf"[{LATIN}][{LATIN}0-9()/.+_-]{{0,28}}\d{{2,5}}(?:[,;/]\d{{2,5}})?",
                value,
            )):
        return None
    return value


def _code_matches(value):
    matches = []
    for match in CODE_RE.finditer(clean(value)):
        code = _normalized_code(match.group())
        if code and code not in matches:
            matches.append(code)
    return matches


def _signature(code):
    return tuple(re.findall(r"\d{2,5}", code))


def _display_name(paragraphs):
    values = [clean(value) for value in paragraphs if clean(value)]
    if not values:
        return ""
    value = values[-1]
    if len(values) == 1 and "/" in value:
        parts = [clean(part) for part in re.split(r"\s*/\s*", value) if clean(part)]
        if parts:
            value = parts[-1]
    return value[:200].strip(" /,;")


def _best_latin_name(parts):
    """Prefer the published Turkish/English label over Cyrillic renderings."""
    candidates = []
    for top, value in parts:
        for segment in re.split(r"[\u0400-\u052f\u2de0-\u2dff\ua640-\ua69f]+", value):
            segment = clean(segment).strip(" /,;-–")
            if len(re.findall(rf"[{LATIN}]", segment)) >= 3:
                candidates.append((top, segment))
    if not candidates:
        return clean(" ".join(value for _, value in parts)).strip(" /,;")[:200]
    def score(item):
        value = fold(item[1])
        penalty = 120 if re.search(
            r"(?:component of choice|secmeli bilesen|zorunlu bilesen|profil olusturma disiplinleri|cycle of|temel disiplin)",
            value,
        ) else 0
        return len(item[1]) - penalty

    best_index = max(range(len(candidates)), key=lambda index: score(candidates[index]))
    top, value = candidates[best_index]
    if best_index + 1 < len(candidates):
        next_top, continuation = candidates[best_index + 1]
        continuation_folded = fold(continuation)
        if (next_top - top <= 14 and len(value) + len(continuation) < 200
                and not re.search(
                    r"(?:component of choice|secmeli bilesen|profil olusturma|cycle of|temel disiplin)",
                    continuation_folded,
                )):
            value = value + " " + continuation
    return clean(value).strip(" /,;")[:200]


def _kind(value):
    compact = re.sub(r"\s+", "", clean(value)).upper()
    if any(marker in compact for marker in (
            "ТК/SB", "TK/SB", "ТКSB", "TKSB", "КВ/СС", "KB/CC", "КВСС", "KBCC", "SM", "EM")):
        return "elective"
    if any(marker in compact for marker in (
            "МК/ZB", "MK/ZB", "МКZB", "MKZB", "ОК/RC", "OK/RC", "ОКRC", "OKRC",
            "ЖК/ÜS", "JK/ÜS", "ЖКÜS", "JKÜS", "ВК/UC", "BK/UC", "ВКUC", "BKUC")):
        return "required"
    return None


def _record(code, name, semesters, kind):
    if not code or not 2 <= len(name) <= 200 or not semesters:
        return None
    semesters = sorted(set(semester for semester in semesters if 1 <= semester <= 12))
    if not semesters:
        return None
    result = {
        "code": code,
        "name": name,
        "semester": semesters[0] if len(semesters) == 1 else None,
        "kind": kind,
    }
    if len(semesters) > 1:
        result["offeredSemesters"] = semesters
    return result


def _merge(courses):
    """Merge repeated plan appearances when extraction differs only by wrapping."""
    names = {}
    for course in courses:
        names.setdefault(course["code"], []).append(course["name"])
    replacements = {}
    for code, values in names.items():
        distinct = list(dict.fromkeys(values))
        if len(distinct) < 2:
            continue
        related = [course for course in courses if course["code"] == code]
        periods = {
            (course.get("semester"), tuple(course.get("offeredSemesters", [])), course.get("kind"))
            for course in related
        }
        if len(periods) == 1:
            replacements[code] = max(distinct, key=len)
            continue
        folded = [fold(value) for value in distinct]
        if all(any(
                left == right or left in right or right in left
                or SequenceMatcher(None, left, right).ratio() >= .72
                for right in folded if right != left
        ) for left in folded):
            replacements[code] = max(distinct, key=len)
    normalized = [{**course, "name": replacements.get(course["code"], course["name"])}
                  for course in courses]
    return merge_courses(normalized)


def _cell_paragraphs(cell):
    values = []
    for paragraph in cell.findall("./" + WORD_NS + "p"):
        value = clean("".join(paragraph.itertext()))
        if value:
            values.append(value)
    return values


def parse_ayu_docx(path):
    """Read the final Basic Education Plan table from AYU's DOCX programmes."""
    with ZipFile(path) as archive:
        document = etree.fromstring(archive.read("word/document.xml"))
    tables = document.findall(".//" + WORD_NS + "tbl")
    if not tables:
        return [], ["missing-basic-education-plan"]
    table = tables[-1]
    rows = table.findall("./" + WORD_NS + "tr")
    if len(rows) < 10:
        return [], ["missing-basic-education-plan"]

    courses = []
    for row in rows:
        cells = row.findall("./" + WORD_NS + "tc")
        if len(cells) != 20:
            continue
        code_values = _cell_paragraphs(cells[1])
        title_values = _cell_paragraphs(cells[2])
        codes = [code for value in code_values for code in _code_matches(value)]
        if not codes:
            continue
        signatures = Counter(_signature(code) for code in codes)
        repeated = {signature for signature, count in signatures.items() if count >= 2}
        if repeated:
            codes = [code for code in codes if _signature(code) in repeated]
        name = _display_name(title_values)
        semesters = [number for number, cell in enumerate(cells[10:18], 1)
                     if re.search(r"\d", clean("".join(cell.itertext())))]
        kind = _kind(" ".join("".join(cells[index].itertext()) for index in (5,)))
        if not semesters:
            continue
        ordered = []
        for code in codes:
            signature = _signature(code)
            if signature not in ordered:
                ordered.append(signature)
        for signature in ordered:
            chosen = next(code for code in reversed(codes) if _signature(code) == signature)
            record = _record(chosen, name, semesters, kind)
            if record:
                courses.append(record)
    return _merge(courses)


def parse_ayu_turtep(document):
    """Read explicit semester tables on AYU's Turkish distance programmes."""
    courses = []
    for table in document.select("table"):
        semester = None
        for row in table.select("tr"):
            cells = [clean(cell.get_text(" ", strip=True)) for cell in row.select("th,td")]
            if not cells:
                continue
            match = re.search(r"\bDönem\s*:\s*([1-8])\b", " ".join(cells), re.I)
            if match:
                semester = int(match.group(1))
                continue
            if semester is None or len(cells) < 2:
                continue
            code = _normalized_code(cells[0])
            name = cells[1]
            if not code or not 2 <= len(name) <= 200:
                continue
            kind_text = fold(cells[3]) if len(cells) > 3 else ""
            kind = ("required" if kind_text == "zorunlu"
                    else "elective" if kind_text == "secmeli" else None)
            courses.append({"code": code, "name": name, "semester": semester, "kind": kind})
    return _merge(courses)


def _lines(page):
    grouped = []
    for word in sorted(page.extract_words(x_tolerance=1, y_tolerance=2),
                       key=lambda value: (value["top"], value["x0"])):
        line = next((candidate for candidate in reversed(grouped[-4:])
                     if abs(candidate[0]["top"] - word["top"]) <= 2.4), None)
        if line is None:
            line = []
            grouped.append(line)
        line.append(word)
    return [sorted(line, key=lambda value: value["x0"]) for line in grouped]


def _line_code_candidates(line, width):
    values = []
    for start in range(len(line)):
        if line[start]["x0"] > width * 0.31:
            break
        for count in (1, 2, 3):
            words = line[start:start + count]
            if len(words) != count:
                continue
            raw = " ".join(word["text"] for word in words)
            code = _normalized_code(raw)
            if code:
                values.append({
                    "code": code,
                    "x0": words[0]["x0"],
                    "x1": words[-1]["x1"],
                })
    return values


def _cluster(values, tolerance=8):
    groups = []
    for value in sorted(values):
        if not groups or value - median(groups[-1]) > tolerance:
            groups.append([value])
        else:
            groups[-1].append(value)
    return groups


def _roman_centres(lines, first_code_top, minimum_x, width, expected):
    xs = []
    for line in lines:
        top = median(word["top"] for word in line)
        if top >= first_code_top:
            continue
        for word in line:
            value = re.sub(r"\s+", "", word["text"]).upper()
            if (minimum_x < word["x0"] < width - 85
                    and re.fullmatch(r"(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)", value)):
                xs.append((word["x0"] + word["x1"]) / 2)
    clusters = _cluster(xs, 9)
    centres = [median(group) for group in clusters]
    # A horizontal Roman label can be emitted as several adjacent glyphs.
    centres = [median(group) for group in _cluster(centres, 11)]
    if len(centres) < expected:
        return []
    # The semester centres form the longest regular sequence in the header.
    best = []
    for start in range(len(centres)):
        candidate = [centres[start]]
        for value in centres[start + 1:]:
            if 13 <= value - candidate[-1] <= 28:
                candidate.append(value)
            if len(candidate) == expected:
                break
        if len(candidate) > len(best):
            best = candidate
    return best[:expected] if len(best) >= expected else centres[-expected:]


def _page_candidates(page, page_number):
    lines = _lines(page)
    raw = []
    for line in lines:
        options = _line_code_candidates(line, page.width)
        if not options:
            continue
        for option in options:
            raw.append({**option, "top": median(word["top"] for word in line),
                        "line": line, "page": page_number})
    return lines, raw


def parse_ayu_pdf(path, expected_semesters=8):
    """Read AYU's landscape multilingual PDF plan using its printed columns."""
    import pdfplumber

    pages = []
    with pdfplumber.open(path) as document:
        # AYU appends the study-plan table to the approved programme file. Read
        # backwards through the bounded appendix instead of decoding every
        # narrative page in documents that can exceed eighty pages.
        lower_bound = max(-1, len(document.pages) - 25)
        for number in range(len(document.pages) - 1, lower_bound, -1):
            page = document.pages[number]
            text = fold(page.extract_text() or "")
            if "basic education plan" in text or "temel egitim plani" in text:
                pages.append(number)
        if not pages:
            return [], ["missing-basic-education-plan"]
        start = min(pages)
        all_lines = []
        raw_candidates = []
        page_lines = {}
        for number in range(start, len(document.pages)):
            lines, candidates = _page_candidates(document.pages[number], number)
            page_lines[number] = lines
            all_lines.extend(lines)
            raw_candidates.extend(candidates)

        if not raw_candidates:
            return [], ["missing-course-codes"]
        x_groups = _cluster([candidate["x0"] for candidate in raw_candidates], 12)
        code_x = median(max(x_groups, key=len))
        candidates = [candidate for candidate in raw_candidates
                      if abs(candidate["x0"] - code_x) <= 22]
        # A few approved tables wrap a long multilingual prefix onto one line
        # and its numeric suffix onto the next. Rejoin only inside the detected
        # code column so the adjacent title can never become an identifier.
        for page_number, lines in page_lines.items():
            for line_index, line in enumerate(lines[:-1]):
                top = median(word["top"] for word in line)
                if any(candidate["page"] == page_number and abs(candidate["top"] - top) <= 2.5
                       for candidate in candidates):
                    continue
                prefix_words = [word for word in line
                                if code_x - 4 <= word["x0"] < code_x + 78]
                next_line = lines[line_index + 1]
                next_top = median(word["top"] for word in next_line)
                suffix_words = [word for word in next_line
                                if code_x - 4 <= word["x0"] < code_x + 78]
                prefix = "".join(word["text"] for word in prefix_words)
                suffix = "".join(word["text"] for word in suffix_words)
                code = _normalized_code(prefix + suffix)
                if (code and next_top - top <= 14 and re.search(rf"[{LATIN}]", prefix)
                        and not re.search(r"\d", prefix) and re.fullmatch(r"[\d,;/ ]+", suffix)):
                    candidates.append({
                        "code": code,
                        "x0": prefix_words[0]["x0"],
                        "x1": suffix_words[-1]["x1"],
                        "top": top,
                        "line": line,
                        "page": page_number,
                    })
        candidates.sort(key=lambda value: (value["page"], value["top"], value["x0"]))
        if not candidates:
            return [], ["missing-course-codes"]

        title_starts = []
        for candidate in candidates:
            after = [word for word in candidate["line"]
                     if code_x + 55 <= word["x0"] < document.pages[candidate["page"]].width * .52]
            if after:
                title_starts.append(after[0]["x0"])
        if not title_starts:
            return [], ["missing-course-titles"]
        title_x = median(max(_cluster(title_starts, 12), key=len))

        numeric_x = []
        for line in all_lines:
            for word in line:
                if (title_x + 115 < word["x0"] < title_x + 270
                        and re.fullmatch(r"(?:[1-9]|[12]\d)", word["text"])):
                    numeric_x.append(word["x0"])
        numeric_groups = [group for group in _cluster(numeric_x, 8) if len(group) >= 3]
        if not numeric_groups:
            return [], ["missing-credit-column"]
        credit_x = median(max(numeric_groups, key=lambda group: (len(group), -median(group))))

        first = candidates[0]
        centres = _roman_centres(
            page_lines[first["page"]], first["top"], credit_x + 100,
            document.pages[first["page"]].width, expected_semesters,
        )
        if len(centres) != expected_semesters:
            return [], ["missing-semester-columns"]

        # Collapse overlapping candidate sequences on the same printed line.
        unique = []
        for candidate in candidates:
            if (unique and candidate["page"] == unique[-1]["page"]
                    and abs(candidate["top"] - unique[-1]["top"]) <= 2.5):
                if len(candidate["code"]) > len(unique[-1]["code"]):
                    unique[-1] = candidate
            else:
                unique.append(candidate)
        candidates = unique

        courses = []
        by_page = {}
        for candidate in candidates:
            by_page.setdefault(candidate["page"], []).append(candidate)
        for page_number, page_candidates in by_page.items():
            lines = page_lines[page_number]
            credit_events = []
            for line in lines:
                top = median(word["top"] for word in line)
                if any(abs(word["x0"] - credit_x) <= 10
                       and re.fullmatch(r"(?:[1-9]|[12]\d)", word["text"])
                       for word in line):
                    nearest = min(
                        range(len(page_candidates)),
                        key=lambda position: abs(page_candidates[position]["top"] - top),
                    )
                    if abs(page_candidates[nearest]["top"] - top) <= 22:
                        start_position = nearest
                        signature = _signature(page_candidates[nearest]["code"])
                        while (start_position > 0
                               and signature == _signature(page_candidates[start_position - 1]["code"])
                               and page_candidates[start_position]["top"] - page_candidates[start_position - 1]["top"] < 20):
                            start_position -= 1
                        credit_events.append((start_position, top))
            starts = []
            for position, event_top in sorted(credit_events):
                if not starts or position != starts[-1][0]:
                    starts.append((position, event_top))
            for block_index, (start_position, event_top) in enumerate(starts):
                end_position = starts[block_index + 1][0] if block_index + 1 < len(starts) else len(page_candidates)
                block = page_candidates[start_position:end_position]
                if not block:
                    continue
                top = block[0]["top"] - 4
                bottom = (page_candidates[end_position]["top"] - 2
                          if end_position < len(page_candidates) else block[-1]["top"] + 16)
                relevant = [line for line in lines
                            if top <= median(word["top"] for word in line) <= bottom]

                signature_counts = Counter(_signature(candidate["code"]) for candidate in block)
                repeated = {signature for signature, count in signature_counts.items() if count >= 2}
                signatures = []
                for candidate in block:
                    signature = _signature(candidate["code"])
                    if repeated and signature not in repeated:
                        continue
                    if signature not in signatures:
                        signatures.append(signature)

                semesters = []
                for semester, centre in enumerate(centres, 1):
                    if any(abs(((word["x0"] + word["x1"]) / 2) - centre) <= 9
                           and re.fullmatch(r"\d+(?:[.,]\d+)?", word["text"])
                           for line in relevant for word in line):
                        semesters.append(semester)
                component_text = " ".join(
                    word["text"] for line in relevant for word in line
                    if credit_x + 28 < word["x0"] < centres[0] - 18
                )
                kind = _kind(component_text)

                for signature in signatures:
                    matching = [candidate for candidate in block
                                if _signature(candidate["code"]) == signature]
                    chosen = matching[-1]
                    code = chosen["code"]
                    name_anchor = (block[0] if len(signatures) == 1 else chosen)
                    following = ([] if len(signatures) == 1 else [
                        candidate["top"] for candidate in block
                        if candidate["top"] > name_anchor["top"] + 2.5
                    ])
                    name_bottom = min(following) - 2 if following else bottom
                    name_parts = []
                    last_top = name_anchor["top"]
                    for line in relevant:
                        line_top = median(word["top"] for word in line)
                        if line_top < name_anchor["top"] - 2.5 or line_top > name_bottom:
                            continue
                        part = " ".join(word["text"] for word in line
                                        if title_x - 4 <= word["x0"] < credit_x - 5)
                        if part and (not name_parts or line_top - last_top <= 14):
                            name_parts.append((line_top, part))
                            last_top = line_top
                    name = _best_latin_name(name_parts)
                    record = _record(code, name, semesters, kind)
                    if record:
                        courses.append(record)
    return _merge(courses)
