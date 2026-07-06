import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";
import { DEFAULT_THREAD_TERMINAL_ID } from "./types";

export const PERSISTED_STATE_KEY = "t3code:ui-state:v1";
const LEGACY_PERSISTED_STATE_KEYS = [
  "t3code:renderer-state:v8",
  "t3code:renderer-state:v7",
  "t3code:renderer-state:v6",
  "t3code:renderer-state:v5",
  "t3code:renderer-state:v4",
  "t3code:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;

export interface PersistedUiState {
  collapsedProjectCwds?: string[];
  expandedProjectCwds?: string[];
  projectOrderCwds?: string[];
  defaultAdvertisedEndpointKey?: string | null;
  threadChangedFilesExpandedById?: Record<string, Record<string, boolean>>;
  workspaceShellSidebarOpen?: boolean;
  workspaceThreadLayoutById?: Record<string, PersistedWorkspaceThreadLayout>;
}

export type WorkspacePaneId = "ai" | "editor" | "plan" | "terminal";
export type WorkspaceDockedPaneType = "ai" | "editor" | "terminal";
export type WorkspaceDockedPaneId = string;
export type WorkspaceDockedPaneSlot = "primary" | "upper" | "grid";

export interface PersistedWorkspaceDockedPaneBase {
  paneId: WorkspaceDockedPaneId;
  type: WorkspaceDockedPaneType;
  title: string;
  environmentId: string;
  cwd: string | null;
  order: number;
  size: number;
  height?: number;
  dockSlot?: WorkspaceDockedPaneSlot;
  dockColumn?: number;
  dockRow?: number;
  dockX?: number;
  dockY?: number;
}

export interface PersistedWorkspaceAiPane extends PersistedWorkspaceDockedPaneBase {
  type: "ai";
  metadata: {
    threadId: string | null;
  };
}

export interface PersistedWorkspaceTerminalPane extends PersistedWorkspaceDockedPaneBase {
  type: "terminal";
  metadata: {
    threadId: string | null;
    terminalId?: string | null;
    terminalGroupId?: string | null;
  };
}

export interface PersistedWorkspaceEditorPane extends PersistedWorkspaceDockedPaneBase {
  type: "editor";
  metadata: {
    activePath?: string | null;
    openPaths?: string[];
  };
}

export type PersistedWorkspaceDockedPane =
  | PersistedWorkspaceAiPane
  | PersistedWorkspaceTerminalPane
  | PersistedWorkspaceEditorPane;

export interface WorkspaceThreadDockedPaneLayoutInput {
  threadId: string;
  environmentId: string;
  cwd: string | null | undefined;
  aiTitle: string;
  editorTitle: string;
  terminalTitle: string;
  editorActivePath?: string | null | undefined;
  terminalId?: string | null | undefined;
  terminalGroupId?: string | null | undefined;
}

export interface WorkspaceThreadAddDockedPaneInput {
  paneId: string;
  type: WorkspaceDockedPaneType;
  title: string;
  environmentId: string;
  cwd: string | null | undefined;
  threadId?: string | null | undefined;
  terminalId?: string | null | undefined;
  terminalGroupId?: string | null | undefined;
}

export interface WorkspaceThreadAiPaneBindingInput {
  threadId: string | null;
  environmentId?: string | null | undefined;
  title?: string | null | undefined;
}

export interface PersistedWorkspaceThreadLayout {
  activePaneId?: WorkspaceDockedPaneId;
  lastActivePane?: WorkspacePaneId;
  panes?: PersistedWorkspaceDockedPane[];
  paneTitleOverrideById?: Record<string, string>;
  planSidebarOpen?: boolean;
  removedDefaultPaneIds?: WorkspaceDockedPaneId[];
}

export interface UiProjectState {
  projectExpandedById: Record<string, boolean>;
  projectOrder: string[];
}

export interface UiThreadState {
  threadLastVisitedAtById: Record<string, string>;
  threadChangedFilesExpandedById: Record<string, Record<string, boolean>>;
}

export interface UiEndpointState {
  defaultAdvertisedEndpointKey: string | null;
}

export interface UiWorkspaceLayoutState {
  workspaceShellSidebarOpen: boolean;
  workspaceThreadLayoutById: Record<string, PersistedWorkspaceThreadLayout>;
}

export interface UiState
  extends UiProjectState, UiThreadState, UiEndpointState, UiWorkspaceLayoutState {}

export interface SyncProjectInput {
  /** Physical project key (env + cwd). Used for manual sort order. */
  key: string;
  /** Logical group key. Used for expand/collapse state. */
  logicalKey: string;
  cwd: string;
}

export interface SyncThreadInput {
  key: string;
  seedVisitedAt?: string | undefined;
}

const initialState: UiState = {
  projectExpandedById: {},
  projectOrder: [],
  threadLastVisitedAtById: {},
  threadChangedFilesExpandedById: {},
  defaultAdvertisedEndpointKey: null,
  workspaceShellSidebarOpen: true,
  workspaceThreadLayoutById: {},
};

const persistedCollapsedProjectCwds = new Set<string>();
const persistedExpandedProjectCwds = new Set<string>();
const persistedProjectOrderCwds: string[] = [];
const persistedProjectOrderCwdSet = new Set<string>();
const DEFAULT_WORKSPACE_PANE_SIZE = 1;
const WORKSPACE_DOCKED_PANE_IDS = {
  ai: "ai",
  editor: "editor",
  terminal: "terminal",
} as const satisfies Record<WorkspaceDockedPaneType, WorkspaceDockedPaneId>;
const DEFAULT_WORKSPACE_DOCKED_PANE_ID_SET = new Set<string>(
  Object.values(WORKSPACE_DOCKED_PANE_IDS),
);
// Pre-fix persisted shape only listed expanded cwds, so anything not listed
// was treated as collapsed. Track whether the loaded blob carried the new
// `collapsedProjectCwds` field so we can preserve that legacy semantic for
// one session after upgrade, until persistState rewrites in the new shape.
let persistedProjectStateUsesLegacyShape = false;
const currentProjectCwdById = new Map<string, string>();
const currentProjectCwdsByLogicalKey = new Map<string, string[]>();
const currentLogicalKeyByPhysicalKey = new Map<string, string>();
let legacyKeysCleanedUp = false;

function readPersistedState(): UiState {
  if (typeof window === "undefined") {
    return initialState;
  }
  try {
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    if (!raw) {
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) {
          continue;
        }
        hydratePersistedProjectState(JSON.parse(legacyRaw) as PersistedUiState);
        return initialState;
      }
      return initialState;
    }
    const parsed = JSON.parse(raw) as PersistedUiState;
    hydratePersistedProjectState(parsed);
    return {
      ...initialState,
      defaultAdvertisedEndpointKey:
        typeof parsed.defaultAdvertisedEndpointKey === "string" &&
        parsed.defaultAdvertisedEndpointKey.length > 0
          ? parsed.defaultAdvertisedEndpointKey
          : null,
      threadChangedFilesExpandedById: sanitizePersistedThreadChangedFilesExpanded(
        parsed.threadChangedFilesExpandedById,
      ),
      workspaceShellSidebarOpen:
        typeof parsed.workspaceShellSidebarOpen === "boolean"
          ? parsed.workspaceShellSidebarOpen
          : initialState.workspaceShellSidebarOpen,
      workspaceThreadLayoutById: sanitizePersistedWorkspaceThreadLayout(
        parsed.workspaceThreadLayoutById,
      ),
    };
  } catch {
    return initialState;
  }
}

function sanitizePersistedThreadChangedFilesExpanded(
  value: PersistedUiState["threadChangedFilesExpandedById"],
): Record<string, Record<string, boolean>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextState: Record<string, Record<string, boolean>> = {};
  for (const [threadId, turns] of Object.entries(value)) {
    if (!threadId || !turns || typeof turns !== "object") {
      continue;
    }

    const nextTurns: Record<string, boolean> = {};
    for (const [turnId, expanded] of Object.entries(turns)) {
      if (turnId && typeof expanded === "boolean" && expanded === false) {
        nextTurns[turnId] = false;
      }
    }

    if (Object.keys(nextTurns).length > 0) {
      nextState[threadId] = nextTurns;
    }
  }

  return nextState;
}

function sanitizePersistedWorkspaceThreadLayout(
  value: PersistedUiState["workspaceThreadLayoutById"],
): Record<string, PersistedWorkspaceThreadLayout> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextState: Record<string, PersistedWorkspaceThreadLayout> = {};
  for (const [threadId, layout] of Object.entries(value)) {
    if (!threadId || !layout || typeof layout !== "object") {
      continue;
    }

    const nextLayout: PersistedWorkspaceThreadLayout = {};
    if (
      layout.lastActivePane === "ai" ||
      layout.lastActivePane === "editor" ||
      layout.lastActivePane === "plan" ||
      layout.lastActivePane === "terminal"
    ) {
      nextLayout.lastActivePane = layout.lastActivePane;
    }
    const panes = sanitizeWorkspaceDockedPanes(layout.panes);
    if (panes.length > 0) {
      nextLayout.panes = panes;
    }
    const activePaneId = sanitizeWorkspacePaneTitle(layout.activePaneId);
    if (activePaneId !== null && panes.some((pane) => pane.paneId === activePaneId)) {
      nextLayout.activePaneId = activePaneId;
    }
    if (typeof layout.planSidebarOpen === "boolean") {
      nextLayout.planSidebarOpen = layout.planSidebarOpen;
    }
    const paneTitleOverrideById = sanitizeWorkspacePaneTitleOverrides(layout.paneTitleOverrideById);
    if (Object.keys(paneTitleOverrideById).length > 0) {
      nextLayout.paneTitleOverrideById = paneTitleOverrideById;
    }
    const removedDefaultPaneIds = sanitizeRemovedDefaultPaneIds(layout.removedDefaultPaneIds);
    if (removedDefaultPaneIds.length > 0) {
      nextLayout.removedDefaultPaneIds = removedDefaultPaneIds;
    }

    if (Object.keys(nextLayout).length > 0) {
      nextState[threadId] = nextLayout;
    }
  }

  return nextState;
}

function sanitizeWorkspacePaneType(value: unknown): WorkspaceDockedPaneType | null {
  return value === "ai" || value === "editor" || value === "terminal" ? value : null;
}

function sanitizeWorkspacePaneTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const title = value.trim().replace(/\s+/g, " ");
  return title.length > 0 ? title.slice(0, 120) : null;
}

function sanitizeWorkspacePaneSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(Math.max(value, 0.05), 100)
    : DEFAULT_WORKSPACE_PANE_SIZE;
}

function sanitizeWorkspacePaneHeight(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.min(value, 10_000)
    : undefined;
}

function sanitizeWorkspacePaneOrder(value: unknown, fallbackOrder: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallbackOrder;
}

function sanitizeWorkspacePaneSlot(value: unknown): WorkspaceDockedPaneSlot | undefined {
  return value === "primary" || value === "upper" || value === "grid" ? value : undefined;
}

function sanitizeWorkspacePaneCoordinate(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const nextValues: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = sanitizeOptionalString(item);
    if (normalized === null || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    nextValues.push(normalized);
  }
  return nextValues.length > 0 ? nextValues : undefined;
}

function sanitizeWorkspacePaneMetadata(
  type: WorkspaceDockedPaneType,
  value: unknown,
): PersistedWorkspaceDockedPane["metadata"] {
  const metadata = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  if (type === "ai") {
    return {
      threadId: sanitizeOptionalString(metadata.threadId),
    };
  }
  if (type === "terminal") {
    return {
      threadId: sanitizeOptionalString(metadata.threadId),
      terminalId: sanitizeOptionalString(metadata.terminalId),
      terminalGroupId: sanitizeOptionalString(metadata.terminalGroupId),
    };
  }
  const openPaths = sanitizeStringArray(metadata.openPaths);
  return {
    activePath: sanitizeOptionalString(metadata.activePath),
    ...(openPaths ? { openPaths } : {}),
  };
}

function sanitizeWorkspaceDockedPane(
  value: unknown,
  fallbackOrder: number,
): PersistedWorkspaceDockedPane | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const pane = value as Record<string, unknown>;
  const paneId = sanitizeWorkspacePaneTitle(pane.paneId);
  const type = sanitizeWorkspacePaneType(pane.type);
  const title = sanitizeWorkspacePaneTitle(pane.title);
  const environmentId = sanitizeOptionalString(pane.environmentId);
  if (paneId === null || type === null || title === null || environmentId === null) {
    return null;
  }

  const dockSlot = sanitizeWorkspacePaneSlot(pane.dockSlot);
  const dockColumn = sanitizeWorkspacePaneCoordinate(pane.dockColumn);
  const dockRow = sanitizeWorkspacePaneCoordinate(pane.dockRow);
  const dockX = sanitizeWorkspacePaneCoordinate(pane.dockX);
  const dockY = sanitizeWorkspacePaneCoordinate(pane.dockY);
  const height = sanitizeWorkspacePaneHeight(pane.height);
  const base = {
    paneId,
    type,
    title,
    environmentId,
    cwd: sanitizeOptionalString(pane.cwd),
    order: sanitizeWorkspacePaneOrder(pane.order, fallbackOrder),
    size: sanitizeWorkspacePaneSize(pane.size),
    ...(height !== undefined ? { height } : {}),
    ...(dockSlot ? { dockSlot } : {}),
    ...(dockColumn !== undefined ? { dockColumn } : {}),
    ...(dockRow !== undefined ? { dockRow } : {}),
    ...(dockX !== undefined ? { dockX } : {}),
    ...(dockY !== undefined ? { dockY } : {}),
  };
  const metadata = sanitizeWorkspacePaneMetadata(type, pane.metadata);
  return { ...base, metadata } as PersistedWorkspaceDockedPane;
}

export function sanitizeWorkspaceDockedPanes(value: unknown): PersistedWorkspaceDockedPane[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenPaneIds = new Set<string>();
  return value
    .flatMap((pane, index) => {
      const sanitizedPane = sanitizeWorkspaceDockedPane(pane, index);
      if (sanitizedPane === null || seenPaneIds.has(sanitizedPane.paneId)) {
        return [];
      }
      seenPaneIds.add(sanitizedPane.paneId);
      return [sanitizedPane];
    })
    .toSorted((left, right) => {
      const byOrder = left.order - right.order;
      return byOrder !== 0 ? byOrder : left.paneId.localeCompare(right.paneId);
    });
}

function sanitizeWorkspacePaneTitleOverrides(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextState: Record<string, string> = {};
  for (const [paneId, title] of Object.entries(value)) {
    const normalizedPaneId = sanitizeWorkspacePaneTitle(paneId);
    const normalizedTitle = sanitizeWorkspacePaneTitle(title);
    if (normalizedPaneId !== null && normalizedTitle !== null) {
      nextState[normalizedPaneId] = normalizedTitle;
    }
  }
  return nextState;
}

function sanitizeRemovedDefaultPaneIds(value: unknown): WorkspaceDockedPaneId[] {
  const values = sanitizeStringArray(value) ?? [];
  return values.filter((paneId) => DEFAULT_WORKSPACE_DOCKED_PANE_ID_SET.has(paneId));
}

export function hydratePersistedProjectState(parsed: PersistedUiState): void {
  persistedCollapsedProjectCwds.clear();
  persistedExpandedProjectCwds.clear();
  persistedProjectOrderCwds.length = 0;
  persistedProjectOrderCwdSet.clear();
  persistedProjectStateUsesLegacyShape = !Array.isArray(parsed.collapsedProjectCwds);
  for (const cwd of parsed.collapsedProjectCwds ?? []) {
    if (typeof cwd === "string" && cwd.length > 0) {
      persistedCollapsedProjectCwds.add(cwd);
    }
  }
  for (const cwd of parsed.expandedProjectCwds ?? []) {
    if (typeof cwd === "string" && cwd.length > 0) {
      persistedExpandedProjectCwds.add(cwd);
    }
  }
  for (const cwd of parsed.projectOrderCwds ?? []) {
    if (typeof cwd === "string" && cwd.length > 0 && !persistedProjectOrderCwdSet.has(cwd)) {
      persistedProjectOrderCwdSet.add(cwd);
      persistedProjectOrderCwds.push(cwd);
    }
  }
}

export function persistState(state: UiState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    // Persist collapsed cwds explicitly so an empty/missing field unambiguously
    // means "first install" rather than "user collapsed everything"; without
    // this, the syncProjects fallback would re-expand all rows on next launch.
    const collapsedProjectCwds = Object.entries(state.projectExpandedById)
      .filter(([, expanded]) => !expanded)
      .flatMap(([logicalKey]) => currentProjectCwdsByLogicalKey.get(logicalKey) ?? []);
    const expandedProjectCwds = Object.entries(state.projectExpandedById)
      .filter(([, expanded]) => expanded)
      .flatMap(([logicalKey]) => currentProjectCwdsByLogicalKey.get(logicalKey) ?? []);
    const projectOrderCwds = state.projectOrder.flatMap((projectId) => {
      const cwd = currentProjectCwdById.get(projectId);
      return cwd ? [cwd] : [];
    });
    const threadChangedFilesExpandedById = Object.fromEntries(
      Object.entries(state.threadChangedFilesExpandedById).flatMap(([threadId, turns]) => {
        const nextTurns = Object.fromEntries(
          Object.entries(turns).filter(([, expanded]) => expanded === false),
        );
        return Object.keys(nextTurns).length > 0 ? [[threadId, nextTurns]] : [];
      }),
    );
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        collapsedProjectCwds,
        expandedProjectCwds,
        projectOrderCwds,
        defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
        threadChangedFilesExpandedById,
        workspaceShellSidebarOpen: state.workspaceShellSidebarOpen,
        workspaceThreadLayoutById: state.workspaceThreadLayoutById,
      } satisfies PersistedUiState),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}

const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

function recordsEqual<T>(left: Record<string, T>, right: Record<string, T>): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  for (const [key, value] of leftEntries) {
    if (right[key] !== value) {
      return false;
    }
  }
  return true;
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function projectOrdersEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((projectId, index) => projectId === right[index])
  );
}

function nestedBooleanRecordsEqual(
  left: Record<string, Record<string, boolean>>,
  right: Record<string, Record<string, boolean>>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  for (const [key, value] of leftEntries) {
    if (!(key in right) || !recordsEqual(value, right[key]!)) {
      return false;
    }
  }
  return true;
}

export function syncProjects(state: UiState, projects: readonly SyncProjectInput[]): UiState {
  const previousProjectCwdById = new Map(currentProjectCwdById);
  const previousLogicalKeyByPhysicalKey = new Map(currentLogicalKeyByPhysicalKey);
  currentProjectCwdById.clear();
  currentLogicalKeyByPhysicalKey.clear();
  for (const project of projects) {
    currentProjectCwdById.set(project.key, project.cwd);
    currentLogicalKeyByPhysicalKey.set(project.key, project.logicalKey);
  }
  currentProjectCwdsByLogicalKey.clear();
  const currentProjectCwdSetsByLogicalKey = new Map<string, Set<string>>();
  for (const project of projects) {
    const cwds = currentProjectCwdsByLogicalKey.get(project.logicalKey);
    if (cwds) {
      let cwdSet = currentProjectCwdSetsByLogicalKey.get(project.logicalKey);
      if (!cwdSet) {
        cwdSet = new Set(cwds);
        currentProjectCwdSetsByLogicalKey.set(project.logicalKey, cwdSet);
      }
      if (!cwdSet.has(project.cwd)) {
        cwdSet.add(project.cwd);
        cwds.push(project.cwd);
      }
    } else {
      currentProjectCwdsByLogicalKey.set(project.logicalKey, [project.cwd]);
      currentProjectCwdSetsByLogicalKey.set(project.logicalKey, new Set([project.cwd]));
    }
  }
  // Build reverse map: for each new logical key, which previous logical keys
  // did its member projects live under? Lets us preserve expand state when a
  // project's logical key changes (e.g. late-arriving repo metadata flips the
  // group identity).
  const previousLogicalKeysByNewLogicalKey = new Map<string, Set<string>>();
  for (const project of projects) {
    const previousLogicalKey = previousLogicalKeyByPhysicalKey.get(project.key);
    if (!previousLogicalKey || previousLogicalKey === project.logicalKey) {
      continue;
    }
    const set = previousLogicalKeysByNewLogicalKey.get(project.logicalKey);
    if (set) {
      set.add(previousLogicalKey);
    } else {
      previousLogicalKeysByNewLogicalKey.set(project.logicalKey, new Set([previousLogicalKey]));
    }
  }
  const cwdMappingChanged =
    previousProjectCwdById.size !== currentProjectCwdById.size ||
    projects.some((project) => previousProjectCwdById.get(project.key) !== project.cwd);

  const nextExpandedById: Record<string, boolean> = {};
  const previousExpandedById = state.projectExpandedById;
  const persistedOrderByCwd = new Map(
    persistedProjectOrderCwds.map((cwd, index) => [cwd, index] as const),
  );
  const mappedProjects = projects.map((project, index) => {
    if (!(project.logicalKey in nextExpandedById)) {
      const groupCwds = currentProjectCwdsByLogicalKey.get(project.logicalKey) ?? [project.cwd];
      const fallbackFromPreviousLogicalKey = (() => {
        const previousKeys = previousLogicalKeysByNewLogicalKey.get(project.logicalKey);
        if (!previousKeys) {
          return undefined;
        }
        for (const previousKey of previousKeys) {
          if (previousKey in previousExpandedById) {
            return previousExpandedById[previousKey];
          }
        }
        return undefined;
      })();
      const fallbackFromPersistedShape = (() => {
        if (groupCwds.some((cwd) => persistedExpandedProjectCwds.has(cwd))) {
          return true;
        }
        if (groupCwds.some((cwd) => persistedCollapsedProjectCwds.has(cwd))) {
          return false;
        }
        if (persistedProjectStateUsesLegacyShape && persistedExpandedProjectCwds.size > 0) {
          return false;
        }
        return true;
      })();
      const expanded =
        previousExpandedById[project.logicalKey] ??
        fallbackFromPreviousLogicalKey ??
        fallbackFromPersistedShape;
      nextExpandedById[project.logicalKey] = expanded;
    }
    return {
      id: project.key,
      cwd: project.cwd,
      incomingIndex: index,
    };
  });

  const nextProjectOrder =
    state.projectOrder.length > 0
      ? (() => {
          const currentProjectIds = new Set(mappedProjects.map((project) => project.id));
          const nextProjectIdByCwd = new Map(
            mappedProjects.map((project) => [project.cwd, project.id] as const),
          );
          const usedProjectIds = new Set<string>();
          const orderedProjectIds: string[] = [];

          for (const projectId of state.projectOrder) {
            const matchedProjectId =
              (currentProjectIds.has(projectId) ? projectId : undefined) ??
              (() => {
                const previousCwd = previousProjectCwdById.get(projectId);
                return previousCwd ? nextProjectIdByCwd.get(previousCwd) : undefined;
              })();
            if (!matchedProjectId || usedProjectIds.has(matchedProjectId)) {
              continue;
            }
            usedProjectIds.add(matchedProjectId);
            orderedProjectIds.push(matchedProjectId);
          }

          for (const project of mappedProjects) {
            if (usedProjectIds.has(project.id)) {
              continue;
            }
            orderedProjectIds.push(project.id);
          }

          return orderedProjectIds;
        })()
      : mappedProjects
          .map((project) => ({
            id: project.id,
            incomingIndex: project.incomingIndex,
            orderIndex:
              persistedOrderByCwd.get(project.cwd) ??
              persistedProjectOrderCwds.length + project.incomingIndex,
          }))
          .toSorted((left, right) => {
            const byOrder = left.orderIndex - right.orderIndex;
            if (byOrder !== 0) {
              return byOrder;
            }
            return left.incomingIndex - right.incomingIndex;
          })
          .map((project) => project.id);

  if (
    recordsEqual(state.projectExpandedById, nextExpandedById) &&
    projectOrdersEqual(state.projectOrder, nextProjectOrder) &&
    !cwdMappingChanged
  ) {
    return state;
  }

  return {
    ...state,
    projectExpandedById: nextExpandedById,
    projectOrder: nextProjectOrder,
  };
}

export function syncThreads(state: UiState, threads: readonly SyncThreadInput[]): UiState {
  const retainedThreadIds = new Set(threads.map((thread) => thread.key));
  const nextThreadLastVisitedAtById = Object.fromEntries(
    Object.entries(state.threadLastVisitedAtById).filter(([threadId]) =>
      retainedThreadIds.has(threadId),
    ),
  );
  for (const thread of threads) {
    if (
      nextThreadLastVisitedAtById[thread.key] === undefined &&
      thread.seedVisitedAt !== undefined &&
      thread.seedVisitedAt.length > 0
    ) {
      nextThreadLastVisitedAtById[thread.key] = thread.seedVisitedAt;
    }
  }
  const nextThreadChangedFilesExpandedById = Object.fromEntries(
    Object.entries(state.threadChangedFilesExpandedById).filter(([threadId]) =>
      retainedThreadIds.has(threadId),
    ),
  );
  const nextWorkspaceThreadLayoutById = Object.fromEntries(
    Object.entries(state.workspaceThreadLayoutById).filter(
      ([threadId]) => threadId.startsWith("workspace:") || retainedThreadIds.has(threadId),
    ),
  );
  if (
    recordsEqual(state.threadLastVisitedAtById, nextThreadLastVisitedAtById) &&
    nestedBooleanRecordsEqual(
      state.threadChangedFilesExpandedById,
      nextThreadChangedFilesExpandedById,
    ) &&
    workspaceThreadLayoutsEqual(state.workspaceThreadLayoutById, nextWorkspaceThreadLayoutById)
  ) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: nextThreadLastVisitedAtById,
    threadChangedFilesExpandedById: nextThreadChangedFilesExpandedById,
    workspaceThreadLayoutById: nextWorkspaceThreadLayoutById,
  };
}

export function migrateWorkspaceThreadLayout(
  state: UiState,
  sourceLayoutId: string,
  targetLayoutId: string,
): UiState {
  if (
    sourceLayoutId === targetLayoutId ||
    state.workspaceThreadLayoutById[targetLayoutId] !== undefined
  ) {
    return state;
  }
  const sourceLayout = state.workspaceThreadLayoutById[sourceLayoutId];
  if (!sourceLayout) {
    return state;
  }
  return {
    ...state,
    workspaceThreadLayoutById: {
      ...state.workspaceThreadLayoutById,
      [targetLayoutId]: sourceLayout,
    },
  };
}

export function markThreadVisited(state: UiState, threadId: string, visitedAt?: string): UiState {
  const at = visitedAt ?? new Date().toISOString();
  const visitedAtMs = Date.parse(at);
  const previousVisitedAt = state.threadLastVisitedAtById[threadId];
  const previousVisitedAtMs = previousVisitedAt ? Date.parse(previousVisitedAt) : NaN;
  if (
    Number.isFinite(previousVisitedAtMs) &&
    Number.isFinite(visitedAtMs) &&
    previousVisitedAtMs >= visitedAtMs
  ) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: at,
    },
  };
}

export function markThreadUnread(
  state: UiState,
  threadId: string,
  latestTurnCompletedAt: string | null | undefined,
): UiState {
  if (!latestTurnCompletedAt) {
    return state;
  }
  const latestTurnCompletedAtMs = Date.parse(latestTurnCompletedAt);
  if (Number.isNaN(latestTurnCompletedAtMs)) {
    return state;
  }
  const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
  if (state.threadLastVisitedAtById[threadId] === unreadVisitedAt) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: unreadVisitedAt,
    },
  };
}

export function clearThreadUi(state: UiState, threadId: string): UiState {
  const hasVisitedState = threadId in state.threadLastVisitedAtById;
  const hasChangedFilesState = threadId in state.threadChangedFilesExpandedById;
  const hasWorkspaceLayoutState = threadId in state.workspaceThreadLayoutById;
  if (!hasVisitedState && !hasChangedFilesState && !hasWorkspaceLayoutState) {
    return state;
  }
  const nextThreadLastVisitedAtById = { ...state.threadLastVisitedAtById };
  const nextThreadChangedFilesExpandedById = { ...state.threadChangedFilesExpandedById };
  const nextWorkspaceThreadLayoutById = { ...state.workspaceThreadLayoutById };
  delete nextThreadLastVisitedAtById[threadId];
  delete nextThreadChangedFilesExpandedById[threadId];
  delete nextWorkspaceThreadLayoutById[threadId];
  return {
    ...state,
    threadLastVisitedAtById: nextThreadLastVisitedAtById,
    threadChangedFilesExpandedById: nextThreadChangedFilesExpandedById,
    workspaceThreadLayoutById: nextWorkspaceThreadLayoutById,
  };
}

function workspaceThreadLayoutEqual(
  left: PersistedWorkspaceThreadLayout | undefined,
  right: PersistedWorkspaceThreadLayout | undefined,
): boolean {
  return (
    (left?.activePaneId ?? undefined) === (right?.activePaneId ?? undefined) &&
    (left?.lastActivePane ?? undefined) === (right?.lastActivePane ?? undefined) &&
    (left?.planSidebarOpen === true) === (right?.planSidebarOpen === true) &&
    workspaceDockedPanesEqual(left?.panes ?? [], right?.panes ?? []) &&
    recordsEqual(left?.paneTitleOverrideById ?? {}, right?.paneTitleOverrideById ?? {}) &&
    stringArraysEqual(left?.removedDefaultPaneIds ?? [], right?.removedDefaultPaneIds ?? [])
  );
}

function workspaceThreadLayoutsEqual(
  left: Record<string, PersistedWorkspaceThreadLayout>,
  right: Record<string, PersistedWorkspaceThreadLayout>,
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }
  for (const [key, value] of leftEntries) {
    if (!workspaceThreadLayoutEqual(value, right[key])) {
      return false;
    }
  }
  return true;
}

function isDefaultWorkspaceThreadLayout(layout: PersistedWorkspaceThreadLayout): boolean {
  return (
    layout.planSidebarOpen !== true &&
    layout.activePaneId === undefined &&
    layout.lastActivePane === undefined &&
    (layout.panes?.length ?? 0) === 0 &&
    Object.keys(layout.paneTitleOverrideById ?? {}).length === 0 &&
    (layout.removedDefaultPaneIds?.length ?? 0) === 0
  );
}

function updateWorkspaceThreadLayout(
  state: UiState,
  threadId: string,
  updater: (layout: PersistedWorkspaceThreadLayout) => PersistedWorkspaceThreadLayout,
): UiState {
  if (threadId.length === 0) {
    return state;
  }

  const current = state.workspaceThreadLayoutById[threadId] ?? {};
  const next = updater(current);
  if (workspaceThreadLayoutEqual(current, next)) {
    return state;
  }

  const nextWorkspaceThreadLayoutById = { ...state.workspaceThreadLayoutById };
  if (isDefaultWorkspaceThreadLayout(next)) {
    delete nextWorkspaceThreadLayoutById[threadId];
  } else {
    nextWorkspaceThreadLayoutById[threadId] = next;
  }
  return {
    ...state,
    workspaceThreadLayoutById: nextWorkspaceThreadLayoutById,
  };
}

export function setThreadChangedFilesExpanded(
  state: UiState,
  threadId: string,
  turnId: string,
  expanded: boolean,
): UiState {
  const currentThreadState = state.threadChangedFilesExpandedById[threadId] ?? {};
  const currentExpanded = currentThreadState[turnId] ?? true;
  if (currentExpanded === expanded) {
    return state;
  }

  if (expanded) {
    if (!(turnId in currentThreadState)) {
      return state;
    }

    const nextThreadState = { ...currentThreadState };
    delete nextThreadState[turnId];
    if (Object.keys(nextThreadState).length === 0) {
      const nextState = { ...state.threadChangedFilesExpandedById };
      delete nextState[threadId];
      return {
        ...state,
        threadChangedFilesExpandedById: nextState,
      };
    }

    return {
      ...state,
      threadChangedFilesExpandedById: {
        ...state.threadChangedFilesExpandedById,
        [threadId]: nextThreadState,
      },
    };
  }

  return {
    ...state,
    threadChangedFilesExpandedById: {
      ...state.threadChangedFilesExpandedById,
      [threadId]: {
        ...currentThreadState,
        [turnId]: false,
      },
    },
  };
}

export function setDefaultAdvertisedEndpointKey(state: UiState, key: string | null): UiState {
  const nextKey = key && key.length > 0 ? key : null;
  if (state.defaultAdvertisedEndpointKey === nextKey) {
    return state;
  }
  return {
    ...state,
    defaultAdvertisedEndpointKey: nextKey,
  };
}

export function setWorkspaceShellSidebarOpen(state: UiState, open: boolean): UiState {
  if (state.workspaceShellSidebarOpen === open) {
    return state;
  }
  return {
    ...state,
    workspaceShellSidebarOpen: open,
  };
}

export function setWorkspaceThreadPlanSidebarOpen(
  state: UiState,
  threadId: string,
  open: boolean,
): UiState {
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    if (open) {
      return {
        ...layout,
        lastActivePane: "plan",
        planSidebarOpen: true,
      };
    }
    const { planSidebarOpen: _planSidebarOpen, ...nextLayout } = layout;
    return nextLayout;
  });
}

export function setWorkspaceThreadLastActivePane(
  state: UiState,
  threadId: string,
  pane: WorkspacePaneId,
): UiState {
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const nextLayout: PersistedWorkspaceThreadLayout = {
      ...layout,
      lastActivePane: pane,
    };
    if (pane === "ai" || pane === "editor" || pane === "terminal") {
      nextLayout.activePaneId = WORKSPACE_DOCKED_PANE_IDS[pane];
    }
    return nextLayout;
  });
}

export function setWorkspaceThreadPaneTitleOverride(
  state: UiState,
  threadId: string,
  paneId: string,
  title: string | null,
): UiState {
  const normalizedPaneId = sanitizeWorkspacePaneTitle(paneId);
  if (normalizedPaneId === null) {
    return state;
  }
  const normalizedTitle = sanitizeWorkspacePaneTitle(title);

  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const currentOverrides = layout.paneTitleOverrideById ?? {};
    const currentTitle = currentOverrides[normalizedPaneId];
    if (currentTitle === (normalizedTitle ?? undefined)) {
      return layout;
    }

    const nextOverrides = { ...currentOverrides };
    if (normalizedTitle === null) {
      delete nextOverrides[normalizedPaneId];
    } else {
      nextOverrides[normalizedPaneId] = normalizedTitle;
    }

    if (Object.keys(nextOverrides).length === 0) {
      const { paneTitleOverrideById: _paneTitleOverrideById, ...nextLayout } = layout;
      return nextLayout;
    }
    return {
      ...layout,
      paneTitleOverrideById: nextOverrides,
    };
  });
}

function workspaceDockedPaneEqual(
  left: PersistedWorkspaceDockedPane,
  right: PersistedWorkspaceDockedPane,
): boolean {
  return (
    left.paneId === right.paneId &&
    left.type === right.type &&
    left.title === right.title &&
    left.environmentId === right.environmentId &&
    left.cwd === right.cwd &&
    left.order === right.order &&
    left.size === right.size &&
    left.height === right.height &&
    left.dockSlot === right.dockSlot &&
    left.dockColumn === right.dockColumn &&
    left.dockRow === right.dockRow &&
    left.dockX === right.dockX &&
    left.dockY === right.dockY &&
    JSON.stringify(left.metadata) === JSON.stringify(right.metadata)
  );
}

function workspaceDockedPanesEqual(
  left: readonly PersistedWorkspaceDockedPane[],
  right: readonly PersistedWorkspaceDockedPane[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftPane = left[index];
    const rightPane = right[index];
    if (!leftPane || !rightPane || !workspaceDockedPaneEqual(leftPane, rightPane)) {
      return false;
    }
  }
  return true;
}

function defaultPaneTitle(title: string, fallback: string): string {
  return sanitizeWorkspacePaneTitle(title) ?? fallback;
}

function defaultWorkspaceDockedPanes(
  input: WorkspaceThreadDockedPaneLayoutInput,
): PersistedWorkspaceDockedPane[] {
  const cwd = sanitizeOptionalString(input.cwd);
  const environmentId = sanitizeOptionalString(input.environmentId);
  const threadId = sanitizeOptionalString(input.threadId);
  if (environmentId === null || threadId === null) {
    return [];
  }

  return [
    {
      paneId: WORKSPACE_DOCKED_PANE_IDS.editor,
      type: "editor",
      title: defaultPaneTitle(input.editorTitle, "Editor"),
      environmentId,
      cwd,
      order: 0,
      size: DEFAULT_WORKSPACE_PANE_SIZE,
      metadata: {
        activePath: sanitizeOptionalString(input.editorActivePath),
      },
    },
    {
      paneId: WORKSPACE_DOCKED_PANE_IDS.ai,
      type: "ai",
      title: defaultPaneTitle(input.aiTitle, "AI"),
      environmentId,
      cwd,
      order: 1,
      size: DEFAULT_WORKSPACE_PANE_SIZE,
      metadata: {
        threadId,
      },
    },
    {
      paneId: WORKSPACE_DOCKED_PANE_IDS.terminal,
      type: "terminal",
      title: defaultPaneTitle(input.terminalTitle, "Terminal"),
      environmentId,
      cwd,
      order: 2,
      size: DEFAULT_WORKSPACE_PANE_SIZE,
      metadata: {
        threadId,
        terminalId: sanitizeOptionalString(input.terminalId),
        terminalGroupId: sanitizeOptionalString(input.terminalGroupId),
      },
    },
  ];
}

function workspaceDockedPaneWithRuntimeContext(
  pane: PersistedWorkspaceDockedPane,
  defaultsById: Record<string, PersistedWorkspaceDockedPane>,
): PersistedWorkspaceDockedPane {
  const defaultPane = defaultsById[pane.paneId];
  if (!defaultPane || defaultPane.type !== pane.type) {
    return pane;
  }
  if (pane.type === "ai" && defaultPane.type === "ai") {
    return pane;
  }
  if (pane.type === "terminal" && defaultPane.type === "terminal") {
    const shouldRepairDefaultTerminalPane =
      pane.paneId === WORKSPACE_DOCKED_PANE_IDS.terminal &&
      defaultPane.metadata.terminalId === DEFAULT_THREAD_TERMINAL_ID;
    return {
      ...pane,
      environmentId: defaultPane.environmentId,
      cwd: defaultPane.cwd,
      metadata: {
        threadId: pane.metadata.threadId ?? defaultPane.metadata.threadId ?? null,
        terminalId: shouldRepairDefaultTerminalPane
          ? (defaultPane.metadata.terminalId ?? pane.metadata.terminalId ?? null)
          : (pane.metadata.terminalId ?? defaultPane.metadata.terminalId ?? null),
        terminalGroupId: shouldRepairDefaultTerminalPane
          ? (defaultPane.metadata.terminalGroupId ?? pane.metadata.terminalGroupId ?? null)
          : (pane.metadata.terminalGroupId ?? defaultPane.metadata.terminalGroupId ?? null),
      },
    };
  }
  if (pane.type === "editor" && defaultPane.type === "editor") {
    return {
      ...pane,
      environmentId: defaultPane.environmentId,
      cwd: defaultPane.cwd,
      metadata: {
        activePath: pane.metadata.activePath ?? null,
        ...(pane.metadata.openPaths ? { openPaths: pane.metadata.openPaths } : {}),
      },
    };
  }
  return pane;
}

export function ensureWorkspaceThreadDockedPaneLayout(
  state: UiState,
  threadId: string,
  input: WorkspaceThreadDockedPaneLayoutInput,
): UiState {
  const defaultPanes = defaultWorkspaceDockedPanes(input);
  if (defaultPanes.length === 0) {
    return state;
  }

  const defaultsById = Object.fromEntries(defaultPanes.map((pane) => [pane.paneId, pane]));
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const existingPanes = layout.panes ?? [];
    const existingPaneIds = new Set(existingPanes.map((pane) => pane.paneId));
    const removedDefaultPaneIds = new Set(layout.removedDefaultPaneIds ?? []);
    const panes = sanitizeWorkspaceDockedPanes([
      ...existingPanes.map((pane) => workspaceDockedPaneWithRuntimeContext(pane, defaultsById)),
      ...defaultPanes.filter(
        (pane) => !existingPaneIds.has(pane.paneId) && !removedDefaultPaneIds.has(pane.paneId),
      ),
    ]);
    const candidateActivePaneId =
      layout.activePaneId && panes.some((pane) => pane.paneId === layout.activePaneId)
        ? layout.activePaneId
        : layout.lastActivePane === "ai" ||
            layout.lastActivePane === "editor" ||
            layout.lastActivePane === "terminal"
          ? WORKSPACE_DOCKED_PANE_IDS[layout.lastActivePane]
          : WORKSPACE_DOCKED_PANE_IDS.ai;
    const activePaneId = panes.some((pane) => pane.paneId === candidateActivePaneId)
      ? candidateActivePaneId
      : (panes.find((pane) => pane.paneId === WORKSPACE_DOCKED_PANE_IDS.ai)?.paneId ??
        panes[0]?.paneId);

    const nextLayout: PersistedWorkspaceThreadLayout = {
      ...layout,
      panes,
    };
    if (activePaneId) {
      nextLayout.activePaneId = activePaneId;
    } else {
      delete nextLayout.activePaneId;
    }
    return nextLayout;
  });
}

export function setWorkspaceThreadDockedPanes(
  state: UiState,
  threadId: string,
  panes: readonly PersistedWorkspaceDockedPane[],
  activePaneId?: string | null,
): UiState {
  const sanitizedPanes = sanitizeWorkspaceDockedPanes(panes);
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const normalizedActivePaneId =
      sanitizeWorkspacePaneTitle(activePaneId) ??
      (layout.activePaneId && sanitizedPanes.some((pane) => pane.paneId === layout.activePaneId)
        ? layout.activePaneId
        : null);
    return {
      ...layout,
      panes: sanitizedPanes,
      ...(normalizedActivePaneId !== null &&
      sanitizedPanes.some((pane) => pane.paneId === normalizedActivePaneId)
        ? { activePaneId: normalizedActivePaneId }
        : {}),
    };
  });
}

export function addWorkspaceThreadDockedPane(
  state: UiState,
  threadId: string,
  input: WorkspaceThreadAddDockedPaneInput,
): UiState {
  const paneId = sanitizeWorkspacePaneTitle(input.paneId);
  const title = sanitizeWorkspacePaneTitle(input.title);
  const environmentId = sanitizeOptionalString(input.environmentId);
  if (paneId === null || title === null || environmentId === null) {
    return state;
  }

  const base = {
    paneId,
    type: input.type,
    title,
    environmentId,
    cwd: sanitizeOptionalString(input.cwd),
    order: 0,
    size: DEFAULT_WORKSPACE_PANE_SIZE,
  };
  const pane: PersistedWorkspaceDockedPane =
    input.type === "ai"
      ? {
          ...base,
          type: "ai",
          metadata: {
            threadId: sanitizeOptionalString(input.threadId),
          },
        }
      : input.type === "terminal"
        ? {
            ...base,
            type: "terminal",
            metadata: {
              threadId: sanitizeOptionalString(input.threadId),
              terminalId: sanitizeOptionalString(input.terminalId),
              terminalGroupId: sanitizeOptionalString(input.terminalGroupId),
            },
          }
        : {
            ...base,
            type: "editor",
            metadata: {},
          };

  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const existingPanes = layout.panes ?? [];
    if (existingPanes.some((existingPane) => existingPane.paneId === pane.paneId)) {
      return {
        ...layout,
        activePaneId: pane.paneId,
      };
    }
    const sortedPanes = sanitizeWorkspaceDockedPanes(existingPanes);
    const defaultTerminalPane =
      sortedPanes.find(
        (existingPane) => existingPane.paneId === WORKSPACE_DOCKED_PANE_IDS.terminal,
      ) ?? null;
    const placementAnchor =
      pane.type === "terminal"
        ? (sortedPanes.findLast((existingPane) => existingPane.type === "terminal") ??
          defaultTerminalPane)
        : (sortedPanes.at(-1) ?? defaultTerminalPane);
    const anchorIndex = placementAnchor
      ? sortedPanes.findIndex((existingPane) => existingPane.paneId === placementAnchor.paneId)
      : -1;
    const nextPane = anchorIndex >= 0 ? (sortedPanes[anchorIndex + 1] ?? null) : null;
    const maxOrder = sortedPanes.reduce(
      (order, existingPane) => Math.max(order, existingPane.order),
      -1,
    );
    const order =
      placementAnchor === null
        ? maxOrder + 1
        : nextPane
          ? placementAnchor.order + (nextPane.order - placementAnchor.order) / 2
          : placementAnchor.order + 1;
    const panes = sanitizeWorkspaceDockedPanes([
      ...existingPanes,
      {
        ...pane,
        order,
        size: defaultTerminalPane?.size ?? pane.size,
      },
    ]);
    return {
      ...layout,
      activePaneId: pane.paneId,
      panes,
    };
  });
}

export function setWorkspaceThreadAiPaneBinding(
  state: UiState,
  threadId: string,
  paneId: string,
  input: WorkspaceThreadAiPaneBindingInput,
): UiState {
  const normalizedPaneId = sanitizeWorkspacePaneTitle(paneId);
  if (normalizedPaneId === null) {
    return state;
  }
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const existingPanes = sanitizeWorkspaceDockedPanes(layout.panes);
    if (!existingPanes.some((pane) => pane.paneId === normalizedPaneId && pane.type === "ai")) {
      return layout;
    }
    const nextThreadId = sanitizeOptionalString(input.threadId);
    const nextEnvironmentId = sanitizeOptionalString(input.environmentId);
    const nextTitle = sanitizeWorkspacePaneTitle(input.title);
    const panes = existingPanes.map((pane) => {
      if (pane.paneId !== normalizedPaneId || pane.type !== "ai") {
        return pane;
      }
      return {
        ...pane,
        ...(nextEnvironmentId ? { environmentId: nextEnvironmentId } : {}),
        ...(nextTitle ? { title: nextTitle } : {}),
        metadata: {
          threadId: nextThreadId,
        },
      };
    });
    return {
      ...layout,
      activePaneId: normalizedPaneId,
      panes,
    };
  });
}

export function removeWorkspaceThreadDockedPane(
  state: UiState,
  threadId: string,
  paneId: string,
): UiState {
  const normalizedPaneId = sanitizeWorkspacePaneTitle(paneId);
  if (normalizedPaneId === null) {
    return state;
  }
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const existingPanes = sanitizeWorkspaceDockedPanes(layout.panes);
    if (!existingPanes.some((pane) => pane.paneId === normalizedPaneId)) {
      return layout;
    }
    const panes = existingPanes.filter((pane) => pane.paneId !== normalizedPaneId);
    const nextActivePaneId =
      layout.activePaneId === normalizedPaneId
        ? (panes.find((pane) => pane.paneId === WORKSPACE_DOCKED_PANE_IDS.ai)?.paneId ??
          panes[0]?.paneId)
        : layout.activePaneId;
    const { [normalizedPaneId]: _removedTitle, ...paneTitleOverrideById } =
      layout.paneTitleOverrideById ?? {};
    const removedDefaultPaneIds = DEFAULT_WORKSPACE_DOCKED_PANE_ID_SET.has(normalizedPaneId)
      ? sanitizeRemovedDefaultPaneIds([...(layout.removedDefaultPaneIds ?? []), normalizedPaneId])
      : (layout.removedDefaultPaneIds ?? []);

    const nextLayout: PersistedWorkspaceThreadLayout = {
      ...layout,
      panes,
    };
    if (nextActivePaneId) {
      nextLayout.activePaneId = nextActivePaneId;
    } else {
      delete nextLayout.activePaneId;
    }
    if (Object.keys(paneTitleOverrideById).length > 0) {
      nextLayout.paneTitleOverrideById = paneTitleOverrideById;
    } else {
      delete nextLayout.paneTitleOverrideById;
    }
    if (removedDefaultPaneIds.length > 0) {
      nextLayout.removedDefaultPaneIds = removedDefaultPaneIds;
    } else {
      delete nextLayout.removedDefaultPaneIds;
    }
    return nextLayout;
  });
}

export function restoreWorkspaceThreadDefaultDockedPane(
  state: UiState,
  threadId: string,
  paneId: string,
): UiState {
  const normalizedPaneId = sanitizeWorkspacePaneTitle(paneId);
  if (normalizedPaneId === null || !DEFAULT_WORKSPACE_DOCKED_PANE_ID_SET.has(normalizedPaneId)) {
    return state;
  }
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    const removedDefaultPaneIds = (layout.removedDefaultPaneIds ?? []).filter(
      (removedPaneId) => removedPaneId !== normalizedPaneId,
    );
    if ((layout.removedDefaultPaneIds?.length ?? 0) === removedDefaultPaneIds.length) {
      return layout;
    }
    const nextLayout: PersistedWorkspaceThreadLayout = {
      ...layout,
    };
    if (removedDefaultPaneIds.length > 0) {
      nextLayout.removedDefaultPaneIds = removedDefaultPaneIds;
    } else {
      delete nextLayout.removedDefaultPaneIds;
    }
    return nextLayout;
  });
}

export function setWorkspaceThreadActiveDockedPane(
  state: UiState,
  threadId: string,
  paneId: string,
): UiState {
  const normalizedPaneId = sanitizeWorkspacePaneTitle(paneId);
  if (normalizedPaneId === null) {
    return state;
  }
  return updateWorkspaceThreadLayout(state, threadId, (layout) => {
    if (!layout.panes?.some((pane) => pane.paneId === normalizedPaneId)) {
      return layout;
    }
    return {
      ...layout,
      activePaneId: normalizedPaneId,
    };
  });
}

export function toggleProject(state: UiState, projectId: string): UiState {
  const expanded = state.projectExpandedById[projectId] ?? true;
  return {
    ...state,
    projectExpandedById: {
      ...state.projectExpandedById,
      [projectId]: !expanded,
    },
  };
}

export function setProjectExpanded(state: UiState, projectId: string, expanded: boolean): UiState {
  if ((state.projectExpandedById[projectId] ?? true) === expanded) {
    return state;
  }
  return {
    ...state,
    projectExpandedById: {
      ...state.projectExpandedById,
      [projectId]: expanded,
    },
  };
}

export function reorderProjects(
  state: UiState,
  draggedProjectIds: readonly string[],
  targetProjectIds: readonly string[],
): UiState {
  if (draggedProjectIds.length === 0) {
    return state;
  }
  const draggedSet = new Set(draggedProjectIds);
  const targetSet = new Set(targetProjectIds);
  if (draggedProjectIds.every((id) => targetSet.has(id))) {
    return state;
  }

  const originalTargetIndex = state.projectOrder.findIndex((id) => targetSet.has(id));
  if (originalTargetIndex < 0) {
    return state;
  }

  const projectOrder = [...state.projectOrder];

  const removed: string[] = [];
  let draggedBeforeTarget = 0;
  for (let i = projectOrder.length - 1; i >= 0; i--) {
    if (draggedSet.has(projectOrder[i]!)) {
      removed.unshift(projectOrder.splice(i, 1)[0]!);
      if (i < originalTargetIndex) {
        draggedBeforeTarget++;
      }
    }
  }
  if (removed.length === 0) {
    return state;
  }

  const insertIndex = originalTargetIndex - Math.max(0, draggedBeforeTarget - 1);
  projectOrder.splice(insertIndex, 0, ...removed);
  return {
    ...state,
    projectOrder,
  };
}

interface UiStateStore extends UiState {
  syncProjects: (projects: readonly SyncProjectInput[]) => void;
  syncThreads: (threads: readonly SyncThreadInput[]) => void;
  markThreadVisited: (threadId: string, visitedAt?: string) => void;
  markThreadUnread: (threadId: string, latestTurnCompletedAt: string | null | undefined) => void;
  clearThreadUi: (threadId: string) => void;
  setThreadChangedFilesExpanded: (threadId: string, turnId: string, expanded: boolean) => void;
  setDefaultAdvertisedEndpointKey: (key: string | null) => void;
  setWorkspaceShellSidebarOpen: (open: boolean) => void;
  migrateWorkspaceThreadLayout: (sourceLayoutId: string, targetLayoutId: string) => void;
  setWorkspaceThreadPlanSidebarOpen: (threadId: string, open: boolean) => void;
  setWorkspaceThreadLastActivePane: (threadId: string, pane: WorkspacePaneId) => void;
  setWorkspaceThreadPaneTitleOverride: (
    threadId: string,
    paneId: string,
    title: string | null,
  ) => void;
  ensureWorkspaceThreadDockedPaneLayout: (
    threadId: string,
    input: WorkspaceThreadDockedPaneLayoutInput,
  ) => void;
  setWorkspaceThreadDockedPanes: (
    threadId: string,
    panes: readonly PersistedWorkspaceDockedPane[],
    activePaneId?: string | null,
  ) => void;
  addWorkspaceThreadDockedPane: (
    threadId: string,
    input: WorkspaceThreadAddDockedPaneInput,
  ) => void;
  setWorkspaceThreadAiPaneBinding: (
    threadId: string,
    paneId: string,
    input: WorkspaceThreadAiPaneBindingInput,
  ) => void;
  removeWorkspaceThreadDockedPane: (threadId: string, paneId: string) => void;
  restoreWorkspaceThreadDefaultDockedPane: (threadId: string, paneId: string) => void;
  setWorkspaceThreadActiveDockedPane: (threadId: string, paneId: string) => void;
  toggleProject: (projectId: string) => void;
  setProjectExpanded: (projectId: string, expanded: boolean) => void;
  reorderProjects: (
    draggedProjectIds: readonly string[],
    targetProjectIds: readonly string[],
  ) => void;
}

export const useUiStateStore = create<UiStateStore>((set) => ({
  ...readPersistedState(),
  syncProjects: (projects) => set((state) => syncProjects(state, projects)),
  syncThreads: (threads) => set((state) => syncThreads(state, threads)),
  markThreadVisited: (threadId, visitedAt) =>
    set((state) => markThreadVisited(state, threadId, visitedAt)),
  markThreadUnread: (threadId, latestTurnCompletedAt) =>
    set((state) => markThreadUnread(state, threadId, latestTurnCompletedAt)),
  clearThreadUi: (threadId) => set((state) => clearThreadUi(state, threadId)),
  setThreadChangedFilesExpanded: (threadId, turnId, expanded) =>
    set((state) => setThreadChangedFilesExpanded(state, threadId, turnId, expanded)),
  setDefaultAdvertisedEndpointKey: (key) =>
    set((state) => setDefaultAdvertisedEndpointKey(state, key)),
  setWorkspaceShellSidebarOpen: (open) => set((state) => setWorkspaceShellSidebarOpen(state, open)),
  migrateWorkspaceThreadLayout: (sourceLayoutId, targetLayoutId) =>
    set((state) => migrateWorkspaceThreadLayout(state, sourceLayoutId, targetLayoutId)),
  setWorkspaceThreadPlanSidebarOpen: (threadId, open) =>
    set((state) => setWorkspaceThreadPlanSidebarOpen(state, threadId, open)),
  setWorkspaceThreadLastActivePane: (threadId, pane) =>
    set((state) => setWorkspaceThreadLastActivePane(state, threadId, pane)),
  setWorkspaceThreadPaneTitleOverride: (threadId, paneId, title) =>
    set((state) => setWorkspaceThreadPaneTitleOverride(state, threadId, paneId, title)),
  ensureWorkspaceThreadDockedPaneLayout: (threadId, input) =>
    set((state) => ensureWorkspaceThreadDockedPaneLayout(state, threadId, input)),
  setWorkspaceThreadDockedPanes: (threadId, panes, activePaneId) =>
    set((state) => setWorkspaceThreadDockedPanes(state, threadId, panes, activePaneId)),
  addWorkspaceThreadDockedPane: (threadId, input) =>
    set((state) => addWorkspaceThreadDockedPane(state, threadId, input)),
  setWorkspaceThreadAiPaneBinding: (threadId, paneId, input) =>
    set((state) => setWorkspaceThreadAiPaneBinding(state, threadId, paneId, input)),
  removeWorkspaceThreadDockedPane: (threadId, paneId) =>
    set((state) => removeWorkspaceThreadDockedPane(state, threadId, paneId)),
  restoreWorkspaceThreadDefaultDockedPane: (threadId, paneId) =>
    set((state) => restoreWorkspaceThreadDefaultDockedPane(state, threadId, paneId)),
  setWorkspaceThreadActiveDockedPane: (threadId, paneId) =>
    set((state) => setWorkspaceThreadActiveDockedPane(state, threadId, paneId)),
  toggleProject: (projectId) => set((state) => toggleProject(state, projectId)),
  setProjectExpanded: (projectId, expanded) =>
    set((state) => setProjectExpanded(state, projectId, expanded)),
  reorderProjects: (draggedProjectIds, targetProjectIds) =>
    set((state) => reorderProjects(state, draggedProjectIds, targetProjectIds)),
}));

useUiStateStore.subscribe((state) => debouncedPersistState.maybeExecute(state));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    debouncedPersistState.flush();
  });
}
