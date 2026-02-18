import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  setAuthUser,
  setTurnkeySession,
  clearTurnkeySession,
} from "./storage";
import { apiLogin, apiGetSession, apiLogout, ApiError } from "./api";
import type { AuthUser } from "./types";

export async function checkSession(): Promise<AuthUser | null> {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const { user } = await apiGetSession();
    await setAuthUser(user);
    return user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await clearAuthToken();
    }
    return null;
  }
}

export async function login(
  username: string,
  password: string
): Promise<AuthUser> {
  const { token, user, turnkey } = await apiLogin(username, password);
  await setAuthToken(token);
  await setAuthUser(user);
  await setTurnkeySession(turnkey);
  return user;
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } catch {
    // Even if API fails, clear local auth
  }
  await clearAuthToken();
  await clearTurnkeySession();
}

