import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { By } from '@angular/platform-browser';
import { CounterCancelSearchFormComponent } from './counter-cancel-search-form.component';
import { PendingButtonDirective } from '../../../../../shared/directives/pending-button.directive';

describe('CounterCancelSearchFormComponent (OBRS-766)', () => {
  let fixture: ComponentFixture<CounterCancelSearchFormComponent>;
  let component: CounterCancelSearchFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonModule, ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [CounterCancelSearchFormComponent, PendingButtonDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(CounterCancelSearchFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const phoneInput = () => fixture.debugElement.query(By.css('input[formControlName="phone"]'));
  const bookingNumberInput = () =>
    fixture.debugElement.query(By.css('input[formControlName="bookingNumber"]'));
  const modeButtons = () => fixture.debugElement.queryAll(By.css('.ccsf-mode-btn'));

  it('defaults to phone mode, mounting only the phone field', () => {
    expect(phoneInput()).not.toBeNull();
    expect(bookingNumberInput()).toBeNull();
  });

  it('renders exactly two mode buttons, never a dropdown', () => {
    expect(modeButtons().length).toBe(2);
    expect(fixture.debugElement.query(By.css('select'))).toBeNull();
    expect(fixture.debugElement.query(By.css('p-selectbutton'))).toBeNull();
  });

  it('switching mode mounts only the booking-number field and unmounts phone', () => {
    (component as any).selectMode('bookingNumber');
    fixture.detectChanges();

    expect(bookingNumberInput()).not.toBeNull();
    expect(phoneInput()).toBeNull();
  });

  it('the hidden field carries no validators — switching modes never blocks on it', () => {
    (component as any).selectMode('bookingNumber');
    fixture.detectChanges();
    // phone control still exists in the FormGroup (unmounted, not removed)
    // but must be valid with its default empty value.
    expect((component as any).form.get('phone').valid).toBeTrue();
  });

  it('requires a value before emitting — phone mode', () => {
    const search = jasmine.createSpy('search');
    component.search.subscribe(search);

    (component as any).submit();

    expect(search).not.toHaveBeenCalled();
    expect((component as any).form.get('phone').touched).toBeTrue();
  });

  it('emits {mode: "phone", value} for a valid 10-digit phone', () => {
    const search = jasmine.createSpy('search');
    component.search.subscribe(search);

    (component as any).form.get('phone').setValue('0812345678');
    (component as any).submit();

    expect(search).toHaveBeenCalledWith({ mode: 'phone', value: '0812345678' });
  });

  it('rejects a phone that is not a valid 10-digit local number', () => {
    (component as any).form.get('phone').setValue('12345');
    expect((component as any).form.get('phone').invalid).toBeTrue();
  });

  it('upper-cases the booking number as the operator types', () => {
    (component as any).selectMode('bookingNumber');
    fixture.detectChanges();

    const input = bookingNumberInput().nativeElement as HTMLInputElement;
    input.value = 'b-000123';
    input.dispatchEvent(new Event('input'));

    expect((component as any).form.get('bookingNumber').value).toBe('B-000123');
  });

  it('emits {mode: "bookingNumber", value} once a value is entered, with no format regex block', () => {
    const search = jasmine.createSpy('search');
    component.search.subscribe(search);
    (component as any).selectMode('bookingNumber');
    fixture.detectChanges();

    (component as any).form.get('bookingNumber').setValue('NOT-A-REAL-SHAPE');
    (component as any).submit();

    expect(search).toHaveBeenCalledWith({ mode: 'bookingNumber', value: 'NOT-A-REAL-SHAPE' });
  });

  it('disables the active control while [submitting] is true', () => {
    fixture.componentRef.setInput('submitting', true);
    fixture.detectChanges();

    expect((component as any).form.get('phone').disabled).toBeTrue();
  });
});
