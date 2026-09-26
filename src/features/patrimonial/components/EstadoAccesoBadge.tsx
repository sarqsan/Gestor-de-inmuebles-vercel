import type { EstadoAcceso } from '../contracts.ts';

const ETIQUETAS: Record<EstadoAcceso, string> = {
  SIN_CUENTA: 'Sin cuenta',
  INVITADO: 'Invitado',
  ACTIVO: 'Activo',
};

const EXPLICACIONES: Record<EstadoAcceso, string> = {
  SIN_CUENTA: 'Ficha administrativa sin cuenta de acceso.',
  INVITADO: 'Invitación representada como ejemplo; no implica cuenta activa ni envío real.',
  ACTIVO: 'Cuenta activa en el ejemplo; no implica una gestión activa ni permisos efectivos.',
};

export function EstadoAccesoBadge({ estado }: { estado: EstadoAcceso }) {
  return (
    <span className={`pat-badge pat-badge-${estado.toLowerCase()}`} title={EXPLICACIONES[estado]}>
      <span aria-hidden="true">●</span> {ETIQUETAS[estado]}
      <span className="pat-sr-only">. Estado de acceso: {estado}. {EXPLICACIONES[estado]}</span>
    </span>
  );
}
