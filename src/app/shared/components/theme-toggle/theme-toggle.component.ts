import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import { ThemeService } from '../../services/theme.service';

/**
 * Shared dark-mode toggle button.
 *
 * Renders a single icon button (`light_mode` / `dark_mode`) that calls
 * {@link ThemeService#toggle} on click. Used by the public navbar (desktop +
 * mobile) and every standalone auth page that embeds `<app-lang-switcher>`.
 *
 * The `ariaLabelKey` input lets each placement supply a context-appropriate
 * i18n key; it defaults to `COMMON.THEME_TOGGLE`.
 */
@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent implements OnInit, OnDestroy {
  /** i18n key for the button's aria-label. Override at each use-site if needed. */
  @Input() ariaLabelKey = 'COMMON.THEME_TOGGLE';

  isDarkMode = false;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeService.mode$.pipe(takeUntil(this.destroy$)).subscribe((mode) => {
      this.isDarkMode = mode === 'dark';
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggle(): void {
    this.themeService.toggle();
  }
}
