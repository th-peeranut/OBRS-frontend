import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationMessageEditFormComponent } from './notification-message-edit-form.component';

describe('NotificationMessageEditFormComponent', () => {
  let fixture: ComponentFixture<NotificationMessageEditFormComponent>;
  let component: NotificationMessageEditFormComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageEditFormComponent],
      imports: [FormsModule, TranslateModule.forRoot()],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessageEditFormComponent);
    component = fixture.componentInstance;
  });

  describe('canSave (AC12 non-negotiable: never gated by the credit panel)', () => {
    it('is false when the body is blank', () => {
      component['body'] = '';
      expect(component['canSave']).toBeFalse();
    });

    it('is false when the body is whitespace only', () => {
      component['body'] = '   ';
      expect(component['canSave']).toBeFalse();
    });

    it('is true when the body is non-blank and not submitting', () => {
      component['body'] = 'hello';
      component.submitting = false;
      expect(component['canSave']).toBeTrue();
    });

    it('is false while submitting, even with a non-blank body', () => {
      component['body'] = 'hello';
      component.submitting = true;
      expect(component['canSave']).toBeFalse();
    });

    it('is unaffected by validationError being set — credit/validation display never gates Save', () => {
      component['body'] = 'hello';
      component.validationError = {
        reason: 'PLACEHOLDER_MISMATCH',
        missingIndices: [1],
        extraIndices: [],
        formatError: null,
      };
      expect(component['canSave']).toBeTrue();
    });
  });

  describe('pristine guard (design-system §6/§11 optimistic-open)', () => {
    it('seeds the body from detail.liveBody on the first change', () => {
      component.detail = { baseline: 'b', liveBody: 'live text', status: 'NONE', rejectReason: null, placeholderIndices: [], creditEstimate: null };
      component.ngOnChanges({ detail: {} as any });
      expect(component['body']).toBe('live text');
    });

    it('does NOT overwrite the body once the user has typed, even if detail changes again', () => {
      component.detail = { baseline: 'b', liveBody: 'live text', status: 'NONE', rejectReason: null, placeholderIndices: [], creditEstimate: null };
      component.ngOnChanges({ detail: {} as any });

      component['onInput']('owner is typing');
      expect(component['body']).toBe('owner is typing');

      component.detail = { baseline: 'b', liveBody: 'a later GET response landed', status: 'NONE', rejectReason: null, placeholderIndices: [], creditEstimate: null };
      component.ngOnChanges({ detail: {} as any });

      expect(component['body']).toBe('owner is typing');
    });
  });

  describe('placeholder hint (undebounced, display only)', () => {
    it('recomputes on every input change', () => {
      component['onInput']('Hi {0}');
      expect(component['placeholderIndices']).toEqual([0]);

      component['onInput']('Hi {0} and {1}');
      expect(component['placeholderIndices']).toEqual([0, 1]);
    });
  });

  describe('bodyChange output (debounced 500ms)', () => {
    it('does not emit before the debounce window elapses', fakeAsync(() => {
      const emitted: string[] = [];
      component.bodyChange.subscribe((v) => emitted.push(v));

      component['onInput']('a');
      tick(499);
      expect(emitted).toEqual([]);

      tick(1);
      expect(emitted).toEqual(['a']);
    }));

    it('only emits the LATEST value when several inputs arrive inside the window', fakeAsync(() => {
      const emitted: string[] = [];
      component.bodyChange.subscribe((v) => emitted.push(v));

      component['onInput']('a');
      tick(200);
      component['onInput']('ab');
      tick(200);
      component['onInput']('abc');
      tick(500);

      expect(emitted).toEqual(['abc']);
    }));
  });

  describe('save/cancel outputs', () => {
    it('emits save with the current body when canSave is true', () => {
      component['body'] = 'hello';
      const saveSpy = jasmine.createSpy('save');
      component.save.subscribe(saveSpy);

      component['onSave']();

      expect(saveSpy).toHaveBeenCalledWith('hello');
    });

    it('does not emit save when the body is blank', () => {
      component['body'] = '   ';
      const saveSpy = jasmine.createSpy('save');
      component.save.subscribe(saveSpy);

      component['onSave']();

      expect(saveSpy).not.toHaveBeenCalled();
    });

    it('emits cancel', () => {
      const cancelSpy = jasmine.createSpy('cancel');
      component.cancel.subscribe(cancelSpy);
      component['onCancel']();
      expect(cancelSpy).toHaveBeenCalled();
    });
  });
});
