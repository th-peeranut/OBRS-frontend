import { FormBuilder } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';

import { PassengerInfoFormComponent } from './passenger-info-form.component';
import { SharedModule } from '../../../../shared/shared.module';
import { DropdownObrsComponent } from '../../../../shared/components/dropdown-obrs/dropdown-obrs.component';
import { PassengerSeatModule } from '../../passenger-seat.module';
import {
  createRouterStub,
  createStoreStub,
  createTranslateStub,
} from '../../../../testing/test-stubs';

describe('PassengerInfoFormComponent', () => {
  let component: PassengerInfoFormComponent;

  beforeEach(() => {
    component = new PassengerInfoFormComponent(
      createStoreStub(),
      createRouterStub(),
      new FormBuilder(),
      createTranslateStub()
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('seat map always visible (Phase 1-A)', () => {
    it('isSelectSeat defaults to true for every new passenger group', () => {
      // insertPassenger goes through createPassengerGroup
      component.insertPassenger(true);
      const group = component.passengerData.at(0);
      expect(group.get('isSelectSeat')?.value).toBeTrue();
    });

    it('isSelectSeat defaults to true for child passengers too', () => {
      component.insertPassenger(false);
      const group = component.passengerData.at(0);
      expect(group.get('isSelectSeat')?.value).toBeTrue();
    });
  });

  describe('per-leg return seats (Phase B)', () => {
    it('passengerSeatReturn defaults to empty for every new passenger group', () => {
      component.insertPassenger(true);
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('');
    });

    it('setPassengerSeatReturn sets the return seat without touching the outbound seat', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '3');
      component.setPassengerSeatReturn(0, '7');
      expect(component.getFormValue(0, 'passengerSeat')).toBe('3');
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('7');
    });

    it('outbound and return pools are independent — the same label is allowed on each leg', () => {
      component.insertPassenger(true);
      component.setPassengerSeat(0, '5');
      component.setPassengerSeatReturn(0, '5');
      expect(component.getFormValue(0, 'passengerSeat')).toBe('5');
      expect(component.getFormValue(0, 'passengerSeatReturn')).toBe('5');
    });

    it('getTakenSeatsReturn excludes the current passenger and lists the others’ return seats', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeatReturn(0, '2');
      component.setPassengerSeatReturn(1, '4');
      expect(component.getTakenSeatsReturn(0)).toEqual(['4']);
      expect(component.getTakenSeatsReturn(1)).toEqual(['2']);
    });

    it('setPassengerSeatReturn refuses a seat already taken by another passenger on the return leg', () => {
      component.insertPassenger(true);
      component.insertPassenger(true);
      component.setPassengerSeatReturn(0, '6');
      component.setPassengerSeatReturn(1, '6');
      expect(component.getFormValue(1, 'passengerSeatReturn')).toBe('');
    });
  });

  describe('fare-category radio (OBRS-296) — FormControl-level sanity check only', () => {
    // NOTE: a bare FormControl.setValue() never coerces types, so this only
    // confirms the control itself is untyped-boolean-friendly — it does NOT
    // exercise the template's [value] binding or the RadioControlValueAccessor,
    // which is the only place the string-coercion bug (value="false" -> string
    // "false" -> truthy -> every child billed as adult) can actually occur.
    // The real lock for that bug is the DOM/CVA-driven describe block below
    // ("fare-category radio (OBRS-296) — real DOM/CVA path").
    it('setValue(false)/setValue(true) round-trip as real booleans, never strings', () => {
      component.insertPassenger(true); // starts adult
      const group = component.passengerData.at(0);

      group.get('isAdult')?.setValue(false);
      expect(group.get('isAdult')?.value).toBe(false);
      expect(typeof group.get('isAdult')?.value).toBe('boolean');

      group.get('isAdult')?.setValue(true);
      expect(group.get('isAdult')?.value).toBe(true);
      expect(typeof group.get('isAdult')?.value).toBe('boolean');
    });
  });
});

// OBRS-296 (Scrutinize follow-up): the FormControl-level test above is
// vacuous against the actual coercion bug — a bare FormControl never coerces
// on setValue(), so it would still pass even if the template regressed to
// the gender radios' string-attribute form (`value="false"`). This suite
// renders the real template via TestBed and drives the native radio inputs
// through a real click + change event, which is the ONLY path
// RadioControlValueAccessor's string-vs-boolean coercion can occur on. A
// revert to `value="false"`/`value="true"` (string attribute) makes the
// child radio's `value` DOM property become the string "false", so
// RadioControlValueAccessor would write the STRING back to the FormControl —
// failing the `typeof ... === 'boolean'` assertions below.
describe('PassengerInfoFormComponent — fare-category radio (OBRS-296) — real DOM/CVA path', () => {
  let fixture: ComponentFixture<PassengerInfoFormComponent>;
  let component: PassengerInfoFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerInfoFormComponent],
      imports: [SharedModule, DropdownObrsComponent, PassengerSeatModule, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: createStoreStub() },
        { provide: Router, useValue: createRouterStub() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PassengerInfoFormComponent);
    component = fixture.componentInstance;
    // The store/schedule-filter streams are stubbed to emit null (see
    // createStoreStub()), so ngOnInit's auto-insert-from-schedule-filter path
    // never fires — insert the one passenger group this suite needs directly,
    // same as the bare-instantiation suite above.
    component.insertPassenger(true); // starts Adult
    fixture.detectChanges();
  });

  function radioEl(id: string): HTMLInputElement {
    const el = fixture.nativeElement.querySelector(`#${id}`) as HTMLInputElement | null;
    if (!el) {
      throw new Error(`Radio input #${id} not found in the rendered template`);
    }
    return el;
  }

  it('selecting the Child radio through the DOM writes a real boolean false — never the string "false"', () => {
    const childRadio = radioEl('fareCategory_child-0');

    childRadio.click();
    fixture.detectChanges();

    const value = component.passengerData.at(0).get('isAdult')?.value;
    expect(typeof value).toBe('boolean');
    expect(value).toBe(false);
    expect(value as unknown).not.toBe('false');
  });

  it('selecting the Adult radio through the DOM writes a real boolean true — never the string "true"', () => {
    // Start the group as Child so selecting Adult is an observable transition.
    component.passengerData.at(0).get('isAdult')?.setValue(false);
    fixture.detectChanges();

    const adultRadio = radioEl('fareCategory_adult-0');
    adultRadio.click();
    fixture.detectChanges();

    const value = component.passengerData.at(0).get('isAdult')?.value;
    expect(typeof value).toBe('boolean');
    expect(value).toBe(true);
    expect(value as unknown).not.toBe('true');
  });

  it('the rendered radios reflect the boolean isAdult value — Adult checked by default, Child unchecked', () => {
    // insertPassenger(true) in beforeEach starts the group as Adult.
    expect(radioEl('fareCategory_adult-0').checked).toBeTrue();
    expect(radioEl('fareCategory_child-0').checked).toBeFalse();
  });
});
