import { environmentBase } from './environment.base';

// local backend only — selected via `npm run start:local`. Default `npm start`
// now uses environment.sit.ts (SIT backend on Koyeb).
export const environment = {
  ...environmentBase,
  features: {
    ...environmentBase.features,
    // OBRS-1302. The ONE config where online booking stays open, and the only
    // override this file carries.
    //
    // `features.onlineTicketBooking: false` in environment.base.ts is a statement
    // about the deployed product — nobody can serve a customer who books online
    // right now — not a statement about the code. This file is what `ng test`,
    // `npm run build` and the `e2e:gate` lane build against (see the pre-hook
    // comment in package.json), and inheriting the closure here took 19 gate
    // specs down with it: b2c-critical-path, route-smoke, review-total-host-box,
    // host-box-sweep, customer-contrast-gate and the FAB occlusion sweep all walk
    // into /review-schedule-booking or /payment, and the guard redirected them
    // home. Measured, not predicted — that was the first gate run of this branch.
    //
    // Turning those specs off to make the lane green would have deleted the
    // regression net for the core purchase flow in order to record a business
    // decision we intend to reverse. The flow is not broken and did not change;
    // it is switched off in front of customers. So the lane keeps exercising it,
    // and the closed state is proved instead by unit specs that assert BOTH arms
    // explicitly (app-routing.module.spec.ts, booking-closed-notice.component.spec.ts,
    // schedule-booking-list.component.spec.ts) plus the AFTER capture, which runs
    // against `--configuration sit` and therefore against the closed build.
    //
    // SIT is deliberately NOT given this override: it should look exactly like
    // production. Staff training happens on /staff/sell, which this flag does not
    // touch, so a closed SIT costs nothing.
    onlineTicketBooking: true,
  },
};
