import { readFile, writeFile } from "node:fs/promises";

const catalogUrl = new URL("../../data/academic-catalog-2026.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const sourceAdditions = [
  {
    id: "msu-academic-2026",
    authority: "Millî Savunma Üniversitesi",
    title: "2026 akademik birimler ve öğretim programları",
    url: "https://www.msu.edu.tr/",
  },
  {
    id: "altinbas-kibris-academics-2026",
    authority: "Altınbaş Kıbrıs Üniversitesi",
    title: "Fakülteler, yüksekokullar ve lisansüstü programlar",
    url: "https://wpu.edu.tr/tr/fakulteler/",
  },
  {
    id: "asbu-kktc-programmes-2026",
    authority: "Ankara Sosyal Bilimler Üniversitesi",
    title: "ASBÜ Kuzey Kıbrıs 2026 yeni kayıt rehberi ve programları",
    url: "https://kktc.asbu.edu.tr/tr/2026-yeni-kayit-rehberi",
  },
  {
    id: "elu-programmes-2026",
    authority: "European Leadership University",
    title: "Current associate, bachelor and graduate programmes",
    url: "https://elu.edu.tr/programmes.php",
  },
  {
    id: "onbes-kasim-academics-2026",
    authority: "Onbeş Kasım Kıbrıs Üniversitesi",
    title: "2026 academic units and programmes",
    url: "https://onbeskku.edu.tr/",
  },
  {
    id: "nkua-cyprus-programmes-2026",
    authority: "National and Kapodistrian University of Athens",
    title: "Cyprus Branch schools, departments and 2026 intake",
    url: "https://cy-en.uoa.gr/news_and_events/view_announcement/inauguration_of_the_national_and_kapodistrian_university_of_athens_cyprus_branch_a_landmark_event_for_higher_education_in_greece_and_cyprus",
  },
  {
    id: "yodak-institutions-2026",
    authority: "YÖDAK",
    title: "Kuzey Kıbrıs yükseköğretim kurumları",
    url: "https://yodak.gov.ct.tr/universiteler",
  },
  {
    id: "cyqaa-institutions-2026",
    authority: "CYQAA",
    title: "Accredited Institutions",
    url: "https://www.dipae.ac.cy/en/accreditation-en/accredited-institutions-en",
  },
  {
    id: "cyqaa-rejected-programmes-2026",
    authority: "CYQAA",
    title: "Programmes rejected by the Agency",
    url: "https://www.dipae.ac.cy/en/accreditation-en/rejected-programmes-en",
  },
];

const normalized = (value) => value.normalize("NFC");
const unit = (id, name, type) => ({ id, name: normalized(name), type });
const program = (id, unitId, name, degreeLevel, sourceId, details = {}) => ({
  id,
  unitId,
  name: normalized(name),
  degreeLevel,
  ...details,
  sourceId,
});

const msuSource = "msu-academic-2026";
const msuUnits = [
  unit("unit-msu-kara-harp-okulu", "Kara Harp Okulu", "Harp Okulu"),
  unit("unit-msu-deniz-harp-okulu", "Deniz Harp Okulu", "Harp Okulu"),
  unit("unit-msu-hava-harp-okulu", "Hava Harp Okulu", "Harp Okulu"),
  unit("unit-msu-kara-astsubay-myo", "Kara Astsubay Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-msu-deniz-astsubay-myo", "Deniz Astsubay Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-msu-hava-astsubay-myo", "Hava Astsubay Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-msu-bando-astsubay-myo", "Bando Astsubay Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-msu-musterek-harp-enstitusu", "Müşterek Harp Enstitüsü", "Enstitü"),
  unit("unit-msu-kara-harp-enstitusu", "Kara Harp Enstitüsü", "Enstitü"),
  unit("unit-msu-deniz-harp-enstitusu", "Deniz Harp Enstitüsü", "Enstitü"),
  unit("unit-msu-hava-harp-enstitusu", "Hava Harp Enstitüsü", "Enstitü"),
  unit("unit-msu-atasaren", "Atatürk Stratejik Araştırmalar ve Lisansüstü Eğitim Enstitüsü", "Enstitü"),
  unit("unit-msu-alparslan", "Alparslan Savunma Bilimleri ve Millî Güvenlik Enstitüsü", "Enstitü"),
  unit("unit-msu-fatih", "Fatih Harp Tarihi Araştırmaları Enstitüsü", "Enstitü"),
  unit("unit-msu-yabanci-diller", "Yabancı Diller Yüksekokulu", "Yüksekokul"),
];

const msuProgramGroups = [
  ["unit-msu-kara-harp-okulu", "bachelor", 4, [
    "Bilgisayar Mühendisliği",
    "Elektronik ve Haberleşme Mühendisliği",
    "Endüstri Mühendisliği",
    "İnşaat Mühendisliği",
    "Makine Mühendisliği",
    "Savunma Yönetimi",
    "Tarih",
    "Uluslararası İlişkiler",
  ]],
  ["unit-msu-deniz-harp-okulu", "bachelor", 4, [
    "Bilgisayar Mühendisliği",
    "Elektrik-Elektronik Mühendisliği",
    "Endüstri Mühendisliği",
    "Gemi İnşaatı ve Gemi Makineleri Mühendisliği",
    "Makine Mühendisliği",
    "Uluslararası İlişkiler",
  ]],
  ["unit-msu-hava-harp-okulu", "bachelor", 4, [
    "Bilgisayar Mühendisliği",
    "Elektronik Mühendisliği",
    "Endüstri Mühendisliği",
    "Havacılık ve Uzay Mühendisliği",
  ]],
  ["unit-msu-kara-astsubay-myo", "associate", 2, [
    "Elektrik",
    "Elektronik Haberleşme Teknolojisi",
    "Mekatronik",
    "Uçak Teknolojisi",
    "Otomotiv Teknolojisi",
    "İnşaat Teknolojisi",
    "Yapı Tesisat Teknolojisi",
    "Bilgisayar Teknolojisi",
    "İşletme Yönetimi",
    "Savunma Hizmetleri",
  ]],
  ["unit-msu-deniz-astsubay-myo", "associate", 2, [
    "Gemi Makineleri İşletmeciliği",
    "Elektrik",
    "Büro Yönetimi ve Yönetici Asistanlığı",
    "Elektronik Teknolojisi",
    "Uçak Teknolojisi",
    "Deniz Ulaştırma ve İşletme",
    "İşletme Yönetimi",
    "Bilgisayar Teknolojisi",
  ]],
  ["unit-msu-hava-astsubay-myo", "associate", 2, [
    "Uçak Teknolojileri",
    "Hava Trafik Kontrol Hizmetleri",
    "Elektronik Haberleşme Teknolojisi",
    "Elektrik",
    "Bilgisayar Teknolojisi",
    "İnşaat Teknolojisi",
    "Otomotiv Teknolojisi",
    "İşletme Yönetimi",
    "Mekatronik",
  ]],
  ["unit-msu-bando-astsubay-myo", "associate", 2, [
    "Üflemeli ve Vurmalı Çalgılar",
    "Çalgı Bakım Onarım",
  ]],
];

const msuPrograms = msuProgramGroups.flatMap(([unitId, degreeLevel, durationYears, names], groupIndex) =>
  names.map((name, programIndex) =>
    program(
      `program-msu-${String(groupIndex + 1).padStart(2, "0")}-${String(programIndex + 1).padStart(2, "0")}`,
      unitId,
      name,
      degreeLevel,
      msuSource,
      { durationYears },
    ),
  ),
);

const altinbasSource = "altinbas-kibris-academics-2026";
const altinbasUnits = [
  unit("unit-altinbas-iisbf", "İktisadi, İdari ve Sosyal Bilimler Fakültesi", "Fakülte"),
  unit("unit-altinbas-sanat", "Sanat Fakültesi", "Fakülte"),
  unit("unit-altinbas-muhendislik-mimarlik", "Mühendislik ve Mimarlık Fakültesi", "Fakülte"),
  unit("unit-altinbas-saglik", "Sağlık Bilimleri Fakültesi", "Fakülte"),
  unit("unit-altinbas-hukuk", "Hukuk Fakültesi", "Fakülte"),
  unit("unit-altinbas-yabanci-diller", "İngilizce Hazırlık ve Yabancı Diller Yüksekokulu", "Yüksekokul"),
  unit("unit-altinbas-shmyo", "Sağlık Hizmetleri Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-altinbas-lisansustu", "Lisansüstü Eğitim Enstitüsü", "Enstitü"),
];
const altinbasPrograms = [
  ["iisbf-isletme-en", "unit-altinbas-iisbf", "İşletme Yönetimi", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["iisbf-isletme-tr", "unit-altinbas-iisbf", "İşletme Yönetimi", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["iisbf-siyaset", "unit-altinbas-iisbf", "Siyaset Bilimi ve Uluslararası İlişkiler", "bachelor", { durationYears: 4 }],
  ["iisbf-turizm", "unit-altinbas-iisbf", "Uluslararası Konaklama ve Turizm", "bachelor", { durationYears: 4 }],
  ["iisbf-ybs", "unit-altinbas-iisbf", "Yönetim Bilişim Sistemleri", "bachelor", { durationYears: 4 }],
  ["iisbf-psikoloji-en", "unit-altinbas-iisbf", "Psikoloji", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["iisbf-psikoloji-tr", "unit-altinbas-iisbf", "Psikoloji", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["sanat-plastik", "unit-altinbas-sanat", "Plastik Sanatlar", "bachelor", { durationYears: 4 }],
  ["mimarlik", "unit-altinbas-muhendislik-mimarlik", "Mimarlık", "bachelor", { durationYears: 4 }],
  ["yazilim", "unit-altinbas-muhendislik-mimarlik", "Yazılım Mühendisliği", "bachelor", { durationYears: 4 }],
  ["insaat", "unit-altinbas-muhendislik-mimarlik", "İnşaat Mühendisliği", "bachelor", { durationYears: 4 }],
  ["hemsirelik-tr", "unit-altinbas-saglik", "Hemşirelik", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["hemsirelik-en", "unit-altinbas-saglik", "Hemşirelik", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["uluslararasi-hukuk", "unit-altinbas-hukuk", "Uluslararası Hukuk", "bachelor", { durationYears: 4 }],
  ["ilk-acil-tr", "unit-altinbas-shmyo", "İlk ve Acil Yardım", "associate", { durationYears: 2, language: "Türkçe" }],
  ["ilk-acil-en", "unit-altinbas-shmyo", "İlk ve Acil Yardım", "associate", { durationYears: 2, language: "İngilizce" }],
  ["mba", "unit-altinbas-lisansustu", "İşletme Yönetimi", "master", {}],
  ["isletme-doktora", "unit-altinbas-lisansustu", "İşletme Yönetimi", "doctorate", {}],
  ["sbu-master", "unit-altinbas-lisansustu", "Siyaset Bilimi ve Uluslararası İlişkiler", "master", {}],
  ["sbu-doktora", "unit-altinbas-lisansustu", "Siyaset Bilimi ve Uluslararası İlişkiler", "doctorate", {}],
  ["turizm-master", "unit-altinbas-lisansustu", "Uluslararası Konaklama ve Turizm İşletmeciliği", "master", {}],
  ["kamu-master", "unit-altinbas-lisansustu", "Kamu Yönetimi", "master", {}],
  ["kamu-doktora", "unit-altinbas-lisansustu", "Kamu Yönetimi", "doctorate", {}],
].map(([id, unitId, name, degreeLevel, details]) =>
  program(`program-altinbas-${id}`, unitId, name, degreeLevel, altinbasSource, details),
);

const asbuSource = "asbu-kktc-programmes-2026";
const asbuUnitId = "unit-asbu-kktc-yerleskesi";
const asbuUnits = [unit(asbuUnitId, "Kuzey Kıbrıs Yerleşkesi", "Akademik Birim")];
const asbuPrograms = [
  ["uluslararasi-girisimcilik-en", "Uluslararası Girişimcilik", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["uluslararasi-ticaret-lojistik-en", "Uluslararası Ticaret ve Lojistik", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["iktisat-en", "İktisat", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["iktisat-tr", "İktisat", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["ybs-en", "Yönetim Bilişim Sistemleri", "bachelor", { durationYears: 4, language: "İngilizce" }],
  ["ybs-tr", "Yönetim Bilişim Sistemleri", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["hukuk", "Hukuk", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["psikoloji", "Psikoloji", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["ilahiyat", "İlahiyat", "bachelor", { durationYears: 4, language: "%30 Arapça" }],
  ["ozel-egitim", "Özel Eğitim Öğretmenliği", "bachelor", { durationYears: 4, language: "Türkçe" }],
  ["ingilizce-ogretmenligi", "İngilizce Öğretmenliği", "bachelor", { durationYears: 4, language: "%30 İngilizce" }],
  ["yapay-zeka-operatorlugu", "Yapay Zekâ Operatörlüğü", "associate", { durationYears: 2, language: "Türkçe" }],
  ["buyuk-veri-analistligi", "Büyük Veri Analistliği", "associate", { durationYears: 2, language: "Türkçe" }],
].map(([id, name, degreeLevel, details]) =>
  program(`program-asbu-kktc-${id}`, asbuUnitId, name, degreeLevel, asbuSource, details),
);

const eluSource = "elu-programmes-2026";
const eluUnits = [
  unit("unit-elu-business-vocational", "Business Vocational School", "Meslek Yüksekokulu"),
  unit("unit-elu-business", "Business Faculty", "Fakülte"),
  unit("unit-elu-communication", "Communication Faculty", "Fakülte"),
  unit("unit-elu-applied-science", "Applied Science Faculty", "Fakülte"),
  unit("unit-elu-engineering", "Engineering Faculty", "Fakülte"),
  unit("unit-elu-law", "Law Faculty", "Fakülte"),
  unit("unit-elu-social-science", "Institute of Social Science", "Enstitü"),
];
const eluPrograms = [
  ["associate-business", "unit-elu-business-vocational", "Business Administration", "associate", 2],
  ["business", "unit-elu-business", "Business Administration", "bachelor", 4],
  ["leadership", "unit-elu-business", "Science in Leadership", "bachelor", 4],
  ["communication-social-media", "unit-elu-communication", "Communication and Social Media", "bachelor", 4],
  ["digital-marketing-social-media", "unit-elu-communication", "Digital Marketing and Social Media", "bachelor", 4],
  ["tourism-management", "unit-elu-applied-science", "Tourism Management", "bachelor", 4],
  ["technology-entrepreneurship-mis", "unit-elu-applied-science", "Technology Entrepreneurship and MIS", "bachelor", 4],
  ["data-science", "unit-elu-engineering", "Data Science", "bachelor", 4],
  ["computer-engineering", "unit-elu-engineering", "Computer Engineering", "bachelor", 4],
  ["law", "unit-elu-law", "Law", "bachelor", 4],
  ["mba", "unit-elu-social-science", "Business Administration", "master", null],
  ["private-law", "unit-elu-social-science", "Private Law", "master", null],
  ["business-phd", "unit-elu-social-science", "Business Administration", "doctorate", null],
].map(([id, unitId, name, degreeLevel, durationYears]) =>
  program(`program-elu-${id}`, unitId, name, degreeLevel, eluSource, {
    ...(durationYears ? { durationYears } : {}),
    language: "İngilizce",
  }),
);

const onbesSource = "onbes-kasim-academics-2026";
const onbesUnits = [
  unit("unit-onbes-yabanci-diller", "Yabancı Diller Yüksekokulu ve İngilizce Hazırlık", "Yüksekokul"),
  unit("unit-onbes-shmyo", "Sağlık Hizmetleri Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-onbes-sosyal-myo", "Sosyal Bilimler Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-onbes-tarim-teknik-myo", "Tarım ve Teknik Bilimler Meslek Yüksekokulu", "Meslek Yüksekokulu"),
  unit("unit-onbes-egitim", "Eğitim Fakültesi", "Fakülte"),
  unit("unit-onbes-iletisim", "İletişim Fakültesi", "Fakülte"),
  unit("unit-onbes-muhendislik", "Mühendislik Fakültesi", "Fakülte"),
  unit("unit-onbes-siyasal-sosyal", "Siyasal ve Sosyal Bilimler Fakültesi", "Fakülte"),
  unit("unit-onbes-turizm", "Turizm Fakültesi", "Fakülte"),
  unit("unit-onbes-enstitu", "Siyasal ve Sosyal Bilimler Enstitüsü", "Enstitü"),
];
const onbesPrograms = [
  ["cocuk-gelisimi", "unit-onbes-shmyo", "Çocuk Gelişimi", "associate", 2, "Türkçe"],
  ["adalet", "unit-onbes-sosyal-myo", "Adalet", "associate", 2, "Türkçe"],
  ["finans-bankacilik-sigorta", "unit-onbes-sosyal-myo", "Finans, Bankacılık ve Sigortacılık", "associate", 2, "Türkçe"],
  ["muhasebe-vergi", "unit-onbes-sosyal-myo", "Muhasebe ve Vergi Uygulamaları", "associate", 2, "Türkçe"],
  ["alternatif-enerji", "unit-onbes-tarim-teknik-myo", "Alternatif Enerji Kaynakları Teknolojisi", "associate", 2, "Türkçe"],
  ["makine", "unit-onbes-tarim-teknik-myo", "Makine", "associate", 2, "Türkçe"],
  ["sut-urunleri", "unit-onbes-tarim-teknik-myo", "Süt ve Ürünleri Teknolojisi", "associate", 2, "Türkçe"],
  ["okul-oncesi", "unit-onbes-egitim", "Okul Öncesi Öğretmenliği", "bachelor", 4, "Türkçe"],
  ["rpd", "unit-onbes-egitim", "Rehberlik ve Psikolojik Danışmanlık", "bachelor", 4, "Türkçe"],
  ["gorsel-iletisim", "unit-onbes-iletisim", "Görsel İletişim Tasarımı", "bachelor", 4, "Türkçe"],
  ["radyo-tv-sinema", "unit-onbes-iletisim", "Radyo, Televizyon ve Sinema", "bachelor", 4, "Türkçe"],
  ["yeni-medya", "unit-onbes-iletisim", "Yeni Medya", "bachelor", 4, "Türkçe"],
  ["bilgisayar-muh", "unit-onbes-muhendislik", "Bilgisayar Mühendisliği", "bachelor", 4, "İngilizce"],
  ["yazilim-muh", "unit-onbes-muhendislik", "Yazılım Mühendisliği", "bachelor", 4, "İngilizce"],
  ["ekonomi-finans", "unit-onbes-siyasal-sosyal", "Ekonomi ve Finans", "bachelor", 4, "İngilizce"],
  ["isletme", "unit-onbes-siyasal-sosyal", "İşletme", "bachelor", 4, "İngilizce"],
  ["siyaset-kamu", "unit-onbes-siyasal-sosyal", "Siyaset Bilimi ve Kamu Yönetimi", "bachelor", 4, "Türkçe"],
  ["uluslararasi-iliskiler-ab", "unit-onbes-siyasal-sosyal", "Uluslararası İlişkiler ve Avrupa Birliği", "bachelor", 4, "Türkçe / İngilizce"],
  ["gastronomi", "unit-onbes-turizm", "Gastronomi ve Mutfak Sanatları", "bachelor", 4, "Türkçe"],
  ["turizm-otel", "unit-onbes-turizm", "Turizm İşletmeciliği ve Otelcilik", "bachelor", 4, "İngilizce"],
  ["iletisim-master", "unit-onbes-enstitu", "İletişim ve Yeni Medya Yönetimi", "master", null, "Türkçe"],
  ["isletme-master", "unit-onbes-enstitu", "İşletme Yönetimi", "master", null, "İngilizce"],
  ["rpd-master", "unit-onbes-enstitu", "Rehberlik ve Psikolojik Danışmanlık", "master", null, "Türkçe"],
  ["uir-ab-master", "unit-onbes-enstitu", "Uluslararası İlişkiler ve Avrupa Birliği", "master", null, null],
  ["turizm-master", "unit-onbes-enstitu", "Uluslararası Turizm İşletmeciliği", "master", null, "Türkçe"],
  ["iletisim-doktora", "unit-onbes-enstitu", "İletişim ve Yeni Medya Yönetimi", "doctorate", null, "Türkçe"],
  ["isletme-doktora", "unit-onbes-enstitu", "İşletme Yönetimi", "doctorate", null, "İngilizce"],
].map(([id, unitId, name, degreeLevel, durationYears, language]) =>
  program(`program-onbes-${id}`, unitId, name, degreeLevel, onbesSource, {
    ...(durationYears ? { durationYears } : {}),
    ...(language ? { language } : {}),
  }),
);

const nkuaSource = "nkua-cyprus-programmes-2026";
const nkuaUnits = [
  unit("unit-nkua-health", "School of Health Sciences", "School"),
  unit("unit-nkua-economics", "School of Economics and Political Sciences", "School"),
  unit("unit-nkua-philosophy", "School of Philosophy", "School"),
  unit("unit-nkua-education", "School of Education", "School"),
];
const nkuaPrograms = [
  ["medicine", "unit-nkua-health", "Medicine", 6, "Yunanca"],
  ["nursing", "unit-nkua-health", "Nursing", 4, "Yunanca"],
  ["economics", "unit-nkua-economics", "Economics", 4, "Yunanca"],
  ["business-administration", "unit-nkua-economics", "Business Administration", 4, "Yunanca"],
  ["ports-shipping", "unit-nkua-economics", "Ports Management and Shipping", 4, "Yunanca"],
  ["psychology", "unit-nkua-philosophy", "Psychology", 4, "Yunanca"],
  ["baag", "unit-nkua-philosophy", "Archaeology, History, and Literature of Ancient Greece", 4, "İngilizce"],
  ["primary-education", "unit-nkua-education", "Paedagogy and Primary Education", 4, "Yunanca"],
].map(([id, unitId, name, durationYears, language]) =>
  program(`program-nkua-cyprus-${id}`, unitId, name, "bachelor", nkuaSource, { durationYears, language }),
);

const replacements = {
  "tr-milli-savunma-universitesi": { units: msuUnits, programs: msuPrograms },
  "kktc-altinbas-kibris-universitesi": { units: altinbasUnits, programs: altinbasPrograms },
  "kktc-ankara-sosyal-bilimler-universitesi": { units: asbuUnits, programs: asbuPrograms },
  "kktc-avrupa-liderlik-universitesi": { units: eluUnits, programs: eluPrograms },
  "kktc-onbes-kasim-kibris-universitesi": { units: onbesUnits, programs: onbesPrograms },
  "cy-national-and-kapodistrian-university-of-athens-cyprus-branch": { units: nkuaUnits, programs: nkuaPrograms },
};

for (const [universityId, replacement] of Object.entries(replacements)) {
  const existing = catalog.universities[universityId];
  if (!existing) throw new Error(`Unknown university: ${universityId}`);
  catalog.universities[universityId] = {
    ...existing,
    coverage: "official-programs",
    units: replacement.units,
    programs: replacement.programs,
  };
}

const sourceIds = new Set(sourceAdditions.map((source) => source.id));
catalog.meta.sources = [
  ...catalog.meta.sources.filter((source) => !sourceIds.has(source.id)),
  ...sourceAdditions,
];
catalog.meta.version = "2026.2";
catalog.meta.updatedAt = "2026-09-04";
catalog.meta.method = "Official placement, accreditation and institution-published academic records; financing/nationality variants are grouped without changing academic programme names.";
catalog.meta.limitations = "Individual semester course lists are maintained by each university. Institution-published programme coverage was added for six previously uncovered institutions; official curriculum links are exposed only when the source publishes them.";

const universities = Object.values(catalog.universities);
catalog.meta.stats = {
  universityCount: universities.length,
  coveredUniversityCount: universities.filter((university) => university.coverage === "official-programs").length,
  unitCount: universities.reduce((total, university) => total + university.units.length, 0),
  programCount: universities.reduce((total, university) => total + university.programs.length, 0),
  curriculumLinkCount: universities.reduce(
    (total, university) => total + university.programs.reduce((subtotal, item) => subtotal + (item.curriculumUrls?.length ?? 0), 0),
    0,
  ),
  catalogOnlyUniversityCount: universities.filter((university) => university.coverage === "catalog-only").length,
};

await writeFile(catalogUrl, `${JSON.stringify(catalog)}\n`, "utf8");
console.log(JSON.stringify(catalog.meta.stats, null, 2));
