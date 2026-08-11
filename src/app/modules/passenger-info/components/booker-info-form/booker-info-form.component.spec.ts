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
    email: 'somchai@example.com',
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

  // OBRS-455: the booker's phone becomes contact_phone_snapshot, which six SMS senders read. It
  // used to accept /^0\d{9}$/ — i.e. a Bangkok landline, for a number we then text. This is the
  // pinning test for the narrowing; the passenger form keeps the wider rule on purpose.
  describe('phone rule (SMS destination)', () => {
    it('rejects a Bangkok landline that the old 10-digit rule accepted', () => {
      const ctrl = component.bookerForm.get('phoneNumber');
      ctrl?.setValue('0212345678');
      expect(ctrl?.valid).toBeFalse();
    });

    it('accepts each real Thai mobile prefix, grouped or bare', () => {
      const ctrl = component.bookerForm.get('phoneNumber');
      for (const value of ['0612345678', '0812345678', '0912345678', '081-234-5678']) {
        ctrl?.setValue(value);
        expect(ctrl?.valid).withContext(value).toBeTrue();
      }
    });
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
        email: 'somchai@example.com',
      });

      const result = component.validateAndGetBooker();
      expect(result).not.toBeNull();
      expect(result?.firstName).toBe('Somchai');
      expect(result?.phoneNumber).toBe('0812345678');
      expect(result?.title).toBe(1);
      expect(result?.email).toBe('somchai@example.com');
    });

    it('normalises title when value is a Dropdown object', () => {
      component.bookerForm.patchValue({
        title: { id: 2, nameThai: 'นางสาว', nameEnglish: 'Miss' },
        firstName: 'Malee',
        lastName: 'Kaew',
        phoneNumber: '0899999999',
        gender: 'FEMALE',
        email: 'malee@example.com',
      });

      const result = component.validateAndGetBooker();
      expect(result?.title).toBe(2);
    });

    // OBRS-858 (ADR-0123 Decision 5): this used to expect null. Inverted rather than deleted —
    // it is now THE assertion guest checkout stands on, because a guest may have no mailbox and
    // a form that still refused a blank address would make the whole feature unreachable behind
    // a validation error no backend change could clear.
    it('returns the booker when email is missing — email is optional', () => {
      component.bookerForm.patchValue({
        title: 1,
        firstName: 'Somchai',
        lastName: 'Jaidee',
        phoneNumber: '0812345678',
        gender: 'MALE',
        email: '',
      });

      const result = component.validateAndGetBooker();
      expect(result).not.toBeNull();
      expect(result?.email).toBe('');
    });

    // Optional does not mean unvalidated. Kept unchanged and deliberately adjacent to the test
    // above: together they say "absent is fine, nonsense is not".
    it('returns null when email format is invalid', () => {
      component.bookerForm.patchValue({
        title: 1,
        firstName: 'Somchai',
        lastName: 'Jaidee',
        phoneNumber: '0812345678',
        gender: 'MALE',
        email: 'not-an-email',
      });

      expect(component.validateAndGetBooker()).toBeNull();
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

  /**
   * OBRS-1231. The DropdownObrsComponent unit test proves the isDefault branch calls
   * onChange() — but that is the component in isolation. What decides whether a title
   * reaches the payload is the real binding order against a reactive control, which is
   * what this mounts.
   *
   * Measured on /register in a browser: the PRE-FIX control came out null as well,
   * because writeValue(null) runs after ngOnChanges and clears what it wrote. So the
   * isDefault flag was a latent trap, not a live defect on that page — worth removing,
   * but this test is a boundary pin rather than a proof of an old bug. It goes red the
   * moment anything (an isDefault flag, a patchValue, a future "sensible default")
   * starts putting a title in this control unasked.
   */
  describe('OBRS-1231 — the title control after a real bind', () => {
    it('holds nothing until the booker chooses', () => {
      expect(component.bookerForm.get('title')?.value).toBeNull();
    });

    it('is valid while empty — nothing about this form requires a title', () => {
      expect(component.bookerForm.get('title')?.valid).toBeTrue();
    });
  });
});
