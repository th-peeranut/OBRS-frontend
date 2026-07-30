import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { LoadingStateComponent } from './loading-state.component';

describe('LoadingStateComponent', () => {
  let fixture: ComponentFixture<LoadingStateComponent>;
  let component: LoadingStateComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LoadingStateComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingStateComponent);
    component = fixture.componentInstance;
  });

  // ---- a11y: role=status + translated status text, graphic aria-hidden ----

  it('renders role="status" + aria-live="polite" on the wrapper, with the translated message key as its accessible text', () => {
    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css('[role="status"]'));
    expect(status).withContext('a role="status" wrapper must exist').toBeTruthy();
    expect(status.attributes['aria-live']).toBe('polite');

    // TranslateModule.forRoot() with no loader configured returns the key
    // itself (no translation registered) — same convention used by every
    // other spec in this codebase that asserts translated text (e.g.
    // notification-inbox-panel.component.spec.ts).
    expect(status.nativeElement.textContent).toContain('COMMON.LOADING');
  });

  it('uses a custom messageKey when provided, instead of the COMMON.LOADING default', () => {
    component.messageKey = 'MY_BOOKINGS.TICKET_MODAL.LOADING';
    fixture.detectChanges();

    const status = fixture.debugElement.query(By.css('[role="status"]'));
    expect(status.nativeElement.textContent).toContain('MY_BOOKINGS.TICKET_MODAL.LOADING');
    expect(status.nativeElement.textContent).not.toContain('COMMON.LOADING');
  });

  it('marks every rendered graphic aria-hidden so only the status text is announced', () => {
    fixture.detectChanges(); // default: spinner / ring
    let graphic = fixture.debugElement.query(By.css('.loading-state-ring'));
    expect(graphic.attributes['aria-hidden']).toBe('true');

    component.graphic = 'icon';
    fixture.detectChanges();
    graphic = fixture.debugElement.query(By.css('.admin-loading-spinner'));
    expect(graphic.attributes['aria-hidden']).toBe('true');

    component.variant = 'skeleton';
    fixture.detectChanges();
    const bars = fixture.debugElement.queryAll(By.css('.admin-skeleton'));
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => expect(bar.attributes['aria-hidden']).toBe('true'));
  });

  // ---- variants render correctly ----

  it('skeleton variant renders `rows` shimmer bars using the existing global .admin-skeleton class', () => {
    component.variant = 'skeleton';
    component.rows = 4;
    fixture.detectChanges();

    const bars = fixture.debugElement.queryAll(By.css('.admin-skeleton'));
    expect(bars.length).toBe(4);
    // no ring/icon graphic leaks in alongside the skeleton bars
    expect(fixture.debugElement.query(By.css('.loading-state-ring'))).toBeNull();
  });

  it('skeleton variant applies the --sm / --pill modifier classes, matching the existing admin-skeleton contract', () => {
    component.variant = 'skeleton';
    component.rows = 1;
    component.skeletonShape = 'pill';
    fixture.detectChanges();

    const bar = fixture.debugElement.query(By.css('.admin-skeleton'));
    expect(bar.nativeElement.classList).toContain('admin-skeleton--pill');
    expect(bar.nativeElement.classList).not.toContain('admin-skeleton--sm');
  });

  it('skeleton variant defaults rows to at least 1 even if a caller passes 0 or a negative number', () => {
    component.variant = 'skeleton';
    component.rows = 0;
    fixture.detectChanges();
    expect(fixture.debugElement.queryAll(By.css('.admin-skeleton')).length).toBe(1);
  });

  it('spinner variant defaults to the ring graphic', () => {
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.loading-state-ring'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.loading-state-icon'))).toBeNull();
  });

  it('graphic="icon" renders the existing global .admin-loading-spinner primitive with the requested glyph', () => {
    component.graphic = 'icon';
    component.icon = 'sync';
    fixture.detectChanges();

    const icon = fixture.debugElement.query(By.css('.material-symbols-outlined.admin-loading-spinner'));
    expect(icon).withContext('must reuse .admin-loading-spinner, not a forked class').toBeTruthy();
    expect(icon.nativeElement.textContent.trim()).toBe('sync');
  });

  it('inline variant renders the same graphic markup as spinner (a smaller preset, not a fourth graphic)', () => {
    component.variant = 'inline';
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.loading-state-ring'))).toBeTruthy();
    expect(fixture.debugElement.query(By.css('.loading-state--inline'))).toBeTruthy();
  });

  // ---- size/speed overrides used by a call site reproducing its exact prior look ----

  it('applies sizePx / ringWidthPx / durationMs as inline style overrides on the ring graphic', () => {
    component.sizePx = 36;
    component.ringWidthPx = 4;
    component.durationMs = 800;
    fixture.detectChanges();

    const ring: HTMLElement = fixture.debugElement.query(By.css('.loading-state-ring')).nativeElement;
    expect(ring.style.width).toBe('36px');
    expect(ring.style.height).toBe('36px');
    expect(ring.style.borderWidth).toBe('4px');
    expect(ring.style.animationDuration).toBe('800ms');
  });

  it('leaves size/speed to the CSS default when no override input is set', () => {
    fixture.detectChanges();
    const ring: HTMLElement = fixture.debugElement.query(By.css('.loading-state-ring')).nativeElement;
    expect(ring.style.width).toBe('');
    expect(ring.style.height).toBe('');
    expect(ring.style.borderWidth).toBe('');
    expect(ring.style.animationDuration).toBe('');
  });
});
