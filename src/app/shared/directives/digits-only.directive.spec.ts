import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DigitsOnlyDirective } from './digits-only.directive';

@Component({
  template: `
    <form [formGroup]="form">
      <input obrsDigitsOnly formControlName="accountNumber" />
    </form>
  `,
  standalone: false,
})
class HostComponent {
  form = new FormGroup({ accountNumber: new FormControl('') });
}

describe('DigitsOnlyDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, DigitsOnlyDirective],
      imports: [ReactiveFormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  /** Every vector - typing, paste, drag-and-drop - surfaces as one `input` event. */
  function type(value: string, caret = value.length): void {
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function control(): FormControl {
    return fixture.componentInstance.form.get('accountNumber') as FormControl;
  }

  it('leaves a digits-only value alone', () => {
    type('1480622621');
    expect(input.value).toBe('1480622621');
    expect(control().value).toBe('1480622621');
  });

  it('drops a letter typed at the end', () => {
    type('148a');
    expect(input.value).toBe('148');
    expect(control().value).toBe('148');
  });

  it('strips the separators out of a pasted account number', () => {
    type('148-0-62262-1');
    expect(input.value).toBe('1480622621');
    expect(control().value).toBe('1480622621');
  });

  it('strips a dropped free-text value down to nothing rather than storing it', () => {
    type('เลขบัญชี ถามพี่เอาอีกที');
    expect(input.value).toBe('');
    expect(control().value).toBe('');
  });

  it('keeps the caret where the user was typing, not at the end', () => {
    // "12X34" with the caret just after the rejected X (index 3).
    type('12X34', 3);
    expect(input.value).toBe('1234');
    expect(input.selectionStart).toBe(2);
  });

  it('does not fight a value the model itself sets', () => {
    control().setValue('999');
    fixture.detectChanges();
    expect(input.value).toBe('999');
  });
});
