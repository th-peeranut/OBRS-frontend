import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { UserDeleteModalComponent } from './user-delete-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { UserRow } from '../user-management.mappers';
import { TitleLabelPipe } from '../../../../../shared/pipes/title-label.pipe';

const JOHN_ROW: UserRow = {
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
};

describe('UserDeleteModalComponent', () => {
  let fixture: ComponentFixture<UserDeleteModalComponent>;
  let component: UserDeleteModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TitleLabelPipe, CommonModule, TranslateModule.forRoot()],
      declarations: [UserDeleteModalComponent, AdminModalBackdropDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDeleteModalComponent);
    component = fixture.componentInstance;
  });

  it('does not render when isOpen is false', () => {
    component.isOpen = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.admin-modal-backdrop'))).toBeNull();
  });

  it('renders the user full name when isOpen is true', () => {
    component.isOpen = true;
    component.user = JOHN_ROW;
    fixture.detectChanges();

    const strong = fixture.debugElement.query(By.css('.admin-modal-subtitle strong'));
    expect(strong.nativeElement.textContent).toContain('Mr John Doe');
  });

  it('disables the confirm button and shows the deleting label while isDeleting', () => {
    component.isOpen = true;
    component.user = JOHN_ROW;
    component.isDeleting = true;
    fixture.detectChanges();

    const confirmButton = fixture.debugElement.query(By.css('.admin-btn-primary'));
    expect(confirmButton.nativeElement.disabled).toBeTrue();
    expect(confirmButton.nativeElement.textContent.trim()).toBe('ADMIN.USERS.CLOSING');
  });

  // OBRS-653: DELETE /users/{id} anonymises the row and keeps it, so the
  // confirm has to say so before the admin agrees on the customer's behalf.
  // AC-2 asks for two outcomes; the released email address is the third,
  // because it is the question the admin gets asked next.
  it('states what closing the account actually does', () => {
    component.isOpen = true;
    component.user = JOHN_ROW;
    fixture.detectChanges();

    const points = fixture.debugElement
      .queryAll(By.css('.user-close-points li'))
      .map((li) => li.nativeElement.textContent.trim());

    expect(points).toEqual([
      'ADMIN.USERS.CLOSE_POINT_LOGIN',
      'ADMIN.USERS.CLOSE_POINT_RECORDS',
      'ADMIN.USERS.CLOSE_POINT_EMAIL',
    ]);
  });

  it('emits confirm/cancel on button clicks', () => {
    component.isOpen = true;
    component.user = JOHN_ROW;
    fixture.detectChanges();

    const confirmSpy = jasmine.createSpy('confirm');
    const cancelSpy = jasmine.createSpy('cancel');
    component.confirm.subscribe(confirmSpy);
    component.cancel.subscribe(cancelSpy);

    const buttons = fixture.debugElement.queryAll(By.css('.admin-modal-actions button'));
    buttons[0].nativeElement.click(); // Cancel
    buttons[1].nativeElement.click(); // Confirm

    expect(cancelSpy).toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
  });
});
