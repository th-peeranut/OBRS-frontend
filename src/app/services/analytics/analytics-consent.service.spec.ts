import { TestBed } from '@angular/core/testing';
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  AnalyticsConsentService,
} from './analytics-consent.service';

/**
 * OBRS-867. The load-bearing assertion in this file is the negative one: there
 * must be no input — absent, corrupt, or hostile — that resolves to `granted`
 * without the visitor having pressed accept.
 */
describe('AnalyticsConsentService', () => {
  function build(): AnalyticsConsentService {
    // The stored value is read in the constructor, so the service has to be
    // built AFTER localStorage is arranged, not in a shared beforeEach.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(AnalyticsConsentService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('the default is silence', () => {
    it('is "unset" when nothing has been stored', () => {
      const service = build();

      expect(service.decision).toBe('unset');
      expect(service.isGranted).toBe(false);
    });

    it('is "unset" — never "granted" — for any value it did not write itself', () => {
      const hostileValues = ['true', 'yes', '1', 'GRANTED', '', '{"decision":"granted"}'];

      for (const value of hostileValues) {
        localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, value);
        const service = build();

        expect(service.decision)
          .withContext(`stored value ${JSON.stringify(value)}`)
          .toBe('unset');
        expect(service.isGranted).toBe(false);
      }
    });

    it('is "unset" when localStorage cannot be read at all', () => {
      spyOn(Storage.prototype, 'getItem').and.throwError('SecurityError');

      const service = build();

      expect(service.decision).toBe('unset');
      expect(service.isGranted).toBe(false);
    });
  });

  describe('recording an answer', () => {
    it('grant() persists and reports granted', () => {
      const service = build();

      service.grant();

      expect(service.decision).toBe('granted');
      expect(service.isGranted).toBe(true);
      expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe('granted');
      expect(build().decision).toBe('granted');
    });

    it('deny() persists so the banner does not ask again', () => {
      const service = build();

      service.deny();

      expect(service.decision).toBe('denied');
      expect(service.isGranted).toBe(false);
      expect(build().decision).toBe('denied');
    });

    it('still holds the decision for this session when storage refuses to write', () => {
      const service = build();
      spyOn(Storage.prototype, 'setItem').and.throwError('QuotaExceededError');

      expect(() => service.grant()).not.toThrow();
      expect(service.decision).toBe('granted');
    });

    it('reset() returns to "unset" so the question is asked again', () => {
      const service = build();
      service.grant();

      service.reset();

      expect(service.decision).toBe('unset');
      expect(service.isGranted).toBe(false);
      expect(localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBeNull();
    });
  });

  describe('streams', () => {
    it('isUndecided$ is true only before an answer — a denial dismisses the banner', () => {
      const service = build();
      const seen: boolean[] = [];
      service.isUndecided$.subscribe((v) => seen.push(v));

      service.deny();

      expect(seen).toEqual([true, false]);
    });

    it('isGranted$ emits true only on accept', () => {
      const service = build();
      const seen: boolean[] = [];
      service.isGranted$.subscribe((v) => seen.push(v));

      service.deny();
      service.grant();

      expect(seen).toEqual([false, true]);
    });

    it('does not re-emit for a repeated identical answer', () => {
      const service = build();
      const seen: boolean[] = [];
      service.isGranted$.subscribe((v) => seen.push(v));

      service.grant();
      service.grant();

      expect(seen).toEqual([false, true]);
    });
  });
});
