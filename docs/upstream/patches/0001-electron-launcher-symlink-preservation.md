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

- `f5fe8d00`: squashed mainline commit containing the launcher fix and patch
  registry documentation
- `9a6ae066`: first upstream sync merge against `upstream/main` after the patch
  was introduced

## Sync Notes

- Re-check this patch whenever upstream changes `electron-launcher.mjs`,
  app-bundle renaming behavior, or desktop startup packaging.
- If upstream adopts a different macOS launch strategy that avoids copying
  `Electron.app`, this patch may become obsolete.
- Verified during the first upstream sync on 2026-05-14 against upstream commit
  `ea20e800`; no additional code changes were required to keep the patch
  active.
- Verified during the 2026-06-26 upstream sync against upstream commit
  `52b04b947`; upstream's desktop runtime packaging continues to preserve the
  required app-bundle symlink behavior, so no additional launcher changes were
  required for this local patch.
- Verified during the 2026-07-19 upstream sync against upstream commit
  `53e3c98a5`; upstream changed desktop pooling, WSL bootstrapping, and
  launcher-adjacent desktop startup code, but the local Electron app bundle
  symlink-preservation behavior remains active.
