import { FormBuilder } from '@angular/forms';
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
});
