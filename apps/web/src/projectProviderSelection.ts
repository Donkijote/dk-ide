import {
  CLAUDE_PROJECT_CONFIG_MODEL,
  type ModelSelection,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import type { UnifiedSettings } from "@t3tools/contracts/settings";

import {
  getAppModelOptionConfigForInstanceEntry,
  resolveAppModelSelectionForInstance,
} from "./modelSelection";
import { deriveProviderInstanceEntries, type ProviderInstanceEntry } from "./providerInstances";

export interface ProjectProviderResolution {
  readonly configuredInstanceId: ProviderInstanceId | null;
  readonly effectiveEntry: ProviderInstanceEntry | null;
  readonly effectiveSelection: ModelSelection | null;
  readonly isFallback: boolean;
  readonly usesClaudeProjectConfig: boolean;
}

export function isSelectableProjectProviderEntry(entry: ProviderInstanceEntry): boolean {
  return entry.enabled && entry.isAvailable && entry.status === "ready";
}

function selectionForEntry(input: {
  readonly currentSelection: ModelSelection | null | undefined;
  readonly entry: ProviderInstanceEntry;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly settings: UnifiedSettings;
}): ModelSelection | null {
  const optionConfig = getAppModelOptionConfigForInstanceEntry(input.entry);
  const usesClaudeProjectConfig = optionConfig?.includeClaudeProjectConfig === true;
  const currentModel =
    input.currentSelection?.instanceId === input.entry.instanceId
      ? input.currentSelection.model
      : null;
  const requestedModel = usesClaudeProjectConfig ? CLAUDE_PROJECT_CONFIG_MODEL : currentModel;
  const model = resolveAppModelSelectionForInstance(
    input.entry.instanceId,
    input.settings,
    input.providers,
    requestedModel,
    optionConfig,
  );
  if (!model) {
    return null;
  }
  return {
    instanceId: input.entry.instanceId,
    model,
    ...(currentModel === model && input.currentSelection?.options
      ? { options: input.currentSelection.options }
      : {}),
  };
}

export function resolveProjectProviderSelection(input: {
  readonly currentSelection: ModelSelection | null | undefined;
  readonly requestedInstanceId: ProviderInstanceId;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly settings: UnifiedSettings;
}): ModelSelection | null {
  const entry = deriveProviderInstanceEntries(input.providers).find(
    (candidate) => candidate.instanceId === input.requestedInstanceId,
  );
  if (!entry || !isSelectableProjectProviderEntry(entry)) {
    return null;
  }
  return selectionForEntry({
    currentSelection: input.currentSelection,
    entry,
    providers: input.providers,
    settings: input.settings,
  });
}

export function resolveProjectProviderState(input: {
  readonly configuredSelection: ModelSelection | null | undefined;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly settings: UnifiedSettings;
}): ProjectProviderResolution {
  const entries = deriveProviderInstanceEntries(input.providers);
  const configuredInstanceId = input.configuredSelection?.instanceId ?? null;
  const configuredEntry = entries.find((entry) => entry.instanceId === configuredInstanceId);
  const effectiveEntry =
    (configuredEntry && isSelectableProjectProviderEntry(configuredEntry)
      ? configuredEntry
      : undefined) ??
    entries.find(isSelectableProjectProviderEntry) ??
    null;
  const effectiveSelection = effectiveEntry
    ? selectionForEntry({
        currentSelection: input.configuredSelection,
        entry: effectiveEntry,
        providers: input.providers,
        settings: input.settings,
      })
    : null;

  return {
    configuredInstanceId,
    effectiveEntry,
    effectiveSelection,
    isFallback:
      configuredInstanceId !== null &&
      effectiveEntry !== null &&
      effectiveEntry.instanceId !== configuredInstanceId,
    usesClaudeProjectConfig:
      effectiveEntry !== null &&
      getAppModelOptionConfigForInstanceEntry(effectiveEntry)?.includeClaudeProjectConfig === true,
  };
}
