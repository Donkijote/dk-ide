import { describe, expect, it } from "vitest";

import { buildWorkspaceContextItems } from "./WorkspaceContextBar.logic";

describe("buildWorkspaceContextItems", () => {
  it("projects workspace resources and active context into header items", () => {
    expect(
      buildWorkspaceContextItems({
        activeThreadTitle: "Implement workspace header",
        branchName: "improvement/ghi#7",
        environmentLabel: "Local environment",
        repositoryLabel: "Donkijote/dk-ide",
        workspaceRoot: "/Users/manuel/Developer/personal/dk-ide",
      }),
    ).toEqual([
      { kind: "environment", label: "Env", value: "Local environment" },
      { kind: "thread", label: "Context", value: "Implement workspace header" },
      { kind: "resource", label: "Repo", value: "Donkijote/dk-ide" },
      {
        kind: "root",
        label: "Root",
        value: "dk-ide",
        title: "/Users/manuel/Developer/personal/dk-ide",
      },
      { kind: "branch", label: "Branch", value: "improvement/ghi#7" },
    ]);
  });

  it("omits empty optional context values", () => {
    expect(
      buildWorkspaceContextItems({
        activeThreadTitle: "  ",
        branchName: null,
        environmentLabel: "Remote",
        repositoryLabel: undefined,
        workspaceRoot: "",
      }),
    ).toEqual([{ kind: "environment", label: "Env", value: "Remote" }]);
  });
});
