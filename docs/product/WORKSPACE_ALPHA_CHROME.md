# Workspace Alpha Chrome

Related docs:

- [Workspace Reframe](./WORKSPACE_REFRAME.md)
- [Workspace Alpha Plan](./WORKSPACE_ALPHA_PLAN.md)
- [Workspace Scrollable Columns](./WORKSPACE_SCROLLABLE_COLUMNS.md)

## Goal

Add a compact orientation layer around the alpha workspace pane strip so users
can understand the active workspace, focused pane, pane position, and immediate
runtime status without turning the app into a desktop shell clone.

The chrome should support the Niri-inspired scrollable column model while
remaining product-specific to `dk-ide`.

## Alpha Chrome Shape

The alpha workspace uses two lightweight chrome levels:

- a top workspace header for workspace identity and primary workspace actions
- a compact pane-strip status row for focused-pane context and strip navigation

The status row belongs to the workspace strip, not to an individual pane. It
should remain visible while users scroll horizontally through panes.

## Status Row Contents

Alpha status row items:

- previous and next focused-pane controls
- active pane position within the strip
- active pane type and title
- workspace and active thread context on wider viewports
- active pane cwd when available
- git branch or detached state
- changed-file signal when git status is available

These items are intentionally compact. Long labels should truncate rather than
forcing the pane strip to resize.

## Interaction Contract

Pane navigation controls use the same focused-pane state as keyboard focus
navigation. Changing the focused pane should let the existing scroll behavior
bring the pane into view instead of introducing a separate overview mode.

The active pane remains visually strongest inside the pane host. The status row
adds orientation; it does not replace pane header controls, pane titles, or the
active pane frame.

## Deferred

- global workspace overview
- full workspace switcher or context map
- OS-level status items such as battery, clock, network, or desktop launcher
- always-visible docks, window-manager bars, or freeform overview parity
- deeper backend workspace-domain status aggregation

Follow-up implementation should only add more status items when they directly
improve multi-pane work orientation.
