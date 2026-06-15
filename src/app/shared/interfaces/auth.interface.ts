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
  user: LoginUser;
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
}
