# Workspace Terminology

Related docs:

- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Pre-Alpha Plan](./WORKSPACE_PRE_ALPHA_PLAN.md)

## Goal

Define the first visible vocabulary for the workspace-first shell without
changing the current backend concepts.

## Terminology Rules

### Workspace

`Workspace` is the top-level user-facing unit.

Use it for:

- sidebar entries that represent an active unit of work
- top-level headers, titles, and navigation copy
- descriptions of the app's primary mental model

Do not use `project` as the primary visible term when the UI is really pointing
at a broader working context that may include AI, terminal, and other panes.

### Project

`Project` remains an internal and technical term.

Use it for:

- backend/domain model names already tied to upstream contracts
- low-level implementation identifiers such as `projectId`
- sync, storage, or protocol discussions where the current upstream concept
  still matters

Avoid promoting `project` into prominent product copy unless the UI is exposing
the narrow upstream concept intentionally.

### Thread

`Thread` remains a valid secondary term, but not the app's primary framing.

Use it for:

- AI conversation history
- routing or persistence concepts already backed by thread identifiers
- implementation details, diagnostics, and developer-facing documentation

In visible product language, prefer describing a thread as something that exists
inside a workspace, usually through the AI pane.

### Pane

`Pane` is the user-facing term for a primary work surface.

Use it for:

- the AI pane
- the terminal pane
- future peer surfaces such as diff, plan, or environment views

Avoid calling these surfaces drawers, side tools, or accessory panels when they
are intended to read as equal parts of the workspace.

## Visible Label Mapping

| Current concept                | Visible framing   | Notes                                                                               |
| ------------------------------ | ----------------- | ----------------------------------------------------------------------------------- |
| project list / project sidebar | workspace sidebar | The left rail should read as switching active workspaces.                           |
| project entry                  | workspace         | The visible item can still resolve to the current project-backed state internally.  |
| chat view                      | AI pane           | Keep thread behavior, rename the visible surface.                                   |
| terminal drawer / toggle       | terminal pane     | Promote terminal to a peer surface, not an auxiliary tray.                          |
| thread                         | thread            | Keep available where users need precision, but subordinate it to workspace framing. |

## Copy Guidance

1. Prefer `workspace` over `project` in headlines, onboarding, empty states, and
   navigation labels.
2. Prefer `AI pane` and `terminal pane` when naming primary surfaces.
3. Reserve `thread` for cases where conversation identity or history matters.
4. Leave backend and protocol names unchanged until a later architecture pass
   proves a deeper rename is worth the churn.

## Acceptance Markers

This terminology pass is successful when:

1. A user can describe the app as a workspace environment.
2. The sidebar reads like workspace navigation instead of a project chooser.
3. AI and terminal read like peer panes instead of a primary surface plus
   attachments.
4. The codebase can keep current project/thread contracts without confusing the
   visible product language.
