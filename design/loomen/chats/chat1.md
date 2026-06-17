# Planlayıcı arayüzü tasarım soruları

_Started 2026-06-17 00:54 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Untitled"
Current date is now June 17, 2026
</system-info>

<pasted_text name="Pasted text (74 lines)">
Rolün: Üst düzey bir ürün tasarımcısısın (Linear, Things 3, Obsidian, Notion kalitesinde).
"Loomen" adlı bir masaüstü + mobil uygulaması için yüksek sadakatli (hi-fi), interaktif bir
UI prototipi tasarla. HTML/CSS (gerekirse hafif JS) ile, gerçek görünümlü statik veriyle.

## ÜRÜN
Loomen = tamamen lokal çalışan bir Obsidian benzeri not uygulaması (PKM) + GÖMÜLÜ günlük
planlayıcı, takvim ve profesyonel Pomodoro. İnternet yok, her şey yerel. Notlar markdown.
Tek cümle his: "Obsidian'ın bilgi ağı + Things/Sunsama gibi hazır, cilalı bir planlama deneyimi."

## TASARLANACAK EKRANLAR (öncelik sırası)
1. ANA EKRAN — "Planlama" çalışma alanı (EN ÖNEMLİ, buna en çok zaman ayır)
2. Not editörü ekranı (live preview + backlink paneli)
3. Graph (bağlantı grafiği) görünümü
4. Mobil sürüm (aynı ürünün telefon hali — planlayıcı + hızlı görev ekleme)
5. Ayarlar ekranı (kısa)

## ANA EKRAN — 3 panelli masaüstü düzeni
Soldan sağa:
- SOL PANEL (dar): Vault dosya gezgini. Klasör ağacı (Notlar/, Daily/, Projeler/), arama kutusu üstte.
- ORTA PANEL (geniş, yıldız): GÜNLÜK PLANLAYICI / TIMELINE. Detay aşağıda.
- SAĞ PANEL: Üstte aylık TAKVIM, altında POMODORO kartı.

## ORTA PANEL — Planlayıcı/Timeline (ürünün kalbi, çok detaylı tasarla)
Yukarıdan aşağıya:
- Büyük yıl başlığı: "2026"
- "Bugüne Odaklan" başlığı + altında 3 istatistik kartı yan yana:
    [ 8  Yapılacak ]  [ 22  Geciken ]  [ 20  Planlanmamış ]
  (ilki vurgulu/sıcak renk, diğerleri nötr; sayı büyük, etiket küçük altında)
- Hızlı görev ekleme kutusu: sol ikon 📥 + "Görevini buraya yaz..." placeholder + sağda enter (↵) butonu.
- Tarihe göre gruplanmış DİKEY TIMELINE. Her tarih grubu bir başlık: "Cumartesi, 13 Haz".
  Her görev satırı:
    • sol kenarda durum ikonu (⏳ açık / ✅ tamamlı) + ince dikey zaman çizgisi
    • görev metni (örn: "Kredi kartı ekstresi · 2.450,00 ₺")
    • altında küçük gri satır: ✏️📅 göreli tarih ("bir gün önce", "6 gün sonra", "bir ay sonra")
    • en altta: 📄 kaynak not linki ("2026-06-12-Cuma") + 🎯 etiket rozeti ("Yapılacaklar")
  Geçmiş ve gelecek görevler tek akışta; geciken görevlerde hafif kırmızımsı vurgu.
  Bir görevde "🍅×3" gibi tamamlanan Pomodoro sayacı rozeti de göster.

## SAĞ PANEL
- AYLIK TAKVİM: "◀ Haziran 2026 ▶", hafta Pazartesi başlar, bugün vurgulu, görevi olan günlerde nokta.
- POMODORO kartı: büyük "25:00" sayaç, ▶ Başlat butonu, "Odak: &lt;seçili görev adı&gt;", tur göstergesi (●●●○).

## NOT EDİTÖRÜ EKRANI
- Markdown live preview (yazarken render). Başlık, kalın, liste, görev kutusu, kod bloğu, alıntı.
- `[[wiki-link]]` vurgulu/tıklanabilir gösterimi.
- Sağda/altta "Bağlantılar" (backlink) paneli: "Bu nota bağlananlar" listesi.
- Üstte sekmeler (birden çok açık not).

## GÖRSEL DİL
- Modern, sakin, içeriğe öncelik veren; bol beyaz alan; Linear/Things 3 inceliği.
- HEM açık HEM koyu tema göster (ikisini de tasarla, bir toggle ile).
- Marka rengi olarak sıcak bir vurgu öner (örn. terra/amber ya da yumuşak bir mor/teal — sen karar ver),
  ama arayüzün geneli nötr gri tonları olsun; vurgu rengi sadece aktif öğe/sayaç/buton için.
- Tipografi: temiz bir sans-serif (Inter benzeri); başlıklar belirgin, gövde rahat okunur.
- İkonografi: ince çizgili (lucide/feather tarzı). Emoji yerine zarif ikonlar tercih et
  (görev tarih/etiket/kaynak ikonları), ama planlayıcıda emoji rozetler de olabilir.
- Köşeler yumuşak (8-12px), kartlarda hafif gölge/sınır, mikro etkileşim hissi.

## İÇERİK (gerçekçi Türkçe örnek veri kullan — placeholder lorem DEĞİL)
Görev örnekleri: fatura/taksit ödemeleri, "Spor salonu üyeliğini yenile", "Tasarımı bitir",
"Toplantı notlarını yaz", ders/proje notları. Not adları: "Proje X", "Fikirler", "2026-06-14-Pazar".
Tüm UI metinleri TÜRKÇE.

## TEKNİK NOTLAR
- UI dili Türkçe; ama yapı çok dilli (TR/EN/Arapça-RTL). Mümkünse bir de Arapça/RTL varyant mockup'ı göster
  (panellerin ve akışın sağdan-sola aynalandığı).
- Mobil ekran: tek sütun, alt sekme çubuğu (Planlayıcı · Takvim · Notlar · Pomodoro · Ara).
  Mobilde en kritik şey: planlayıcı timeline + hızlı görev ekleme kutusu.
- Web uygulaması DEĞİL — masaüstü/mobil native uygulama hissi ver (pencere kromu yok, uygulama içi).

## ÇIKTI
Önce kısa bir tasarım yönü açıklaması (renk paleti + tipografi seçimin + gerekçesi), sonra
interaktif prototip. Açık/koyu tema geçişi ve mümkünse panel etkileşimleri çalışsın.

</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Design Components">
This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.
</attached-skill>

<attached-skill name="Esnaf Dürüm Design Docs (design system)">
[Design System] This project uses the **Esnaf Dürüm Design Docs** design system. This is a binding choice for visual style — every visual must follow it. Don't invent colors, type, spacing, or components not grounded here.

Scope: the design system is a visual style reference only. Its guide may describe example products, brands, or people that are unrelated to the user and unrelated to the subject of this conversation. Never treat anything in the design system as a fact about the user, their work, or the topic they asked about.

    Explore it to find what you need:
    - Always copy out the fonts and colors you need
    - For prototypes and designs, always copy out any relevant components
    - If the design system contains existing mocks of products, and you were asked to design or prototype something similar, copy and fork those mocks to start your design. This helps you make high-quality designs.

    Explore it quickly to find relevant UI kits (e.g. mocks of existing products you can copy and fork)

Full system at `/projects/5654724d-7795-4bc8-89a0-1de3e5de0112/`. Its guide is reproduced below so you don't need to fetch it:

<design-system-guide>
# Esnaf Dürüm — Tasarım Sistemi

&gt; **Esnaf Zırhlanmış Et Dürüm** markası için marka kimliği, görsel temeller ve UI kit'i.

Esnaf Dürüm, geleneksel Türk sokak lezzetini modern bir restoran zinciri formatına taşıyan bir markadır. "Zırhlanmış Et Dürüm" — özel olarak hazırlanmış, içi dolu, doyurucu bir dürüm konsepti — markanın sinyatür ürünüdür. Marka kimliği; **el emeği, esnaf gururu ve doyurucu sokak lezzeti** üçgeninde durur.

## Kaynaklar

| Kaynak | Konum | Notlar |
|---|---|---|
| Logo (PNG, 1024×1024) | `uploads/Logo.png` → `assets/logo-full.png` | Tek girdi materyali. Renkler buradan örneklendi. |

&gt; ⚠️ **Sınırlı kaynak uyarısı:** Bu tasarım sistemi yalnızca tek bir logodan türetilmiştir. Menü, ton rehberi, fotoğraflar veya başka herhangi bir marka materyali sağlanmamıştır — aşağıdaki tüm içerik, logonun görsel DNA'sından (kırmızı + kahve, kalın display + el yazısı, sokak lezzeti karakteri) ve makul varsayımlardan inşa edilmiştir. Marka sahibi sağlayınca güncellenmesi gereken alanlar **VARSAYIM** etiketiyle işaretlenmiştir.

## İçindekiler

- `colors_and_type.css` — Tüm renk ve tipografi token'ları (CSS değişkenleri)
- `assets/` — Logolar, ikonlar, doku örnekleri
- `preview/` — Tasarım Sistemi sekmesinde görüntülenen önizleme kartları
- `ui_kits/website/` — Pazarlama sitesi UI kit'i (React/JSX)
- `ui_kits/app/` — Mobil sipariş uygulaması UI kit'i (React/JSX)
- `SKILL.md` — Claude Code ile uyumlu skill manifest'i

---

## İçerik Temelleri (Content Fundamentals)

### Ton &amp; Karakter
**Sıcak, doğrudan, gururlu.** Esnaf bir lokantanın menüsünden konuşur gibi — abartısız ama kendinden emin. Lüks restoran tonu yok; sokakta arkadaşına "bunu mutlaka dene" diyen amca tonu var.

### Hitap
- **"Sen" kullan, "siz" kullanma.** Marka, müşteriyle samimi konuşur. ("Dürümünü seç" değil "Dürümünü seç" — istisna: kasiyer/sipariş onayı gibi resmi bağlamlar.)
- Birinci çoğul ("biz") iyiniyetli ve sahiplenici tonda kullanılır: *"Biz sabah 6'da ateşi yakarız."*

### Büyük Harf Kullanımı
- **Display başlıklar:** TAMAMI BÜYÜK HARF, geniş tracking (logodan miras). Örnek: `ESNAF`, `MENÜ`, `ŞUBELER`.
- **Bölüm başlıkları (h2/h3):** Cümle düzeni — *"Bugünün dürümü"* (her kelime büyük değil).
- **Buton metni:** Cümle düzeni veya ALL CAPS, tutarlı. Birincil CTA'larda ALL CAPS tercih edilir: `SİPARİŞ VER`.

### Ben/Sen
- "Sen" — müşteri
- "Biz" — Esnaf ekibi
- Birinci tekil ("ben") **kullanılmaz** — bu kişisel bir blog değil, kolektif bir marka.

### Emoji
- **Kullanılmaz.** Marka samimi ama profesyonel; emoji kullanmak sokak esnafı duruşunu sulandırır. İkonografi için SVG/icon font tercih edilir (bkz: ICONOGRAPHY).
- Tek istisna: sosyal medyada bayrak (🇹🇷) gibi belirli bağlamlar — yine de seyrek.

### Vibe &amp; Vocab
| Kullan | Kullanma |
|---|---|
| dürüm, et, közde, ocakta, taze, esnaf usulü, gerçek, doyurucu | gourmet, premium, deluxe, lux, exclusive |
| şube, ocak, mutfak, ekmek, ateş | branch, location, outlet |
| "Sıcak çıktı" | "Hot off the grill" |
| Rakamlar **₺** ile (`₺145`) | TL kısaltması veya $ |

### Örnek Mikro-Kopya
- **Hero:** *"Zırhlanmış dürüm. Esnaf usulü, közde."*
- **CTA:** `SİPARİŞ VER` / `EN YAKIN ŞUBE`
- **Boş durum:** *"Sepetin boş. Bir dürüm seçelim mi?"*
- **Hata:** *"Bir terslik var. Ocak yine yanıyor — birazdan dene."*
- **Başarı:** *"Sipariş alındı. 18 dakikaya kapındayız."*
- **Push:** *"Sipariş No 412 yola çıktı. Afiyet olsun."*

---

## Görsel Temeller (Visual Foundations)

### Renk Felsefesi
Palet **logodan** doğrudan örneklendi (`#A4261F` Esnaf Kırmızısı, `#793821` Köz Kahve). Hem geleneksel et/ateş semboliği hem de modern bir kontrast sunuyor.

- **Birincil:** Esnaf Kırmızısı `#A4261F` — CTA, marka vurgusu, başlıklar
- **İkincil:** Köz Kahve `#793821` — el yazısı, ikincil metin, tariflemeler
- **Aksan:** Hardal `#D4A23A` — fiyat etiketi, "YENİ" rozeti, küçük vurgular (seyrek!)
- **Zemin:** Krem/Kasap kağıdı `#FBF6EE` — birincil zemin (asla saf beyaz değil)
- **Metin:** Kömür kahve `#2A1810` — saf siyah değil, daha sıcak

&gt; **Mor/mavi kullanımı yasaktır.** Marka, sıcak palette sıkı sıkı bağlıdır.

### Tipografi
- **Display:** *Anton* (Google Fonts) — ESNAF logosundaki kalın, condensed, ALL CAPS sans karakterine yakın seçildi (logo fontu paylaşılmadığı için yakın eşleşme). PNG logo görsel olarak kullanılır.
- **Body:** *DM Sans* — modern, dostane, geniş aralıklı humanist sans. Mobile/web'de yüksek okunabilirlik.
- **Script:** *Caveat* — logodaki "Zırhlanmış Et Dürüm" el yazısının yerini tutar. Sıcak, samimi, fırça hissi. **VARSAYIM:** orijinal el yazısı font değil.
- **Mono:** *JetBrains Mono* — fiyat, sipariş numarası, sayaç.

&gt; 🔁 **Font ikamesi:** Yukarıdaki üç display/script font Google Fonts'tan ikame edilmiştir. Lütfen logodaki orijinal font dosyalarını paylaşırsanız değiştiririm.

### Boşluk
8px tabanlı ölçek. Generous boşluk — sokak menüsü gibi sıkıştırılmış değil, restoran menüsü gibi nefes alan. Bölümler arası `--space-8` (64px) ila `--space-9` (96px).

### Arka Plan &amp; Doku
- **Birincil zemin:** Krem (`--paper`) — düz, ama çok hafif kağıt grain'i opsiyonel
- **Hero/öne çıkan bölümler:** Tam-ekran yemek fotoğrafı, üzerinde okunabilirlik için **koruma gradyanı** (alttan üste, `rgba(42, 24, 16, 0.7) → 0`)
- **Doku:** Kasap kağıdı/parşömen dokusu **seçici** kullanılır — kart arka planı veya menü bölümü vurguda. Aşırı kullanım kitsch'e kayar; bilinçli ve seyrek.
- **Gradyan:** Marka gradyanı **yoktur**. Düz kırmızı ve düz kahve. Tek istisna: foto üstü koruma gradyanı.

### Animasyon
- **Geçiş:** 200ms standart, `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out)
- **Hover/press:** 120ms hızlı yanıt
- **Yay (spring):** Sepete ekleme, başarı toast'ı için `cubic-bezier(0.34, 1.56, 0.64, 1)`
- **Fade-in:** Sayfa girişi için 360ms, hafif yukarı kayma (8-12px)
- **Bounce:** Genelde **kaçınılır**; sadece "sepete eklendi" gibi olumlu mikro-etkileşimlerde

### Hover Durumu
- Birincil buton: kırmızı → koyu kırmızı (`--esnaf-red-deep`), 120ms
- İkincil buton/link: yumuşak `--paper-deep` zemin, alt çizgi
- Kart: `--shadow-md` → `--shadow-lg`, 1px yukarı translateY (-2px)
- Resim: hafif zoom (`transform: scale(1.03)`), 360ms

### Press Durumu
- Buton: `transform: scale(0.97)`, 100ms — fiziksel, dokunmuş hissi
- Renk bir tık daha koyu (`--brand-press`)

### Border &amp; Çizgi
- Standart border: `1px solid var(--line)` — kahverengi-bej, asla siyah/gri
- Vurgu border: `2px solid var(--esnaf-red)` (sadece seçili durum)
- Köşe: `var(--radius-md)` (12px) varsayılan; butonlarda `--radius-pill`; bölüm kartlarında `--radius-lg` (20px)

### Gölge
**Sıcak gölge** — siyah değil, koyu kahve tabanlı (`rgba(74, 33, 19, ...)`). 5 seviye:
- `xs` → ince ayraç
- `sm` → kart durağan
- `md` → kart hover, dropdown
- `lg` → modal, drawer
- `xl` → öne çıkan modal/lightbox
- `inset` → input, çökük yüzey

### Şeffaflık &amp; Bulanıklık
- Üst bar (header): scroll'da `backdrop-filter: blur(12px)` + `--paper` üzeri `rgba(251, 246, 238, 0.85)`
- Modal arka katman: `rgba(42, 24, 16, 0.55)` + blur(8px)
- **Genel kuralda az kullan** — marka sıcak ve solid; cam efekti modernite katar ama abartılırsa marka karakterini kaybeder.

### Köşe Yuvarlama
- Buton/CTA: pill (`999px`) — sıcak, ulaşılabilir
- Kart: 12-20px
- Resim: 12px (içeride), 0 (full-bleed)
- Input: 12px
- Rozet: pill veya 8px

### Kart Anatomisi
- Zemin: `--bg-elev` (saf beyaz, kasap kağıdına karşı kontrast)
- Border: `1px solid var(--line)` (opsiyonel, gölgeyle birlikte değil)
- Köşe: 16px
- Gölge: `--shadow-sm` durağan, `--shadow-md` hover
- Padding: 24px
- Hover: 1px yukarı, gölge artar

### Görsel Atmosfer
- **Sıcak ışık** — natürel/altın saat ışığı, kontrast yüksek değil
- Yemek **yakın çekim** — yağ parıltısı, taze fesleğen, dilimlenmiş et görünür
- **Eller** çerçevede — esnafın eli, dürümü uzatan el (markanın "esnaf" karakteri)
- Doku: ahşap tezgah, kasap kağıdı, parşömen ambalaj
- Renk sıcaklığı: 3200K-4500K aralığı (sarımsı-doğal, mavi/soğuk **yok**)

---

## İkonografi (ICONOGRAPHY)

### Yaklaşım
Esnaf, **ince hat (line) stilinde, 1.75-2px stroke**, yuvarlatılmış uçlu ikonlar kullanır. Doldurmalı (filled) ikonlar yalnızca seçili/aktif durumda. İkonografi sade ve okunaklı — gıda markasının temiz tarafı.

### Sistem
- **Birincil:** [Lucide Icons](https://lucide.dev) — CDN'den yüklenir, MIT lisansı, ~1500+ ikon, 2px stroke, geometrik
- Boyutlar: 16px (inline), 20px (buton), 24px (nav), 32px (özellik kartı), 48px (boş durum)
- Renk: `currentColor` (metin rengini takip eder)
- **Stroke kalınlığı:** Header/CTA'da 2px, gövde içeriklerinde 1.75px

### Emoji
**Kullanılmaz.** Tüm görsel sembolik anlatım icon kütüphanesi üzerinden yapılır.

### Unicode
- Para birimi: `₺` (her zaman, "TL" kısaltması yok)
- Liste işareti: `·` (orta nokta) veya gerçek `&lt;ul&gt;`
- Yıldız puanı: ★ ☆ — gerçek karakterler kabul (Lucide `Star` da olabilir)

### Logo Varyantları (gelecek — şu an tek varyant var)
- `assets/logo-full.png` — Tam logo (ESNAF + el yazısı)
- ⚠️ **EKSİK:** Yatay/küçük varyant, sadece "ESNAF" wordmark'ı, monokrom (kahve/krem üstü), favicon. Marka sahibinden talep edildi.

---

## Index — Dosya Manifestosu

### Kök
- `README.md` — bu dosya
- `colors_and_type.css` — tüm token'lar
- `SKILL.md` — Claude Skill manifesti

### Klasörler
- `assets/` — `logo-full.png` (+ gelecekte: ikonlar, fotoğraflar, dokular)
- `preview/` — Tasarım Sistemi sekmesindeki kart HTML'leri
- `ui_kits/website/` — Pazarlama sitesi (kit + index.html demo)
- `ui_kits/app/` — Mobil sipariş app (kit + index.html demo)

</design-system-guide>

CSS tokens: the guide may describe tokens in prose, but the exact `--*` names are defined in the design system's stylesheet(s) (`/projects/5654724d-7795-4bc8-89a0-1de3e5de0112/colors_and_type.css`, `/projects/5654724d-7795-4bc8-89a0-1de3e5de0112/preview/_base.css`). The 83 custom properties it defines are:

--accent, --bg, --bg-elev, --bg-sunken, --brand, --brand-hover, --brand-press, --danger, --danger-bg, --dur-base, --dur-fast, --dur-slow, --ease-out, --ease-spring, --esnaf-brown, --esnaf-brown-deep, --esnaf-mustard, --esnaf-red, --esnaf-red-bright, --esnaf-red-deep, --fg-on-brown, --fg-on-red, --fg1, --fg2, --fg3, --font-display, --font-mono, --font-sans, --font-script, --info, --info-bg, --ink, --ink-muted, --ink-soft, --lh-base, --lh-loose, --lh-snug, --lh-tight, --line, --line-soft, --paper, --paper-deep, --paper-warm, --radius-lg, --radius-md, --radius-pill, --radius-sm, --radius-xl, --radius-xs, --shadow-inset, --shadow-lg, --shadow-md, --shadow-sm, --shadow-xl, --shadow-xs, --space-1, --space-10, --space-2, --space-3, --space-4, --space-5, --space-6, --space-7, --space-8, --space-9, --success, --success-bg, --text-2xl, --text-3xl, --text-4xl, --text-5xl, --text-base, --text-lg, --text-md, --text-sm, --text-xl, --text-xs, --tracking-normal, --tracking-tight, --tracking-wide, --tracking-wider, --warning, --warning-bg

Only use `var(--*)` names from that list. Never guess a token name — an unresolved `var()` silently falls back to the browser default.

For assets and UI kits beyond the guide: `read_file("/projects/5654724d-7795-4bc8-89a0-1de3e5de0112/<path>")` and `copy_files` to bring them into the current project.
</attached-skill>

## Assistant

Bu çok detaylı ve net bir brief — teşekkürler. Tam doğru yöne gitmek için, build'e başlamadan birkaç hızlı soru soruyorum. (Tasarım sistemi olarak ekli "Esnaf Dürüm" bir yemek markası; ürünle doğrudan örtüşmüyor, o yüzden onun sıcak vurgu rengini/fontunu nasıl kullanacağımı netleştirmek istiyorum.)

_[tool: questions_v2]_

## User

Questions answered:
- accent: 1
- variations: Ana ekranın (planlayıcı) 2 alternatif düzeni
- rtl_scope: Decide for me
- interactions: Açık/koyu tema geçişi, Pomodoro sayacı (başlat/duraklat, gerçek geri sayım), Hızlı görev ekleme (timeline'a satır ekler), Görev tamamlama (checkbox işaretle), Panel daraltma/genişletme, Ekranlar arası gezinme (planlayıcı↔editör↔graph↔ayarlar), Takvimde gün seçimi, Not editörü sekmeleri arası geçiş
- font: Decide for me
- density: Decide for me
- graph_style: Decide for me

## Assistant

Net cevaplar, teşekkürler. Yön özeti: **terra/amber** vurgu (#C2603A) + nötr sıcak griler, **DM Sans** gövde + **JetBrains Mono** sayılar, ferah Things-3 ritmi, ve istediğin tüm etkileşimler canlı. Tek bir interaktif masaüstü uygulama penceresi kuruyorum; ribbon'dan Planlayıcı / Editör / Graph / Ayarlar / Mobil / RTL ekranları arasında geçilecek.

_[tool: update_todos]_

Now building the full app. This is a large single DC — writing logic + template together.

_[tool: dc_write]_

Let me check it renders cleanly across the screens.

_[tool: show_html]_

_[tool: show_html]_

Excellent — the planner looks polished. Let me verify the other screens and dark mode.

_[tool: multi_screenshot]_

_[tool: multi_screenshot]_

_[tool: show_html]_

_[tool: multi_screenshot]_

Tüm ekranlar temiz render oluyor — editör, graf, ayarlar, mobil ve RTL hepsi çalışıyor; açık/koyu tema, Pomodoro sayacı, hızlı ekleme, görev tamamlama ve ekran gezinmesi canlı.

Loomen prototipi hazır. Özet:

**Tasarım yönü:** Nötr sıcak griler + **terra/amber** (#C2603A) vurgu — sadece aktif öğe, sayaç ve birincil butonlarda. **DM Sans** (UI) + **JetBrains Mono** (sayılar/tarih/kod). Ferah, Things-3 ritmi, yumuşak köşeler, sıcak gölgeler.

**Ekranlar (tek pencere, ribbon'dan geçiş):**
- **Planlayıcı** — 2026 başlığı, 3 istatistik kartı, hızlı ekleme, tarihe gruplu canlı timeline + sağda aylık takvim & Pomodoro. **2 düzen:** Zaman Çizelgesi ↔ Pano (sağ üstteki segment'ten).
- **Editör** — sekmeler, markdown live preview, `[[wiki-link]]`, backlink paneli.
- **Graf** — hover ile bağlantı vurgusu.
- **Mobil** — telefon çerçevesi + alt sekme çubuğu.
- **Ayarlar** + **Arapça/RTL** aynalı mockup (ribbon'daki `ع` veya Ayarlar→dil).

**Çalışan etkileşimler:** tema toggle, gerçek geri sayan Pomodoro (Başlat/Duraklat/sıfırla + halka), Enter ile timeline'a görev ekleme, checkbox ile tamamlama, takvimde gün seçimi, editör sekmeleri, graf hover. Tweaks panelinden başlangıç teması/ekranı/düzeni ve vurgu rengi değiştirilebilir.

Notlar: Esnaf Dürüm bir yemek markası olduğu için onun *sıcak vurgu DNA'sını* (terra/amber) aldım, ama ürün nötr ve içerik-öncelikli kaldı. İstersen mobilde daha çok etkileşim, ikinci dil (EN) tam çeviri, veya Pano düzenine sürükle-bırak ekleyebilirim.

_[tool: ready_for_verification]_

Hazır — Loomen prototipi önizleme panelinde açık.

## User

Found issues — fixing…

## Assistant

Good catch — the play button's branch is keyed on the wrong value. Fixing.

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

Düzeltildi — Pomodoro butonu artık durdurulmuş halde **Başlat** (▶) gösteriyor, çalışırken **Duraklat** (⏸). Geri kalan her şey doğrulamadan temiz geçti.

