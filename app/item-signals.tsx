import type { DigestItem } from "@/lib/digest";
import { changeTypeLabels, effortLabels, riskLabels } from "@/lib/digest";
import type { ProjectRelevance } from "@/lib/project";

export function ItemSignals({ item, relevance }: { item: DigestItem; relevance?: ProjectRelevance }) {
  const hasDetails = item.changeType && item.risk && item.effort;
  const versionDetails = (item.packages ?? []).flatMap((entry) => {
    const fragments = [entry.releasedVersion ? `выпуск ${entry.releasedVersion}` : "", entry.affectedRange ? `затронуты ${entry.affectedRange}` : "", entry.fixedVersion ? `исправлено в ${entry.fixedVersion}` : ""].filter(Boolean);
    return fragments.length ? [`${entry.name}: ${fragments.join(", ")}`] : [];
  });

  return (
    <div className="item-signals">
      {relevance?.level && relevance.level !== "none" ? (
        <span className={`relevance relevance--${relevance.level}`} title={relevance.reason}>{relevance.label}</span>
      ) : null}
      {hasDetails ? (
        <div className="signal-row" aria-label="Оценка изменения">
          <span>{changeTypeLabels[item.changeType!]}</span>
          <span className={`risk risk--${item.risk}`}>{riskLabels[item.risk!]}</span>
          <span>{effortLabels[item.effort!]}</span>
        </div>
      ) : (
        <span className="legacy-detail">Подробные данные тогда не сохранялись</span>
      )}
      {versionDetails.length ? <p className="version-detail">{versionDetails.join(" · ")}</p> : null}
    </div>
  );
}
