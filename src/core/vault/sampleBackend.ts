import type { VaultBackend, VaultNote } from "./types";

// Tarayıcı/fallback için in-memory kasa. Tauri yokken (veya kasa seçilmeden) UI bununla çalışır.
// İçerik demo-vault ile aynı; tarihler 2026-06 civarı (bugün ≈ 2026-06-17).
const SEED: Record<string, string> = {
  "Inbox.md": `# Inbox

- [ ] Bir ara kitap öner #Kişisel
- [ ] Ders notlarını gözden geçir 📅 2026-06-18 #Okul
`,
  "Daily/2026-06-17-Çarşamba.md": `# 2026-06-17 · Çarşamba

Bugün [[Proje X]] tasarımını bitirmek öncelikli.

## Görevler
- [ ] Tasarımı bitir 📅 2026-06-17 #Yapılacaklar 🍅×3
- [ ] Toplantı notlarını yaz 📅 2026-06-17 #İş 🍅×1
- [ ] Spor salonu üyeliğini yenile 📅 2026-06-17 #Kişisel
`,
  "Daily/2026-06-16-Salı.md": `# 2026-06-16 · Salı

## Görevler
- [ ] Kredi kartı ekstresi · 2.450,00 ₺ 📅 2026-06-16 #Ödemeler
- [x] Elektrik faturası öde · 640,00 ₺ 📅 2026-06-16 ✅ 2026-06-16 #Ödemeler
- [ ] Su faturası · 280,00 ₺ 📅 2026-06-12 #Ödemeler
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
      return Object.keys(store).map((path) => {
        const parts = path.split("/");
        const file = parts.pop()!;
        return { path, name: file.replace(/\.md$/i, ""), folder: parts.join("/") };
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
  };
}
