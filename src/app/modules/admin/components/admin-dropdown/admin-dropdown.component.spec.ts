import { AdminDropdownComponent } from './admin-dropdown.component';
import { createElementRefStub } from '../../../../testing/test-stubs';

describe('AdminDropdownComponent', () => {
  let component: AdminDropdownComponent;

  beforeEach(() => {
    component = new AdminDropdownComponent(createElementRefStub());
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Regression: NgForOf stores trackBy as a free function and invokes it
  // without `this`. A plain method would lose `this` and throw
  // "this.getOptionValue is not a function" when the options menu renders.
  it('trackByOption keeps its `this` binding when called detached', () => {
    component.valueKey = 'code';
    const detachedTrackBy = component.trackByOption;

    expect(() => detachedTrackBy(0, { code: 'abc', label: 'A' })).not.toThrow();
    expect(detachedTrackBy(0, { code: 'abc', label: 'A' })).toBe('abc');
  });

  // OBRS-967 must-catch. getOptionValue collapses EVERY option missing `valueKey`
  // (or holding an empty one) to the same '' key, so two of them in one list would
  // hand @for duplicate keys and Angular would log NG0955. Reverting trackByOption
  // to `return this.getOptionValue(option)` turns this red. Hardening, not a live
  // defect: no call site in the app produces such a list today.
  it('trackByOption gives distinct keys to two options that both resolve to an empty value', () => {
    component.valueKey = 'code';

    const options = [{ label: 'A' }, { code: '', label: 'B' }, { code: 'real', label: 'C' }];
    const keys = options.map((option, index) => component.trackByOption(index, option));

    expect(new Set(keys).size)
      .withContext(`two empty-valued options collapsed onto one key: ${JSON.stringify(keys)}`)
      .toBe(options.length);
    expect(keys[2])
      .withContext('a real value must still be returned unchanged — existing lists keep their keys')
      .toBe('real');
  });
});
