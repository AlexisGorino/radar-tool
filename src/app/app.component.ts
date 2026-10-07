import { AfterViewInit, Component, inject, signal } from '@angular/core';
import { LegacyDomBridge } from './legacy-dom.bridge';
import { AccessGateComponent } from './access-gate.component';

@Component({
  selector: 'radar-root',
  standalone: true,
  imports: [AccessGateComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements AfterViewInit {
  private readonly legacyDom = inject(LegacyDomBridge);
  readonly modulesReady = signal(false);
  readonly bootError = signal('');

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.legacyDom.start();
      this.modulesReady.set(true);
      document.documentElement.dataset['radarReady'] = 'true';
    } catch (error) {
      console.error('RADAR interface initialization failed.', error);
      document.documentElement.dataset['radarReady'] = 'error';
      this.bootError.set('No pudimos iniciar todos los módulos de RADAR. Revisá tu conexión y reintentá; si el problema continúa, avisá al equipo.');
    }
  }

  reload(): void {
    window.location.reload();
  }
}
