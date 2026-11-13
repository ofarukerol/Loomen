// Modül detayı (LOM-112): başlık alanında simge, ad, açıklama, durum ve Aktif/Pasif anahtarı;
// gövdede modülün kendi ayar bölümü. Yedekleme, Takvim, Tekrar ve Asistan Ayarlar'daki bileşenleri
// aynen kullanır; Alışkanlık ve Kütüphane'nin ayar bölümü yok, kendi ekranını açan bilgi kartı çıkar.
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { GitHubSync } from "../Settings/GitHubSync";
import { GoogleCalendarSync } from "../Settings/GoogleCalendarSync";
import { ReviewSettings } from "../Settings/ReviewSettings";
import { AiSettings } from "../Settings/AiSettings";
import { MODULE_ICONS, MODULE_TONES, type ModuleInfo } from "./moduleUi";

export function ModuleDetail({ m, onBack, onToggle }: { m: ModuleInfo; onBack: () => void; onToggle: (on: boolean) => void }) {
  const { t } = useTranslation();
  const setScreen = useAppStore((s) => s.setScreen);
  const Icon = MODULE_ICONS[m.id];

  let body: React.ReactNode;
  switch (m.id) {
    case "github":
      body = <GitHubSync />;
      break;
    case "calendar":
      body = <GoogleCalendarSync />;
      break;
    case "review":
      body = <ReviewSettings />;
      break;
    case "assistant":
      body = <AiSettings />;
      break;
    case "habits":
    case "library":
      body = (
        <div className="lo-card lo-mod-detail__open">
          <div>
            <div className="lo-set__rowtitle">{m.name}</div>
            <div className="lo-set__rowsub">{t("modules.openHint")}</div>
          </div>
          <button type="button" className="lo-btn lo-btn--primary" onClick={() => setScreen(m.id as "habits" | "library")}>
            <span>{t("modules.openScreen")}</span>
            <ArrowRight size={15} strokeWidth={2} className="lo-mod__flip" />
          </button>
        </div>
      );
      break;
  }

  return (
    <div className="lo-mod-detail" data-module-detail={m.id} data-tone={MODULE_TONES[m.id]}>
      <button type="button" className="lo-mod-detail__back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2} className="lo-mod__flip" />
        <span>{t("modules.back")}</span>
      </button>

      <header className="lo-mod-detail__head">
        <span className="lo-mod__icon lo-mod__icon--lg" aria-hidden="true">
          <Icon size={30} strokeWidth={1.8} />
        </span>
        <div className="lo-mod-detail__title">
          <h1>{m.name}</h1>
          <p>{m.desc}</p>
          <span className="lo-mod__status">
            <span className="lo-mod__dot" />
            <span>{m.status}</span>
          </span>
        </div>
        <div className="lo-mod__toggle">
          <span className="lo-mod__togglelabel">{m.on ? t("modules.active") : t("modules.passive")}</span>
          <button
            type="button"
            className={"lo-switch" + (m.on ? " is-on" : "")}
            role="switch"
            aria-checked={m.on}
            aria-label={m.name}
            disabled={m.locked}
            onClick={() => onToggle(!m.on)}
          >
            <span className="lo-switch__knob" />
          </button>
        </div>
      </header>

      <div className="lo-mod-detail__body">{body}</div>
    </div>
  );
}
