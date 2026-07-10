import { AccountPageComponent } from './account-page.component';

describe('AccountPageComponent', () => {
  function create(username: string | null): { component: AccountPageComponent } {
    const authServiceStub = { getUsername: () => username };
    const component = new AccountPageComponent(authServiceStub as never);
    return { component };
  }

  it('should create', () => {
    const { component } = create('user@example.com');
    expect(component).toBeTruthy();
  });

  it('reads the current login email from AuthService on init (no new GET)', () => {
    const { component } = create('user@example.com');

    component.ngOnInit();

    expect(component.currentEmail).toBe('user@example.com');
  });

  it('starts with the change-email dialog closed', () => {
    const { component } = create('user@example.com');
    expect(component.isChangeEmailDialogOpen).toBe(false);
  });

  it('opens the change-email dialog', () => {
    const { component } = create('user@example.com');

    component.openChangeEmailDialog();

    expect(component.isChangeEmailDialogOpen).toBe(true);
  });

  it('closes the change-email dialog', () => {
    const { component } = create('user@example.com');
    component.openChangeEmailDialog();

    component.closeChangeEmailDialog();

    expect(component.isChangeEmailDialogOpen).toBe(false);
  });
});
