"""Small independent regression fixtures for official curriculum table families."""
import sys
from pathlib import Path
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/academic-catalog'))
from bs4 import BeautifulSoup
from parse_turkey_courses import parse_tables, _parse_source, course_code, course_kind, heading_period
from parse_turkey_late_courses import parse_baskent, parse_erciyes, parse_subu, parse_igdir
from discover_turkey_courses import match
from collect_turkey_ecatalogs import discover,leaf_programme_title
from parse_turkey_kion_courses import parse_kion
from curriculum_metadata import selected_oibs_curriculum, retain_matching_metadata

def html(value): return BeautifulSoup(value,'html.parser')

class CourseParsers(unittest.TestCase):
    def test_ebp_leaf_names_preserve_programme_subject_language_and_evening_track(self):
        cases=[('Elektrik ve Enerji Bölümü','Elektrik','Elektrik'),
          ('Bilgisayar Programcılığı','Bilgisayar Programcılığı (İÖ)','Bilgisayar Programcılığı (İÖ)'),
          ('Tarih (İ.Ö.)','Tarih','Tarih (İ.Ö.)'),
          ('Tıp Fakültesi','Tıp','Tıp'),
          ('İktisat','Lisans (İngilizce)','İktisat (İngilizce)'),
          ('Bilgisayar Programcılığı','Önlisans (Uzaktan Öğretim)','Bilgisayar Programcılığı (Uzaktan Öğretim)'),
          ('Tıp','Lisans ve Yüksek Lisans','Tıp')]
        for parent,leaf,expected in cases:self.assertEqual(leaf_programme_title(parent,leaf),expected)
        self.assertNotEqual(leaf_programme_title('Hemşirelik','Lisans Tamamlama'),'Hemşirelik')

    def test_kion_grid_keeps_explicit_terms_and_alphabetic_internships(self):
        doc=html('''<table id="Content_Content_gridCoursePlan_DXMainTable">
          <tr id="grid_DXHeadersRow0"><td></td><td>Dönem</td><td>Ders Kodu</td><td>Ders Adi</td><td>Ders Tipi</td></tr>
          <tr id="grid_DXDataRow0"><td></td><td>8</td><td>BLMIMEI</td><td>İŞLETMEDE MESLEKİ EĞİTİM</td><td>Zorunlu</td></tr>
          <tr id="grid_DXDataRow1"><td></td><td>3</td><td>US002</td><td>ÜNİVERSİTE SEÇMELİ DERS II</td><td>Seçmeli</td></tr>
          <tr id="grid_DXDataRow2"><td></td><td>0</td><td>ENG001</td><td>Hazırlık</td><td>Zorunlu</td></tr>
          <tr id="grid_DXDataRow3"><td></td><td>2</td><td>TRA103</td><td>Kültürlerarası İletişim</td><td>Seçmeli</td></tr></table>''')
        rows,_=parse_kion(doc,course_code,course_kind)
        self.assertEqual(rows,[{'code':'BLMIMEI','name':'İŞLETMEDE MESLEKİ EĞİTİM','semester':8,'kind':'required'},
          {'code':'TRA103','name':'Kültürlerarası İletişim','semester':2,'kind':'elective'}])

    def test_curriculum_label_tracks_the_selected_response_not_a_shared_url(self):
        body='''<select id="unrelated"><option selected>Old label</option></select>
          <select name="cmbYillar" id="cmbYillar"><option value="99">2017 (Old plan)</option>
          <option selected="selected" value="11761">2021 (2021 SINIF YENİ MÜFREDAT)</option></select>'''
        self.assertEqual(selected_oibs_curriculum(body),{'curriculumPeriod':'2021 (2021 SINIF YENİ MÜFREDAT)','sourceSelection':{'cmbYillar':'11761'}})
        old={'sourceHash':'old','sourceUrl':'https://example.edu.tr/plan','curriculumPeriod':'2017'}
        changed={'sourceHash':'new','sourceUrl':old['sourceUrl']}
        self.assertNotIn('curriculumPeriod',retain_matching_metadata(changed,old))
        self.assertEqual(retain_matching_metadata({'sourceHash':'old'},old)['curriculumPeriod'],'2017')

    def test_curriculum_selector_without_one_explicit_selection_is_unknown(self):
        for body in ['<select id="cmbYillar"><option>2026</option></select>',
          '<select id="cmbYillar"><option selected value="1">2025</option><option selected value="2">2026</option></select>']:
            self.assertIsNone(selected_oibs_curriculum(body))

    def test_source_course_codes_keep_curriculum_years_and_numeric_subcourses(self):
        for value in ['BS198-2020','AİİT101-2020','BLP101-2024','4905.020221','4905.030221.1']:
            self.assertEqual(course_code(value),value)
        for value in ['2025-2026','1. Yarıyıl','4905.020221.1.2','BS198-hello','<script>']:
            self.assertIsNone(course_code(value))
        rows,_=parse_tables(html('''<table><tr><td>2.Yarıyıl Ders Planı</td></tr>
          <tr><th>Ders Kodu</th><th>Ders Adı</th><th>Zorunlu/Seçmeli</th></tr>
          <tr><td>BS198-2020</td><td>Yabancı Dil II</td><td>Zorunlu</td></tr>
          <tr><td>4905.030221</td><td>BÖLÜM SEÇMELİ 1</td><td>Seçmeli</td></tr>
          <tr><td>4905.030221.1</td><td>ÇEVRE BİLİMİ</td><td>Seçmeli</td></tr></table>'''))
        self.assertEqual(rows,[{'code':'BS198-2020','name':'Yabancı Dil II','semester':2,'kind':'required'},
          {'code':'4905.030221.1','name':'ÇEVRE BİLİMİ','semester':2,'kind':'elective'}])

    def test_igdir_resource_labels_keep_real_codes_and_types(self):
        doc=html('''<table><tr><td>1. [Donem]</td></tr><tr><th>[DersKodu]</th><th>[DersAdi]</th><th>[DersTuru]</th></tr>
          <tr><td>ATA101</td><td>ATATÜRK İLKELERİ I</td><td>[Zorunlu]</td></tr></table>''')
        rows,_=parse_igdir(doc,parse_tables)
        self.assertEqual(rows,[{'code':'ATA101','name':'ATATÜRK İLKELERİ I','semester':1,'kind':'required'}])

    def test_subu_keeps_active_courses_and_excludes_group_placeholders(self):
        row={'birimKodu':'ELM','dersKodu':'101','dersAd':'Mühendisliğe Giriş','yariyilTuru':'1. Yarıyıl',
          'dersTuru':'Zorunlu Ders','ogretimPlaniDersDurumTuru':'Aktif'}
        data=[{'planListe':[row,{**row,'dersKodu':'999','dersTuru':'Seçmeli Ders Grubu'},
          {**row,'dersKodu':'102','silindimi':True}]}]
        rows,_=parse_subu(data,course_code,course_kind,heading_period)
        self.assertEqual(rows,[{'code':'ELM101','name':'Mühendisliğe Giriş','semester':1,'kind':'required'}])

    def test_baskent_written_periods_and_separate_elective_pool(self):
        doc=html('''<table><tr><th class="baslik" colspan="3">Birinci Yarıyıl (Güz)</th></tr>
          <tr><td>CSE110</td><td>INTRODUCTION TO COMPUTER ENGINEERING</td><td></td><td>2</td><td>0</td><td>2</td><td>4</td></tr>
          <tr><th class="baslik" colspan="3">Seçmeli Dersler</th></tr>
          <tr><td>CSE440</td><td>COMPUTER VISION</td><td></td><td>3</td><td>0</td><td>3</td><td>5</td></tr>
          <tr><td>SEC401</td><td>Seçmeli Ders 1</td><td></td><td>3</td><td>0</td><td>3</td><td>5</td></tr></table>''')
        rows,_=parse_baskent(doc,course_code)
        self.assertEqual([(c['code'],c['semester'],c['kind']) for c in rows],[('CSE110',1,None),('CSE440',None,'elective')])

    def test_erciyes_semester_heading_and_explicit_course_type(self):
        doc=html('''<nav>5. Yarıyıl Ders Planı</nav><table class="my-table88">
          <tr><td>BM301</td><td>İşletim Sistemleri</td><td>Zorunlu</td><td>3+0</td><td>3</td><td>5</td></tr></table>''')
        rows,_=parse_erciyes(doc,course_code,course_kind,heading_period)
        self.assertEqual(rows,[{'code':'BM301','name':'İşletim Sistemleri','semester':5,'kind':'required'}])

    def test_programme_scoped_ubys_response_accepts_one_reencrypted_plan_but_rejects_multiple(self):
        course={'Code':'CENG301','Name':'İşletim Sistemleri'}
        plan={'EncryptedId':'new-id','IsApproved':True,'IsActiveForBologna':True,
          'CurriculumCources':[{'Course':course,'SemesterNo':5,'IsActiveForBologna':True}]}
        source={'status':200,'url':'https://example.edu.tr/SearchCurriculumDetail','file':'fixture',
          'family':'ubys','payload':{'curIdStr':'old-id'}}
        with patch('parse_turkey_courses.read',return_value={'CurriculumDetails':[plan]}):
            rows,errors=_parse_source(source)
            self.assertEqual(rows,[{'code':'CENG301','name':'İşletim Sistemleri','semester':5,'kind':None}])
            self.assertEqual(errors,[])
        with patch('parse_turkey_courses.read',return_value={'CurriculumDetails':[plan,{**plan,'EncryptedId':'another-id'}]}):
            rows,errors=_parse_source(source)
            self.assertEqual(rows,[])
            self.assertEqual(errors,['unresolved-current-curriculum'])

    def test_ebp_direct_programme_leaves_do_not_inherit_faculty_name(self):
        root='https://example.edu.tr/DereceProgramlari/1'
        doc=html('<script>var options={"url":"/DereceProgramlari/GetJson/1?lang=tr-TR"}</script>')
        tree=[{'text':'Mühendislik Fakültesi','children':[
          {'text':'Bilgisayar Mühendisliği','a_attr':{'href':'/DereceProgramlari/Detay/1/1'}},
          {'text':'Elektrik Mühendisliği','children':[{'text':'Normal Öğretim (İngilizce)','a_attr':{'href':'/DereceProgramlari/Detay/1/2'}}]},
        ]}]
        university={'units':[{'id':'u','name':'Mühendislik Fakültesi'}], 'programs':[
          {'id':'p1','unitId':'u','degreeLevel':'bachelor','name':'Bilgisayar Mühendisliği'},
          {'id':'p2','unitId':'u','degreeLevel':'bachelor','name':'Elektrik Mühendisliği (İngilizce)'},
        ]}
        with patch('collect_turkey_ecatalogs.fetch',return_value={'status':200,'url':root,'file':'fixture'}), patch('collect_turkey_ecatalogs.soup',return_value=doc), patch('collect_turkey_ecatalogs.read',return_value=tree):
            result=discover('test',root,university)
            self.assertEqual([p['name'] for p in result['matched']],['Bilgisayar Mühendisliği','Elektrik Mühendisliği (İngilizce)'])

    def test_oibs_semesters_and_real_elective_rows(self):
        rows,_=parse_tables(html('''<table><tr><td colspan="6">5.Yarıyıl Ders Planı</td></tr>
          <tr><th></th><th>Ders Kodu</th><th>Ders Adı</th><th>Zorunlu/Seçmeli</th></tr>
          <tr><td></td><td>BLG 301</td><td>İşletim Sistemleri</td><td>Zorunlu</td></tr>
          <tr><td></td><td>BLG 399</td><td>Dağıtık Sistemler</td><td>Seçmeli</td></tr>
          <tr><td></td><td>SEC 301</td><td>Seçmeli Ders 1</td><td>Seçmeli</td></tr></table>'''))
        self.assertEqual([(r['code'],r['semester'],r['kind']) for r in rows],[('BLG301',5,'required'),('BLG399',5,'elective')])

    def test_annual_medical_curriculum_does_not_invent_a_semester(self):
        rows,_=parse_tables(html('''<table><tr><td>3. Yıl:</td></tr>
          <tr><th>Dönem</th><th>Ders Kodu</th><th>Ders Adı</th><th>Ders Türü</th></tr>
          <tr><td>H</td><td>TIP3001</td><td>Organ Sistemleri</td><td>BLOK</td></tr></table>'''))
        self.assertEqual(rows,[{'code':'TIP3001','name':'Organ Sistemleri','semester':None,'year':3,'kind':None}])

    def test_repeated_code_keeps_published_periods_and_conflicting_titles_are_excluded(self):
        rows,conflicts= parse_tables(html('''<table>
          <tr><th>Ders Kodu</th><th>Ders Adı</th></tr><tr><td>1. Dönem</td></tr>
          <tr><td>ENG101</td><td>Akademik İngilizce</td></tr><tr><td>BLG101</td><td>Programlama</td></tr>
          <tr><td>2. Dönem</td></tr><tr><td>ENG101</td><td>Akademik İngilizce</td></tr>
          <tr><td>BLG101</td><td>Fizik</td></tr></table>'''))
        self.assertEqual(conflicts,['BLG101']);self.assertEqual(rows[0]['offeredSemesters'],[1,2]);self.assertIsNone(rows[0]['semester'])

    def test_bilkent_excludes_minor_and_graduate_programmes(self):
        rows,_=parse_tables(html('''<h2>UNDERGRADUATE PROGRAM</h2><h4>THIRD YEAR</h4><h4>Autumn Semester</h4>
          <table><tr><th>Code</th><th>Course Name</th></tr><tr><td>CS 301</td><td>Algorithms</td></tr></table>
          <h2>MINOR PROGRAM</h2><table><tr><th>Code</th><th>Course Name</th></tr><tr><td>CS 499</td><td>Minor Project</td></tr></table>'''),'bilkent')
        self.assertEqual([r['code'] for r in rows],['CS301']);self.assertEqual(rows[0]['semester'],5)

    def test_exact_programme_matching_respects_unit_language_and_degree(self):
        university={'units':[{'id':'a','name':'Mühendislik Fakültesi'},{'id':'b','name':'Teknoloji Fakültesi'}],
          'programs':[{'id':'p','name':'Bilgisayar Mühendisliği (İngilizce)','unitId':'a','degreeLevel':'bachelor'}]}
        item={'title':'Bilgisayar Mühendisliği (İngilizce)','unit':'Mühendislik Fakültesi','degree':'bachelor'}
        self.assertEqual(match(university,item)['id'],'p')
        for change in [{'unit':'Teknoloji Fakültesi'},{'degree':'associate'},{'title':'Bilgisayar Mühendisliği'}]:self.assertIsNone(match(university,{**item,**change}))

    def test_numeric_course_codes_are_retained_only_as_course_identifiers(self):
        self.assertEqual(course_code('1001001012008'),'1001001012008')
        for value in ['2026','1.Yarıyıl','Elective','XXX']:self.assertIsNone(course_code(value))

    def test_nested_elective_tables_do_not_hide_main_courses_or_duplicate_rows(self):
        rows,_=parse_tables(html('''<table><tr><td>3. Dönem</td></tr><tr><th>Kodu</th><th>Ders</th><th>Tür</th></tr>
          <tr><td>M201</td><td>Matematik</td><td>Zorunlu</td></tr>
          <tr><td colspan="3"><h4>Seçmeli Dersler</h4><table><tr><th>Kodu</th><th>Ders</th><th>Tür</th></tr>
          <tr><td>EL299</td><td>Proje</td><td>Seçmeli</td></tr></table></td></tr>
          <tr><td>F201</td><td>Fizik</td><td>Zorunlu</td></tr></table>'''))
        self.assertEqual({r['code'] for r in rows},{'M201','F201','EL299'})
        self.assertEqual(next(r['semester'] for r in rows if r['code']=='F201'),3)

    def test_course_name_inside_a_layout_table_is_retained(self):
        rows,_=parse_tables(html('''<table><tr><td>1. Sınıf Bahar Dönemi (2. Yarıyıl)</td></tr>
          <tr><th>Ders Kodu</th><th>Ders Adı</th><th>Ders Türü</th></tr>
          <tr><td>BLM-102</td><td><table><tr><td><a>Programlama II</a></td><td></td></tr></table></td><td>Zorunlu</td></tr></table>'''))
        self.assertEqual(rows,[{'code':'BLM-102','name':'Programlama II','semester':2,'kind':'required'}])

    def test_year_tab_and_roman_elective_heading_supply_explicit_semesters(self):
        rows,_=parse_tables(html('''<a href="#year3">3. Sınıf</a><div class="tab-pane" id="year3"><table>
          <tr><td>Güz Yarıyılı Dersleri</td></tr><tr><th>Ders Kodu</th><th>Ders Adı</th><th>Ders Tipi</th></tr>
          <tr><td>BM301</td><td>İşletim Sistemleri</td><td>Zorunlu Ders</td></tr>
          <tr><td>VI. YARIYIL TEKNİK SEÇMELİ DERSLERİ</td></tr>
          <tr><td>BM306</td><td>Veri Madenciliği</td><td>Seçmeli Ders</td></tr></table></div>'''),'ohu')
        self.assertEqual([(r['semester'],r['kind']) for r in rows],[(5,'required'),(6,'elective')])

    def test_public_json_handles_nullable_pools_and_preserves_annual_years(self):
        value={'Data':{'MufredatDersler':[{'yariYil':3,'dersgruplari':None,'dersler':[
          {'j_dersKodu':'TIP300','j_dersAdi':'Klinik Bilimler','j_yillikYariyillikAdi':'Yıllık','sinif':3,'j_dersGrubuTuruAdi':'Zorunlu'}]},
          {'yariYil':4,'dersler':None,'dersgruplari':[{'sure':4,'j_dersGrubuTuruAdi':'Seçmeli','dersGruplariDersleri':[
            {'j_derskodu':'MED240','j_ders':'Tıp Tarihi'}]}]}]}}
        with patch('parse_turkey_courses.read',return_value=value):
            rows,_=_parse_source({'status':200,'url':'https://example.edu.tr/curriculum','family':'erdogan','file':'fixture.json'})
        self.assertEqual(rows,[{'code':'TIP300','name':'Klinik Bilimler','semester':None,'year':3,'kind':'required'},
          {'code':'MED240','name':'Tıp Tarihi','semester':4,'kind':'elective'}])

    def test_ktu_elective_pool_does_not_erase_following_spring_year(self):
        from parse_turkey_late_courses import parse_ktu
        from parse_turkey_courses import course_kind,heading_period
        rows,_=parse_ktu(html('''<table id="bilgehan"><tr><td>2. Yıl</td></tr>
          <tr><td>Güz Dönemi</td></tr>
          <tr><td><a href="course.aspx?dbid=1">YZT2001</a></td><td>Programlama I</td><td>5</td><td>3+2</td><td>Zorunlu</td><td>Türkçe</td></tr>
          <tr><td>Seçmeli Dersler</td></tr>
          <tr><td><a href="course.aspx?dbid=2">YZT2099</a></td><td>Robotik</td><td>5</td><td>3+2</td><td>Seçmeli</td><td>Türkçe</td></tr>
          <tr><td>Bahar Dönemi</td></tr>
          <tr><td><a href="course.aspx?dbid=3">YZT2002</a></td><td>Programlama II</td><td>5</td><td>3+2</td><td>Zorunlu</td><td>Türkçe</td></tr></table>'''),course_code,course_kind,heading_period)
        self.assertEqual([(r['semester'],r['kind']) for r in rows],[(3,'required'),(None,'elective'),(4,'required')])

    def test_bilgi_class_year_and_term_are_combined_and_group_rows_excluded(self):
        from parse_turkey_late_courses import parse_bilgi
        from parse_turkey_courses import course_kind
        rows,_=parse_bilgi(html('''<div><label>Sınıf : 3 | Dönem : 2 - Yazılım Geliştirme</label></div>
          <table><tbody>
          <tr><td><a href="/Course/Detail?catalog_courseId=1">YZG 302</a></td><td>İşletim Sistemleri</td><td>Zorunlu</td><td>3+2</td><td>6</td></tr>
          <tr><td>.........</td><td>YZG Seçmeli Listesi</td><td>Seçmeli</td><td>0+0</td><td>6</td></tr>
          <tr><td><a href="/Course/Detail?catalog_courseId=2">YZG 399</a></td><td>Robotik</td><td>Seçmeli</td><td>3+0</td><td>6</td></tr>
          </tbody></table>
          <div>Seçmeli Dersler</div><table><tbody><tr><td><a href="/Course/Detail?catalog_courseId=3">YZG 499</a></td><td>Belirsiz dönem</td><td>Seçmeli</td><td>3+0</td><td>6</td></tr></tbody></table>'''),course_code,course_kind)
        self.assertEqual([(r['code'],r['semester'],r['kind']) for r in rows],[('YZG302',6,'required'),('YZG399',6,'elective')])

    def test_afsu_retains_nested_electives_and_annual_courses(self):
        from parse_turkey_late_courses import parse_afsu
        rows,_=parse_afsu([{'sinif':'S3','yariYil':None,'ders':[
            {'id':'annual','dersKod':'TIP300','adi':'Klinik Bilimler','dersSecimTipi':'ZORUNLU'}]},
            {'sinif':None,'yariYil':'YY4','ders':[
                {'id':None,'adi':None,'dersKod':None,'dersResponseList':[
                    {'id':'elective','dersKod':'ECZ200','adi':'Eczacılık Tarihi','dersSecimTipi':'SECMELI'}]},
                {'id':'common','dersKod':'OSD101','adi':'Hijyen','dersSecimTipi':'ALAN_DISI'},
                {'id':'common2','dersKod':'OSD101','adi':'Hijyen','dersSecimTipi':'ALAN_DISI'}]}],course_code)
        self.assertEqual(rows,[{'code':'TIP300','name':'Klinik Bilimler','semester':None,'year':3,'kind':'required'},
            {'code':'ECZ200','name':'Eczacılık Tarihi','semester':4,'kind':'elective'},
            {'code':'OSD101','name':'Hijyen','semester':4,'kind':'elective'}])

    def test_language_abbreviations_preserve_english_mixed_and_evening_modes(self):
        from collect_turkey_language_labels import expand_language
        self.assertEqual(expand_language('PSİKOLOJİ (TR)'),'PSİKOLOJİ')
        self.assertEqual(expand_language('PSİKOLOJİ (EN)'),'PSİKOLOJİ (İngilizce)')
        self.assertEqual(expand_language('PSİKOLOJİ (EN/TR)'),'PSİKOLOJİ (EN/TR)')
        self.assertEqual(expand_language('AŞÇILIK (TR) (İÖ)'),'AŞÇILIK (İÖ)')

    def test_ubys_teaching_suffix_keeps_language_and_evening_identity(self):
        from collect_turkey_continuation_catalogs import normalize_ubys_label
        self.assertEqual(normalize_ubys_label('Psikoloji (İngilizce) Birinci Öğretim Lisans Anadal Programı', 'İnsan Bilimleri Fakültesi'),
            ('Psikoloji (İngilizce)', 'İnsan Bilimleri Fakültesi'))
        self.assertEqual(normalize_ubys_label('Sosyoloji İkinci Öğretim Lisans Anadal Programı', 'Edebiyat Fakültesi'),
            ('Sosyoloji (İÖ)', 'Edebiyat Fakültesi'))
        self.assertEqual(normalize_ubys_label('Makine Birinci Öğretim Ön Lisans Anadal Programı eskisi', 'MYO'),
            ('Makine Birinci Öğretim Ön Lisans Anadal Programı eskisi', 'MYO'))

    def test_ubys_campus_suffix_requires_the_same_named_unit(self):
        from collect_turkey_continuation_catalogs import normalize_ubys_label
        self.assertEqual(normalize_ubys_label('Bilgisayar Programcılığı(ÇEMİŞGEZEK) Birinci Öğretim Ön Lisans Anadal Programı', 'Çemişgezek Meslek Yüksekokulu Müdürlüğü'),
            ('Bilgisayar Programcılığı', 'Çemişgezek Meslek Yüksekokulu'))
        self.assertEqual(normalize_ubys_label('Bilgisayar Programcılığı(PERTEK)', 'Çemişgezek Meslek Yüksekokulu'),
            ('Bilgisayar Programcılığı(PERTEK)', 'Çemişgezek Meslek Yüksekokulu'))


class ContinuationParsersTest(unittest.TestCase):
    def test_khas_elective_pool_does_not_inherit_last_semester(self):
        from parse_turkey_foundation_courses import parse_foundation_tables
        rows,_=parse_foundation_tables(html('''<h3>4. Yıl Bahar</h3>
          <table><tr><th>KOD</th><th>TİPİ (Z/S)</th><th>DERS</th></tr>
          <tr><td>FENS402</td><td>Z</td><td>Mühendislik Tasarım Projesi II</td></tr></table>
          <table><tr><th>KOD</th><th>DERS TİPİ</th><th>DERS</th></tr>
          <tr><td>CMPE320</td><td>S</td><td>Veri Bilimi</td></tr></table>'''),
            'khas',course_code,course_kind,heading_period)
        self.assertEqual([(r['semester'],r['kind']) for r in rows],[(8,'required'),(None,'elective')])

    def test_gsu_letter_sections_and_shared_course_table(self):
        from parse_turkey_foundation_courses import parse_foundation_tables
        rows,_=parse_foundation_tables(html('''<table><tr><th>2. Yarıyıl</th></tr>
          <tr><th>Ders Kodu</th><th>Dersin Adı</th><th>Türü</th></tr>
          <tr><td>INF114-B</td><td>İleri Bilgisayar Programlama</td><td>Zorunlu</td></tr></table>
          <table><tr><th>Ortak Bölüm Dersleri</th></tr>
          <tr><th>Ders Kodu</th><th>Dersin Adı</th><th>Türü</th></tr>
          <tr><td>CNT414</td><td>Bilim Tarihi</td><td>Seçmeli</td></tr></table>'''),
            'gsu',course_code,course_kind,heading_period)
        self.assertEqual([(r['code'],r['semester'],r['kind']) for r in rows],
            [('INF114-B',2,'required'),('CNT414',None,'elective')])

    def test_demiroglu_year_and_half_and_pool_alignment(self):
        from parse_turkey_foundation_courses import parse_demiroglu
        rows,_=parse_demiroglu(html('''<table><tr><th>Ders Kodu</th><th>Ders Adı</th><th>Ders Türü</th></tr>
          <tr><td>Yıl 3</td><td>Semester 2</td><td></td></tr>
          <tr><td>101001512024<br><ul><li><a href="DersGetir?dersID=1">101001032012</a></li>
          <li><a href="DersGetir?dersID=2">101001532024</a></li></ul></td>
          <td>Seçmeli-I<br>Sosyolojiye Giriş<br>Psikolojide Akademik Okuma</td><td>Seçmeli<br>Seçmeli<br>Seçmeli</td></tr>
          <tr><td>101001512025<br><ul><li><a href="DersGetir?dersID=3">101001032013</a></li></ul></td>
          <td>Seçmeli-II</td><td>Seçmeli</td></tr></table>'''),course_code,course_kind)
        self.assertEqual([(r['code'],r['semester'],r['kind']) for r in rows],
            [('101001032012',6,'elective'),('101001532024',6,'elective')])

    def test_antalya_uses_active_plan_and_only_its_elective_pools(self):
        import json
        from parse_turkey_foundation_courses import parse_antalya
        plan=[{'status':10201,'semester':3,'course_type':'course','course_id':1,'code':'CENG201','course_name':'Veri Yapıları'},
            {'status':10200,'semester':3,'course_type':'course','course_id':2,'code':'CENG202','course_name':'Eski Ders'},
            {'status':10201,'semester':3,'course_type':'elective_pool','elective_pool_id':10,'code':'NAE1000','course_name':'Seçmeli'}]
        electives=[{'elective_pool_id':10,'code':'LGRM201','name':'Almanca I'},
            {'elective_pool_id':20,'code':'TEST101','name':'Farklı havuz'}]
        rows,_=parse_antalya(html('<script>const coursePlan = '+json.dumps(plan)+'; const electiveCourses = '+json.dumps(electives)+';</script>'),course_code)
        self.assertEqual(rows,[{'code':'CENG201','name':'Veri Yapıları','semester':3,'kind':None},
            {'code':'LGRM201','name':'Almanca I','semester':3,'kind':'elective'}])

    def test_esenyurt_elective_children_keep_selected_term_and_numeric_prefix(self):
        from parse_turkey_continuation_courses import parse_esenyurt
        from parse_turkey_courses import course_kind
        rows,_=parse_esenyurt(html('''<table id="grdBolognaDersler">
          <tr><td>2.Yarıyıl Ders Planı</td></tr>
          <tr><th>Ders Kodu</th><th>Ders Adı</th><th>Zorunlu/Seçmeli</th></tr>
          <tr><td>2021G3003</td><td>Programlama</td><td>Zorunlu</td></tr>
          <tr><td><span class="expandCollapse" id="span_123"></span>11B1SDG</td><td>MYO Ortak Seçmeli II</td><td>Seçmeli</td></tr>
          <tr class="collapse collapse_123"><td>1110B1005_1</td><td>Bilişimde Güncel Konular</td><td>Zorunlu</td></tr>
          <tr class="collapse collapse_999"><td>1110B1005</td><td>Orphan pool course</td><td>Zorunlu</td></tr>
          <tr><td>-1.Yarıyıl Ders Planı</td></tr>
          <tr><th>Ders Kodu</th><th>Ders Adı</th><th>Zorunlu/Seçmeli</th></tr>
          <tr><td>PREP101</td><td>Hazırlık</td><td>Zorunlu</td></tr></table>'''),course_code,course_kind)
        self.assertEqual(rows,[{'code':'2021G3003','name':'Programlama','semester':2,'kind':'required'},
            {'code':'1110B1005_1','name':'Bilişimde Güncel Konular','semester':2,'kind':'elective'}])

    def test_agu_negative_preparation_term_and_elective_slots_are_excluded(self):
        from parse_turkey_continuation_courses import parse_agu
        from parse_turkey_courses import course_kind
        rows,_=parse_agu(html('''<table id="grdBolognaDersler">
          <tr><td>-1.Semester Course Plan</td></tr>
          <tr><th>Course Code</th><th>Course Name</th><th>Compulsory/Elective</th></tr>
          <tr><td>PREPX101</td><td>English For Travel</td><td>Elective</td></tr>
          <tr><td>1.Semester Course Plan</td></tr>
          <tr><th>Course Code</th><th>Course Name</th><th>Compulsory/Elective</th></tr>
          <tr><td>COMP103</td><td>Art of Computing</td><td>Compulsory</td></tr>
          <tr><td>XEG101</td><td>General Transfer Elective I</td><td>Elective</td></tr>
          <tr><td>0.Semester Course Plan</td></tr>
          <tr><th>Course Code</th><th>Course Name</th><th>Compulsory/Elective</th></tr>
          <tr><td>PREP100</td><td>Preparation</td><td>Compulsory</td></tr>
          </table>'''),course_code,course_kind)
        self.assertEqual(rows,[{'code':'COMP103','name':'Art of Computing','semester':1,'kind':'required'}])

    def test_izu_named_electives_are_retained_and_unknown_kind_is_not_inferred(self):
        from parse_turkey_continuation_courses import parse_izu
        from parse_turkey_courses import course_kind
        rows,_=parse_izu(html('''<table class="table"><thead>
          <tr><th colspan="3">7. Yarıyıl Seçmeli Dersler</th></tr>
          <tr><th>KODU</th><th>ADI</th><th>TÜRÜ</th></tr></thead><tbody>
          <tr><td>BIM 437</td><td>Bilgisayar ve Ağ Güvenliği</td><td>Bölüm Seçmeli</td></tr>
          <tr><td>BLS 001</td><td>Bölüm Seçmeli Ders</td><td>Bölüm Seçmeli</td></tr>
          <tr><td>BIM 499</td><td>Bitirme Projesi</td><td>Bitirme Çalışması</td></tr>
          </tbody></table>'''),course_code,course_kind)
        self.assertEqual(rows,[{'code':'BIM437','name':'Bilgisayar ve Ağ Güvenliği','semester':7,'kind':'elective'},
            {'code':'BIM499','name':'Bitirme Projesi','semester':7,'kind':None}])


class PdfCourseTableTests(unittest.TestCase):
    def test_repeated_leaf_caption_keeps_qualifiers_and_duplicate_routes_require_published_witness(self):
        from collect_turkey_ecatalogs import leaf_programme_title,unique_or_published
        self.assertEqual(leaf_programme_title('Hemşirelik','Hemşirelik Hemşirelik'),'Hemşirelik')
        self.assertEqual(leaf_programme_title('Hemşirelik','Hemşirelik Hemşirelik (İ.Ö.)'),'Hemşirelik Hemşirelik (İ.Ö.)')
        old={'programId':'p1','courseUrl':'https://official.edu.tr/old'}
        new={'programId':'p1','courseUrl':'https://official.edu.tr/new'}
        self.assertEqual(unique_or_published([old,new],{}),[])
        self.assertEqual(unique_or_published([old,new],{'p1':old['courseUrl']}),[old])
        self.assertEqual(unique_or_published([new],{'p1':old['courseUrl']}),[new])

    def test_paired_terms_do_not_leak_into_left_only_elective_pool(self):
        from parse_turkey_pdf_courses import parse_pdf_tables
        from parse_turkey_courses import course_kind,heading_period
        rows,_=parse_pdf_tables([{'rows':[
            ['1. Yarıyıl',None,None,'2. Yarıyıl',None],
            ['Ders Kodu','Ders Adı',None,'Ders Kodu','Ders Adı'],
            ['BIP 101*','Programlama',None,'MAT102','Matematik II'],
            ['Seçmeli Dersler',None,None,None,None],
            ['Ders Kodu','Ders Adı',None,None,None],
            ['BIP201','Veri Tabanı',None,'BAD101','Eski sütun'],
            ['SEC101','Seçmeli Ders I',None,None,None],
        ]}],course_code,course_kind,heading_period)
        self.assertEqual(rows,[{'code':'BIP101','name':'Programlama','semester':1,'kind':None},
            {'code':'MAT102','name':'Matematik II','semester':2,'kind':None},
            {'code':'BIP201','name':'Veri Tabanı','semester':None,'kind':'elective'}])

    def test_pdf_uses_explicit_external_roman_heading_not_table_order(self):
        from parse_turkey_pdf_courses import parse_pdf_tables
        from parse_turkey_courses import course_kind,heading_period
        rows,_=parse_pdf_tables([
            {'heading':'IV. YARIYIL','rows':[['Dersin Kodu','Dersin Adı'],['COMP202','Algoritmalar']]},
            {'heading':'','rows':[['Dersin Kodu','Dersin Adı'],['COMP405','Ağlar']]}],course_code,course_kind,heading_period)
        self.assertEqual([c['semester'] for c in rows],[4,None])


if __name__=='__main__':unittest.main()
