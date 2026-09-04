# Üniyra profil düzenleme araştırması

Audience: Üniyra ürün ve geliştirme ekibi  
Date: 4 Eylül 2026  
Scope: Instagram'ın güncel profil düzenleme modelinden Üniyra öğrenci profiline aktarılabilecek alanlar.

## Doğrudan sonuç

Instagram'ın temel profil kimliği görünen ad, kullanıcı adı ve profil fotoğrafı/avatardan oluşuyor. Meta'nın resmî yardım içeriği bu alanların hesaplar arasında eşitlenebildiğini ve kullanıcı adının profil kimliği olarak kullanıldığını doğruluyor. Meta ayrıca profil içine en fazla beş bağlantı ekleme özelliğini resmî olarak duyurdu. Üniyra bu çekirdeği profil fotoğrafı, görünen ad, benzersiz kullanıcı adı, 150 karakterlik biyografi ve en fazla beş bağlantı olarak kullanmalı; okul, fakülte, bölüm, sınıf ve ders çevreleri ise ayrı akademik düzenleme alanında kalmalı.

Instagram'ın standart kişisel profil modelinde bir kapak/banner alanı belgelenmiyor. Bu negatif bulgu doğrudan bir "banner yoktur" belgesine değil, Meta'nın belgelenen profil alanları ve mevcut ürün yapısına dayalı bir çıkarımdır. Kullanıcı bunu özellikle istediği için kapak görseli Instagram kopyası olarak değil, Üniyra'ya özgü kampüs kimliği katmanı olarak uygulanır.

## Uygulama kararları

- Profil fotoğrafı gönderi, yorum, öğrenci dizini ve profil ekranında tekrar kullanılır.
- Kullanıcı adı 3-30 karakterdir; küçük harf, rakam, nokta ve alt çizgi kabul edilir. Çakışma kontrolü sunucuda yapılır.
- Biyografi 150 karakterle sınırlandırılır. Bu Üniyra ürün kararıdır; araştırmada Meta'nın güncel resmî karakter sınırına erişilemedi.
- En fazla beş `http` veya `https` bağlantısı başlıkla birlikte saklanır. Tehlikeli protokoller reddedilir.
- Kapak görseli Üniyra'ya özgüdür ve profilin kampüs/kişilik anlatımını güçlendirir.
- Akademik bilgiler aynı editörde özetlenir ancak ayrı, doğrulanabilir katalog akışında düzenlenir.

## Sınırlamalar ve ayrışan kanıt

Meta yardım sayfaları bazı oturumlarda giriş ekranına yönlendirebildiği için içerik arama dizini üzerinden de kontrol edildi. Beş bağlantı özelliği için Meta'nın resmî duyurusu birincil kaynaktır. Bağlantıların başlıklandırılması ve sıralanması TechCrunch'ın Meta açıklamasına dayalı ürün incelemesiyle desteklendi; Üniyra'nın ilk sürümünde sıralama ekleme sırasını korur.

## Claim-to-source ledger

- Profile identity fields: "Sync your profile information across your accounts", Instagram Help Center / Meta, accessed 4 September 2026. https://www.facebook.com/help/instagram/451345223552070
- Instagram profile/account info includes name and username: "Update Instagram profile information such as your name, username and email address", Instagram Help Center / Meta, accessed 4 September 2026. https://www.facebook.com/help/instagram/358911864194456
- Up to five profile links: "Instagram introduces new features to help free self-expression", Meta, 26 April 2023. https://about.fb.com/ko/news/2023/04/instagram%EC%9D%B4-%EC%9E%90%EC%9C%A0%EB%A1%9C%EC%9A%B4-%EC%9E%90%EA%B8%B0%ED%91%9C%ED%98%84%EC%9D%84-%EB%8F%95%EB%8A%94-%EC%83%88%EB%A1%9C%EC%9A%B4-%EA%B8%B0%EB%8A%A5%EC%9D%84-%EC%84%A0%EB%B3%B4/
- Link titles and ordering behavior: "Instagram takes on Linktree and others with support for up to 5 links in bio", TechCrunch, Sarah Perez, 18 April 2023. https://techcrunch.com/2023/04/18/instagram-takes-on-linktree-and-others-with-support-for-up-to-5-links-in-bio/

Research stopped after the profile identity, link capacity and banner distinction had sufficient support to make the implementation decision; further searches were unlikely to change this MVP field set.
