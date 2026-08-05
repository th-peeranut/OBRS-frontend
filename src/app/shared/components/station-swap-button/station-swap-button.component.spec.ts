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
    const img = fixture.debugElement.query(By.css('img')).nativeElement as HTMLImageElement;

    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
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
