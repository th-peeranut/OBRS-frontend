// OBRS-1343 — the money half of the fix, proven rather than reasoned about.
//
// Finding the return rounds is only half the card. `BookingService.verifyBookingComponents`
// validates EACH leg's own `fromStop`/`toStop` against `segments`, and
// `SegmentService#getPricePerSeatBy` THROWS on a missing fare — so a client that keeps
// mirroring the outbound pair for the return leg now offers a trip it cannot sell, and the
// customer meets the failure at payment, after filling in every passenger (the V74 shape).
//
// This posts the same round trip twice against the live stack and records both outcomes:
//   A. `fromStop = ds293_chatuchak_bus_stop` — the stop the search actually ran from, which
//      is what `passenger-info.component.ts` now sends. Must create a booking.
//   B. `fromStop = bts_mo_chit` — the old mirror. Must be REFUSED, and that refusal is the
//      reason the client change is not optional.
//
//   CAPTURE_API=http://localhost:8080 CAPTURE_OUT=<dir> node e2e/scripts/verify-obrs1343-booking.js
//
// Nothing here prints the access token.
const fs = require('fs');
const path = require('path');

const API = process.env.CAPTURE_API || 'http://localhost:8080';
const OUT = process.env.CAPTURE_OUT || __dirname;
const EMAIL = process.env.CAPTURE_EMAIL || 'customer@system.local';
const PASSWORD = process.env.CAPTURE_PASSWORD || 'P@ssw0rd';

const FROM_SLUG = 'nong_chak';
const TO_SLUG = 'bts_mo_chit';
const OUTBOUND_DAY_OFFSET = 5;
const RETURN_DAY_OFFSET = 6;

const log = [];
const say = (m) => {
  console.log(m);
  log.push(m);
};

function bangkokDatePlus(days) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  now.setDate(now.getDate() + days);
  return now.toISOString().slice(0, 10);
}

async function post(pathname, body, token) {
  const res = await fetch(API + pathname, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'th',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const passenger = (seatNumber) => ({
  passengerType: 'male',
  seatNumber,
  title: 'mr',
  firstName: 'Obrs',
  lastName: 'Onethreefourthree',
  fareCategory: 'adult',
});

const contact = {
  title: 'mr',
  firstName: 'Obrs',
  lastName: 'Onethreefourthree',
  phoneNumber: '0812345678',
  email: EMAIL,
  preferredLocale: 'th',
};

(async () => {
  const departureDate = bangkokDatePlus(OUTBOUND_DAY_OFFSET);
  const returnDate = bangkokDatePlus(RETURN_DAY_OFFSET);

  const search = await post('/api/schedules/search', {
    bookingType: 'return',
    numberOfPassengers: 1,
    fromStop: FROM_SLUG,
    toStop: TO_SLUG,
    departureDate,
    returnDate,
  });
  const data = search.json?.data ?? {};
  const outbound = (data.departureSchedules ?? [])[0];
  const inbound = (data.arrivalSchedules ?? [])[0];
  const boarding = data.returnBoardingStop;
  if (!outbound || !inbound || !boarding) {
    throw new Error('the search must return both legs and a boarding stop before this can run');
  }
  say(`search: outbound #${outbound.id}, return #${inbound.id}, boarding ${boarding.slug} (${boarding.distanceMeters} m)`);

  const auth = await post('/api/auth/login', { email: EMAIL, password: PASSWORD });
  const token = auth.json?.data?.accessToken;
  if (!token) {
    throw new Error(`login failed (${auth.status})`);
  }
  say(`logged in as ${EMAIL}`);

  const total = Number(outbound.pricePerSeat) + Number(inbound.pricePerSeat);

  const bookingWith = (returnFromStop, seat) => ({
    bookingType: 'return',
    totalAmount: total,
    bookingChannel: 'online',
    contact,
    departureSchedule: {
      scheduleId: outbound.id,
      fromStop: FROM_SLUG,
      toStop: TO_SLUG,
      departureDateTime: outbound.departureDateTime,
      arrivalDateTime: outbound.arrivalDateTime,
      passengers: [passenger(seat)],
    },
    arrivalSchedule: {
      scheduleId: inbound.id,
      fromStop: returnFromStop,
      toStop: FROM_SLUG,
      departureDateTime: inbound.departureDateTime,
      arrivalDateTime: inbound.arrivalDateTime,
      passengers: [passenger(seat)],
    },
    pdpaConsentVersion: '2026-07-01',
    bookingPolicyVersion: '2026-07-01',
  });

  const resolved = await post('/api/private/bookings', bookingWith(boarding.slug, 'A1'), token);
  say(`A. return leg from ${boarding.slug} (what the client now sends) -> ${resolved.status} ${
    resolved.status === 200 || resolved.status === 201
      ? `booking ${resolved.json?.data?.bookingNumber ?? '(created)'}`
      : JSON.stringify(resolved.json)
  }`);

  const mirrored = await post('/api/private/bookings', bookingWith(TO_SLUG, 'A2'), token);
  say(`B. return leg from ${TO_SLUG} (the old mirror)              -> ${mirrored.status} ${
    mirrored.status === 200 || mirrored.status === 201
      ? `booking ${mirrored.json?.data?.bookingNumber ?? '(created)'} <- UNEXPECTED`
      : JSON.stringify(mirrored.json)
  }`);

  fs.writeFileSync(
    path.join(OUT, 'probe-booking.json'),
    JSON.stringify(
      {
        departureDate,
        returnDate,
        boardingStop: boarding,
        resolvedLeg: { fromStop: boarding.slug, status: resolved.status, body: resolved.json },
        mirroredLeg: { fromStop: TO_SLUG, status: mirrored.status, body: mirrored.json },
      },
      null,
      2
    ) + '\n'
  );
  fs.writeFileSync(path.join(OUT, 'verify-booking-log.txt'), log.join('\n') + '\n');
  say('done');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
