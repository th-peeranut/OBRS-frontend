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
import { extractApiErrorMessage } from '../../../../shared/lib/api-error';
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
      category: ['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],
      slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9_-]+$/)]],
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
      await this.alertService.warning(this.translate.instant('ADMIN.VALIDATION.FORM_INVALID'));
      return;
    }

    this.isSubmitting = true;
    const wasEdit = this.isEditMode;
    const original = this.selectedEntry;

    try {
      const payload = this.toLookupPayload();

      if (wasEdit && original) {
        await firstValueFrom(
          this.adminApiService.updateLookup(original.category, original.slug, payload)
        );
      } else {
        await firstValueFrom(this.adminApiService.createLookup(payload));
      }

      // Reflect the change in the table immediately. Each SIT round-trip costs
      // ~2s on its own, so waiting on a full re-fetch before the user sees the
      // edit is what made saves feel slow — patch locally, revalidate in the
      // background.
      this.applyOptimisticLookup(payload, wasEdit ? original : null);
      this.isSubmitting = false;
      this.closeFormModal();
      await this.alertService.success(
        this.translate.instant(wasEdit ? 'ADMIN.MESSAGES.UPDATED' : 'ADMIN.MESSAGES.CREATED')
      );
      void this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.SAVE_FAILED');
      await this.alertService.error(message);
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
      // Capture before closeDeleteModal clears selectedEntry.
      const { category, slug } = this.selectedEntry;
      await firstValueFrom(
        this.adminApiService.deleteLookup(category, slug)
      );

      // Optimistically remove the deleted row so the table updates synchronously,
      // without waiting for the background re-fetch to land (~2s on SIT).
      this.store.mutate((list) => list.filter((x) => !(x.category === category && x.slug === slug)));
      await this.alertService.success(this.translate.instant('ADMIN.MESSAGES.DELETED'));
      this.isDeleting = false;
      this.closeDeleteModal();
      await this.store.refresh();
    } catch (error) {
      const message =
        extractApiErrorMessage(error) ||
        this.translate.instant('ADMIN.MESSAGES.DELETE_FAILED');
      await this.alertService.error(message);
    } finally {
      this.isDeleting = false;
    }
  }

  /** Entries grouped by category so the archive table reads by section. */
  protected get groupedEntries(): Array<{ category: string; items: LookupEntry[] }> {
    const map = new Map<string, LookupEntry[]>();
    for (const entry of this.entries) {
      const items = map.get(entry.category) ?? [];
      items.push(entry);
      map.set(entry.category, items);
    }

    return Array.from(map.entries())
      .map(([category, items]) => ({ category, items }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  // Patch the local table to reflect a just-saved lookup, so the change shows
  // instantly while the authoritative re-fetch runs in the background.
  private applyOptimisticLookup(
    payload: CreateLookupPayload,
    original: LookupEntry | null
  ): void {
    const entry = this.toEntryFromPayload(payload, original?.id ?? 0);

    if (original) {
      this.entries = this.entries.map((existing) =>
        existing.category === original.category && existing.slug === original.slug
          ? entry
          : existing
      );
    } else {
      this.entries = [entry, ...this.entries];
    }

    this.categories = this.toCategorySummaryFromEntries(this.entries);
  }

  private toEntryFromPayload(payload: CreateLookupPayload, id: number): LookupEntry {
    const byLocale = (locale: string) =>
      payload.translations.find((translation) => translation.locale === locale);
    const en = byLocale('en');
    const th = byLocale('th');

    return {
      id,
      category: payload.category,
      slug: payload.slug,
      enLabel: en?.label || '-',
      enDescription: en?.description || '-',
      thLabel: th?.label || '-',
      thDescription: th?.description || '-',
    };
  }

  private toCategorySummaryFromEntries(
    entries: LookupEntry[]
  ): Array<{ name: string; count: number }> {
    const categoryMap = new Map<string, number>();
    for (const entry of entries) {
      categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + 1);
    }

    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
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
