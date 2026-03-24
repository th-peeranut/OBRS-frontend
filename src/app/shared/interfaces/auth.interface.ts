export interface Login {
  username: string;
  password: string;
}

export interface LoginUser {
  id: number;
  fullName: string;
  email: string;
  username: string;
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
  username: string;
  password: string;
  isPhoneNumberVerify: boolean;
  roles: string[];
  preferredLocale: string;
}
