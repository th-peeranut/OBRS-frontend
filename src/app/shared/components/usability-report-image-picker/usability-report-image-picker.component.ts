import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { UsabilityReportImage } from '../../interfaces/usability-report.interface';

export interface UsabilityReportImagePickerChange {
  keepImageIds: number[];
  newFiles: File[];
}

/**
 * OBRS-433: the FAB's picker (`ReportUsabilityFabComponent`) is add-only —
 * `File[]` plus object-URL thumbnails, no concept of an existing SERVER
 * image. The My Reports edit form and follow-up composer both need that
 * (edit: keep/remove existing images and append new ones within a combined
 * ≤5 limit; composer: add-only, `existingImages=[]` degenerates to the same
 * behavior as the FAB's picker). Rather than fork the FAB's component or bolt
 * an optional existing-images input onto it (its contract has no keep/remove
 * concept to extend), this is a new shared component reusing the FAB's
 * `.report-preview-item` thumbnail+remove MARKUP/classes (own component
 * scope — Angular's default view encapsulation prevents bleed, same
 * reuse-without-fork idiom as the OPEN-seating count card reusing
 * `DropdownObrsPassengerComponent`'s `.count-section` classes, design-system
 * §12).
 */
@Component({
    selector: 'app-usability-report-image-picker',
    templateUrl: './usability-report-image-picker.component.html',
    styleUrl: './usability-report-image-picker.component.scss',
    standalone: false
})
export class UsabilityReportImagePickerComponent implements OnChanges, OnDestroy {
  @Input() existingImages: UsabilityReportImage[] = [];
  @Input() maxFiles = 5;
  @Input() maxSizeBytes = 5 * 1024 * 1024; // 5 MB
  @Input() allowedMimeTypes: string[] = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  @Output() imagesChange = new EventEmitter<UsabilityReportImagePickerChange>();

  protected keptImages: UsabilityReportImage[] = [];
  protected newFiles: File[] = [];
  protected thumbnailUrls: string[] = [];
  protected error = '';

  constructor(private readonly translate: TranslateService) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Only re-seed on a genuine new `existingImages` reference (a different
    // report opened) — this component is uncontrolled after that point (its
    // own remove/add mutate local state), so re-seeding on every parent CD
    // pass would silently discard an in-progress edit.
    if (changes['existingImages']) {
      this.keptImages = [...this.existingImages];
      this.newFiles = [];
      this.revokeThumbnails();
      this.thumbnailUrls = [];
      this.error = '';
    }
  }

  ngOnDestroy(): void {
    this.revokeThumbnails();
  }

  protected get totalCount(): number {
    return this.keptImages.length + this.newFiles.length;
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    this.error = '';
    const incoming = Array.from(input.files);

    if (this.totalCount + incoming.length > this.maxFiles) {
      this.error = this.translate.instant('USABILITY_REPORT.IMAGES.TOO_MANY');
      input.value = '';
      return;
    }

    const invalidType = incoming.find((f) => !this.allowedMimeTypes.includes(f.type));
    if (invalidType) {
      this.error = this.translate.instant('USABILITY_REPORT.IMAGES.INVALID_TYPE');
      input.value = '';
      return;
    }

    const overSize = incoming.find((f) => f.size > this.maxSizeBytes);
    if (overSize) {
      this.error = this.translate.instant('USABILITY_REPORT.IMAGES.TOO_LARGE');
      input.value = '';
      return;
    }

    for (const file of incoming) {
      this.newFiles.push(file);
      this.thumbnailUrls.push(URL.createObjectURL(file));
    }
    input.value = '';
    this.emitChange();
  }

  protected removeExisting(index: number): void {
    this.keptImages.splice(index, 1);
    this.error = '';
    this.emitChange();
  }

  protected removeNew(index: number): void {
    URL.revokeObjectURL(this.thumbnailUrls[index]);
    this.newFiles.splice(index, 1);
    this.thumbnailUrls.splice(index, 1);
    this.error = '';
    this.emitChange();
  }

  protected triggerFileInput(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  private emitChange(): void {
    this.imagesChange.emit({
      // OBRS-436: UsabilityReportImage.id is now correctly typed `number`
      // (was OBRS-376's `string` type lie), and the keepImageIds wire contract
      // is `number[]`, so the id passes straight through — the previous
      // `Number(img.id)` boundary coercion is gone.
      keepImageIds: this.keptImages.map((img) => img.id),
      newFiles: [...this.newFiles],
    });
  }

  private revokeThumbnails(): void {
    for (const url of this.thumbnailUrls) {
      URL.revokeObjectURL(url);
    }
  }
}
