import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  Renderer2,
  ViewChild,
} from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AlertService } from '../../services/alert.service';
import { UsabilityReportService } from '../../../services/usability-report/usability-report.service';
import { mapApiErrorCode } from '../../lib/api-error-code';

interface SelectOption {
  label: string;
  value: string;
}

/**
 * OBRS-1207. Everything a user can click, and therefore everything this button
 * must not be sitting on top of.
 *
 * KEEP IN SYNC with `INTERACTIVE_SELECTOR` in `e2e/support/fab-occlusion.ts`,
 * which is the gate that proves this works. `scripts/check-fab-yield-selector.mjs`
 * fails the build if the two drift, because a selector this file stopped
 * matching would make the gate green by measuring a rule that is not enforced —
 * the exact shape of the defect this card exists to remove.
 */
export const FAB_YIELD_TRIGGER_SELECTOR = [
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Applied while something clickable is underneath — see the SCSS for what it does. */
const YIELD_CLASS = 'report-fab--yield';

@Component({
    selector: 'app-report-usability-fab',
    templateUrl: './report-usability-fab.component.html',
    styleUrl: './report-usability-fab.component.scss',
    standalone: false
})
export class ReportUsabilityFabComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('fabButton') private fabButton?: ElementRef<HTMLButtonElement>;

  protected isModalOpen = false;
  protected isSubmitting = false;
  protected imageError = '';
  protected submitError = '';
  protected attachedFiles: File[] = [];
  protected thumbnailUrls: string[] = [];
  protected categoryOptions: SelectOption[] = [];

  private readonly trimmedRequired = (control: AbstractControl): ValidationErrors | null => {
    const val: string = control.value ?? '';
    return val.trim().length > 0 ? null : { required: true };
  };

  // Reporter email is OPTIONAL — an empty value is always valid (anonymous
  // submission stays supported). Only a non-empty value is checked against a
  // simple email shape.
  private static readonly EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private readonly optionalEmail = (control: AbstractControl): ValidationErrors | null => {
    const val: string = (control.value ?? '').trim();
    if (!val) {
      return null;
    }
    return ReportUsabilityFabComponent.EMAIL_PATTERN.test(val) ? null : { email: true };
  };

  protected readonly MAX_FILES = 5;
  protected readonly MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
  protected readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  protected form!: FormGroup;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly translate: TranslateService,
    private readonly usabilityReportService: UsabilityReportService,
    private readonly alertService: AlertService,
    private readonly zone: NgZone,
    private readonly renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      category: ['bug'],
      description: ['', this.trimmedRequired],
      reporterEmail: ['', this.optionalEmail],
    });

    this.buildCategoryOptions();

    this.translate.onLangChange
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.buildCategoryOptions());
  }

  // ── OBRS-1207: yield the click when something clickable is underneath ──────
  //
  // The FAB is `position: fixed` over `<router-outlet>`, so it floats above
  // EVERY route at a spot no page controls. There is no static position that is
  // safe: bottom-left lands on the admin sidebar, and any content column that
  // reaches the viewport edge puts its right-aligned buttons under the corner.
  // Measured on `bef31b4f` across all 47 hermetically reachable routes at
  // 1280×720, three buttons lost their click to this element — `.select-btn` on
  // /schedule-booking, `.btn-search` on /, and "Add Promotion Code" on
  // /admin/promotions — and the customer-facing two are on the booking funnel's
  // critical path: the traveller pressed "select" and got a bug-report dialog.
  //
  // So the button gets out of the way instead of the app rearranging itself
  // around it: while anything clickable is beneath it, it fades and stops
  // taking pointer events, and the click reaches what the user aimed at. It
  // stays in the tab order while yielded — `pointer-events` does not affect
  // keyboard activation, so the one input method that cannot miss keeps working.

  private yieldRafId: number | null = null;
  private yieldTeardown: (() => void)[] = [];
  private isYielding = false;

  ngAfterViewInit(): void {
    // Outside Angular on purpose: this runs on every scroll frame, and inside
    // the zone it would schedule a change-detection pass per frame across the
    // whole app for a state nothing else reads. The class is written straight
    // onto the element, so no binding and no CD are involved either way.
    this.zone.runOutsideAngular(() => {
      const schedule = () => this.scheduleYieldCheck();

      window.addEventListener('scroll', schedule, { passive: true, capture: true });
      window.addEventListener('resize', schedule, { passive: true });
      this.yieldTeardown.push(() => {
        window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions);
        window.removeEventListener('resize', schedule);
      });

      // Scroll and resize are not the only ways content arrives under a fixed
      // element: a list that finishes loading, a filter that collapses a table
      // or a route change all move things beneath it without either firing.
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(schedule);
        ro.observe(document.body);
        this.yieldTeardown.push(() => ro.disconnect());
      }
      if (typeof MutationObserver !== 'undefined') {
        const mo = new MutationObserver(schedule);
        mo.observe(document.body, { childList: true, subtree: true });
        this.yieldTeardown.push(() => mo.disconnect());
      }

      schedule();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.revokeThumbnails();
    if (this.yieldRafId !== null) {
      cancelAnimationFrame(this.yieldRafId);
      this.yieldRafId = null;
    }
    for (const off of this.yieldTeardown) off();
    this.yieldTeardown = [];
  }

  /** Coalesces a burst of events into one hit-test per animation frame. */
  private scheduleYieldCheck(): void {
    if (this.yieldRafId !== null) return;
    this.yieldRafId = requestAnimationFrame(() => {
      this.yieldRafId = null;
      this.applyYieldState();
    });
  }

  private applyYieldState(): void {
    const el = this.fabButton?.nativeElement;
    if (!el) return;
    // With the modal up the FAB is behind the backdrop and nothing underneath is
    // reachable anyway; hit-testing here would only ever answer about the modal.
    const shouldYield = this.isModalOpen ? false : this.isClickableUnderFab(el);
    if (shouldYield === this.isYielding) return;
    this.isYielding = shouldYield;
    if (shouldYield) {
      this.renderer.addClass(el, YIELD_CLASS);
    } else {
      this.renderer.removeClass(el, YIELD_CLASS);
    }
  }

  /**
   * Asks the browser rather than comparing rectangles. `elementsFromPoint` is
   * the only oracle that accounts for z-index, stacking contexts, transforms and
   * `pointer-events` at once — and a rectangle comparison against a `fixed`
   * element is exactly the mistake that let this defect live for months behind a
   * green E2E test (OBRS-1207).
   *
   * Nine sample points to FIND candidates, but the trigger is whether the pill
   * covers a candidate's CLICK POINT — its centre — not whether it touches it
   * anywhere. The distinction was measured, not assumed: yielding on any
   * overlap left the FAB inert at 54% of the reachable scroll offsets on
   * /schedule-booking and 37% on / (20px sampling, 1280×720), because the pill
   * clips the corner of something clickable most of the way down a dense page.
   * Centre-coverage is also exactly the contract the gate asserts, so the two
   * cannot disagree about what "blocked" means — and an element whose centre is
   * clear is still clickable at that centre, which is where users and Playwright
   * both aim.
   *
   * The FAB and its own descendants are skipped by identity, NOT by trusting it
   * to appear in the stack — once it is yielding it has `pointer-events: none`
   * and drops out of the hit-test entirely, so a check written the other way
   * would clear the class, re-detect on the next frame and flicker forever.
   */
  private isClickableUnderFab(fab: HTMLElement): boolean {
    const r = fab.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;

    const inset = 2;
    const xs = [r.left + inset, (r.left + r.right) / 2, r.right - inset];
    const ys = [r.top + inset, (r.top + r.bottom) / 2, r.bottom - inset];

    for (const x of xs) {
      for (const y of ys) {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
        for (const other of document.elementsFromPoint(x, y)) {
          if (other === fab || fab.contains(other) || other.contains(fab)) continue;
          if (!other.matches(FAB_YIELD_TRIGGER_SELECTOR)) continue;
          const o = other.getBoundingClientRect();
          if (o.width === 0 || o.height === 0) continue;
          const cx = o.left + o.width / 2;
          const cy = o.top + o.height / 2;
          if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return true;
        }
      }
    }
    return false;
  }

  protected openModal(): void {
    this.isModalOpen = true;
    document.body.style.overflow = 'hidden';
    this.scheduleYieldCheck();
  }

  protected closeModal(): void {
    this.isModalOpen = false;
    document.body.style.overflow = '';
    this.resetForm();
    this.scheduleYieldCheck();
  }

  protected onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    this.imageError = '';
    const incoming = Array.from(input.files);
    const combined = [...this.attachedFiles, ...incoming];

    if (combined.length > this.MAX_FILES) {
      this.imageError = this.translate.instant('USABILITY_REPORT.IMAGES.TOO_MANY');
      input.value = '';
      return;
    }

    const invalidType = incoming.find((f) => !this.ALLOWED_MIME_TYPES.includes(f.type));
    if (invalidType) {
      this.imageError = this.translate.instant('USABILITY_REPORT.IMAGES.INVALID_TYPE');
      input.value = '';
      return;
    }

    const overSize = incoming.find((f) => f.size > this.MAX_FILE_SIZE_BYTES);
    if (overSize) {
      this.imageError = this.translate.instant('USABILITY_REPORT.IMAGES.TOO_LARGE');
      input.value = '';
      return;
    }

    for (const file of incoming) {
      this.attachedFiles.push(file);
      this.thumbnailUrls.push(URL.createObjectURL(file));
    }

    input.value = '';
  }

  protected removeFile(index: number): void {
    URL.revokeObjectURL(this.thumbnailUrls[index]);
    this.attachedFiles.splice(index, 1);
    this.thumbnailUrls.splice(index, 1);
    this.imageError = '';
  }

  protected triggerFileInput(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  onSubmit(): void {
    this.submitError = '';
    const descriptionRaw: string = this.form.get('description')?.value ?? '';
    const description = descriptionRaw.trim();
    const emailCtrl = this.form.get('reporterEmail');
    const reporterEmail: string = (emailCtrl?.value ?? '').trim();

    if (!description || emailCtrl?.invalid) {
      this.form.get('description')?.markAsTouched();
      emailCtrl?.markAsTouched();
      return;
    }

    const category: string = this.form.get('category')?.value ?? 'bug';
    const routeUrl = this.router.url;

    const formData = new FormData();
    formData.append('category', category);
    formData.append('description', description);
    formData.append('routeUrl', routeUrl);
    // Optional — empty string is fine and keeps the submission anonymous;
    // the backend treats a blank value as null.
    formData.append('reporterEmail', reporterEmail);
    for (const file of this.attachedFiles) {
      formData.append('images', file);
    }

    this.isSubmitting = true;
    this.usabilityReportService
      .submitReport(formData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSubmitting = false;
          this.translate
            .get('USABILITY_REPORT.SUBMIT_SUCCESS')
            .pipe(takeUntil(this.destroy$))
            .subscribe((msg: string) => this.alertService.success(msg));
          this.closeModal();
        },
        error: (err: unknown) => {
          this.isSubmitting = false;
          const errorCode =
            (err as { error?: { errorCode?: string } })?.error?.errorCode;
          this.translate
            .get(this.mapErrorCodeKey(errorCode))
            .pipe(takeUntil(this.destroy$))
            .subscribe((msg: string) => (this.submitError = msg));
        },
      });
  }

  protected get descriptionInvalid(): boolean {
    const ctrl = this.form.get('description');
    return !!(ctrl?.invalid && ctrl.touched);
  }

  protected get emailInvalid(): boolean {
    const ctrl = this.form.get('reporterEmail');
    return !!(ctrl?.invalid && ctrl.touched);
  }

  private mapErrorCodeKey(errorCode: string | undefined): string {
    const knownCodes: Record<string, string> = {
      REPORT_INVALID_CATEGORY: 'USABILITY_REPORT.ERROR.REPORT_INVALID_CATEGORY',
      REPORT_TOO_MANY_IMAGES: 'USABILITY_REPORT.ERROR.REPORT_TOO_MANY_IMAGES',
      REPORT_UNSUPPORTED_MEDIA_TYPE: 'USABILITY_REPORT.ERROR.REPORT_UNSUPPORTED_MEDIA_TYPE',
      REPORT_IMAGE_TOO_LARGE: 'USABILITY_REPORT.ERROR.REPORT_IMAGE_TOO_LARGE',
      REPORT_PAYLOAD_TOO_LARGE: 'USABILITY_REPORT.ERROR.REPORT_PAYLOAD_TOO_LARGE',
      REPORT_RATE_LIMITED: 'USABILITY_REPORT.ERROR.REPORT_RATE_LIMITED',
      VALIDATION_FAILED: 'USABILITY_REPORT.ERROR.VALIDATION_FAILED',
    };

    return mapApiErrorCode(errorCode, knownCodes, 'USABILITY_REPORT.ERROR.GENERIC');
  }

  private buildCategoryOptions(): void {
    this.categoryOptions = [
      { label: this.translate.instant('USABILITY_REPORT.CATEGORY.BUG'), value: 'bug' },
      {
        label: this.translate.instant('USABILITY_REPORT.CATEGORY.UX_UI_IMPROVEMENT'),
        value: 'ux_ui_improvement',
      },
      {
        label: this.translate.instant('USABILITY_REPORT.CATEGORY.SUGGESTION'),
        value: 'suggestion',
      },
    ];
  }

  private resetForm(): void {
    this.form.reset({ category: 'bug', description: '', reporterEmail: '' });
    this.submitError = '';
    this.imageError = '';
    this.revokeThumbnails();
    this.attachedFiles = [];
    this.thumbnailUrls = [];
    this.isSubmitting = false;
  }

  private revokeThumbnails(): void {
    for (const url of this.thumbnailUrls) {
      URL.revokeObjectURL(url);
    }
  }
}
