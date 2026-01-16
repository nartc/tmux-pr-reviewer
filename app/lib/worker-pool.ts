// Worker factory for @pierre/diffs
// This creates workers for parallel syntax highlighting

// Vite worker URL import
import WorkerUrl from "@pierre/diffs/worker/worker.js?worker&url";
import type { WorkerPoolOptions, WorkerInitializationRenderOptions } from "@pierre/diffs/react";

export const poolOptions: WorkerPoolOptions = {
  workerFactory: () => new Worker(WorkerUrl, { type: "module" }),
  poolSize: 4,
};

export const highlighterOptions: WorkerInitializationRenderOptions = {
  theme: { dark: "pierre-dark", light: "pierre-light" },
  lineDiffType: "word-alt",
  tokenizeMaxLineLength: 1000,
};

// Default diff options for components
export const defaultDiffOptions = {
  theme: { dark: "pierre-dark", light: "pierre-light" } as const,
  diffStyle: "split" as const,
  lineDiffType: "word-alt" as const,
  overflow: "scroll" as const,
  enableLineSelection: true,
  enableHoverUtility: true,
  expansionLineCount: 3,
};
