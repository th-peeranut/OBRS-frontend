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
        email: 'somchai@example.com',
      });

      const result = component.validateAndGetBooker();
      expect(result).not.toBeNull();
      expect(result?.firstName).toBe('Somchai');
      expect(result?.phoneNumber).toBe('0812345678');
      expect(result?.title).toBe(1);
      expect(result?.email).toBe('somchai@example.com');
    });

    // OBRS-1944: was "returns the booker when gender/status is missing — the field is optional"
    // (OBRS-1357). The field is not optional any more, it is gone: it reached no consumer
    // (buildContactPayload sends 7 fields, ContactReqDto has no column). Asserted on the form
    // rather than deleted, so re-adding the control goes RED here instead of silently shipping.
    it('has no gender/status control at all — the booker is never asked for one', () => {
      expect(component.bookerForm.get('gender')).toBeNull();
    });

    it('normalises title when value is a Dropdown object', () => {
      component.bookerForm.patchValue({
        title: { id: 2, nameThai: 'นางสาว', nameEnglish: 'Miss' },
        firstName: 'Malee',
        lastName: 'Kaew',
        phoneNumber: '0899999999',
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
        title: 1, firstName: 'A', lastName: 'B',
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
        title: 1, firstName: 'A', lastName: 'B',
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

  // OBRS-1944: was 'gender/status radios (OBRS-1365 nun option)' — 4 radios that wrote to a
  // control nothing on the wire could receive. Inverted rather than deleted: the assertion the
  // card actually stands on is that the rendered booker form asks for none of it.
  describe('gender/status radios are gone (OBRS-1944)', () => {
    it('renders no booker gender/status radio', () => {
      const radios = fixture.nativeElement.querySelectorAll('input[type="radio"][id^="booker-gender_"]');
      expect(radios.length).toBe(0);
    });

    it('renders none of the gender/status icons', () => {
      const icons = fixture.nativeElement.querySelectorAll(
        'img[src="icons/passenger-male.svg"], img[src="icons/passenger-female.svg"], img[src="icons/passenger-monk.svg"], img[src="icons/passenger-nun.svg"]'
      );
      expect(icons.length).toBe(0);
    });
  });
  // OBRS-1953: ชื่อกลาง and อีเมล are optional and used to take a half-row each, reading as
  // heavy as "นามสกุล *". They now sit behind a disclosure link. This is layout only — the
  // pinning assertion is that neither control's validity changed.
  describe('optional fields behind a disclosure link (OBRS-1953)', () => {
    function el(id: string): HTMLElement | null {
      return fixture.nativeElement.querySelector(`#${id}`);
    }

    it('keeps the required fields in the first view and hides only the optional two', () => {
      expect(el('booker-title')).withContext('title').toBeTruthy();
      expect(el('booker-firstName')).withContext('firstName').toBeTruthy();
      expect(el('booker-lastName')).withContext('lastName').toBeTruthy();
      expect(el('booker-phoneNumber')).withContext('phoneNumber').toBeTruthy();

      expect(el('booker-middleName')).withContext('middleName').toBeNull();
      expect(el('booker-email')).withContext('email').toBeNull();
    });

    it('offers a real <button> for each, reachable by Tab rather than a div with a click', () => {
      for (const id of ['booker-email-disclosure', 'booker-middleName-disclosure']) {
        const button = el(id);
        expect(button).withContext(id).toBeTruthy();
        expect(button?.tagName).withContext(id).toBe('BUTTON');
        // A <button> is tabbable by default; an explicit tabindex="-1" would undo that.
        expect(button?.getAttribute('tabindex')).withContext(id).toBeNull();
        expect(button?.getAttribute('aria-expanded')).withContext(id).toBe('false');
      }
    });

    it('reveals the field when its link is activated', () => {
      (el('booker-email-disclosure') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el('booker-email')).toBeTruthy();
      expect(el('booker-email-disclosure')?.getAttribute('aria-expanded')).toBe('true');
      // The other one is independent.
      expect(el('booker-middleName')).toBeNull();
    });

    it('collapsing again hides the field but does not clear what was typed', () => {
      (el('booker-email-disclosure') as HTMLButtonElement).click();
      fixture.detectChanges();
      component.bookerForm.get('email')?.setValue('somchai@example.com');

      (el('booker-email-disclosure') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(el('booker-email')).withContext('hidden again').toBeNull();
      expect(component.bookerForm.get('email')?.value).toBe('somchai@example.com');
    });

    // The AC most likely to be got wrong: Back from /payment puts values into the form,
    // and a filled field hidden behind a link nobody would click reads as an empty form.
    it('opens itself for a value that is already in the form', () => {
      component.bookerForm.patchValue({
        middleName: 'Chai',
        email: 'somchai@example.com',
      });
      fixture.detectChanges();

      expect(el('booker-middleName')).withContext('middleName').toBeTruthy();
      expect(el('booker-email')).withContext('email').toBeTruthy();
    });

    it('changes no validator — required stays required, optional stays optional', () => {
      const form = component.bookerForm;
      form.patchValue({ firstName: 'Somchai', lastName: 'Jaidee', phoneNumber: '0812345678' });

      // Both optional fields empty and out of sight: the form is still valid.
      expect(form.valid).withContext('collapsed + empty').toBeTrue();

      // Still format-checked when filled (OBRS-858), collapsed or not.
      form.get('email')?.setValue('not-an-email');
      expect(form.valid).withContext('bad email while collapsed').toBeFalse();
      form.get('email')?.setValue('');

      // And the required ones did not become optional.
      form.get('firstName')?.setValue('');
      expect(form.valid).withContext('firstName still required').toBeFalse();
    });
  });

  // OBRS-641: on a phone these fields opened the full QWERTY keyboard and the browser had no
  // token to autofill the customer's own contact details against. inputmode is a keyboard hint
  // only - the phone rule above still owns validation and must not soften to match it.
  describe('mobile keyboard + autofill hints (OBRS-641)', () => {
    function inputEl(id: string): HTMLInputElement {
      const el = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement | null;
      if (!el) {
        throw new Error(`Input #${id} not found in the rendered template`);
      }
      return el;
    }

    it('the phone field opens the telephone keypad and offers the tel autofill', () => {
      const el = inputEl('booker-phoneNumber');
      expect(el.getAttribute('inputmode')).toBe('tel');
      expect(el.getAttribute('autocomplete')).toBe('tel');
    });

    it('the name and email fields carry their matching autofill tokens', () => {
      // OBRS-1953: middleName and email start behind a disclosure link, so they have
      // to be expanded before they are in the DOM to be asked about. The attributes
      // themselves are unchanged.
      component.toggleMiddleName();
      component.toggleEmail();
      fixture.detectChanges();

      expect(inputEl('booker-firstName').getAttribute('autocomplete')).toBe('given-name');
      expect(inputEl('booker-middleName').getAttribute('autocomplete')).toBe('additional-name');
      expect(inputEl('booker-lastName').getAttribute('autocomplete')).toBe('family-name');
      expect(inputEl('booker-email').getAttribute('autocomplete')).toBe('email');
    });

    // AC-6: the keypad lets you type 4 digits just as happily as 10. The validator is what
    // rejects them, and it is unchanged.
    it('still rejects a phone number the keypad would happily let you type', () => {
      const ctrl = component.bookerForm.get('phoneNumber');
      ctrl?.setValue('0812');
      expect(ctrl?.valid).toBeFalse();
    });
  });
});
