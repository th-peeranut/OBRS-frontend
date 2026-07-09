import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { PassengerSeatBoxComponent } from './passenger-seat-box.component';

describe('PassengerSeatBoxComponent', () => {
  let component: PassengerSeatBoxComponent;
  let fixture: ComponentFixture<PassengerSeatBoxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PassengerSeatBoxComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PassengerSeatBoxComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders no icon when gender is empty', () => {
    component.label = 'B1';
    component.gender = '';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('img'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.passenger-selected-icon'))).toBeNull();
  });

  it('renders the male icon unchanged (existing call sites never pass SELECTED)', () => {
    component.label = 'B1';
    component.gender = 'MALE';
    fixture.detectChanges();

    const img = fixture.debugElement.query(By.css('.passenger-male-icon'));
    expect(img).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.passenger-selected-icon'))).toBeNull();
  });

  it('renders the female icon unchanged', () => {
    component.label = 'B1';
    component.gender = 'FEMALE';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.passenger-female-icon'))).not.toBeNull();
  });

  it('renders the monk icon unchanged', () => {
    component.label = 'B1';
    component.gender = 'MONK';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.passenger-monk-icon'))).not.toBeNull();
  });

  describe("gender='SELECTED' (OBRS-110 change-seat marker)", () => {
    it('renders a neutral check-marker icon, not a gender image', () => {
      component.label = 'B1';
      component.gender = 'SELECTED';
      fixture.detectChanges();

      const marker = fixture.debugElement.query(By.css('.passenger-selected-icon'));
      expect(marker).not.toBeNull();
      expect(marker.nativeElement.textContent.trim()).toBe('check_circle');
      expect(fixture.debugElement.query(By.css('img'))).toBeNull();
    });

    it('does not render the SELECTED marker when the seat is disabled', () => {
      component.label = 'B1';
      component.gender = 'SELECTED';
      component.isDisabled = true;
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.passenger-selected-icon'))).toBeNull();
    });
  });

  it('emits the label on click when enabled', () => {
    component.label = 'B7';
    const spy = spyOn(component.passengerSeatOutput, 'emit');

    component.setPassengerSeatOuput('B7');

    expect(spy).toHaveBeenCalledWith('B7');
  });

  it('does not emit when disabled', () => {
    component.isDisabled = true;
    const spy = spyOn(component.passengerSeatOutput, 'emit');

    component.setPassengerSeatOuput('B7');

    expect(spy).not.toHaveBeenCalled();
  });
});
