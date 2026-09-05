"""Parse public Özyeğin SIS programme-plan snapshots captured in a browser."""
import re
from parse_cyprus_courses import clean, fold, merge_courses


def parse_ozyegin(data, course_code):
    output = []
    semester = None
    for row in data.get('rows', []):
        group = clean(row.get('group'))
        if group:
            text = fold(group)
            match = re.search(r'\b([1-6])\s*\.?\s*(?:yil|year)\b.*\b(guz|fall|bahar|spring)\b', text)
            semester = None
            if match:
                year = int(match.group(1))
                semester = 2 * year - (1 if match.group(2) in ['guz', 'fall'] else 0)
            continue
        identifier = course_code(row.get('code'))
        title = clean(row.get('title'))
        if not identifier or not 2 <= len(title) <= 200:
            continue
        output.append({'code': identifier, 'name': title, 'semester': semester, 'kind': None})
    return merge_courses(output)
