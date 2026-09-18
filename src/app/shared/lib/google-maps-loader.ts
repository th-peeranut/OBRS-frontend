/**
 * OBRS-1030: lifted verbatim out of `route-map-panel.component.ts` (OBRS-1838's original
 * home) so a second Google Maps consumer — `StopMapPickerComponent` — shares the same
 * bootstrap instead of injecting a second `<script>`/callback pair. Behaviour is
 * byte-for-byte what it was there: same promise-per-page sharing, same `data-maps-api`
 * marker, same `loading=async&libraries=marker` query, same callback name.
 */

/** Minimal shape of `window` once the Maps JS API has attached itself. */
export interface GoogleWindow {
  google?: {
    maps?: unknown;
  };
}

/**
 * Load the Google Maps JS API once per page using Google's recommended
 * `loading=async` bootstrap + a `callback`. Loading the API the legacy
 * (synchronous) way keeps the browser's tab-loading indicator spinning and logs
 * the "loaded directly without loading=async" console warning; the async
 * bootstrap lets the page settle to idle and silences the warning.
 *
 * Shared across every caller on the page (RouteMapPanelComponent's desktop and
 * mobile instances, and StopMapPickerComponent) via a module-level promise, so
 * the script is injected at most once and every caller resolves off the same
 * load.
 */
let googleMapsLoad: Promise<void> | null = null;

export function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (googleMapsLoad) {
    return googleMapsLoad;
  }

  const win = window as unknown as GoogleWindow;
  if (win.google?.maps) {
    googleMapsLoad = Promise.resolve();
    return googleMapsLoad;
  }

  googleMapsLoad = new Promise<void>((resolve, reject) => {
    const callbackName = '__obrsGoogleMapsReady';
    (window as unknown as Record<string, () => void>)[callbackName] = () =>
      resolve();

    const script = document.createElement('script');
    script.setAttribute('data-maps-api', 'true');
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${apiKey}` +
      `&loading=async&libraries=marker&callback=${callbackName}`;
    script.async = true;
    script.onerror = () =>
      reject(new Error('Google Maps JS API failed to load'));
    document.head.appendChild(script);
  });

  return googleMapsLoad;
}

// ---------------------------------------------------------------------------
// Auth failure (OBRS-1030): an expired/revoked/referrer-mismatched/billing-disabled key
// loads the Maps JS *script* successfully (the `loadGoogleMapsApi` promise above resolves
// fine) and only fails later, when the API tries to actually construct a map — at which
// point Google calls a well-known global, `window.gm_authFailure`, if one is defined.
// Without this, that failure is invisible to every caller: `mapsLoaded` is already true,
// so `showMap` stays true and the user is left staring at GOOGLE's own grey error box
// permanently covering the map area, instead of this app's own degrade message.
// ---------------------------------------------------------------------------

let authFailureHandlerInstalled = false;
/** True once `gm_authFailure` has fired at least once on this page. A caller that
 *  subscribes AFTER that point (e.g. a second picker mounted later) still needs to know. */
let authFailed = false;
const authFailureListeners = new Set<() => void>();

function installAuthFailureHandler(): void {
  if (authFailureHandlerInstalled) {
    return;
  }
  authFailureHandlerInstalled = true;
  (window as unknown as Record<string, () => void>)['gm_authFailure'] = () => {
    authFailed = true;
    authFailureListeners.forEach((listener) => listener());
  };
}

/**
 * Subscribe to the Maps JS auth-failure signal. Fires `callback` immediately if the
 * failure already happened before this call (late subscriber). Returns an unsubscribe
 * function — callers should invoke it on `ngOnDestroy`.
 */
export function onGoogleMapsAuthFailure(callback: () => void): () => void {
  installAuthFailureHandler();
  if (authFailed) {
    callback();
    return () => undefined;
  }
  authFailureListeners.add(callback);
  return () => {
    authFailureListeners.delete(callback);
  };
}

/**
 * Resets the shared load promise and auth-failure state. Exposed for tests only — a spec
 * that wants to observe a fresh script injection or a fresh auth-failure signal (e.g.
 * `StopMapPickerComponent`'s degrade tests) must not inherit state a prior test in the same
 * run already left behind. Mirrors `clearDirectionsPathCache`'s "exposed for tests"
 * precedent in route-map-panel.
 */
export function resetGoogleMapsLoadForTests(): void {
  googleMapsLoad = null;
  authFailureHandlerInstalled = false;
  authFailed = false;
  authFailureListeners.clear();
  delete (window as unknown as Record<string, unknown>)['gm_authFailure'];
}
