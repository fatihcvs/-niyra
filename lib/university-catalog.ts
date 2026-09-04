import universityLogoCatalog from "../data/university-logos-2026.json" with { type: "json" };

export type UniversityRegion = "Türkiye" | "Kuzey Kıbrıs" | "Kıbrıs Cumhuriyeti";

type UniversityLogoRecord = { assetPath: string };
const universityLogoPaths = universityLogoCatalog.logos as Record<string, UniversityLogoRecord>;

export type University = {
  id: string;
  name: string;
  shortName: string;
  logoPath: string | null;
  city: string;
  region: UniversityRegion;
};

export const universityCatalogUpdatedAt = "2026-09-04";

export const universityCatalogSources = [
  "https://www.turkiye.gov.tr/universite-hizmet-listesi?theme=default",
  "https://www.yodak.gov.ct.tr/universiteler",
  "https://highereducation.ac.cy/index.php/en/citizens-info-serv-he-institutions-en",
  "https://www.dipae.ac.cy/en/?Itemid=643",
] as const;

const turkeyUniversityNames = [
  "Abdullah Gül Üniversitesi",
  "Acıbadem Mehmet Ali Aydınlar Üniversitesi",
  "Adana Alparslan Türkeş Bilim ve Teknoloji Üniversitesi",
  "Adıyaman Üniversitesi",
  "Afyon Kocatepe Üniversitesi",
  "Afyonkarahisar Sağlık Bilimleri Üniversitesi",
  "Ağrı İbrahim Çeçen Üniversitesi",
  "Ahmet Yesevi Üniversitesi",
  "Akdeniz Üniversitesi",
  "Aksaray Üniversitesi",
  "Alanya Alaaddin Keykubat Üniversitesi",
  "Alanya Üniversitesi",
  "Altınbaş Üniversitesi",
  "Amasya Üniversitesi",
  "Anadolu Üniversitesi",
  "Ankara Bilim Üniversitesi",
  "Ankara Hacı Bayram Veli Üniversitesi",
  "Ankara Medipol Üniversitesi",
  "Ankara Müzik ve Güzel Sanatlar Üniversitesi",
  "Ankara Sosyal Bilimler Üniversitesi",
  "Ankara Üniversitesi",
  "Ankara Yıldırım Beyazıt Üniversitesi",
  "Antalya Belek Üniversitesi",
  "Antalya Bilim Üniversitesi",
  "Ardahan Üniversitesi",
  "Artvin Çoruh Üniversitesi",
  "Atatürk Üniversitesi",
  "Atılım Üniversitesi",
  "Avrasya Üniversitesi",
  "Aydın Adnan Menderes Üniversitesi",
  "Bahçeşehir Üniversitesi",
  "Balıkesir Üniversitesi",
  "Bandırma Onyedi Eylül Üniversitesi",
  "Bartın Üniversitesi",
  "Başkent Üniversitesi",
  "Batman Üniversitesi",
  "Bayburt Üniversitesi",
  "Beykoz Üniversitesi",
  "Bezmialem Vakıf Üniversitesi",
  "Bilecik Şeyh Edebali Üniversitesi",
  "Bingöl Üniversitesi",
  "Biruni Üniversitesi",
  "Bitlis Eren Üniversitesi",
  "Boğaziçi Üniversitesi",
  "Bolu Abant İzzet Baysal Üniversitesi",
  "Burdur Mehmet Akif Ersoy Üniversitesi",
  "Bursa Teknik Üniversitesi",
  "Bursa Uludağ Üniversitesi",
  "Çağ Üniversitesi",
  "Çanakkale Onsekiz Mart Üniversitesi",
  "Çankaya Üniversitesi",
  "Çankırı Karatekin Üniversitesi",
  "Çukurova Üniversitesi",
  "Demiroğlu Bilim Üniversitesi",
  "Dicle Üniversitesi",
  "Doğuş Üniversitesi",
  "Dokuz Eylül Üniversitesi",
  "Düzce Üniversitesi",
  "Ege Üniversitesi",
  "Erciyes Üniversitesi",
  "Erzincan Binali Yıldırım Üniversitesi",
  "Erzurum Teknik Üniversitesi",
  "Eskişehir Osmangazi Üniversitesi",
  "Eskişehir Teknik Üniversitesi",
  "Fatih Sultan Mehmet Vakıf Üniversitesi",
  "Fenerbahçe Üniversitesi",
  "Fırat Üniversitesi",
  "Galatasaray Üniversitesi",
  "Gazi Üniversitesi",
  "Gaziantep İslam Bilim ve Teknoloji Üniversitesi",
  "Gaziantep Üniversitesi",
  "Gebze Teknik Üniversitesi",
  "Giresun Üniversitesi",
  "Gümüşhane Üniversitesi",
  "Hacettepe Üniversitesi",
  "Hakkari Üniversitesi",
  "Haliç Üniversitesi",
  "Harran Üniversitesi",
  "Hasan Kalyoncu Üniversitesi",
  "Hatay Mustafa Kemal Üniversitesi",
  "Hitit Üniversitesi",
  "Iğdır Üniversitesi",
  "Isparta Uygulamalı Bilimler Üniversitesi",
  "Işık Üniversitesi",
  "İbn Haldun Üniversitesi",
  "İhsan Doğramacı Bilkent Üniversitesi",
  "İnönü Üniversitesi",
  "İskenderun Teknik Üniversitesi",
  "İstanbul 29 Mayıs Üniversitesi",
  "İstanbul Arel Üniversitesi",
  "İstanbul Atlas Üniversitesi",
  "İstanbul Aydın Üniversitesi",
  "İstanbul Beykent Üniversitesi",
  "İstanbul Bilgi Üniversitesi",
  "İstanbul Esenyurt Üniversitesi",
  "İstanbul Galata Üniversitesi",
  "İstanbul Gedik Üniversitesi",
  "İstanbul Gelişim Üniversitesi",
  "İstanbul Kent Üniversitesi",
  "İstanbul Kültür Üniversitesi",
  "İstanbul Medeniyet Üniversitesi",
  "İstanbul Medipol Üniversitesi",
  "İstanbul Nişantaşı Üniversitesi",
  "İstanbul Okan Üniversitesi",
  "İstanbul Rumeli Üniversitesi",
  "İstanbul Sabahattin Zaim Üniversitesi",
  "İstanbul Sağlık ve Teknoloji Üniversitesi",
  "İstanbul Teknik Üniversitesi",
  "İstanbul Ticaret Üniversitesi",
  "İstanbul Topkapı Üniversitesi",
  "İstanbul Üniversitesi",
  "İstanbul Üniversitesi-Cerrahpaşa",
  "İstanbul Yeni Yüzyıl Üniversitesi",
  "İstinye Üniversitesi",
  "İzmir Bakırçay Üniversitesi",
  "İzmir Demokrasi Üniversitesi",
  "İzmir Ekonomi Üniversitesi",
  "İzmir Katip Çelebi Üniversitesi",
  "İzmir Tınaztepe Üniversitesi",
  "İzmir Yüksek Teknoloji Enstitüsü",
  "Kadir Has Üniversitesi",
  "Kafkas Üniversitesi",
  "Kahramanmaraş İstiklal Üniversitesi",
  "Kahramanmaraş Sütçü İmam Üniversitesi",
  "Kapadokya Üniversitesi",
  "Karabük Üniversitesi",
  "Karadeniz Teknik Üniversitesi",
  "Karamanoğlu Mehmetbey Üniversitesi",
  "Kastamonu Üniversitesi",
  "Kayseri Üniversitesi",
  "Kırıkkale Üniversitesi",
  "Kırklareli Üniversitesi",
  "Kırşehir Ahi Evran Üniversitesi",
  "Kilis 7 Aralık Üniversitesi",
  "Kocaeli Sağlık ve Teknoloji Üniversitesi",
  "Kocaeli Üniversitesi",
  "Koç Üniversitesi",
  "Konya Gıda ve Tarım Üniversitesi",
  "Konya Teknik Üniversitesi",
  "KTO-Karatay Üniversitesi",
  "Kütahya Dumlupınar Üniversitesi",
  "Kütahya Sağlık Bilimleri Üniversitesi",
  "Lokman Hekim Üniversitesi",
  "Malatya Turgut Özal Üniversitesi",
  "Maltepe Üniversitesi",
  "Manisa Celal Bayar Üniversitesi",
  "Mardin Artuklu Üniversitesi",
  "Marmara Üniversitesi",
  "MEF Üniversitesi",
  "Mersin Üniversitesi",
  "Milli Savunma Üniversitesi",
  "Mimar Sinan Güzel Sanatlar Üniversitesi",
  "Mudanya Üniversitesi",
  "Muğla Sıtkı Koçman Üniversitesi",
  "Munzur Üniversitesi",
  "Muş Alparslan Üniversitesi",
  "Necmettin Erbakan Üniversitesi",
  "Nevşehir Hacı Bektaş Veli Üniversitesi",
  "Niğde Ömer Halisdemir Üniversitesi",
  "Nuh Naci Yazgan Üniversitesi",
  "Ondokuz Mayıs Üniversitesi",
  "Ordu Üniversitesi",
  "Orta Doğu Teknik Üniversitesi",
  "Osmaniye Korkut Ata Üniversitesi",
  "OSTİM Teknik Üniversitesi",
  "Özyeğin Üniversitesi",
  "Pamukkale Üniversitesi",
  "Piri Reis Üniversitesi",
  "Recep Tayyip Erdoğan Üniversitesi",
  "Sabancı Üniversitesi",
  "Sağlık Bilimleri Üniversitesi",
  "Sakarya Uygulamalı Bilimler Üniversitesi",
  "Sakarya Üniversitesi",
  "Samsun Üniversitesi",
  "SANKO Üniversitesi",
  "Selçuk Üniversitesi",
  "Siirt Üniversitesi",
  "Sinop Üniversitesi",
  "Sivas Bilim ve Teknoloji Üniversitesi",
  "Sivas Cumhuriyet Üniversitesi",
  "Süleyman Demirel Üniversitesi",
  "Şırnak Üniversitesi",
  "Tarsus Üniversitesi",
  "TED Üniversitesi",
  "Tekirdağ Namık Kemal Üniversitesi",
  "TOBB Ekonomi ve Teknoloji Üniversitesi",
  "Tokat Gaziosmanpaşa Üniversitesi",
  "Toros Üniversitesi",
  "Trabzon Üniversitesi",
  "Trakya Üniversitesi",
  "Türk Hava Kurumu Üniversitesi",
  "Türk-Alman Üniversitesi",
  "Türk-Japon Bilim ve Teknoloji Üniversitesi",
  "Ufuk Üniversitesi",
  "Uşak Üniversitesi",
  "Üsküdar Üniversitesi",
  "Van Yüzüncü Yıl Üniversitesi",
  "Yalova Üniversitesi",
  "Yaşar Üniversitesi",
  "Yeditepe Üniversitesi",
  "Yıldız Teknik Üniversitesi",
  "Yozgat Bozok Üniversitesi",
  "Yüksek İhtisas Üniversitesi",
  "Zonguldak Bülent Ecevit Üniversitesi",
] as const;

const northCyprusUniversityNames = [
  "Ada Kent Üniversitesi",
  "Akdeniz Karpaz Üniversitesi",
  "Altınbaş Kıbrıs Üniversitesi",
  "Ankara Sosyal Bilimler Üniversitesi",
  "Arkın Yaratıcı Sanatlar ve Tasarım Üniversitesi",
  "Avrupa Liderlik Üniversitesi",
  "Bahçeşehir Kıbrıs Üniversitesi",
  "Doğu Akdeniz Üniversitesi",
  "Girne Amerikan Üniversitesi",
  "Girne Üniversitesi",
  "İTÜ-KKTC Eğitim Araştırma Yerleşkeleri",
  "Kıbrıs Amerikan Üniversitesi",
  "Kıbrıs Aydın Üniversitesi",
  "Kıbrıs Batı Üniversitesi",
  "Kıbrıs Sağlık ve Toplum Bilimleri Üniversitesi",
  "Lefke Avrupa Üniversitesi",
  "ODTÜ Kuzey Kıbrıs Kampüsü",
  "Onbeş Kasım Kıbrıs Üniversitesi",
  "Rauf Denktaş Üniversitesi",
  "Uluslararası Alasya Üniversitesi",
  "Uluslararası Final Üniversitesi",
  "Uluslararası Kıbrıs Üniversitesi",
  "Yakın Doğu Üniversitesi",
] as const;

const republicOfCyprusUniversityNames = [
  "University of Cyprus",
  "Open University of Cyprus",
  "Cyprus University of Technology",
  "European University Cyprus",
  "Frederick University",
  "University of Nicosia",
  "Neapolis University Pafos",
  "University of Central Lancashire Cyprus (UCLan Cyprus)",
  "Philips University",
  "American University of Cyprus (AUCY)",
  "University of Limassol",
  "American University of Beirut – Mediterraneo",
  "Cosmos Open University",
  "National and Kapodistrian University of Athens – Cyprus Branch",
] as const;

const shortNameAliases: Record<string, string> = {
  "Ondokuz Mayıs Üniversitesi": "OMÜ",
  "Orta Doğu Teknik Üniversitesi": "ODTÜ",
  "İstanbul Teknik Üniversitesi": "İTÜ",
  "İstanbul Üniversitesi-Cerrahpaşa": "İÜC",
  "İhsan Doğramacı Bilkent Üniversitesi": "BİLKENT",
  "Doğu Akdeniz Üniversitesi": "DAÜ",
  "Yakın Doğu Üniversitesi": "YDÜ",
  "Uluslararası Kıbrıs Üniversitesi": "UKÜ",
  "Lefke Avrupa Üniversitesi": "LAÜ",
  "University of Cyprus": "UCY",
  "Open University of Cyprus": "OUC",
  "Cyprus University of Technology": "CUT",
  "University of Nicosia": "UNIC",
};

function catalogSlug(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function makeAcademicShortName(value: string) {
  const alias = shortNameAliases[value];
  if (alias) return alias;
  const stopWords = new Set(["universitesi", "universitesi-cerrahpasa", "university", "of", "ve", "and", "the", "kampusu", "yerleskeleri", "cyprus", "kibris"]);
  const words = catalogSlug(value).split("-").filter((word) => word && !stopWords.has(word));
  const initials = words.map((word) => word[0]).join("").slice(0, 5);
  const readable = initials.length >= 2 ? initials : (words[0] ?? catalogSlug(value)).slice(0, 3);
  return (readable || "ÜNİ").toLocaleUpperCase("tr-TR");
}

function makeUniversity(name: string, region: UniversityRegion): University {
  const isOmu = name === "Ondokuz Mayıs Üniversitesi" && region === "Türkiye";
  const prefix = region === "Türkiye" ? "tr" : region === "Kuzey Kıbrıs" ? "kktc" : "cy";
  const id = isOmu ? "omu" : `${prefix}-${catalogSlug(name)}`;
  return {
    id,
    name,
    shortName: makeAcademicShortName(name),
    logoPath: universityLogoPaths[id]?.assetPath ?? null,
    city: isOmu ? "Samsun" : region,
    region,
  };
}

export const universities: University[] = [
  ...turkeyUniversityNames.map((name) => makeUniversity(name, "Türkiye")),
  ...northCyprusUniversityNames.map((name) => makeUniversity(name, "Kuzey Kıbrıs")),
  ...republicOfCyprusUniversityNames.map((name) => makeUniversity(name, "Kıbrıs Cumhuriyeti")),
].sort((left, right) => left.name.localeCompare(right.name, "tr-TR"));
