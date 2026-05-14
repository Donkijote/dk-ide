# Workspace Visual Framing

Related docs:

- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Pre-Alpha Plan](./WORKSPACE_PRE_ALPHA_PLAN.md)
- [Workspace Terminology](./WORKSPACE_TERMINOLOGY.md)

## Goal

Define how the first workspace scenes should read visually before deeper layout
or interaction changes land.

## Framing Principle

The product should read as a composed development environment, not as a chat
screen with attached tools.

Visible framing should make the user feel that:

- they are inside a workspace
- AI is one tool in that workspace
- terminal and future panes are peers, not accessories
- the shell is stable enough to orient around, even before a richer spatial
  model exists

## What A Scene Is

For this phase, a `scene` is a visible arrangement of the workspace shell and
its active panes.

Examples:

- a workspace with AI and terminal side by side
- a workspace with AI primary and a diff pane visible
- a workspace overview state that emphasizes orientation and context

The key point is that scenes describe user-facing composition, not backend
domain types.

## Current Surface Preservation

This phase is primarily an extraction and framing pass, not a feature reset.

The default rule is:

- preserve the current surface capabilities
- move those capabilities into pane framing
- defer deeper behavior redesign to later issues unless a shell constraint makes
  it unavoidable

### AI Pane In This Phase

The first AI pane should be the current chat view, extracted into a pane with
its existing behavior intact.

That includes the capabilities already attached to the chat surface, such as:

- open actions
- git actions
- the diff panel and related review interactions
- the existing thread-centric interactions already available in the chat view

The intended change is structural and visual:

- the chat surface stops being the whole app
- it becomes one pane inside the workspace
- its current capabilities stay available while the shell is being reframed

### Terminal Pane In This Phase

The first terminal pane should preserve the current terminal capabilities while
changing the way they are framed in the shell.

That includes:

- creating a terminal
- deleting a terminal
- opening additional terminals
- keeping the existing terminal interactions usable during the extraction

For now, opening a new terminal should create another terminal pane rather than
reinforcing a bottom-drawer mental model.

The current split-terminal behavior should not define the long-term framing.
Grouped terminal behavior can be addressed in a later phase once pane
composition is stable.

## Workspace Hierarchy And Thread Continuity

In the first workspace shell, a workspace should behave like the visible
container for:

- panes
- threads
- the relationships between those panes and threads

The current project-backed model can remain internal, but the visible product
should read as if the workspace owns these resources.

### Thread Reuse Expectations

Each workspace should preserve access to its thread list even when a thread is
not currently visible as the active AI pane.

The product should support reusing threads later rather than treating each view
as disposable.

This creates an intentional design question for follow-up implementation:

- should selecting a thread replace the current AI pane
- should selecting a thread open another AI pane
- or should the shell support both behaviors depending on context

This issue does not need to finalize that interaction model, but the shell and
navigation design should leave room for it.

## Interim Left Rail Behavior

The current left sidebar can remain the temporary home for workspace and thread
navigation while the broader layout is being redesigned.

In this phase, it should:

- continue to expose the current workspace and thread lists
- continue to host temporary utilities such as search and settings
- be fully closable so it can disappear off the left edge when the user wants
  more room for pane work

This is an interim behavior, not the final information architecture. The goal
is to recover working space immediately without losing the ability to revisit
threads and workspaces.

## Visual Hierarchy Rules

### 1. Workspace First

The shell should visually establish the workspace before any single pane takes
over.

Expected effect:

- the header, rail, and pane frame make the workspace legible immediately
- the first impression is "where am I working?"
- the first impression is not "which chat is open?"

### 2. Peer Pane Composition

AI, terminal, and future supporting panes should feel structurally related.

Expected effect:

- panes share a common frame language
- no pane looks like a modal afterthought
- the terminal does not feel demoted into a utility strip

### 3. Orientation Over Feed Immersion

The shell should preserve context around the user while they work.

Expected effect:

- navigation, pane titles, and context chrome stay readable
- long message histories do not visually erase the rest of the workspace
- supporting context stays available without requiring constant mode switches

### 4. Calm Density

The product should feel information-rich without reading as cluttered.

Expected effect:

- clear grouping and pane boundaries
- restrained emphasis changes instead of constant visual competition
- enough ambient structure to support multi-tool work without noise

## Scene Expectations

### Workspace Entry Scene

When a workspace opens, the UI should establish:

- workspace identity
- active context
- available panes or tools
- what surface is currently primary
- where the user can recover workspace and thread navigation if the left rail is
  collapsed

### Active Work Scene

When the user is focused on a task, the UI should keep:

- the active pane obvious
- adjacent panes available
- navigation present but not dominant
- environment and resource context easy to recover
- access to the workspace's thread history without forcing the shell back into a
  chat-first layout

### Transition Scene

When the UI changes state, such as opening a pane or switching workspaces, the
transition should preserve orientation.

Expected effect:

- the user can tell what changed
- the user can tell what stayed anchored
- the shell feels rearranged, not replaced

## Do / Do Not

### Do

- frame the workspace shell before emphasizing message content
- make panes feel like deliberate surfaces with equal structural dignity
- preserve contextual anchors across navigation and pane changes
- use visual framing to support the workspace mental model even while backend
  concepts remain unchanged
- preserve current surface capabilities while changing the shell framing around
  them

### Do Not

- let the AI transcript visually consume the whole product identity
- make terminal or support surfaces read like temporary utilities
- rely on drawer-like framing for surfaces that should become panes
- introduce visual complexity that obscures orientation
- use the shell refactor as an excuse to silently drop current chat or terminal
  capabilities

## Acceptance Markers

This visual framing pass is successful when:

1. A screenshot of the app reads like a workspace environment before the user
   reads detailed content.
2. The shell stays legible while AI activity is active.
3. Terminal and future support panes can appear without feeling bolted on.
4. Scene changes preserve orientation instead of feeling like full-page mode
   swaps.
5. Existing chat and terminal capabilities remain reachable after those
   surfaces are extracted into panes.
