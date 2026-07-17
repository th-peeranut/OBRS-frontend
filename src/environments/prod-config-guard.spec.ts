import { assertProdConfig, ProdCheckedConfig, ProdConfigError } from './prod-config-guard';

// OBRS-390. Every case below asserts on the THROW, not on the guard's existence —
// a gate that is only declared can be a silent no-op (OBRS-449, OBRS-419).

function validProdConfig(overrides: Partial<ProdCheckedConfig> = {}): ProdCheckedConfig {
  return {
    production: true,
    apiUrl: 'https://obrs.example.com',
    omisePublicKey: 'pkey_live_abcdefghijklmnop',
    useMockPayments: false,
    useDevApiEndpoints: false,
    promptpay: { id: '0850951898' },
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
        omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds',
        useMockPayments: true,
        useDevApiEndpoints: true,
        promptpay: { id: '0123456789' },
      };

      expect(() => assertProdConfig(devLike)).not.toThrow();
    });
  });

  describe('omisePublicKey', () => {
    it('rejects the pkey_test_ key committed in environment.base.ts', () => {
      expect(() =>
        assertProdConfig(validProdConfig({ omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds' })),
      ).toThrowMatching(
        (e: ProdConfigError) =>
          e instanceof ProdConfigError && /omisePublicKey is not a live/.test(e.message),
      );
    });

    it('rejects an empty key', () => {
      expect(() => assertProdConfig(validProdConfig({ omisePublicKey: '' }))).toThrowError(
        ProdConfigError,
      );
    });

    // The reason the check is a `pkey_live_` allowlist and not a `pkey_test_`
    // denylist: a denylist would wave this straight through.
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
        omisePublicKey: 'pkey_test_5rd059u8cgynfe12lds',
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
