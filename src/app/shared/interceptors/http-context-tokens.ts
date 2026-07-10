import { HttpContextToken } from '@angular/common/http';

export const SKIP_GLOBAL_LOADING_ALERT = new HttpContextToken<boolean>(
  () => false
);

export const SKIP_GLOBAL_ERROR_ALERT = new HttpContextToken<boolean>(
  () => false
);

/**
 * Governs ONLY whether a 401 response forces a logout + redirect to /login
 * (`auth.interceptor.ts`). Default `false` = a 401 DOES force logout — this is
 * the safe default for every authenticated call. Set `true` only on calls that
 * are genuinely public or must tolerate a transient/expected 401 without
 * nuking the session (e.g. a silent preview hitting a cold-start blip).
 *
 * Deliberately independent of `SKIP_GLOBAL_ERROR_ALERT` (which only suppresses
 * the global toast): a call can suppress the toast and still force-logout on a
 * real 401 (most authenticated calls), or suppress both (public/tolerant
 * calls). Do not conflate the two again — that conflation (OBRS-181) is what
 * let expired sessions on protected pages get stuck instead of redirecting
 * (OBRS-187).
 */
export const SKIP_AUTH_LOGOUT = new HttpContextToken<boolean>(() => false);
