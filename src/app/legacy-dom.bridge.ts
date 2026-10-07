import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

const LEGACY_SCRIPTS = [
  'js/vendor/pdf.min.js',
  'js/vendor/mammoth.browser.min.js',
  'js/pdf-text.js',
  'js/countries.js',
  'js/keywords.js',
  'js/networks.js',
  'js/extractor.js',
  'js/generator.js',
  'js/review.js',
  'js/ai.js',
  'js/tracking.js',
  'js/outcome.js',
  'js/app.js'
] as const;

@Injectable({ providedIn: 'root' })
export class LegacyDomBridge {
  private readonly document = inject(DOCUMENT);
  private readonly buildId = this.document.querySelector<HTMLMetaElement>('meta[name="radar-build-id"]')?.content || 'dev';
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
      const source = new URL(path, this.document.baseURI);
      source.searchParams.set('v', this.buildId);
      script.src = source.toString();
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load ${path}`));
      this.document.body.appendChild(script);
    });
  }
}
