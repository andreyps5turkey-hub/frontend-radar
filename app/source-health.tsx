import { CircleAlert, CircleCheck } from "lucide-react";
import type { Digest } from "@/lib/digest";
import { formatUpdatedAt } from "@/lib/digest";

export function SourceHealthPanel({ digest, compact = false }: { digest: Digest; compact?: boolean }) {
  const health = digest.sourceHealth;
  const succeeded = health?.succeeded ?? digest.sourcesChecked;
  const attempted = health?.attempted ?? Math.max(21, digest.sourcesChecked);
  const hasFailures = health ? health.failed.length > 0 : succeeded < attempted;

  return (
    <div className={`source-health${compact ? " source-health--compact" : ""}`}>
      <div className="source-health__summary">
        {hasFailures ? <CircleAlert aria-hidden="true" size={19} /> : <CircleCheck aria-hidden="true" size={19} />}
        <div>
          <strong>{succeeded} из {attempted} источников ответили</strong>
          <span>Обновлено {formatUpdatedAt(digest.generatedAt)} МСК</span>
        </div>
      </div>
      {health ? (
        health.failed.length > 0 ? (
          <details>
            <summary>Недоступные источники: {health.failed.length}</summary>
            <ul>{health.failed.map((source) => <li key={source}>{source}</li>)}</ul>
          </details>
        ) : <span className="source-health__note">Все каналы доступны</span>
      ) : (
        <span className="source-health__note">Подробная диагностика для этого выпуска не сохранялась</span>
      )}
    </div>
  );
}
