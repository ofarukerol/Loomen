// Modül kartı (LOM-112): ızgara ve liste için tek bileşen.
//
// Kurulmamış modülde Kur, kurulmuşta Aktif/Pasif anahtarı. Aktif kartın gövdesi düğmedir ve
// detayı açar; anahtar ve Kur gövdenin dışında durur, tıklamaları detayı açmaz.
import type React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Download } from "lucide-react";
import type { ModulesView } from "../../core/settings/modules";
import { MODULE_ICONS, MODULE_TONES, type ModuleInfo } from "./moduleUi";

export interface ModuleCardProps {
  m: ModuleInfo;
  view: ModulesView;
  onToggle: (on: boolean) => void;
  onInstall: () => void;
  onOpen: () => void;
  onRetry: () => void;
}

export function ModuleCard({ m, view, onToggle, onInstall, onOpen, onRetry }: ModuleCardProps) {
  const { t } = useTranslation();
  const Icon = MODULE_ICONS[m.id];
  const chip =
    m.state === "active"
      ? t("modules.active")
      : m.state === "passive"
        ? t("modules.passive")
        : m.state === "notInstalled"
          ? t("modules.notInstalled")
          : t("settings.features.loading");
  const canOpen = m.state === "active";
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const inner = (
    <>
      <span className="lo-mod__icon" aria-hidden="true">
        <Icon size={view === "grid" ? 22 : 20} strokeWidth={1.9} />
      </span>
      <span className="lo-mod__text">
        <span className="lo-mod__titlerow">
          <span className="lo-mod__name">{m.name}</span>
          <span className={"lo-mod__chip is-" + m.state}>{chip}</span>
        </span>
        <span className="lo-mod__desc">{m.desc}</span>
        <span className={"lo-mod__status" + (m.error ? " is-err" : "")}>
          <span className="lo-mod__dot" />
          <span>{m.status}</span>
        </span>
      </span>
      {canOpen && (
        <span className="lo-mod__chev" aria-hidden="true">
          <ChevronRight size={18} strokeWidth={2} className="lo-mod__flip" />
        </span>
      )}
    </>
  );

  // Kilitliyken kurulu olup olmadığı bilinmiyorsa Kur (kapalı), biliniyorsa anahtar (kapalı) görünür.
  const showInstall = m.cta === "install" || (m.cta === "locked" && !m.installed);

  return (
    <div
      className={`lo-mod lo-mod--${view} is-${m.state}`}
      data-module={m.id}
      data-state={m.state}
      data-tone={MODULE_TONES[m.id]}
    >
      {canOpen ? (
        <button
          type="button"
          className="lo-mod__main is-link"
          onClick={onOpen}
          aria-label={`${m.name} — ${t("modules.details")}`}
        >
          {inner}
        </button>
      ) : (
        <div className="lo-mod__main">{inner}</div>
      )}

      <div className="lo-mod__actions" onClick={stop}>
        {m.error && (
          <button type="button" className="lo-mod__retry" onClick={onRetry}>
            {t("settings.features.retry")}
          </button>
        )}
        {showInstall ? (
          <button
            type="button"
            className="lo-mod__install"
            disabled={m.locked}
            title={m.locked ? t("modules.lockedHint") : undefined}
            onClick={(e) => {
              e.stopPropagation();
              onInstall();
            }}
          >
            <Download size={15} strokeWidth={2} />
            <span>{t("modules.install")}</span>
          </button>
        ) : (
          <label className="lo-mod__toggle">
            <span className="lo-mod__togglelabel">{m.on ? t("modules.active") : t("modules.passive")}</span>
            <button
              type="button"
              className={"lo-switch" + (m.on ? " is-on" : "")}
              role="switch"
              aria-checked={m.on}
              aria-label={m.name}
              disabled={m.locked}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(!m.on);
              }}
            >
              <span className="lo-switch__knob" />
            </button>
          </label>
        )}
      </div>
    </div>
  );
}
