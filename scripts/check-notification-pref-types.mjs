// Notification-preference type gate (OBRS-1762).
//
// Why this exists: the list of notification types a customer can switch on and off
// lives in TWO repos, and until this gate nothing compared them.
//   backend  ENotificationPreferenceType, the constants with customerVisible=true
//   frontend NOTIFICATION_PREFS.TYPE.* in public/i18n/{en,th,zh}.json
// The page renders one row per type the API returns and labels it by looking up
// 'NOTIFICATION_PREFS.TYPE.' + type. A type the backend has and this file does not
// therefore reaches a real customer as the literal string
// "NOTIFICATION_PREFS.TYPE.SCHEDULE_DELAYED" -- no error, no warning, no test.
// That is exactly what OBRS-272/273 did in July 2026 and what OBRS-1743 found on
// 2026-09-07, months later, by looking at a screenshot.
//
// test:i18n cannot catch it BY DESIGN: it compares en/th/zh to each other, and all
// three were missing the same two keys, so it reported parity OK the whole time.
//
// What this gate is, honestly: a tripwire, not a proof. It does not read the backend
// -- no CI here can check out the other repo (the backend's Actions budget is closed
// permanently). It compares each side to the SAME committed list, so adding a type to
// the enum without touching the list fails `mvn test` over there, and touching the
// list here without the labels fails this script. Someone determined to edit both
// lists and neither label can still get through; nobody can do it by forgetting.
//
// The mirror of these lists lives at
//   src/test/java/com/example/demo/enums/NotificationPreferenceTypeParityTest.java
// Change one, change the other, in the same pair of PRs.
//
// Run locally with: npm run test:notification-pref-types

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const I18N_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'i18n');
const LANGS = ['en', 'th', 'zh'];

// The committed central list, in the backend's declaration order (which is also the
// response/display order of GET /api/private/users/me/notification-preferences).
const CUSTOMER_VISIBLE_TYPES = [
  'PAYMENT_CONFIRMED',
  'BOOKING_CANCELLED',
  'SCHEDULE_CANCELLED',
  'BOOKING_RESCHEDULED',
  'SCHEDULE_TIME_CHANGED',
  'SCHEDULE_DELAYED',
  'SCHEDULE_VEHICLE_CHANGED',
];

// Types the enum still declares but withholds from the matrix (customerVisible=false,
// ADR-0111 / ADR-0112). The backend keeps its constants on purpose, so that bringing a
// reminder back is a config change rather than a re-derivation of who may receive one;
// a label parked here costs nothing and is the frontend half of that same bet. So these
// are PERMITTED, not required -- what is forbidden is a label for a name the enum does
// not have at all, which is real litter.
const WITHHELD_TYPES = ['PRE_DEPARTURE_REMINDER', 'BOARDING_REMINDER'];

const KNOWN_TYPES = [...CUSTOMER_VISIBLE_TYPES, ...WITHHELD_TYPES];

const failures = [];

for (const lang of LANGS) {
  const file = join(I18N_DIR, `${lang}.json`);
  const types = JSON.parse(readFileSync(file, 'utf8'))?.NOTIFICATION_PREFS?.TYPE;

  if (!types || typeof types !== 'object') {
    failures.push(`${lang}.json: NOTIFICATION_PREFS.TYPE is missing or is not an object`);
    continue;
  }

  const present = Object.keys(types);
  const missing = CUSTOMER_VISIBLE_TYPES.filter((type) => !present.includes(type));
  const unknown = present.filter((type) => !KNOWN_TYPES.includes(type));

  if (missing.length) {
    failures.push(`${lang}.json: no label for ${missing.join(', ')} - the page would print the raw key`);
  }
  if (unknown.length) {
    failures.push(`${lang}.json: label for ${unknown.join(', ')}, which the enum does not declare`);
  }

  // A key that exists with an empty value renders as an empty row label, which the
  // key-set comparison above cannot see.
  const blank = present.filter((type) => typeof types[type] !== 'string' || !types[type].trim());
  if (blank.length) {
    failures.push(`${lang}.json: blank label for ${blank.join(', ')}`);
  }
}

if (failures.length) {
  console.error('notification-preference type gate FAILED:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error(
    '\nThe list is ENotificationPreferenceType in the backend. If it gained or lost a type,' +
      '\nupdate CUSTOMER_VISIBLE_TYPES / WITHHELD_TYPES in this file AND the labels in all' +
      '\nthree i18n files. See OBRS-1762.',
  );
  process.exit(1);
}

console.log(
  `notification-preference type gate OK: all ${LANGS.length} files label the ` +
    `${CUSTOMER_VISIBLE_TYPES.length} customer-visible types and nothing the enum does not declare.`,
);
