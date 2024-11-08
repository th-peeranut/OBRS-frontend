import { Component, ElementRef, HostListener, Renderer2, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  isDropdownOpen = false;
  currentLanguage: string = 'th';

  @ViewChild('dropdownButton', { static: true }) dropdownButton!: ElementRef;

   constructor(
    private translate: TranslateService,
    private renderer: Renderer2,
    private elementRef: ElementRef
  ) {
    this.translate.setDefaultLang('th');
    this.translate.use('th');
  }

  switchLanguage(lang: string) {
    this.isDropdownOpen = false;
    this.currentLanguage = lang;
    this.translate.use(lang);
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      this.renderer.listen('document', 'click', (event: Event) => this.handleOutsideClick(event));
    }
  }

  handleOutsideClick(event: Event) {
    const targetElement = event.target as HTMLElement;
    const clickedInsideDropdown = this.elementRef.nativeElement.contains(targetElement);
    const clickedDropdownButton = this.dropdownButton.nativeElement.contains(targetElement);

    if (clickedInsideDropdown && clickedDropdownButton) {
      this.isDropdownOpen = true;
    }else{
      this.isDropdownOpen = false;
    }
  }
}
