import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ParcelBookingService } from '../../../services/parcel-booking/parcel-booking.service';
import { extractApiErrorMessage } from '../../../shared/lib/api-error';
import {
  invokeLoadMyParcelsApi,
  invokeLoadMyParcelsApiFailure,
  invokeLoadMyParcelsApiSuccess,
} from './my-parcels.action';

const PAGE_SIZE = 20;

@Injectable()
export class MyParcelsEffect {
  private actions$ = inject(Actions);
  private service = inject(ParcelBookingService);
  private translate = inject(TranslateService);

  loadMyParcels$ = createEffect(() =>
    this.actions$.pipe(
      ofType(invokeLoadMyParcelsApi),
      switchMap(({ page, append }) =>
        this.service.getMyParcels(page, PAGE_SIZE).pipe(
          map((response) => {
            const data = response.data;
            const items = data?.content ?? [];
            const totalPages = data?.totalPages ?? 0;
            const number = data?.number ?? page;
            return invokeLoadMyParcelsApiSuccess({
              items,
              page: number,
              hasMore: number + 1 < totalPages,
              append,
            });
          }),
          catchError((error: unknown) =>
            of(
              invokeLoadMyParcelsApiFailure({
                error:
                  extractApiErrorMessage(error) ||
                  this.translate.instant('PARCEL_BOOKING.MY_PARCELS.RETRY'),
              })
            )
          )
        )
      )
    )
  );
}
