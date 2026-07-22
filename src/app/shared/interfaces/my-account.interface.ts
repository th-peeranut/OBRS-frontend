/**
 * OBRS-632 — the shapes behind `/api/private/users/me`, the endpoints that make the PDPA rights
 * the privacy notice is about to declare (OBRS-631) actually exercisable from the website.
 *
 * Until this card the backend already served `PUT /users/me` and `DELETE /users/me` and **nothing
 * in the frontend called either of them**: reading the API list suggested "customers can already
 * edit and delete their own data", and the buttons did not exist. These types are the frontend
 * half of closing that gap.
 */

/** Subset of the backend `UserDetailResponse` this page needs. */
export interface MyAccountProfile {
  id: number;
  title: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string;
  phoneNumber: string | null;
  preferredLocale: string;
  /**
   * The privacy-notice version this account consented to. `null` means they consented before the
   * notice carried a version at all — which, for the purpose of "do we need to ask again?", reads
   * exactly the same as an out-of-date version.
   */
  pdpaConsentVersion: string | null;
}

/** Body of `PUT /api/private/users/me` — mirrors the backend `UserProfileUpdateReqDto` exactly. */
export interface MyAccountProfileUpdate {
  title: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  phoneNumber: string;
  preferredLocale: string;
}
