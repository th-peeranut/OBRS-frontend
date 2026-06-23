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
});
