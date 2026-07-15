import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { UserListTableComponent } from './user-list-table.component';
import { UserRow } from '../user-management.mappers';

function makeRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    fullName: 'Mr John Doe',
    email: 'john@example.com',
    phone: '0812345678',
    roleSlugs: ['admin'],
    roles: ['Admin'],
    status: 'Active',
    statusCode: 'active',
    lastLogin: '-',
    hasLoggedIn: false,
    locked: false,
    ...overrides,
  };
}

describe('UserListTableComponent (logic)', () => {
  function makeComponent(): UserListTableComponent {
    return new UserListTableComponent();
  }

  it('statusClass delegates to the shared mapper', () => {
    const component = makeComponent();
    expect((component as any).statusClass('active')).toBe('is-success');
    expect((component as any).statusClass('pending')).toBe('is-warning');
    expect((component as any).statusClass('inactive')).toBe('is-danger');
  });
});

describe('UserListTableComponent (template)', () => {
  let fixture: ComponentFixture<UserListTableComponent>;
  let component: UserListTableComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, TranslateModule.forRoot()],
      declarations: [UserListTableComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UserListTableComponent);
    component = fixture.componentInstance;
  });

  it('renders skeleton rows while isLoading is true', () => {
    component.isLoading = true;
    component.rows = [];
    fixture.detectChanges();

    const skeletonRows = fixture.debugElement.queryAll(By.css('tr.admin-skeleton-row'));
    expect(skeletonRows.length).toBe(5);
  });

  it('renders one row per user', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 }), makeRow({ id: 2, fullName: 'Ms Jane Roe' })];
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr:not(.admin-empty-row)'));
    expect(rows.length).toBe(2);
  });

  it('renders the empty row when rows is empty and there is no error', () => {
    component.isLoading = false;
    component.rows = [];
    component.hasError = false;
    fixture.detectChanges();

    const emptyRow = fixture.debugElement.query(By.css('tr.admin-empty-row'));
    expect(emptyRow).withContext('empty row should render').toBeTruthy();
  });

  it('does not render the empty row when rows is empty but hasError is true', () => {
    component.isLoading = false;
    component.rows = [];
    component.hasError = true;
    fixture.detectChanges();

    const emptyRow = fixture.debugElement.query(By.css('tr.admin-empty-row'));
    expect(emptyRow).withContext('empty row should not render on error').toBeNull();
  });

  it('shows the locked badge and unlock action only for a locked row when canUnlock is true', () => {
    component.isLoading = false;
    component.canUnlock = true;
    component.rows = [makeRow({ id: 1, locked: true })];
    fixture.detectChanges();

    const lockedBadge = fixture.debugElement.query(By.css('.admin-status.is-warning'));
    expect(lockedBadge).withContext('locked badge should render').toBeTruthy();

    const unlockButton = fixture.debugElement.query(
      By.css('.admin-inline-actions .admin-icon-btn')
    );
    expect(unlockButton.nativeElement.getAttribute('aria-label')).toBeTruthy();
  });

  it('hides the unlock action for a locked row when canUnlock is false', () => {
    component.isLoading = false;
    component.canUnlock = false;
    component.rows = [makeRow({ id: 1, locked: true })];
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.admin-inline-actions .admin-icon-btn'));
    // Only edit + delete remain — no unlock button.
    expect(buttons.length).toBe(2);
  });

  it('emits edit/delete/unlock with the user row on each action button click', () => {
    component.isLoading = false;
    component.canUnlock = true;
    const row = makeRow({ locked: true });
    component.rows = [row];
    fixture.detectChanges();

    const editSpy = jasmine.createSpy('edit');
    const deleteSpy = jasmine.createSpy('delete');
    const unlockSpy = jasmine.createSpy('unlock');
    component.edit.subscribe(editSpy);
    component.delete.subscribe(deleteSpy);
    component.unlock.subscribe(unlockSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-inline-actions .admin-icon-btn'));
    expect(buttons.length).toBe(3);
    buttons[0].nativeElement.click(); // unlock
    buttons[1].nativeElement.click(); // edit
    buttons[2].nativeElement.click(); // delete

    expect(unlockSpy).toHaveBeenCalledWith(row);
    expect(editSpy).toHaveBeenCalledWith(row);
    expect(deleteSpy).toHaveBeenCalledWith(row);
  });

  // OBRS-182: real last-login activity replaces the misleading
  // updatedAt-based "lastActive" display.
  it('renders the formatted last-login value when the user has logged in', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1, lastLogin: '8 Jul 2026 08:32', hasLoggedIn: true })];
    fixture.detectChanges();

    const cell = fixture.debugElement.query(By.css('.admin-cell-stack .admin-muted'));
    expect(cell.nativeElement.textContent).toContain('8 Jul 2026 08:32');
  });

  it('renders the "never signed in" fallback when hasLoggedIn is false', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1, lastLogin: '-', hasLoggedIn: false })];
    fixture.detectChanges();

    const cell = fixture.debugElement.query(By.css('.admin-cell-stack .admin-muted'));
    expect(cell.nativeElement.textContent).toContain('ADMIN.USERS.NEVER_LOGGED_IN');
  });

  // OBRS-330: the template renders row.roles verbatim (`{{ role }}`) — it
  // trusts the mapper (toUserRow/extractRoleLabels) to have already
  // localized each entry, so a Thai/Chinese label renders through
  // unmodified rather than the raw English slug.
  it('renders each already-localized role label as its own chip', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1, roleSlugs: ['owner'], roles: ['เจ้าของกิจการ'] })];
    fixture.detectChanges();

    const chips = fixture.debugElement.queryAll(By.css('.admin-chip'));
    expect(chips.length).toBe(1);
    expect(chips[0].nativeElement.textContent.trim()).toBe('เจ้าของกิจการ');
  });

  it('renders the totalCount and filtered rows.length in the footer', () => {
    component.isLoading = false;
    component.rows = [makeRow({ id: 1 })];
    component.totalCount = 7;
    fixture.detectChanges();

    const footer = fixture.debugElement.query(By.css('.admin-table-footer span'));
    expect(footer.nativeElement.textContent).toContain('7');
  });
});
