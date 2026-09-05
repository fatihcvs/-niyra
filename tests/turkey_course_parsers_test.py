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
from collect_turkey_ecatalogs import discover

def html(value): return BeautifulSoup(value,'html.parser')

class CourseParsers(unittest.TestCase):
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

if __name__=='__main__':unittest.main()
