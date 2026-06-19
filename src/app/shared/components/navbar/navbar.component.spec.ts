import { BehaviorSubject } from 'rxjs';
import { NavbarComponent } from './navbar.component';
import {
  createElementRefStub,
  createPrimeNgConfigStub,
  createRouterStub,
  createTranslateStub,
} from '../../../testing/test-stubs';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let authStatus$: BehaviorSubject<boolean>;
  let roles: string[];

  function createAuthStub(): any {
    return {
      authStatus$,
      getUsername: () => 'tester',
      hasAnyRole: (required: string[]) =>
        required.some((role) => roles.includes(role)),
    };
  }

  beforeEach(() => {
    authStatus$ = new BehaviorSubject<boolean>(false);
    roles = [];
    component = new NavbarComponent(
      createTranslateStub(),
      createPrimeNgConfigStub(),
      {} as never,
      createElementRefStub(),
      createAuthStub(),
      createRouterStub(),
      {} as never
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('flags admin users when logged in with the admin role', () => {
    roles = ['admin'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isAdmin).toBe(true);
  });

  it('does not flag logged-in users without the admin role', () => {
    roles = ['user'];
    authStatus$.next(true);

    component.ngOnInit();

    expect(component.isAdmin).toBe(false);
  });

  it('clears the admin flag on logout', () => {
    roles = ['admin'];
    authStatus$.next(true);
    component.ngOnInit();
    expect(component.isAdmin).toBe(true);

    roles = [];
    authStatus$.next(false);

    expect(component.isAdmin).toBe(false);
  });

  it('scrolls to the footer contact section', () => {
    const target = document.createElement('div');
    target.id = 'footer-contact';
    const scrollSpy = spyOn(target, 'scrollIntoView');
    document.body.appendChild(target);

    try {
      component.scrollToContact();
      expect(scrollSpy).toHaveBeenCalled();
    } finally {
      document.body.removeChild(target);
    }
  });
});
