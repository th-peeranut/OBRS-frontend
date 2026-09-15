import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FooterComponent } from './footer.component';
import { buildInfo } from '../../../../environments/build-info';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;
  let component: FooterComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FooterComponent],
      imports: [RouterTestingModule, TranslateModule.forRoot()],
    }).compileComponents();

    // TranslateModule.forRoot() has no loader here, so the pipe would otherwise render the
    // raw key with its params never interpolated. Set the real key so the AC-5 assertion
    // below is checking rendered TEXT, not the untranslated key string.
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      HOME: { FOOTER: { BUILD_VERSION: 'Version {{version}} ({{sha}})' } },
    });
    translate.use('en');

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // OBRS-1075 AC-6 (no fallback). buildInfo is read from the same gitignored,
  // generator-written module the app reads (src/environments/build-info.ts) -- never a
  // literal here, so this assertion does not encode today's version/sha (AC-7).
  it('buildInfo is shaped like a real git tag and a real short commit sha', () => {
    expect(buildInfo.appVersion).toMatch(/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
    expect(buildInfo.buildSha).toMatch(/^[0-9a-f]{7}$/);
  });

  // OBRS-1075 AC-5. FRONTEND-GOTCHAS (OBRS-900): assert the field the template actually
  // RENDERS, not just a component property -- an element that always shows '0.0.0' would
  // also pass a property-only assertion.
  it('renders the build version and sha in the element the customer actually sees', () => {
    const el = fixture.debugElement.query(By.css('[data-testid="footer-build-info"]'));
    expect(el).not.toBeNull();
    expect(el.nativeElement.textContent).toContain(buildInfo.appVersion);
    expect(el.nativeElement.textContent).toContain(buildInfo.buildSha);
  });
});
