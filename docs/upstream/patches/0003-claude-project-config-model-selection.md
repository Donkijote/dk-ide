# 0003 Claude Project Config Model Selection

Status: active
Type: provider
Priority: high
Owner: local

## Summary

Honor workspace-local Claude `.claude` settings when the default Claude
provider is used so project-config model selection does not collapse back to a
built-in Claude default or reuse stale Claude sessions after the project config
changes.

## Why

`dk-ide` is workspace-first, and Claude project settings are scoped to the
workspace. Treating Claude model selection as only a global provider snapshot
causes the UI to hide project-config models, and reusing persisted resume state
blindly can revive a session that was started under an older `.claude`
configuration.

## Desired Outcome

When a workspace has a `.claude/settings.json` or
`.claude/settings.local.json` model override, the app should expose that
workspace-configured Claude model as a first-class selectable option and avoid
stale SDK/model-session reuse when switching into or out of that mode.

## Local Strategy

- add a workspace-scoped Claude runtime-status RPC instead of mutating the
  global provider snapshot
- inspect `.claude/` settings in the server Claude provider layer and expose
  detected source/model metadata through runtime status
- map the resolved workspace Claude model to a local sentinel selection in the
  web model picker and composer draft resolution code
- omit explicit Claude SDK `--model` overrides when project config is selected
- drop persisted Claude resume cursors when the effective selection is the
  project-config sentinel so stale sessions are not reused

## Upstream Touchpoints

- `apps/server/src/provider/Layers/ClaudeProvider.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.ts`
- `apps/server/src/provider/Layers/ProviderService.ts`
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`
- `apps/server/src/textGeneration/ClaudeTextGeneration.ts`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/modelSelection.ts`
- `packages/contracts/src/server.ts`
- `packages/shared/src/model.ts`

## Conflict Risk

High. This touches active provider/runtime boundaries on both server and web,
especially Claude session management and composer model selection.

## Validation

- `bun run test src/provider/Layers/ProviderService.test.ts` in `apps/server`
- `bun run test src/modelSelection.test.ts` in `apps/web`
- `bun fmt`
- `bun lint`
- `bun typecheck`

## Commit References

- `923da00a`: Claude project-config runtime status, model selection, and stale
  resume protection

## Sync Notes

- preserve the runtime-status RPC as workspace-scoped; the global provider list
  should remain environment/provider metadata, not cwd-specific state
- if upstream lands equivalent Claude project-config handling, prefer deleting
  the local sentinel path and converging on the upstream contract instead of
  carrying two selection modes
- future Claude resume or session-import work must keep the "do not reuse stale
  resume cursor for project config" guard intact
- Verified during the 2026-06-01 upstream sync against upstream commit
  `b3e8c033`; upstream touched the Claude provider layer while the repo also
  tightened TSGo rules around ad-hoc JSON parsing, so the local
  project-config-model path was retained and the settings-file read was adapted
  to schema-based decoding instead of raw `JSON.parse`.
- Verified during the 2026-06-26 upstream sync against upstream commit
  `52b04b947`; the local workspace-scoped `server.getProviderRuntimeStatus`
  RPC remains necessary for Claude project-config model detection and was
  restored in the merged server RPC authorization and handler wiring.
