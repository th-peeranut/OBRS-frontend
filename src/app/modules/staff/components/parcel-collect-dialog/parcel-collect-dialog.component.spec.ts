import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ParcelCollectDialogComponent } from './parcel-collect-dialog.component';

function makeComponent(): ParcelCollectDialogComponent {
  return new ParcelCollectDialogComponent(new FormBuilder());
}

describe('ParcelCollectDialogComponent', () => {
  it('should be created', () => {
    expect(makeComponent()).toBeTruthy();
  });

  it('resets the form whenever isOpen flips to true', () => {
    const component = makeComponent();
    component['form'].get('collectionCode')?.setValue('stale-code');
    component.isOpen = true;
    component.ngOnChanges({
      isOpen: { currentValue: true, previousValue: false, firstChange: false, isFirstChange: () => false },
    });
    expect(component['form'].get('collectionCode')?.value).toBeNull();
  });

  it('cannot confirm with an empty code', () => {
    const component = makeComponent();
    expect(component['canConfirm']).toBeFalse();
  });

  it('does not emit confirm while invalid', () => {
    const component = makeComponent();
    const spy = spyOn(component.confirm, 'emit');
    component['onConfirm']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits confirm with the trimmed collection code', () => {
    const component = makeComponent();
    component['form'].get('collectionCode')?.setValue('  ABC123  ');
    const spy = spyOn(component.confirm, 'emit');
    component['onConfirm']();
    expect(spy).toHaveBeenCalledWith('ABC123');
  });

  it('does not dismiss while submitting', () => {
    const component = makeComponent();
    component.isSubmitting = true;
    const spy = spyOn(component.dismiss, 'emit');
    component['onDismiss']();
    expect(spy).not.toHaveBeenCalled();
  });

  it('emits dismiss when not submitting', () => {
    const component = makeComponent();
    const spy = spyOn(component.dismiss, 'emit');
    component['onDismiss']();
    expect(spy).toHaveBeenCalled();
  });

  // OBRS-641 AC-7 — the collection code is six random 0-9 digits
  // (NumberGenerator.generateParcelCollectionCode), so the field earns the
  // numeric keypad — not tel (no +*#), and unlike the alphanumeric
  // trackingNumber. Read off the rendered template; mutation-proven: drop
  // inputmode from the .html and this goes red.
  describe('OBRS-641 AC-7 — numeric keypad on the rendered DOM', () => {
    let fixture: ComponentFixture<ParcelCollectDialogComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ReactiveFormsModule, TranslateModule.forRoot()],
        declarations: [ParcelCollectDialogComponent],
        schemas: [NO_ERRORS_SCHEMA],
      }).compileComponents();

      fixture = TestBed.createComponent(ParcelCollectDialogComponent);
      fixture.componentInstance.isOpen = true; // the whole dialog is behind @if (isOpen)
      fixture.detectChanges();
    });

    it('opens the numeric keypad for the 6-digit collection code (inputmode="numeric")', () => {
      const el = fixture.nativeElement.querySelector(
        'input[formcontrolname="collectionCode"]'
      ) as HTMLInputElement | null;
      expect(el).withContext('collectionCode input should render when isOpen').not.toBeNull();
      expect(el?.getAttribute('inputmode')).toBe('numeric');
    });
  });
});
