import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

const LEGACY_SCRIPTS = [
  'js/vendor/pdf.min.js',
  'js/vendor/mammoth.browser.min.js',
  'js/pdf-text.js?v=31',
  'js/countries.js?v=31',
  'js/keywords.js?v=31',
  'js/networks.js?v=31',
  'js/extractor.js?v=31',
  'js/generator.js?v=31',
  'js/review.js?v=31',
  'js/ai.js?v=31',
  'js/tracking.js?v=31',
  'js/outcome.js?v=31',
  'js/app.js?v=31'
] as const;

@Injectable({ providedIn: 'root' })
export class LegacyDomBridge {
  private readonly document = inject(DOCUMENT);
  private startup?: Promise<void>;

  start(): Promise<void> {
    this.startup ??= this.loadInOrder();
    return this.startup;
  }

  private async loadInOrder(): Promise<void> {
    for (const path of LEGACY_SCRIPTS) {
      await this.loadScript(path);
    }
  }

  private loadScript(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = this.document.createElement('script');
      script.src = new URL(path, this.document.baseURI).toString();
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load ${path}`));
      this.document.body.appendChild(script);
    });
  }
}
