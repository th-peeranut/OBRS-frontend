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

  // OBRS-1576 AC5. The 66 existing call sites do not pass [searchable], and this is the test that
  // says so: every assertion below describes the control as it behaved before this card.
  describe('when [searchable] is not set (the 71 existing call sites)', () => {
    beforeEach(() => {
      component.valueKey = 'code';
      component.options = [
        { code: 'A', label: 'Alpha' },
        { code: 'B', label: 'Beta' },
      ];
    });

    it('offers every option, unfiltered', () => {
      expect(component['visibleOptions']).toEqual(component.options);
    });

    /**
     * The regression scrutinize caught and this block had missed, because every case above happens
     * to set a placeholder.
     *
     * `toggleDropdown()` is shared by BOTH triggers and unconditionally seeds `activeIndex`;
     * `firstActiveIndex` falls through to 0 when `placeholder` is '' — the default, and true for
     * **21 of the 71** uses of this control on `origin/dev` (measured 2026-08-25). With `isActive()`
     * ungated, those 21 dropdowns would paint the new `.is-active` wash on their first option the
     * instant they opened: a visible change on screens this card never meant to touch.
     */
    it('never paints the keyboard highlight, not even with no placeholder to sit on', () => {
      component.placeholder = '';

      component['toggleDropdown']();

      expect(component['activeIndex'])
        .withContext('the shared open path still seeds it; that is fine, PAINTING it is not')
        .toBe(0);
      expect(component['isActive'](0))
        .withContext('un-gate isActive() and 21 existing dropdowns highlight their first row on open')
        .toBeFalse();
    });

    // The query is only ever set by the searchable trigger, which these call sites do not render;
    // opening and closing must therefore never leave one behind.
    it('never holds a query, so the list cannot narrow behind the caller’s back', () => {
      expect(component.searchable).toBeFalse();

      component['toggleDropdown']();
      expect(component['query']).toBe('');
      expect(component['visibleOptions']).toEqual(component.options);

      component['selectOption'](component.options[1]);
      expect(component['query']).toBe('');
      expect(component['visibleOptions']).toEqual(component.options);
    });
  });

  describe('when [searchable] is set', () => {
    beforeEach(() => {
      component.searchable = true;
      component.valueKey = 'code';
      component.labelKey = 'label';
      component.placeholder = 'Vehicle';
      component.options = [
        { code: '1', label: '16-8747' },
        { code: '2', label: '16-2733' },
        { code: '3', label: '16-9535' },
      ];
    });

    it('filters on the LABEL, which is what is on screen', () => {
      component['onQueryInput']('2733');

      expect(component['visibleOptions']).toEqual([{ code: '2', label: '16-2733' }]);
    });

    // AC4, the whole point: two characters and Enter, without touching the mouse.
    it('Enter takes the highlighted match and emits it', () => {
      const emitted: string[] = [];
      component.valueChange.subscribe((value) => emitted.push(value));
      component['toggleDropdown']();
      component['onQueryInput']('9535');

      component['onTriggerKeydown'](new KeyboardEvent('keydown', { key: 'Enter' }));

      expect(emitted).toEqual(['3']);
      expect(component['isOpen']).toBeFalse();
    });

    // Regression: without preventDefault the same keystroke that picks a vehicle submits the form
    // the field sits in, and the owner loses a half-typed bill.
    it('Enter does not reach the surrounding form', () => {
      component['toggleDropdown']();
      const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });

      component['onTriggerKeydown'](event);

      expect(event.defaultPrevented).toBeTrue();
    });

    it('arrows move the highlight and stop at both ends', () => {
      component['toggleDropdown']();
      const down = () => component['onTriggerKeydown'](new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      const up = () => component['onTriggerKeydown'](new KeyboardEvent('keydown', { key: 'ArrowUp' }));

      // Starts on the placeholder row (-1) because a placeholder is rendered.
      expect(component['activeIndex']).toBe(-1);
      down();
      down();
      expect(component['activeIndex']).toBe(1);
      down();
      down();
      expect(component['activeIndex'])
        .withContext('must not walk past the last option')
        .toBe(2);
      up();
      up();
      up();
      up();
      expect(component['activeIndex'])
        .withContext('must not walk above the placeholder row')
        .toBe(-1);
    });

    // Regression: an index kept across a re-typed query highlights an unrelated row, and the next
    // Enter selects it. The user sees a vehicle they never chose.
    it('re-typing resets the highlight to the first match', () => {
      component['toggleDropdown']();
      component['onTriggerKeydown'](new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      component['onTriggerKeydown'](new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component['activeIndex']).toBe(1);

      component['onQueryInput']('16');

      expect(component['activeIndex']).toBe(0);
    });

    // The bug this pins: with the highlight parked on the "clear" row, typing a plate and pressing
    // Enter BLANKS the field the owner was filling in — the opposite of what those keystrokes mean.
    // Clearing must be something you arrow up to, never something you land on by typing.
    it('a typed query moves the highlight off the clear row', () => {
      component['toggleDropdown']();
      expect(component['activeIndex'])
        .withContext('with nothing typed, the clear row is the top row')
        .toBe(-1);

      component['onQueryInput']('8747');

      expect(component['activeIndex']).toBe(0);
    });

    it('shows the selection when closed and the typed text when open, never the placeholder as a value', () => {
      component.writeValue('2');
      expect(component['triggerText']).toBe('16-2733');

      component['toggleDropdown']();
      expect(component['triggerText'])
        .withContext('opening clears the box so the first keystroke replaces the selection')
        .toBe('');

      component['onQueryInput']('16-9');
      expect(component['triggerText']).toBe('16-9');
    });

    it('renders no selection as an empty box, not as the placeholder text', () => {
      component.writeValue('');

      expect(component['triggerText']).toBe('');
    });

    // Closing must not leave a filter the user can no longer see: reopening always starts whole.
    it('closing clears the query', () => {
      component['toggleDropdown']();
      component['onQueryInput']('9535');
      component['onTriggerKeydown'](new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(component['isOpen']).toBeFalse();
      expect(component['visibleOptions'].length).toBe(3);
    });
  });
});
