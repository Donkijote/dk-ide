import { describe, expect, it } from "vitest";

import { workspacePaneDropDirection } from "./WorkspacePaneHost.logic";

describe("workspacePaneDropDirection", () => {
  it("uses the release pointer when moving an upper pane beside a lower pane", () => {
    expect(
      workspacePaneDropDirection({
        activeRect: {
          left: 880,
          top: 120,
          width: 560,
          height: 280,
        },
        overRect: {
          left: 16,
          top: 420,
          width: 840,
          height: 280,
        },
        pointer: {
          x: 820,
          y: 560,
        },
      }),
    ).toBe("after");
  });

  it("keeps center drops as swaps", () => {
    expect(
      workspacePaneDropDirection({
        activeRect: null,
        overRect: {
          left: 100,
          top: 200,
          width: 600,
          height: 300,
        },
        pointer: {
          x: 400,
          y: 350,
        },
      }),
    ).toBe("swap");
  });
});
