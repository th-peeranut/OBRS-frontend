/**
 * OBRS-766 QA lane — global setup.
 *
 * Frees seat inventory before every run. Each spec seeds its own walk-in booking
 * through the real API so a destructive test is re-runnable, but those bookings
 * KEEP occupying seats after the run ends: the seeded schedule cluster has 14
 * seats per vehicle type and one pass of this suite consumes seven or more. By
 * the third pass `POST /api/private/bookings` starts returning
 * `BOOKING_ERROR_SEATS_INSUFFICIENT`, every seeding call throws, and the whole
 * suite fails at setup — which reads exactly like a product regression and is
 * not one. That cost this card two full diagnostic cycles.
 *
 * Cancelling (rather than deleting) is deliberate: availability counts tickets
 * whose status is not `cancelled`, so this frees the seats while leaving the
 * rows intact for post-mortem inspection, and it never fights a foreign key.
 *
 * Booking ids 1 and 2 are the hand-seeded fixtures the customer-facing specs
 * depend on (`DRV-FIXTURE-1` is the customer's own CONFIRMED booking used by the
 * self-cancel regression) — they are preserved. Everything above id 2 in this
 * database was created by a previous pass of this suite.
 *
 * Safe only because `obrs766qa` is an isolated per-card database (see
 * docs/sessions/SESSION-OBRS-766-counter-cancel-qa.md). Never point this at a
 * shared database.
 */
import { execFileSync } from 'child_process';
import type { FullConfig } from '@playwright/test';
import laneTreeGuard from './lane-tree-guard';

// OBRS-844: see obrs766-seed.ts — same override, same default.
const DB = process.env['OBRS_QA_DB'] ?? 'obrs766qa';
const PRESERVED_BOOKING_IDS = 2;

export default function globalSetup(config: FullConfig): void {
  // OBRS-1616: this lane owns the one globalSetup slot, so the tree guard is CALLED here
  // rather than wired as the entry point (same shape as e2e/global-setup.ts). It runs
  // BEFORE the wipe below: refusing after cancelling a database's bookings would leave
  // the operator's stack changed by a run that never started.
  laneTreeGuard(config);

  const sql = `
    UPDATE tickets SET status_id =
      (SELECT id FROM lookups WHERE category='ticket_status' AND slug='cancelled')
    WHERE booking_id > ${PRESERVED_BOOKING_IDS};
    UPDATE bookings SET status_id =
      (SELECT id FROM lookups WHERE category='booking_status' AND slug='cancelled')
    WHERE id > ${PRESERVED_BOOKING_IDS};
  `;

  try {
    execFileSync('psql', ['-U', 'postgres', '-h', 'localhost', '-d', DB, '-c', sql], {
      env: { ...process.env, PGPASSWORD: process.env['PGPASSWORD'] ?? 'P@ssw0rd' },
      stdio: 'pipe',
    });
  } catch (err) {
    // Fail loudly. A silent skip here reappears later as
    // BOOKING_ERROR_SEATS_INSUFFICIENT inside an unrelated-looking assertion.
    throw new Error(
      `OBRS-766 global setup could not free seat inventory in "${DB}" — is the local ` +
        `Postgres up and is psql on PATH? Original error: ${(err as Error).message}`,
    );
  }
}
