# Yazı tipi yollarının taşınabilirliği

Gerçek derlenmiş uygulamanın izole tarayıcı kontrolünde font istekleri 404 dönüyordu. Önceden kaydedilmiş Vinext font CSS'i başka bir makineye ait `/workspace/sites/uniyra/.vinext/fonts` mutlak yolunu içeriyordu. Windows build bu yolu değiştirmeden kullanıyordu; kullanıcı yedek yazı tipini görüyordu.

`app/fonts.css` mevcut, sürüm kontrolündeki 11 Geist / Geist Mono WOFF2 dosyasını göreli Vite varlıkları olarak kullanır. Font dosyaları değiştirilmedi. Ağırlık aralığı, Latin extended / Türkçe karakterler ve font-display davranışı korunur. `app/layout.tsx` makineye bağımlı font indirme önbelleği yerine bu CSS'i içe aktarır.

`tests/font-assets.test.mjs` 11 göreli yolun gerçekten mevcut WOFF2 dosyaları olduğunu ve iki ailede Türkçe karakter aralığının korunduğunu kontrol eder. Son derlenmiş tarayıcıda HTTP ve font hazır oluş kontrolü ayrıca gerekir; bir dosya testi bunu temsil etmez.

Font kaynağı [Vercel Geist](https://github.com/vercel/geist-font), lisansı [SIL Open Font License 1.1](https://github.com/vercel/geist-font/blob/main/LICENSE.txt). Resmî lisansın kopyası dağıtılan `public/licenses/geist-OFL.txt` dosyasındadır.
