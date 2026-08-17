import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  AdminSortChange,
  AdminSortDirection,
  AdminSortableHeaderComponent,
} from './admin-sortable-header.component';

// OBRS-1414: the component's selector is an ATTRIBUTE on `<th>` (so `aria-sort`
// can sit on the cell itself), which means it can only be exercised through a
// host template — there is no `<app-...>` element to create directly.
@Component({
  template: `
    <table>
      <thead>
        <tr>
          <th
            adminSortableHeader
            field="createdAt"
            [activeField]="activeField"
            [activeDirection]="activeDirection"
            (sortChange)="lastChange = $event"
            >Created at</th
          >
          <th
            adminSortableHeader
            field="id"
            [activeField]="activeField"
            [activeDirection]="activeDirection"
            (sortChange)="lastChange = $event"
            >ID</th
          >
        </tr>
      </thead>
    </table>
  `,
  standalone: false,
})
class HostComponent {
  activeField: string | null = null;
  activeDirection: AdminSortDirection = 'asc';
  lastChange: AdminSortChange | null = null;
}

describe('AdminSortableHeaderComponent (OBRS-1414)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  // [0] = createdAt, [1] = id
  const headers = (): HTMLTableCellElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('th'));
  const buttonIn = (th: HTMLTableCellElement): HTMLButtonElement =>
    th.querySelector('button') as HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminSortableHeaderComponent, HostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  // AC-2: a real <button>, so it is keyboard-focusable and Enter/Space
  // activate it for free — no role/tabindex bolted onto the <th>.
  it('renders the projected column label inside a real <button>', () => {
    const button = buttonIn(headers()[0]);
    expect(button).withContext('the affordance must be a <button>').not.toBeNull();
    expect(button.type).toBe('button');
    expect(button.textContent).toContain('Created at');
    expect(headers()[0].getAttribute('tabindex'))
      .withContext('the <th> itself must not become a tab stop')
      .toBeNull();
  });

  // AC-1: click = asc, click again = desc, click a different column = that
  // column's asc.
  it('emits asc on the first click of an unsorted column', () => {
    buttonIn(headers()[0]).click();
    expect(host.lastChange).toEqual({ field: 'createdAt', direction: 'asc' });
  });

  it('emits desc when the ALREADY-ascending column is clicked again', () => {
    host.activeField = 'createdAt';
    host.activeDirection = 'asc';
    fixture.detectChanges();

    buttonIn(headers()[0]).click();
    expect(host.lastChange).toEqual({ field: 'createdAt', direction: 'desc' });
  });

  it('emits asc again when the already-descending column is clicked (the toggle is a cycle)', () => {
    host.activeField = 'createdAt';
    host.activeDirection = 'desc';
    fixture.detectChanges();

    buttonIn(headers()[0]).click();
    expect(host.lastChange).toEqual({ field: 'createdAt', direction: 'asc' });
  });

  it('resets to asc when a DIFFERENT column is clicked, even while the active one is desc', () => {
    host.activeField = 'createdAt';
    host.activeDirection = 'desc';
    fixture.detectChanges();

    buttonIn(headers()[1]).click();
    expect(host.lastChange).toEqual({ field: 'id', direction: 'asc' });
  });

  // AC-2: state is exposed as aria-sort ON THE <th> — the only element the
  // a11y mapping accepts it on.
  it('reports aria-sort="none" on every header while nothing is sorted', () => {
    expect(headers().map((th) => th.getAttribute('aria-sort'))).toEqual(['none', 'none']);
  });

  it('reports aria-sort ascending/descending on the ACTIVE header only', () => {
    host.activeField = 'createdAt';
    host.activeDirection = 'asc';
    fixture.detectChanges();
    expect(headers().map((th) => th.getAttribute('aria-sort'))).toEqual(['ascending', 'none']);

    host.activeDirection = 'desc';
    fixture.detectChanges();
    expect(headers().map((th) => th.getAttribute('aria-sort'))).toEqual(['descending', 'none']);
  });

  // The arrow is decorative — the state a screen reader needs is aria-sort
  // above, so the icon must not be read out as a word ("unfold_more").
  it('hides the direction arrow from assistive tech', () => {
    const icon = headers()[0].querySelector('.material-symbols-outlined');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });
});
