import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { MyReportFollowUpComposerComponent } from './my-report-follow-up-composer.component';
import { UsabilityReportService } from '../../../../services/usability-report/usability-report.service';
import { UsabilityReportFollowUp } from '../../../../shared/interfaces/usability-report.interface';

describe('MyReportFollowUpComposerComponent', () => {
  let fixture: ComponentFixture<MyReportFollowUpComposerComponent>;
  let component: MyReportFollowUpComposerComponent;
  let serviceSpy: jasmine.SpyObj<UsabilityReportService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj('UsabilityReportService', ['addFollowUp']);

    await TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, TranslateModule.forRoot()],
      declarations: [MyReportFollowUpComposerComponent],
      providers: [{ provide: UsabilityReportService, useValue: serviceSpy }],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(MyReportFollowUpComposerComponent);
    component = fixture.componentInstance;
    component.reportId = 1;
    fixture.detectChanges();
  });

  it('blocks submit for a blank note and does not call addFollowUp', () => {
    component['form'].get('note')?.setValue('   ');
    component['onSubmit']();

    expect(serviceSpy.addFollowUp).not.toHaveBeenCalled();
    expect(component['noteInvalid']).toBeTrue();
  });

  it('emits pending SYNCHRONOUSLY (before the POST resolves) with the typed note', () => {
    serviceSpy.addFollowUp.and.returnValue(of({ code: 201, message: 'Created' }));
    const pendingSpy = jasmine.createSpy();
    component.pending.subscribe(pendingSpy);

    component['form'].get('note')?.setValue('a follow-up note');
    component['onSubmit']();

    expect(pendingSpy).toHaveBeenCalledWith(jasmine.objectContaining({ note: 'a follow-up note' }));
  });

  it('resets the form optimistically right after emitting pending', () => {
    serviceSpy.addFollowUp.and.returnValue(of({ code: 201, message: 'Created' }));
    component['form'].get('note')?.setValue('a follow-up note');

    component['onSubmit']();

    expect(component['form'].get('note')?.value).toBe('');
  });

  it('on success: emits added with the server response and does not emit failed', () => {
    const followUp: UsabilityReportFollowUp = {
      id: 1,
      note: 'a follow-up note',
      authorUserId: 7,
      authorName: 'me@example.com',
      createdAt: '2026-01-01T00:00:00Z',
      images: [],
    };
    serviceSpy.addFollowUp.and.returnValue(of({ code: 201, message: 'Created', data: followUp }));
    const addedSpy = jasmine.createSpy();
    const failedSpy = jasmine.createSpy();
    component.added.subscribe(addedSpy);
    component.failed.subscribe(failedSpy);

    component['form'].get('note')?.setValue('a follow-up note');
    component['onSubmit']();

    expect(addedSpy).toHaveBeenCalledWith(followUp);
    expect(failedSpy).not.toHaveBeenCalled();
  });

  it('on failure: emits failed and restores the typed note for retry (keeps the draft)', () => {
    serviceSpy.addFollowUp.and.returnValue(throwError(() => ({ status: 500 })));
    const failedSpy = jasmine.createSpy();
    component.failed.subscribe(failedSpy);

    component['form'].get('note')?.setValue('please keep this text');
    component['onSubmit']();

    expect(failedSpy).toHaveBeenCalled();
    expect(component['form'].get('note')?.value).toBe('please keep this text');
  });

  it('sends the note and image files as multipart FormData', () => {
    serviceSpy.addFollowUp.and.returnValue(of({ code: 201, message: 'Created' }));
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    component['onImagesChange']({ keepImageIds: [], newFiles: [file] });
    component['form'].get('note')?.setValue('note with an image');

    component['onSubmit']();

    const formData = serviceSpy.addFollowUp.calls.mostRecent().args[1] as FormData;
    expect(formData.get('note')).toBe('note with an image');
    expect((formData.get('images') as File).name).toBe('a.png');
  });
});
