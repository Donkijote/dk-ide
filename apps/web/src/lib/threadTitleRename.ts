import type { ScopedThreadRef } from "@t3tools/contracts";

import { readEnvironmentApi } from "../environmentApi";
import { newCommandId } from "./utils";

export type ThreadTitleRenameResult =
  | { readonly type: "empty" }
  | { readonly type: "unchanged" }
  | { readonly type: "api-unavailable" }
  | { readonly type: "renamed" }
  | { readonly type: "failed"; readonly error: unknown };

export async function renameThreadTitle(input: {
  readonly threadRef: ScopedThreadRef;
  readonly newTitle: string | null;
  readonly originalTitle: string;
}): Promise<ThreadTitleRenameResult> {
  const trimmed = input.newTitle?.trim() ?? "";
  if (trimmed.length === 0) {
    return { type: "empty" };
  }
  if (trimmed === input.originalTitle) {
    return { type: "unchanged" };
  }

  const api = readEnvironmentApi(input.threadRef.environmentId);
  if (!api) {
    return { type: "api-unavailable" };
  }

  try {
    await api.orchestration.dispatchCommand({
      type: "thread.meta.update",
      commandId: newCommandId(),
      threadId: input.threadRef.threadId,
      title: trimmed,
    });
    return { type: "renamed" };
  } catch (error) {
    return { type: "failed", error };
  }
}
