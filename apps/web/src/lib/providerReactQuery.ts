import {
  type EnvironmentId,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetTurnDiffInput,
  type ProviderDriverKind,
  ThreadId,
} from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ensureEnvironmentApi } from "../environmentApi";
import { readEnvironmentConnection } from "../environments/runtime";

const decodeFullThreadDiffInput = Schema.decodeUnknownOption(OrchestrationGetFullThreadDiffInput);
const decodeTurnDiffInput = Schema.decodeUnknownOption(OrchestrationGetTurnDiffInput);

interface CheckpointDiffQueryInput {
  environmentId: EnvironmentId | null;
  threadId: ThreadId | null;
  fromTurnCount: number | null;
  toTurnCount: number | null;
  ignoreWhitespace: boolean;
  cacheScope?: string | null;
  enabled?: boolean;
}

interface ProviderRuntimeStatusQueryInput {
  environmentId: EnvironmentId | null;
  provider: ProviderDriverKind;
  cwd: string | null | undefined;
  enabled?: boolean;
}

export const providerQueryKeys = {
  all: ["providers"] as const,
  runtimeStatus: (input: ProviderRuntimeStatusQueryInput) =>
    [
      "providers",
      "runtimeStatus",
      input.environmentId ?? null,
      input.provider,
      input.cwd ?? null,
    ] as const,
  checkpointDiff: (input: CheckpointDiffQueryInput) =>
    [
      "providers",
      "checkpointDiff",
      input.environmentId ?? null,
      input.threadId,
      input.fromTurnCount,
      input.toTurnCount,
      input.ignoreWhitespace,
      input.cacheScope ?? null,
    ] as const,
};

export function providerRuntimeStatusQueryOptions(input: ProviderRuntimeStatusQueryInput) {
  const cwd = input.cwd?.trim() ?? "";

  return queryOptions({
    queryKey: providerQueryKeys.runtimeStatus(input),
    queryFn: async () => {
      if (!input.environmentId || cwd.length === 0) {
        throw new Error("Provider runtime status is unavailable.");
      }

      const connection = readEnvironmentConnection(input.environmentId);
      if (!connection) {
        throw new Error(`Environment connection not found for ${input.environmentId}`);
      }

      return connection.client.server.getProviderRuntimeStatus({
        provider: input.provider,
        cwd,
      });
    },
    enabled: (input.enabled ?? true) && !!input.environmentId && cwd.length > 0,
    staleTime: 15_000,
  });
}

function decodeCheckpointDiffRequest(input: CheckpointDiffQueryInput) {
  if (input.fromTurnCount === 0) {
    return decodeFullThreadDiffInput({
      threadId: input.threadId,
      toTurnCount: input.toTurnCount,
      ignoreWhitespace: input.ignoreWhitespace,
    }).pipe(Option.map((fields) => ({ kind: "fullThreadDiff" as const, input: fields })));
  }

  return decodeTurnDiffInput({
    threadId: input.threadId,
    fromTurnCount: input.fromTurnCount,
    toTurnCount: input.toTurnCount,
    ignoreWhitespace: input.ignoreWhitespace,
  }).pipe(Option.map((fields) => ({ kind: "turnDiff" as const, input: fields })));
}

function asCheckpointErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "";
}

function normalizeCheckpointErrorMessage(error: unknown): string {
  const message = asCheckpointErrorMessage(error).trim();
  if (message.length === 0) {
    return "Failed to load checkpoint diff.";
  }

  const lower = message.toLowerCase();
  if (lower.includes("not a git repository")) {
    return "Turn diffs are unavailable because this project is not a git repository.";
  }

  if (
    lower.includes("checkpoint unavailable for thread") ||
    lower.includes("checkpoint invariant violation")
  ) {
    const separatorIndex = message.indexOf(":");
    if (separatorIndex >= 0) {
      const detail = message.slice(separatorIndex + 1).trim();
      if (detail.length > 0) {
        return detail;
      }
    }
  }

  return message;
}

function isCheckpointTemporarilyUnavailable(error: unknown): boolean {
  const message = asCheckpointErrorMessage(error).toLowerCase();
  return (
    message.includes("exceeds current turn count") ||
    message.includes("checkpoint is unavailable for turn") ||
    message.includes("filesystem checkpoint is unavailable")
  );
}

export function checkpointDiffQueryOptions(input: CheckpointDiffQueryInput) {
  const decodedRequest = decodeCheckpointDiffRequest(input);

  return queryOptions({
    queryKey: providerQueryKeys.checkpointDiff(input),
    queryFn: async () => {
      if (!input.environmentId || !input.threadId || decodedRequest._tag === "None") {
        throw new Error("Checkpoint diff is unavailable.");
      }
      const api = ensureEnvironmentApi(input.environmentId);
      try {
        if (decodedRequest.value.kind === "fullThreadDiff") {
          return await api.orchestration.getFullThreadDiff(decodedRequest.value.input);
        }
        return await api.orchestration.getTurnDiff(decodedRequest.value.input);
      } catch (error) {
        throw new Error(normalizeCheckpointErrorMessage(error), { cause: error });
      }
    },
    enabled:
      (input.enabled ?? true) &&
      !!input.environmentId &&
      !!input.threadId &&
      decodedRequest._tag === "Some",
    staleTime: Infinity,
    retry: (failureCount, error) => {
      if (isCheckpointTemporarilyUnavailable(error)) {
        return failureCount < 12;
      }
      return failureCount < 3;
    },
    retryDelay: (attempt, error) =>
      isCheckpointTemporarilyUnavailable(error)
        ? Math.min(5_000, 250 * 2 ** (attempt - 1))
        : Math.min(1_000, 100 * 2 ** (attempt - 1)),
  });
}
