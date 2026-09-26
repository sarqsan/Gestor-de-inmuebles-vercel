import type { EstadoDatos } from '../contracts.ts';

const ETIQUETAS: Record<EstadoDatos, string> = {
  COMPLETO: 'Completo', INCOMPLETO: 'Incompleto', BLOQUEADO: 'Bloqueado',
};

export function EstadoDatosBadge({ estado }: { estado: EstadoDatos }) {
  return <span className={`pat-badge pat-datos-${estado.toLowerCase()}`}>
    Datos: {ETIQUETAS[estado]}<span className="pat-sr-only"> ({estado}), según la evaluación suministrada; no es un estado de acceso.</span>
  </span>;
}
