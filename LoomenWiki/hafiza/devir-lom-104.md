---
name: LOM-104 — GitHub senkronu gizli dosyaları uzaktan siliyor
description: GitHub eşitlemesi, adı noktayla başlayan depo dosyalarını (.gitignore, .github vb.) artık hiç ellemeyecek: yerel, uzak ve önceki durum listelerine aynı kapsam kuralı uygulanacak ve yeni kayıt uzaktaki son durumun üstüne kurulacak; böylece kapsam dışı dosyalar olduğu gibi kalacak.
type: project
proje: loomen
kaynak: kart LOM-104 · dal fix/LOM-104 · Loomen@45bbaa47ce28920b5943cbc1dbda1036628982d4 · test koşusu db7596d2-fe2c-45a6-aecf-8457c20bc1a5 (Excalibur)
guven: dogrulandi
durum: test_gecti
dogrulama_tarihi: 2026-11-13
---

# LOM-104 — GitHub senkronu gizli dosyaları uzaktan siliyor

## Ne yapıldı

GitHub eşitlemesi, adı noktayla başlayan depo dosyalarını (.gitignore, .github vb.) artık hiç ellemeyecek: yerel, uzak ve önceki durum listelerine aynı kapsam kuralı uygulanacak ve yeni kayıt uzaktaki son durumun üstüne kurulacak; böylece kapsam dışı dosyalar olduğu gibi kalacak.

## Adımlar

- Önce testleri yaz (kırmızı görmeli), hepsi Loomen/src-tauri/src/github_api.rs içindeki tests modülünde: (a) kapsam kuralı testi: `Not.md`, `Klasör/Not.md`, `.loomen/cakisma-gecmisi/S/N.md` kapsam içinde; `.gitignore`, `.github/workflows/example.yml`, `.trash/x`, `Klasör/.gizli/N.md`, `.loomen/.gizli/x`, `Klasör/.loomen/x` kapsam dışında. (b) plan testi: uzak ve base içinde `.gitignore` + `.github/workflows/example.yml` + `Not.md`, yerelde yalnız `Not.md`; haritalar kapsam süzgecinden geçince plan_merge sonucu boş plan (silme yok, yazma yok, pushed 0). (c) ağaç girdisi testi: aynı senaryoda üretilen girdilerde gizli yollar yok ve değişiklik yok sayılıyor. (d) iki ardışık eşitleme testi: 1. tur base boş, uzakta gizli dosyalar + not → yalnız not çekilir, gizli dosya için yazma yok; 2. tur base = uzak → plan boş, girdi listesi boş, yeni kayıt gerekmiyor. (e) normal silme testi: uzak ve base içinde `X.md`, yerelde yok → girdilerde `X.md` için sha'sı null olan silme satırı var, gizli dosya için yok. (f) `.loomen` testi: yerelde yeni `.loomen/cakisma-gecmisi/S/N.md` girdilere blob olarak girer.
- Tek kapsam kuralını yaz: `fn in_scope(rel: &str) -> bool` — yol `/` ile parçalanır; noktayla başlayan herhangi bir parça kapsam dışıdır, tek istisna İLK parçanın tam olarak `.loomen` olması. read_local içindeki walk() bu kuralla aynı sonucu vermeli; mümkünse walk() ad denetimini aynı yardımcıdan yapsın (kök düzeyi bilgisi korunarak), mevcut `yedek_klasoru_okunur_diger_gizliler_atlanir` testi aynen geçmeli.
- github_api_sync içinde uzak ve base haritalarını tree_files'tan hemen sonra `in_scope` ile süz (ör. `retain`). Süzme, 'depo boş görünüyor' güvenlik denetiminden ve plan_merge çağrısından ÖNCE olsun. plan_merge'in kendisine dokunma.
- Ağaç girdilerini ağdan bağımsız, test edilebilir bir yardımcıya çıkar: girdi olarak süzülmüş uzak harita (yol→sha) ve birleşmiş yerelin yol→sha haritası; çıktı olarak (yüklenecek/yazılacak yollar, silinecek yollar, değişiklik var mı). Kural: yerel sha uzakla aynıysa girdi YOK; farklı ya da yeni ise blob girdisi; süzülmüş uzakta olup yerelde olmayan yol için `{path, mode: "100644", type: "blob", sha: null}` silme girdisi.
- create_tree'ye `base_tree: Option<&str>` ekle: head varsa head kaydının ağaç sha'sı base_tree olarak gönderilir (2. adımda commit_tree ile zaten alınıyor; değeri sakla), yalnız değişen ve silinen girdiler yollanır. head yoksa (boş depo) base_tree gönderilmez, bütün yerel dosyalar girdi olur. Böylece kapsam dışı uzak dosyalar, dosya izinleri ve alt modüller olduğu gibi kalır.
- github_api_sync'in 6. bölümünü yeni yardımcıyı kullanacak şekilde düzenle: yalnız değişen dosyalar için create_blob çağır, değişiklik yoksa eskisi gibi head'i yeni base olarak döndür. pulled/pushed/merged sayımı değişmesin.
- read_local ve dosya başındaki açıklamaları güncelle: kapsam kuralı tek yerde, kapsam dışı uzak dosyalara dokunulmaz (LOM-104).
- `cargo test --manifest-path src-tauri/Cargo.toml` koş; hepsi yeşilse fix/LOM-104 dalına commit et (AI imzası yok, push yok). Sonuçta geçti/kaldı satırlarını kanıt olarak ver.

## Dokunulan dosyalar

- `Loomen/src-tauri/src/github_api.rs`

## Test

Testler geçti.

> Hedefli koşu (github_api) 21/21 geçti. Tam Rust paketi 83/83 geçti, hiçbir test düşmedi. Yeni testler gizli dosya korumasını, iki ardışık eşitlemeyi, normal not silmeyi ve .loomen yedeğini kapsıyor. Tip denetimi Kokpit tarafından yapıldı, yeni hata yok. Canlı doğrulama insana kaldı.

## Kanıt

- Dal: `fix/LOM-104`
- Commit: `Loomen@45bbaa47ce28920b5943cbc1dbda1036628982d4`
- Test koşusu: `db7596d2-fe2c-45a6-aecf-8457c20bc1a5` (Excalibur)

## Durum

Dalda geliştirildi ve testten geçti. `main`'e birleştirilmedi, kullanıcıya yayınlanmadı.
