import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  Renderer2,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../services/language.service';

interface LanguageOption {
  code: string;
  endonym: string;
  /** i18n key for the item's aria-label, e.g. HOME.NAVBAR.LANGUAGE_EN */
  ariaKey: string;
}

/**
 * Shared language switcher — a globe + endonym + chevron dropdown offering
 * EN/TH/ZH. Used by the public navbar (desktop + mobile) and the login/register
 * pages. Each placement is its own instance with its own open state and
 * document-click listener, so the outside-click guard is scoped to this
 * instance's element (no class-based matching needed).
 */
@Component({
  selector: 'app-lang-switcher',
  templateUrl: './lang-switcher.component.html',
  styleUrl: './lang-switcher.component.scss',
})
export class LangSwitcherComponent implements OnDestroy {
  /** Horizontal alignment of the dropdown menu relative to the trigger. */
  @Input() menuAlign: 'left' | 'right' = 'right';

  isLangDropdownOpen: boolean = false;
  currentLanguage: string = 'th';

  /** Static language list — endonyms are intentionally locale-invariant. */
  readonly languages: LanguageOption[] = [
    { code: 'en', endonym: 'English', ariaKey: 'HOME.NAVBAR.LANGUAGE_EN' },
    { code: 'th', endonym: 'ไทย', ariaKey: 'HOME.NAVBAR.LANGUAGE_TH' },
    { code: 'zh', endonym: '中文', ariaKey: 'HOME.NAVBAR.LANGUAGE_ZH' },
  ];

  private unlistenLangDropdown?: () => void;

  constructor(
    private translate: TranslateService,
    private renderer: Renderer2,
    private elementRef: ElementRef,
    private languageService: LanguageService
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
  }

  ngOnDestroy(): void {
    this.unlistenLangDropdown?.();
  }

  get currentEndonym(): string {
    return (
      this.languages.find((l) => l.code === this.currentLanguage)?.endonym ??
      this.currentLanguage
    );
  }

  switchLanguage(lang: string) {
    this.currentLanguage = lang;
    void this.languageService.switch(lang);
  }

  selectLanguage(lang: string) {
    this.switchLanguage(lang);
    this.closeLangDropdown();
  }

  toggleLangDropdown() {
    this.isLangDropdownOpen = !this.isLangDropdownOpen;

    if (this.isLangDropdownOpen) {
      this.unlistenLangDropdown?.();
      this.unlistenLangDropdown = this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    } else {
      this.closeLangDropdown();
    }
  }

  closeLangDropdown() {
    this.isLangDropdownOpen = false;
    this.unlistenLangDropdown?.();
    this.unlistenLangDropdown = undefined;
  }

  // Mirror the navbar/admin-topbar overlays: Escape closes an open dropdown.
  @HostListener('document:keydown.escape')
  closeOnEscape() {
    if (this.isLangDropdownOpen) {
      this.closeLangDropdown();
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    // Each switcher instance owns its own root element, so scope the guard to
    // THIS instance: a click inside keeps it open, anything else closes it.
    const clickedInside =
      this.elementRef.nativeElement.contains(targetElement);

    if (clickedInside) {
      this.isLangDropdownOpen = true;
    } else {
      this.closeLangDropdown();
    }
  }
}
