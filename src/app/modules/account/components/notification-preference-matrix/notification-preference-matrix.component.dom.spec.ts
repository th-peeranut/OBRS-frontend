import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { NotificationPreferenceMatrixComponent } from './notification-preference-matrix.component';
import { NotificationPreferenceRowComponent } from '../notification-preference-row/notification-preference-row.component';
import { NotificationPreferenceRow } from '../../../../shared/interfaces/notification-preference.interface';

/**
 * OBRS-1744. The defect this file exists to prevent coming back: the ≥1-channel
 * sentence used to be printed under EVERY critical row, so the backend's three
 * `critical=true` types put three identical copies on one screen. Counting the
 * rendered note is the whole check — a regression that re-attaches it to the
 * row would show up here as 3, not 1, without anyone having to read the diff.
 */
@Component({
    template: `
    <app-notification-preference-matrix [preferences]="preferences"></app-notification-preference-matrix>
  `,
    standalone: false
})
class HostComponent {
  preferences: NotificationPreferenceRow[] = [];
}

function row(type: string, critical: boolean): NotificationPreferenceRow {
  return { type, critical, emailSupported: true, smsSupported: true, emailEnabled: true, smsEnabled: true };
}

describe('NotificationPreferenceMatrixComponent (DOM — OBRS-1744 grouped ≥1-channel note)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationPreferenceMatrixComponent, NotificationPreferenceRowComponent, HostComponent],
      imports: [CommonModule, FormsModule, TranslateModule.forRoot(), ToggleSwitchModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  function notes(): unknown[] {
    return fixture.debugElement.queryAll(By.css('.npref-matrix__critical-note'));
  }

  function marks(): unknown[] {
    return fixture.debugElement.queryAll(By.css('.npref-row__mark'));
  }

  it('states the ≥1-channel rule exactly once, however many critical rows there are', () => {
    // The real SIT/prod shape: 3 critical types among 7 (measured on the enum).
    host.preferences = [
      row('PAYMENT_CONFIRMED', true),
      row('BOOKING_CANCELLED', true),
      row('SCHEDULE_CANCELLED', true),
      row('BOOKING_RESCHEDULED', false),
    ];
    fixture.detectChanges();

    expect(notes().length).toBe(1);
  });

  it('marks every critical row and only the critical rows', () => {
    host.preferences = [
      row('PAYMENT_CONFIRMED', true),
      row('BOOKING_CANCELLED', true),
      row('SCHEDULE_CANCELLED', true),
      row('BOOKING_RESCHEDULED', false),
      row('BOARDING_REMINDER', false),
    ];
    fixture.detectChanges();

    expect(marks().length).toBe(3);
  });

  // OBRS-1744 AC-4. The two halves of the association are written in different
  // components, so only a test that renders BOTH can prove the id a switch
  // points at is the id the note actually carries. Resolving it through
  // `getElementById` is the same lookup assistive tech does.
  it('gives every critical rows switches an aria-describedby that resolves to the note', () => {
    host.preferences = [
      row('PAYMENT_CONFIRMED', true),
      row('BOOKING_CANCELLED', true),
      row('BOOKING_RESCHEDULED', false),
    ];
    fixture.detectChanges();

    const switchesOfRow = (index: number): HTMLInputElement[] =>
      fixture.debugElement
        .queryAll(By.css('app-notification-preference-row'))
        [index].queryAll(By.css('.p-toggleswitch input'))
        .map((debugEl) => debugEl.nativeElement as HTMLInputElement);

    const noteEl = fixture.nativeElement.querySelector('.npref-matrix__critical-note') as HTMLElement;
    expect(noteEl.id).toBeTruthy();

    for (const index of [0, 1]) {
      for (const input of switchesOfRow(index)) {
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toBe(noteEl.id);
        const target = fixture.nativeElement.querySelector('#' + describedBy) as HTMLElement | null;
        expect(target?.textContent?.trim()).toBeTruthy();
      }
    }

    for (const input of switchesOfRow(2)) {
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    }
  });

  it('drops the note when no row carries the rule, so it never points at absent asterisks', () => {
    host.preferences = [row('BOOKING_RESCHEDULED', false), row('BOARDING_REMINDER', false)];
    fixture.detectChanges();

    expect(notes().length).toBe(0);
    expect(marks().length).toBe(0);
  });
});
