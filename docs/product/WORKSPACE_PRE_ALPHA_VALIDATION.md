# Workspace Pre-Alpha Validation

Related planning:

- [Workspace Pre-Alpha Plan](./WORKSPACE_PRE_ALPHA_PLAN.md)
- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Visual Framing](./WORKSPACE_VISUAL_FRAMING.md)

GitHub issue:
[Workspace pre-alpha: validate current app state and close pre-alpha](https://github.com/Donkijote/dk-ide/issues/9)

## Checkpoint

Date: 2026-06-02

Branch: `internal/ghi#9`

Result: pre-alpha validation passes. No alpha-blocking regression was found in
the current web and desktop smoke checks.

The app now reads as a workspace-first coding environment in the primary shell:
workspace navigation is visible in the sidebar, editor, AI, and terminal are
framed as peer panes, and operational controls remain reachable under the new
presentation layer.

## Smoke Checks

Environment:

- clean app data directory via `T3CODE_HOME=/tmp/dk-ide-issue9-home.*`
- `T3CODE_AUTO_BOOTSTRAP_PROJECT_FROM_CWD=1`
- web/server dev stack at `http://localhost:5733`
- desktop smoke test through `bun run test:desktop-smoke`

Results:

| Area                          | Result | Notes                                                                                                                |
| ----------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Clean web launch and pairing  | Pass   | Pairing URL opened successfully and landed in the workspace shell.                                                   |
| Workspace shell framing       | Pass   | Header, pane grid, and sidebar present the active workspace before thread details dominate.                          |
| AI pane                       | Pass   | A minimal message started a thread, streamed status, completed, and returned to an idle composer.                    |
| Terminal pane                 | Pass   | Terminal opened as a peer pane and executed `pwd` in the active workspace path.                                      |
| Sidebar navigation            | Pass   | Sidebar labels the section as `Workspaces`, preserves thread recovery, and exposes new-thread actions per workspace. |
| Editor pane                   | Pass   | File tree opened `package.json` in the editor pane with line numbers and syntax highlighting.                        |
| File actions and git controls | Pass   | Editor header owns open/script/git actions; branch and PR controls remain visible with the editor surface.           |
| Diff visibility               | Pass   | Diff toggle opens the diff dialog and shows the expected empty state before completed turns exist.                   |
| Desktop launch                | Pass   | `bun run test:desktop-smoke` completed successfully.                                                                 |

## Validation Notes

- The clean launch auto-bootstrapped the active workspace as `server`, rooted at
  `apps/server`, which is enough to validate a normal project with file tree,
  editor, terminal, branch, and PR controls.
- The AI pane completed a minimal `OK` response in about five seconds, showing
  that message send, runtime status, streamed completion, and idle recovery
  still work under the workspace shell.
- The terminal pane remained usable while the editor and AI panes were visible,
  supporting the peer-pane framing goal.
- The diff panel is reachable even when the clean test thread has no completed
  turn diffs, and it communicates that state instead of failing silently.
- Local telemetry flush errors appeared during dev startup because no local OTLP
  collector was running. They did not block startup, pairing, AI, terminal,
  editor, or diff validation.

## Terminology Review

Primary workspace surfaces now use the intended vocabulary:

- sidebar section: `Workspaces`
- sidebar action: `Add workspace`
- per-workspace action: `Create new thread in workspace ...`
- primary panes: `Editor`, AI thread pane title, and `Terminal`

Acceptable remaining terminology:

- `thread` remains visible for conversation recovery and precise history
  actions.
- `checkout`, branch, PR, and git labels remain visible where they describe
  source-control state.

Alpha follow-up terminology:

- Command palette and settings still contain user-facing `project` labels such
  as `Projects`, `Add project`, and `Add project starts in`.
- Some lower-level errors still say `project` when they are describing the
  underlying backend model.

These leaks do not block alpha because the main workspace shell and primary
workflow now read as workspace-first. They should be cleaned up during the
alpha UX pass that revisits command palette and settings language.

## Deferred From Pre-Alpha

These items are intentionally not blocking alpha:

- first overview / workspace switcher / context map
- deeper backend workspace-domain refactors
- full spatial canvas behavior from `dk-code`
- advanced editor capabilities beyond lightweight file viewing, navigation,
  git awareness, and open actions
- broader command palette and settings terminology cleanup

## Alpha Readiness

The pre-alpha can be considered finished for the current presentation layer.

No alpha-blocking issue was found in this validation pass. The next alpha
workstream should focus on hardening the workspace shell under longer real-world
sessions, cleaning up remaining project terminology in secondary surfaces, and
deciding whether the deferred overview is needed after more product learning.

## Post-Checkpoint Note

This document is a historical validation checkpoint for closing pre-alpha. Later
workspace alpha implementation work, including pane persistence, multi-pane AI
and terminal behavior, selected-file Git actions, and the scrollable-column
layout direction, is tracked in
[Workspace Alpha Plan](./WORKSPACE_ALPHA_PLAN.md).
