import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * OBRS-391 -- card entry moved OFF this origin and into OmiseCard's hosted iframe.
 *
 * What changed and why it matters beyond style: this service used to read the PAN,
 * CVV and expiry out of an Angular FormGroup rendered on nj-phuyaipu.com and hand
 * them to `Omise.createToken('card', ...)`. That is the "direct post / JS
 * tokenization from a merchant-controlled page" pattern, which does NOT qualify for
 * PCI DSS SAQ A -- it lands on SAQ A-EP (~140 requirements, quarterly ASV scans,
 * permanently) -- and it is the pattern clause 5.5(f) of the Omise Merchant Service
 * Agreement bars unless we send Omise an AOC every year. Now `pay.html` on
 * cdn.omise.co renders every card field inside an iframe and posts a token back, so
 * no card data ever enters this app's DOM, memory or bundle.
 *
 * ---------------------------------------------------------------------------
 * Facts below were read out of the SHIPPED bundle (OmiseJs v2.16.0, built
 * 2026-06-24) on 2026-07-26, not out of the docs. They are load-bearing, and the
 * file is fetched live from a CDN we do not control, so re-verify them if this
 * flow ever starts misbehaving:
 *
 *   1. ONE script. `https://cdn.omise.co/omise.js` ends with
 *        `r.g.Omise = new D(e()); r.g.OmiseCard = new pt(e());`
 *      so `window.Omise` and `window.OmiseCard` both come from the file this
 *      service was already loading. No second <script>, and no CSP change: prod's
 *      `script-src` already allows cdn.omise.co and `frame-src` already allows
 *      https://*.omise.co (deploy/prod/Caddyfile:66).
 *
 *   2. It is a REAL third-party iframe, which is the whole point:
 *        r.src = settings.cardHost + '/pay.html'   // cardHost = https://cdn.omise.co
 *        r.setAttribute('sandbox', 'allow-forms allow-scripts allow-popups allow-same-origin')
 *      The iframe is created by `configure()`, NOT by `open()` -- so configure()
 *      must run first or `open()` returns false having done nothing.
 *
 *   3. `onCreateTokenSuccess` beats `onFormClosed`, always. On a successful token
 *      the bundle runs `close(); setTokenAtOmiseTokenField(token)`: close() only
 *      SCHEDULES a 250 ms timer, while setTokenAtOmiseTokenField() invokes
 *      onCreateTokenSuccess synchronously and then clears `currentOpenConfig` --
 *      which is where the timer reads onFormClosed from, so after a success it is
 *      never called at all. The `settled` latch below is therefore belt-and-braces
 *      rather than the thing that makes this correct; it is kept because a CDN
 *      push could reorder those two lines and the failure mode would be "every
 *      successful payment reports itself as cancelled".
 *
 *   4. Passing ONLY `onCreateTokenSuccess` (and not `onCreateSuccess`) makes the
 *      callback receive the raw token STRING -- `o && !i ? a(t)` in the bundle.
 *      Pass both and it receives an object instead.
 *
 *   5. `submitAuto` and the hidden-input machinery are inert here: every branch
 *      that touches them is guarded by `this.app.formElement`, which is only set by
 *      `attach()` / `configureButton()`. This service uses neither.
 * ---------------------------------------------------------------------------
 */

/** Config accepted by `OmiseCard.configure()`. Only the fields this app sets. */
interface OmiseCardConfigureConfig {
  publicKey: string;
}

/**
 * Config accepted by `OmiseCard.open()`. Only the fields this app sets.
 *
 * Deliberately ABSENT, each for a reason worth keeping written down:
 *
 *  - `customCardForm`. This is the option that puts the merchant's own card form
 *    back on the merchant's own page and reduces OmiseCard to a tokenizer -- i.e.
 *    it re-creates exactly the SAQ A-EP arrangement this card exists to remove,
 *    while still looking like "we use OmiseCard". Never set it. The
 *    check-no-card-data-inputs.mjs gate fails the build if it appears.
 *
 *  - `customCardForm` (see above).
 *
 * The `amount`/`currency` pair went the other way, and the route there is worth
 * recording because two plausible-sounding positions were both measured wrong:
 *
 *   1. "Omise decides nothing from these, so omit them." Omitting them does not
 *      produce a neutral button — the dialog renders **"Pay 0.00 THB"**. A payment
 *      dialog stating a total of zero is not a cosmetic defect.
 *   2. "Then pass `submitLabel` instead and replace the string." It does not
 *      replace it, it PREFIXES it: the button then read **"ชำระเงิน 0.00 THB"**.
 *
 * Both were caught by this card's evidence capture, not by reasoning. So the
 * amount is passed, and it comes from the SERVER — `paymentSummary.outstandingAmount`
 * on the endpoint the payment component already polls — not from re-deriving the
 * total in the browser. That matters: the seat-booking total is computed inside
 * <app-payment-summary>'s template from three NgRx stores, and a second copy of
 * that arithmetic is a second thing that can disagree about money.
 *
 *  - `locale`. Omise's hosted form ships English, Japanese and Thai. Handing it
 *    'zh' -- a language this app supports and Omise does not -- is an unverified
 *    guess on the money path, so `resolveOmiseLocale()` below sends 'th' for Thai
 *    and otherwise omits the field and takes Omise's own default.
 */
interface OmiseCardOpenConfig {
  defaultPaymentMethod?: string;
  otherPaymentMethods?: string;
  locale?: string;
  submitLabel?: string;
  /** Smallest currency unit — satang for THB, NOT baht. */
  amount?: number;
  currency?: string;
  onCreateTokenSuccess?: (nonce: string) => void;
  onFormClosed?: () => void;
}

/** What the caller must tell the dialog. All of it is presentation. */
export interface CardTokenRequest {
  /** App language; mapped through {@link resolveOmiseLocale}. */
  language?: string | null;
  /**
   * Text for Omise's submit button. Omise PREFIXES it to the amount rather than
   * replacing it, so this is a label, not a way to suppress the total. Pass a
   * translated string or a Thai passenger gets an English payment dialog.
   */
  submitLabel?: string;
  /**
   * Amount due in the SMALLEST currency unit (satang). 250 baht is 25000.
   * Display only — the charge is created server-side from the booking — but a
   * displayed total that disagrees with what is taken is its own kind of harm.
   */
  amountSubunits: number;
  /** ISO currency of {@link amountSubunits}. */
  currency: string;
}

interface OmiseCardGlobal {
  configure(config: OmiseCardConfigureConfig): void;
  /** Returns `false` when no iframe exists yet (i.e. configure() never ran). */
  open(config: OmiseCardOpenConfig): boolean | void;
  close(): boolean | void;
}

declare global {
  interface Window {
    OmiseCard?: OmiseCardGlobal;
  }
}

/**
 * Marker for "the passenger closed the card dialog without paying".
 *
 * A plain sentinel message rather than an Error subclass on purpose: subclassing
 * Error needs an `Object.setPrototypeOf` dance to survive downlevel emit, and
 * `instanceof` on a subclass silently stops matching when it does not get one.
 * A cancelled dialog must NOT reach the caller's generic "payment failed" alert --
 * nothing failed, and telling someone their payment failed when they simply
 * changed their mind is the kind of message that ends a booking.
 */
export const CARD_ENTRY_CANCELLED = 'omise-card-entry-cancelled';

export function isCardEntryCancelled(error: unknown): boolean {
  return error instanceof Error && error.message === CARD_ENTRY_CANCELLED;
}

/** See the `locale` note on OmiseCardOpenConfig. Exported for its own unit test. */
export function resolveOmiseLocale(
  appLanguage: string | null | undefined
): string | undefined {
  return String(appLanguage ?? '').toLowerCase().startsWith('th') ? 'th' : undefined;
}

@Injectable({
  providedIn: 'root',
})
export class OmiseTokenService {
  private readonly scriptUrl = 'https://cdn.omise.co/omise.js';
  private loadingScript?: Promise<void>;
  /** configure() also builds the iframe, so it must not be re-run per payment. */
  private configuredPublicKey = '';

  get hasPublicKey(): boolean {
    return this.getPublicKey().length > 0;
  }

  /**
   * Opens Omise's hosted card dialog and resolves with the token it posts back.
   *
   * Rejects with {@link CARD_ENTRY_CANCELLED} if the passenger closes the dialog --
   * callers must test that with {@link isCardEntryCancelled} before showing a
   * failure message.
   *
   */
  async requestCardToken(request: CardTokenRequest): Promise<string> {
    const publicKey = this.getPublicKey();
    if (!publicKey) {
      throw new Error('Omise public key is not configured');
    }

    await this.loadScript();

    const omiseCard = window.OmiseCard;
    if (!omiseCard) {
      throw new Error('OmiseCard failed to load');
    }

    if (this.configuredPublicKey !== publicKey) {
      omiseCard.configure({ publicKey });
      this.configuredPublicKey = publicKey;
    }

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        fn();
      };

      const opened = omiseCard.open({
        // Card only. `otherPaymentMethods: ''` is not cosmetic -- PromptPay has its
        // own tab in this component and its own backend source flow, and letting
        // Omise offer a second method here would produce a nonce (`src_...`) the
        // `cardToken` field cannot carry.
        defaultPaymentMethod: 'credit_card',
        otherPaymentMethods: '',
        locale: resolveOmiseLocale(request.language),
        submitLabel: request.submitLabel,
        amount: request.amountSubunits,
        currency: request.currency,
        onCreateTokenSuccess: (nonce) => {
          settle(() => {
            // A `src_...` nonce means a non-card method was somehow used; the
            // backend would take it as a card token and the charge would fail
            // server-side with nothing on screen explaining why.
            if (typeof nonce !== 'string' || !nonce.startsWith('tokn_')) {
              reject(
                new Error(`Unexpected Omise nonce: ${String(nonce).slice(0, 5)}`)
              );
              return;
            }
            resolve(nonce);
          });
        },
        onFormClosed: () => {
          settle(() => reject(new Error(CARD_ENTRY_CANCELLED)));
        },
      });

      // `open()` answers false when configure() has not built the iframe. Without
      // this the promise would simply never settle and the Pay button would stay
      // disabled forever with no error anywhere -- a hang, not a failure.
      if (opened === false) {
        settle(() => reject(new Error('OmiseCard dialog could not be opened')));
      }
    });
  }

  private getPublicKey(): string {
    return String(environment.omisePublicKey ?? '').trim();
  }

  private loadScript(): Promise<void> {
    if (window.OmiseCard) {
      return Promise.resolve();
    }

    if (this.loadingScript) {
      return this.loadingScript;
    }

    this.loadingScript = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this.scriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Clear the cached promise: a rejected one would be handed to every later
        // attempt, so a single transient CDN blip would make card payment
        // permanently unavailable for the rest of the tab's life.
        this.loadingScript = undefined;
        reject(new Error('Unable to load Omise.js'));
      };
      document.head.appendChild(script);
    });

    return this.loadingScript;
  }
}
