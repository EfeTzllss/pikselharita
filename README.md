# Piksel Harita

Türkiye'nin OpenStreetMap verisinden piksel piksel çizilen, yakınlaştırılabilir haritası: https://pikselharita.com

Bu depo Cloudflare Pages'te doğrudan yayınlanır; derleme adımı yoktur (çıktı klasörü: depo kökü).

- `index.html`: sitenin tamamı (ana sayfa + harita)
- `data/`: Türkiye ve İstanbul harita verisi, `devlog.json` (haritadaki bölgeler)
- `assets/`: logo, simge ve fontlar
- `_worker.js`: Instagram devlogu (`/api/devlog`); @piksel.harita'nın fotoğraf ve kaydırmalı gönderileri, Reels ve videolar hariç
- `_headers`: önbellek ve güvenlik başlıkları

Cloudflare ayarları: `IG_TOKEN` (gizli, Instagram erişim anahtarı) ve `IG_KV` (KV deposu, anahtarın kendiliğinden yenilenmesi için).
