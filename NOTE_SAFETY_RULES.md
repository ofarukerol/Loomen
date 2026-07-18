# Loomen — Not Veri Güvenliği Kuralları (NOTE SAFETY RULES)

> Bu dosya bağlayıcıdır. Notların içeriğine dokunan **her** geliştirme bu kurallara uymak
> zorundadır. Amaç: hiçbir özellik, hiçbir koşulda bir notun içeriğini bozmasın/kaybetmesin.
> Notlar kullanıcının düz `.md` dosyalarıdır — tek gerçek kaynak diskteki dosyadır.

---

## 0. Bu kuralların doğuş sebebi (olay kaydı)

**2026-06-22 — "TS" notu veri kaybı.** Tablo içeren `Çalışma Alanı/TS.md`, başka bir notun
(`QR Okuma Mobil Yazılımı.md`) silinmesi sırasında otomatik-kayıt ile üzerine yazıldı; tablolar yok oldu.

**Kök neden:** `deleteNote`, aktif not silinince `activeNote`'u başka sekmeye çeviriyor ama
`draft`'ı güncellemiyordu. 700 ms'lik autosave (`saveNote`) ise `draft`'ı **koşulsuz** `activeNote`'a
yazıyordu. Sonuç: silinen notun taslağı yanlış dosyaya (TS) yazıldı.

**Kalıcı çözüm:** `draftPath` (taslağın ait olduğu not) eklendi; `saveNote` yalnızca
`draftPath === activeNote` ise yazar; `activeNote`'u değiştiren tüm aksiyonlar `draft`+`draftPath`'i
atomik günceller.

---

## 1. Temel ilke

> **Bir notun içeriği YALNIZCA o notun kendi düzenleme oturumundan yazılabilir.**
> Bir notun taslağı asla başka bir dosyaya yazılamaz.

---

## 2. Değişmez kurallar (invariants)

1. **draft ⇔ draftPath birlikte.** `draft` her set edildiğinde `draftPath` da set edilir.
   `activeNote`'u değiştiren HER aksiyon (`openNote`, `setActiveTab`, `closeTab`, `deleteNote`,
   `renameNote`, `renameFolder`, `reopenVault`, kasa sıfırlama) `draft` + `draftPath`'i **atomik** günceller.
2. **Korumalı yazma.** `saveNote` yalnızca `draftPath === activeNote` ise diske yazar. Eşleşmiyorsa
   yazma — sessizce çık. (Bu, çapraz-not sızıntısına karşı son savunma hattıdır.)
3. **Taşıma = sadece `rename`.** Dosya silme/yeniden adlandırma/taşıma **yalnızca** `rename` ile yapılır.
   Asla "oku → yeni yere yaz → eskiyi sil" deseniyle değil. `rename` içeriği bit-bit korur ve atomiktir.
4. **Silme geri alınabilir olmalı.** Silme = çöp kutusuna **taşı** (`.trash`, `rename`). Kalıcı silme
   ayrı, açık ve onaylı bir aksiyondur. Çöpe taşıma içeriği değiştirmez.
5. **Gereksiz yere içeriğe dokunma.** Bir özellik bir notu okuyup yeniden serileştirip geri yazMAMALI
   (lossy round-trip riski: tablo/frontmatter/markdown bozulması). İçeriği değiştirme gereği yoksa
   dosyayı hiç açma/yazma. Round-trip zorunluysa (ör. tablo widget'ı), yazmadan önce
   "yeni == eski mi?" kontrolü yap; aynıysa yazma.
6. **Autosave izole.** Autosave debounce'lıdır; aktif not değiştiğinde önceki taslak yeni dosyaya
   **sızmaz** (kural 1 + 2 sağlar). Aktif not değişiminde bekleyen kayıt güncel state'i okumalı.
7. **Çizim dosyaları markdown yoluna girmez.** `kind === "draw"` dosyaları `saveNote`/`draft`
   yoluyla yazılmaz; `draftPath` yalnız `kind === "note"` için set edilir. Çizimler `saveDraw` ile.
8. **Disk tek gerçektir.** Bellekteki `noteContents` bir önbellektir; çakışmada diskteki dosya esastır.

---

## 3. Not-değiştiren özellik eklerken kontrol listesi

Kod yazmadan önce:

- [ ] `activeNote`'u değiştiriyor muyum? Öyleyse aynı `set` içinde `draft` + `draftPath` güncellendi mi?
- [ ] `backend.writeNote(path, content)` çağırıyor muyum? `content`, gerçekten `path`'in sahibi olduğu
      içerik mi? (Taslak/aktif-not eşleşmesi garanti mi?)
- [ ] Bir dosyayı taşımam gerekiyorsa `rename` mı kullandım (oku+yaz+sil DEĞİL)?
- [ ] İçeriği yeniden serileştiriyor muyum? Round-trip kayıpsız mı, eşitlik kontrolü var mı?
- [ ] Hata yolunda dosya yarım yazılır mı? (atomik yazma / başarısızlıkta dosyaya dokunmama)

Göndermeden önce **şu senaryoları elle test et**:

1. **Çapraz-not sızıntısı:** A ve B notunu aç (sekmeler). A'yı düzenle (yaz). Sonra B'yi **sil** →
   A'nın içeriği DEĞİŞMEMELİ. Aynısını "B'yi kapat" ve "B'yi yeniden adlandır" için tekrarla.
2. **Aktif notu silme:** Düzenlediğin notu sil → başka sekmeye geçer; o sekmedeki not BOZULMAZ.
3. **Tablo round-trip:** Tablo içeren notu düzenle modunda aç, hiçbir şey yazmadan başka nota geç →
   ilk notun tablosu birebir aynı kalmalı.
4. **Trash → Restore:** Bir notu sil, sonra geri yükle → içerik **byte özdeş** olmalı.

---

## 4. İlgili kod (tek kaynak)

- `src/store/useAppStore.ts`
  - `draftPath` state'i; `saveNote` içindeki `draftPath === activeNote` koruması.
  - `openNote` / `setActiveTab` / `closeTab` / `deleteNote` / `renameNote` / `renameFolder` /
    `reopenVault` — hepsi `draft` + `draftPath`'i birlikte günceller.
- `src/core/vault/types.ts` — `VaultBackend` (taşıma `rename`, silme `trashNote` = rename).
- `src/core/vault/tauriBackend.ts` / `sampleBackend.ts` — `trashNote/restoreFromTrash` yalnız `rename`.
- `src/core/vault/trash.ts` — çöp kutusu (30 gün saklama), kalıcı silme ayrı.

---

## 5. Tauri izinleri (capabilities) notu

Gizli klasörler (`.trash` gibi `.` ile başlayanlar) Tauri fs scope'unda `$HOME/**` ile
**eşleşmez**. Bu yüzden `src-tauri/capabilities/default.json` içinde `.trash` için açık desenler
gerekir (`fs:allow-mkdir/rename/remove/read-dir/exists`). Yeni gizli klasör eklersen aynısını yap.
