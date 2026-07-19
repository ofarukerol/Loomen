# Loomen'e Katkı Rehberi

Katkın için teşekkürler! Loomen açık (public) ama **ticari kullanıma kapalı** bir projedir
(bkz. [`LICENSE`](LICENSE) — PolyForm Noncommercial 1.0.0). Birkaç kısa kural var.

## 1. Katkıcı Lisans Sözleşmesi (CLA) — zorunlu

PR'ının kabul edilebilmesi için [`CLA.md`](CLA.md) dosyasındaki **Katkıcı Lisans Sözleşmesi'ni**
kabul etmen gerekir. Bu, katkının telif (mali) haklarının proje sahibine devrini sağlar; böylece
katkın projenin geri kalanıyla aynı şekilde lisanslanabilir. **Kendi katkını istediğin gibi
kullanma hakkını kaybetmezsin** (CLA §5).

### Nasıl kabul edilir?

PR'ı açtığında bir bot yorum bırakıp CLA'yı kabul etmeni isteyecek. Kabul etmek için PR'a
**yorum olarak** (açıklamaya değil) şu cümleyi **birebir** yaz:

```
CLA.md dosyasındaki Katkıcı Lisans Sözleşmesini okudum ve kabul ediyorum.
```

Bot imzanı kaydeder ve PR'ın CLA kontrolü yeşile döner. **İmza olmadan PR birleştirilemez** —
bu, GitHub tarafında zorunlu bir kontrol olarak uygulanır.

Bir kez imzaladıktan sonra sonraki PR'ların için tekrar imzalaman gerekmez.

## 2. Not güvenliği kuralları

Bir notun/dosyanın içeriğine dokunan her değişiklik [`NOTE_SAFETY_RULES.md`](NOTE_SAFETY_RULES.md)
kurallarına uymak **zorundadır**. Veri kaybı riski taşıyan PR'lar reddedilir.

## 3. Geliştirme

- Çalıştırma: `npm run tauri dev`
- `src-tauri/capabilities/` veya Rust tarafını değiştirdiysen uygulamayı **yeniden başlat** (HMR almaz).
- Sürükle-bırak: WKWebView native HTML5 DnD'yi güvenilir desteklemez → **pointer-event tabanlı** kullan.

## 4. Commit / PR

- Commit mesajları **sade Türkçe**, ne yaptığını açıklayan tek satır.
- Küçük, odaklı PR'lar tercih edilir.

<!-- CLA akisi dogrulama testi -->
