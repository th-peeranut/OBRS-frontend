import { isTrustedPaymentRedirect, paymentRedirectOriginForLog } from './payment-redirect';

describe('isTrustedPaymentRedirect (security review 2026-09, M4)', () => {
  describe('accepts', () => {
    it('the 3-D Secure / internet-banking authorize page on pay.omise.co', () => {
      expect(
        isTrustedPaymentRedirect('https://pay.omise.co/payments/pay2_test/authorize'),
      ).toBeTrue();
    });

    it('the older authorize URL shape on api.omise.co', () => {
      expect(
        isTrustedPaymentRedirect('https://api.omise.co/payments/paym_test/authorize'),
      ).toBeTrue();
    });

    it('the SIT mock fixtures the backend returns for PromptPay and bank transfer', () => {
      expect(
        isTrustedPaymentRedirect('https://api.omise.co/charges/chrg_test/documents/qrcode.png'),
      ).toBeTrue();
      expect(
        isTrustedPaymentRedirect('https://pay.omise.co/internetbanking/mock/chrg_test'),
      ).toBeTrue();
    });

    it('host matching regardless of case', () => {
      expect(isTrustedPaymentRedirect('https://PAY.OMISE.CO/x')).toBeTrue();
    });
  });

  describe('refuses', () => {
    it('an unrelated https host', () => {
      expect(
        isTrustedPaymentRedirect('https://should-not-be-visited.example/authorize'),
      ).toBeFalse();
    });

    it('other omise.co hosts - the apex, the dashboard, hosted payment links', () => {
      expect(isTrustedPaymentRedirect('https://omise.co/anything')).toBeFalse();
      expect(isTrustedPaymentRedirect('https://dashboard.omise.co/')).toBeFalse();
      expect(isTrustedPaymentRedirect('https://links.omise.co/some-merchant')).toBeFalse();
    });

    it('a look-alike host that merely contains an allowed host', () => {
      expect(isTrustedPaymentRedirect('https://pay.omise.co.evil.example/')).toBeFalse();
      expect(isTrustedPaymentRedirect('https://notpay.omise.co/')).toBeFalse();
      expect(isTrustedPaymentRedirect('https://pay.omise.co.')).toBeFalse();
    });

    it('an allowed host on a non-default port', () => {
      expect(isTrustedPaymentRedirect('https://pay.omise.co:8443/authorize')).toBeFalse();
    });

    it('an allowed host over plain http', () => {
      expect(isTrustedPaymentRedirect('http://pay.omise.co/authorize')).toBeFalse();
    });

    it("the app's own origin (nothing legitimate redirects there)", () => {
      expect(isTrustedPaymentRedirect('https://nj-phuyaipu.com/payment/result')).toBeFalse();
      expect(
        isTrustedPaymentRedirect(`${window.location.origin}/payment/result`),
      ).toBeFalse();
    });

    it('userinfo, backslash and percent-encoding tricks around an allowed host', () => {
      expect(isTrustedPaymentRedirect('https://pay.omise.co@evil.example/')).toBeFalse();
      expect(isTrustedPaymentRedirect('https://evil.example\\@pay.omise.co/')).toBeFalse();
      expect(isTrustedPaymentRedirect('https://pay.omise.co%2Eevil.example/')).toBeFalse();
    });

    it('non-https schemes, including wallet deep links and javascript:', () => {
      expect(isTrustedPaymentRedirect('truemoney://payment?ref=x')).toBeFalse();
      expect(isTrustedPaymentRedirect('javascript:alert(1)')).toBeFalse();
      expect(isTrustedPaymentRedirect('data:text/html,hi')).toBeFalse();
    });

    it('relative paths and scheme-less values', () => {
      expect(isTrustedPaymentRedirect('/payment/result')).toBeFalse();
      expect(isTrustedPaymentRedirect('//pay.omise.co/authorize')).toBeFalse();
      expect(isTrustedPaymentRedirect('pay.omise.co/authorize')).toBeFalse();
    });

    it('empty, null and undefined', () => {
      expect(isTrustedPaymentRedirect('')).toBeFalse();
      expect(isTrustedPaymentRedirect(null)).toBeFalse();
      expect(isTrustedPaymentRedirect(undefined)).toBeFalse();
    });
  });
});

describe('paymentRedirectOriginForLog', () => {
  it('keeps the origin and drops the path that carries the payment token', () => {
    expect(
      paymentRedirectOriginForLog('https://evil.example/payments/pay2_secret/authorize?x=1'),
    ).toBe('https://evil.example');
  });

  it('never throws on garbage', () => {
    expect(paymentRedirectOriginForLog('not a url')).toBe('(unparseable)');
    expect(paymentRedirectOriginForLog('')).toBe('(empty)');
    expect(paymentRedirectOriginForLog(undefined)).toBe('(empty)');
  });
});
