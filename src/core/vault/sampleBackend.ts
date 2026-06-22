import type { VaultBackend, VaultNote } from "./types";
import { TRASH_DIR, encodeTrashName, toTrashEntry, type TrashEntry } from "./trash";

// Tarayıcı/fallback için in-memory kasa. Tauri yokken (veya kasa seçilmeden) UI bununla çalışır.
// Görevler ayrı "Yapılacaklar.md" dosyasında; günlük notlar (Günlük/YYYY/MM-Ay/) sadece journal — görev içermez.
const SEED: Record<string, string> = {
  "Yapılacaklar.md": `# Yapılacaklar

- [ ] Su faturası · 280,00 ₺ 📅 2026-06-12 #Ödemeler
- [ ] Kredi kartı ekstresi · 2.450,00 ₺ 📅 2026-06-16 #Ödemeler
- [x] Elektrik faturası öde · 640,00 ₺ 📅 2026-06-16 ✅ 2026-06-16 #Ödemeler
- [ ] Tasarımı bitir 📅 2026-06-17 #Yapılacaklar 🍅×3
- [ ] Toplantı notlarını yaz 📅 2026-06-17 #İş 🍅×1
- [ ] Spor salonu üyeliğini yenile 📅 2026-06-17 #Kişisel
- [ ] Ders notlarını gözden geçir 📅 2026-06-18 #Okul
`,
  "Inbox.md": `# Inbox

- [ ] Bir ara kitap öner #Kişisel
`,
  "Günlük/2026/06-Haziran/2026-06-17-Çarşamba.md": `# 2026-06-17-Çarşamba

## 💭 Ephemeral Notlar (Gün İçi Notlar)

Bugün [[Proje X]] tasarımını bitirmek öncelikli.

## 📝 Günün Özeti

Tasarım sistemi ve mini ajanda üzerinde ilerledim.

## 💡 Günün Kattıkları

- Görevleri günlük nottan ayırmak akışı netleştirdi.

## 📚 Okuduklarım/İzlediklerim

---

#günlük 📅 Tarih: 2026-06-17 ⭐ Gün: Çarşamba 📈 Hafta: 25
`,
  "Günlük/2026/06-Haziran/2026-06-16-Salı.md": `# 2026-06-16-Salı

---

## 💭 Ephemeral Notlar (Gün İçi Notlar)

Yoğun bir gündü.

## 📝 Günün Özeti

---

#günlük 📅 Tarih: 2026-06-16 ⭐ Gün: Salı 📈 Hafta: 25
`,
  "Notlar/Proje X.md": `# Proje X

Loomen'in çekirdek planlama deneyimi. İlgili: [[Fikirler]]

## Kilometre taşları
- [ ] Sunum hazırlığı 📅 2026-07-17 #Yapılacaklar
- [ ] Kira ödemesi · 12.000 ₺ 📅 2026-06-23 #Ödemeler
`,
  "Notlar/Fikirler.md": `# Fikirler

- [ ] Faturaları otomatik tekrar eden görevlere bağla #Kişisel
- [ ] Graf'ta etikete göre renk kodu

Bkz: [[Proje X]]
`,
};

export function createSampleBackend(): VaultBackend {
  const store = { ...SEED };
  return {
    async listNotes(): Promise<VaultNote[]> {
      return Object.keys(store)
        .filter((path) => !path.startsWith(".")) // .trash vb. dotfolder'ları atla
        .map((path) => {
          const parts = path.split("/");
          const file = parts.pop()!;
          const kind = /\.excalidraw$/i.test(file) ? "draw" : "note";
          const name = file.replace(/\.(md|excalidraw)$/i, "");
          return { path, name, folder: parts.join("/"), kind } as const;
        });
    },
    async readNote(path) {
      return store[path] ?? "";
    },
    async writeNote(path, content) {
      store[path] = content;
    },
    async exists(path) {
      return path in store;
    },
    async ensureDir() {
      // in-memory: gerek yok
    },
    async rename(from, to) {
      if (!(from in store)) return;
      store[to] = store[from];
      delete store[from];
    },
    async trashNote(path) {
      if (!(path in store)) return;
      const trashName = encodeTrashName(path, Date.now());
      store[`${TRASH_DIR}/${trashName}`] = store[path];
      delete store[path];
    },
    async listTrash(): Promise<TrashEntry[]> {
      const prefix = `${TRASH_DIR}/`;
      return Object.keys(store)
        .filter((p) => p.startsWith(prefix))
        .map((p) => toTrashEntry(p.slice(prefix.length)))
        .filter((t): t is TrashEntry => !!t)
        .sort((a, b) => b.deletedAt - a.deletedAt);
    },
    async restoreFromTrash(trashName) {
      const key = `${TRASH_DIR}/${trashName}`;
      const t = toTrashEntry(trashName);
      if (!t || !(key in store)) throw new Error("Geçersiz çöp kaydı");
      let target = t.originalPath;
      if (target in store) {
        const dot = target.lastIndexOf(".");
        const base = dot > 0 ? target.slice(0, dot) : target;
        const ext = dot > 0 ? target.slice(dot) : "";
        target = `${base} (geri yüklendi ${Date.now()})${ext}`;
      }
      store[target] = store[key];
      delete store[key];
      return target;
    },
    async purgeTrashItem(trashName) {
      delete store[`${TRASH_DIR}/${trashName}`];
    },
  };
}
