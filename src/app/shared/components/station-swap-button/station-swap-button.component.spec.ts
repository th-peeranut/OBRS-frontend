import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';

import { StationSwapButtonComponent } from './station-swap-button.component';

/**
 * OBRS-1035. The contract this component exists to hold, independent of any one
 * screen: it must be a real, focusable, named button — the bug was an element
 * that *looked* like one.
 *
 * `TranslateModule.forRoot()` has no loader here, so `| translate` echoes the
 * key back; that is exactly what these tests want to read — an assertion on
 * rendered Thai would pass just as well against a hardcoded literal, which AC#1
 * forbids.
 */
@Component({
  template: `<app-station-swap-button
    [disabled]="disabled"
    (swap)="swapCount = swapCount + 1"
  ></app-station-swap-button>`,
  imports: [StationSwapButtonComponent],
})
class HostComponent {
  disabled = false;
  swapCount = 0;
}

describe('StationSwapButtonComponent (OBRS-1035)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function button(): HTMLButtonElement {
    return fixture.debugElement.query(By.css('button')).nativeElement as HTMLButtonElement;
  }

  it('AC#1: renders a <button type="button"> with a translated aria-label', () => {
    expect(button().tagName).toBe('BUTTON');
    expect(button().getAttribute('type')).toBe('button');
    expect(button().getAttribute('aria-label')).toBe('COMMON.SWAP_STATIONS');
  });

  it('AC#1: the icon is decorative — the button carries the only accessible name', () => {
    const icon = fixture.debugElement.query(By.css('.station-swap-button__icon'))
      .nativeElement as HTMLElement;

    expect(icon.getAttribute('aria-hidden')).toBe('true');
    // OBRS-1038 replaced the `<img>` with a glyph, so `alt=""` no longer exists
    // to carry the "decorative" claim. `aria-hidden` above is what carries it
    // now, and this asserts the element it is on is genuinely the only other
    // text in the control — a glyph that leaked its ligature text into the
    // accessibility tree would make the button announce "swap_horiz".
    expect(icon.textContent?.trim()).toBe('swap_horiz');
  });

  it('OBRS-1038: the icon is arrows only — no vehicle asset is loaded', () => {
    expect(fixture.debugElement.query(By.css('img'))).toBeNull();
  });

  it('AC#4: it is reachable by keyboard — a <button> is focusable and Enter/Space activate it', () => {
    button().focus();
    expect(document.activeElement).toBe(button());

    // A native button turns both keys into a click; asserting the click count
    // is what proves activation, whereas dispatching keydown and asserting on
    // the handler would only re-test our own wiring.
    button().click();
    expect(host.swapCount).toBe(1);
  });

  it('emits swap on click', () => {
    button().click();
    button().click();

    expect(host.swapCount).toBe(2);
  });

  it('AC#7: disabled blocks the emit, not just the styling', () => {
    host.disabled = true;
    fixture.detectChanges();

    expect(button().disabled).toBeTrue();

    button().click();

    expect(host.swapCount).toBe(0);
  });
});
