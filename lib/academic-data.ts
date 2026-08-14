export type University = {
  id: string;
  name: string;
  shortName: string;
  city: string;
};

export type Department = {
  id: string;
  name: string;
};

export type AcademicCourse = {
  id: string;
  departmentId: string;
  code: string;
  name: string;
};

export const universities: University[] = [
  { id: "bogazici", name: "Boğaziçi Üniversitesi", shortName: "BÜ", city: "İstanbul" },
  { id: "itu", name: "İstanbul Teknik Üniversitesi", shortName: "İTÜ", city: "İstanbul" },
  { id: "odtu", name: "Orta Doğu Teknik Üniversitesi", shortName: "ODTÜ", city: "Ankara" },
  { id: "ytu", name: "Yıldız Teknik Üniversitesi", shortName: "YTÜ", city: "İstanbul" },
  { id: "ege", name: "Ege Üniversitesi", shortName: "EÜ", city: "İzmir" },
  { id: "ankara", name: "Ankara Üniversitesi", shortName: "AÜ", city: "Ankara" },
  { id: "marmara", name: "Marmara Üniversitesi", shortName: "MÜ", city: "İstanbul" },
  { id: "deu", name: "Dokuz Eylül Üniversitesi", shortName: "DEÜ", city: "İzmir" },
];

export const departments: Department[] = [
  { id: "endustri", name: "Endüstri Mühendisliği" },
  { id: "bilgisayar", name: "Bilgisayar Mühendisliği" },
  { id: "isletme", name: "İşletme" },
  { id: "hukuk", name: "Hukuk" },
  { id: "psikoloji", name: "Psikoloji" },
  { id: "mimarlik", name: "Mimarlık" },
];

export const academicCourses: AcademicCourse[] = [
  { id: "endustri-mat101", departmentId: "endustri", code: "MAT 101", name: "Matematik I" },
  { id: "endustri-fiz101", departmentId: "endustri", code: "FİZ 101", name: "Fizik I" },
  { id: "endustri-ie201", departmentId: "endustri", code: "IE 201", name: "Olasılık ve İstatistik" },
  { id: "endustri-ie305", departmentId: "endustri", code: "IE 305", name: "Yöneylem Araştırması" },
  { id: "endustri-eko101", departmentId: "endustri", code: "EKO 101", name: "Mikroekonomi" },
  { id: "endustri-yaz101", departmentId: "endustri", code: "YAZ 101", name: "Programlamaya Giriş" },
  { id: "bilgisayar-cmpe101", departmentId: "bilgisayar", code: "CMPE 101", name: "Programlamaya Giriş" },
  { id: "bilgisayar-mat101", departmentId: "bilgisayar", code: "MAT 101", name: "Matematik I" },
  { id: "bilgisayar-cmpe220", departmentId: "bilgisayar", code: "CMPE 220", name: "Veri Yapıları" },
  { id: "bilgisayar-cmpe250", departmentId: "bilgisayar", code: "CMPE 250", name: "Ayrık Matematik" },
  { id: "bilgisayar-cmpe321", departmentId: "bilgisayar", code: "CMPE 321", name: "Veritabanı Sistemleri" },
  { id: "bilgisayar-cmpe350", departmentId: "bilgisayar", code: "CMPE 350", name: "İşletim Sistemleri" },
  { id: "isletme-islt101", departmentId: "isletme", code: "İŞLT 101", name: "İşletmeye Giriş" },
  { id: "isletme-eko101", departmentId: "isletme", code: "EKO 101", name: "Mikroekonomi" },
  { id: "isletme-muh101", departmentId: "isletme", code: "MUH 101", name: "Finansal Muhasebe" },
  { id: "isletme-paz201", departmentId: "isletme", code: "PAZ 201", name: "Pazarlama Yönetimi" },
  { id: "isletme-fin202", departmentId: "isletme", code: "FİN 202", name: "İşletme Finansı" },
  { id: "isletme-ist201", departmentId: "isletme", code: "İST 201", name: "İşletme İstatistiği" },
  { id: "hukuk-huk101", departmentId: "hukuk", code: "HUK 101", name: "Hukuka Giriş" },
  { id: "hukuk-ana201", departmentId: "hukuk", code: "ANA 201", name: "Anayasa Hukuku" },
  { id: "hukuk-med202", departmentId: "hukuk", code: "MED 202", name: "Medeni Hukuk" },
  { id: "hukuk-bor204", departmentId: "hukuk", code: "HUK 204", name: "Borçlar Hukuku" },
  { id: "hukuk-cez205", departmentId: "hukuk", code: "CEZ 205", name: "Ceza Hukuku" },
  { id: "hukuk-idr301", departmentId: "hukuk", code: "İDR 301", name: "İdare Hukuku" },
  { id: "psikoloji-psi101", departmentId: "psikoloji", code: "PSİ 101", name: "Psikolojiye Giriş" },
  { id: "psikoloji-ist101", departmentId: "psikoloji", code: "İST 101", name: "Davranış Bilimleri İstatistiği" },
  { id: "psikoloji-psi202", departmentId: "psikoloji", code: "PSİ 202", name: "Gelişim Psikolojisi" },
  { id: "psikoloji-psi204", departmentId: "psikoloji", code: "PSİ 204", name: "Sosyal Psikoloji" },
  { id: "psikoloji-psi301", departmentId: "psikoloji", code: "PSİ 301", name: "Bilişsel Psikoloji" },
  { id: "psikoloji-psi310", departmentId: "psikoloji", code: "PSİ 310", name: "Klinik Psikoloji" },
  { id: "mimarlik-mim101", departmentId: "mimarlik", code: "MİM 101", name: "Temel Tasarım" },
  { id: "mimarlik-mim103", departmentId: "mimarlik", code: "MİM 103", name: "Mimari Çizim" },
  { id: "mimarlik-yap201", departmentId: "mimarlik", code: "YAP 201", name: "Yapı Bilgisi" },
  { id: "mimarlik-mim205", departmentId: "mimarlik", code: "MİM 205", name: "Mimarlık Tarihi" },
  { id: "mimarlik-mim301", departmentId: "mimarlik", code: "MİM 301", name: "Mimari Tasarım Stüdyosu" },
  { id: "mimarlik-kent302", departmentId: "mimarlik", code: "KENT 302", name: "Şehircilik" },
];

export function getUniversityById(id: string) {
  return universities.find((university) => university.id === id);
}

export function getDepartmentById(id: string) {
  return departments.find((department) => department.id === id);
}

export function getCourseById(id: string) {
  return academicCourses.find((course) => course.id === id);
}

export function getCoursesForDepartment(departmentId: string) {
  return academicCourses.filter((course) => course.departmentId === departmentId);
}
