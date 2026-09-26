import type { ModalidadUso } from '../contracts.ts';
import { SelectorModalidadUso } from './SelectorModalidadUso.tsx';

export interface OnboardingPatrimonialProps {
  modalidadSeleccionada: ModalidadUso | null;
  onChange: (modalidad: ModalidadUso) => void;
  onVolver: () => void;
  onContinuar: () => void;
}

/** Componente controlado: la única elección es modalidadSeleccionada en el padre. */
export function OnboardingPatrimonial({
  modalidadSeleccionada,
  onChange,
  onVolver,
  onContinuar,
}: OnboardingPatrimonialProps) {
  return (
    <section className="pat-onboarding" aria-label="Onboarding patrimonial">
      <p className="pat-eyebrow">01 / Tu punto de partida</p>
      <h1>Tu patrimonio.<br /><span>Tu forma de gestionarlo.</span></h1>
      <p className="pat-lead">Una misma herramienta, distintos contextos. Elige cómo quieres empezar; puedes volver y cambiar la elección.</p>
      <SelectorModalidadUso modalidadActual={modalidadSeleccionada} onChange={onChange} onVolver={onVolver} />
      <div className="pat-notice">
        <strong>Una elección, no un permiso.</strong>
        <p>Elegir una modalidad solo cambia el estado local. No crea cuentas, gestores, propietarios ni carteras; tampoco concede acceso.</p>
      </div>
      <div className="pat-actions">
        <span className="pat-muted">No necesitas registrar un inmueble para continuar.</span>
        <button
          type="button"
          className="pat-button pat-primary"
          disabled={modalidadSeleccionada === null}
          onClick={() => { if (modalidadSeleccionada !== null) onContinuar(); }}
        >Explorar propietarios de ejemplo →</button>
      </div>
    </section>
  );
}
