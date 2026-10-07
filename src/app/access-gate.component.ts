import { Component, input } from '@angular/core';

const AUTH_KEY = 'radar-auth-v1';
const AUTH_PASSWORD = 'MinDataTeam';

interface RadarTrackingApi {
  setUser(nombre: string, apellido: string): void;
  logEvent(event: string): void;
}

@Component({
  selector: 'radar-access-gate',
  standalone: true,
  templateUrl: './access-gate.component.html'
})
export class AccessGateComponent {
  readonly ready = input(false);
  error = '';

  submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.ready()) return;

    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const nombre = String(data.get('nombre') ?? '').trim();
    const apellido = String(data.get('apellido') ?? '').trim();
    const password = String(data.get('password') ?? '');
    if (!nombre || !apellido) {
      this.error = 'Completá tu nombre y apellido antes de entrar.';
      return;
    }
    if (password !== AUTH_PASSWORD) {
      this.error = 'Contraseña incorrecta.';
      (form.elements.namedItem('password') as HTMLInputElement | null)?.focus();
      const passwordInput = form.elements.namedItem('password') as HTMLInputElement | null;
      if (passwordInput) passwordInput.value = '';
      return;
    }

    const tracking = (window as Window & { RadarTracking?: RadarTrackingApi }).RadarTracking;
    if (!tracking) {
      this.error = 'No pudimos registrar tu acceso. Recargá la página e intentá de nuevo.';
      return;
    }

    try {
      localStorage.setItem(AUTH_KEY, 'ok');
    } catch {
      // Storage can be disabled in private browsing; access still works for this session.
    }
    tracking.setUser(nombre, apellido);
    tracking.logEvent('check_in');
    document.documentElement.classList.add('authed');
    this.error = '';
    form.reset();
  }
}
