import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSignUp,
  decodeJwt,
  getAccessToken,
  getCurrentUser,
  getValidAccessToken,
  onAuthStateChanged,
  refreshProfile,
  signInWithPassword,
  signOut,
  signUp,
} from "../src/services/auth";

const TOKEN_KEY = "cs2_unboxed_access_token";
const PROFILE_KEY = "cs2_unboxed_profile";
const REFRESH_KEY = "cs2_unboxed_refresh_token";

function base64url(value: object): string {
  // Go through UTF-8 bytes so non-ASCII claims survive btoa's Latin-1 view.
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jwt(claims: object): string {
  return `${base64url({ alg: "none" })}.${base64url(claims)}.signature`;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("decodeJwt", () => {
  it("reads the payload of a base64url token", () => {
    const token = jwt({ sub: "abc", email: "pilot@example.com", exp: 1234 });
    expect(decodeJwt(token)).toEqual({ sub: "abc", email: "pilot@example.com", exp: 1234 });
  });

  it("decodes non-ASCII claims", () => {
    expect(decodeJwt(jwt({ name: "★ Karambit — Doppler" })).name).toBe("★ Karambit — Doppler");
  });

  it("restores base64url padding before calling atob", () => {
    const payload = base64url({ sub: "abc" }); // 18 chars: needs two '='
    const calls: string[] = [];
    const realAtob = globalThis.atob;
    vi.stubGlobal("atob", (value: string) => {
      calls.push(value);
      return realAtob(value);
    });

    try {
      expect(decodeJwt(`header.${payload}.signature`)).toEqual({ sub: "abc" });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(calls[0]).toBe(`${payload}==`);
  });

  it("returns an empty object for anything it cannot parse", () => {
    expect(decodeJwt("")).toEqual({});
    expect(decodeJwt("not-a-token")).toEqual({});
    expect(decodeJwt("header.%%%.sig")).toEqual({});
    expect(decodeJwt("header.e30.sig")).toEqual({});
  });
});

describe("signInWithPassword", () => {
  it("stores the session and returns the decoded profile", async () => {
    const accessToken = jwt({ sub: "abc", exp: Math.floor(Date.now() / 1000) + 3600 });
    const idToken = jwt({ email: "pilot@example.com" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        AuthenticationResult: { AccessToken: accessToken, IdToken: idToken, RefreshToken: "rt-1" },
      })
    );

    const result = await signInWithPassword("pilot@example.com", "Password123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("cognito-idp");
    expect(init.headers["X-Amz-Target"]).toBe("AWSCognitoIdentityProviderService.InitiateAuth");
    expect(JSON.parse(init.body)).toMatchObject({
      AuthFlow: "USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: "pilot@example.com", PASSWORD: "Password123" },
    });

    expect(result.accessToken).toBe(accessToken);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(accessToken);
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rt-1");
    expect(getCurrentUser()).toEqual({ email: "pilot@example.com" });
    expect(result.profile).toEqual({ email: "pilot@example.com" });
  });

  it("translates Cognito errors into readable messages", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { __type: "NotAuthorizedException", message: "Incorrect username or password." })
    );

    await expect(signInWithPassword("a@b.c", "nope")).rejects.toThrow("Incorrect email or password.");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("fails loudly when Cognito returns no access token", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    await expect(signInWithPassword("a@b.c", "Password123")).rejects.toThrow(/No session returned/);
  });

  it("does not persist anything when the network throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(signInWithPassword("a@b.c", "Password123")).rejects.toThrow("offline");
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});

describe("signUp and confirmSignUp", () => {
  it("surfaces a duplicate-account error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { __type: "UsernameExistsException" }));
    await expect(signUp("a@b.c", "Password123")).rejects.toThrow(/already exists/);
  });

  it("surfaces an unconfirmed-account error on sign-in", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { __type: "UserNotConfirmedException" }));
    await expect(signInWithPassword("a@b.c", "Password123")).rejects.toThrow(/confirm your account/);
  });

  it("surfaces a bad confirmation code", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { __type: "CodeMismatchException" }));
    await expect(confirmSignUp("a@b.c", "000000")).rejects.toThrow(/incorrect/);
  });

  it("resolves when the calls succeed", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await expect(signUp("a@b.c", "Password123")).resolves.toBeUndefined();
    await expect(confirmSignUp("a@b.c", "123456")).resolves.toBeUndefined();
  });
});

describe("getValidAccessToken", () => {
  it("returns null when there is no session at all", async () => {
    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses a token that is not close to expiry", async () => {
    const token = jwt({ exp: Math.floor(Date.now() / 1000) + 900 });
    localStorage.setItem(TOKEN_KEY, token);

    await expect(getValidAccessToken()).resolves.toBe(token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes a token that expires within a minute", async () => {
    localStorage.setItem(TOKEN_KEY, jwt({ exp: Math.floor(Date.now() / 1000) + 10 }));
    localStorage.setItem(REFRESH_KEY, "rt-1");
    const fresh = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: fresh }));

    await expect(getValidAccessToken()).resolves.toBe(fresh);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(fresh);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/oauth2/token");
    expect(String(init.body)).toContain("grant_type=refresh_token");
    expect(String(init.body)).toContain("refresh_token=rt-1");
  });

  it("shares one refresh across parallel callers", async () => {
    localStorage.setItem(TOKEN_KEY, jwt({ exp: Math.floor(Date.now() / 1000) - 5 }));
    localStorage.setItem(REFRESH_KEY, "rt-1");
    const fresh = jwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    fetchMock.mockResolvedValue(jsonResponse(200, { access_token: fresh }));

    const tokens = await Promise.all([
      getValidAccessToken(),
      getValidAccessToken(),
      getValidAccessToken(),
    ]);

    expect(tokens).toEqual([fresh, fresh, fresh]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the session when the refresh is rejected", async () => {
    localStorage.setItem(TOKEN_KEY, jwt({ exp: 1 }));
    localStorage.setItem(REFRESH_KEY, "rt-expired");
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: "a@b.c" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "invalid_grant" }));

    await expect(getValidAccessToken()).resolves.toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it("returns the stale token when there is nothing to refresh with", async () => {
    const stale = jwt({ exp: 1 });
    localStorage.setItem(TOKEN_KEY, stale);
    await expect(getValidAccessToken()).resolves.toBe(stale);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("revokes the token then clears local state", async () => {
    localStorage.setItem(TOKEN_KEY, "access-1");
    localStorage.setItem(REFRESH_KEY, "rt-1");
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: "a@b.c" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await signOut();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["X-Amz-Target"]).toBe("AWSCognitoIdentityProviderService.GlobalSignOut");
    expect(JSON.parse(init.body)).toEqual({ AccessToken: "access-1" });
    expect(getAccessToken()).toBeNull();
    expect(getCurrentUser()).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it("still clears local state when revocation fails", async () => {
    localStorage.setItem(TOKEN_KEY, "access-1");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(signOut()).resolves.toBeUndefined();
    expect(getAccessToken()).toBeNull();
  });

  it("does not call Cognito when there is no token", async () => {
    await signOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("onAuthStateChanged", () => {
  it("fires immediately, on refreshProfile, and stops after unsubscribe", () => {
    const seen: any[] = [];
    const unsubscribe = onAuthStateChanged((user) => seen.push(user));

    expect(seen).toEqual([null]);

    localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: "a@b.c" }));
    refreshProfile();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ email: "a@b.c" });

    unsubscribe();
    refreshProfile();
    expect(seen).toHaveLength(2);
  });

  it("survives corrupt profile JSON", () => {
    localStorage.setItem(PROFILE_KEY, "{not json");
    const seen: any[] = [];
    const unsubscribe = onAuthStateChanged((user) => seen.push(user));
    expect(seen).toEqual([null]);
    unsubscribe();
  });
});
