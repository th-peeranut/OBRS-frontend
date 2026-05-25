import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

interface OmiseCardPayload {
  number: string;
  expiration_month: number;
  expiration_year: number;
  security_code: string;
  name: string;
}

interface OmiseTokenResponse {
  id?: string;
  message?: string;
}

interface OmiseGlobal {
  setPublicKey(key: string): void;
  createToken(
    type: 'card',
    payload: OmiseCardPayload,
    callback: (statusCode: number, response: OmiseTokenResponse) => void
  ): void;
}

declare global {
  interface Window {
    Omise?: OmiseGlobal;
  }
}

@Injectable({
  providedIn: 'root',
})
export class OmiseTokenService {
  private readonly scriptUrl = 'https://cdn.omise.co/omise.js';
  private loadingScript?: Promise<void>;

  get hasPublicKey(): boolean {
    return this.getPublicKey().length > 0;
  }

  async createCardToken(payload: OmiseCardPayload): Promise<string> {
    const publicKey = this.getPublicKey();
    if (!publicKey) {
      throw new Error('Omise public key is not configured');
    }

    await this.loadScript();

    if (!window.Omise) {
      throw new Error('Omise.js failed to load');
    }

    window.Omise.setPublicKey(publicKey);

    return new Promise((resolve, reject) => {
      window.Omise?.createToken('card', payload, (statusCode, response) => {
        if (statusCode === 200 && response.id) {
          resolve(response.id);
          return;
        }

        reject(new Error(response.message ?? 'Unable to tokenize card'));
      });
    });
  }

  private getPublicKey(): string {
    return String(environment.omisePublicKey ?? '').trim();
  }

  private loadScript(): Promise<void> {
    if (window.Omise) {
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
      script.onerror = () => reject(new Error('Unable to load Omise.js'));
      document.head.appendChild(script);
    });

    return this.loadingScript;
  }
}
