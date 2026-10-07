import { AfterViewInit, Component, inject } from '@angular/core';
import { LegacyDomBridge } from './legacy-dom.bridge';

@Component({
  selector: 'radar-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit {
  private readonly legacyDom = inject(LegacyDomBridge);

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.legacyDom.start();
      document.documentElement.dataset['radarReady'] = 'true';
    } catch (error) {
      console.error('RADAR interface initialization failed.', error);
      document.documentElement.dataset['radarReady'] = 'error';
      const message = document.getElementById('radarBootError');
      message?.classList.remove('hidden');
    }
  }
}
