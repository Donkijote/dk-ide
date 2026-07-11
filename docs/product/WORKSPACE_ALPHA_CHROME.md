# Workspace Alpha Chrome

Related docs:

- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Alpha Plan](./WORKSPACE_ALPHA_PLAN.md)
- [Workspace Scrollable Columns](./WORKSPACE_SCROLLABLE_COLUMNS.md)

## Goal

Add a compact orientation control to the alpha workspace header so users can
understand and move through the focused pane position without turning the app
into a desktop shell clone or spending extra vertical space.

The chrome should support the Niri-inspired scrollable column model while
remaining product-specific to `dk-ide`.

## Alpha Chrome Shape

The alpha workspace uses the existing top app header as its chrome anchor.

Pane navigation sits inline next to the workspace name. The workspace should not
add a second header row just to repeat context that already exists in pane
headers, branch controls, the editor surface, or the terminal pane.

## Header Contents

Alpha header items:

- previous and next focused-pane controls
- active pane position within the strip
- active pane title as a compact pill

These items are intentionally compact. Long pane titles should truncate rather
than forcing the app header or pane strip to resize.

## Interaction Contract

Pane navigation controls use the same focused-pane state as keyboard focus
navigation. Changing the focused pane should let the existing scroll behavior
bring the pane into view instead of introducing a separate overview mode.

The active pane remains visually strongest inside the pane host. The header
control adds navigation and quick orientation; it does not replace pane header
controls, pane titles, or the active pane frame.

## Deferred

- global workspace overview
- full workspace switcher or context map
- OS-level status items such as battery, clock, network, or desktop launcher
- always-visible docks, window-manager bars, or freeform overview parity
- deeper backend workspace-domain status aggregation
- duplicated cwd, git, thread, or terminal status in a second workspace bar

Follow-up implementation should only add more status items when they directly
improve multi-pane work orientation.
