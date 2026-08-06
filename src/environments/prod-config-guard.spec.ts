import { assertProdConfig, ProdCheckedConfig, ProdConfigError } from './prod-config-guard';

// OBRS-390. Every case below asserts on the THROW, not on the guard's existence —
// a gate that is only declared can be a silent no-op (OBRS-449, OBRS-419).
//
// OBRS-946 — AND EVERY FIXTURE HERE MUST BE A SHAPE THAT REALLY EXISTS.
// This suite was fully green while the guard rejected the only Omise key we own,
// because the "valid" fixture was invented (`pkey_live_abcdefghijklmnop`, 16 chars of
// alphabet after a prefix Omise has never issued). It proved the guard agreed with the
// fixture; the fixture was written from the same wrong assumption as the guard, so
// there was nothing left to falsify it. A fixture is a claim about the outside world,
// and one nobody measured is worth exactly as much as the guess it came from.
//
// The keys below are therefore observed values, not plausible ones:
//   LIVE_KEY — the shape on the prod VM: `pkey_` + 19 chars, no environment segment.
//              That key took a real 20.00 THB charge (chrg_68iydxbsxsugso4ycv4, Paid
//              in the LIVE dashboard), which is the proof it is a live key — the
//              prefix could not have told us, because there is nothing in it to read.
//   TEST_KEY — copied from environment.base.ts, where it is committed.
// Their ids are the same 19 characters wide; the ONLY difference between a test key
// and a live one is the `test_` segment the live key does not carry.

/** The live-key shape measured on the prod VM. Not a live key of ours — a real id would be. */
const LIVE_KEY = 'pkey_1a2b3c4d5e6f7g8h9i0';
/** Verbatim from environment.base.ts. */
const TEST_KEY = 'pkey_test_5rd059u8cgynfe12lds';
/**
 * A well-formed PromptPay id that belongs to nobody — the fixture only has to be
 * "not the environment.base.ts placeholder" for the guard to accept it.
 * OBRS-1094: this used to be a team developer's real mobile number, in a PUBLIC
 * repo. A fixture never needs a real one.
 */
const FIXTURE_PROMPTPAY_ID = '0800000000';

function validProdConfig(overrides: Partial<ProdCheckedConfig> = {}): ProdCheckedConfig {
  return {
    production: true,
    apiUrl: 'https://obrs.example.com',
    omisePublicKey: LIVE_KEY,
    useMockPayments: false,
    useDevApiEndpoints: false,
    promptpay: { id: FIXTURE_PROMPTPAY_ID },
    ...overrides,
  };
}

describe('assertProdConfig', () => {
  it('accepts a fully configured prod bundle', () => {
    expect(() => assertProdConfig(validProdConfig())).not.toThrow();
  });

  describe('when production is false', () => {
    // The dev/sit/test builds all inherit environment.base.ts, which legitimately
    // carries the pkey_test_ key and the localhost apiUrl. If the guard fired on
    // those, `ng test` and `npm start` would both be dead on arrival.
    it('ignores config that would be fatal in prod', () => {
      const devLike: ProdCheckedConfig = {
        production: false,
        apiUrl: 'http://localhost:8080',
        omisePublicKey: TEST_KEY,
        useMockPayments: true,
        useDevApiEndpoints: true,
        promptpay: { id: '0123456789' },
      };

      expect(() => assertProdConfig(devLike)).not.toThrow();
    });
  });

  describe('omisePublicKey', () => {
    // OBRS-946's regression test, and the one case the old suite could not have had:
    // this is the value that was failing in production. `pkey_live_` was asserted for
    // months against a string Omise has never put on a key, so the gate rejected the
    // correct value — the prod build exited 1 and the bundle refused to boot.
    it('accepts a live key, which carries NO environment segment at all', () => {
      expect(LIVE_KEY.length).toBe(24);
      expect(LIVE_KEY).not.toContain('live');
      expect(() => assertProdConfig(validProdConfig({ omisePublicKey: LIVE_KEY }))).not.toThrow();
    });

    // The two shapes differ by the `test_` segment and nothing else — same prefix,
    // same 19-char id width. A rule that cannot separate these two is the whole job.
    it('separates the live and test keys, whose ids are the same width', () => {
      expect(TEST_KEY.replace('test_', '').length).toBe(LIVE_KEY.length);
    });

    it('rejects the pkey_test_ key committed in environment.base.ts', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ omisePublicKey: TEST_KEY })),
      ).toThrowMatching(
        (e: ProdConfigError) =>
          e instanceof ProdConfigError && /omisePublicKey is not a live/.test(e.message),
      );
    });

    // The fixture this suite used to call valid. Keeping it as a REJECT case is what
    // stops the old assertion being reintroduced: any rule that admits this one is
    // describing our imagination rather than Omise.
    it('rejects the invented pkey_live_ shape Omise does not issue', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ omisePublicKey: 'pkey_live_abcdefghijklmnop' })),
      ).toThrowError(ProdConfigError);
    });

    // Truncation on paste is the realistic way a correct key arrives wrong, and length
    // is the only thing that separates it from a valid one.
    it('rejects a live key one character short', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ omisePublicKey: LIVE_KEY.slice(0, -1) })),
      ).toThrowError(ProdConfigError);
    });

    it('rejects an empty key', () => {
      expect(() => assertProdConfig(validProdConfig({ omisePublicKey: '' }))).toThrowError(
        ProdConfigError,
      );
    });

    // The reason the check stayed an allowlist after OBRS-946 rather than becoming a
    // `!startsWith('pkey_test_')` denylist: a denylist waves this straight through.
    // A live secret key has the same length and charset as a live public key, so the
    // prefix is the only thing separating "publishable by design" from "hands anyone
    // who opens devtools the ability to move our money".
    it('rejects a SECRET key pasted in where the public key belongs', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ omisePublicKey: 'skey_live_abcdefghijklmnop' })),
      ).toThrowError(ProdConfigError);
    });

    it('does not echo the whole key into the message', () => {
      let message = '';
      try {
        assertProdConfig(validProdConfig({ omisePublicKey: 'skey_live_supersecretvalue' }));
      } catch (e) {
        message = (e as Error).message;
      }

      expect(message).toContain('skey_live_');
      expect(message).not.toContain('supersecretvalue');
    });
  });

  describe('useMockPayments', () => {
    it('rejects true — the flow would issue free tickets', () => {
      expect(() => assertProdConfig(validProdConfig({ useMockPayments: true }))).toThrowMatching(
        (e: ProdConfigError) => /useMockPayments is not false/.test(e.message),
      );
    });
  });

  describe('useDevApiEndpoints', () => {
    it('rejects true — the /test endpoints only exist under the backend dev profile', () => {
      expect(() => assertProdConfig(validProdConfig({ useDevApiEndpoints: true }))).toThrowMatching(
        (e: ProdConfigError) => /useDevApiEndpoints is not false/.test(e.message),
      );
    });
  });

  describe('apiUrl', () => {
    it('rejects the environment.base.ts localhost default', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ apiUrl: 'http://localhost:8080' })),
      ).toThrowMatching((e: ProdConfigError) => /apiUrl is not https/.test(e.message));
    });

    it('rejects plain http', () => {
      expect(() => assertProdConfig(validProdConfig({ apiUrl: 'http://obrs.example.com' }))).toThrowError(
        ProdConfigError,
      );
    });
  });

  describe('promptpay.id', () => {
    it('rejects the environment.base.ts placeholder', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ promptpay: { id: '0123456789' } })),
      ).toThrowMatching((e: ProdConfigError) => /promptpay\.id is still/.test(e.message));
    });

    it('rejects an empty id', () => {
      expect(() => assertProdConfig(validProdConfig({ promptpay: { id: '' } }))).toThrowError(
        ProdConfigError,
      );
    });
  });

  // The realistic prod mistake is not one wrong field — it is `environment.sit.ts`
  // copied as a template, which carries every base default at once. One message
  // has to name all of them, or the operator fixes one and rebuilds five times.
  it('reports every failure at once, not just the first', () => {
    let message = '';
    try {
      assertProdConfig({
        production: true,
        apiUrl: 'http://localhost:8080',
        omisePublicKey: TEST_KEY,
        useMockPayments: true,
        useDevApiEndpoints: true,
        promptpay: { id: '0123456789' },
      });
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain('omisePublicKey');
    expect(message).toContain('useMockPayments');
    expect(message).toContain('useDevApiEndpoints');
    expect(message).toContain('apiUrl');
    expect(message).toContain('promptpay.id');
  });

  it('points at the runbook and the file that produced the values', () => {
    let message = '';
    try {
      assertProdConfig(validProdConfig({ useMockPayments: true }));
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain('environment.prod.local.ts');
    expect(message).toContain('inject-prod-env.js');
    expect(message).toContain('RUNBOOK-OBRS-390-prod-frontend-config.md');
  });
});
