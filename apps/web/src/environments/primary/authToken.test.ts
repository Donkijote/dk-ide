import { describe, expect, it } from "vitest";

import {
  clearPrimaryBearerAccessToken,
  currentPrimaryAuthHeaders,
  readPrimaryBearerAccessToken,
  setPrimaryBearerAccessToken,
  withPrimaryAuthHeaders,
} from "./authToken";

describe("primary auth token", () => {
  it("injects the bearer token into fetch init headers", () => {
    clearPrimaryBearerAccessToken();
    expect(currentPrimaryAuthHeaders()).toEqual({});
    expect(withPrimaryAuthHeaders({ credentials: "include" })).toEqual({
      credentials: "include",
    });

    setPrimaryBearerAccessToken("desktop-bearer-token");
    expect(readPrimaryBearerAccessToken()).toBe("desktop-bearer-token");

    const init = withPrimaryAuthHeaders({
      credentials: "include",
      headers: { "x-request-id": "request-1" },
    });
    const headers = new Headers(init?.headers);

    expect(currentPrimaryAuthHeaders()).toEqual({
      authorization: "Bearer desktop-bearer-token",
    });
    expect(init?.credentials).toBe("include");
    expect(headers.get("authorization")).toBe("Bearer desktop-bearer-token");
    expect(headers.get("x-request-id")).toBe("request-1");

    clearPrimaryBearerAccessToken();
    expect(currentPrimaryAuthHeaders()).toEqual({});
    expect(readPrimaryBearerAccessToken()).toBeNull();
  });

  it("does not overwrite an explicit authorization header", () => {
    setPrimaryBearerAccessToken("desktop-bearer-token");

    const init = withPrimaryAuthHeaders({
      headers: { authorization: "Bearer explicit-token" },
    });

    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer explicit-token");
    clearPrimaryBearerAccessToken();
  });
});
