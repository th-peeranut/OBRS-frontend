import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { LangSwitcherComponent } from './lang-switcher.component';
import { LanguageService } from '../../services/language.service';
import { createLanguageServiceStub } from '../../../testing/test-stubs';

describe('LangSwitcherComponent', () => {
  let fixture: ComponentFixture<LangSwitcherComponent>;
  let component: LangSwitcherComponent;
  let languageServiceStub: ReturnType<typeof createLanguageServiceStub>;

  beforeEach(async () => {
    languageServiceStub = createLanguageServiceStub();
    await TestBed.configureTestingModule({
      declarations: [LangSwitcherComponent],
      imports: [TranslateModule.forRoot()],
      providers: [{ provide: LanguageService, useValue: languageServiceStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(LangSwitcherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('has exactly three languages: en, th, zh', () => {
    expect(component.languages.map((l) => l.code)).toEqual(['en', 'th', 'zh']);
  });

  it('renders the language trigger with aria-haspopup="menu"', () => {
    const trigger = fixture.debugElement.query(By.css('.navbar-lang-trigger'));
    expect(trigger).toBeTruthy();
    expect(trigger.nativeElement.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('the menu is closed initially', () => {
    expect(fixture.debugElement.query(By.css('.navbar-lang-menu'))).toBeNull();
  });

  it('clicking the trigger opens the menu, clicking again closes it', () => {
    const trigger = fixture.debugElement.query(By.css('.navbar-lang-trigger'));

    trigger.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.navbar-lang-menu'))).toBeTruthy();

    trigger.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.navbar-lang-menu'))).toBeNull();
  });

  it('the open menu has role="menu" with three menuitemradio items', () => {
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu.nativeElement.getAttribute('role')).toBe('menu');
    const items = fixture.debugElement.queryAll(
      By.css('.navbar-lang-item[role="menuitemradio"]')
    );
    expect(items.length).toBe(3);
  });

  it('renders all three endonyms', () => {
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    const texts = fixture.debugElement
      .queryAll(By.css('.navbar-lang-item'))
      .map((i) => i.nativeElement.textContent.trim());
    expect(texts.some((t) => t.includes('English'))).toBe(true);
    expect(texts.some((t) => t.includes('ไทย'))).toBe(true);
    expect(texts.some((t) => t.includes('中文'))).toBe(true);
  });

  it('marks the active language with aria-checked and the active class', () => {
    component.currentLanguage = 'th';
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    const thItem = fixture.debugElement
      .queryAll(By.css('.navbar-lang-item'))
      .find((i) => i.nativeElement.textContent.includes('ไทย'))!;
    expect(thItem.nativeElement.getAttribute('aria-checked')).toBe('true');
    expect(thItem.nativeElement.classList.contains('active')).toBe(true);
  });

  it('the trigger label shows the current language endonym', () => {
    component.currentLanguage = 'zh';
    fixture.detectChanges();

    const label = fixture.debugElement.query(By.css('.navbar-lang-label'));
    expect(label.nativeElement.textContent.trim()).toBe('中文');
  });

  it('selecting a language delegates to LanguageService and closes the menu', () => {
    const switchSpy = spyOn(languageServiceStub, 'switch').and.resolveTo();
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    const zhItem = fixture.debugElement
      .queryAll(By.css('.navbar-lang-item'))
      .find((i) => i.nativeElement.textContent.includes('中文'))!;
    zhItem.nativeElement.click();
    fixture.detectChanges();

    expect(switchSpy).toHaveBeenCalledWith('zh');
    expect(component.currentLanguage).toBe('zh');
    expect(fixture.debugElement.query(By.css('.navbar-lang-menu'))).toBeNull();
  });

  it('selectLanguage works for all three codes', () => {
    for (const code of ['en', 'th', 'zh']) {
      component.selectLanguage(code);
      expect(component.currentLanguage).toBe(code);
      expect(component.isLangDropdownOpen).toBe(false);
    }
  });

  it('a click inside the trigger keeps the menu open; an outside click closes it', () => {
    component.toggleLangDropdown();
    expect(component.isLangDropdownOpen).toBe(true);

    const inside = fixture.debugElement.query(By.css('.navbar-lang-trigger'))
      .nativeElement;
    component.handleOutsideClick({ target: inside } as unknown as Event);
    expect(component.isLangDropdownOpen).toBe(true);

    component.handleOutsideClick({
      target: document.createElement('div'),
    } as unknown as Event);
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('Escape closes an open menu', () => {
    component.isLangDropdownOpen = true;
    component.closeOnEscape();
    expect(component.isLangDropdownOpen).toBe(false);
  });

  it('menuAlign="left" adds the align-left class to the menu', () => {
    component.menuAlign = 'left';
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu.nativeElement.classList.contains('align-left')).toBe(true);
  });

  it('the default menu alignment is right (no align-left class)', () => {
    component.isLangDropdownOpen = true;
    fixture.detectChanges();

    const menu = fixture.debugElement.query(By.css('.navbar-lang-menu'));
    expect(menu.nativeElement.classList.contains('align-left')).toBe(false);
  });

  it('currentEndonym falls back to the raw code for an unknown language', () => {
    component.currentLanguage = 'xx';
    expect(component.currentEndonym).toBe('xx');
  });
});
