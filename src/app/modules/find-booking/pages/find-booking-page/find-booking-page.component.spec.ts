import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { FindBookingPageComponent } from './find-booking-page.component';
import { BookingLookupService } from '../../../../services/booking-lookup/booking-lookup.service';
import { BookingLookupResult } from '../../../../shared/interfaces/booking-lookup.interface';
// OBRS-1601: the template renders the contact's honorific through this pipe, and an unknown pipe is
// a template COMPILE error that NO_ERRORS_SCHEMA does not suppress - so it belongs here, not as a stub.
import { TitleLabelPipe } from '../../../../shared/pipes/title-label.pipe';

describe('FindBookingPageComponent (OBRS-857)', () => {
  let fixture: ComponentFixture<FindBookingPageComponent>;
  let component: FindBookingPageComponent;
  let lookupService: jasmine.SpyObj<BookingLookupService>;

  const RESULT: BookingLookupResult = {
    bookingNumber: 'B-ABC234',
    status: 'confirmed',
    contactName: 'สมชาย ใจดี',
    contactPhoneMasked: '••••5678',
    netAmount: 250,
    tickets: [
      {
        ticketNumber: 'T-ABCDE23456',
        passengerName: 'สมชาย ใจดี',
        seatNumber: '1',
        status: 'confirmed',
        fromStop: { code: 'nong_chak', label: 'หนองจาก' },
        toStop: { code: 'qmb_company', label: null },
        vehicle: { numberPlate: 'PBL-1234' },
      },
    ],
  };

  beforeEach(async () => {
    lookupService = jasmine.createSpyObj<BookingLookupService>('BookingLookupService', ['lookup']);

    await TestBed.configureTestingModule({
      declarations: [FindBookingPageComponent],
      imports: [ReactiveFormsModule, TranslateModule.forRoot(), TitleLabelPipe],
      providers: [{ provide: BookingLookupService, useValue: lookupService }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(FindBookingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const asAny = () => component as unknown as Record<string, any>;

  const fillAndSubmit = (bookingNumber: string, phoneNumber: string) => {
    asAny()['form'].setValue({ bookingNumber, phoneNumber });
    asAny()['onSubmit']();
  };

  it('starts idle and calls nothing until the form is submitted', () => {
    expect(asAny()['contentState']).toBe('idle');
    expect(lookupService.lookup).not.toHaveBeenCalled();
  });

  it('sends the trimmed pair and renders the booking', () => {
    lookupService.lookup.and.returnValue(of({ code: 200, message: 'OK', data: RESULT }));

    // Both values arrive with surrounding space, which is what a paste out of a chat message
    // looks like. This first went red for the right reason: the component validated the raw
    // value, so the digits-only pattern rejected a perfectly good ten-digit phone and the
    // customer got "enter 10-15 digits" over a field that visibly held ten.
    fillAndSubmit('  b-abc234  ', ' 0812345678 ');

    expect(lookupService.lookup).toHaveBeenCalledWith({
      bookingNumber: 'b-abc234',
      phoneNumber: '0812345678',
    });
    expect(asAny()['contentState']).toBe('found');
    expect(asAny()['result']).toEqual(RESULT);
    // The field must not disagree with what was sent.
    expect(asAny()['form'].value.phoneNumber).toBe('0812345678');
  });

  it('does not call the endpoint at all when the phone is not 10-15 digits', () => {
    // A throttled endpoint must not be spent on input the form can already reject. Every call
    // counts against the caller's own per-IP window, hit or miss.
    fillAndSubmit('B-ABC234', 'not-a-phone');

    expect(lookupService.lookup).not.toHaveBeenCalled();
    expect(asAny()['contentState']).toBe('idle');
  });

  describe('the refusal is ONE state — the endpoint must not become an oracle', () => {
    [
      { label: 'no such booking', status: 404 },
      { label: 'wrong phone (backend answers the same 404)', status: 404 },
      { label: 'a malformed request', status: 400 },
      { label: 'a server error', status: 500 },
    ].forEach(({ label, status }) => {
      it(`${label} → 'not-found', with no hint about which half was wrong`, () => {
        lookupService.lookup.and.returnValue(
          throwError(() => new HttpErrorResponse({ status, statusText: 'x' }))
        );

        fillAndSubmit('B-ABC234', '0812345678');

        expect(asAny()['contentState']).toBe('not-found');
        expect(asAny()['result']).toBeNull();
      });
    });

    it("a 200 carrying no data is also just 'not-found'", () => {
      lookupService.lookup.and.returnValue(of({ code: 200, message: 'OK' }));

      fillAndSubmit('B-ABC234', '0812345678');

      expect(asAny()['contentState']).toBe('not-found');
    });
  });

  it('429 gets its OWN state — it is the one failure waiting can fix', () => {
    // And it is not an oracle: 429 is a fact about this caller's request rate, not about
    // whether the booking exists. Folding it into 'not-found' would tell someone who is
    // already rate-limited to retype and try again immediately.
    lookupService.lookup.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 429, statusText: 'Too Many Requests' }))
    );

    fillAndSubmit('B-ABC234', '0812345678');

    expect(asAny()['contentState']).toBe('throttled');
  });

  it('clears a previous result before the next lookup resolves', fakeAsync(() => {
    lookupService.lookup.and.returnValue(of({ code: 200, message: 'OK', data: RESULT }));
    fillAndSubmit('B-ABC234', '0812345678');
    expect(asAny()['result']).toEqual(RESULT);

    // A stale booking left on screen under a fresh "not found" message is how somebody reads
    // another lookup's answer as their own.
    lookupService.lookup.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 404, statusText: 'Not Found' }))
    );
    fillAndSubmit('B-ZZZZZZ', '0899999999');
    tick();

    expect(asAny()['result']).toBeNull();
    expect(asAny()['contentState']).toBe('not-found');
  }));

  it('falls back to the stop code when the backend could not name the stop', () => {
    // `toStop.label` is null above — a stop renamed since the booking. The screen must show
    // something a human can act on rather than an empty cell.
    expect(asAny()['stopFor'](RESULT.tickets![0].fromStop)).toBe('หนองจาก');
    expect(asAny()['stopFor'](RESULT.tickets![0].toStop)).toBe('qmb_company');
    expect(asAny()['stopFor'](null)).toBe('-');
  });
});
