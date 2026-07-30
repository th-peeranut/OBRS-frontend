import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AdminPaginatorComponent } from './admin-paginator.component';

describe('AdminPaginatorComponent', () => {
  let fixture: ComponentFixture<AdminPaginatorComponent>;
  let component: AdminPaginatorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [AdminPaginatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPaginatorComponent);
    component = fixture.componentInstance;
  });

  function nav(): HTMLElement | null {
    return fixture.nativeElement.querySelector('nav.admin-paginator');
  }

  it('hides entirely when totalPages <= 1 (no "1 / 1" clutter)', () => {
    component.currentPage = 1;
    component.totalPages = 1;
    fixture.detectChanges();

    expect(nav()).withContext('paginator must not render for a single page').toBeNull();
  });

  it('renders Previous/Next and the current/total counter when totalPages > 1', () => {
    component.currentPage = 2;
    component.totalPages = 5;
    fixture.detectChanges();

    const el = nav();
    expect(el).withContext('paginator must render when there is more than one page').not.toBeNull();
    expect(el?.textContent).toContain('2 / 5');
  });

  it('disables Previous on the first page and Next on the last page', () => {
    component.currentPage = 1;
    component.totalPages = 3;
    fixture.detectChanges();

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).withContext('Previous must be disabled on page 1').toBeTrue();
    expect(buttons[1].disabled).withContext('Next must be enabled before the last page').toBeFalse();

    component.currentPage = 3;
    fixture.detectChanges();
    expect(buttons[0].disabled).withContext('Previous must be enabled after page 1').toBeFalse();
    expect(buttons[1].disabled).withContext('Next must be disabled on the last page').toBeTrue();
  });

  it('disables both buttons when [disabled] is true, regardless of page position', () => {
    component.currentPage = 2;
    component.totalPages = 5;
    component.disabled = true;
    fixture.detectChanges();

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  it('emits pageChange with currentPage - 1 / + 1 on Previous/Next click', () => {
    component.currentPage = 2;
    component.totalPages = 5;
    fixture.detectChanges();
    const emitted: number[] = [];
    component.pageChange.subscribe((page) => emitted.push(page));

    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click();
    buttons[1].click();

    expect(emitted).toEqual([1, 3]);
  });

  // ── OBRS-466: a11y — announce the page + never drop focus to <body> ────────

  it('exposes exactly one aria-live region and does NOT announce on first render', () => {
    component.currentPage = 1;
    component.totalPages = 3;
    fixture.detectChanges();

    const liveNodes = fixture.nativeElement.querySelectorAll('[aria-live]');
    expect(liveNodes.length)
      .withContext('exactly one live region — the visible counter must not also be aria-live')
      .toBe(1);
    const live: HTMLElement = liveNodes[0];
    expect(live.getAttribute('role')).toBe('status');
    expect(live.textContent?.trim())
      .withContext('first render is the list load, not a user navigation — nothing to announce')
      .toBe('');
  });

  it('announces the new page through the live region on a page change', () => {
    component.currentPage = 1;
    component.totalPages = 3;
    fixture.detectChanges();

    component.currentPage = 2;
    // Direct input assignment does not auto-fire ngOnChanges in a test — invoke
    // it the way Angular would when the parent rebinds [currentPage].
    component.ngOnChanges({ currentPage: new SimpleChange(1, 2, false) });
    fixture.detectChanges();

    const live: HTMLElement = fixture.nativeElement.querySelector('[aria-live]');
    // No translations are loaded, so translate.instant returns the key — enough
    // to prove the live region was populated from the status string on change.
    expect(component['pageStatus']).toContain('PAGINATION_STATUS_ARIA');
    expect(live.textContent).toContain('PAGINATION_STATUS_ARIA');
  });

  it('restores focus to the pressed button after a mid-range page change (focus never falls to <body>)', fakeAsync(() => {
    component.currentPage = 2;
    component.totalPages = 5;
    fixture.detectChanges();
    const [prevBtn, nextBtn] = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const nextFocus = spyOn(nextBtn, 'focus');
    const prevFocus = spyOn(prevBtn, 'focus');

    nextBtn.click(); // user activates Next (records intent, emits)
    // Parent settles on page 3 and re-enables the controls.
    component.currentPage = 3;
    fixture.detectChanges(); // DOM [disabled] now reflects page 3
    component.ngOnChanges({ currentPage: new SimpleChange(2, 3, false) });
    tick();

    expect(nextFocus).withContext('Next is still enabled mid-range → focus returns to it').toHaveBeenCalled();
    expect(prevFocus).not.toHaveBeenCalled();
  }));

  it('moves focus to Previous when the Next press lands on the last page (Next becomes disabled)', fakeAsync(() => {
    component.currentPage = 4;
    component.totalPages = 5;
    fixture.detectChanges();
    const [prevBtn, nextBtn] = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const nextFocus = spyOn(nextBtn, 'focus');
    const prevFocus = spyOn(prevBtn, 'focus');

    nextBtn.click();
    component.currentPage = 5;
    fixture.detectChanges();
    component.ngOnChanges({ currentPage: new SimpleChange(4, 5, false) });
    tick();

    expect(nextBtn.disabled).withContext('Next is disabled on the last page').toBeTrue();
    expect(prevFocus)
      .withContext('the pressed button is now disabled → focus its enabled sibling, not <body>')
      .toHaveBeenCalled();
    expect(nextFocus).not.toHaveBeenCalled();
  }));

  it('does not touch focus while the controls are still disabled mid-fetch', fakeAsync(() => {
    component.currentPage = 2;
    component.totalPages = 5;
    fixture.detectChanges();
    const [prevBtn, nextBtn] = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const nextFocus = spyOn(nextBtn, 'focus');
    const prevFocus = spyOn(prevBtn, 'focus');

    nextBtn.click();
    // The fetch is in flight: parent keeps the paginator disabled.
    component.disabled = true;
    component.ngOnChanges({ disabled: new SimpleChange(false, true, false) });
    tick();

    expect(nextFocus).not.toHaveBeenCalled();
    expect(prevFocus).not.toHaveBeenCalled();
  }));
});
