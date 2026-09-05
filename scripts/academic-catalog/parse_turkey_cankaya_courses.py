"""Parse one selected Çankaya curriculum and only its published elective pools."""
from parse_cyprus_courses import clean, fold, merge_courses


def semester(row):
    year, term = str(row[3]).strip(), str(row[4]).strip()
    if year in ['1', '2', '3', '4', '5', '6'] and term in ['1', '2']:
        return (int(year) - 1) * 2 + int(term)
    return None


def parse_cankaya(data, course_code):
    if not isinstance(data, dict) or not isinstance(data.get('curriculum'), dict):
        return [], []
    plan = str(data['curriculum'].get('id', ''))
    output, issues, parents = [], [], set()
    for row in data.get('courses', []):
        if not isinstance(row, list) or len(row) < 14 or str(row[0]) != plan:
            issues.append('course-from-another-curriculum')
            continue
        prefix = str(row[5]).strip()
        if prefix == 'ELEC':
            parents.add(tuple(str(v) for v in row))
            continue
        code = course_code(prefix + str(row[6]))
        name = clean(str(row[7] or ''))
        if not code or not 2 <= len(name) <= 200 or prefix.startswith('ELEC'):
            continue
        kind = 'elective' if fold(str(row[3])) == 'secmeli dersler' else 'required'
        output.append({'code': code, 'name': name, 'semester': semester(row), 'kind': kind})
    for group in data.get('groups', []):
        parent = group.get('parent', [])
        if tuple(str(v) for v in parent) not in parents:
            issues.append('elective-pool-without-matching-parent')
            continue
        for member in group.get('courses', []):
            if str(member.get('MufredatNo')) != plan or str(member.get('BolumKodu')) != str(parent[1]):
                issues.append('elective-member-from-another-pool')
                continue
            code = course_code(str(member.get('DersKod') or ''))
            name = clean(str(member.get('DersAdıTurkce') or ''))
            if code and 2 <= len(name) <= 200:
                output.append({'code': code, 'name': name, 'semester': semester(parent), 'kind': 'elective'})
    courses, conflicts = merge_courses(output)
    return courses, issues + conflicts
