// Modüller sayfası (LOM-112): altı modül ızgara ya da liste halinde kart kart; kurulmamışta Kur,
// kurulmuşta Aktif/Pasif; aktif modülün kartı kendi detay sayfasını açar.
import { useTranslation } from "react-i18next";
import { LayoutGrid, List } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { FEATURE_IDS } from "../../core/settings/features";
import { canOpenDetail, moduleCounts } from "../../core/settings/modules";
import { MODULE_TONES, useModuleInfo } from "./moduleUi";
import { ModuleCard } from "./ModuleCard";
import { ModuleDetail } from "./ModuleDetail";

export function ModulesScreen() {
  const { t } = useTranslation();
  const view = useAppStore((s) => s.modulesView);
  const setView = useAppStore((s) => s.setModulesView);
  const detailId = useAppStore((s) => s.moduleDetailId);
  const { info, setOn, install, openDetail, retry } = useModuleInfo();

  const all = FEATURE_IDS.map(info);
  const detail = detailId ? all.find((m) => m.id === detailId) : undefined;
  // Pasife alınan ya da kurulu olmayan modülün detayı açılmaz: liste görünür.
  if (detail && canOpenDetail(detail.installed, detail.on)) {
    return (
      <div className="lo-mods lo-scroll">
        <div className="lo-mods__inner">
          <ModuleDetail m={detail} onBack={() => openDetail(null)} onToggle={(on) => setOn(detail.id, on)} />
        </div>
      </div>
    );
  }

  const { total, active } = moduleCounts((id) => all.find((m) => m.id === id)?.on === true);

  return (
    <div className="lo-mods lo-scroll">
      <div className="lo-mods__inner">
        <header className="lo-mods__hero">
          <div className="lo-mods__herotext">
            <h1 className="lo-mods__title">{t("modules.title")}</h1>
            <p className="lo-mods__sub">{t("modules.sub")}</p>
            <div className="lo-mods__summary" data-modules-summary>
              <span className="lo-mods__dots" aria-hidden="true">
                {all.map((m) => (
                  <span key={m.id} className={"lo-mods__pip" + (m.on ? " is-on" : "")} data-tone={MODULE_TONES[m.id]} />
                ))}
              </span>
              <span>{t("modules.summary", { active, total })}</span>
            </div>
          </div>
          <div className="lo-mods__viewseg" role="group" aria-label={t("modules.title")}>
            <button
              type="button"
              className={"lo-mods__viewbtn" + (view === "grid" ? " is-active" : "")}
              aria-pressed={view === "grid"}
              title={t("modules.viewGrid")}
              aria-label={t("modules.viewGrid")}
              onClick={() => setView("grid")}
            >
              <LayoutGrid size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className={"lo-mods__viewbtn" + (view === "list" ? " is-active" : "")}
              aria-pressed={view === "list"}
              title={t("modules.viewList")}
              aria-label={t("modules.viewList")}
              onClick={() => setView("list")}
            >
              <List size={16} strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className={"lo-mods__items is-" + view} data-modules-view={view}>
          {all.map((m) => (
            <ModuleCard
              key={m.id}
              m={m}
              view={view}
              onToggle={(on) => setOn(m.id, on)}
              onInstall={() => install(m.id)}
              onOpen={() => openDetail(m.id)}
              onRetry={retry}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
