import type { ContextoDestinoImportacion } from '../contracts.ts';

export interface SelectorPropietarioDestinoProps {
  propietarios: ContextoDestinoImportacion['propietarios'];
  propietarioDestinoId: string | null;
  onChange: (propietarioDestinoId: string | null) => void;
}

/** Sin autoselección, incluso cuando solo hay un propietario. */
export function SelectorPropietarioDestino({ propietarios, propietarioDestinoId, onChange }: SelectorPropietarioDestinoProps) {
  const desconocido = propietarioDestinoId !== null && propietarioDestinoId !== ''
    && !propietarios.some((p) => p.id === propietarioDestinoId);
  return <label className="pat-selector-destino">
    <span>Propietario destino de esta previsualización</span>
    <select value={propietarioDestinoId ?? ''} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Sin destino: selecciona explícitamente</option>
      {desconocido && <option value={propietarioDestinoId}>Destino no encontrado: {propietarioDestinoId}</option>}
      {propietarios.map((p, index) => <option key={`${p.id}-${index}`} value={p.id}>{p.nombre}</option>)}
    </select>
  </label>;
}
