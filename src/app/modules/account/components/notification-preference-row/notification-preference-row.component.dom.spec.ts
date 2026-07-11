import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { InputSwitchModule } from 'primeng/inputswitch';

import {
  NotificationPreferenceRowComponent,
  NotificationPreferenceRowChange,
} from './notification-preference-row.component';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';

/**
 * Host that stands in for `NotificationPreferencesPageComponent.onRowChange`:
 * it applies the SAME ≥1-channel veto rule (critical row + would-leave-both-off
 * => don't touch `row`) so this spec exercises the real veto-then-revert path
 * through an actual rendered `p-inputSwitch`, not just the row's emitted event.
 */
@Component({
  template: `
    <app-notification-preference-row
      [row]="row"
      [showWarning]="showWarning"
      (rowChange)="onRowChange($event)"
    ></app-notification-preference-row>
  `,
})
class HostComponent {
  row: NotificationPreferenceRow = {
    type: 'PAYMENT_CONFIRMED',
    critical: true,
    emailSupported: true,
    smsSupported: true,
    emailEnabled: true,
    smsEnabled: false,
  };
  showWarning = false;

  onRowChange(change: NotificationPreferenceRowChange): void {
    const otherChannelEnabled = change.channel === 'email' ? this.row.smsEnabled : this.row.emailEnabled;
    const wouldLeaveBothOff = !change.enabled && !otherChannelEnabled;

    if (this.row.critical && wouldLeaveBothOff) {
      // Veto — deliberately do NOT update `row`.
      return;
    }

    this.row =
      change.channel === 'email'
        ? { ...this.row, emailEnabled: change.enabled }
        : { ...this.row, smsEnabled: change.enabled };
  }
}

describe('NotificationPreferenceRowComponent (DOM — real p-inputSwitch, OBRS-141 veto revert)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationPreferenceRowComponent, HostComponent],
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), InputSwitchModule],
    }).compileComponents();
  });

  // Separate fakeAsync beforeEach: Angular's standalone `NgModel` defers its
  // FIRST `writeValue` call to the CVA through a microtask
  // (`resolvedPromise.then(...)` in `NgModel._updateValue`, to dodge
  // ExpressionChangedAfterItHasBeenCheckedError on init) — so the initial
  // `[ngModel]="row.emailEnabled"` value isn't reflected in the DOM until
  // that microtask is flushed and a second change-detection pass runs.
  beforeEach(fakeAsync(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }));

  function switchEl(index: number): HTMLElement {
    return fixture.debugElement.queryAll(By.css('.p-inputswitch'))[index].nativeElement;
  }

  it('reverts the switch visually when the host vetoes turning off the last channel on a critical row', fakeAsync(() => {
    // Sanity: email switch starts checked (row.emailEnabled = true, the only channel on).
    expect(switchEl(0).classList).toContain('p-inputswitch-checked');

    switchEl(0).click();
    fixture.detectChanges();

    // PrimeNG's InputSwitch flips its own internal `modelValue` synchronously
    // on click, before the host ever sees the emitted change — this is the
    // "lie" the switch would keep telling without the row's resync fix.
    expect(switchEl(0).classList).not.toContain('p-inputswitch-checked');

    tick(); // flush the row component's macrotask (setTimeout) resync
    fixture.detectChanges();

    // Host vetoed (critical row, both channels would be off) — the model
    // never moved, and now the switch must be reverted to match it.
    expect(host.row.emailEnabled).toBe(true);
    expect(switchEl(0).classList).toContain('p-inputswitch-checked');
  }));

  it('does not flicker/revert an accepted change (non-critical row may go both-off)', fakeAsync(() => {
    host.row = {
      type: 'BOOKING_RESCHEDULED',
      critical: false,
      emailSupported: true,
      smsSupported: true,
      emailEnabled: true,
      smsEnabled: false,
    };
    fixture.detectChanges();

    switchEl(0).click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(host.row.emailEnabled).toBe(false);
    expect(switchEl(0).classList).not.toContain('p-inputswitch-checked');
  }));

  it('reverts the SMS switch on veto too (last-channel rule applies per-channel)', fakeAsync(() => {
    host.row = {
      type: 'SCHEDULE_CANCELLED',
      critical: true,
      emailSupported: true,
      smsSupported: true,
      emailEnabled: false,
      smsEnabled: true,
    };
    fixture.detectChanges();
    tick(); // flush NgModel's deferred writeValue microtask for the changed values
    fixture.detectChanges();

    expect(switchEl(1).classList).toContain('p-inputswitch-checked');

    switchEl(1).click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(host.row.smsEnabled).toBe(true);
    expect(switchEl(1).classList).toContain('p-inputswitch-checked');
  }));
});
