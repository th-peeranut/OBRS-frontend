import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { NJ_FACEBOOK_PAGE_URL } from '../../lib/online-booking-channel';
import { BookingClosedNoticeComponent } from './booking-closed-notice.component';

/**
 * OBRS-1302 — the notice that replaces the booking button while online booking
 * is closed.
 *
 * Every behaviour is asserted in BOTH flag states. A spec that only proved the
 * closed arm would leave the owner's reopen path — flip one value, change no
 * code — untested, and that path is the entire reason the close was built as a
 * flag rather than a revert.
 *
 * Runs against the same hand-built Router double the consent bar's route-scope
 * spec uses (`analytics-consent-banner.component.spec.ts`), because what is
 * under test is what the component does at a specific point in a navigation:
 * before the first one, on a customer page, and on a staff page.
 */
describe('BookingClosedNoticeComponent', () => {
  let fixture: ComponentFixture<BookingClosedNoticeComponent>;
  let routerEvents: Subject<NavigationEnd>;
  let routeSnapshotRoot: unknown;
  let originalOnlineTicketBooking: boolean;

  function notice(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.booking-closed');
  }

  function link(): HTMLAnchorElement | null {
    return fixture.nativeElement.querySelector('.booking-closed__link');
  }

  /** A snapshot tree shaped like the real one — `data` is what decides scope. */
  function chain(path: string, data: Record<string, unknown> = {}): unknown {
    const leaf = { routeConfig: { path }, data, firstChild: null, children: [] };
    return { routeConfig: null, data: {}, firstChild: leaf, children: [leaf] };
  }

  function navigate(url: string): void {
    routerEvents.next(new NavigationEnd(1, url, url));
    fixture.detectChanges();
  }

  async function mount(): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [BookingClosedNoticeComponent],
      imports: [TranslateModule.forRoot(), RouterTestingModule],
      providers: [
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            get routerState() {
              return { snapshot: { root: routeSnapshotRoot } };
            },
            createUrlTree: () => ({}),
            serializeUrl: () => '',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingClosedNoticeComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    originalOnlineTicketBooking = environment.features.onlineTicketBooking;
    routerEvents = new Subject<NavigationEnd>();
    routeSnapshotRoot = chain('');
  });

  afterEach(() => {
    environment.features.onlineTicketBooking = originalOnlineTicketBooking;
  });

  describe('flag OFF — booking is closed', () => {
    beforeEach(async () => {
      environment.features.onlineTicketBooking = false;
      await mount();
    });

    it('shows the notice once a customer route has resolved', () => {
      navigate('/');

      expect(notice()).not.toBeNull();
    });

    it('shows it on every customer page, not just the home page', () => {
      // AC-3 is "ทุกหน้าฝั่งลูกค้า" — the shop window a visitor actually lands
      // on from Google is the trip list, not the home page.
      routeSnapshotRoot = chain('schedule-booking', { customerArea: true });
      navigate('/schedule-booking');

      expect(notice()).not.toBeNull();
    });

    it('points at the Facebook page in a new tab, with rel=noopener', () => {
      navigate('/');

      const anchor = link();
      expect(anchor).not.toBeNull();
      // `href` is read off the property, which resolves to the absolute URL the
      // browser would actually open — the attribute alone would pass for a
      // relative path that goes nowhere.
      expect(anchor?.href).toBe(NJ_FACEBOOK_PAGE_URL);
      expect(anchor?.target).toBe('_blank');
      expect(anchor?.rel).toContain('noopener');
    });

    it('is a region and not a modal — it must not block the page (AC-7)', () => {
      navigate('/');

      const el = notice();
      expect(el?.getAttribute('role')).toBe('region');
      expect(el?.getAttribute('aria-modal')).toBeNull();
      expect(el?.getAttribute('aria-label')).toBeTruthy();
    });

    it('renders NOTHING on a staff page — staff are not the audience (AC-6)', () => {
      routeSnapshotRoot = chain('sell', { requiredRoles: ['salesperson'] });
      navigate('/staff/sell');

      expect(notice()).toBeNull();
    });

    it('renders NOTHING on an admin page', () => {
      routeSnapshotRoot = chain('bookings', { requiredRoles: ['admin'] });
      navigate('/admin/bookings');

      expect(notice()).toBeNull();
    });

    it('renders NOTHING before the first navigation resolves', () => {
      // The deep-link window. A staff member opening /staff/sell directly passes
      // through this state, and one frame of a customer notice on their till is
      // the thing AC-6 forbids. Showing nothing here costs only a frame of a
      // strip that was never urgent.
      expect(notice()).toBeNull();
    });
  });

  describe('flag ON — booking is open again', () => {
    beforeEach(async () => {
      environment.features.onlineTicketBooking = true;
      await mount();
    });

    it('renders no element at all on a customer page — not hidden by CSS (AC-8)', () => {
      navigate('/');

      // `toBeNull` and not a visibility check on purpose: a reopened site must
      // carry no trace of the close in its DOM, and `display: none` would still
      // be read by a screen reader in some configurations.
      expect(notice()).toBeNull();
      expect(link()).toBeNull();
    });

    it('renders no element on the trip list either', () => {
      routeSnapshotRoot = chain('schedule-booking', { customerArea: true });
      navigate('/schedule-booking');

      expect(notice()).toBeNull();
    });
  });
});
