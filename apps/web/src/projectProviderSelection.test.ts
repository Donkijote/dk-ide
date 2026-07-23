import {
  CLAUDE_PROJECT_CONFIG_MODEL,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { describe, expect, it } from "vitest";

import {
  resolveProjectProviderSelection,
  resolveProjectProviderState,
} from "./projectProviderSelection";

function provider(input: {
  instanceId: string;
  driver: "codex" | "claudeAgent" | "opencode";
  model: string;
  enabled?: boolean;
  availability?: "available" | "unavailable";
  status?: "ready" | "disabled" | "error" | "warning";
  projectSettingsDetected?: boolean;
  projectSettingsModel?: string;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make(input.driver),
    displayName: input.driver,
    enabled: input.enabled ?? true,
    availability: input.availability ?? "available",
    installed: true,
    version: null,
    status: input.status ?? "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-23T00:00:00.000Z",
    models: [{ slug: input.model, name: input.model, isCustom: false, capabilities: {} }],
    slashCommands: [],
    skills: [],
    ...(input.projectSettingsDetected
      ? {
          projectSettingsDetected: true,
          projectSettingsSource: "project" as const,
          projectSettingsModel: input.projectSettingsModel ?? input.model,
        }
      : {}),
  };
}

const providers = [
  provider({ instanceId: "codex", driver: "codex", model: "gpt-5.4" }),
  provider({
    instanceId: "claudeAgent",
    driver: "claudeAgent",
    model: "claude-sonnet-4-6",
    projectSettingsDetected: true,
    projectSettingsModel: "claude-opus-4-6",
  }),
  provider({ instanceId: "opencode", driver: "opencode", model: "anthropic/claude-sonnet-4-6" }),
] satisfies ServerProvider[];

describe("project provider selection", () => {
  it("gives detected .claude configuration precedence when Claude is selected", () => {
    const selection = resolveProjectProviderSelection({
      currentSelection: {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: "claude-sonnet-4-6",
      },
      requestedInstanceId: ProviderInstanceId.make("claudeAgent"),
      providers,
      settings: DEFAULT_UNIFIED_SETTINGS,
    });

    expect(selection).toEqual({
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: CLAUDE_PROJECT_CONFIG_MODEL,
    });
  });

  it("does not apply .claude configuration to a non-Claude provider", () => {
    const selection = resolveProjectProviderSelection({
      currentSelection: {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        model: CLAUDE_PROJECT_CONFIG_MODEL,
      },
      requestedInstanceId: ProviderInstanceId.make("opencode"),
      providers,
      settings: DEFAULT_UNIFIED_SETTINGS,
    });

    expect(selection).toEqual({
      instanceId: ProviderInstanceId.make("opencode"),
      model: "anthropic/claude-sonnet-4-6",
    });
  });

  it("preserves a valid configured model for the selected non-Claude provider", () => {
    const selection = resolveProjectProviderSelection({
      currentSelection: {
        instanceId: ProviderInstanceId.make("opencode"),
        model: "anthropic/claude-sonnet-4-6",
      },
      requestedInstanceId: ProviderInstanceId.make("opencode"),
      providers,
      settings: DEFAULT_UNIFIED_SETTINGS,
    });

    expect(selection?.model).toBe("anthropic/claude-sonnet-4-6");
  });

  it("falls back predictably without overwriting an unavailable configured provider", () => {
    const unavailableProviders = [
      provider({ instanceId: "codex", driver: "codex", model: "gpt-5.4" }),
      provider({
        instanceId: "opencode",
        driver: "opencode",
        model: "anthropic/claude-sonnet-4-6",
        availability: "unavailable",
      }),
    ] satisfies ServerProvider[];

    const resolution = resolveProjectProviderState({
      configuredSelection: {
        instanceId: ProviderInstanceId.make("opencode"),
        model: "anthropic/claude-sonnet-4-6",
      },
      providers: unavailableProviders,
      settings: DEFAULT_UNIFIED_SETTINGS,
    });

    expect(resolution.configuredInstanceId).toBe("opencode");
    expect(resolution.effectiveSelection?.instanceId).toBe("codex");
    expect(resolution.isFallback).toBe(true);
  });

  it("rejects an unavailable provider as a new workspace default", () => {
    const selection = resolveProjectProviderSelection({
      currentSelection: null,
      requestedInstanceId: ProviderInstanceId.make("opencode"),
      providers: [
        provider({
          instanceId: "opencode",
          driver: "opencode",
          model: "anthropic/claude-sonnet-4-6",
          enabled: false,
          status: "disabled",
        }),
      ],
      settings: DEFAULT_UNIFIED_SETTINGS,
    });

    expect(selection).toBeNull();
  });
});
