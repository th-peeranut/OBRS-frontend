/**
 * OBRS-766 QA verification — self-seeding fixtures for the counter-cancel spec pair
 * (obrs766-counter-cancel.spec.ts, obrs766-primary-flow.spec.ts).
 *
 * Each helper below creates its OWN fresh booking through the real API (walk-in cash
 * sell) so a destructive test — one that actually cancels a booking — is re-runnable:
 * it never depends on a booking a PREVIOUS run already consumed. `setPaymentMethod`
 * shells out to `psql` because there is no API path to mark a booking paid by
 * bank_transfer/card/promptpay without a real gateway; this is the same one-line
 * technique used when these fixtures were first hand-seeded for this QA session (see
 * docs/sessions/SESSION-OBRS-766-counter-cancel-qa.md).
 *
 * Requires the local stack from that session doc: backend on :8080 against the
 * isolated `obrs766qa` Postgres DB, `psql` on PATH, local Postgres password
 * `P@ssw0rd` (matches `scripts/new-local-db.ps1`'s default).
 */
import { execFileSync } from 'child_process';

const API = 'http://localhost:8080';
const DB = 'obrs766qa';
const DB_PASSWORD = 'P@ssw0rd';

// Route 1 (chonburi_bangkok) and route 2 (bangkok_chonburi) both run on
// schedule ids 1/2, Dec 2026 — far outside the 2h cancel window, so any
// booking sold here needs a SEPARATE window-closed override (see
// seedWindowClosedBooking). Alternating scheduleId per call spreads seat
// consumption across both directions instead of exhausting one.
let scheduleToggle = 1;

function psqlExec(sql: string): void {
  execFileSync('psql', ['-U', 'postgres', '-h', 'localhost', '-d', DB, '-c', sql], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
    stdio: 'pipe',
  });
}

function psqlQuery(sql: string): string {
  return execFileSync('psql', ['-U', 'postgres', '-h', 'localhost', '-d', DB, '-t', '-A', '-c', sql], {
    env: { ...process.env, PGPASSWORD: DB_PASSWORD },
  }).toString().trim();
}

async function apiCall(method: string, path: string, token?: string, body?: unknown, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

export async function loginApi(email: string, password = 'P@ssw0rd'): Promise<string> {
  const { status, json } = await apiCall('POST', '/api/auth/login', undefined, { email, password });
  if (status !== 200) throw new Error(`login failed for ${email}: ${status} ${JSON.stringify(json)}`);
  return (json as any).data.accessToken;
}

let seatCounter = 0;

/** Sells a fresh walk-in CASH booking on a far-future (Dec 2026) schedule and
 * settles it immediately — CONFIRMED with a real cash payment, ready for a
 * cancel test to consume. `seat` is picked from an incrementing pool per
 * process run so repeated calls in the same test run don't collide (seats
 * freed by an earlier cancel in the SAME run are not reused, to keep this
 * simple and avoid a stale-availableSeats race). */
export async function sellWalkInCash(token: string, lastName: string, phone: string): Promise<{ bookingId: number; bookingNumber: string }> {
  const scheduleId = scheduleToggle;
  scheduleToggle = scheduleToggle === 1 ? 2 : 1;
  seatCounter += 1;
  const seat = String(seatCounter);
  const [fromStop, toStop, dep, arr, price] = scheduleId === 1
    ? ['nong_chak', 'mo_chit_2_bus_terminal', '2026-12-20T01:00:00Z', '2026-12-20T03:30:00Z', 200]
    : ['mo_chit_2_bus_terminal', 'nong_chak', '2026-12-20T04:00:00Z', '2026-12-20T06:00:00Z', 180];

  const body = {
    bookingType: 'one_way',
    totalAmount: price,
    bookingChannel: 'walk_in',
    departureSchedule: {
      scheduleId,
      fromStop,
      toStop,
      departureDateTime: dep,
      arrivalDateTime: arr,
      passengers: [{ passengerType: 'male', title: 'Mr', firstName: 'QA766', lastName, seatNumber: seat, phoneNumber: phone }],
    },
    contact: { title: 'Mr', firstName: 'QA766', lastName, phoneNumber: phone, email: `qa766-${lastName.toLowerCase()}-${Date.now()}@example.com`, preferredLocale: 'th' },
  };

  const create = await apiCall('POST', '/api/private/bookings', token, body);
  if (create.status !== 201) throw new Error(`sellWalkInCash create failed: ${create.status} ${JSON.stringify(create.json)}`);
  const bookingId = (create.json as any).data.bookingId as number;
  const bookingNumber = (create.json as any).data.bookingNumber as string;

  const pay = await apiCall('POST', '/api/private/payments/walk-in', token, { bookingId, paymentMethod: 'cash' }, { 'Idempotency-Key': `qa766-${bookingId}-${Date.now()}` });
  if (pay.status !== 200) throw new Error(`sellWalkInCash pay failed: ${pay.status} ${JSON.stringify(pay.json)}`);

  return { bookingId, bookingNumber };
}

/** Flips the booking's single payment row to a non-cash method (SQL — no API
 * path exists to settle a real bank_transfer/card/promptpay payment without
 * a gateway). `slug` must be a `payment_method` lookup slug. */
export function setPaymentMethod(bookingId: number, slug: 'bank_transfer' | 'card' | 'qr_promptpay'): void {
  psqlExec(
    `UPDATE payments SET method_id = (SELECT id FROM lookups WHERE category='payment_method' AND slug='${slug}') WHERE booking_id = ${bookingId};`
  );
}

/** Sells a fresh CASH booking, then retargets its booking_schedules row to
 * depart `minutesFromNow` minutes out (SQL — the seeded schedule cluster
 * starts December 2026, so no schedule naturally departs "soon"; this is
 * the same technique used to build the very first window-closed fixture in
 * this QA session). Returns the booking so the caller can assert the exact
 * remaining time is still < 2h at call time. */
export async function sellAndRetargetDeparture(token: string, lastName: string, phone: string, minutesFromNow: number): Promise<{ bookingId: number; bookingNumber: string }> {
  const booking = await sellWalkInCash(token, lastName, phone);
  psqlExec(
    `UPDATE booking_schedules SET departure_date_time = now() + interval '${minutesFromNow} minutes', arrival_date_time = now() + interval '${minutesFromNow + 90} minutes' WHERE booking_id = ${booking.bookingId};`
  );
  return booking;
}

/** Minutes remaining until this booking's earliest departure — read straight
 * from the DB so a caller can assert the window-closed fixture genuinely
 * still departs within 2h right before driving the UI against it, rather
 * than trusting a value computed earlier in a possibly-slow test run. */
export function minutesUntilDeparture(bookingId: number): number {
  const raw = psqlQuery(
    `SELECT EXTRACT(EPOCH FROM (departure_date_time - now())) / 60 FROM booking_schedules WHERE booking_id = ${bookingId};`
  );
  return Number(raw);
}

/** Clones DRV-FIXTURE-1's shape (actor = customer@system.local, NO payment
 * row, so the cancellation policy always resolves MANUAL_REFUND_REQUIRED) as
 * a fresh row with a unique booking_number, so the customer self-cancel
 * regression test never depends on — or exhausts — the one pre-seeded row.
 * Pure SQL: there is no "book online, skip payment" API path a customer can
 * legally reach. */
export function seedCustomerBookingNoPayment(): { bookingNumber: string } {
  const bookingNumber = `B-QA766-${Date.now().toString(36).toUpperCase()}`;
  psqlExec(`
    INSERT INTO bookings (
      contact_id, actor_id, status_id, booking_type_id, booking_channel_id,
      booking_number, total_amount, net_amount, booking_kind,
      contact_name_snapshot, contact_phone_snapshot, contact_email_snapshot,
      expires_at, created_by, updated_by
    )
    SELECT
      b.contact_id, b.actor_id, b.status_id, b.booking_type_id, b.booking_channel_id,
      '${bookingNumber}', b.total_amount, b.net_amount, b.booking_kind,
      b.contact_name_snapshot, b.contact_phone_snapshot, b.contact_email_snapshot,
      b.expires_at, 'qa766-seed', 'qa766-seed'
    FROM bookings b WHERE b.booking_number = 'DRV-FIXTURE-1';

    INSERT INTO booking_schedules (
      booking_id, schedule_id, from_stop_id, to_stop_id, leg_type_id,
      departure_date_time, arrival_date_time, created_by, updated_by
    )
    SELECT
      (SELECT id FROM bookings WHERE booking_number = '${bookingNumber}'),
      bs.schedule_id, bs.from_stop_id, bs.to_stop_id, bs.leg_type_id,
      bs.departure_date_time, bs.arrival_date_time, 'qa766-seed', 'qa766-seed'
    FROM booking_schedules bs
    JOIN bookings b ON b.id = bs.booking_id
    WHERE b.booking_number = 'DRV-FIXTURE-1';
  `);
  return { bookingNumber };
}
