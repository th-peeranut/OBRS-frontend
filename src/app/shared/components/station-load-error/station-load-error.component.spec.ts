import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { Store } from '@ngrx/store';
import { StationLoadErrorComponent } from './station-load-error.component';
import { selectProvinceWithStation } from '../../stores/station/station.selector';
import { selectStationLoadFailed } from '../../stores/station/station-load-status.selector';
import { invokeGetAllProvinceWithStationApi } from '../../stores/station/station.action';
import { StationApi } from '../../interfaces/station.interface';

const MOCK_STATION: StationApi = {
  id: 1,
  slug: 'bangkok',
  status: 'active',
  stopType: 'station',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('StationLoadErrorComponent (OBRS-1222)', () => {
  let fixture: ComponentFixture<StationLoadErrorComponent>;
  let store: MockStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StationLoadErrorComponent],
      imports: [TranslateModule.forRoot()],
      providers: [provideMockStore()],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(StationLoadErrorComponent);
  });

  function render(stations: StationApi[], hasFailed: boolean): void {
    store.overrideSelector(selectProvinceWithStation, stations);
    store.overrideSelector(selectStationLoadFailed, hasFailed);
    store.refreshState();
    fixture.detectChanges();
  }

  function notice() {
    return fixture.debugElement.query(By.css('[data-testid="station-load-error"]'));
  }

  it('AC1 — renders NOTHING when the load failed but the cache already filled the roster', () => {
    render([MOCK_STATION], true);

    expect(notice()).toBeNull();
    // `:host(:empty) { display: none }` is what keeps this from costing a flex
    // `gap` inside `.booking-card`, and `:empty` ignores the comment an inactive
    // `@if` leaves behind — so assert there is no ELEMENT child, not that the
    // innerHTML is empty. This is the whole product decision in one assertion:
    // a returning visitor whose form works must not be interrupted.
    expect(fixture.nativeElement.children.length).toBe(0);
  });

  it('AC2 — renders the inline message when the load failed AND the roster is empty', () => {
    render([], true);

    expect(notice()).not.toBeNull();
    expect(notice().nativeElement.getAttribute('role')).toBe('alert');
  });

  it('renders nothing on an ordinary page load — empty roster, no failure yet', () => {
    // The cold-start frame: the store emits [] before the fetch resolves. A
    // message here would accuse the network of a failure that has not happened.
    render([], false);

    expect(notice()).toBeNull();
  });

  it('is NOT a modal — nothing it renders is a SweetAlert2 container or an overlay', () => {
    render([], true);

    expect(document.querySelectorAll('.swal2-container').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.swal2-container').length).toBe(0);
    // `position: fixed` is the property that would turn this into the thing the
    // card exists to remove, whatever it was called.
    const style = getComputedStyle(notice().nativeElement);
    expect(style.position).not.toBe('fixed');
  });

  it('AC3 — the retry button dispatches the same action the page dispatches on init', () => {
    const dispatch = spyOn(TestBed.inject(Store), 'dispatch');
    render([], true);

    fixture.debugElement
      .query(By.css('[data-testid="station-load-error-retry"]'))
      .nativeElement.click();

    expect(dispatch).toHaveBeenCalledWith(invokeGetAllProvinceWithStationApi());
  });

  it('AC5 — every user-visible string goes through i18n', () => {
    render([], true);

    // With TranslateModule.forRoot() and no dictionary loaded, each resolved
    // string is its own KEY, so any hardcoded copy shows up as a token that is
    // not a STATION_LOAD_ERROR.* key.
    const text: string = notice().nativeElement.textContent.replace(/\s+/g, ' ').trim();
    const leftovers = text
      .split(' ')
      .filter((token) => token && !token.startsWith('STATION_LOAD_ERROR.'));
    expect(leftovers).toEqual([]);
  });
});
