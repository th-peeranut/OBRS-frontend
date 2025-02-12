import { Component, ElementRef, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNGConfig } from 'primeng/api';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss',
})
export class NavbarComponent implements OnDestroy  {
  isDropdownOpen: boolean = false;
  isShowPassword: boolean = false;

  currentLanguage: string = 'th';

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

  languageOnChange$: Subscription;

  constructor(
    private translate: TranslateService,
    private primengConfig: PrimeNGConfig,
    private renderer: Renderer2,
    private elementRef: ElementRef,
  ) {
    const currentLanguage = this.translate.currentLang;
    this.switchLanguage(currentLanguage ? currentLanguage : 'th');
  }

  ngOnDestroy(): void {
    if (this.languageOnChange$) this.languageOnChange$.unsubscribe();
  }

  switchLanguage(lang: string) {
    this.isDropdownOpen = false;
    this.currentLanguage = lang;
    this.translate.use(lang);
    this.languageOnChange$ = this.translate
      .get('CALENDAR')
      .subscribe((res) => this.primengConfig.setTranslation(res));
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      this.renderer.listen('document', 'click', (event: Event) =>
        this.handleOutsideClick(event)
      );
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown =
      this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton =
      this.dropdownButton.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    } else {
      this.isDropdownOpen = false;
    }
  }

  toggleShowPassword() {
    this.isShowPassword = !this.isShowPassword;
  }
}
