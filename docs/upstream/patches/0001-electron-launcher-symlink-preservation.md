# 0001 Electron Launcher Symlink Preservation

Status: active
Type: packaging
Priority: high
Owner: local

## Summary

The macOS desktop launcher now preserves Electron's original relative framework
symlinks when copying `Electron.app` into the local runtime bundle.

## Why

The previous copy behavior rewrote framework symlinks into absolute paths
pointing back into `node_modules/.bun/.../electron/dist/Electron.app`. That made
the copied app bundle non-self-contained and caused startup failures such as
`icudtl.dat not found in bundle` during `bun start:desktop`.

## Desired Outcome

The renamed local desktop runtime bundle should remain structurally equivalent
to the source Electron app bundle so desktop startup keeps working even after
the wrapper bundle is rebuilt.

## Local Strategy

Keep the existing macOS wrapper approach in
`apps/desktop/scripts/electron-launcher.mjs`, but copy the app bundle with
`verbatimSymlinks: true` and bump the launcher metadata version so stale runtime
bundles are rebuilt automatically.

## Upstream Touchpoints

- `apps/desktop/scripts/electron-launcher.mjs`

## Conflict Risk

Medium. This is a focused packaging change in a small script, but it touches the
same launcher logic upstream may continue refining for branding or macOS runtime
behavior.

## Validation

- `bun start:desktop`
- Confirm the desktop process reaches `app ready`, starts the backend, and
  creates the main window.
- Confirm framework symlinks inside `apps/desktop/.electron-runtime/*.app`
  remain relative after rebuild.

## Commit References

- `d3296054`: preserve macOS Electron launcher symlinks
- `694032c5`: add upstream patch workflow and register this patch

## Sync Notes

- Re-check this patch whenever upstream changes `electron-launcher.mjs`,
  app-bundle renaming behavior, or desktop startup packaging.
- If upstream adopts a different macOS launch strategy that avoids copying
  `Electron.app`, this patch may become obsolete.
