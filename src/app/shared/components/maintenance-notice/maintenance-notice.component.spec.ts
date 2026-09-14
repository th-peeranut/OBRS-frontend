import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { APP_LANGUAGE_KEY } from '../../services/language.service';
import { BehaviorSubject } from 'rxjs';
import {
  MaintenanceNoticeVm,
  MaintenanceWindow,
  MaintenanceWindowService,
} from '../../../services/maintenance-window/maintenance-window.service';
import { MaintenanceNoticeComponent } from './maintenance-notice.component';

/**
 * OBRS-1902 — the strip that warns every visitor before a deploy takes the site down.
 *
 * Both arms are asserted, the same way {@code BookingClosedNoticeComponent}'s spec does: with no
 * announcement the host must render NO element at all, not a hidden one, because "nothing
 * scheduled" is the state this component is in on every ordinary day and a stray empty strip
 * would be on every page of the product.
 */
describe('MaintenanceNoticeComponent', () => {
  let fixture: ComponentFixture<MaintenanceNoticeComponent>;
  let notice$: BehaviorSubject<MaintenanceNoticeVm | null>;
  let paymentLocked$: BehaviorSubject<boolean>;

  const window: MaintenanceWindow = {
    startAt: '2026-09-14T17:00:00.000Z',
    endAt: '2026-09-14T17:30:00.000Z',
    paymentLockMinutesBefore: 10,
    paymentLockedFrom: '2026-09-14T16:50:00.000Z',
    messageTh: 'ปิดปรับปรุงระบบชั่วคราว',
    messageEn: 'Scheduled maintenance',
  };

  function strip(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.maintenance-notice');
  }

  function body(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.maintenance-notice__body');
  }

  beforeEach(async () => {
    localStorage.removeItem(APP_LANGUAGE_KEY);
    notice$ = new BehaviorSubject<MaintenanceNoticeVm | null>(null);
    paymentLocked$ = new BehaviorSubject<boolean>(false);

    await TestBed.configureTestingModule({
      declarations: [MaintenanceNoticeComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        {
          provide: MaintenanceWindowService,
          useValue: {
            notice$,
            paymentLocked$,
            isPaymentLockedNow: () => paymentLocked$.value,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MaintenanceNoticeComponent);
    fixture.detectChanges();
  });

  it('renders no element at all when nothing is scheduled', () => {
    expect(strip()).toBeNull();
  });

  it('renders the announcement while a window is counting down', () => {
    notice$.next({ window, started: false, minutesUntilStart: 5 });
    fixture.detectChanges();

    expect(strip()).not.toBeNull();
    expect(body()!.textContent!.trim()).toBe(window.messageTh);
  });

  it('falls back to the English message for a reader who is not on Thai', () => {
    // The STORED choice is what decides it - see the component on why currentLang cannot.
    localStorage.setItem(APP_LANGUAGE_KEY, 'en');
    notice$.next({ window, started: false, minutesUntilStart: 5 });
    fixture.detectChanges();

    expect(body()!.textContent!.trim()).toBe(window.messageEn);
  });

  it('explains the disabled pay button only while payments are actually locked', () => {
    notice$.next({ window, started: false, minutesUntilStart: 5 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.maintenance-notice__payment')).toBeNull();

    paymentLocked$.next(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.maintenance-notice__payment')).not.toBeNull();
  });

  it('shows Thai to a visitor who has never chosen a language - th is the product default', () => {
    localStorage.removeItem(APP_LANGUAGE_KEY);
    notice$.next({ window, started: false, minutesUntilStart: 5 });
    fixture.detectChanges();

    expect(body()!.textContent!.trim()).toBe(window.messageTh);
  });

  it('stops rendering once the window has ended', () => {
    notice$.next({ window, started: true, minutesUntilStart: 0 });
    fixture.detectChanges();
    expect(strip()).not.toBeNull();

    notice$.next(null);
    fixture.detectChanges();
    expect(strip()).toBeNull();
  });
});
