import { readDir, readTextFile, writeTextFile, exists, mkdir, rename } from "@tauri-apps/plugin-fs";
import type { VaultBackend, VaultNote } from "./types";

// Gerçek dosya sistemi adapter'ı (Tauri). Vault kökü mutlak yol; içeride göreli yollar kullanılır.
export function createTauriBackend(root: string): VaultBackend {
  const abs = (rel: string) => `${root}/${rel}`;

  async function walk(dirAbs: string, relDir: string, out: VaultNote[]): Promise<void> {
    const entries = await readDir(dirAbs);
    for (const e of entries) {
      if (e.name.startsWith(".")) continue; // .veridian/.git vb. atla
      const childRel = relDir ? `${relDir}/${e.name}` : e.name;
      if (e.isDirectory) {
        await walk(`${dirAbs}/${e.name}`, childRel, out);
      } else if (e.name.toLowerCase().endsWith(".md")) {
        out.push({ path: childRel, name: e.name.replace(/\.md$/i, ""), folder: relDir });
      }
    }
  }

  return {
    async listNotes() {
      const out: VaultNote[] = [];
      await walk(root, "", out);
      return out;
    },
    readNote: (p) => readTextFile(abs(p)),
    writeNote: (p, c) => writeTextFile(abs(p), c),
    exists: (p) => exists(abs(p)),
    ensureDir: async (d) => {
      if (d) await mkdir(abs(d), { recursive: true });
    },
    rename: async (from, to) => {
      const dir = to.split("/").slice(0, -1).join("/");
      if (dir) await mkdir(abs(dir), { recursive: true });
      await rename(abs(from), abs(to));
    },
  };
}
