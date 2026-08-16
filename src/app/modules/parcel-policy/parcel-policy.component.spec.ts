import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ParcelPolicyComponent } from './parcel-policy.component';
import { environment } from '../../../environments/environment';
import {
  PARCEL_POLICY_EFFECTIVE_DATE,
  PARCEL_POLICY_VERSION,
} from './parcel-policy.version';

// Real translation fixtures rather than a stub pipe, same call BusinessPolicyComponent's suite
// makes and for the same reason: every assertion below is about the RENDERED DOM (does "100"
// appear? does a raw "{{" leak?), which proves nothing unless TranslatePipe really interpolates.
// Both languages carry the SAME placeholders so the language-switch test can show the numbers
// survive `translate.use()` without a second fetch.
const EN_TRANSLATIONS = {
  POLICY: {
    PARCEL: {
      TITLE: 'Parcel carriage terms',
      VERSION_LINE: 'Version {{version}} · effective {{effectiveDate}}',
      SCOPE: '<p>Clause 1.</p>',
      PROHIBITED_INTRO: '<p>The company does not carry the following.</p>',
      PROHIBITED_EXTRA: '<p>Cash, gold and comparable valuables.</p>',
      FALSE_DECLARATION: '<p>False declaration is the sender\'s responsibility.</p>',
      LIMITS:
        '<p>No more than {{maxWeightKg}} kg. Carry-on up to {{carryOnFreeSizeMaxInch}} inches, at most {{carryOnFreeAisleMaxPerTrip}} per trip.</p>',
      LIMITS_ERROR: 'The weight and size limits could not be loaded.',
      RETRY: 'Try again',
      FREIGHT: '<p>Clause 4.</p>',
      COLLECTION: '<p>Clause 5.</p>',
      LEFT_AT_STOP: '<p>Clause 6.</p>',
      CANCELLATION: '<p>Clause 7.</p>',
      LIABILITY: '<p>Not more than 500 baht per parcel.</p>',
      LIABILITY_TIERS: '<p>Clause 8 tiers.</p>',
      CLAIMS: '<p>Clause 9.</p>',
      CONSENT: '<p>Clause 10.</p>',
      NOT_PASSENGER_BAGGAGE: '<p>Clause 11.</p>',
      AMENDMENT: '<p>Clause 12.</p>',
      SEE_BUSINESS_POLICY: 'Read the terms of service for passengers',
    },
  },
  PARCEL: {
    PROHIBITED: {
      ITEM: {
        FLAMMABLE: 'Flammable liquids/gas',
        EXPLOSIVE: 'Explosives or fireworks',
        WEAPON: 'Weapons or weapon parts',
      },
      UNLISTED: 'Items in the "{{slug}}" category',
      EMPTY: 'No prohibited categories are configured right now.',
    },
  },
};

const TH_TRANSLATIONS = {
  POLICY: {
    PARCEL: {
      TITLE: 'เงื่อนไขการรับขนพัสดุ',
      VERSION_LINE: 'ฉบับที่ {{version}} · มีผลตั้งแต่ {{effectiveDate}}',
      SCOPE: '<p>ข้อ 1</p>',
      PROHIBITED_INTRO: '<p>ห้างฯ ไม่รับขนพัสดุดังต่อไปนี้</p>',
      PROHIBITED_EXTRA: '<p>เงินสด ทองคำ และของมีค่าทำนองเดียวกัน</p>',
      FALSE_DECLARATION: '<p>การแจ้งข้อมูลเป็นเท็จเป็นความรับผิดของผู้ส่ง</p>',
      LIMITS:
        '<p>ไม่เกิน {{maxWeightKg}} กิโลกรัม สัมภาระถือขึ้นรถไม่เกิน {{carryOnFreeSizeMaxInch}} นิ้ว และไม่เกิน {{carryOnFreeAisleMaxPerTrip}} ชิ้นต่อเที่ยว</p>',
      LIMITS_ERROR: 'ไม่สามารถโหลดน้ำหนักและขนาดที่ระบบบังคับใช้ได้',
      RETRY: 'ลองใหม่',
      FREIGHT: '<p>ข้อ 4</p>',
      COLLECTION: '<p>ข้อ 5</p>',
      LEFT_AT_STOP: '<p>ข้อ 6</p>',
      CANCELLATION: '<p>ข้อ 7</p>',
      LIABILITY: '<p>ไม่เกิน 500 บาทต่อพัสดุหนึ่งราย</p>',
      LIABILITY_TIERS: '<p>ชั้นความรับผิด</p>',
      CLAIMS: '<p>ข้อ 9</p>',
      CONSENT: '<p>ข้อ 10</p>',
      NOT_PASSENGER_BAGGAGE: '<p>ข้อ 11</p>',
      AMENDMENT: '<p>ข้อ 12</p>',
      SEE_BUSINESS_POLICY: 'อ่านข้อกำหนดและเงื่อนไขสำหรับผู้โดยสาร',
    },
  },
  PARCEL: {
    PROHIBITED: {
      ITEM: {
        FLAMMABLE: 'ของเหลว/แก๊สไวไฟ',
        EXPLOSIVE: 'วัตถุระเบิดหรือดอกไม้ไฟ',
      },
      UNLISTED: 'สิ่งของประเภท "{{slug}}"',
      EMPTY: 'ขณะนี้ระบบยังไม่ได้กำหนดรายการสิ่งของต้องห้าม',
    },
  },
};

describe('ParcelPolicyComponent (OBRS-629)', () => {
  let fixture: ComponentFixture<ParcelPolicyComponent>;
  let httpMock: HttpTestingController;
  let translate: TranslateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ParcelPolicyComponent],
      imports: [CommonModule, TranslateModule.forRoot()],
      schemas: [NO_ERRORS_SCHEMA], // app-navbar / app-footer are real children; not declared here
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', EN_TRANSLATIONS, true);
    translate.setTranslation('th', TH_TRANSLATIONS, true);
    translate.use('en');

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ParcelPolicyComponent);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushPolicy(data: {
    maxWeightKg: number;
    carryOnFreeSizeMaxInch: number;
    carryOnFreeAisleMaxPerTrip: number;
    prohibitedCategories: string[];
  }): void {
    const req = httpMock.expectOne(`${environment.apiUrl}/api/parcel-policy`);
    req.flush({ code: 200, message: 'OK', data });
  }

  const POLICY = {
    maxWeightKg: 100,
    carryOnFreeSizeMaxInch: 28,
    carryOnFreeAisleMaxPerTrip: 10,
    prohibitedCategories: ['flammable', 'explosive'],
  };

  // The version line legitimately carries a date whose digits collide with the limits under test
  // ("2026-08-16" contains "8"), so the AC-3 assertions read the page without the metadata stamp.
  function textWithoutVersionLine(): string {
    const clone = fixture.nativeElement.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="parcel-policy-version"]')?.remove();
    return clone.textContent as string;
  }

  it('AC-3: before the API resolves, clause 3 is absent and no raw "{{" leaks, while the clauses that need no config already render', () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('{{');
    expect(text).not.toContain('100');
    expect(text).toContain('Clause 1.');
    expect(text).toContain('Clause 12.');

    // Drain the still-pending request so httpMock.verify() passes — this test is about the state
    // BEFORE the flush.
    flushPolicy(POLICY);
  });

  it('AC-3: renders the live config limits once the API resolves', () => {
    fixture.detectChanges();
    flushPolicy(POLICY);
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).not.toContain('{{');
    expect(text).toContain('100');
    expect(text).toContain('28');
    expect(text).toContain('10');
  });

  it('AC-3: on API error, clause 3 is replaced by an inline error + retry and NO limit number is invented', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${environment.apiUrl}/api/parcel-policy`).error(new ProgressEvent('error'));
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('The weight and size limits could not be loaded.');
    expect(text).toContain('Try again');
    expect(text).not.toContain('100');
    expect(text).not.toContain('28');
    // The other eleven clauses are not config-dependent and must still be readable during an outage.
    expect(text).toContain('Clause 12.');

    (fixture.nativeElement.querySelector('.policy-inline-retry') as HTMLButtonElement).click();
    flushPolicy(POLICY);
    fixture.detectChanges();
    expect(textWithoutVersionLine()).toContain('100');
  });

  it('AC-4: the prohibited list is whatever the config says — change the config and the page changes with it', () => {
    fixture.detectChanges();
    flushPolicy(POLICY);
    fixture.detectChanges();

    const rows = () =>
      Array.from(
        fixture.nativeElement.querySelectorAll('[data-testid="parcel-policy-prohibited"] li')
      ).map((li) => (li as HTMLElement).textContent?.trim());

    expect(rows().length).toBe(2);
    expect(rows()[0]).toContain('Flammable liquids/gas');
    expect(rows()[1]).toContain('Explosives or fireworks');

    // Same component, a config row an admin edited: the page must follow, not keep its own copy.
    const next = TestBed.createComponent(ParcelPolicyComponent);
    next.detectChanges();
    httpMock
      .expectOne(`${environment.apiUrl}/api/parcel-policy`)
      .flush({ code: 200, message: 'OK', data: { ...POLICY, prohibitedCategories: ['weapon'] } });
    next.detectChanges();
    const nextRows = Array.from(
      next.nativeElement.querySelectorAll('[data-testid="parcel-policy-prohibited"] li')
    ).map((li) => (li as HTMLElement).textContent?.trim());
    expect(nextRows.length).toBe(1);
    expect(nextRows[0]).toContain('Weapons or weapon parts');
  });

  it('AC-4: an empty config list says intake is blocking nothing rather than reprinting five categories from memory', () => {
    fixture.detectChanges();
    flushPolicy({ ...POLICY, prohibitedCategories: [] });
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('No prohibited categories are configured right now.');
    expect(text).not.toContain('Flammable');
  });

  it('states the published version and date from parcel-policy.version.ts, even while the config fetch is still pending', () => {
    fixture.detectChanges();

    const stamp = (
      fixture.nativeElement.querySelector('[data-testid="parcel-policy-version"]') as HTMLElement
    ).textContent as string;
    expect(stamp).toContain(PARCEL_POLICY_VERSION);
    expect(stamp).toContain(PARCEL_POLICY_EFFECTIVE_DATE);
    expect(stamp).not.toContain('{{');

    flushPolicy(POLICY);
  });

  it('survives a language switch without re-fetching: the limits stay correct in the new language', () => {
    fixture.detectChanges();
    flushPolicy(POLICY);
    fixture.detectChanges();

    translate.use('th');
    fixture.detectChanges();

    const text = textWithoutVersionLine();
    expect(text).toContain('เงื่อนไขการรับขนพัสดุ');
    expect(text).toContain('100');
    expect(text).toContain('28');
    // httpMock.verify() in afterEach fails this test if the switch triggered a second request —
    // the assertion IS the absence of a call.
  });

  it('publishes the 500-baht ceiling as a flat statement: it is a contract term with no config to read it from', () => {
    fixture.detectChanges();
    flushPolicy(POLICY);
    fixture.detectChanges();

    expect(textWithoutVersionLine()).toContain('500');
  });
});
