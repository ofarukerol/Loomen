import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link2, FileText } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { extractWikiLinks, excerptForLink, resolveLink } from "../../core/markdown/links";

export function BacklinksPanel() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const activeNote = useAppStore((s) => s.activeNote);
  const openNote = useAppStore((s) => s.openNote);

  const active = notes.find((n) => n.path === activeNote);

  // Bu nota [[link]] veren notlar. Hedefler resolveLink ile çözülür: `[[Not#Başlık]]`,
  // `[[Not|takma ad]]`, `[[Klasör/Not]]` ve farklı yazılmış Türkçe harfler de sayılır;
  // `![[gömü]]` sayılmaz. Çözüm hedef metnine göre önbelleklenir — her not için
  // baştan tarama vault büyüdükçe pahalıya patlar.
  const backlinks = useMemo(() => {
    if (!active) return [];
    const resolved = new Map<string, string | undefined>();
    const pathOf = (target: string) => {
      if (!resolved.has(target)) resolved.set(target, resolveLink(target, notes)?.path);
      return resolved.get(target);
    };
    const out: { note: (typeof notes)[number]; excerpt: string }[] = [];
    for (const n of notes) {
      if (n.path === active.path) continue;
      const content = contents[n.path] ?? "";
      const hit = extractWikiLinks(content).find((target) => pathOf(target) === active.path);
      if (hit === undefined) continue;
      out.push({ note: n, excerpt: excerptForLink(content, hit) });
    }
    return out;
  }, [active, notes, contents]);

  return (
    <div className="lo-backlinks lo-scroll">
      <div className="lo-backlinks__title">
        <Link2 size={16} strokeWidth={1.9} color="var(--accent)" />
        {t("editor.backlinks")}
        <span style={{ marginInlineStart: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg3)" }}>
          {backlinks.length}
        </span>
      </div>
      <div className="lo-backlinks__sub">{t("editor.backlinksSub")}</div>
      {backlinks.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--fg3)" }}>{t("editor.noBacklinks")}</div>
      )}
      <div className="lo-backlinks__list">
        {backlinks.map((b) => (
          <button className="lo-blcard" key={b.note.path} onClick={() => openNote(b.note.path)}>
            <div className="lo-blcard__title">
              <FileText size={12} strokeWidth={1.8} color="var(--accent)" />
              {b.note.name}
            </div>
            {b.excerpt && <div className="lo-blcard__excerpt">…{b.excerpt}…</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
