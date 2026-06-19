import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription, firstValueFrom } from 'rxjs';
import {
  AdminApiService,
  AdminLookupDto,
  AdminTranslationReqDto,
  AdminTranslationCollection,
  CreateLookupPayload,
  getAdminTranslationDescription,
  getAdminTranslationLabel,
} from '../../../../services/admin/admin-api.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { TranslateService } from '@ngx-translate/core';
import { LookupsStore } from './lookups.store';

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
export class LookupSettingsPageComponent implements OnInit, OnDestroy {
  protected categories: Array<{ name: string; count: number }> = [];
  protected entries: LookupEntry[] = [];

  protected isRefreshing = false;
  protected refreshFailed = false;
  protected readonly skeletonRows = Array.from({ length: 5 });
  protected errorMessage = '';

  protected isFormModalOpen = false;
  protected isDeleteModalOpen = false;
  protected isSubmitting = false;
  protected isDeleting = false;
  protected isEditMode = false;
  protected selectedEntry: LookupEntry | null = null;

  protected readonly lookupForm: FormGroup;

  private readonly subscriptions = new Subscription();

  constructor(
    private readonly adminApiService: AdminApiService,
    private readonly formBuilder: FormBuilder,
    private readonly alertService: AlertService,
    private readonly translate: TranslateService,
    private readonly store: LookupsStore
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

  ngOnInit(): void {
    // Render the cached lookups instantly on re-entry, then revalidate.
    this.subscriptions.add(
      this.store.data$.subscribe((lookups) => {
        if (lookups) {
          this.entries = lookups.map((lookup) => this.toLookupEntry(lookup));
          this.categories = this.toCategorySummary(lookups);
        }
      })
    );
    this.subscriptions.add(
      this.store.refreshing$.subscribe((refreshing) => (this.isRefreshing = refreshing))
    );
    this.subscriptions.add(
      this.store.error$.subscribe((failed) => {
        this.refreshFailed = failed && this.store.hasValue;
        this.errorMessage =
          failed && !this.store.hasValue
            ? this.translate.instant('ADMIN.MESSAGES.LOAD_LOOKUPS_FAILED')
            : '';
      })
    );
    void this.store.refresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Skeletons only while loading with no cached data yet. */
  protected get isLoading(): boolean {
    return this.isRefreshing && !this.store.hasValue;
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
      await this.store.refresh();
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
      await this.store.refresh();
    } catch {
      await this.alertService.error(this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED'));
    } finally {
      this.isDeleting = false;
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
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationLabel(translations, locale);
  }

  private getTranslationDescription(
    translations: AdminTranslationCollection | null | undefined,
    locale?: string
  ): string | null {
    return getAdminTranslationDescription(translations, locale);
  }
}
