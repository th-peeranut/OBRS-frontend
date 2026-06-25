import { TestBed } from '@angular/core/testing';
import {
  APP_ADMIN_THEME_KEY,
  DEFAULT_THEME_MODE,
  ThemeMode,
  ThemeService,
} from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    // Ensure a clean localStorage state before each test.
    localStorage.clear();
    document.body.classList.remove('is-dark');

    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    localStorage.clear();
    document.body.classList.remove('is-dark');
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getStoredMode()', () => {
    it('returns the default mode when nothing is stored', () => {
      expect(service.getStoredMode()).toBe(DEFAULT_THEME_MODE);
    });

    it('returns "dark" when localStorage has "dark"', () => {
      localStorage.setItem(APP_ADMIN_THEME_KEY, 'dark');
      expect(service.getStoredMode()).toBe('dark');
    });

    it('returns "light" when localStorage has an unrecognised value', () => {
      localStorage.setItem(APP_ADMIN_THEME_KEY, 'unknown');
      expect(service.getStoredMode()).toBe('light');
    });
  });

  describe('mode$ stream', () => {
    it('emits the default mode initially', (done) => {
      service.mode$.subscribe((mode) => {
        expect(mode).toBe(DEFAULT_THEME_MODE);
        done();
      });
    });

    it('emits the new mode after setMode()', (done) => {
      const modes: ThemeMode[] = [];
      service.mode$.subscribe((m) => modes.push(m));

      service.setMode('dark');
      expect(modes).toContain('dark');
      done();
    });
  });

  describe('setMode()', () => {
    it('persists the mode to localStorage', () => {
      service.setMode('dark');
      expect(localStorage.getItem(APP_ADMIN_THEME_KEY)).toBe('dark');
    });

    it('adds the is-dark class to document.body in dark mode', () => {
      service.setMode('dark');
      expect(document.body.classList.contains('is-dark')).toBe(true);
    });

    it('removes the is-dark class from document.body in light mode', () => {
      document.body.classList.add('is-dark');
      service.setMode('light');
      expect(document.body.classList.contains('is-dark')).toBe(false);
    });
  });

  describe('toggle()', () => {
    it('switches from light to dark', () => {
      service.setMode('light');
      service.toggle();
      expect(localStorage.getItem(APP_ADMIN_THEME_KEY)).toBe('dark');
      expect(document.body.classList.contains('is-dark')).toBe(true);
    });

    it('switches from dark to light', () => {
      service.setMode('dark');
      service.toggle();
      expect(localStorage.getItem(APP_ADMIN_THEME_KEY)).toBe('light');
      expect(document.body.classList.contains('is-dark')).toBe(false);
    });
  });

  describe('init()', () => {
    it('applies the stored dark class on the body when stored mode is dark', () => {
      localStorage.setItem(APP_ADMIN_THEME_KEY, 'dark');
      service.init();
      expect(document.body.classList.contains('is-dark')).toBe(true);
    });

    it('does not add the is-dark class when stored mode is light', () => {
      localStorage.setItem(APP_ADMIN_THEME_KEY, 'light');
      service.init();
      expect(document.body.classList.contains('is-dark')).toBe(false);
    });

    it('emits the stored mode to mode$ after init', (done) => {
      localStorage.setItem(APP_ADMIN_THEME_KEY, 'dark');
      let emittedMode: ThemeMode = 'light';
      service.mode$.subscribe((m) => (emittedMode = m));
      service.init();
      expect(emittedMode).toBe('dark');
      done();
    });
  });
});
