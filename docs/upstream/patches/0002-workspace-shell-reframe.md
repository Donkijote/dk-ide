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
- keep pane chrome reusable so future terminal and support surfaces can adopt the
  same workspace framing without copying chat-specific structure
- keep chat actions extracted from pane framing so upstream chat behavior can
  evolve without re-entangling workspace shell ownership
- split future implementation into smaller patch files when the shell reframe
  turns into concrete workstreams such as sidebar mapping, pane extraction, or
  layout persistence
- Verified during the 2026-05-26 upstream sync against upstream commit
  `4f0f24f0`; upstream composer reasoning-selection updates touched shared chat
  state and UI but did not require local workspace-shell code changes.
