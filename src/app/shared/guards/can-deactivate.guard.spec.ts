import { CanDeactivateGuard } from './can-deactivate.guard';

describe('CanDeactivateGuard', () => {
  let guard: CanDeactivateGuard;

  beforeEach(() => {
    guard = new CanDeactivateGuard();
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });

  it('delegates to the component canDeactivate() when implemented', () => {
    const component = { canDeactivate: () => false };

    expect(guard.canDeactivate(component)).toBe(false);
  });

  it('allows navigation when the component has no canDeactivate()', () => {
    const component = {} as { canDeactivate: () => boolean };

    expect(guard.canDeactivate(component)).toBe(true);
  });
});
