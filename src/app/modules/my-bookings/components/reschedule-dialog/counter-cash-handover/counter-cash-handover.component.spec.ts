import { of, throwError } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

import { CounterCashHandoverComponent } from './counter-cash-handover.component';
import { BookingService, RescheduleEstimateParams } from '../../../../../services/booking/booking.service';

/**
 * OBRS-1167 (AC-5). What is worth pinning here is small and specific: this panel must never let a
 * half-made claim reach the parent, and the ask must go out against the exact candidate the
 * confirm will use — the backend binds the owner's approval to that amount (AC-3), so an ask
 * against a different round produces a code that cannot be spent.
 */
describe('CounterCashHandoverComponent', () => {
  const query: RescheduleEstimateParams = {
    newScheduleId: 20,
    newFromStopId: 100,
    newToStopId: 200,
    seats: ['A1'],
  };

  function create(service: Partial<BookingService> = {}) {
    const translate = { instant: (key: string) => key } as unknown as TranslateService;
    const component = new CounterCashHandoverComponent(
      service as BookingService,
      translate
    );
    component.bookingId = 5;
    component.estimateQuery = query;
    const emitted: { cashHandedOverNow: boolean; approvalCode: string }[] = [];
    component.stateChange.subscribe((state) => emitted.push(state));
    return { component, emitted };
  }

  // The template binds these; reaching them from a spec is the point of the cast.
  function proto(component: CounterCashHandoverComponent) {
    return component as unknown as {
      handedOver: boolean;
      approvalCode: string;
      approvalError: string;
      approvalState: string;
      onHandedOverToggle(checked: boolean): void;
      onCodeInput(value: string): void;
      requestApproval(): void;
      isCodeWellFormed: boolean;
      showCodeError: boolean;
    };
  }

  it('starts silent — no claim, no code — so the parent sends nothing about cash until asked to', () => {
    const { component, emitted } = create();
    expect(proto(component).handedOver).toBeFalse();
    expect(emitted.length).toBe(0);
  });

  it('emits the claim and the code as they are typed, trimmed', () => {
    const { component, emitted } = create();
    proto(component).onHandedOverToggle(true);
    proto(component).onCodeInput('  246813 ');

    expect(emitted[emitted.length - 1]).toEqual({
      cashHandedOverNow: true,
      approvalCode: '246813',
    });
  });

  it('un-ticking clears the code and the ask — a half-filled panel is how the wrong claim gets submitted next tap', () => {
    const { component, emitted } = create({
      requestRescheduleCashRefundApproval: () => of({ data: null }) as never,
    });
    proto(component).onHandedOverToggle(true);
    proto(component).requestApproval();
    proto(component).onCodeInput('246813');
    expect(proto(component).approvalState).toBe('requested');

    proto(component).onHandedOverToggle(false);

    expect(proto(component).approvalCode).toBe('');
    expect(proto(component).approvalState).toBe('idle');
    expect(emitted[emitted.length - 1]).toEqual({ cashHandedOverNow: false, approvalCode: '' });
  });

  it('asks the owner against the EXACT candidate the confirm will use — the approval is bound to that amount', () => {
    const spy = jasmine
      .createSpy('requestRescheduleCashRefundApproval')
      .and.returnValue(of({ data: null }));
    const { component } = create({ requestRescheduleCashRefundApproval: spy as never });

    proto(component).requestApproval();

    expect(spy).toHaveBeenCalledWith(5, query);
  });

  it('a failed ask re-arms the button and says so, rather than leaving the counter waiting on a request nobody got', () => {
    const { component } = create({
      requestRescheduleCashRefundApproval: () => throwError(() => new Error('boom')) as never,
    });

    proto(component).requestApproval();

    expect(proto(component).approvalState).toBe('failed');
    expect(proto(component).approvalError).toBeTruthy();
  });

  it('only a full six digits counts as well-formed — the server generates exactly that, zero-padded', () => {
    const { component } = create();
    proto(component).onHandedOverToggle(true);

    proto(component).onCodeInput('2468');
    expect(proto(component).isCodeWellFormed).toBeFalse();
    expect(proto(component).showCodeError).toBeTrue();

    proto(component).onCodeInput('246813');
    expect(proto(component).isCodeWellFormed).toBeTrue();
    expect(proto(component).showCodeError).toBeFalse();
  });
});
