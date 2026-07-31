/**
 * OBRS-574 — which half of the trip's parcel work opens, and why.
 *
 * The tab strip itself is the cheap part. What these specs guard is the
 * decision behind it: a driver opening this screen mid-run should land on the
 * job that is actually due, and a bookmark from the old two-page world should
 * land where it used to.
 *
 * <p>The timezone spec is the reason this file exists. `departureDateTime`
 * comes back from the API in more than one shape, and the offset-less one is
 * read by `new Date()` as the VIEWER's wall clock — while prod and SIT run
 * UTC. A default tab derived that way flips seven hours off the real moment
 * and looks entirely correct on a developer's Bangkok laptop.
 */
import { Component, Input } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of } from 'rxjs';

import { AuthService } from '../../../../auth/auth.service';
import { AdminScheduleDto } from '../../../../services/admin/admin-api.service';
import { DriverSchedulesStore } from '../driver-schedules/driver-schedules.store';
import { StaffSchedulesStore } from '../staff-schedules/staff-schedules.store';
import { ParcelScheduleTabsPageComponent } from './parcel-schedule-tabs-page.component';

@Component({
    selector: 'app-parcel-verify-list-page', template: '<div id="verify-list"></div>',
    standalone: false
})
class VerifyListStubComponent {}

@Component({
    selector: 'app-parcel-delivery-list-page', template: '<div id="handover-list"></div>',
    standalone: false
})
class DeliveryListStubComponent {
  @Input() scheduleId?: number;
}

const SCHEDULE_ID = 8;

/** A Bangkok departure, `hoursFromNow` away, in the offset-LESS shape the API
 * emits for schedules (`admin/pages/schedules` fixtures) — the shape that makes
 * a naive `new Date()` comparison wrong. */
function bangkokDepartureIso(hoursFromNow: number): string {
  const instant = new Date(Date.now() + hoursFromNow * 3_600_000);
  const bangkok = new Date(instant.getTime() + 7 * 3_600_000); // shift so UTC parts read as Bangkok wall clock
  return bangkok.toISOString().slice(0, 19); // 'YYYY-MM-DDTHH:mm:ss', no offset
}

function scheduleAt(departureDateTime: string): AdminScheduleDto {
  return { id: SCHEDULE_ID, departureDateTime } as AdminScheduleDto;
}

interface RenderOptions {
  roles: string[];
  schedules: AdminScheduleDto[];
  queryParams?: Record<string, string>;
}

async function render(options: RenderOptions): Promise<ComponentFixture<ParcelScheduleTabsPageComponent>> {
  const { roles, schedules, queryParams = {} } = options;

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    declarations: [ParcelScheduleTabsPageComponent, VerifyListStubComponent, DeliveryListStubComponent],
    imports: [RouterTestingModule, TranslateModule.forRoot()],
    providers: [
      {
        provide: AuthService,
        useValue: {
          getRoles: () => roles,
          hasAnyRole: (required: string[]) => required.some((r) => roles.includes(r)),
        },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: convertToParamMap({ scheduleId: String(SCHEDULE_ID) }) },
          queryParamMap: new BehaviorSubject(convertToParamMap(queryParams)),
        },
      },
      {
        provide: DriverSchedulesStore,
        useValue: { data$: of(schedules), refresh: () => Promise.resolve() },
      },
      {
        provide: StaffSchedulesStore,
        useValue: { data$: of({ schedules }), refresh: () => Promise.resolve() },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ParcelScheduleTabsPageComponent);
  fixture.detectChanges();
  return fixture;
}

/** Which list is actually in the DOM — never the component's own field, which
 * would agree with itself even if the template rendered the other one. */
function shownList(fixture: ComponentFixture<ParcelScheduleTabsPageComponent>): string {
  const el = fixture.nativeElement as HTMLElement;
  if (el.querySelector('#verify-list')) return 'verify';
  if (el.querySelector('#handover-list')) return 'handover';
  return 'none';
}

describe('ParcelScheduleTabsPageComponent (OBRS-574)', () => {
  it('opens on verify while the trip has not left yet', async () => {
    const fixture = await render({ roles: ['driver'], schedules: [scheduleAt(bangkokDepartureIso(3))] });

    expect(shownList(fixture)).toBe('verify');
  });

  it('opens on handover once the trip has departed', async () => {
    const fixture = await render({ roles: ['driver'], schedules: [scheduleAt(bangkokDepartureIso(-3))] });

    expect(shownList(fixture)).toBe('handover');
  });

  it('reads an offset-less departure as Bangkok, not as the viewer local time', async () => {
    // The whole point. A departure 3h ahead in Bangkok is only unambiguously
    // "not yet departed" if the offset-less string is pinned to +07:00 — read
    // as UTC (what prod/SIT would do) the same string is 4h in the PAST and
    // this screen would open on handover while the boxes are still being
    // loaded. 3h < the 7h offset precisely so the two readings disagree.
    const fixture = await render({ roles: ['driver'], schedules: [scheduleAt(bangkokDepartureIso(3))] });

    expect(shownList(fixture))
      .withContext('an offset-less departureDateTime read as UTC would flip this to handover')
      .toBe('verify');
  });

  it('honours an explicit tab over the derived one — that is how a legacy bookmark lands', async () => {
    const fixture = await render({
      roles: ['driver'],
      schedules: [scheduleAt(bangkokDepartureIso(-3))], // would derive handover
      queryParams: { tab: 'verify' },
    });

    expect(shownList(fixture)).toBe('verify');
  });

  it('falls back to verify — the earlier job — for a schedule this user cannot see', async () => {
    const fixture = await render({
      roles: ['driver'],
      schedules: [{ id: 999, departureDateTime: bangkokDepartureIso(-3) } as AdminScheduleDto],
    });

    expect(shownList(fixture))
      .withContext('showing the earlier step risks a redundant look, not a skipped one')
      .toBe('verify');
  });

  it('derives for a salesperson too — the owner kept both tabs for both roles', async () => {
    const fixture = await render({ roles: ['salesperson'], schedules: [scheduleAt(bangkokDepartureIso(-3))] });

    expect(shownList(fixture)).toBe('handover');
  });

  it('shows both tabs, so a wrong derivation is one click from being corrected', async () => {
    const fixture = await render({ roles: ['driver'], schedules: [scheduleAt(bangkokDepartureIso(3))] });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="parcel-schedule-tab-verify"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="parcel-schedule-tab-handover"]')).toBeTruthy();
  });

  it('renders neither list until the opening tab is known', async () => {
    // An empty store emission is the pre-fetch state, not "no such schedule".
    // Resolving on it would show a list — and fire its manifest fetch — for a
    // tab chosen before the data that chooses it arrived.
    const fixture = await render({ roles: ['driver'], schedules: [] });

    expect(shownList(fixture)).toBe('none');
  });
});
