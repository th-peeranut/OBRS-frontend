import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminTranslationReqDto,
  AdminTranslationDto,
  CreateLookupPayload,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';

interface LookupEntry {
  id: number;
  category: string;
  slug: string;
  enLabel: string;
  enDescription: string;
  thLabel: string;
  thDescription: string;
}

@Component({
  selector: 'app-lookup-settings-page',
  templateUrl: './lookup-settings-page.component.html',
  styleUrl: './lookup-settings-page.component.scss',
})
export class LookupSettingsPageComponent implements OnInit {
  protected categories: Array<{ name: string; count: number }> = [];
  protected entries: LookupEntry[] = [];

  protected isLoading = false;
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedEntry: LookupEntry | null = null;

  protected readonly lookupForm: FormGroup;

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService
  ) {
    this.lookupForm = this.formBuilder.group({
      category: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
      enLabel: ['', [Validators.required, Validators.maxLength(255)]],
      enDescription: ['', [Validators.maxLength(500)]],
      thLabel: ['', [Validators.maxLength(255)]],
      thDescription: ['', [Validators.maxLength(500)]],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadLookups();
  }

  protected get totalEntries(): number {
    return this.entries.length;
  }

  protected openCreateModal(): void {
    this.isEditMode = false;
    this.selectedEntry = null;
    this.lookupForm.reset({
      category: '',
      slug: '',
      enLabel: '',
      enDescription: '',
      thLabel: '',
      thDescription: '',
    });
    this.lookupForm.enable();
    this.isFormModalOpen = true;
  }

  protected openEditModal(entry: LookupEntry): void {
    this.isEditMode = true;
    this.selectedEntry = entry;
    this.lookupForm.reset({
      category: entry.category,
      slug: entry.slug,
      enLabel: entry.enLabel,
      enDescription: entry.enDescription,
      thLabel: entry.thLabel,
      thDescription: entry.thDescription,
    });
    this.isFormModalOpen = true;
  }

  protected closeFormModal(): void {
    if (this.isSubmitting) {
      return;
    }

    this.isFormModalOpen = false;
    this.selectedEntry = null;
    this.lookupForm.reset();
  }

  protected openDeleteModal(entry: LookupEntry): void {
    this.selectedEntry = entry;
    this.isDeleteModalOpen = true;
  }

  protected closeDeleteModal(): void {
    if (this.isDeleting) {
      return;
    }

    this.isDeleteModalOpen = false;
    this.selectedEntry = null;
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const field = this.lookupForm.get(fieldName);
    return !!field && field.invalid && (field.dirty || field.touched);
  }

  protected async submitLookup(): Promise<void> {
    if (this.lookupForm.invalid) {
      this.lookupForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    try {
      const payload = this.toLookupPayload();

      if (this.isEditMode && this.selectedEntry) {
        await firstValueFrom(
          this.adminApiService.updateLookup(
            this.selectedEntry.category,
            this.selectedEntry.slug,
            payload
          )
        );
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.UPDATED'));
      } else {
        await firstValueFrom(this.adminApiService.createLookup(payload));
        await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.CREATED'));
      }

      this.isSubmitting = false;
      this.closeFormModal();
      await this.loadLookups();
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED'));
    } finally {
      this.isSubmitting = false;
    }
  }

  protected async confirmDelete(): Promise<void> {
    if (!this.selectedEntry) {
      return;
    }

    this.isDeleting = true;
    try {
      await firstValueFrom(
        this.adminApiService.deleteLookup(
          this.selectedEntry.category,
          this.selectedEntry.slug
        )
      );

      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.isDeleting = false;
      this.closeDeleteModal();
      await this.loadLookups();
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
    }
  }

  private async loadLookups(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const response = await firstValueFrom(this.adminApiService.getLookups());
      const lookups = response?.data ?? [];

      this.entries = lookups.map((lookup) => this.toLookupEntry(lookup));
      this.categories = this.toCategorySummary(lookups);
    } catch {
      this.errorMessage = this.translate.instant('ADMIN.MESSAGES.LOAD_LOOKUPS_FAILED');
    } finally {
      this.isLoading = false;
    }
  }

  private toLookupPayload(): CreateLookupPayload {
    const category = String(this.lookupForm.value['category'] ?? '')
      .trim()
      .toLowerCase();
    const slug = String(this.lookupForm.value['slug'] ?? '')
      .trim()
      .toLowerCase();
    const enLabel = String(this.lookupForm.value['enLabel'] ?? '').trim();
    const enDescription = String(this.lookupForm.value['enDescription'] ?? '').trim();
    const thLabel = String(this.lookupForm.value['thLabel'] ?? '').trim();
    const thDescription = String(this.lookupForm.value['thDescription'] ?? '').trim();

    const translations: AdminTranslationReqDto[] = [
      {
        locale: 'en',
        label: enLabel,
        description: enDescription || undefined,
      },
    ];

    if (thLabel) {
      translations.push({
        locale: 'th',
        label: thLabel,
        description: thDescription || undefined,
      });
    }

    return {
      category,
      slug,
      translations,
    };
  }

  private toLookupEntry(lookup: AdminLookupDto): LookupEntry {
    return {
      id: lookup.id,
      category: lookup.category,
      slug: lookup.slug,
      enLabel: this.getTranslationLabel(lookup.translations, 'en') ?? '-',
      enDescription: this.getTranslationDescription(lookup.translations, 'en') ?? '-',
      thLabel: this.getTranslationLabel(lookup.translations, 'th') ?? '-',
      thDescription: this.getTranslationDescription(lookup.translations, 'th') ?? '-',
    };
  }

  private toCategorySummary(
    lookups: AdminLookupDto[]
  ): Array<{ name: string; count: number }> {
    const categoryMap = new Map<string, number>();

    for (const lookup of lookups) {
      categoryMap.set(
        lookup.category,
        (categoryMap.get(lookup.category) ?? 0) + 1
      );
    }

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private getTranslationLabel(
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.label) {
        return translation.label;
      }
    }

    return translations.find((item) => item.label)?.label ?? null;
  }

  private getTranslationDescription(
    translations: AdminTranslationDto[] | null | undefined,
    locale?: string
  ): string | null {
    if (!translations || translations.length === 0) {
      return null;
    }

    if (locale) {
      const translation = translations.find(
        (item) => item.locale?.toLowerCase() === locale.toLowerCase()
      );

      if (translation?.description) {
        return translation.description;
      }
    }

    return translations.find((item) => item.description)?.description ?? null;
  }
}
