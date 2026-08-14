export type University = {
  id: string;
  name: string;
  shortName: string;
  city: string;
};

export type Faculty = {
  id: string;
  universityId: string;
  name: string;
  shortName: string;
};

export type Department = {
  id: string;
  facultyId: string;
  name: string;
};

export type AcademicCourse = {
  id: string;
  departmentId: string;
  code: string;
  name: string;
};

export const universities: University[] = [
  {
    id: "omu",
    name: "Ondokuz Mayıs Üniversitesi",
    shortName: "OMÜ",
    city: "Samsun",
  },
];

export const faculties: Faculty[] = [
  { id: "muhendislik", universityId: "omu", name: "Mühendislik Fakültesi", shortName: "MÜH" },
  { id: "iibf", universityId: "omu", name: "İktisadi ve İdari Bilimler Fakültesi", shortName: "İİBF" },
  { id: "egitim", universityId: "omu", name: "Eğitim Fakültesi", shortName: "EĞT" },
  { id: "tip", universityId: "omu", name: "Tıp Fakültesi", shortName: "TIP" },
  { id: "hukuk", universityId: "omu", name: "Ali Fuad Başgil Hukuk Fakültesi", shortName: "HUK" },
];

export const departments: Department[] = [
  { id: "bilgisayar", facultyId: "muhendislik", name: "Bilgisayar Mühendisliği" },
  { id: "elektrik-elektronik", facultyId: "muhendislik", name: "Elektrik-Elektronik Mühendisliği" },
  { id: "makine", facultyId: "muhendislik", name: "Makine Mühendisliği" },
  { id: "iktisat", facultyId: "iibf", name: "İktisat" },
  { id: "isletme", facultyId: "iibf", name: "İşletme" },
  { id: "siyaset-kamu", facultyId: "iibf", name: "Siyaset Bilimi ve Kamu Yönetimi" },
  { id: "uluslararasi-ticaret", facultyId: "iibf", name: "Uluslararası Ticaret ve Lojistik" },
  { id: "pdr", facultyId: "egitim", name: "Rehberlik ve Psikolojik Danışmanlık" },
  { id: "sinif-ogretmenligi", facultyId: "egitim", name: "Sınıf Öğretmenliği" },
  { id: "matematik-ogretmenligi", facultyId: "egitim", name: "Matematik Öğretmenliği" },
  { id: "turkce-ogretmenligi", facultyId: "egitim", name: "Türkçe Öğretmenliği" },
  { id: "tip-programi", facultyId: "tip", name: "Tıp" },
  { id: "hukuk-programi", facultyId: "hukuk", name: "Hukuk" },
];

export const academicCourses: AcademicCourse[] = [
  { id: "bilgisayar-bil101", departmentId: "bilgisayar", code: "BİL 101", name: "Programlamaya Giriş" },
  { id: "bilgisayar-mat101", departmentId: "bilgisayar", code: "MAT 101", name: "Matematik I" },
  { id: "bilgisayar-fiz101", departmentId: "bilgisayar", code: "FİZ 101", name: "Fizik I" },
  { id: "bilgisayar-bil203", departmentId: "bilgisayar", code: "BİL 203", name: "Veri Yapıları" },
  { id: "elektrik-eem101", departmentId: "elektrik-elektronik", code: "EEM 101", name: "Elektrik-Elektroniğe Giriş" },
  { id: "elektrik-mat101", departmentId: "elektrik-elektronik", code: "MAT 101", name: "Matematik I" },
  { id: "elektrik-fiz101", departmentId: "elektrik-elektronik", code: "FİZ 101", name: "Fizik I" },
  { id: "elektrik-eem203", departmentId: "elektrik-elektronik", code: "EEM 203", name: "Devre Analizi" },
  { id: "makine-mak101", departmentId: "makine", code: "MAK 101", name: "Makine Mühendisliğine Giriş" },
  { id: "makine-mat101", departmentId: "makine", code: "MAT 101", name: "Matematik I" },
  { id: "makine-fiz101", departmentId: "makine", code: "FİZ 101", name: "Fizik I" },
  { id: "makine-mak203", departmentId: "makine", code: "MAK 203", name: "Statik" },
  { id: "iktisat-ikt101", departmentId: "iktisat", code: "İKT 101", name: "İktisada Giriş" },
  { id: "iktisat-mat101", departmentId: "iktisat", code: "MAT 101", name: "İktisatçılar İçin Matematik" },
  { id: "iktisat-ikt201", departmentId: "iktisat", code: "İKT 201", name: "Mikroiktisat" },
  { id: "iktisat-ikt202", departmentId: "iktisat", code: "İKT 202", name: "Makroiktisat" },
  { id: "isletme-isl101", departmentId: "isletme", code: "İŞL 101", name: "İşletmeye Giriş" },
  { id: "isletme-muh101", departmentId: "isletme", code: "MUH 101", name: "Finansal Muhasebe" },
  { id: "isletme-ikt101", departmentId: "isletme", code: "İKT 101", name: "İktisada Giriş" },
  { id: "isletme-paz201", departmentId: "isletme", code: "PAZ 201", name: "Pazarlama Yönetimi" },
  { id: "siyaset-sbky101", departmentId: "siyaset-kamu", code: "SBKY 101", name: "Siyaset Bilimine Giriş" },
  { id: "siyaset-huk101", departmentId: "siyaset-kamu", code: "HUK 101", name: "Hukukun Temel Kavramları" },
  { id: "siyaset-ikt101", departmentId: "siyaset-kamu", code: "İKT 101", name: "İktisada Giriş" },
  { id: "siyaset-sbky201", departmentId: "siyaset-kamu", code: "SBKY 201", name: "Türk Siyasal Hayatı" },
  { id: "ticaret-utl101", departmentId: "uluslararasi-ticaret", code: "UTL 101", name: "Uluslararası Ticarete Giriş" },
  { id: "ticaret-isl101", departmentId: "uluslararasi-ticaret", code: "İŞL 101", name: "İşletmeye Giriş" },
  { id: "ticaret-ikt101", departmentId: "uluslararasi-ticaret", code: "İKT 101", name: "İktisada Giriş" },
  { id: "ticaret-utl201", departmentId: "uluslararasi-ticaret", code: "UTL 201", name: "Lojistik Yönetimi" },
  { id: "pdr-pdr101", departmentId: "pdr", code: "PDR 101", name: "Rehberlik ve Psikolojik Danışmaya Giriş" },
  { id: "pdr-psk101", departmentId: "pdr", code: "PSK 101", name: "Psikolojiye Giriş" },
  { id: "pdr-egt101", departmentId: "pdr", code: "EĞT 101", name: "Eğitim Bilimine Giriş" },
  { id: "pdr-pdr201", departmentId: "pdr", code: "PDR 201", name: "Gelişim Psikolojisi" },
  { id: "sinif-sno101", departmentId: "sinif-ogretmenligi", code: "SNO 101", name: "İlkokulda Temel Öğrenme" },
  { id: "sinif-egt101", departmentId: "sinif-ogretmenligi", code: "EĞT 101", name: "Eğitim Bilimine Giriş" },
  { id: "sinif-tur101", departmentId: "sinif-ogretmenligi", code: "TÜR 101", name: "Türk Dili" },
  { id: "sinif-mat101", departmentId: "sinif-ogretmenligi", code: "MAT 101", name: "Temel Matematik" },
  { id: "matogret-ima101", departmentId: "matematik-ogretmenligi", code: "İMA 101", name: "Matematik Öğretimine Giriş" },
  { id: "matogret-mat101", departmentId: "matematik-ogretmenligi", code: "MAT 101", name: "Analiz I" },
  { id: "matogret-egt101", departmentId: "matematik-ogretmenligi", code: "EĞT 101", name: "Eğitim Bilimine Giriş" },
  { id: "matogret-ima201", departmentId: "matematik-ogretmenligi", code: "İMA 201", name: "Soyut Matematik" },
  { id: "turkce-tur101", departmentId: "turkce-ogretmenligi", code: "TÜR 101", name: "Türk Dili Bilgisi" },
  { id: "turkce-egt101", departmentId: "turkce-ogretmenligi", code: "EĞT 101", name: "Eğitim Bilimine Giriş" },
  { id: "turkce-edb101", departmentId: "turkce-ogretmenligi", code: "EDB 101", name: "Edebiyat Bilgileri" },
  { id: "turkce-tur201", departmentId: "turkce-ogretmenligi", code: "TÜR 201", name: "Çocuk Edebiyatı" },
  { id: "tip-tip101", departmentId: "tip-programi", code: "TIP 101", name: "Temel Tıp Bilimleri" },
  { id: "tip-tip102", departmentId: "tip-programi", code: "TIP 102", name: "Anatomi" },
  { id: "tip-tip103", departmentId: "tip-programi", code: "TIP 103", name: "Fizyoloji" },
  { id: "tip-tip201", departmentId: "tip-programi", code: "TIP 201", name: "Hastalıkların Biyolojik Temeli" },
  { id: "hukuk-huk101", departmentId: "hukuk-programi", code: "HUK 101", name: "Hukuka Giriş" },
  { id: "hukuk-med101", departmentId: "hukuk-programi", code: "MED 101", name: "Medeni Hukuk" },
  { id: "hukuk-ana101", departmentId: "hukuk-programi", code: "ANA 101", name: "Anayasa Hukuku" },
  { id: "hukuk-rom101", departmentId: "hukuk-programi", code: "ROM 101", name: "Roma Hukuku" },
];

export function getUniversityById(id: string) {
  return universities.find((university) => university.id === id);
}

export function getFacultyById(id: string) {
  return faculties.find((faculty) => faculty.id === id);
}

export function getDepartmentById(id: string) {
  return departments.find((department) => department.id === id);
}

export function getCourseById(id: string) {
  return academicCourses.find((course) => course.id === id);
}

export function getDepartmentsForFaculty(facultyId: string) {
  return departments.filter((department) => department.facultyId === facultyId);
}

export function getCoursesForDepartment(departmentId: string) {
  return academicCourses.filter((course) => course.departmentId === departmentId);
}
