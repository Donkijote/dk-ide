# Workspace Reframe

This document defines how this repository should evolve from an upstream
conversation-first coding client into a workspace-first development environment
while still reusing the mature orchestration, provider, and session logic that
already exists here.

## Summary

The goal is not to reimplement `dk-code` inside this repository. The goal is to
reuse the strongest parts of this codebase, especially the provider/runtime
orchestration, and reshape the visible product so the primary unit of work
becomes the workspace rather than the thread, project, or chat session.

In practical terms:

- keep the server/runtime/provider spine
- keep the thread and terminal engines as real capabilities
- reinterpret the presentation layer through a workspace-first model
- introduce pane-based composition around the existing capabilities instead of
  centering the app around a fixed chat layout

## Product Direction

The intended product direction is the same underlying thesis explored in
`dk-code`:

- the durable unit is the workspace
- repositories are attached resources, not the whole app
- panes are first-class surfaces
- AI is native, but not the only center of gravity
- work should feel assembled, spatial, and resumable

This repository differs from `dk-code` in one important way: the backend and
interaction engine already exist. That means the first serious leverage here is
presentation, framing, composition, and local UI interaction, not rewriting the
provider/domain core.

## Reuse Strategy

### Keep From This Repo

- provider orchestration
- thread lifecycle
- terminal runtime integration
- diff and plan activity surfaces
- persistence and session infrastructure already tied to the current app model
- multi-provider support and Codex-first operational behavior

### Import Conceptually From `dk-code`

- workspace-first framing
- panes as the visible top-level unit
- resources attached to a workspace rather than implied by a single project tree
- overview/navigation that preserves orientation across multiple active contexts
- a stronger "desktop work environment" product identity

### Avoid For Now

- rewriting server-side orchestration around a brand new workspace domain
- replacing thread/session concepts at the backend layer
- building the full spatial engine from `dk-code` before the new shell proves
  itself

## Core Mapping

The first wave of change should reinterpret existing UI patterns instead of
inventing new backend concepts immediately.

### 1. Projects Sidebar -> Workspace Sidebar

The current project/sidebar structures should be reused and reframed so each
top-level item behaves more like a workspace entry than a narrow project record.

That does not require an immediate backend rewrite. In the early phase, a
workspace can be a UI-level composition around the existing project and thread
state model while the visible language and navigation model shift first.

Desired effect:

- the left rail stops reading like "pick a project to enter a chat"
- it starts reading like "switch between active workspaces"

### 2. Chat View -> AI Pane

The current chat view should become one pane type inside a broader workspace
surface.

This is the single most important reframing:

- the chat is still real and useful
- but it is no longer the whole app
- it becomes one first-class work surface among other panes

### 3. Bottom Terminal Toggle -> Terminal Pane

The current terminal should stop behaving like an auxiliary bottom drawer and
start behaving like a pane with equal structural dignity to the AI pane.

That makes the app feel less like a chat shell with attachments and more like a
workspace composed of tools.

### 4. Existing Secondary Surfaces -> Candidate Pane Types

The current app already contains surfaces that can become pane candidates over
time, for example:

- diff/review views
- plan/progress surfaces
- settings or environment/resource views

The first milestone does not need every one of these to become movable panes,
but the architecture and UI should move in that direction.

## Presentation Model

The initial refactor should treat the new workspace shell as a presentation and
"paint" layer over the existing logic.

That means:

- existing domain/runtime logic stays authoritative
- new UI composition adapts existing data into workspace-oriented view models
- the first implementation wave should favor wrappers and adapters over invasive
  backend rewrites

## Architectural Interpretation

### Near-Term

- preserve the existing server contracts
- preserve thread, terminal, provider, and environment behavior
- introduce a workspace shell in the web app
- convert major current surfaces into pane-capable presenters

### Mid-Term

- add local workspace layout state
- add workspace-level resources and bindings
- align persistence with the new shell
- gradually reduce the visual centrality of chat-first navigation

### Long-Term

- decide whether a deeper workspace domain should exist server-side
- only make that change after the workspace shell proves more valuable than the
  current project/thread framing

## Design Constraints

### Do

- reuse upstream UI surfaces where they can be adapted cleanly
- prefer composition, adapters, and renamed framing before data-model surgery
- make the app feel more like a developer environment and less like a single
  fixed chat screen

### Do Not

- rebuild `dk-code` wholesale inside this repository
- replace stable runtime logic only to satisfy a visual idea
- force spatial complexity before the pane model is coherent

## Success Criteria

The reframe is succeeding when:

1. The app no longer reads primarily as "chat with side tools".
2. The user can understand the active context as a workspace.
3. AI and terminal surfaces feel like peer tools, not primary and secondary
   layers.
4. The sidebar and navigation system support multi-context work instead of
   funneling everything through one conversation flow.
5. The backend remains stable while the UI model evolves.
