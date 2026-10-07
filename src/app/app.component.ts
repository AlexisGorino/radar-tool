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
      if (message) {
        const detail = error instanceof Error ? error.message : String(error);
        message.textContent = `No pudimos iniciar todos los módulos de RADAR (${detail}). Recargá la página; si el problema continúa, avisá al equipo.`;
        message.classList.remove('hidden');
      }
    }
  }
}
