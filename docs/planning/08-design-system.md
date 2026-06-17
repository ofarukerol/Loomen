# 08 — Tasarım Sistemi (UI Spec)

> **Kaynak:** Claude Design'da üretilen interaktif prototip → `design/loomen/project/Loomen.dc.html`
> **Token dosyası:** `design/tokens.css` (gerçek uygulamaya doğrudan import edilebilir)
> **Amaç:** Prototipin görsel kararlarını (renk, tipografi, ölçü, bileşen, etkileşim) sabitlemek;
> kod fazında **birebir (pixel-perfect)** yeniden üretim için referans olmak.
> **Önceki:** [`07-i18n.md`](07-i18n.md) · **İndeks:** [`00-README.md`](00-README.md)

> Prototip bir HTML/CSS taslağıdır (üretim kodu değil). İş: görsel çıktıyı React/Tauri'de
> **eşlemek** — prototipin iç yapısını kopyalamak değil. Token'lar `design/tokens.css`'te hazır.

---

## 1. Tasarım Yönü

**Nötr sıcak griler + terra/amber vurgu.** His: Linear/Things 3 inceliği, ferah ritim, içerik-öncelikli.
Vurgu rengi **yalnızca** aktif öğe, sayaç ve birincil butonlarda; gerisi nötr. Saf beyaz/siyah yok —
zeminler hafif sıcak (kasap kağıdı `#FAF9F6`), metin sıcak kömür (`#211F1B`). Yumuşak köşeler,
kahve-tabanlı sıcak gölgeler.

---

## 2. Renk Token'ları

Tam liste `design/tokens.css`'te. Özet:

| Rol | Açık | Koyu |
|-----|------|------|
| Zemin `--bg` | `#FAF9F6` | `#191815` |
| Yüzey `--bg-elev` | `#FFFFFF` | `#232220` |
| Çökük `--bg-sunken` | `#F1EFEA` | `#141311` |
| Metin `--fg1/2/3` | `#211F1B` / `#6E6A62` / `#A29D93` | `#ECEAE4` / `#A19D95` / `#6C685F` |
| Çizgi `--line` | `#E9E6DF` | `#322F2A` |
| **Vurgu `--accent`** | `#C2603A` | `#D67A4E` |
| Geciken `--danger` | `#C0473A` | `#E0796B` |
| Tamam `--success` | `#3E8E5A` | `#5DB17F` |

**Vurgu seçenekleri (Ayarlar):** terra `#C2603A` (vars.) · teal `#2E8B7F` · mor `#6C5CE0` · kırmızı `#A4261F`.
Çalışma anında `--accent` + `--accent-soft` override edilir.

---

## 3. Tipografi

| Aile | Kullanım |
|------|----------|
| **DM Sans** | Tüm UI metni (400/500/600/700) |
| **JetBrains Mono** | Sayılar, tarih, sayaç, kod blokları, dosya yolları, takvim günleri |
| **Noto Sans Arabic** | RTL (Arapça) |

Ölçek (prototipten): yıl başlığı 46px mono · ekran h1 22–30px/700 · stat sayısı 32px mono ·
gövde 14–15.5px · ikincil 11–13px · rozet 10.5–11.5px. Sıkı tracking başlıklarda (`-.02em`).

---

## 4. Ölçü & Bileşen Sözlüğü

### Layout (masaüstü, tek pencere — pencere kromu yok)
| Bölge | Genişlik | Not |
|-------|----------|-----|
| **Ribbon** (sol ikon şeridi) | 56px | Logo "L" + Planlayıcı/Notlar/Graf · alt: Mobil/RTL(`ع`)/Ayarlar/Tema |
| **Gezgin** (Kasa) | 248px | Arama (⌘K) + klasör ağacı (Notlar/Daily/Projeler) + "Yerel · senkron yok" |
| Planlayıcı sağ panel | 312px | Takvim + Pomodoro |
| Editör backlink paneli | 288px | "Bağlantılar · Bu nota bağlananlar" |
| Mobil çerçeve | 380×792, radius 46px | Dynamic Island + alt sekme çubuğu |

### Bileşenler
- **Ribbon ikon butonu:** 40×40, radius 11, aktifte `--accent` + `--accent-soft` zemin.
- **Stat kartı:** radius 14, sayı 32px mono. İlki dolu `--accent` (beyaz metin), diğerleri yüzey.
- **Hızlı ekle:** yüzey kart + 📥 ikon + input + dolu accent gönder butonu (Enter de ekler).
- **Görev satırı (timeline):** durum dairesi (22px) + metin + ✏️ göreli tarih + 📄 kaynak rozet
  + 🎯 etiket rozet + opsiyonel `🍅 ×N`. Geciken: sol kenarda 2px `--danger` + `--danger-bg` zemin.
- **Rozet/pill:** radius 20–24, `--accent-soft`/`--bg-sunken` zemin.
- **Takvim:** 7 sütun grid, gün = mono, bugün `--accent-soft`, seçili dolu `--accent`, görevli günde nokta.
- **Pomodoro:** 148px SVG halka (r52, stroke9), mono sayaç, tur noktaları (●●●○), Başlat/Duraklat + sıfırla.
- **Switch (ayarlar):** 40×22 pill, açıkta `--accent`, knob 18px translateX.

---

## 5. Ekranlar (6)

1. **Planlayıcı** — yıl "2026" + "Bugüne Odaklan" + 3 stat kart + hızlı ekle + tarihe gruplu timeline;
   sağda takvim + Pomodoro. **2 düzen** (sağ üst segment): **Zaman Çizelgesi** ↔ **Pano** (Geciken/Bugün/Yaklaşan kolonları).
2. **Editör** — üst sekmeler (çoklu not) + markdown live preview (`[[wiki-link]]` accent vurgulu) + sağda backlink paneli.
3. **Graf** — radyal düğüm yerleşimi; hover'da komşular vurgulanır, gerisi soluklaşır; alt köşe lejant.
4. **Ayarlar** — Görünüm (tema + vurgu rengi) · Dil/Bölge (TR/EN/AR-RTL) · Editör (canlı önizleme/satır no/yazım) · Pomodoro (25/5/15/4) · Kasa konumu.
5. **Mobil** — telefon çerçevesi: tarih + Bugün başlığı + 2 mini stat + hızlı ekle + timeline; alt sekme: Planlayıcı·Takvim·Notlar·Pomodoro·Ara.
6. **RTL (Arapça)** — tüm düzen `dir="rtl"` aynalanır (gezgin sağa, sayılar Arapça-Hint `٢٠٢٦`, ikonlar `scaleX(-1)`).

---

## 6. Etkileşimler (prototipte çalışan)

Tema toggle · gerçek geri sayan Pomodoro (Başlat/Duraklat/sıfırla + halka ilerleme) · Enter ile
timeline'a görev ekleme (Planlanmamış etiketiyle) · checkbox ile tamamlama (üstü çizili + yeşil) ·
takvimde gün seçimi · editör sekme geçişi · graf hover · ribbon ile ekran gezinme · panel daraltma.

---

## 7. Veri Modeli (prototip state'i — planlama dokümanlarıyla uyumlu)

Görev nesnesi: `{ text, done, overdue, rel, source, tag, pomos }` — `03 §3.3` görev modeliyle birebir.
Gruplama: tarihe göre + alt etiket `today | overdue | upcoming`. Sayaçlar: Yapılacak / Geciken /
Planlanmamış (`06 §4`). Pomodoro: `focusMin 25 / shortBreak 5 / longBreak 15 / rounds 4` (`06 §7.2`).
Daily note adı: `2026-06-13-Cumartesi` (`06 §6.2` kararıyla aynı). `🍅 ×N` rozeti (`06 §7.3` Karar A).

---

## 8. Terminoloji Notu (uygulanacak)

Prototip "vault" yerine **"Kasa"** Türkçesini kullanıyor — benimsendi. Dokümanlardaki "vault"
ifadeleri UI'da **"Kasa"** olarak görünür (kod içi değişken adları İngilizce `vault` kalır — `07`/isimlendirme).

---

## 9. Açık Uçlar (prototipte olmayan, kod fazında tasarlanacak)

- Takvim sağ panelde **statik**; gerçek ay gezinme + gün→daily note akışı (`06 §6`) eklenecek.
- Graf **el-yerleştirmeli**; gerçek force-directed (`04` d3-force) gelecek.
- Editör **statik HTML önizleme**; gerçek CodeMirror 6 live-preview (`04`) gelecek.
- Mobil tek ekran (planlayıcı); diğer mobil sekmeler (Takvim/Notlar/Pomodoro/Ara) tasarlanacak.
- i18n: prototip metinleri gömülü; gerçekte anahtar-tabanlı (`07`).

---

*Tasarım sistemi sabitlendi. Sıradaki adım kod fazıdır — bkz `00-README.md` yol haritası.*
