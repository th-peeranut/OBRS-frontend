import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { NotificationMessagePreviewPanelComponent } from './notification-message-preview-panel.component';

describe('NotificationMessagePreviewPanelComponent', () => {
  let fixture: ComponentFixture<NotificationMessagePreviewPanelComponent>;
  let component: NotificationMessagePreviewPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotificationMessagePreviewPanelComponent],
      imports: [TranslateModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationMessagePreviewPanelComponent);
    component = fixture.componentInstance;
  });

  it('substitutes sampleArgs into the preview and highlights them with <mark>', () => {
    component.text = 'Booking {0} confirmed';
    component.sampleArgs = ['{0}=BK-00123'];
    fixture.detectChanges();

    const mark = fixture.debugElement.query(By.css('mark.nm-preview-placeholder'));
    expect(mark).toBeTruthy();
    expect(mark.nativeElement.textContent).toBe('BK-00123');
    expect(fixture.nativeElement.textContent).toContain('Booking BK-00123 confirmed');
  });

  it('renders plain text with no <mark> when there are no placeholders', () => {
    component.text = 'No placeholders';
    component.sampleArgs = [];
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('mark'))).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('No placeholders');
  });
});
