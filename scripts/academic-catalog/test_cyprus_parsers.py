"""Offline regressions for ambiguities seen in the official source tables."""
import unittest
from parse_cyprus_courses import code, kind, merge_courses, parse_document, period
from parse_turkey_courses import course_code, heading_period
from parse_turkey_tedu_courses import parse_tedu
from collect_turkey_more_catalogs import gelisim_program_identity


def document(rows, text=''):
    return {'pages': [{'page': 1, 'text': text, 'tables': [rows]}]}


HEADER = ['Course Code', 'Course Name', 'ECTS']


class CurriculumParsing(unittest.TestCase):
    def test_only_real_unambiguous_identifiers(self):
        self.assertEqual(code('MİM 203'), 'MİM203')
        self.assertIsNone(code('TUR101 / YIT101'))
        self.assertIsNone(code('COMxxx'))

    def test_unknown_type_is_not_an_elective(self):
        self.assertIsNone(kind(''))
        self.assertIsNone(kind('Compulsory / Elective'))
        self.assertEqual(kind('Υποχρεωτικό'), 'required')
        self.assertEqual(kind('Seçmeli'), 'elective')

    def test_published_year_and_local_semester(self):
        self.assertEqual(period('4th year, 1st semester'), (7, 4))
        self.assertEqual(period('Third Year Spring Semester'), (6, 3))
        self.assertEqual(period('1st and 2nd Semester'), (None, None))
        self.assertEqual(period('Semester 1 / Semester 2'), (None, None))
        self.assertEqual(period('1. Dönem'), (1, None))

    def test_wrapped_title_is_rejoined(self):
        courses, _ = parse_document(document([HEADER, ['Semester 1', '', ''],
            ['BUS101', 'Global', '6'], ['', 'Economic Challenges', '']]))
        self.assertEqual(courses[0]['name'], 'Global Economic Challenges')
        self.assertEqual(courses[0]['semester'], 1)
        self.assertIsNone(courses[0]['kind'])

    def test_elective_pool_does_not_inherit_page_semester(self):
        courses, _ = parse_document(document([HEADER, ['Semester 8', '', ''],
            ['COM490', 'Design Project', '6'], ['Elective courses', '', ''],
            ['COM491', 'Advanced Networks', '6']], text='Semester 8'))
        self.assertIsNone(courses[1]['semester'])
        self.assertEqual(courses[1]['kind'], 'elective')

    def test_track_reset_keeps_only_shared_prefix(self):
        courses, _ = parse_document(document([HEADER, ['Semester 1', '', ''],
            ['BUS101', 'Economics', '6'], ['Semester 3', '', ''], ['BUS301', 'Track A', '6'],
            ['Semester 4', '', ''], ['BUS401', 'Track A Project', '6'],
            ['Semester 3', '', ''], ['BUS302', 'Track B', '6']]))
        self.assertEqual([c['code'] for c in courses], ['BUS101'])

    def test_summary_and_alternative_slots_are_not_courses(self):
        courses, _ = parse_document(document([HEADER,
            ['TURK132', 'Total 7 courses', '30'],
            ['ENG203', 'ENGL', '6'],
            ['EDU286', 'Free Elective Course or Natural Sciences', '6']]))
        self.assertEqual(courses, [])

    def test_ambiguous_duplicate_is_excluded(self):
        courses, conflicts = merge_courses([
            {'code': 'ADA209', 'name': 'İdari Yargı', 'semester': 3, 'kind': None},
            {'code': 'ADA209', 'name': 'Tahkim ve Arabuluculuk', 'semester': 3, 'kind': 'elective'}])
        self.assertEqual(courses, [])
        self.assertEqual(conflicts, ['ADA209'])

    def test_same_elective_offered_in_multiple_years(self):
        courses, _ = merge_courses([
            {'code': 'COM411', 'name': 'Networks', 'semester': 6, 'kind': 'elective'},
            {'code': 'COM411', 'name': 'Networks', 'semester': 7, 'kind': 'elective'}])
        self.assertIsNone(courses[0]['semester'])
        self.assertEqual(courses[0]['offeredSemesters'], [6, 7])

    def test_gelisim_mode_suffix_is_preserved_outside_program_identity(self):
        self.assertEqual(gelisim_program_identity('AŞÇILIK (NÖ - İÖ)'),
                         ('AŞÇILIK', ['NÖ', 'İÖ']))
        self.assertEqual(gelisim_program_identity('BİLGİSAYAR PROGRAMCILIĞI (İNGİLİZCE) (NÖ)'),
                         ('BİLGİSAYAR PROGRAMCILIĞI (İNGİLİZCE)', ['NÖ']))
        self.assertEqual(gelisim_program_identity('AŞÇILIK (İÖ)'), (None, ['İÖ']))
        self.assertEqual(gelisim_program_identity('PSİKOLOJİ'), ('PSİKOLOJİ', []))

    def test_tedu_tables_require_semesters_and_reject_placeholders(self):
        courses, conflicts = parse_tedu({'tables': [
            {'heading': 'Yarıyıl 1', 'rows': [
                {'code': 'ENG 101', 'title': 'Akademik İngilizce'},
                {'code': 'PSCG SEC', 'title': 'Alan Eğitimi Seçmeli'}]},
            {'heading': 'Toplam', 'rows': [{'code': 'PSCG 999', 'title': 'Toplam'}]}
        ]}, course_code, heading_period)
        self.assertEqual(courses, [
            {'code': 'ENG101', 'name': 'Akademik İngilizce', 'semester': 1, 'kind': None}])
        self.assertEqual(conflicts, [])

    def test_tedu_expands_only_explicit_alternative_codes(self):
        courses, _ = parse_tedu({'tables': [{'heading': 'Semester 2', 'rows': [
            {'code': 'TUR 101/150', 'title': 'Türkçe'},
            {'code': 'HIST 101 / HIST 150', 'title': 'Türkiye Cumhuriyeti Tarihi'},
            {'code': 'ELL 212-N', 'title': 'Kültür Çalışmaları'},
            {'code': 'TUR / ENG 101', 'title': 'Ambiguous alternative'}
        ]}]}, course_code, heading_period)
        self.assertEqual([course['code'] for course in courses],
                         ['TUR101', 'TUR150', 'HIST101', 'HIST150', 'ELL212-N'])

    def test_tedu_conflicting_duplicate_fails_closed(self):
        courses, conflicts = parse_tedu({'tables': [
            {'heading': 'Yarıyıl 1', 'rows': [{'code': 'CMPE 101', 'title': 'Bilgisayara Giriş'}]},
            {'heading': 'Yarıyıl 2', 'rows': [{'code': 'CMPE 101', 'title': 'Programlama'}]}
        ]}, course_code, heading_period)
        self.assertEqual(courses, [])
        self.assertEqual(conflicts, ['CMPE101'])


if __name__ == '__main__':
    unittest.main()
