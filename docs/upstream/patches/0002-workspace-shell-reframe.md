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
- `docs/product/WORKSPACE_SCROLLABLE_COLUMNS.md`
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
- `feature/ghi#34`: persisted docked pane layout state for AI, terminal, and
  editor panes, with startup sanitization and local UI-state reconciliation
- `9623a418b`: shared pane creation with directory selection and independent
  thread-scoped terminal panes bound to persisted cwd values
- `improvement/ghi#40`: pane-scoped terminal split and close behavior, with
  explicit "New Terminal Pane" actions
- `feature/ghi#41`: docked two-dimensional pane host with persisted tile
  coordinates, edge placement and center swapping, collision-pushing resize,
  two-axis workspace scrolling, and pane layouts scoped by environment, project,
  and workspace root instead of the active route thread
- `improvement/ghi#43`: commit-dialog changed-file selection wired into Git
  commit actions so selected-file commits can reuse the existing stacked-action
  `filePaths` path
- `improvement/ghi#44`: editor changed-file selection can restore selected
  working tree files through a narrow `vcs.restoreFiles` contract and Git
  status refresh path
- `documentation/ghi#63`: alpha layout direction narrowed from a general
  two-dimensional docked grid to a Niri-inspired workspace-owned scrollable
  column strip
- `feature/ghi#64`: workspace pane host replaced the two-dimensional docked
  grid behavior with an ordered horizontal column strip, role-based pane width
  presets, active-pane viewport alignment, and persisted strip scroll position

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
- persist the first docked pane model locally in web UI state so alpha pane
  add, close, rename, reorder, resize, and restore work can build on stable pane
  ids without introducing a server-side workspace domain yet
- keep terminal server sessions thread-scoped while assigning each terminal pane
  a unique terminal id, terminal group, environment, and cwd in local pane state
- keep pane layout and AI-pane selection workspace-scoped so route changes
  cannot mix AI or terminal panes between projects or worktrees
- keep terminal splits scoped to their owning pane group, preserve the pane when
  one split closes, and reserve "New Terminal Pane" for creating a separate
  docked terminal surface
- keep terminal lifecycle actions in shared pane chrome beside the pane title,
  and show only the terminal cwd basename until the full path is requested from
  its tooltip
- preserve the current editor and supporting-pane proportions as the default
  pane widths, then let the docked host overflow in both axes so additional or
  enlarged panes remain navigable instead of collapsing the workspace
- keep the default AI above the default terminal, size every added pane from
  the default terminal footprint, and hide the workspace scrollbars without
  disabling two-axis scrolling
- persist pane `x` and `y` tile coordinates so each horizontal band can use an
  independent partition, while edge drops remain docked and center drops swap
  positions
- resize panes from their right and bottom tile edges; when growth reaches
  another pane, move that pane along the resize axis rather than shrinking it
- the alpha layout direction now narrows the docked host into a scrollable
  horizontal column strip: pane order, role-based widths, focus-driven viewport
  alignment, and workspace-scoped restoration are retained, while arbitrary
  two-dimensional rows, collision-pushing coordinates, and full Niri parity are
  deferred
- the first scrollable-column host implementation keeps the existing pane state
  compatible while normalizing stale dock coordinates into one ordered strip,
  inserting new panes after the active pane, preserving terminal splits inside
  terminal panes, and persisting the active pane plus horizontal scroll offset
- keep selected-file commit choices in the commit dialog and pass selected paths
  into the existing stacked Git action API, leaving server commit-context
  generation and default-branch confirmation behavior unchanged
- keep selected-file rollback owned by the editor change list, require explicit
  confirmation before discard, and route the destructive operation through a
  VCS-specific RPC instead of broadening stacked commit actions
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
- Verified during the 2026-06-26 upstream sync against upstream commit
  `52b04b947`; upstream moved further into the connection/runtime shell model,
  so the local web workspace shell was kept as a coherent presentation layer and
  the `projects.listDirectory` editor adapter was reattached to the merged
  server authorization scope table and RPC handler map.
