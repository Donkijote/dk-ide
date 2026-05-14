# Workspace Pre-Alpha Plan

Related direction doc:
[Workspace Reframe](./WORKSPACE_REFRAME.md)

Terminology spec:
[Workspace Terminology](./WORKSPACE_TERMINOLOGY.md)

Visual framing spec:
[Workspace Visual Framing](./WORKSPACE_VISUAL_FRAMING.md)

## Goal

Deliver the first UI-first workspace refactor on top of the existing app
without rewriting the server/runtime core.

This is a pseudo pre-alpha for the new product direction in this repository. It
should prove that the current coding-agent app can be reframed into a
workspace-first environment by changing presentation, composition, and local UI
interaction before attempting deeper domain changes.

## Core Principle

Preserve the upstream logic spine. Refactor the visible product first.

## Non-Goals

- no rewrite of provider orchestration
- no replacement of the current thread/session backend contracts
- no immediate import of the full `dk-code` spatial engine
- no attempt to make every existing surface pane-capable in the first pass

## Implementation Tracker

- [x] Define the initial workspace terminology and visible naming changes
- [ ] Introduce a workspace shell documentable in the app UI
- [ ] Reframe sidebar project entries as workspace-oriented navigation
- [ ] Extract the current chat surface into an explicit AI pane container
- [ ] Extract the current terminal surface into an explicit terminal pane
- [ ] Decide the first non-chat, non-terminal supporting pane candidates
- [ ] Add a pane host layout that can place at least two visible pane types at once
- [ ] Keep existing thread and terminal functionality working inside the new shell
- [ ] Add lightweight local layout state for the first pane arrangement
- [ ] Add a workspace header/toolbar that reflects environment, resources, and active context
- [ ] Introduce a first overview or workspace switcher model that preserves orientation
- [ ] Validate the workspace shell against the current app flows
- [ ] Document what still depends on upstream project/thread framing

## Phase 0: Language And Framing

Goal:

Change the visible product framing before changing behavior.

Work:

- define how "workspace", "project", "thread", and "pane" should appear in the
  UI
- define how the first workspace scenes should read visually
- define which current chat and terminal capabilities must survive pane
  extraction unchanged in the first pass
- decide where current upstream terminology remains acceptable and where it
  should be wrapped or renamed
- keep backend concepts unchanged while the visible language shifts

Output:

- [Workspace Terminology](./WORKSPACE_TERMINOLOGY.md)
- [Workspace Visual Framing](./WORKSPACE_VISUAL_FRAMING.md)

Acceptance:

- a user can describe the app as a workspace-oriented environment, not only as a
  project/chat client

## Phase 1: Workspace Shell

Goal:

Introduce a top-level shell that makes room for multiple equal work surfaces.

Work:

- create a new workspace-oriented page shell
- keep the current app logic intact under that shell
- reserve explicit areas for pane composition rather than one dominant chat
  surface plus accessory drawers
- keep the current left rail as a temporary workspace/thread navigation surface
- allow that rail to collapse fully when the user wants more space for panes

Acceptance:

- the visible structure no longer feels like "chat page with extras"

## Phase 2: Pane Extraction

Goal:

Turn existing real surfaces into first-class panes.

Work:

- wrap the current chat view as the first AI pane
- wrap the current terminal as a terminal pane instead of a bottom toggle area
- preserve the current chat view capabilities while it is reframed as an AI pane
- preserve current terminal actions while allowing new terminals to become new
  panes in the short term
- decide whether diff, plan, or environment surfaces should become secondary
  panes in this milestone or remain embedded support views
- defer grouped terminal behavior until the basic pane model is coherent

Acceptance:

- AI and terminal can coexist as peer surfaces in the same shell

## Phase 3: Workspace Navigation

Goal:

Reframe left-rail navigation around workspaces.

Work:

- convert or reinterpret current project sidebar items as workspace entries
- preserve access to the underlying project/thread relationships without letting
  them dominate the whole navigation model
- identify what extra workspace metadata should be visible, such as branch,
  provider state, terminal state, or attached resources
- preserve a recoverable thread list for each workspace so threads can be
  reopened or reused later
- leave room for both thread replacement and multi-AI-pane workflows until the
  interaction model is finalized

Acceptance:

- the left rail reads as a workspace switcher more than a project list

## Phase 4: Local Layout State

Goal:

Remember enough arrangement state to make the pane model believable.

Work:

- introduce lightweight local layout state for the first shell
- do not block on a full persistent spatial system
- focus on preserving orientation and continuity
- preserve enough state that collapsing the rail or switching visible panes does
  not feel like losing the current workspace context

Acceptance:

- opening and using the new shell does not feel destructively reset on every
  interaction

## Phase 5: Resources And Context

Goal:

Move toward the `dk-code` idea that a workspace is a container for related
resources and tools.

Work:

- define the first workspace-level context block
- surface attached repo/environment/resource information in the new shell
- avoid deep backend changes unless a small adapter layer is enough

Acceptance:

- the workspace visibly contains context beyond a single thread

## Phase 6: Orientation And Overview

Goal:

Preserve multi-context orientation as the shell becomes less linear.

Work:

- add a first overview, switcher, or context map that helps users understand
  where they are
- keep it simpler than the full `dk-code` overview if necessary
- optimize for confidence and legibility over novelty

Acceptance:

- users can move between work contexts without the UI feeling like a pile of panes

## First Concrete UI Mapping

The current intended mapping is:

- current projects sidebar -> workspace sidebar
- current chat view -> AI pane
- current terminal drawer/toggle -> terminal pane
- current secondary operational surfaces -> future candidate panes or workspace
  support panels

This mapping should guide the first implementation wave unless product learning
shows a better interpretation.

## Validation Questions

The pre-alpha is successful if it answers these questions positively:

1. Does the product now read as a workspace environment instead of a fixed chat layout?
2. Can AI and terminal coexist without one feeling subordinate?
3. Does the sidebar support multi-context work more clearly than before?
4. Does the shell create space for future pane types without requiring backend rewrites now?
5. Does the change preserve the existing operational strengths of the current app?

## Follow-On Work

After this pre-alpha proves itself, follow-on work can evaluate:

- richer pane placement and resizing
- deeper layout persistence
- resource binding flows
- plan/diff/resource panes as equal surfaces
- whether a real server-side workspace domain is worth introducing
