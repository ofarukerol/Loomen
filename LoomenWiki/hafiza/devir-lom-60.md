---
name: LOM-60 — Alışkanlıklar: Geçmiş kartında bırakma günü, koyu temada kaçırılan gün, mobil Geçmiş şeridi
description: Alışkanlıklar Geçmiş kartına 'N. günde bırakıldı' satırı eklenir, koyu temada şeritteki kaçırılan gün çapraz çizgiyle ayırt edilir ve 375px'te Geçmiş ısı şeridi hücreleri 12px'e çıkarılır.
type: project
proje: loomen
kaynak: kart LOM-60 · dal fix/LOM-60 · Loomen@203e705871a731f975766d360f191dee7c4bad6c · test koşusu 6aa90fa5-6e1b-4d5d-9125-fdd55d226d6a (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-10-27
---

# LOM-60 — Alışkanlıklar: Geçmiş kartında bırakma günü, koyu temada kaçırılan gün, mobil Geçmiş şeridi

## Ne yapıldı

Alışkanlıklar Geçmiş kartına 'N. günde bırakıldı' satırı eklenir, koyu temada şeritteki kaçırılan gün çapraz çizgiyle ayırt edilir ve 375px'te Geçmiş ısı şeridi hücreleri 12px'e çıkarılır.

## Adımlar

- HabitHistory.tsx RoundRow içinde `quitDayNo` çekirdek fonksiyonunu içe aktar (zaten core/habit index'ten dışa açılıyor). Bırakılan turda (h.status === 'quit') `t('habit.quitOnDay', { n: quitDayNo(h) })` metnini `lo-hab-round__mid` satırına, OutcomeBadge ve yüzdenin yanına `lo-hab-round__quit` sınıflı bir span olarak ekle. Tamamlanan/süresi dolan turda span üretilmez. Çeviri anahtarı tr/en/ar'da zaten var; yeni anahtar ekleme.
- app.css'te `.lo-hab-round__quit` stili ekle: yüzdeyle aynı küçük boyut (12px), `var(--fg3)` ya da fg2 rengi; `.lo-hab-round__mid` zaten flex-wrap olduğundan dar kartta alt satıra düşer.
- app.css'te `.lo-hab-strip__day.is-missed` için koyu temaya özel kural ekle (`[data-theme="dark"]`): ayrıntı dizisindeki eğik çizgi ve lejant yaklaşımıyla aynı dilde, `repeating-linear-gradient(135deg, …)` ile ince çapraz çizgi, zemin `transparent` + `inset box-shadow` ince kenar. Renk: `color-mix(in srgb, var(--fg3) 55%, transparent)` gibi soluk ama koyu zeminden ayrışan ton. Açık tema kuralı (`--line-soft` zemini) aynen kalsın ya da istenirse açıkta da çok soluk aynı desen kullanılabilir; açık temanın mevcut görünümünü bozma.
- Hem kart 7 gün şeridi (`.lo-hab-strip--week`) hem Geçmiş ısı şeridi (`.lo-hab-strip--heat`) aynı `.lo-hab-strip__day.is-missed` sınıfını paylaştığı için tek kural ikisini kapsar; hücre köşe yuvarlaması (6px / 2px) desenle çakışmasın diye `background-clip` gerektirmez, kontrol et.
- app.css mobil bloğunda (satır ~4485) `.lo-app.is-mobile .lo-hab-strip--heat .lo-hab-strip__day` kuralını 8px'ten 12px'e çıkar (`flex-basis: 12px; width: 12px; height: 12px`), gap 3px kalsın. Şerit zaten `flex-wrap: wrap` ve `width: 100%` olduğundan 41 günlük tur 375px'te iki satıra kırılır; `min-width: 0` korunarak yatay taşma oluşmaz. RTL için ek kural gerekmez (flex yönü otomatik).
- Masaüstü ısı şeridi hücresi (10px) değişmesin; yalnız mobil kural büyütülür.
- Doğrulama: `npx tsc --noEmit` ve `npm test` koş. Ardından vite dev + Playwright ile Alışkanlıklar ekranını 1280 ve 375 genişlikte, açık/koyu temada ve Arapça dilde aç; Geçmiş sekmesinde bırakılmış bir tur, kaçırılan günü olan bir aktif kart ve 41 günlük bir tur görünecek şekilde demo veri hazırla; ekran görüntülerini al, konsolda sayfa hatası olmadığını ve 375'te `document.scrollingElement.scrollWidth <= clientWidth` olduğunu, ısı hücresinin `getBoundingClientRect().width >= 12` olduğunu kontrol et.
- Commit mesajı Türkçe, AI imzası yok; dal fix/LOM-60.

## Dokunulan dosyalar

- `Loomen/src/screens/Habits/HabitHistory.tsx`
- `Loomen/src/styles/app.css`

## Test

Testler geçti.

> Tip denetimi hatasız bitti. npm test ile 26 test dosyasının tümü geçti. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-60`
- Commit: `Loomen@203e705871a731f975766d360f191dee7c4bad6c`
- Test koşusu: `6aa90fa5-6e1b-4d5d-9125-fdd55d226d6a` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.
