import {
  stationLoadStatusInitialState,
  StationLoadStatusReducer,
  StationLoadStatusState,
} from './station-load-status.reducer';
import { selectStationLoadFailed } from './station-load-status.selector';
import {
  invokeGetAllProvinceWithStationApi,
  invokeGetAllProvinceWithStationApiFailure,
  invokeGetAllProvinceWithStationApiSuccess,
} from './station.action';

describe('StationLoadStatusReducer (OBRS-1222)', () => {
  it('starts clean — a page that has not tried yet has not failed', () => {
    expect(stationLoadStatusInitialState).toEqual({ hasFailed: false });
  });

  it('records the failure', () => {
    const next = StationLoadStatusReducer(
      stationLoadStatusInitialState,
      invokeGetAllProvinceWithStationApiFailure()
    );

    expect(next.hasFailed).toBeTrue();
  });

  it('clears on the INVOKE action, which is what makes the retry button honest (AC3)', () => {
    const failed = StationLoadStatusReducer(
      stationLoadStatusInitialState,
      invokeGetAllProvinceWithStationApiFailure()
    );

    const retrying = StationLoadStatusReducer(failed, invokeGetAllProvinceWithStationApi());

    // Clearing on SUCCESS alone would leave the message on screen for the whole
    // round trip after the tap, so a customer on a slow connection taps it
    // again — and the second tap is the one that races the first.
    expect(retrying.hasFailed).toBeFalse();
  });

  it('clears on success', () => {
    const failed = StationLoadStatusReducer(
      stationLoadStatusInitialState,
      invokeGetAllProvinceWithStationApiFailure()
    );

    const ok = StationLoadStatusReducer(
      failed,
      invokeGetAllProvinceWithStationApiSuccess({ stations: [] })
    );

    expect(ok.hasFailed).toBeFalse();
  });

  // The slice is registered at the root, but a TestBed with a mock store
  // provides only the slices its own component names. `undefined` must read as
  // "not failed", never throw inside change detection.
  it('selectStationLoadFailed answers false when the slice is not registered', () => {
    // The cast is the point of the test: the runtime really can hand this
    // projector `undefined`, which its declared type says is impossible.
    expect(
      selectStationLoadFailed.projector(undefined as unknown as StationLoadStatusState)
    ).toBeFalse();
    expect(selectStationLoadFailed.projector({ hasFailed: true })).toBeTrue();
  });
});
