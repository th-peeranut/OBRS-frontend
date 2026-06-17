import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookerInfoFormComponent } from './booker-info-form.component';
import { PassengerInfo } from '../../../../shared/interfaces/passenger-info.interface';
import { SharedModule } from '../../../../shared/shared.module';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { TranslateModule } from '@ngx-translate/core';

describe('BookerInfoFormComponent', () => {
  let component: BookerInfoFormComponent;
  let fixture: ComponentFixture<BookerInfoFormComponent>;

  const validBooker: PassengerInfo = {
    isAdult: true,
    title: 1,
    firstName: 'Somchai',
    middleName: '',
    lastName: 'Jaidee',
    phoneNumber: '0812345678',
    gender: 'MALE',
    isSelectSeat: false,
    passengerSeat: '',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [BookerInfoFormComponent],
      imports: [
        SharedModule,
        DropdownObrsComponent,
        TranslateModule.forRoot(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookerInfoFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial state', () => {
    it('form is invalid when empty', () => {
      expect(component.bookerForm.valid).toBeFalse();
    });

    it('emits false on init', () => {
      const emitted: boolean[] = [];
      component.validityChange.subscribe((v) => emitted.push(v));
      component.ngOnInit();
      expect(emitted[0]).toBeFalse();
    });
  });

  describe('validateAndGetBooker', () => {
    it('returns null when form is invalid', () => {
      expect(component.validateAndGetBooker()).toBeNull();
    });

    it('returns PassengerInfo when form is valid', () => {
      component.bookerForm.patchValue({
        title: 1,
        firstName: 'Somchai',
        middleName: '',
        lastName: 'Jaidee',
        phoneNumber: '0812345678',
        gender: 'MALE',
      });

      const result = component.validateAndGetBooker();
      expect(result).not.toBeNull();
      expect(result?.firstName).toBe('Somchai');
      expect(result?.phoneNumber).toBe('0812345678');
      expect(result?.title).toBe(1);
    });

    it('normalises title when value is a Dropdown object', () => {
      component.bookerForm.patchValue({
        title: { id: 2, nameThai: 'นางสาว', nameEnglish: 'Miss' },
        firstName: 'Malee',
        lastName: 'Kaew',
        phoneNumber: '0899999999',
        gender: 'FEMALE',
      });

      const result = component.validateAndGetBooker();
      expect(result?.title).toBe(2);
    });
  });

  describe('getCurrentBooker', () => {
    it('returns the current form value without requiring a valid form', () => {
      component.bookerForm.patchValue(validBooker);

      const result = component.getCurrentBooker();

      expect(result?.firstName).toBe('Somchai');
      expect(result?.phoneNumber).toBe('0812345678');
      expect(result?.title).toBe(1);
    });
  });

  describe('phone validation', () => {
    it('rejects phone not starting with 0', () => {
      component.bookerForm.patchValue({
        title: 1, firstName: 'A', lastName: 'B', gender: 'MALE',
        phoneNumber: '1234567890',
      });
      expect(component.bookerForm.get('phoneNumber')?.valid).toBeFalse();
    });

    it('rejects phone shorter than 10 digits', () => {
      component.bookerForm.patchValue({ phoneNumber: '081234' });
      expect(component.bookerForm.get('phoneNumber')?.valid).toBeFalse();
    });

    it('accepts valid 10-digit Thai mobile number', () => {
      component.bookerForm.patchValue({
        title: 1, firstName: 'A', lastName: 'B', gender: 'MALE',
        phoneNumber: '0812345678',
      });
      expect(component.bookerForm.get('phoneNumber')?.valid).toBeTrue();
    });
  });
});
