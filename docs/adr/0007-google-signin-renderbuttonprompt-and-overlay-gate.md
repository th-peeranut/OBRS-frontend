# Google Sign-In: `renderButton()` over `prompt()`, and the overlay-gate pattern for consent

## Context

The Google Identity Services (GIS) library offers two interaction paths for signing users in:
1. `google.accounts.id.prompt()` — shows a floating One Tap dialog above the page.
2. `google.accounts.id.renderButton(parent, options)` — renders Google's own branded button into a given DOM element.

We also need to gate the Google sign-in behind a PDPA consent checkbox, but the button itself is rendered by Google's SDK (we cannot intercept the click before the credential callback fires).

## Decision 1: `renderButton()` instead of `prompt()`

We use `renderButton()` exclusively and do **not** call `prompt()`.

**Rationale:**
- `prompt()` is subject to a display-moratorium: after being dismissed by the user a certain number of times, Google suppresses it for a cooldown period with no visible feedback. This produces a silent no-op that is difficult to debug and impossible to work around in the frontend.
- `renderButton()` renders a persistent, user-initiated button that fires on every explicit click. It is not subject to the moratorium.
- `renderButton()` must be called once, in `ngAfterViewInit()` (not `ngOnInit()`), so the target `#google-signin-btn-container` DOM element exists when the call is made.
- The container element `#google-signin-btn-container` must **never** be conditionally rendered via `*ngIf`/`*ngFor`. GIS renders into it once; if the element is destroyed and recreated, the button is gone. Only the overlay (see below) toggles.

## Decision 2: Transparent overlay for PDPA consent gating

The GIS-rendered button cannot be made non-interactive from the outside (no standard disabled attribute works on a third-party iframe-like element). To gate sign-in behind the PDPA checkbox, we place a transparent `position: absolute; inset: 0` overlay div (`gis-disabled-overlay`) over the button container whenever the checkbox is unchecked.

- When the overlay is present, clicks land on the overlay (not the GIS button), which calls `pdpaGoogleConsent.markAsTouched()` to surface the validation error.
- When the checkbox is checked, the overlay is removed via `*ngIf="!pdpaGoogleConsent.value"` and clicks reach the GIS button normally.
- This avoids hacking into the GIS iframe or polling DOM state — the overlay is a pure CSS/Angular solution.

## Considered alternatives

- **`prompt()` with consent gating** — rejected: moratorium fragility outweighs simplicity.
- **Disable the `client_id` until consent is given (re-initialize on check)** — rejected: calling `initialize()` multiple times is not officially supported and risks state corruption.
- **Custom-styled button that calls the sign-in flow programmatically** — rejected: GIS's `prompt()` moratorium applies here too, and a custom button would violate Google's branding requirements.
