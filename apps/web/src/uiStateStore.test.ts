import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addWorkspaceThreadDockedPane,
  clearThreadUi,
  ensureWorkspaceThreadDockedPaneLayout,
  hydratePersistedProjectState,
  markThreadVisited,
  markThreadUnread,
  PERSISTED_STATE_KEY,
  type PersistedWorkspaceDockedPane,
  type PersistedUiState,
  persistState,
  reorderProjects,
  removeWorkspaceThreadDockedPane,
  restoreWorkspaceThreadDefaultDockedPane,
  sanitizeWorkspaceDockedPanes,
  setDefaultAdvertisedEndpointKey,
  setProjectExpanded,
  setThreadChangedFilesExpanded,
  setWorkspaceThreadActiveDockedPane,
  setWorkspaceThreadDockedPanes,
  setWorkspaceShellSidebarOpen,
  setWorkspaceThreadLastActivePane,
  setWorkspaceThreadPaneTitleOverride,
  setWorkspaceThreadPlanSidebarOpen,
  syncProjects,
  syncThreads,
  type UiState,
} from "./uiStateStore";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    threadLastVisitedAtById: {},
    threadChangedFilesExpandedById: {},
    defaultAdvertisedEndpointKey: null,
    workspaceShellSidebarOpen: true,
    workspaceThreadLayoutById: {},
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  it("markThreadVisited stores the provided server timestamp", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState();

    const next = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.700Z");

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:30:00.700Z");
  });

  it("markThreadVisited does not move visit state backwards under clock skew", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:30:00.700Z",
      },
    });

    const next = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.000Z");

    expect(next).toBe(initialState);
  });

  it("markThreadUnread moves lastVisitedAt before completion for a completed thread", () => {
    const threadId = ThreadId.make("thread-1");
    const latestTurnCompletedAt = "2026-02-25T12:30:00.000Z";
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, latestTurnCompletedAt);

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:29:59.999Z");
  });

  it("markThreadUnread does not change a thread without a completed turn", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, null);

    expect(next).toBe(initialState);
  });

  it("reorderProjects moves a project to a target index", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const project3 = ProjectId.make("project-3");
    const initialState = makeUiState({
      projectOrder: [project1, project2, project3],
    });

    const next = reorderProjects(initialState, [project1], [project3]);

    expect(next.projectOrder).toEqual([project2, project3, project1]);
  });

  it("reorderProjects is a no-op when dragged key is not in projectOrder", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const initialState = makeUiState({
      projectOrder: [project1, project2],
    });

    const next = reorderProjects(initialState, [ProjectId.make("missing")], [project2]);

    expect(next).toBe(initialState);
  });

  it("setDefaultAdvertisedEndpointKey stores endpoint preference by stable key", () => {
    const initialState = makeUiState();

    const next = setDefaultAdvertisedEndpointKey(initialState, "desktop-core:lan:http");

    expect(next.defaultAdvertisedEndpointKey).toBe("desktop-core:lan:http");
    expect(setDefaultAdvertisedEndpointKey(next, "desktop-core:lan:http")).toBe(next);
    expect(setDefaultAdvertisedEndpointKey(next, "")).toMatchObject({
      defaultAdvertisedEndpointKey: null,
    });
  });

  it("reorderProjects moves all member keys of a multi-member group together", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const initialState = makeUiState({
      projectOrder: [keyALocal, keyARemote, keyB, keyC],
    });

    const next = reorderProjects(initialState, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });

  it("reorderProjects handles member keys scattered across projectOrder", () => {
    const keyALocal = "env-local:proj-a";
    const keyB = "env-local:proj-b";
    const keyARemote = "env-remote:proj-a";
    const keyC = "env-local:proj-c";
    const initialState = makeUiState({
      projectOrder: [keyALocal, keyB, keyARemote, keyC],
    });

    const next = reorderProjects(initialState, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });

  it("reorderProjects places group after target when dragged from before a non-last target", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const keyD = "env-local:proj-d";
    const initialState = makeUiState({
      projectOrder: [keyALocal, keyARemote, keyB, keyC, keyD],
    });

    const next = reorderProjects(initialState, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote, keyD]);
  });

  it("reorderProjects places group before target when dragged from after", () => {
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const initialState = makeUiState({
      projectOrder: [keyB, keyC, keyALocal, keyARemote],
    });

    const next = reorderProjects(initialState, [keyALocal, keyARemote], [keyB]);

    expect(next.projectOrder).toEqual([keyALocal, keyARemote, keyB, keyC]);
  });

  it("reorderProjects with multi-member target inserts after first target occurrence", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyBLocal = "env-local:proj-b";
    const keyBRemote = "env-remote:proj-b";
    const initialState = makeUiState({
      projectOrder: [keyALocal, keyARemote, keyBLocal, keyBRemote],
    });

    const next = reorderProjects(initialState, [keyALocal, keyARemote], [keyBLocal, keyBRemote]);

    // Target members may become non-contiguous; this is fine because the
    // sidebar groups by logical key using first-occurrence positioning.
    expect(next.projectOrder).toEqual([keyBLocal, keyALocal, keyARemote, keyBRemote]);
  });

  it("reorderProjects is a no-op when dragged group equals target group", () => {
    const key1 = "env-local:proj-a";
    const key2 = "env-remote:proj-a";
    const initialState = makeUiState({
      projectOrder: [key1, key2, "env-local:proj-b"],
    });

    const next = reorderProjects(initialState, [key1, key2], [key1, key2]);

    expect(next).toBe(initialState);
  });

  it("reorderProjects is a no-op when dragged keys are not in projectOrder", () => {
    const initialState = makeUiState({
      projectOrder: ["env-local:proj-a", "env-local:proj-b"],
    });

    const next = reorderProjects(initialState, ["env-local:missing"], ["env-local:proj-b"]);

    expect(next).toBe(initialState);
  });

  it("syncProjects preserves current project order during snapshot recovery", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const project3 = ProjectId.make("project-3");
    const initialState = makeUiState({
      projectExpandedById: {
        [project1]: true,
        [project2]: false,
      },
      projectOrder: [project2, project1],
    });

    const next = syncProjects(initialState, [
      { key: project1, logicalKey: project1, cwd: "/tmp/project-1" },
      { key: project2, logicalKey: project2, cwd: "/tmp/project-2" },
      { key: project3, logicalKey: project3, cwd: "/tmp/project-3" },
    ]);

    expect(next.projectOrder).toEqual([project2, project1, project3]);
    expect(next.projectExpandedById[project2]).toBe(false);
  });

  it("syncProjects preserves manual order across project id churn at the same cwd", () => {
    // Under the current design, physical key and logical key are both
    // cwd-derived, so an internal project-id change doesn't alter the store
    // keys. This test locks in that stability: re-syncing the same cwds keeps
    // manual order and collapse state.
    const keyProject1 = "env-local:/tmp/project-1";
    const keyProject2 = "env-local:/tmp/project-2";
    const initialState = syncProjects(
      makeUiState({
        projectExpandedById: {
          [keyProject1]: true,
          [keyProject2]: false,
        },
        projectOrder: [keyProject2, keyProject1],
      }),
      [
        { key: keyProject1, logicalKey: keyProject1, cwd: "/tmp/project-1" },
        { key: keyProject2, logicalKey: keyProject2, cwd: "/tmp/project-2" },
      ],
    );

    const next = syncProjects(initialState, [
      { key: keyProject1, logicalKey: keyProject1, cwd: "/tmp/project-1" },
      { key: keyProject2, logicalKey: keyProject2, cwd: "/tmp/project-2" },
    ]);

    expect(next.projectOrder).toEqual([keyProject2, keyProject1]);
    expect(next.projectExpandedById[keyProject2]).toBe(false);
  });

  it("syncProjects returns a new state when only project cwd changes", () => {
    const project1 = ProjectId.make("project-1");
    const initialState = syncProjects(
      makeUiState({
        projectExpandedById: {
          [project1]: false,
        },
        projectOrder: [project1],
      }),
      [{ key: project1, logicalKey: project1, cwd: "/tmp/project-1" }],
    );

    const next = syncProjects(initialState, [
      { key: project1, logicalKey: project1, cwd: "/tmp/project-1-renamed" },
    ]);

    expect(next).not.toBe(initialState);
    expect(next.projectOrder).toEqual([project1]);
    expect(next.projectExpandedById[project1]).toBe(false);
  });

  it("syncProjects keys projectExpandedById by the logical key, not the physical key", () => {
    // In repository grouping mode, multiple physical projects (different
    // environments or different repo-relative paths) collapse into one
    // logical group. The group's expand state must be keyed by the logical
    // key so clicks on the grouped row toggle the shared state, and so the
    // state survives subsequent syncProjects calls (which rebuild the map
    // from incoming inputs).
    const physicalLocal = "env-local:/repo/project";
    const physicalRemote = "env-remote:/repo/project";
    const logicalKey = "repo-canonical-key";

    const initial = syncProjects(makeUiState(), [
      { key: physicalLocal, logicalKey, cwd: "/repo/project" },
      { key: physicalRemote, logicalKey, cwd: "/repo/project" },
    ]);

    expect(initial.projectExpandedById).toEqual({ [logicalKey]: true });

    const afterCollapse = { ...initial, projectExpandedById: { [logicalKey]: false } };
    const next = syncProjects(afterCollapse, [
      { key: physicalLocal, logicalKey, cwd: "/repo/project" },
      { key: physicalRemote, logicalKey, cwd: "/repo/project" },
    ]);

    expect(next.projectExpandedById[logicalKey]).toBe(false);
  });

  it("syncProjects preserves expand state when a project's logical key changes", () => {
    // Example: late-arriving repo metadata flips grouping identity from the
    // physical key to a canonical repository key. The row did not actually
    // change, so the user's collapse choice must carry over.
    const physicalKey = "env-local:/repo/project";
    const previousLogicalKey = physicalKey;
    const nextLogicalKey = "repo-canonical-key";

    const initial = syncProjects(makeUiState(), [
      { key: physicalKey, logicalKey: previousLogicalKey, cwd: "/repo/project" },
    ]);

    expect(initial.projectExpandedById[previousLogicalKey]).toBe(true);

    const afterCollapse = {
      ...initial,
      projectExpandedById: { [previousLogicalKey]: false },
    };
    const next = syncProjects(afterCollapse, [
      { key: physicalKey, logicalKey: nextLogicalKey, cwd: "/repo/project" },
    ]);

    expect(next.projectExpandedById[nextLogicalKey]).toBe(false);
  });

  it("syncThreads prunes missing thread UI state", () => {
    const thread1 = ThreadId.make("thread-1");
    const thread2 = ThreadId.make("thread-2");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [thread1]: "2026-02-25T12:35:00.000Z",
        [thread2]: "2026-02-25T12:36:00.000Z",
      },
      threadChangedFilesExpandedById: {
        [thread1]: {
          "turn-1": false,
        },
        [thread2]: {
          "turn-2": false,
        },
      },
    });

    const next = syncThreads(initialState, [{ key: thread1 }]);

    expect(next.threadLastVisitedAtById).toEqual({
      [thread1]: "2026-02-25T12:35:00.000Z",
    });
    expect(next.threadChangedFilesExpandedById).toEqual({
      [thread1]: {
        "turn-1": false,
      },
    });
  });

  it("syncThreads seeds visit state for unseen snapshot threads", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = makeUiState();

    const next = syncThreads(initialState, [
      {
        key: thread1,
        seedVisitedAt: "2026-02-25T12:35:00.000Z",
      },
    ]);

    expect(next.threadLastVisitedAtById).toEqual({
      [thread1]: "2026-02-25T12:35:00.000Z",
    });
  });

  it("setProjectExpanded updates expansion without touching order", () => {
    const project1 = ProjectId.make("project-1");
    const initialState = makeUiState({
      projectExpandedById: {
        [project1]: true,
      },
      projectOrder: [project1],
    });

    const next = setProjectExpanded(initialState, project1, false);

    expect(next.projectExpandedById[project1]).toBe(false);
    expect(next.projectOrder).toEqual([project1]);
  });

  it("clearThreadUi removes visit state for deleted threads", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [thread1]: "2026-02-25T12:35:00.000Z",
      },
      threadChangedFilesExpandedById: {
        [thread1]: {
          "turn-1": false,
        },
      },
    });

    const next = clearThreadUi(initialState, thread1);

    expect(next.threadLastVisitedAtById).toEqual({});
    expect(next.threadChangedFilesExpandedById).toEqual({});
  });

  it("syncThreads prunes stale workspace pane layout state", () => {
    const thread1 = ThreadId.make("thread-1");
    const thread2 = ThreadId.make("thread-2");
    const initialState = makeUiState({
      workspaceThreadLayoutById: {
        [thread1]: { planSidebarOpen: true, lastActivePane: "plan" },
        [thread2]: { planSidebarOpen: true, lastActivePane: "terminal" },
      },
    });

    const next = syncThreads(initialState, [{ key: thread1 }]);

    expect(next.workspaceThreadLayoutById).toEqual({
      [thread1]: { planSidebarOpen: true, lastActivePane: "plan" },
    });
  });

  it("clearThreadUi removes workspace pane layout state for deleted threads", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = makeUiState({
      workspaceThreadLayoutById: {
        [thread1]: { planSidebarOpen: true, lastActivePane: "plan" },
      },
    });

    const next = clearThreadUi(initialState, thread1);

    expect(next.workspaceThreadLayoutById).toEqual({});
  });

  it("stores workspace shell and per-thread pane layout state", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = makeUiState();

    state = setWorkspaceShellSidebarOpen(state, false);
    state = setWorkspaceThreadPlanSidebarOpen(state, thread1, true);
    state = setWorkspaceThreadLastActivePane(state, thread1, "terminal");
    state = setWorkspaceThreadPaneTitleOverride(state, thread1, "terminal:group-1", "Build logs");

    expect(state.workspaceShellSidebarOpen).toBe(false);
    expect(state.workspaceThreadLayoutById[thread1]).toEqual({
      activePaneId: "terminal",
      planSidebarOpen: true,
      lastActivePane: "terminal",
      paneTitleOverrideById: {
        "terminal:group-1": "Build logs",
      },
    });
    expect(setWorkspaceShellSidebarOpen(state, false)).toBe(state);
  });

  it("seeds the persisted docked pane model from the current workspace thread", () => {
    const thread1 = ThreadId.make("thread-1");
    const state = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "Implement alpha",
      editorTitle: "Repo Editor",
      terminalTitle: "Repo Terminal",
      editorActivePath: "apps/web/src/main.tsx",
      terminalId: "terminal-1",
      terminalGroupId: "group-terminal-1",
    });

    expect(state.workspaceThreadLayoutById[thread1]).toEqual({
      activePaneId: "ai",
      panes: [
        {
          paneId: "editor",
          type: "editor",
          title: "Repo Editor",
          environmentId: "env-1",
          cwd: "/repo",
          order: 0,
          size: 1,
          metadata: {
            activePath: "apps/web/src/main.tsx",
          },
        },
        {
          paneId: "ai",
          type: "ai",
          title: "Implement alpha",
          environmentId: "env-1",
          cwd: "/repo",
          order: 1,
          size: 1,
          metadata: {
            threadId: thread1,
          },
        },
        {
          paneId: "terminal",
          type: "terminal",
          title: "Repo Terminal",
          environmentId: "env-1",
          cwd: "/repo",
          order: 2,
          size: 1,
          metadata: {
            threadId: thread1,
            terminalId: "terminal-1",
            terminalGroupId: "group-terminal-1",
          },
        },
      ],
    });
  });

  it("preserves custom docked panes while refreshing runtime attachment context", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialPane: PersistedWorkspaceDockedPane = {
      paneId: "ai",
      type: "ai",
      title: "Custom AI",
      environmentId: "old-env",
      cwd: "/old",
      order: 4,
      size: 2,
      metadata: {
        threadId: "old-thread",
      },
    };
    const initialState = makeUiState({
      workspaceThreadLayoutById: {
        [thread1]: {
          activePaneId: "ai",
          panes: [initialPane],
        },
      },
    });

    const next = ensureWorkspaceThreadDockedPaneLayout(initialState, thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "Default AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });

    expect(
      next.workspaceThreadLayoutById[thread1]?.panes?.find((pane) => pane.paneId === "ai"),
    ).toMatchObject({
      paneId: "ai",
      title: "Custom AI",
      environmentId: "env-1",
      cwd: "/repo",
      order: 4,
      size: 2,
      metadata: {
        threadId: thread1,
      },
    });
    expect(next.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId)).toEqual([
      "editor",
      "terminal",
      "ai",
    ]);
  });

  it("tracks active docked pane independently from plan sidebar state", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });

    state = setWorkspaceThreadLastActivePane(state, thread1, "editor");
    expect(state.workspaceThreadLayoutById[thread1]?.activePaneId).toBe("editor");

    state = setWorkspaceThreadPlanSidebarOpen(state, thread1, true);
    expect(state.workspaceThreadLayoutById[thread1]).toMatchObject({
      activePaneId: "editor",
      lastActivePane: "plan",
      planSidebarOpen: true,
    });

    state = setWorkspaceThreadActiveDockedPane(state, thread1, "terminal");
    expect(state.workspaceThreadLayoutById[thread1]?.activePaneId).toBe("terminal");
  });

  it("adds a docked pane with selected environment and cwd context", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });

    const next = addWorkspaceThreadDockedPane(initialState, thread1, {
      paneId: "terminal:secondary",
      type: "terminal",
      title: "Tools Terminal",
      environmentId: "env-1",
      cwd: "/repo/tools",
      threadId: thread1,
      terminalId: "terminal-secondary",
      terminalGroupId: "group-terminal-secondary",
    });

    expect(next.workspaceThreadLayoutById[thread1]).toMatchObject({
      activePaneId: "terminal:secondary",
    });
    expect(next.workspaceThreadLayoutById[thread1]?.panes?.at(-1)).toEqual({
      paneId: "terminal:secondary",
      type: "terminal",
      title: "Tools Terminal",
      environmentId: "env-1",
      cwd: "/repo/tools",
      order: 3,
      size: 1,
      metadata: {
        threadId: thread1,
        terminalId: "terminal-secondary",
        terminalGroupId: "group-terminal-secondary",
      },
    });
  });

  it("preserves an existing terminal pane group when active terminal runtime context changes", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
      terminalId: "terminal-1",
      terminalGroupId: "group-terminal-1",
    });

    const next = ensureWorkspaceThreadDockedPaneLayout(initialState, thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
      terminalId: "terminal-2",
      terminalGroupId: "group-terminal-2",
    });

    expect(
      next.workspaceThreadLayoutById[thread1]?.panes?.find((pane) => pane.paneId === "terminal"),
    ).toMatchObject({
      metadata: {
        threadId: thread1,
        terminalId: "terminal-1",
        terminalGroupId: "group-terminal-1",
      },
    });
  });

  it("removes a custom terminal pane without removing the default terminal pane", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });
    state = addWorkspaceThreadDockedPane(state, thread1, {
      paneId: "terminal:secondary",
      type: "terminal",
      title: "Tools Terminal",
      environmentId: "env-1",
      cwd: "/repo/tools",
      threadId: thread1,
      terminalId: "terminal-secondary",
      terminalGroupId: "group-terminal-secondary",
    });

    const next = removeWorkspaceThreadDockedPane(state, thread1, "terminal:secondary");

    expect(next.workspaceThreadLayoutById[thread1]?.activePaneId).toBe("ai");
    expect(next.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId)).toEqual([
      "editor",
      "ai",
      "terminal",
    ]);
    expect(next.workspaceThreadLayoutById[thread1]?.removedDefaultPaneIds).toBeUndefined();
  });

  it("removes custom ai and editor panes without tombstoning default panes", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });
    state = addWorkspaceThreadDockedPane(state, thread1, {
      paneId: "ai:secondary",
      type: "ai",
      title: "Second AI",
      environmentId: "env-1",
      cwd: "/repo",
      threadId: thread1,
    });
    state = addWorkspaceThreadDockedPane(state, thread1, {
      paneId: "editor:docs",
      type: "editor",
      title: "Docs Editor",
      environmentId: "env-1",
      cwd: "/repo/docs",
      threadId: thread1,
    });

    const withoutAi = removeWorkspaceThreadDockedPane(state, thread1, "ai:secondary");
    const withoutEditor = removeWorkspaceThreadDockedPane(withoutAi, thread1, "editor:docs");

    expect(
      withoutEditor.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId),
    ).toEqual(["editor", "ai", "terminal"]);
    expect(withoutEditor.workspaceThreadLayoutById[thread1]?.removedDefaultPaneIds).toBeUndefined();
  });

  it("removes the default terminal pane until it is explicitly restored", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });

    const removed = removeWorkspaceThreadDockedPane(initialState, thread1, "terminal");
    const reseeded = ensureWorkspaceThreadDockedPaneLayout(removed, thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });
    const restored = restoreWorkspaceThreadDefaultDockedPane(reseeded, thread1, "terminal");
    const restoredAndReseeded = ensureWorkspaceThreadDockedPaneLayout(restored, thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });

    expect(reseeded.workspaceThreadLayoutById[thread1]?.removedDefaultPaneIds).toEqual([
      "terminal",
    ]);
    expect(reseeded.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId)).toEqual([
      "editor",
      "ai",
    ]);
    expect(
      restoredAndReseeded.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId),
    ).toEqual(["editor", "ai", "terminal"]);
    expect(
      restoredAndReseeded.workspaceThreadLayoutById[thread1]?.removedDefaultPaneIds,
    ).toBeUndefined();
  });

  it("places added panes in the terminal row and copies the default terminal size", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = setWorkspaceThreadDockedPanes(
      makeUiState(),
      thread1,
      [
        {
          paneId: "editor",
          type: "editor",
          title: "Editor",
          environmentId: "env-1",
          cwd: "/repo",
          order: 0,
          size: 1.75,
          metadata: {},
        },
        {
          paneId: "editor:notes",
          type: "editor",
          title: "Notes Editor",
          environmentId: "env-1",
          cwd: "/repo/notes",
          order: 0.5,
          size: 0.8,
          metadata: {},
        },
        {
          paneId: "ai",
          type: "ai",
          title: "AI",
          environmentId: "env-1",
          cwd: "/repo",
          order: 1,
          size: 1,
          metadata: {
            threadId: thread1,
          },
        },
        {
          paneId: "terminal",
          type: "terminal",
          title: "Terminal",
          environmentId: "env-1",
          cwd: "/repo",
          order: 2,
          size: 0.65,
          metadata: {
            threadId: thread1,
          },
        },
      ],
      "ai",
    );

    const next = addWorkspaceThreadDockedPane(initialState, thread1, {
      paneId: "editor:docs",
      type: "editor",
      title: "Docs Editor",
      environmentId: "env-1",
      cwd: "/repo/docs",
      threadId: thread1,
    });

    expect(next.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId)).toEqual([
      "editor",
      "editor:notes",
      "ai",
      "terminal",
      "editor:docs",
    ]);
    expect(next.workspaceThreadLayoutById[thread1]?.panes?.[4]).toMatchObject({
      paneId: "editor:docs",
      order: 3,
      size: 0.65,
    });
  });

  it("appends new terminal panes beside the existing terminal panes", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = ensureWorkspaceThreadDockedPaneLayout(makeUiState(), thread1, {
      threadId: thread1,
      environmentId: "env-1",
      cwd: "/repo",
      aiTitle: "AI",
      editorTitle: "Editor",
      terminalTitle: "Terminal",
    });
    state = addWorkspaceThreadDockedPane(state, thread1, {
      paneId: "terminal:first",
      type: "terminal",
      title: "First Terminal",
      environmentId: "env-1",
      cwd: "/repo",
      threadId: thread1,
    });
    state = addWorkspaceThreadDockedPane(state, thread1, {
      paneId: "terminal:second",
      type: "terminal",
      title: "Second Terminal",
      environmentId: "env-1",
      cwd: "/repo",
      threadId: thread1,
    });

    expect(state.workspaceThreadLayoutById[thread1]?.panes?.map((pane) => pane.paneId)).toEqual([
      "editor",
      "ai",
      "terminal",
      "terminal:first",
      "terminal:second",
    ]);
  });

  it("sanitizes invalid persisted docked panes without dropping valid panes", () => {
    expect(
      sanitizeWorkspaceDockedPanes([
        null,
        {
          paneId: "terminal",
          type: "terminal",
          title: " Terminal ",
          environmentId: " env-1 ",
          cwd: "",
          order: Number.NaN,
          size: -1,
          metadata: {
            threadId: "thread-1",
            terminalId: "term-1",
            terminalGroupId: "group-1",
          },
        },
        {
          paneId: "terminal",
          type: "terminal",
          title: "Duplicate",
          environmentId: "env-1",
          cwd: "/repo",
          order: 2,
          size: 1,
          metadata: {},
        },
        {
          paneId: "",
          type: "ai",
          title: "Invalid",
          environmentId: "env-1",
          cwd: "/repo",
          order: 1,
          size: 1,
          metadata: {},
        },
        {
          paneId: "editor",
          type: "editor",
          title: "Editor",
          environmentId: "env-1",
          cwd: "/repo",
          order: 0,
          size: 0.4,
          metadata: {
            activePath: "src/main.ts",
            openPaths: ["src/main.ts", "", "src/main.ts", "src/other.ts"],
          },
        },
      ]),
    ).toEqual([
      {
        paneId: "editor",
        type: "editor",
        title: "Editor",
        environmentId: "env-1",
        cwd: "/repo",
        order: 0,
        size: 0.4,
        metadata: {
          activePath: "src/main.ts",
          openPaths: ["src/main.ts", "src/other.ts"],
        },
      },
      {
        paneId: "terminal",
        type: "terminal",
        title: "Terminal",
        environmentId: "env-1",
        cwd: null,
        order: 1,
        size: 1,
        metadata: {
          threadId: "thread-1",
          terminalId: "term-1",
          terminalGroupId: "group-1",
        },
      },
    ]);
  });

  it("stores sanitized docked panes for follow-up add close reorder and resize work", () => {
    const thread1 = ThreadId.make("thread-1");
    const panes: PersistedWorkspaceDockedPane[] = [
      {
        paneId: "ai:secondary",
        type: "ai",
        title: "Second AI",
        environmentId: "env-1",
        cwd: "/repo",
        order: 3,
        size: 0.5,
        metadata: {
          threadId: "thread-2",
        },
      },
      {
        paneId: "editor",
        type: "editor",
        title: "Editor",
        environmentId: "env-1",
        cwd: "/repo",
        order: 1,
        size: 1.5,
        metadata: {
          openPaths: ["README.md"],
        },
      },
    ];

    const state = setWorkspaceThreadDockedPanes(makeUiState(), thread1, panes, "ai:secondary");

    expect(state.workspaceThreadLayoutById[thread1]).toEqual({
      activePaneId: "ai:secondary",
      panes: [
        {
          paneId: "editor",
          type: "editor",
          title: "Editor",
          environmentId: "env-1",
          cwd: "/repo",
          order: 1,
          size: 1.5,
          metadata: {
            activePath: null,
            openPaths: ["README.md"],
          },
        },
        {
          paneId: "ai:secondary",
          type: "ai",
          title: "Second AI",
          environmentId: "env-1",
          cwd: "/repo",
          order: 3,
          size: 0.5,
          metadata: {
            threadId: "thread-2",
          },
        },
      ],
    });
  });

  it("clears workspace pane title overrides when the title is empty", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = setWorkspaceThreadPaneTitleOverride(makeUiState(), thread1, "editor", "Source");

    state = setWorkspaceThreadPaneTitleOverride(state, thread1, "editor", " ");

    expect(state.workspaceThreadLayoutById).toEqual({});
  });

  it("setThreadChangedFilesExpanded stores collapsed turns per thread", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = makeUiState();

    const next = setThreadChangedFilesExpanded(initialState, thread1, "turn-1", false);

    expect(next.threadChangedFilesExpandedById).toEqual({
      [thread1]: {
        "turn-1": false,
      },
    });
  });

  it("setThreadChangedFilesExpanded removes thread overrides when expanded again", () => {
    const thread1 = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadChangedFilesExpandedById: {
        [thread1]: {
          "turn-1": false,
        },
      },
    });

    const next = setThreadChangedFilesExpanded(initialState, thread1, "turn-1", true);

    expect(next.threadChangedFilesExpandedById).toEqual({});
  });
});

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("uiStateStore persistence round-trip", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
    vi.stubGlobal("localStorage", localStorageStub);
    // Reset module-level persistence state so tests don't bleed into each other.
    hydratePersistedProjectState({ collapsedProjectCwds: [], expandedProjectCwds: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves all-collapsed project state across restart", () => {
    // Regression: pre-fix, persistState only wrote `expandedProjectCwds`, so
    // an empty array on rehydrate was indistinguishable from a fresh install
    // and the syncProjects fallback re-expanded every row.
    const projectA = { key: "kA", logicalKey: "kA", cwd: "/projA" };
    const projectB = { key: "kB", logicalKey: "kB", cwd: "/projB" };

    let state = syncProjects(makeUiState(), [projectA, projectB]);
    state = setProjectExpanded(state, projectA.key, false);
    state = setProjectExpanded(state, projectB.key, false);
    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    hydratePersistedProjectState(persisted);
    const rehydrated = syncProjects(makeUiState(), [projectA, projectB]);

    expect(rehydrated.projectExpandedById).toEqual({
      [projectA.key]: false,
      [projectB.key]: false,
    });
  });

  it("respects mixed expand state on rehydrate and defaults new projects to expanded", () => {
    const projectA = { key: "kA", logicalKey: "kA", cwd: "/projA" };
    const projectB = { key: "kB", logicalKey: "kB", cwd: "/projB" };
    const projectC = { key: "kC", logicalKey: "kC", cwd: "/projC" };

    let state = syncProjects(makeUiState(), [projectA, projectB]);
    state = setProjectExpanded(state, projectB.key, false);
    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    hydratePersistedProjectState(persisted);
    const rehydrated = syncProjects(makeUiState(), [projectA, projectB, projectC]);

    expect(rehydrated.projectExpandedById).toEqual({
      [projectA.key]: true,
      [projectB.key]: false,
      [projectC.key]: true,
    });
  });

  it("preserves legacy not-in-expanded-list = collapsed for one upgrade session", () => {
    // Pre-fix shape only stored expandedProjectCwds. Absence of
    // collapsedProjectCwds opts the session into the legacy fallback so
    // upgrade users do not see previously collapsed rows pop open.
    hydratePersistedProjectState({
      expandedProjectCwds: ["/projA"],
    });

    const rehydrated = syncProjects(makeUiState(), [
      { key: "kA", logicalKey: "kA", cwd: "/projA" },
      { key: "kB", logicalKey: "kB", cwd: "/projB" },
    ]);

    expect(rehydrated.projectExpandedById).toEqual({
      kA: true,
      kB: false,
    });
  });

  it("preserves manual project order across restart", () => {
    const projectA = { key: "kOrderA", logicalKey: "kOrderA", cwd: "/order-projA" };
    const projectB = { key: "kOrderB", logicalKey: "kOrderB", cwd: "/order-projB" };
    const projectC = { key: "kOrderC", logicalKey: "kOrderC", cwd: "/order-projC" };

    let state = syncProjects(makeUiState(), [projectA, projectB, projectC]);
    state = reorderProjects(state, [projectC.key], [projectA.key]);
    expect(state.projectOrder).toEqual([projectC.key, projectA.key, projectB.key]);
    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted.projectOrderCwds).toEqual([projectC.cwd, projectA.cwd, projectB.cwd]);

    hydratePersistedProjectState(persisted);
    // Fresh state (empty projectOrder) so syncProjects derives order from
    // persistedProjectOrderCwds rather than the in-memory projectOrder branch.
    const rehydrated = syncProjects(makeUiState(), [projectA, projectB, projectC]);

    expect(rehydrated.projectOrder).toEqual([projectC.key, projectA.key, projectB.key]);
  });

  it("persists the default advertised endpoint preference", () => {
    const state = setDefaultAdvertisedEndpointKey(makeUiState(), "desktop-core:lan:http");

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted.defaultAdvertisedEndpointKey).toBe("desktop-core:lan:http");
  });

  it("persists lightweight workspace layout state", () => {
    const thread1 = ThreadId.make("thread-1");
    let state = setWorkspaceShellSidebarOpen(makeUiState(), false);
    state = setWorkspaceThreadPlanSidebarOpen(state, thread1, true);
    state = setWorkspaceThreadLastActivePane(state, thread1, "plan");
    state = setWorkspaceThreadPaneTitleOverride(state, thread1, "editor", "Source");

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;

    expect(persisted.workspaceShellSidebarOpen).toBe(false);
    expect(persisted.workspaceThreadLayoutById).toEqual({
      [thread1]: {
        planSidebarOpen: true,
        lastActivePane: "plan",
        paneTitleOverrideById: { editor: "Source" },
      },
    });
  });

  it("preserves expand state across restart when project's logical key changes", () => {
    // After restart, in-memory previousExpandedById is empty, so the
    // previousLogicalKey-to-state bridge in syncProjects cannot help. The
    // persisted-cwd fallback is the only mechanism that can carry collapse
    // state across a restart that also flips a project into a new logical
    // group (e.g. late-arriving repo metadata). This locks in that path.
    const physicalKey = "env-local:/lk-restart-proj";
    const previousLogicalKey = physicalKey;
    const cwd = "/lk-restart-proj";

    let state = syncProjects(makeUiState(), [
      { key: physicalKey, logicalKey: previousLogicalKey, cwd },
    ]);
    state = setProjectExpanded(state, previousLogicalKey, false);
    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    hydratePersistedProjectState(persisted);

    const nextLogicalKey = "lk-restart-canonical";
    const rehydrated = syncProjects(makeUiState(), [
      { key: physicalKey, logicalKey: nextLogicalKey, cwd },
    ]);

    expect(rehydrated.projectExpandedById[nextLogicalKey]).toBe(false);
  });
});
