import { HttpContextToken } from '@angular/common/http';

export const SKIP_GLOBAL_LOADING_ALERT = new HttpContextToken<boolean>(
  () => false
);

export const SKIP_GLOBAL_ERROR_ALERT = new HttpContextToken<boolean>(
  () => false
);
