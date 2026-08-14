import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { NotificationMessageCreditPanelComponent } from './notification-message-credit-panel.component';

describe('NotificationMessageCreditPanelComponent (AC12)', () => {
  let fixture: ComponentFixture<NotificationMessageCreditPanelComponent>;
  let component: NotificationMessageCreditPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessageCreditPanelComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      ADMIN: {
        NOTIFICATION_MESSAGES: {
          CREDIT: {
            LABEL: '{{credits}} credit (was {{baseline}}, {{delta}})',
            DELTA_ZERO: 'no change',
            HINT: 'hint text',
            NOT_BLOCKING_NOTE: 'not blocking',
          },
        },
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(NotificationMessageCreditPanelComponent);
    component = fixture.componentInstance;
  });

  it('shows a plus-signed delta in the warning colour when cost went up', () => {
    component.credits = 3;
    component.baselineCredits = 2;
    fixture.detectChanges();

    expect(component['delta']).toBe(1);
    expect(component['deltaDisplay']).toBe('+1');
    expect(component['deltaClass']).toBe('is-warning');
  });

  it('shows the already-signed negative delta in the success colour when cost went down', () => {
    component.credits = 1;
    component.baselineCredits = 3;
    fixture.detectChanges();

    expect(component['delta']).toBe(-2);
    expect(component['deltaDisplay']).toBe('-2');
    expect(component['deltaClass']).toBe('is-success');
  });

  it('shows the translated DELTA_ZERO text in the muted colour when unchanged', () => {
    component.credits = 2;
    component.baselineCredits = 2;
    fixture.detectChanges();

    expect(component['delta']).toBe(0);
    expect(component['deltaDisplay']).toBe('no change');
    expect(component['deltaClass']).toBe('is-muted');
  });

  it('always renders the non-blocking note — display only, never a gate', () => {
    component.credits = 3;
    component.baselineCredits = 2;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('not blocking');
  });

  it('treats null credits/baseline as 0 for the delta computation', () => {
    component.credits = null;
    component.baselineCredits = null;
    fixture.detectChanges();

    expect(component['delta']).toBe(0);
  });
});
