# Loomen - ajan calisma kurallari

<!-- repo-agents-md-uret.py tarafindan uretildi -->

## 0. Once bunu yap

Bu repoda `CLAUDE.md` yok; kurallar bu dosyada ve `DathaDocs/DathaWiki/` defterindedir.
Ayrintili kurallar, mimari ve modul haritasi orada. Bu dosya yalnizca ozettir;
celiski olursa **bu dosya kazanir**.

## 1. Dil

- Kullaniciya yazilan **her metin Turkce**. Kod, degisken ve commit mesaji repo
  dilinde kalir.
- Aciklamalar kisa, yalin, jargonsuz. Kullanici teknik degil (isletme sahibi).
- Denetim listelerinde teknik terim kullanma: endpoint, migration, webhook,
  controller, token, cron... Gundelik karsiligini yaz.

## 2. AI imzasi YASAK

Commit mesaji, PR aciklamasi ve kodda **Claude / Codex / GPT / AI imzasi veya
attribution kesinlikle yok**: `Co-Authored-By:`, `Generated with ...`,
oturum linki - hicbiri eklenmez.

## 3. Commit ve push

- Yapilan her is commit edilir ve GitHub'a push edilir; ayrica onay istenmez.
- Sart: testler yesil.
- Dogrulanmamis / riskli is `main`'e degil **`fix/DAT-NNN`** dalina gider.
  Sebep: paralel oturumlar ayni checkout'u paylasiyor, `main`'deki yerel commit
  baskasinin push'uyla canliya sizabilir.

## 4. Veri guvenligi - KATI

- Magaza **1008 (Esnaf Durum)** ve **1019 / 1025** canli beta musterileridir.
  Veri kaybi riski tasiyan hicbir islem onay alinmadan yapilmaz.
- Magaza 1007 deneme ortamidir.
- Sir iceren dosyalari (`.env`, anahtar, sertifika) commit'e sokma.

## 5. DAT karti

- Yapilan her is icin DathaMaster'da DAT karti acilir. **"Kart acayim mi?" diye
  sorma** - acmak ve kapatmak isin parcasidir, sonuc raporlanir.
- Testi ajan bitirebiliyorsa **DONE**, kullanici fiilen test edecekse
  **AWAITING_APPROVAL**.
- Is bitince karta yorum yaz: (1) ne yaptim - sade 3-6 madde, (2) nasil test
  edeceksin - hangi ekran, hangi buton, ne gormeli.
- **Kullanicinin yazdigi aciklama asla ezilmez.**

## 7. Bu repoya ozel

> **Bu repo Datha ekosistemine ait DEGILDIR.** Loomen = local-first Tauri
> Obsidian klonu. DAT karti akisi burada **yoktur**.

- Lisans: public / PolyForm-NC. CLA GitHub Action ile yurutulur (cla-assistant.io
  degil); check adi "CLA Assistant".
- Commit/push/PR'larda Claude veya AI imzasi **yasak** (ilk repo dahil).
- macOS diktesi yalniz paketli `.app`'te calisir, `tauri dev` binary'sinde asla.
- Demo/ornek veri **kurgusal** olmali; ekran goruntusunu tarayici veya ornek
  modda al.

## 6. Kalici hafiza (yalniz yerel calismada)

Yerelde calisiyorsan ortak hafiza deposu:
`~/.claude/projects/-Users-omerfarukerol/memory/` - `MEMORY.md` indeksini oku,
ilgili dosyayi ac. Yeni kalici bilgi cikarsa ayni bicimde dosya yaz ve
`MEMORY.md`'ye tek satir isaretci ekle. (Cloud ortaminda bu dizin yoktur -
oradaki kalici bilgi bu dosyaya ve `CLAUDE.md`'ye yazilir.)
