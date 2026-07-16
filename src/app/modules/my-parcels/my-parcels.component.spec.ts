import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AlertService } from '../../shared/services/alert.service';
import { MyParcelsComponent } from './my-parcels.component';
import { invokeLoadMyParcelsApi } from './store/my-parcels.action';
import { initialMyParcelsState } from './store/my-parcels.model';
import { MY_PARCELS_FEATURE_KEY } from './store/my-parcels.selector';

describe('MyParcelsComponent', () => {
  let component: MyParcelsComponent;
  let fixture: ComponentFixture<MyParcelsComponent>;
  let store: MockStore;
  let alertService: jasmine.SpyObj<AlertService>;

  beforeEach(async () => {
    alertService = jasmine.createSpyObj('AlertService', ['toast']);

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      declarations: [MyParcelsComponent],
      providers: [
        provideMockStore({
          initialState: { [MY_PARCELS_FEATURE_KEY]: initialMyParcelsState },
        }),
        { provide: AlertService, useValue: alertService },
      ],
    })
      .overrideComponent(MyParcelsComponent, { set: { template: '' } })
      .compileComponents();

    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(MyParcelsComponent);
    component = fixture.componentInstance;
  });

  it('creates and dispatches the initial load on init', () => {
    spyOn(store, 'dispatch');
    fixture.detectChanges();
    expect(store.dispatch).toHaveBeenCalledWith(
      invokeLoadMyParcelsApi({ status: null, page: 0, append: false })
    );
  });

  it('onStatusChange dispatches a non-append load with the new filter', () => {
    fixture.detectChanges();
    spyOn(store, 'dispatch');
    (component as any).onStatusChange('pending');
    expect(store.dispatch).toHaveBeenCalledWith(
      invokeLoadMyParcelsApi({ status: 'pending', page: 0, append: false })
    );
  });

  it('onLoadMore dispatches an append load at the requested page', () => {
    fixture.detectChanges();
    spyOn(store, 'dispatch');
    (component as any).onLoadMore(2);
    expect(store.dispatch).toHaveBeenCalledWith(
      invokeLoadMyParcelsApi({ status: null, page: 2, append: true })
    );
  });

  it('isCreatedAndPaid is true only for a paid, delivery-status=created row', () => {
    fixture.detectChanges();
    expect(
      (component as any).isCreatedAndPaid({ deliveryStatus: 'created', bookingStatus: 'confirmed' })
    ).toBeTrue();
    expect(
      (component as any).isCreatedAndPaid({ deliveryStatus: 'created', bookingStatus: 'pending' })
    ).toBeFalse();
    expect(
      (component as any).isCreatedAndPaid({ deliveryStatus: 'accepted', bookingStatus: 'confirmed' })
    ).toBeFalse();
  });

  it('statusLabelKey uses the customer namespace for "created"', () => {
    fixture.detectChanges();
    expect((component as any).statusLabelKey('created')).toBe('PARCEL_TRACKING.STATUS.CREATED');
  });

  it('copyTrackingNumber uses the clipboard API and toasts on success', async () => {
    fixture.detectChanges();
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    await (component as any).copyTrackingNumber('PCL123');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('PCL123');
    expect(alertService.toast).toHaveBeenCalled();
  });
});
