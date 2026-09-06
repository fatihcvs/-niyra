"""Offline regressions for ambiguities seen in the official source tables."""
import unittest
from bs4 import BeautifulSoup
from parse_cyprus_courses import code, kind, merge_courses, parse_document, period
from parse_turkey_courses import course_code, heading_period
from parse_turkey_tedu_courses import parse_tedu
from collect_turkey_more_catalogs import gelisim_program_identity
from parse_turkey_esogu_courses import parse_esogu_tables, _parse_all_tables
from collect_turkey_web_curricula import ogu_program_identity
from parse_turkey_iau_courses import parse_iau
from collect_turkey_thk_catalog import _identity_stem
from collect_turkey_yasar_catalog import _identity_stem as yasar_identity_stem


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

    def test_esogu_reads_only_programme_plan_tables(self):
        courses, conflicts = parse_esogu_tables([
            [['YIL'], ['Ders Kodu', 'Ders Adı', 'AKTS', 'D+U+L', 'Z/S', 'Dili'],
             ['Güz Dönemi'], ['İŞL 101', 'İşletmeye Giriş', '5', '3+0+0', 'Z', 'Türkçe'],
             ['', 'SOSYAL SEÇMELİ I', '2', '2+0+0', 'S', 'Türkçe'],
             ['Bahar Dönemi'], ['İŞL 102', 'Muhasebe', '5', '3+0+0', 'S', 'Türkçe']],
            [['DERSİN KODU', 'İŞL 101', 'DERSİN ADI', 'İşletmeye Giriş']]
        ], course_code, lambda value: {'Z':'required','S':'elective'}.get(value))
        self.assertEqual(courses, [
            {'code':'İŞL101','name':'İşletmeye Giriş','semester':1,'kind':'required'},
            {'code':'İŞL102','name':'Muhasebe','semester':2,'kind':'elective'}])
        self.assertEqual(conflicts, [])

    def test_esogu_recovers_explicit_course_forms_when_summary_is_absent(self):
        courses, conflicts = _parse_all_tables([
            [['DERSİN KODU', '171911017', 'DERSİN ADI', 'Çocuk Sağlığı ve İlk Yardım']],
            [['YARIYIL', 'HAFTALIK DERS SAATİ', 'DERSİN'],
             ['', 'Teorik', 'Uygulama', 'Laboratuar', 'Kredisi', 'AKTS', 'TÜRÜ', 'DİLİ'],
             ['I', '2', '0', '0', '2', '3', 'ZORUNLU (✕) SEÇMELİ ( )', 'Türkçe']]
        ], course_code, lambda value: None)
        self.assertEqual(courses, [{
            'code':'171911017','name':'Çocuk Sağlığı ve İlk Yardım','semester':1,'kind':'required'}])
        self.assertEqual(conflicts, [])

    def test_esogu_current_identity_evidence_preserves_language_and_unit(self):
        self.assertEqual(ogu_program_identity('Uçak Mühendisliği','Mühendislik-Mimarlık Fakültesi'),
                         ('Uçak Mühendisliği (İngilizce)','Mühendislik-Mimarlık Fakültesi',True))
        self.assertEqual(ogu_program_identity('Atçılık ve Antrenörlüğü Programı','Mahmudiye Meslek Yüksekokulu'),
                         ('Atçılık ve Antrenörlüğü Programı','Mahmudiye Atçılık Meslek Yüksekokulu',True))
        self.assertEqual(ogu_program_identity('Makine Programı','Sivrihisar Meslek Yüksekokulu'),
                         ('Makine Programı','Sivrihisar Meslek Yüksekokulu',False))

    def test_esogu_reads_separate_semester_and_annual_plan_tables(self):
        courses, conflicts = parse_esogu_tables([
            [['Birinci Yarıyıl'], ['Ders Kodu','Dersin Adı','T','U','AKTS'],
             ['251611001','Botanik','2','2','4']],
            [['1. SINIF'], ['Kodu','Ders Adı','AKTS','T','U','Z/S','DİLİ'],
             ['111011012','Temel Tıp Bilimlerine Giriş','42','15','7','Z','TÜRKÇE']]
        ], course_code, lambda value: {'Z':'required'}.get(value))
        self.assertEqual(courses, [
            {'code':'251611001','name':'Botanik','semester':1,'kind':None},
            {'code':'111011012','name':'Temel Tıp Bilimlerine Giriş','semester':None,'kind':'required','year':1}])
        self.assertEqual(conflicts, [])

    def test_iau_reads_semester_tables_and_real_elective_pool_rows(self):
        document = BeautifulSoup('''
            <table class="list">
              <tr><td>2. Sinif Guz Donemi Dersleri</td></tr>
              <tr><td></td><td>ID</td><td>Kodu</td><td>Ders Adi</td><td>Dersin Turu</td></tr>
              <tr><td></td><td>11985</td><td>ELK231</td><td>Elektrik Enerjisi</td><td>Zorunlu</td></tr>
            </table>
            <table id="SanalSecmeli_2x1">
              <tr><td></td><td>0001</td><td>BLMSEC</td><td></td><td>Bolum Secmeli</td></tr>
              <tr><td></td><td>91932</td><td>ELK253</td><td>Pnomatik Sistemler</td><td>Bolum Secmeli</td></tr>
            </table>
        ''', 'html.parser')
        courses, conflicts = parse_iau(document, course_code, heading_period)
        self.assertEqual(courses, [
            {'code':'ELK231','name':'Elektrik Enerjisi','semester':3,'kind':'required'},
            {'code':'ELK253','name':'Pnomatik Sistemler','semester':3,'kind':'elective'}])
        self.assertEqual(conflicts, [])

    def test_iau_preserves_annual_plan_year(self):
        document = BeautifulSoup('''
            <table class="list">
              <tr><td>1. Sinif Dersleri</td></tr>
              <tr><td></td><td>ID</td><td>Kodu</td><td>Ders Adi</td><td>Dersin Turu</td></tr>
              <tr><td></td><td>12163</td><td>DHF105</td><td>Deontoloji ve Etik</td><td>Zorunlu</td></tr>
            </table>
            <table id="SanalSecmeli_1x0">
              <tr><td></td><td>77055</td><td>DHF281</td><td>Genetik</td><td>Bolum Secmeli</td></tr>
            </table>
        ''', 'html.parser')
        courses, conflicts = parse_iau(document, course_code, heading_period)
        self.assertEqual(courses, [
            {'code':'DHF105','name':'Deontoloji ve Etik','semester':None,'kind':'required','year':1},
            {'code':'DHF281','name':'Genetik','semester':None,'kind':'elective','year':1}])
        self.assertEqual(conflicts, [])

    def test_thk_selected_plan_identity_ignores_only_explicit_plan_qualifiers(self):
        self.assertEqual(_identity_stem('2024 (Bilgisayar Mühendisliği (2024) (TC))'),
                         _identity_stem('Bilgisayar Mühendisliği (İngilizce)'))
        self.assertNotEqual(_identity_stem('Uçak Mühendisliği (2024) (TC)'),
                            _identity_stem('Uzay Mühendisliği'))

    def test_yasar_identity_keeps_programme_name_while_separating_language(self):
        self.assertEqual(yasar_identity_stem('Hukuk %30 İng'), yasar_identity_stem('Hukuk'))
        self.assertEqual(yasar_identity_stem('Bilgisayar Mühendisliği'),
                         yasar_identity_stem('Bilgisayar Mühendisliği (İngilizce)'))
        self.assertNotEqual(yasar_identity_stem('Bilgisayar Mühendisliği'),
                            yasar_identity_stem('Yazılım Mühendisliği (İngilizce)'))


if __name__ == '__main__':
    unittest.main()
