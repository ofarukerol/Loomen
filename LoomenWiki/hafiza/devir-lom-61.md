---
name: LOM-61 — Okunamayan yerel not silinmiş sayılıyor
description: Testler kaldı: GitHub REST eşitlemesinde yerel not/klasör okunamayınca eşitleme hata verip duracak; okunamayan not artık "silinmiş" sayılıp uzaktan çıkarılmayacak.
type: project
proje: loomen
kaynak: kart LOM-61 · dal fix/LOM-61 · commit yok · test koşusu 7f0a9433-4254-4755-8de7-f3509dcdf1a5 (Excalibur)
guven: iddia
durum: gelistirildi
---

# LOM-61 — Okunamayan yerel not silinmiş sayılıyor

## Ne yapıldı

GitHub REST eşitlemesinde yerel not/klasör okunamayınca eşitleme hata verip duracak; okunamayan not artık "silinmiş" sayılıp uzaktan çıkarılmayacak.

## Adımlar

- src-tauri/src/github_api.rs içinde read_local -> Result<BTreeMap<String, Vec<u8>>, String> ve iç walk -> Result<(), String> olsun. read_dir hatası, her DirEntry hatası (entries.flatten() yerine `let e = e?` biçiminde map_err), std::fs::read hatası ve strip_prefix hatası üst çağrıya taşınsın. Mesajlar sade Türkçe ve göreli yolu içersin: klasör için "Yerel klasör okunamadı: <yol> (<işletim sistemi hatası>); senkron durduruldu, notlara dokunulmadı", dosya için "Yerel not okunamadı: <yol> (...); senkron durduruldu, notlara dokunulmadı". Kök klasör okunamazsa yol yerine "kasa klasörü" yaz.
- Gizli yol atlama kuralı aynen kalsın (nokta ile başlayanlar atlanır, kökteki .loomen okunur); bilerek dışlanan yol ile okunamayan yol karışmasın (atlama `continue`, hata `?`).
- github_api_sync içinde yerel okumayı ağ çağrılarının önüne al: http()? hemen ardından `let root = Path::new(&path); let mut local = read_local(root)?;` ve local_sha hesabı gelsin; eski 2) bloğu kaldır, adım numaralarını ve yorumları güncelle. Yorumda LOM-61'i LOM-11'in yerel karşılığı olarak not düş (eksik yerel liste = uzakta silme).
- Mevcut test yedek_klasoru_okunur_diger_gizliler_atlanir'ı yeni imzaya göre `.unwrap()` ile güncelle.
- Yeni test (cfg(unix)) okunamayan_dosya_senkronu_durdurur: geçici kasada A.md ve B.md oluştur, B.md'ye std::os::unix::fs::PermissionsExt ile 0o000 ver; std::fs::read(B.md) hâlâ başarılıysa (root) testi sessizce bitir. tauri::async_runtime::block_on(github_api_sync(path, "o", "r", "main", "tok", Some("base".into()))) sonucunun Err olduğunu, mesajın "okunamadı" ve "B.md" içerdiğini, A.md içeriğinin değişmediğini, .trash ve .loomen klasörlerinin oluşmadığını doğrula. İzni 0o644'e geri alıp klasörü sil.
- Yeni test (cfg(unix)) okunamayan_klasor_senkronu_durdurur: geçici kasada Alt/N.md oluştur, Alt klasörüne 0o000 ver; read_dir hâlâ başarılıysa atla. read_local(&dir) Err dönmeli ve mesaj "Alt" ile "klasör" içermeli. İzni 0o755'e geri alıp temizle.
- Yeni plan_merge testi yerel_silinen_not_uzaktan_da_kaldirilir: base {X.md:1}, remote {X.md:1}, local {} -> pushed == 1, writes/deletes/merges boş. Böylece gerçek silmenin eskisi gibi aktığı kanıtlanır (read_local başarılı dönünce listede olmayan dosya silinmiş sayılır, bu doğru).
- cd src-tauri && cargo test --lib github_api ve ardından cargo test --lib koş; derleme uyarısı (clippy) varsa gider. Ağ gerekmez: yerel okuma hatası ağ çağrısından önce döner.

## Dokunulan dosyalar

- `Loomen/src-tauri/src/github_api.rs`

## Test

Testler KALDI; iş doğrulanmadı.

> Kartın testleri (github_api) Windows'ta geçti: 13 geçti, 0 kaldı. Tam pakette github_git.rs içindeki 2 test kaldı, tek başına da kalıyor. Bu testler Windows'ta "\" yolunu "/" ile karşılaştırıyor. Kart o dosyaya dokunmuyor, ama kural gereği kırmızı sayıldı. Okunamayan dosya ve klasör testleri yalnız Unix'te koşar, Windows'ta atlandı. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-61`
- Test koşusu: `7f0a9433-4254-4755-8de7-f3509dcdf1a5` (Excalibur)

## Durum

Dalda geliştirildi; testten GEÇMEDİ. Bitmiş iş gibi kullanma.
