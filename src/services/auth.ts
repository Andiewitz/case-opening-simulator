import { CognitoIdentityProviderClient, InitiateAuthCommand, SignOutCommand, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient({});

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN || "";
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID || "";
const COGNITO_REGION = import.meta.env.VITE_COGNITO_REGION || "us-east-1";
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI || window.location.origin + "/callback";
const LOGOUT_URI = import.meta.env.VITE_COGNITO_LOGOUT_URI || window.location.origin;

const TOKEN_KEY = "cs2_unboxed_access_token";
const PROFILE_KEY = "cs2_unboxed_profile";

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
    const accessToken = data.access_token;
    const idToken = data.id_token;
    const profile = decodeJwt(idToken);
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return { accessToken, profile };
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      await client.send(new SignOutCommand({ AccessToken: token }));
    }
  } catch {}
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
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

export function onAuthStateChanged(callback: (user: any | null) => void): () => void {
  const check = () => callback(getCurrentUser());
  check();
  const onStorage = () => check();
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
