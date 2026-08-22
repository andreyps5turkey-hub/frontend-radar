"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import type { TopicId } from "@/lib/topics";
import {
  ACTIONS_KEY,
  PROJECT_KEY,
  readActionMap,
  readProjectProfile,
  type ActionMap,
  type ActionStatus,
  type ProjectProfile,
} from "@/lib/project";

const READING_KEY = "frontend-radar:reading-state:v1";
const TOPICS_KEY = "frontend-radar:topics:v1";

type ItemState = {
  read?: boolean;
  saved?: boolean;
  updatedAt: string;
};

type ReadingMap = Record<string, ItemState>;

type ReadingContextValue = {
  hydrated: boolean;
  reading: ReadingMap;
  selectedTopics: TopicId[];
  project: ProjectProfile | null;
  actions: ActionMap;
  toggleRead: (url: string) => void;
  toggleSaved: (url: string) => void;
  toggleTopic: (topic: TopicId) => void;
  saveProject: (project: ProjectProfile) => void;
  clearProject: () => void;
  setActionStatus: (url: string, status: ActionStatus | null) => void;
};

const ReadingContext = createContext<ReadingContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

function readStorage<T>(value: string, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export function ReadingStateProvider({ children }: { children: React.ReactNode }) {
  const readingJson = useSyncExternalStore(subscribe, () => window.localStorage.getItem(READING_KEY) ?? "{}", () => "{}");
  const topicsJson = useSyncExternalStore(subscribe, () => window.localStorage.getItem(TOPICS_KEY) ?? "[]", () => "[]");
  const projectJson = useSyncExternalStore(subscribe, () => window.localStorage.getItem(PROJECT_KEY) ?? "null", () => "null");
  const actionsJson = useSyncExternalStore(subscribe, () => window.localStorage.getItem(ACTIONS_KEY) ?? "{}", () => "{}");
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const reading = useMemo(() => readStorage<ReadingMap>(readingJson, {}), [readingJson]);
  const selectedTopics = useMemo(() => readStorage<TopicId[]>(topicsJson, []), [topicsJson]);
  const project = useMemo(() => readProjectProfile(projectJson), [projectJson]);
  const actions = useMemo(() => readActionMap(actionsJson), [actionsJson]);

  const updateItem = useCallback((url: string, field: "read" | "saved") => {
    const current = readStorage<ReadingMap>(window.localStorage.getItem(READING_KEY) ?? "{}", {});
    const nextValue = !current[url]?.[field];
    const nextItem = { ...current[url], [field]: nextValue, updatedAt: new Date().toISOString() };
    const next = { ...current, [url]: nextItem };
    window.localStorage.setItem(READING_KEY, JSON.stringify(next));
    emitChange();
  }, []);

  const toggleTopic = useCallback((topic: TopicId) => {
    const current = readStorage<TopicId[]>(window.localStorage.getItem(TOPICS_KEY) ?? "[]", []);
    const next = current.includes(topic)
      ? current.filter((item) => item !== topic)
      : [...current, topic];
    window.localStorage.setItem(TOPICS_KEY, JSON.stringify(next));
    emitChange();
  }, []);

  const saveProject = useCallback((nextProject: ProjectProfile) => {
    window.localStorage.setItem(PROJECT_KEY, JSON.stringify({ ...nextProject, updatedAt: new Date().toISOString() }));
    emitChange();
  }, []);

  const clearProject = useCallback(() => {
    window.localStorage.removeItem(PROJECT_KEY);
    emitChange();
  }, []);

  const setActionStatus = useCallback((url: string, status: ActionStatus | null) => {
    const current = readActionMap(window.localStorage.getItem(ACTIONS_KEY) ?? "{}");
    const next = { ...current };
    if (status) next[url] = { status, updatedAt: new Date().toISOString() };
    else delete next[url];
    window.localStorage.setItem(ACTIONS_KEY, JSON.stringify(next));
    emitChange();
  }, []);

  const value = useMemo<ReadingContextValue>(() => ({
    hydrated,
    reading,
    selectedTopics,
    project,
    actions,
    toggleRead: (url) => updateItem(url, "read"),
    toggleSaved: (url) => updateItem(url, "saved"),
    toggleTopic,
    saveProject,
    clearProject,
    setActionStatus,
  }), [actions, clearProject, hydrated, project, reading, saveProject, selectedTopics, setActionStatus, toggleTopic, updateItem]);

  return <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>;
}

export function useReadingState() {
  const context = useContext(ReadingContext);
  if (!context) throw new Error("useReadingState must be used within ReadingStateProvider");
  return context;
}
