# 0002 Workspace Shell Reframe

Status: active
Type: product
Priority: high
Owner: local

## Summary

Reframe the upstream app from a conversation-first coding client into a
workspace-first development environment by changing presentation, composition,
navigation language, and pane structure before attempting deep backend rewrites.

## Why

The product direction explored in `dk-code` is centered on persistent
workspaces, multi-context development, and first-class pane composition. This
repository already has a more mature runtime/orchestration core, so the best
near-term leverage is to reuse that core and reshape the visible product rather
than rebuilding the logic stack from scratch.

## Desired Outcome

The app should feel like a workspace-oriented development environment where AI,
terminal, and future supporting surfaces are peer tools inside a broader shell,
not a fixed chat screen with accessory UI.

## Local Strategy

- preserve upstream server/runtime/provider logic
- reinterpret current presentation through a workspace-first shell
- convert the current chat surface into an AI pane
- convert the current terminal surface into a terminal pane
- reinterpret sidebar project navigation as workspace-oriented navigation where
  possible
- add local layout/orientation capabilities incrementally

## Upstream Touchpoints

- `docs/product/WORKSPACE_TERMINOLOGY.md`
- `docs/product/WORKSPACE_VISUAL_FRAMING.md`
- `docs/product/WORKSPACE_PRE_ALPHA_PLAN.md`
- `apps/web/src/components/`
- `apps/web/src/routes/`
- `apps/web/src/*sidebar*`
- `apps/web/src/*chat*`
- `apps/web/src/*terminal*`
- `apps/server/src/` only where small adapters become necessary

## Conflict Risk

High. This change intentionally targets user-facing navigation and core shell
composition, which are likely to continue evolving upstream.

## Validation

- a user can understand the visible product as a workspace-first environment
- AI and terminal surfaces can coexist as peer panes
- the app keeps its current operational runtime behavior while the UI model changes

## Commit References

- `working tree`: initial workspace shell, AI pane framing, and hosted-shell onboarding updates
- `21ed1770`: explicit AI pane extraction through a reusable workspace pane frame and shared chat action bar
- `adc6d1b3`: terminal pane extraction that renders terminal groups as peer workspace panes instead of a bottom drawer
- `ccd33a35`: upstream sync merge against `upstream/main` through `4f0f24f0`
- `f958e8de`: sidebar project rows reframed as workspace navigation with source, environment, and recoverable thread-history metadata
- `feature/ghi#6`: lightweight local workspace layout state for the shell rail,
  plan pane visibility, and terminal pane activity
- `c462f71c`: Monaco-based editor pane foundation with workspace-root-guarded file reads
- `feature/ghi#23`: workspace-bound editor file navigation with directory
  listing, active-file continuity, and git changed-file indicators
- `improvement/ghi#24`: editor-owned project, file, git, diff, and terminal
  controls so the AI pane remains focused on chat interaction
- `improvement/ghi#7`: pane chrome alignment, editor-owned checkout/branch
  controls, app-header ownership for global pane toggles, and changed-file
  actions that can target either diff review or the editor
- `afef1aaf`: upstream sync merge against `upstream/main` through `f0116e44`
- `improvement/ghi#36`: sidebar thread rows removed from primary workspace
  navigation, with existing-thread switching moved into the AI pane header

## Sync Notes

- keep this divergence UI-first as long as possible
- prefer wrappers, adapters, and new shell composition over deep edits in shared
  runtime logic
- the first concrete step is a terminology layer that changes visible framing
  without renaming upstream project and thread contracts
- the same planning layer should define how workspace scenes read before
  implementation details turn into component churn
- the first implemented shell pass lives in the web presentation layer and keeps
  thread, diff, and terminal behavior intact while reserving explicit pane space
- initial pane extraction should preserve current chat and terminal capabilities
  while changing shell framing and navigation expectations
- terminal groups now project into their own workspace panes so "new terminal"
  follows the pane model while split terminals stay grouped inside a single
  terminal pane
- sidebar project records remain the runtime-backed source of truth, but the
  visible rail now presents them as workspace entries and keeps thread history
  recoverable inside each workspace row
- lightweight local layout state now preserves the workspace rail state and
  per-thread pane visibility so collapsing navigation or moving between threads
  does not destructively reset the current shell arrangement
- the first editor pane now sits beside the AI pane and loads Monaco lazily after
  a workspace file is selected through a guarded project file-read adapter
- the editor pane now owns lightweight workspace file navigation through a
  project directory-listing adapter, keeping file browsing and changed-file
  awareness inside the editor surface instead of the AI pane
- file-oriented actions now live in the editor pane chrome, and the active
  editor tab exposes git line-change counts plus changed-line highlights when
  status data is available
- checkout and branch controls now live at the bottom of the editor pane so the
  AI pane stays focused on conversation and execution feedback
- terminal and diff visibility controls are now app-header actions because they
  affect global workspace panes rather than only the editor surface
- changed-file summaries in the AI pane now keep the user in flow by asking
  whether a file click should open the diff review surface or the editor pane
- keep pane chrome reusable so future terminal and support surfaces can adopt the
  same workspace framing without copying chat-specific structure
- keep chat actions extracted from pane framing so upstream chat behavior can
  evolve without re-entangling workspace shell ownership
- keep thread selection inside AI pane chrome so the sidebar can stay focused on
  workspace/source orientation while preserving the existing thread route model
- split future implementation into smaller patch files when the shell reframe
  turns into concrete workstreams such as sidebar mapping, pane extraction, or
  layout persistence
- Verified during the 2026-05-26 upstream sync against upstream commit
  `4f0f24f0`; upstream composer reasoning-selection updates touched shared chat
  state and UI but did not require local workspace-shell code changes.
- Verified during the 2026-06-01 upstream sync against upstream commit
  `b3e8c033`; upstream moved terminal runtime/session state and VCS status
  wiring into `@t3tools/client-runtime`, and the local workspace shell kept its
  pane model by rebasing `ChatView` and `ThreadTerminalDrawer` onto that split
  instead of restoring the deleted web-only stores.
- Verified during the 2026-06-03 upstream sync against upstream commit
  `f0116e44`; upstream added environment HTTP APIs and WebSocket authorization
  guards, and the local workspace file/VCS RPC contracts were extended to
  expose authorization failures while preserving the workspace shell adapters.
