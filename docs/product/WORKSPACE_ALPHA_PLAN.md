# Workspace Alpha Plan

Related direction docs:

- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Pre-Alpha Plan](./WORKSPACE_PRE_ALPHA_PLAN.md)
- [Workspace Pre-Alpha Validation](./WORKSPACE_PRE_ALPHA_VALIDATION.md)

## Goal

Turn the completed workspace pre-alpha shell into a real docked workspace for
multi-pane development.

Alpha should make the app capable of running multiple named panes side by side:
AI panes attached to different threads, terminal panes attached to selected
directories, and editor panes focused on workspace file and Git operations.

The implementation remains presentation-first. It should preserve the current
provider, session, terminal, and orchestration runtime spine, and only add narrow
server or contract capabilities where the UI cannot safely express the workflow
with existing APIs.

## Product Shape

The alpha workspace is a docked pane environment, not a freeform spatial canvas.

Panes are the primary working surfaces:

- AI pane: conversation, model/thread control, approvals, and agent interaction.
- Terminal pane: one or more terminal sessions for a selected directory.
- Editor pane: file navigation, code reading, Git file selection, commit, and
  rollback actions.

The sidebar should focus on workspace and project navigation. Thread navigation
moves into AI panes so a workspace can show multiple active conversations at
once without making the sidebar the center of the product.

## Pane Model

Introduce a persisted docked pane model in UI state.

Each pane should have:

- `paneId`
- `type`: `ai`, `terminal`, or `editor`
- `title`
- `environmentId`
- `cwd`
- `order`
- `size`
- type-specific metadata

Pane titles are user-renamable. Defaults should be helpful before rename:

- AI panes default from the attached thread title.
- Terminal panes default from the attached thread title, terminal label, or cwd.
- Editor panes default from workspace or active file context.

Persisted layout should restore:

- open panes
- active pane
- pane order
- pane sizes
- pane cwd
- pane title
- type-specific attachment such as AI thread ref or terminal id

Invalid persisted panes should be sanitized instead of breaking app startup.

## Docked Pane Host

Replace the current fixed workspace grid with a docked pane host.

The docked host should support:

- add pane
- close pane
- rename pane
- reorder panes by drag and drop
- resize adjacent panes with proportional sibling updates
- restore persisted pane sessions

Use the existing frontend dependencies and local patterns:

- use `@dnd-kit` for drag reorder
- use pointer-resize behavior similar to existing sidebar and terminal resizing
- avoid adding another layout dependency unless implementation proves the local
  approach too fragile

Freeform canvas behavior from `dk-code` remains out of scope for alpha.

## AI Panes

Each AI pane owns one thread at a time.

The AI pane header should show:

- pane title
- current thread title
- thread selector
- rename action
- pane close action

The thread selector should allow:

- attach an existing thread from the pane's workspace/project context
- create a new thread for the pane
- switch the pane to a different thread without changing the entire workspace
  route model more than necessary

Multiple AI panes should be able to run side by side with separate threads.

## Pane Creation

Add a shared pane creation flow.

The flow should let the user choose:

- pane type: AI, terminal, or editor
- target directory

Directory selection starts with "Current workspace" as the default option.

Users should also be able to choose another directory on the computer. Reuse the
existing add-project browse/directory-selection machinery where practical, but
do not require the selected directory to become a sidebar workspace before it can
be used as a pane cwd.

## Terminal Panes

Terminal panes should be named and directory-scoped.

The terminal pane header should show:

- pane title
- cwd or compact directory label
- rename action
- new terminal pane action
- close action

Keep existing terminal tabs and splits as an internal terminal-pane feature:

- "Split Terminal" creates another terminal session inside the same terminal
  pane.
- "New Terminal Pane" creates a separate terminal pane, especially for another
  cwd.

For alpha, terminal panes can remain backed by the existing thread-scoped
terminal server model. The UI pane model should adapt to that instead of forcing
a terminal server rewrite.

## Editor Git Operations

The editor pane becomes the home for file-level Git work.

Add selected-file commit support:

- commit one selected file
- commit several selected files
- commit all changed files

Use the existing `git.runStackedAction` `filePaths` support where possible.

Add selected-file rollback support:

- rollback one selected file
- rollback several selected files
- rollback all selected changed files

Rollback must show a clear confirmation dialog before discarding changes.

Add a narrow `vcs.restoreFiles` style contract and server handler for
`cwd + filePaths`. No patch backup is required for alpha.

## Implementation Tracker

- [ ] Create alpha product plan.
- [ ] Introduce persisted docked pane layout.
- [ ] Add pane rename and title model.
- [ ] Move thread selection into the AI pane.
- [ ] Support multiple AI panes bound to separate threads.
- [ ] Add shared pane creation with workspace or directory target.
- [x] Support multiple terminal panes with selected cwd.
- [ ] Preserve terminal tabs and splits inside terminal panes.
- [ ] Add docked pane resize and drag reorder.
- [ ] Persist and restore workspace pane sessions.
- [ ] Commit selected editor files.
- [ ] Roll back selected editor file changes.
- [ ] Validate alpha workspace flows.

## Validation

The alpha is successful when:

1. A workspace can restore multiple named panes across reloads.
2. Two AI panes can reference different threads and work side by side.
3. A terminal pane can target the current workspace or another selected
   directory.
4. Existing terminal split behavior still works inside a terminal pane.
5. Pane rename, resize, reorder, add, close, and restore behavior is stable.
6. Editor Git actions support selected-file commit and selected-file rollback.
7. The sidebar reads as workspace/project navigation, not thread navigation.

## Required Checks

Before implementation PRs are considered complete, run:

- `bun fmt`
- `bun lint`
- `bun typecheck`

Do not run `bun test`; use `bun run test` only when targeted tests are needed.

## Deferred

- freeform spatial canvas behavior
- deeper backend workspace-domain rewrite
- terminal server ownership rewrite away from thread-scoped sessions
- patch-backup flow before file rollback
- global overview or workspace switcher
