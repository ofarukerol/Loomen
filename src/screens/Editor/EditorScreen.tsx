import { FileText, Check } from "lucide-react";
import { useAppStore, type EditorTab } from "../../store/useAppStore";
import { WikiLink } from "./WikiLink";
import { BacklinksPanel } from "./BacklinksPanel";

const TABS: { id: EditorTab; name: string }[] = [
  { id: "daily", name: "2026-06-13-Cumartesi" },
  { id: "proje", name: "Proje X" },
  { id: "fikirler", name: "Fikirler" },
];

function TaskLine({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <label className={done ? "is-done" : ""}>
      <span className={"lo-checkbox" + (done ? " is-done" : "")}>
        {done && <Check size={12} strokeWidth={3} color="#fff" />}
      </span>
      <span>{children}</span>
    </label>
  );
}

function DailyNote() {
  return (
    <div className="lo-prose">
      <h1>2026-06-13 · Cumartesi</h1>
      <div className="lo-prose__meta">
        <span>Günlük not</span>
        <span>·</span>
        <span>3 backlink</span>
        <span>·</span>
        <span>238 kelime</span>
      </div>
      <p>
        Bugün <strong>tasarımı bitirmek</strong> öncelikli. Akşam <WikiLink to="Proje X" /> için
        toplantı notlarını derleyeceğim.
      </p>
      <h2>Bugünün planı</h2>
      <div className="lo-tasklist">
        <TaskLine done>Sabah koşusu</TaskLine>
        <TaskLine>Tasarımı bitir</TaskLine>
        <TaskLine>Toplantı notlarını yaz</TaskLine>
      </div>
      <blockquote>
        "Küçük günlük adımlar, büyük haftalık sıçramalardan iyidir." — kendime not
      </blockquote>
      <h2>Notlar</h2>
      <ul>
        <li>
          Fatura takibi için <WikiLink to="Fikirler" /> notuna bağlandı.
        </li>
        <li>3 hattı tekrar dondurma işlemi pazartesiye kaldı.</li>
      </ul>
      <pre>
        <span style={{ color: "var(--accent)" }}>## Haftalık özet</span>
        {"\n- toplam odak: "}
        <span style={{ color: "var(--accent-2)" }}>6 × 25dk</span>
        {"\n- tamamlanan: 4 / 9 görev"}
      </pre>
      <p>
        İlgili: <WikiLink to="Proje X" /> · <WikiLink to="Fikirler" />
      </p>
    </div>
  );
}

function ProjeNote() {
  return (
    <div className="lo-prose">
      <h1>Proje X</h1>
      <div className="lo-prose__meta">
        <span>Proje</span>
        <span>·</span>
        <span>5 backlink</span>
      </div>
      <p>
        Loomen'in çekirdek planlama deneyimi. Hedef: <strong>tamamen yerel</strong>, internet
        gerektirmeyen bir PKM + planlayıcı.
      </p>
      <h2>Kilometre taşları</h2>
      <ul>
        <li>Vault gezgini + arama</li>
        <li>
          Timeline planlayıcı — <WikiLink to="2026-06-13-Cumartesi" label="2026-06-13-Cumartesi" />
        </li>
        <li>Graf görünümü</li>
      </ul>
      <blockquote>"Obsidian'ın bilgi ağı + Things gibi cilalı planlama."</blockquote>
    </div>
  );
}

function FikirlerNote() {
  return (
    <div className="lo-prose">
      <h1>Fikirler</h1>
      <div className="lo-prose__meta">
        <span>Serbest not</span>
        <span>·</span>
        <span>2 backlink</span>
      </div>
      <ul>
        <li>Faturaları otomatik tekrar eden görevlere bağla.</li>
        <li>Pomodoro bitince günlük nota otomatik özet düş.</li>
        <li>Graf'ta etikete göre renk kodu.</li>
      </ul>
      <p>
        Bkz: <WikiLink to="Proje X" />
      </p>
    </div>
  );
}

export function EditorScreen() {
  const editorTab = useAppStore((s) => s.editorTab);
  const setEditorTab = useAppStore((s) => s.setEditorTab);

  return (
    <div className="lo-editor">
      <div className="lo-tabs">
        {TABS.map((tb) => (
          <button
            className={"lo-tab" + (editorTab === tb.id ? " is-active" : "")}
            key={tb.id}
            onClick={() => setEditorTab(tb.id)}
          >
            <FileText size={13} strokeWidth={1.7} />
            {tb.name}
          </button>
        ))}
      </div>
      <div className="lo-editor__body">
        <div className="lo-editor__scroll lo-scroll">
          {editorTab === "daily" && <DailyNote />}
          {editorTab === "proje" && <ProjeNote />}
          {editorTab === "fikirler" && <FikirlerNote />}
        </div>
        <BacklinksPanel />
      </div>
    </div>
  );
}
