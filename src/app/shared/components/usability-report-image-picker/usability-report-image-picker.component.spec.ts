import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { UsabilityReportImagePickerComponent } from './usability-report-image-picker.component';
import { UsabilityReportImage } from '../../interfaces/usability-report.interface';

function makeFile(name: string, type = 'image/png', sizeBytes = 1024): File {
  const file = new File(['x'.repeat(sizeBytes)], name, { type });
  return file;
}

function fileListFrom(files: File[]): FileList {
  const dt = new DataTransfer();
  files.forEach((f) => dt.items.add(f));
  return dt.files;
}

describe('UsabilityReportImagePickerComponent', () => {
  let fixture: ComponentFixture<UsabilityReportImagePickerComponent>;
  let component: UsabilityReportImagePickerComponent;

  const existing: UsabilityReportImage[] = [
    { id: '1', publicUrl: 'https://x/1.png', contentType: 'image/png', sizeBytes: 100, position: 1 },
    { id: '2', publicUrl: 'https://x/2.png', contentType: 'image/png', sizeBytes: 100, position: 2 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [UsabilityReportImagePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UsabilityReportImagePickerComponent);
    component = fixture.componentInstance;
  });

  function setExisting(images: UsabilityReportImage[]): void {
    component.existingImages = images;
    component.ngOnChanges({
      existingImages: {
        previousValue: [],
        currentValue: images,
        firstChange: true,
        isFirstChange: () => true,
      },
    });
    fixture.detectChanges();
  }

  it('seeds keptImages from existingImages on input change (add-only behaviour when empty)', () => {
    setExisting([]);
    expect(component['keptImages']).toEqual([]);
    expect(component['totalCount']).toBe(0);
  });

  it('seeds keptImages from a non-empty existingImages input', () => {
    setExisting(existing);
    expect(component['keptImages'].length).toBe(2);
    expect(component['totalCount']).toBe(2);
  });

  it('emits keepImageIds coerced to number and newFiles on removeExisting', () => {
    setExisting(existing);
    const emitted: unknown[] = [];
    component.imagesChange.subscribe((v) => emitted.push(v));

    component['removeExisting'](0);

    expect(emitted[0]).toEqual({ keepImageIds: [2], newFiles: [] });
  });

  it('adds a valid file and emits it in newFiles', () => {
    setExisting([]);
    const emitted: { keepImageIds: number[]; newFiles: File[] }[] = [];
    component.imagesChange.subscribe((v) => emitted.push(v));

    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: fileListFrom([makeFile('a.png')]) });

    component['onFilesSelected']({ target: input } as unknown as Event);

    expect(component['newFiles'].length).toBe(1);
    expect(emitted[0].newFiles.length).toBe(1);
    expect(emitted[0].keepImageIds).toEqual([]);
  });

  it('rejects a file that would exceed maxFiles combined with existing kept images', () => {
    component.maxFiles = 2;
    setExisting(existing);

    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: fileListFrom([makeFile('a.png')]) });

    component['onFilesSelected']({ target: input } as unknown as Event);

    expect(component['newFiles'].length).toBe(0);
    expect(component['error']).toBeTruthy();
  });

  it('rejects an unsupported mime type', () => {
    setExisting([]);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: fileListFrom([makeFile('a.txt', 'text/plain')]),
    });

    component['onFilesSelected']({ target: input } as unknown as Event);

    expect(component['newFiles'].length).toBe(0);
    expect(component['error']).toBeTruthy();
  });

  it('rejects an over-size file', () => {
    component.maxSizeBytes = 10;
    setExisting([]);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: fileListFrom([makeFile('a.png', 'image/png', 1024)]) });

    component['onFilesSelected']({ target: input } as unknown as Event);

    expect(component['newFiles'].length).toBe(0);
    expect(component['error']).toBeTruthy();
  });

  it('re-seeding existingImages (a different report opened) discards any in-progress newFiles', () => {
    setExisting([]);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: fileListFrom([makeFile('a.png')]) });
    component['onFilesSelected']({ target: input } as unknown as Event);
    expect(component['newFiles'].length).toBe(1);

    setExisting(existing);

    expect(component['newFiles']).toEqual([]);
    expect(component['keptImages'].length).toBe(2);
  });

  it('cleans up object URLs on destroy without throwing', () => {
    setExisting([]);
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: fileListFrom([makeFile('a.png')]) });
    component['onFilesSelected']({ target: input } as unknown as Event);

    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
