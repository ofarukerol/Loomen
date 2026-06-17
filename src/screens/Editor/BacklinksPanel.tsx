import { useTranslation } from "react-i18next";
import { Link2, FileText } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { extractWikiLinks, excerptForLink } from "../../core/markdown/links";

export function BacklinksPanel() {
  const { t } = useTranslation();
  const notes = useAppStore((s) => s.notes);
  const contents = useAppStore((s) => s.noteContents);
  const activeNote = useAppStore((s) => s.activeNote);
  const openNote = useAppStore((s) => s.openNote);

  const active = notes.find((n) => n.path === activeNote);

  // Bu nota [[link]] veren notlar.
  const backlinks = active
    ? notes
        .filter((n) => n.path !== active.path)
        .map((n) => ({ note: n, links: extractWikiLinks(contents[n.path] ?? "") }))
        .filter((x) => x.links.includes(active.name))
        .map((x) => ({ note: x.note, excerpt: excerptForLink(contents[x.note.path] ?? "", active.name) }))
    : [];

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
