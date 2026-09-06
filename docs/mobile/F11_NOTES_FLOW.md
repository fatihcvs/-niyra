# F11 — Notlar akışı, kompakt kartlar ve taslak koruması

5 Eylül 2026. Bu kayıt gerçek NotesWorkspace ve note-actions API değişikliklerini kapsar. Tarayıcı kanıtı geliştirme galerisindeki açık simülasyondur; gerçek kullanıcı hesabı, dosya yükleme veya fiziksel Android kabulü değildir.

## Kullanıcıya yansıyan değişiklikler

- Büyük dosya kapağı yerine 64 px belge işareti, ders/kaynak bilgisi ve tam genişlikte üç eylem kullanılır. Koyu temada açık renkli düğmeler ve düşük kontrastlı etiketler ortak tema renklerine bağlandı. Dönemi bilinmeyen not artık Yaz diye etiketlenmez; “Dönem belirtilmemiş” gösterilir. Tür adları Türkçedir.
- Mobil filtre, not detayı ve yükleme formu ortak katman yığınını kullanır. 320 px uzun başlık kapat düğmesini sıkıştıramaz: düğme 48×48 px kalır. Dış overlay kaymaz; detayın içi tek kaydırma alanıdır.
- Yorum taslağı not kimliğine ve oturum sahibine bağlıdır. Back/Forward veya başka nota geçiş taslakları karıştırmaz. Aynı karede yinelenen gönderim ikinci isteği başlatmaz; hata metni ilgili detayın içinde görünür ve taslak korunur.
- Kaydet/faydalı/faydasız işlemlerinde arayüz bekleyen durumu gösterir; başarısızlık önceki değere döner. İşlem beklerken Back yapıp Forward ile açmak eski optimistic sonucu diriltmez. Onaylanmış silme eski detayın history ile yeniden açılmasını engeller.
- Not yükleme isteği 120 saniyeyle sınırlıdır. Ağ, timeout veya iptal sonucu belirsizse form bunu açıkça söyler, dosya/taslağı korur ve yeniden göndermeden önce Notlarım'ın kontrol edilmesini ister. Bileşen kaldırılınca XHR callback'leri temizlenir ve istek iptal edilir.

## Gerçek API ve durum sözleşmesi

`app/api/note-actions/route.ts` isteğe bağlı `active:boolean` kabul eder. Aynı istenen kayıt/oy durumunun yeniden gönderilmesi durumu tersine çevirmez. Eski istemcinin `active` içermeyen toggle davranışı korunur. Null, dizi veya boolean olmayan değerler mutasyondan önce reddedilir.

Kaydetme eklemesi/çıkarılması ve oy değişikliği gerçek değişimi `RETURNING` ile ayırır; audit yalnız gerçekleşen değişime yazılır. Eski bir “faydalı oyunu kaldır” isteği sonradan verilmiş faydasız oyunu silemez. Yanıt sunucudaki son oyu döndürür. Kampüs, yayımlanma, profil, oturum ve rate limit sınırları korunur; migration gerekmez.

`app/use-scoped-requests.ts`, önceki FeedPost helper'ının ortak sahibidir; eski `usePostRequests` adı uyumluluk için dışa aktarılır. Fetch ve JSON gövdesinin tamamında 20 saniye, owner/lifecycle kontrolü ve iptal vardır. Transport abort sinyalini yutsa bile bekleme sonsuz olmaz; eski hesabın geç cevabı yeni hesaba uygulanmaz. Aktif 401 gövdesi okunmadan oturum sonlandırma akışına gider.

`NotesWorkspace` owner, başlangıç dersi ve kaynak değişiminde yeniden kurulur. Not başına yorum ve hata durumu, görünür detay ve Back/Forward snapshot'ları ayrı hedeflerle güncellenir. Liste yenilemesinde görünmeyen bir not silinmiş varsayılmaz. Her GET sonucunun açık detay snapshot'ını otomatik yenilemesi bu teslimde eklenmedi; bekleyen yerel işlemi eski GET ile ezmemek gerekir.

## Galeri ve test kanıtı

`app/design-lab/notes-example.ts` iki açıkça sentetik not sağlar. Galeri artık başlık benzeri bir sunum yerine aynı gerçek NotesWorkspace bileşenini kullanır. Development kapısı ve açık preview nesnesi vardır. Filtre, detay, yorum, kaydet, silme ve yükleme paneli galeri içinde çalışır; fetch/XHR, gerçek dosya önizlemesi veya gerçek paylaşım başlatmaz.

- `tests/notes-interactions-runtime.test.mjs`: **9/9** gerçek ReactDOM senaryosu; hedef/taslak ayrımı, eski owner/gövde, çift eylem, optimistic rollback, Back/Forward snapshot, detay içi hata, dosyalı timeout ve cleanup.
- `tests/note-actions-state-api.test.mjs`: **4/4** gerçek route ve fresh SQLite; desired retry/concurrent save, karşıt oy, bozuk payload, auth/kampüs/yayımlanma/rate limit. Mevcut yerel veya uzak veritabanı kullanılmaz.
- `tests/design-lab-runtime.test.mjs`: **8/8**, bir yeni gerçek Notlar akışı dahil. Galeride gerçek ağ/dosya yüklemesi olmaması ayrıca doğrulanır.
- Mevcut FeedPost'un **12/12** davranış testi ortak helper'a taşınma sonrasında geçti. Bu sayılar birleşik suite'in alt kümeleridir; birbirlerine eklenerek yeni toplam çıkarılmaz.

Seçili CUA kanıtı `exports/mobile-quality-continuation-2026-09-05/` içindedir:

- `notes-list-390-dark.png` ve `notes-list-390-dark-after.png`: aynı genişlik/tema üzerinde birlikte görsel karşılaştırıldı; belge alanı küçüldü, üç eylem tek satıra geldi, koyu tema okunurluğu düzeldi.
- `notes-detail-320-light.json` ve `notes-comment-320-light.png`: dialog `(0,0,320,568)`, dış overlay `overflow:clip/scrollTop:0`, kapatma 48×48, yorum gönderme 48 px yüksekliğinde; Back/Forward yorum taslağını korudu.
- `notes-filter-dynamic-isolation.json` ve `notes-filter-320-dark.png`: filtre değiştikten sonra yeni chip/kartlar arka planda `inert:true`, dialog `inert:false`. Bu ayrı ortak katman düzeltmesinin ayrıntısı [F04](F04_NAVIGATION_STATUS.md) içindedir.

CSS sahipliği taşıması [F05](F05_WORKSPACE_CSS.md) belgesindedir. Kart ve overlay değişiklikleri kasıtlı ürün düzeltmeleridir; eski cascade eşdeğerliği testlerinin piksel kanıtı gibi gösterilmez.

## Açık kalan sınırlar

Gerçek hesapla kaynak→not→yorum/yükleme zinciri; bütün kaynak/rol/tema/masaüstü matrisi; fiziksel IME, TalkBack, büyük dosya ve gerçek ağ kabulü açıktır. Upload POST için kalıcı idempotency anahtarı eklenmedi: tek bekleyen isteği engellemek, kayıp yanıt sonrası farklı tekrarların sunucuda kesin tekilleştirilmesi değildir. Taslaklar bu workspace için JS oturum belleğindedir; gönderi composer'ının ayrı IndexedDB kalıcılığı burada varmış sayılmaz. Deploy veya Play yayını yapılmadı.
