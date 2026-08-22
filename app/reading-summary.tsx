"use client";

import { Bookmark, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { archivePath } from "@/lib/site";
import { useReadingState } from "./reading-state";

type ReadingSummaryProps = {
  knownUrls: string[];
  weeklyUrls: string[];
};

export function ReadingSummary({ knownUrls, weeklyUrls }: ReadingSummaryProps) {
  const { hydrated, reading, selectedTopics } = useReadingState();
  const savedCount = knownUrls.filter((url) => reading[url]?.saved).length;
  const unreadThisWeek = weeklyUrls.filter((url) => !reading[url]?.read).length;

  return (
    <section className="reading-summary" aria-label="Моя очередь чтения">
      <div className="reading-summary__title">
        <span>Моя очередь</span>
        <strong>Продолжить чтение</strong>
      </div>
      <a href={`${archivePath()}?saved=1`}>
        <Bookmark aria-hidden="true" size={19} />
        <span><strong>{hydrated ? savedCount : "–"}</strong> сохранено</span>
      </a>
      <a href={`${archivePath()}?unread=1`}>
        <CheckCircle2 aria-hidden="true" size={19} />
        <span><strong>{hydrated ? unreadThisWeek : "–"}</strong> не прочитано за неделю</span>
      </a>
      <a href={`${archivePath()}?mine=1`}>
        <SlidersHorizontal aria-hidden="true" size={19} />
        <span><strong>{hydrated ? selectedTopics.length : "–"}</strong> любимых тем</span>
      </a>
    </section>
  );
}
