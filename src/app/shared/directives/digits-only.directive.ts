import { Directive, ElementRef, HostListener, Optional, Self } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Restricts an `<input>` to digits `0-9` at TYPING time, not at submit time.
 *
 * OBRS-1464: the census in `docs/input-charset-census-2026-08-21.md` measured
 * that this project had ZERO keystroke-level charset filters — `inputmode`
 * appears on 31 fields but is only a mobile-keyboard hint, so on desktop every
 * one of them accepts any string. This is the single shared filter the card
 * asks for, rather than a copy of the same logic per page.
 *
 * <p><b>Why the `input` event and not `beforeinput`/`keypress`.</b> Three entry
 * vectors have to be covered (typing, paste, drag-and-drop) and `input` is the
 * only one all three fire. Filtering AFTER the value lands and writing the
 * cleaned value straight back is therefore ~20 lines instead of a per-vector
 * handler each, and it also covers the vectors nobody lists (autofill, an IME
 * commit, the browser's own undo).
 *
 * <p><b>The caret is restored by counting what was removed BEFORE it</b> —
 * without that, typing a letter in the middle of an account number would
 * silently jump the caret to the end, which is worse than the letter.
 *
 * <p>`NgControl` is optional so the directive also works on a plain
 * `[(ngModel)]`-less input; when a control IS present its value is written
 * through it, because the accessor already pushed the un-cleaned value on this
 * same event and the model must not keep it.
 */
@Directive({
    selector: 'input[obrsDigitsOnly]',
    standalone: false
})
export class DigitsOnlyDirective {
  constructor(
    private readonly elementRef: ElementRef<HTMLInputElement>,
    @Optional() @Self() private readonly ngControl: NgControl | null
  ) {}

  @HostListener('input')
  protected onInput(): void {
    const input = this.elementRef.nativeElement;
    const raw = input.value;
    const digits = raw.replace(/\D/g, '');
    if (digits === raw) {
      return;
    }

    const caret = input.selectionStart ?? raw.length;
    const removedBeforeCaret = raw.slice(0, caret).replace(/\d/g, '').length;

    this.ngControl?.control?.setValue(digits);
    input.value = digits;

    const next = Math.max(0, caret - removedBeforeCaret);
    input.setSelectionRange(next, next);
  }
}
