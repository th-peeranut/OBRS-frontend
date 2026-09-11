import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { NotificationMessageCreditRiseDialogComponent } from './notification-message-credit-rise-dialog.component';

describe('NotificationMessageCreditRiseDialogComponent', () => {
  let fixture: ComponentFixture<NotificationMessageCreditRiseDialogComponent>;
  let component: NotificationMessageCreditRiseDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageCreditRiseDialogComponent, AdminModalBackdropDirective],
      imports: [TranslateModule.forRoot()],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageCreditRiseDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when not visible', () => {
    component.visible = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.admin-modal-backdrop')).toBeNull();
  });

  it('renders the dialog when visible', () => {
    component.visible = true;
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="notification-message-credit-rise-dialog"]')
    ).toBeTruthy();
  });

  it('does not dismiss on a backdrop click — the point is that it must be read', () => {
    component.visible = true;
    fixture.detectChanges();
    const backdrop = fixture.debugElement.query(By.directive(AdminModalBackdropDirective));
    expect(backdrop.injector.get(AdminModalBackdropDirective).dismissOnBackdrop).toBeFalse();
  });

  it('emits confirm', () => {
    component.visible = true;
    fixture.detectChanges();
    const confirmSpy = jasmine.createSpy('confirm');
    component.confirm.subscribe(confirmSpy);

    component['onConfirm']();

    expect(confirmSpy).toHaveBeenCalled();
  });

  it('does not emit confirm while a submit is already in flight', () => {
    component.visible = true;
    component.submitting = true;
    fixture.detectChanges();
    const confirmSpy = jasmine.createSpy('confirm');
    component.confirm.subscribe(confirmSpy);

    component['onConfirm']();

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('emits cancel', () => {
    component.visible = true;
    fixture.detectChanges();
    const cancelSpy = jasmine.createSpy('cancel');
    component.cancel.subscribe(cancelSpy);

    component['onCancel']();

    expect(cancelSpy).toHaveBeenCalled();
  });
});
