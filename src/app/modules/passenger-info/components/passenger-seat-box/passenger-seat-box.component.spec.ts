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

  describe("gender='ORIGINAL' (OBRS-170 change-seat original-seat marker)", () => {
    it('renders a distinct bookmark marker, not the SELECTED check-marker or a gender image', () => {
      component.label = 'B1';
      component.gender = 'ORIGINAL';
      fixture.detectChanges();

      const marker = fixture.debugElement.query(By.css('.passenger-original-icon'));
      expect(marker).not.toBeNull();
      expect(marker.nativeElement.textContent.trim()).toBe('bookmark');
      expect(fixture.debugElement.query(By.css('.passenger-selected-icon'))).toBeNull();
      expect(fixture.debugElement.query(By.css('img'))).toBeNull();
    });

    it('does not render the ORIGINAL marker when the seat is disabled', () => {
      component.label = 'B1';
      component.gender = 'ORIGINAL';
      component.isDisabled = true;
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.passenger-original-icon'))).toBeNull();
    });

    it('existing MALE/FEMALE/MONK/SELECTED/empty call sites never render the ORIGINAL marker', () => {
      for (const gender of ['MALE', 'FEMALE', 'MONK', 'SELECTED', '']) {
        component.label = 'B1';
        component.gender = gender;
        fixture.detectChanges();

        expect(fixture.debugElement.query(By.css('.passenger-original-icon')))
          .withContext(`gender=${gender}`)
          .toBeNull();
      }
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

  describe('ownerLabel / isActiveOwner (shared seat map, OBRS-242)', () => {
    it('renders no owner badge by default (existing call sites unaffected)', () => {
      component.label = 'B1';
      component.gender = 'MALE';
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.seat-owner-badge'))).toBeNull();
    });

    it('renders the owner badge text when ownerLabel is set', () => {
      component.label = 'B1';
      component.gender = 'MALE';
      component.ownerLabel = '2';
      fixture.detectChanges();

      const badge = fixture.debugElement.query(By.css('.seat-owner-badge'));
      expect(badge).not.toBeNull();
      expect(badge.nativeElement.textContent.trim()).toBe('2');
    });

    it('does not render the owner badge when the seat is disabled', () => {
      component.label = 'B1';
      component.ownerLabel = '2';
      component.isDisabled = true;
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.seat-owner-badge'))).toBeNull();
    });

    it('applies the active-owner emphasis class only when isActiveOwner is true', () => {
      component.label = 'B1';
      component.isActiveOwner = true;
      fixture.detectChanges();

      const box = fixture.debugElement.query(By.css('.seat-box'));
      expect(box.nativeElement.classList).toContain('active-owner');
    });

    it('does not apply the active-owner class by default', () => {
      component.label = 'B1';
      fixture.detectChanges();

      const box = fixture.debugElement.query(By.css('.seat-box'));
      expect(box.nativeElement.classList).not.toContain('active-owner');
    });
  });

  describe('seat-attribute badges (OBRS-362)', () => {
    it('renders no badges by default (existing call sites unaffected)', () => {
      component.label = 'B1';
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.seat-attribute-badge-wheelchair'))).toBeNull();
      expect(fixture.debugElement.query(By.css('.seat-attribute-badge-legroom'))).toBeNull();
    });

    it('renders only the wheelchair badge when hasWheelchairBadge is true', () => {
      component.label = 'B1';
      component.hasWheelchairBadge = true;
      component.wheelchairBadgeAriaLabel = 'Wheelchair accessible seat';
      fixture.detectChanges();

      const badge = fixture.debugElement.query(By.css('.seat-attribute-badge-wheelchair'));
      expect(badge).not.toBeNull();
      expect(badge.attributes['aria-label']).toBe('Wheelchair accessible seat');
      expect(badge.attributes['role']).toBe('img');
      expect(fixture.debugElement.query(By.css('.seat-attribute-badge-legroom'))).toBeNull();
    });

    it('a seat with BOTH badges renders both, simultaneously (front-row seat)', () => {
      component.label = 'A1';
      component.hasWheelchairBadge = true;
      component.hasExtraLegroomBadge = true;
      component.wheelchairBadgeAriaLabel = 'Wheelchair accessible seat';
      component.extraLegroomBadgeAriaLabel = 'Extra legroom seat';
      fixture.detectChanges();

      const wheelchairBadge = fixture.debugElement.query(By.css('.seat-attribute-badge-wheelchair'));
      const legroomBadge = fixture.debugElement.query(By.css('.seat-attribute-badge-legroom'));
      expect(wheelchairBadge).not.toBeNull();
      expect(legroomBadge).not.toBeNull();
      expect(wheelchairBadge.attributes['aria-label']).toBe('Wheelchair accessible seat');
      expect(legroomBadge.attributes['aria-label']).toBe('Extra legroom seat');
    });

    it('renders the badges UNCONDITIONALLY — even when the seat is disabled (unlike owner/gender markers)', () => {
      component.label = 'B1';
      component.isDisabled = true;
      component.gender = 'MALE';
      component.hasWheelchairBadge = true;
      component.hasExtraLegroomBadge = true;
      fixture.detectChanges();

      // Disabled seats hide the gender icon (existing behavior)...
      expect(fixture.debugElement.query(By.css('.passenger-male-icon'))).toBeNull();
      // ...but the attribute badges still render.
      expect(fixture.debugElement.query(By.css('.seat-attribute-badge-wheelchair'))).not.toBeNull();
      expect(fixture.debugElement.query(By.css('.seat-attribute-badge-legroom'))).not.toBeNull();
    });
  });
});
