import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, of, throwError } from 'rxjs';
import { Action } from '@ngrx/store';
import { ParcelBookingService } from '../../../services/parcel-booking/parcel-booking.service';
import { MyParcelsEffect } from './my-parcels.effect';
import {
  invokeLoadMyParcelsApi,
  invokeLoadMyParcelsApiFailure,
  invokeLoadMyParcelsApiSuccess,
} from './my-parcels.action';

describe('MyParcelsEffect', () => {
  let actions$: Observable<Action>;
  let effect: MyParcelsEffect;
  let service: jasmine.SpyObj<ParcelBookingService>;

  beforeEach(() => {
    service = jasmine.createSpyObj('ParcelBookingService', ['getMyParcels']);

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        MyParcelsEffect,
        provideMockActions(() => actions$),
        { provide: ParcelBookingService, useValue: service },
      ],
    });

    effect = TestBed.inject(MyParcelsEffect);
  });

  it('maps a successful page into invokeLoadMyParcelsApiSuccess with hasMore computed from totalPages', (done) => {
    service.getMyParcels.and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: {
          content: [{ parcelId: 1, trackingNumber: 'PCL1' } as any],
          totalElements: 40,
          totalPages: 2,
          size: 20,
          number: 0,
          numberOfElements: 20,
        },
      })
    );

    actions$ = of(invokeLoadMyParcelsApi({ status: null, page: 0, append: false }));

    effect.loadMyParcels$.subscribe((action) => {
      expect(action).toEqual(
        invokeLoadMyParcelsApiSuccess({
          items: [{ parcelId: 1, trackingNumber: 'PCL1' } as any],
          page: 0,
          hasMore: true,
          append: false,
        })
      );
      done();
    });
  });

  it('hasMore is false on the last page', (done) => {
    service.getMyParcels.and.returnValue(
      of({
        code: 200,
        message: 'OK',
        data: { content: [], totalElements: 20, totalPages: 1, size: 20, number: 0, numberOfElements: 0 },
      })
    );

    actions$ = of(invokeLoadMyParcelsApi({ status: null, page: 0, append: false }));

    effect.loadMyParcels$.subscribe((action) => {
      expect((action as ReturnType<typeof invokeLoadMyParcelsApiSuccess>).hasMore).toBeFalse();
      done();
    });
  });

  it('maps a failure into invokeLoadMyParcelsApiFailure', (done) => {
    service.getMyParcels.and.returnValue(throwError(() => new Error('network down')));
    actions$ = of(invokeLoadMyParcelsApi({ status: null, page: 0, append: false }));

    effect.loadMyParcels$.subscribe((action) => {
      expect(action.type).toBe(invokeLoadMyParcelsApiFailure({ error: '' }).type);
      done();
    });
  });
});
