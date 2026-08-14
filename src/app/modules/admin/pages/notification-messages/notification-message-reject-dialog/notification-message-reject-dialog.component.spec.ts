import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { NotificationMessageRejectDialogComponent } from './notification-message-reject-dialog.component';

describe('NotificationMessageRejectDialogComponent', () => {
  let fixture: ComponentFixture<NotificationMessageRejectDialogComponent>;
  let component: NotificationMessageRejectDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageRejectDialogComponent, AdminModalBackdropDirective],
      imports: [FormsModule, TranslateModule.forRoot()],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageRejectDialogComponent);
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
    expect(fixture.nativeElement.querySelector('.admin-modal-backdrop')).toBeTruthy();
  });

  it('Confirm is disabled until the reason is non-blank', () => {
    component.visible = true;
    fixture.detectChanges();
    const confirmBtn: HTMLButtonElement = fixture.debugElement.query(
      By.css('[data-testid="notification-message-reject-confirm"]')
    ).nativeElement;
    expect(confirmBtn.disabled).toBeTrue();

    component['reason'] = 'a real reason';
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBeFalse();
  });

  it('emits confirm with the trimmed reason', () => {
    component.visible = true;
    fixture.detectChanges();
    const confirmSpy = jasmine.createSpy('confirm');
    component.confirm.subscribe(confirmSpy);

    component['reason'] = '  padded reason  ';
    component['onConfirm']();

    expect(confirmSpy).toHaveBeenCalledWith('padded reason');
  });

  it('does not emit confirm for a blank reason (defensive — Confirm is already disabled)', () => {
    component.visible = true;
    fixture.detectChanges();
    const confirmSpy = jasmine.createSpy('confirm');
    component.confirm.subscribe(confirmSpy);

    component['reason'] = '   ';
    component['onConfirm']();

    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('resets the reason every time the dialog re-opens', () => {
    component.visible = true;
    component.ngOnChanges({ visible: { currentValue: true } as any });
    component['reason'] = 'leftover from a previous attempt';

    component.visible = false;
    component.ngOnChanges({ visible: { currentValue: false } as any });
    component.visible = true;
    component.ngOnChanges({ visible: { currentValue: true } as any });

    expect(component['reason']).toBe('');
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
