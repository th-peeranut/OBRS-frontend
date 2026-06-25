import { FormBuilder } from '@angular/forms';

import { RegisterComponent } from './register.component';
import {
  createLanguageServiceStub,
  createRouterStub,
  createTranslateStub,
} from '../../testing/test-stubs';

/**
 * Renderer2 stub: `listen` records the registration and returns a spy unlisten
 * fn so tests can assert the document click listener is added/removed.
 */
function createRendererStub() {
  const unlisten = jasmine.createSpy('unlisten');
  const listen = jasmine.createSpy('listen').and.returnValue(unlisten);
  return { stub: { listen } as any, listen, unlisten };
}

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let languageService: ReturnType<typeof createLanguageServiceStub>;
  let renderer: ReturnType<typeof createRendererStub>;

  beforeEach(() => {
    languageService = createLanguageServiceStub();
    spyOn(languageService, 'switch').and.callThrough();
    renderer = createRendererStub();

    component = new RegisterComponent(
      createTranslateStub(),
      languageService,
      renderer.stub,
      new FormBuilder(),
      {} as never,
      {} as never,
      {} as never,
      createRouterStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('language switcher', () => {
    it('toggleLangDropdown opens the menu and registers a document click listener', () => {
      expect(component.isLangDropdownOpen).toBeFalse();

      component.toggleLangDropdown();

      expect(component.isLangDropdownOpen).toBeTrue();
      expect(renderer.listen).toHaveBeenCalledWith(
        'document',
        'click',
        jasmine.any(Function)
      );
    });

    it('toggleLangDropdown a second time closes the menu and removes the listener', () => {
      component.toggleLangDropdown();
      component.toggleLangDropdown();

      expect(component.isLangDropdownOpen).toBeFalse();
      expect(renderer.unlisten).toHaveBeenCalled();
    });

    it('selectLanguage switches language and closes the dropdown', () => {
      component.toggleLangDropdown();

      component.selectLanguage('en');

      expect(languageService.switch).toHaveBeenCalledWith('en');
      expect(component.currentLanguage).toBe('en');
      expect(component.isLangDropdownOpen).toBeFalse();
    });

    it('handleLangDropdownOutsideClick keeps the menu open when the trigger is clicked', () => {
      component.toggleLangDropdown();
      const trigger = document.createElement('div');
      trigger.className = 'navbar-lang-dropdown';
      const child = document.createElement('span');
      trigger.appendChild(child);

      component.handleLangDropdownOutsideClick({ target: child } as unknown as Event);

      expect(component.isLangDropdownOpen).toBeTrue();
    });

    it('handleLangDropdownOutsideClick closes the menu when clicking elsewhere', () => {
      component.toggleLangDropdown();
      const outside = document.createElement('div');

      component.handleLangDropdownOutsideClick({ target: outside } as unknown as Event);

      expect(component.isLangDropdownOpen).toBeFalse();
      expect(renderer.unlisten).toHaveBeenCalled();
    });

    it('currentEndonym returns the endonym for the active language', () => {
      component.currentLanguage = 'zh';
      expect(component.currentEndonym).toBe('中文');
    });

    it('currentEndonym falls back to the raw code for an unknown language', () => {
      component.currentLanguage = 'xx';
      expect(component.currentEndonym).toBe('xx');
    });
  });
});
