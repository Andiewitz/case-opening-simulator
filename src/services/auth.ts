import { CognitoIdentityProviderClient, GlobalSignOutCommand, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({});

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || "";
const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || "us-east-1";
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin + "/callback";
const LOGOUT_URI = import.meta.env.VITE_COGNITO_LOGOUT_URI || window.location.origin;

const TOKEN_KEY = "cs2_unboxed_access_token";
const PROFILE_KEY = "cs2_unboxed_profile";
const REFRESH_KEY = "cs2_unboxed_refresh_token";
const AUTH_CHANGED_EVENT = "cs2_unboxed_auth_changed";

export function cognitoAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: "code",
    scope: "email openid profile",
    redirect_uri: REDIRECT_URI,
  });
  return `https://${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

export async function signIn(): Promise<void> {
  window.location.href = cognitoAuthUrl();
}

export async function completeSignIn(code: string): Promise<{ accessToken: string; profile: any } | null> {
  if (!COGNITO_DOMAIN || !COGNITO_CLIENT_ID) return null;
  try {
    const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: COGNITO_CLIENT_ID,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    storeTokens(data);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    return { accessToken: data.access_token, profile: getCurrentUser() };
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      await client.send(new GlobalSignOutCommand({ AccessToken: token }));
    }
  } catch {}
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(REFRESH_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

/** Ask the app shell to re-read the user profile (balance/stats) from the API. */
export function refreshProfile(): void {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function getCurrentUser(): any | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function secondsUntilAccessTokenExpires(accessToken: string): number {
  const claims = decodeJwt(accessToken);
  if (!claims.exp) return -1;
  return claims.exp - Date.now() / 1000;
}

// One shared refresh in flight at a time — parallel requests with an expired
// token must not mint several refresh-grant calls.
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: COGNITO_CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
    const data = await res.json();
    const accessToken = data.access_token;
    if (!accessToken) throw new Error("No access_token in refresh response");
    localStorage.setItem(TOKEN_KEY, accessToken);
    if (data.id_token) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(decodeJwt(data.id_token)));
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    }
    return accessToken;
  } catch {
    // Refresh token revoked / expired → clean signed-out state.
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(REFRESH_KEY);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    return null;
  }
}

/**
 * Returns a usable access token, transparently refreshing it (single-flight)
 * when it is missing or within one minute of expiring. Call sites are async.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const accessToken = getAccessToken();
  if (accessToken && secondsUntilAccessTokenExpires(accessToken) > 60) {
    return accessToken;
  }

  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return accessToken;

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken(refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function getUserProfileFromCognito(accessToken: string): Promise<any | null> {
  try {
    const out = await client.send(new GetUserCommand({ AccessToken: accessToken }));
    const attrs: Record<string, string> = {};
    (out.UserAttributes || []).forEach((a) => { if (a.Name && a.Value) attrs[a.Name] = a.Value; });
    return { userId: out.Username, ...attrs };
  } catch {
    return null;
  }
}

function decodeJwt(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return {};
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function storeTokens(data: { access_token?: string; id_token?: string; refresh_token?: string }) {
  if (!data.access_token) return;
  localStorage.setItem(TOKEN_KEY, data.access_token);
  if (data.id_token) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(decodeJwt(data.id_token)));
  }
  if (data.refresh_token) {
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
  }
}

function friendlyAuthError(err: any): Error {
  const map: Record<string, string> = {
    NotAuthorizedException: "Incorrect email or password.",
    UserNotFoundException: "No account found with that email.",
    UserNotConfirmedException: "Please confirm your account first (check your email).",
    UsernameExistsException: "An account with that email already exists.",
    CodeMismatchException: "That confirmation code is incorrect.",
    ExpiredCodeException: "That confirmation code has expired. Request a new one.",
    LimitExceededException: "Too many attempts — try again in a minute.",
    InvalidParameterException: "Check your email and password (min. 8 chars incl. numbers).",
    InvalidPasswordException: "Password needs at least 8 characters including numbers and mixed case.",
  };
  const name = err?.name;
  const msg = (name && map[name]) || err?.message || (name ? name : "Authentication error.");
  return new Error(msg);
}

/**
 * Direct API calls to Cognito (JSON 1.1 protocol) rather than the SDK client —
 * works reliably in browser bundles from any origin.
 */
const RESP_HEADERS = {
  "Content-Type": "application/x-amz-json-1.1",
};

function cognitoTargetUrl(): string {
  return `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
}

/**
 * Direct password sign-in via the Cognito JSON API — works from any origin
 * (no hosted-UI redirect), e.g. the interim S3 HTTP site.
 */
export async function signInWithPassword(email: string, password: string): Promise<any> {
  const res = await fetch(cognitoTargetUrl(), {
    method: "POST",
    headers: { ...RESP_HEADERS, "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth" },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.__type) throw friendlyAuthError({ name: data.__type });
  const result = data.AuthenticationResult;
  if (!result?.AccessToken) throw new Error("No session returned. Please try again.");
  storeTokens({
    access_token: result.AccessToken,
    id_token: result.IdToken,
    refresh_token: result.RefreshToken,
  });
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  return { accessToken: result.AccessToken, profile: getCurrentUser() };
}

export async function signUp(email: string, password: string): Promise<void> {
  const res = await fetch(cognitoTargetUrl(), {
    method: "POST",
    headers: { ...RESP_HEADERS, "X-Amz-Target": "AWSCognitoIdentityProviderService.SignUp" },
    body: JSON.stringify({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }],
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.__type) throw friendlyAuthError({ name: data.__type });
}

export async function confirmSignUp(email: string, code: string): Promise<void> {
  const res = await fetch(cognitoTargetUrl(), {
    method: "POST",
    headers: { ...RESP_HEADERS, "X-Amz-Target": "AWSCognitoIdentityProviderService.ConfirmSignUp" },
    body: JSON.stringify({
      ClientId: COGNITO_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.__type) throw friendlyAuthError({ name: data.__type });
}

export function onAuthStateChanged(callback: (user: any | null) => void): () => void {
  const check = () => callback(getCurrentUser());
  check();
  const onStorage = () => check();
  const onAuthChanged = () => check();
  window.addEventListener("storage", onStorage);
  window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  };
}
