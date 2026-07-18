# Loomen'e Katkı Rehberi

Katkın için teşekkürler! Loomen açık (public) ama **ticari kullanıma kapalı** bir projedir
(bkz. [`LICENSE`](LICENSE) — PolyForm Noncommercial 1.0.0). Birkaç kısa kural var.

## 1. Katkıcı Lisans Sözleşmesi (CLA) — zorunlu

PR'ının kabul edilebilmesi için [`CLA.md`](CLA.md) dosyasındaki **Katkıcı Lisans Sözleşmesi'ni**
kabul etmen gerekir. Bu, katkının telif (mali) haklarının proje sahibine devrini sağlar; böylece
katkın projenin geri kalanıyla aynı şekilde lisanslanabilir. **Kendi katkını istediğin gibi
kullanma hakkını kaybetmezsin** (CLA §5).

### Nasıl kabul edilir?

Pull request açıklamana (description) **aşağıdaki cümleyi aynen** ekle:

> **CLA.md dosyasındaki Katkıcı Lisans Sözleşmesi'ni okudum ve kabul ediyorum.**
> *(I have read and agree to the Contributor License Agreement in CLA.md.)*

Bu cümle olmadan PR birleştirilmez. (İleride bu adım `CLA Assistant` botuyla otomatikleştirilebilir.)

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
