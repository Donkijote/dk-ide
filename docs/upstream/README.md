# Upstream Sync Workflow

This repo intentionally diverges from the upstream T3 Code codebase. The goal is
to keep those divergences explicit, reviewable, and survivable when upstream
changes land.

## Principles

1. Keep an upstream mirror branch with no local product changes.
2. Keep local changes grouped into small, intentional patches.
3. Document every meaningful divergence in `docs/upstream/patches/`.
4. Prefer extension points, adapters, wrappers, config, and composition roots
   over deep edits to upstream-owned code.
5. Treat patch docs as the human index for why a divergence exists and how it
   should be handled during future upstream syncs.

## Recommended Branch Model

- `upstream-main`: mirror of the original upstream default branch
- `main`: this product branch
- `sync/<date-or-upstream-tag>`: temporary branch used to integrate a new
  upstream drop

## Patch Registry

- Index: [patches/README.md](/Users/manuel/Developer/personal/dk-ide/docs/upstream/patches/README.md)
- Template: [patch-template.md](/Users/manuel/Developer/personal/dk-ide/docs/upstream/patch-template.md)

Each patch file should describe:

- what changed
- why it changed
- which upstream files are touched
- how risky future upstream syncs are
- which commits implemented the patch
- whether the patch is still active, superseded, upstreamed, or removable

## Sync Procedure

1. Fetch the latest upstream changes into `upstream-main`.
2. Create a new sync branch from local `main`.
3. Merge or rebase the latest `upstream-main` into that sync branch.
4. Review patch docs whose upstream touchpoints were modified.
5. Re-apply or adapt only the affected local patches.
6. Run validation.
7. Update patch docs with new notes and commit references.
8. Merge the sync branch back into `main`.

When merging a sync branch back into `main`, use a real merge commit. Do not
squash-merge or rebase-merge upstream sync PRs, because GitHub fork sync status
tracks commit ancestry and will keep reporting upstream commits as missing even
when their file changes are already present.

## Patch Authoring Rules

1. One divergence theme per patch file.
2. Keep commit history aligned with patch boundaries as much as possible.
3. Add a patch file when behavior, architecture, branding, packaging, or
   workflow meaningfully diverges from upstream.
4. Update an existing patch file instead of creating a duplicate when the same
   divergence evolves over time.
5. Prefer recording "implemented in working tree" over inventing a fake commit
   hash before the change is committed.

## Git Recommendations

- Enable `git rerere` locally to reuse conflict resolutions across repeated
  upstream syncs.
- Keep local changes small and patch-scoped.
- Avoid mixing unrelated refactors in the same commit series.

## Status Vocabulary

- `active`: patch is currently required
- `proposed`: design is approved but implementation is incomplete
- `superseded`: replaced by a newer patch or architecture
- `upstreamed`: no longer a local divergence
- `retired`: intentionally removed
