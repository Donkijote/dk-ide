# Workspace Scrollable Columns

Related docs:

- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Visual Framing](./WORKSPACE_VISUAL_FRAMING.md)
- [Workspace Alpha Plan](./WORKSPACE_ALPHA_PLAN.md)

## Goal

Define the alpha layout direction as a Niri-inspired scrollable column model:
each workspace owns a horizontal strip of panes, the viewport follows the active
working area, and new panes add room to the strip instead of forcing every
existing pane to shrink into the visible window.

This is a product and implementation constraint for alpha. It should replace
the earlier drift toward a free-resize, two-dimensional pane layout.

## Product Principle

The workspace is a persistent task surface, not a disposable arrangement of
floating windows.

Panes should feel tiled, ordered, and recoverable:

- the user works inside one workspace at a time
- the workspace contains an ordered horizontal strip of top-level panes
- the viewport shows a focused slice of that strip
- adding a pane extends the workspace when needed
- existing panes keep their useful width instead of being squeezed below their
  intended role
- each workspace remembers its own pane strip, focus, scroll position, and pane
  attachments

Niri is only the visual and interaction inspiration. `dk-ide` should not try to
be a desktop window manager, implement global overview parity, or expose every
Niri layout option during alpha.

## Layout Model

Use one top-level layout axis for alpha.

The workspace layout is:

1. a workspace-scoped pane strip
2. an ordered list of top-level columns
3. a horizontal viewport over that list
4. an active pane that drives focus and viewport alignment

Top-level pane state should remain local UI layout state until a later backend
workspace domain proves necessary.

Each top-level column should have:

- `paneId`
- `type`: `ai`, `terminal`, or `editor`
- `title`
- `environmentId`
- `cwd`
- `order`
- `widthPreset`
- optional persisted `width`
- type-specific attachment metadata

The layout should persist by physical workspace context: environment, project,
and active workspace root or worktree. Switching AI threads inside a workspace
must not replace the workspace's strip. Switching workspaces must not reuse
another workspace's strip.

## Column Widths

Alpha should prefer role-based width presets over arbitrary geometry.

Use these presets as the product contract:

| Preset   | Intended use                                                    | Behavior                                                        |
| -------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `narrow` | logs, compact utility views, focused file lists                 | keeps supporting context visible without claiming the main task |
| `medium` | terminal panes and secondary AI panes                           | comfortable for command output and lightweight conversation     |
| `large`  | primary AI and editor panes                                     | default width for deep reading and active work                  |
| `wide`   | documentation, browser/reference, large diff or review surfaces | can fill most of the viewport but still lives in the strip      |

The exact pixel values can adapt to viewport size, but they should be stable
enough that adding, closing, or focusing a pane does not make unrelated panes
jump unpredictably.

Manual resizing should adjust the active pane's width within preset bounds or
promote it to a custom width. It should not create freeform x/y coordinates.

## Pane Insertion

New panes should enter the strip predictably.

Default insertion rules:

- add a pane to the right of the active pane
- keep the new pane focused
- scroll the viewport just enough to reveal the new pane and its immediate
  neighbor when possible
- preserve existing pane widths
- append at the end only when there is no active pane in the current workspace

Type-specific defaults:

- a new AI pane uses the `large` preset unless opened as a secondary reference,
  where `medium` is acceptable
- a new terminal pane uses the `medium` preset
- a new editor pane uses the `large` preset
- future documentation or browser panes may use `wide`
- utility or log panes may use `narrow`

Closing a pane should focus the nearest surviving neighbor, preferring the pane
to the left when both sides exist. Closing a pane should not renumber persisted
identities; only order changes.

## Focus And Viewport Behavior

Focus is both visual state and navigation state.

The focused pane should:

- receive the strongest active chrome treatment
- be the target for keyboard-first pane actions
- drive viewport alignment when focus changes through keyboard navigation,
  pane creation, thread selection, or restored state

Viewport alignment should be restrained:

- if the focused pane is fully visible, do not scroll
- if it is partially hidden, scroll the minimum amount needed to reveal it
- if it is wider than the viewport, align its leading edge
- when restoring a workspace, prefer the previous scroll offset unless it would
  hide the active pane

The UI should show orientation cues without adding a full overview in alpha:

- visible active-pane chrome
- subtle left/right overflow affordances when more columns exist off-screen
- stable pane titles and role icons
- optional compact strip position indicators if implementation needs them

## Internal Splits And Tabs

Only top-level work surfaces become workspace columns.

Internal pane structure stays inside the owning pane:

- terminal tabs and splits remain inside a terminal pane
- editor tabs remain inside an editor pane
- AI thread controls remain inside an AI pane
- future diff, plan, or browser subviews can be internal until they need their
  own top-level surface

This keeps the alpha layout constrained. A terminal split should not create a
new workspace column. "New Terminal Pane" creates a new top-level column.

## Workspace Defaults

Alpha startup defaults should favor a useful first task surface without hiding
the multi-pane model.

Recommended default strip:

1. editor pane, `large`
2. AI pane, `large`
3. terminal pane, `medium`

If the current implementation still opens with a different historical order,
implementation can transition incrementally. The direction is that each
workspace owns a durable strip whose first visible slice makes editor, AI, and
terminal feel like peer tools.

Empty or invalid persisted layouts should sanitize to a valid default strip
instead of breaking startup.

## Replacing The Older Docked Layout Direction

The alpha layout should no longer pursue a general two-dimensional docked grid.

Keep:

- pane add, close, rename, reorder, resize, and restore
- workspace-scoped persistence
- stable pane IDs and type-specific attachments
- local UI state as the near-term persistence layer
- terminal splits inside terminal panes

Change:

- from two-dimensional coordinates to one ordered strip
- from collision-pushing tile resize to role-based widths and strip overflow
- from rows/bands to internal pane composition
- from arbitrary placement to predictable insertion beside the active pane

Defer:

- global overview
- multi-monitor or multi-workspace overview parity
- arbitrary floating windows
- full Niri configuration parity
- server-side workspace layout ownership
- cross-workspace drag and drop

## Acceptance Markers

The scrollable column direction is ready for alpha implementation when:

1. Every top-level pane belongs to exactly one workspace strip.
2. Adding a pane does not squeeze unrelated panes below their useful role width.
3. Focus changes keep the active pane visible without disorienting scroll jumps.
4. Terminal splits and tabs remain internal to terminal panes.
5. Each workspace restores its own pane order, active pane, widths, and scroll
   position.
6. Implementation issues can reference this document for insertion, focus,
   width, and persistence behavior instead of reopening the layout model.
