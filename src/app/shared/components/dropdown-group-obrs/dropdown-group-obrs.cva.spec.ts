// OBRS-916 — ControlValueAccessor contract for DropdownGroupObrsComponent.
//
// Kept in its own file (rather than folded into dropdown-group-obrs.component.spec.ts)
// because every case here drives the component through a REAL `formControlName`
// host, not through the `[value]`/(currentValue) inputs the other spec covers.
// Those are two different binding paths into the same component and the whole
// OBRS-916 defect was that only one of them was ever exercised.
//
// All five cases below were RED before the fix — measured, not assumed:
//   R1 trigger text was 'SHARED.SELECT_PLACEHOLDER'  R2 .is-placeholder was true
//   R3 the control received the option OBJECT        R4 touched stayed false
//   R5 form.disable() left the button operable
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DropdownGroupObrsComponent } from './dropdown-group-obrs.component';

const STATION_OPTIONS = [
  {
    id: 1,
    slug: 'bangkok-mochit',
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
    display: [
      { locale: 'th', label: 'สถานีหมอชิต' },
      { locale: 'en', label: 'Bangkok Mo Chit Station' },
    ],
  },
  {
    id: 2,
    slug: 'chiangmai-arcade',
    status: 'active',
    stopType: 'station',
    createdAt: '',
    updatedAt: '',
    display: [
      { locale: 'th', label: 'สถานีเชียงใหม่อาเขต' },
      { locale: 'en', label: 'Chiang Mai Arcade Station' },
    ],
  },
];

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, DropdownGroupObrsComponent],
  template: `
    <form [formGroup]="form">
      <app-dropdown-group-obrs
        formControlName="origin"
        [options]="options"
        [isLabel]="true"
        label="HOME.SOURCE"
      ></app-dropdown-group-obrs>
    </form>
  `,
})
class HostComponent {
  options: any[] = STATION_OPTIONS;
  form = new FormGroup({ origin: new FormControl<unknown>(null) });
}

describe('DropdownGroupObrsComponent — ControlValueAccessor contract (OBRS-916)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  function trigger(): HTMLElement {
    return fixture.nativeElement.querySelector('.value-text') as HTMLElement;
  }
  function triggerButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button.dropdown-btn') as HTMLButtonElement;
  }
  function dropdownComponent(): DropdownGroupObrsComponent {
    return fixture.debugElement.children[0].children[0].componentInstance;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
    }).compileComponents();

    // Pin the language BEFORE the first render: with `currentLang` unset,
    // getValue()'s fallback chain resolves the 'en' label, so a Thai assertion
    // below would fail for a reason that has nothing to do with the CVA path.
    TestBed.inject(TranslateService).use('th');

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders a value written by the parent form control (writeValue resolves selectedValue)', () => {
    host.form.controls.origin.setValue(1);
    fixture.detectChanges();

    expect(trigger().textContent?.trim()).toBe('สถานีหมอชิต');
  });

  it('stops painting the placeholder once the control holds a value', () => {
    host.form.controls.origin.setValue(1);
    fixture.detectChanges();

    expect(trigger().classList.contains('is-placeholder')).toBe(false);
  });

  // Must-NOT case: the placeholder is still expected while the control is empty —
  // without this, "always resolve" and "never resolve" would both pass the pair above.
  it('still paints the placeholder while the control is empty', () => {
    expect(trigger().classList.contains('is-placeholder')).toBe(true);
    expect(host.form.controls.origin.value).toBeNull();
  });

  it('clears the rendered value when the control is reset back to null', () => {
    host.form.controls.origin.setValue(1);
    fixture.detectChanges();
    host.form.controls.origin.setValue(null);
    fixture.detectChanges();

    expect(trigger().classList.contains('is-placeholder')).toBe(true);
  });

  it('pushes the option ID to the control — the same shape writeValue accepts', () => {
    dropdownComponent().setCurrentValue(STATION_OPTIONS[1]);
    fixture.detectChanges();

    expect(host.form.controls.origin.value).toBe(2);
  });

  // The round-trip is the point of R3: whatever onChange emits must be something
  // writeValue can render again. An object-out/id-in mismatch passes the assertion
  // above only by accident, so close the loop explicitly.
  it('round-trips its own output — a picked option re-renders after being written back', () => {
    dropdownComponent().setCurrentValue(STATION_OPTIONS[1]);
    fixture.detectChanges();

    const emitted = host.form.controls.origin.value;
    host.form.controls.origin.setValue(null);
    fixture.detectChanges();
    host.form.controls.origin.setValue(emitted);
    fixture.detectChanges();

    expect(trigger().textContent?.trim()).toBe('สถานีเชียงใหม่อาเขต');
  });

  it('marks the control touched when the dropdown panel closes (onTouched)', () => {
    expect(host.form.controls.origin.touched).toBe(false);

    // Bootstrap fires this on the toggle button — see ngAfterViewInit.
    triggerButton().dispatchEvent(new CustomEvent('hidden.bs.dropdown'));
    fixture.detectChanges();

    expect(host.form.controls.origin.touched).toBe(true);
  });

  it('disables the trigger button when the control is disabled (setDisabledState)', () => {
    expect(triggerButton().disabled).toBe(false);

    host.form.controls.origin.disable();
    fixture.detectChanges();

    expect(triggerButton().disabled).toBe(true);
  });

  it('re-enables the trigger button when the control is enabled again', () => {
    host.form.controls.origin.disable();
    fixture.detectChanges();
    host.form.controls.origin.enable();
    fixture.detectChanges();

    expect(triggerButton().disabled).toBe(false);
  });

  it('resolves a value written before the options have loaded', () => {
    host.options = [];
    fixture.detectChanges();

    host.form.controls.origin.setValue(2);
    fixture.detectChanges();
    expect(trigger().classList.contains('is-placeholder')).toBe(true);

    host.options = STATION_OPTIONS;
    fixture.detectChanges();

    expect(trigger().textContent?.trim()).toBe('สถานีเชียงใหม่อาเขต');
  });
});
