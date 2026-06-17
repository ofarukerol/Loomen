import { useAppStore } from "../../store/useAppStore";

/** [[wiki-link]] — tıklayınca hedef notu açar (vurgulu çip görünümü). */
export function WikiLink({ to, label }: { to: string; label?: string }) {
  const openNote = useAppStore((s) => s.openNote);
  return (
    <button className="lo-wiki" onClick={() => openNote(to)}>
      [[{label ?? to}]]
    </button>
  );
}
