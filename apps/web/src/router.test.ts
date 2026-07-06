import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getRouter", () => {
  it("uses the splash screen for pending route loads", async () => {
    vi.stubGlobal("self", {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
      close: vi.fn(),
    });

    const [{ createMemoryHistory }, { SplashScreen }, { getRouter }] = await Promise.all([
      import("@tanstack/react-router"),
      import("./components/SplashScreen"),
      import("./router"),
    ]);

    const router = getRouter(createMemoryHistory());

    expect(router.options.defaultPendingComponent).toBe(SplashScreen);
    expect(router.options.defaultPendingMs).toBe(0);
  });
});
