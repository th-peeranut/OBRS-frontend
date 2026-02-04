export interface Login {
  username: string;
  password: string;
}

export interface Register {
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
