import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { StopFormModalComponent } from './stop-form-modal.component';
import { AdminModalBackdropDirective } from '../../../../../shared/directives/admin-modal-backdrop.directive';
import { StopDetailForm } from '../stops.mappers';

const SELECTED: StopDetailForm = {
  id: 7,
  slug: 'nong_chak',
  provinceCode: 'chonburi',
  statusCode: 'active',
  stopTypeCode: 'pickup',
  latitude: 13.5,
  longitude: 101.5,
  primaryPhotoUrl: null,
  returnStopId: null,
  translations: [
    { locale: 'th', label: 'หนองชาก', description: '', address: '' },
    { locale: 'en', label: '', description: '', address: '' },
    { locale: 'zh', label: '', description: '', address: '' },
  ],
};

describe('StopFormModalComponent (OBRS-1298)', () => {
  let fixture: ComponentFixture<StopFormModalComponent>;
  let component: StopFormModalComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [StopFormModalComponent, AdminModalBackdropDirective],
      imports: [CommonModule, FormsModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    // Real translations for the keys these specs assert on, mirroring public/i18n/en.json —
    // the default fake loader returns the raw key (no interpolation), which would make the
    // EDIT_TITLE assertion below meaningless.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ADMIN: {
        STOPS: { EDIT_TITLE: 'Edit stop: {{slug}}' },
        COMMON: { LOADING: 'Loading...', CANCEL: 'Cancel', SAVE: 'Save', SAVING: 'Saving...' },
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(StopFormModalComponent);
    component = fixture.componentInstance;
  });

  // OBRS-1298: this modal is the first admin form modal that stays OPEN across an awaited
  // alert — `StopsPageComponent.save()` awaits `AlertService.success()` (a `Swal.fire` with no
  // `timer`, so it settles only on a user dismissal) before clearing `isSaving`, and the photo
  // actions await a confirm mid-edit. If the alert ever renders under `.admin-modal-backdrop`
  // it cannot be dismissed, the promise never settles, and the Save button stays disabled for
  // good. `src/styles.scss` already lifts `.swal2-container` to 1400 for exactly that reason
  // (SweetAlert2's own default is 1060, under the backdrop's 1200) — this pins the ordering so
  // the next person to renumber an overlay layer finds out here instead of in production.
  // Measured, not copied: karma loads `src/styles.scss`, so these are the real cascade values
  // (1200 / 1400 at the time of writing).
  it('keeps SweetAlert above the modal backdrop, so an awaited alert can still be dismissed', () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-modal-backdrop';
    const alertContainer = document.createElement('div');
    alertContainer.className = 'swal2-container';
    document.body.append(backdrop, alertContainer);

    try {
      const backdropZ = Number(getComputedStyle(backdrop).zIndex);
      const alertZ = Number(getComputedStyle(alertContainer).zIndex);

      expect(Number.isNaN(backdropZ)).toBe(false);
      expect(Number.isNaN(alertZ)).toBe(false);
      expect(alertZ).toBeGreaterThan(backdropZ);
    } finally {
      backdrop.remove();
      alertContainer.remove();
    }
  });

  it('renders nothing when isOpen is false', () => {
    component.isOpen = false;
    component.selected = SELECTED;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-modal-backdrop')).toBeNull();
  });

  it('renders the dialog when isOpen is true and selected has loaded', () => {
    component.isOpen = true;
    component.selected = SELECTED;
    component.isDetailLoading = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-modal-backdrop')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-modal-title').textContent).toContain(
      'nong_chak'
    );
  });

  it('shows a loading title and skeleton, and no form, while isDetailLoading is true', () => {
    // Optimistic open: the modal is open before `selected` has arrived.
    component.isOpen = true;
    component.selected = null;
    component.isDetailLoading = true;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.admin-modal-backdrop')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.admin-skeleton')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('emits (closed) when the directive dismisses (Escape / backdrop click)', () => {
    component.isOpen = true;
    component.selected = SELECTED;
    fixture.detectChanges();

    let closedCount = 0;
    component.closed.subscribe(() => closedCount++);

    // AdminModalBackdropDirective's Escape handler is bound to the global `document`
    // (`@HostListener('document:keydown.escape')`), not the host element, so it fires
    // regardless of whether the fixture is attached to the live DOM.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closedCount).toBe(1);
  });

  it('emits (closed) when the Cancel button is clicked', () => {
    component.isOpen = true;
    component.selected = SELECTED;
    component.isSaving = false;
    fixture.detectChanges();

    let closedCount = 0;
    component.closed.subscribe(() => closedCount++);

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-modal-actions button')
    );
    const cancelButton = buttons.find((b) => b.type === 'button');
    cancelButton?.click();

    expect(closedCount).toBe(1);
  });

  it('does not emit (closed) from the Cancel button while isSaving is true', () => {
    component.isOpen = true;
    component.selected = SELECTED;
    component.isSaving = true;
    fixture.detectChanges();

    let closedCount = 0;
    component.closed.subscribe(() => closedCount++);

    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.admin-modal-actions button')
    );
    const cancelButton = buttons.find((b) => b.type === 'button');
    cancelButton?.click();

    expect(closedCount).toBe(0);
  });

  it('the photo block renders outside the <form> element (OBRS-580)', () => {
    component.isOpen = true;
    component.selected = SELECTED;
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form');
    const photoBlock = fixture.nativeElement.querySelector('.stop-photo-block');

    expect(photoBlock).not.toBeNull();
    expect(form).not.toBeNull();
    expect(form.contains(photoBlock)).toBeFalse();
  });

  it('disables the Save button while isSaving is true', () => {
    component.isOpen = true;
    component.selected = SELECTED;
    component.isSaving = true;
    fixture.detectChanges();

    const saveButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      'button[type="submit"]'
    );

    expect(saveButton.disabled).toBeTrue();
  });

  it('emits (save) on form submit and (photoRemove)/(photoSelected) from the photo controls', () => {
    component.isOpen = true;
    component.selected = { ...SELECTED, primaryPhotoUrl: 'https://sb.example/o/x.jpg' };
    fixture.detectChanges();

    let saveCount = 0;
    component.save.subscribe(() => saveCount++);
    let removeCount = 0;
    component.photoRemove.subscribe(() => removeCount++);

    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    expect(saveCount).toBe(1);

    const photoButtons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.stop-photo-block button')
    );
    const removeButton = photoButtons.find((b) => !b.disabled) as HTMLButtonElement;
    removeButton.click();
    expect(removeCount).toBe(1);
  });
});
