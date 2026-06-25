import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';

import { ThemeToggleComponent } from './theme-toggle.component';
import { ThemeService, ThemeMode } from '../../services/theme.service';

describe('ThemeToggleComponent', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let component: ThemeToggleComponent;
  let mode$: BehaviorSubject<ThemeMode>;

  function makeStub(initial: ThemeMode = 'light'): Partial<ThemeService> {
    mode$ = new BehaviorSubject<ThemeMode>(initial);
    return {
      mode$: mode$.asObservable(),
      toggle: jasmine.createSpy('toggle'),
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ThemeToggleComponent],
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: ThemeService, useValue: makeStub('light') },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeToggleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the toggle button', () => {
    const btn = fixture.debugElement.query(By.css('button.theme-toggle-btn'));
    expect(btn).withContext('theme-toggle-btn should be in the DOM').toBeTruthy();
  });

  it('shows the dark_mode icon in light mode', () => {
    const icon = fixture.debugElement.query(By.css('.material-symbols-outlined'));
    expect(icon.nativeElement.textContent.trim()).toBe('dark_mode');
  });

  it('shows the light_mode icon in dark mode', async () => {
    mode$.next('dark');
    fixture.detectChanges();
    const icon = fixture.debugElement.query(By.css('.material-symbols-outlined'));
    expect(icon.nativeElement.textContent.trim()).toBe('light_mode');
  });

  it('button has aria-pressed="false" in light mode', () => {
    const btn = fixture.debugElement.query(By.css('button.theme-toggle-btn'));
    expect(btn.nativeElement.getAttribute('aria-pressed')).toBe('false');
  });

  it('button has aria-pressed="true" in dark mode', () => {
    mode$.next('dark');
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('button.theme-toggle-btn'));
    expect(btn.nativeElement.getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking the button calls ThemeService.toggle()', () => {
    const themeService = TestBed.inject(ThemeService);
    const btn = fixture.debugElement.query(By.css('button.theme-toggle-btn'));
    btn.nativeElement.click();
    expect(themeService.toggle).toHaveBeenCalled();
  });

  it('uses the default ariaLabelKey COMMON.THEME_TOGGLE', () => {
    expect(component.ariaLabelKey).toBe('COMMON.THEME_TOGGLE');
  });

  it('respects a custom ariaLabelKey input', () => {
    component.ariaLabelKey = 'HOME.NAVBAR.THEME_TOGGLE';
    fixture.detectChanges();
    expect(component.ariaLabelKey).toBe('HOME.NAVBAR.THEME_TOGGLE');
  });
});
