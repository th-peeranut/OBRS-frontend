import {
  CARD_ENTRY_CANCELLED,
  OmiseTokenService,
  isCardEntryCancelled,
  resolveOmiseLocale,
} from './omise-token.service';

/**
 * OBRS-391 — OmiseTokenService now drives Omise's hosted card dialog instead of
 * tokenizing a PAN this app was holding.
 *
 * `window.OmiseCard` is stubbed rather than loaded: the real object is created by a
 * script fetched from cdn.omise.co, and `loadScript()` returns immediately when the
 * global already exists, so a stub exercises every line that matters without a
 * network call. What the stub CANNOT prove is the callback ORDERING inside the real
 * bundle — that was read out of OmiseJs v2.16.0 directly (see the service header) and
 * is re-stated as a test here so the assumption is written down somewhere that fails
 * if it stops holding.
 */
describe('OmiseTokenService (OBRS-391)', () => {
  let service: OmiseTokenService;
  let configureCalls: unknown[];
  let openConfigs: Record<string, unknown>[];
  let openResult: boolean | void;

  const installStub = (): void => {
    window.OmiseCard = {
      configure: (config) => {
        configureCalls.push(config);
      },
      open: (config) => {
        openConfigs.push(config as unknown as Record<string, unknown>);
        return openResult;
      },
      close: () => undefined,
    };
  };

  beforeEach(() => {
    service = new OmiseTokenService();
    configureCalls = [];
    openConfigs = [];
    openResult = undefined;
    installStub();
  });

  afterEach(() => {
    delete window.OmiseCard;
  });

  /** The callbacks the service handed to `open()` on its most recent call. */
  const lastConfig = () => openConfigs[openConfigs.length - 1];
  const fireSuccess = (nonce: string): void =>
    (lastConfig()['onCreateTokenSuccess'] as (n: string) => void)(nonce);
  const fireClosed = (): void => (lastConfig()['onFormClosed'] as () => void)();

  it('configures OmiseCard once and resolves with the token the iframe posts back', async () => {
    const pending = service.requestCardToken({ language: 'th', amountSubunits: 123450, currency: 'THB' });
    await Promise.resolve();

    expect(configureCalls.length).toBe(1);
    fireSuccess('tokn_test_12345');

    await expectAsync(pending).toBeResolvedTo('tokn_test_12345');

    // A second payment must NOT re-configure: configure() also builds the iframe, so
    // calling it per payment leaks one iframe into document.body every time.
    const second = service.requestCardToken({ language: 'th', amountSubunits: 123450, currency: 'THB' });
    await Promise.resolve();
    expect(configureCalls.length).toBe(1);
    fireSuccess('tokn_test_67890');
    await expectAsync(second).toBeResolvedTo('tokn_test_67890');
  });

  it('asks for card only, forwards the submit label, and never sets customCardForm', async () => {
    const pending = service.requestCardToken({ language: 'th', submitLabel: 'ชำระเงิน', amountSubunits: 123450, currency: 'THB' });
    await Promise.resolve();

    expect(lastConfig()['defaultPaymentMethod']).toBe('credit_card');
    expect(lastConfig()['otherPaymentMethods']).toBe('');
    // Both measured on the real dialog during this card's evidence capture, not
    // assumed: with no amount Omise's button reads "Pay 0.00 THB", and a
    // submitLabel PREFIXES that rather than replacing it ("ชำระเงิน 0.00 THB").
    // So the label alone is not enough — the amount has to be real, and it has to
    // arrive in satang.
    expect(lastConfig()['submitLabel']).toBe('ชำระเงิน');
    expect(lastConfig()['amount']).toBe(123450);
    expect(lastConfig()['currency']).toBe('THB');
    // customCardForm is the option that puts a merchant-hosted card form back in front
    // of OmiseCard and silently restores SAQ A-EP scope. It must never appear.
    expect(lastConfig()['customCardForm']).toBeUndefined();

    fireSuccess('tokn_x');
    await expectAsync(pending).toBeResolved();
  });

  it('rejects with the cancelled marker when the passenger closes the dialog', async () => {
    const pending = service.requestCardToken({ language: 'th', amountSubunits: 123450, currency: 'THB' });
    await Promise.resolve();

    fireClosed();

    await expectAsync(pending).toBeRejected();
    await pending.catch((error: unknown) => {
      expect(isCardEntryCancelled(error)).toBeTrue();
      expect((error as Error).message).toBe(CARD_ENTRY_CANCELLED);
    });
  });

  it('treats a success followed by the close callback as a SUCCESS, not a cancellation', async () => {
    // The real bundle runs `close(); setTokenAtOmiseTokenField(token)` on a successful
    // payment — close() only schedules a 250 ms timer, so the success callback lands
    // first and clears the config the timer would have read onFormClosed from. This
    // pins the consequence rather than the mechanism: if a CDN push ever reorders
    // those two lines, the latch below is what stops every completed payment from
    // reporting itself as cancelled, and this test is what stops the latch being
    // "simplified" away.
    const pending = service.requestCardToken({ language: 'th', amountSubunits: 123450, currency: 'THB' });
    await Promise.resolve();

    fireSuccess('tokn_test_ordering');
    fireClosed();

    await expectAsync(pending).toBeResolvedTo('tokn_test_ordering');
  });

  it('rejects a non-card nonce instead of sending it as a cardToken', async () => {
    // `src_...` is what a non-card method produces. The backend would take it as a
    // card token and fail server-side with nothing on screen explaining why.
    const pending = service.requestCardToken({ language: 'th', amountSubunits: 123450, currency: 'THB' });
    await Promise.resolve();

    fireSuccess('src_test_promptpay');

    await expectAsync(pending).toBeRejected();
    await pending.catch((error: unknown) => {
      expect(isCardEntryCancelled(error)).toBeFalse();
    });
  });

  it('rejects rather than hanging when OmiseCard refuses to open', async () => {
    // `open()` answers false when no iframe exists. An unsettled promise here would
    // leave the pay button disabled forever with no error anywhere — a hang, which is
    // strictly harder to notice than a failure.
    openResult = false;

    await expectAsync(service.requestCardToken({ language: 'th', amountSubunits: 123450, currency: 'THB' })).toBeRejected();
  });

  it('sends Thai to the dialog and omits the locale for anything Omise does not ship', () => {
    // Omise's hosted form ships en/ja/th. `zh` is a language this app supports and
    // Omise does not, so guessing at it on the money path is not worth the risk —
    // undefined means "take Omise's default".
    expect(resolveOmiseLocale('th')).toBe('th');
    expect(resolveOmiseLocale('th-TH')).toBe('th');
    expect(resolveOmiseLocale('en')).toBeUndefined();
    expect(resolveOmiseLocale('zh')).toBeUndefined();
    expect(resolveOmiseLocale(null)).toBeUndefined();
    expect(resolveOmiseLocale(undefined)).toBeUndefined();
  });

  it('isCardEntryCancelled does not mistake an ordinary failure for a cancellation', () => {
    expect(isCardEntryCancelled(new Error(CARD_ENTRY_CANCELLED))).toBeTrue();
    expect(isCardEntryCancelled(new Error('OmiseCard failed to load'))).toBeFalse();
    expect(isCardEntryCancelled(CARD_ENTRY_CANCELLED)).toBeFalse();
    expect(isCardEntryCancelled(null)).toBeFalse();
  });
});
