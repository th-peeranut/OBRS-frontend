export interface Login {
  email: string;
  password: string;
}

export interface LoginUser {
  id: number;
  fullName: string;
  email: string;
  preferredLocale: string;
  status: string;
  roles: string[];
}

export interface LoginResponseData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  // OBRS-855: optional because the field is only as old as the backend deploy that added it, and
  // a frontend that lands first would otherwise be lying in its own types. Every consumer must
  // cope with it being absent — AuthService.storeAuthData() clears the stored token in that case
  // rather than leaving a stale one behind. Once /api/auth/refresh is live everywhere this can
  // become required.
  refreshToken?: string;
  refreshExpiresIn?: number;
  user: LoginUser;
}

export type PasswordResetRequestResponse = unknown;

export type PasswordResetConfirmResponse = unknown;

// OBRS-84: verified self-service login-email change.
export interface EmailChangeRequestPayload {
  currentPassword: string;
  newEmail: string;
}

export type EmailChangeRequestResponse = unknown;

export interface EmailChangeConfirmResponse {
  newEmail?: string;
}

export interface Register {
  title?: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  preferredLocale: string;
  pdpaConsent: boolean;
  // Backend ignores these fields (login is email-based), kept for local form state only.
  username?: string;
  isPhoneNumberVerify?: boolean;
  roles?: string[];
}

export interface SignUpPayload {
  title?: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  preferredLocale: string;
  pdpaConsent: boolean;
  /**
   * OBRS-632: the privacy-notice version this build rendered beside the consent box. Filled in by
   * `AuthService.register` from `PRIVACY_POLICY_VERSION`, never by the form — the value recorded
   * has to be the one that was actually on screen, and a caller cannot be trusted to remember to
   * pass it.
   */
  pdpaConsentVersion: string;
}
