import { RevisionDatosPropietario } from './RevisionDatosPropietario.tsx';
import type { BorradorPropietario, EvaluacionDatos } from '../contracts.ts';

export interface FormularioPropietarioProps {
  borrador: BorradorPropietario;
  modo: 'crear' | 'editar';
  onChange: (borrador: BorradorPropietario) => void;
  onGuardar: (borrador: BorradorPropietario) => void;
  onCancelar: () => void;
  error?: string | null;
  evaluacionDatos?: EvaluacionDatos;
  idFormulario?: string;
}

/** Sin estado externo: el padre es dueño del borrador y decide qué hacer con los callbacks. */
export function FormularioPropietario({
  borrador,
  modo,
  onChange,
  onGuardar,
  onCancelar,
  error = null,
  evaluacionDatos,
  idFormulario = 'borrador-propietario',
}: FormularioPropietarioProps) {
  const cambiar = (campo: keyof BorradorPropietario, valor: string) => onChange({ ...borrador, [campo]: valor });
  return (
    <section className="pat-panel pat-editor" aria-label={modo === 'crear' ? 'Crear borrador' : 'Editar borrador'}>
      <p className="pat-eyebrow">Solo en memoria</p>
      <h2>{modo === 'crear' ? 'Nuevo borrador de propietario' : 'Editar ficha de ejemplo'}</h2>
      <p className="pat-muted">El nombre solo identifica el borrador en esta demo. Los demás campos son opcionales para guardar en memoria. Una evaluación contextual, si se aporta, se muestra por separado y no impone requisitos fiscales.</p>
      {evaluacionDatos && <RevisionDatosPropietario evaluacion={evaluacionDatos} />}
      <form
        noValidate
        onSubmit={(event) => { event.preventDefault(); onGuardar(borrador); }}
        aria-describedby={`${idFormulario}-nota`}
      >
        <label>
          <span>Nombre o razón social <small>· identificador visual de la demo</small></span>
          <input
            type="text"
            name="nombre"
            value={borrador.nombre}
            autoComplete="off"
            aria-required="true"
            aria-invalid={!!error}
            aria-describedby={error ? `${idFormulario}-error` : undefined}
            onChange={(event) => cambiar('nombre', event.target.value)}
          />
        </label>
        <label>
          <span>NIF/CIF <small>· opcional</small></span>
          <input type="text" name="nifCif" value={borrador.nifCif} autoComplete="off" onChange={(event) => cambiar('nifCif', event.target.value)} />
        </label>
        <div className="pat-form-grid">
          <label>
            <span>Email <small>· opcional</small></span>
            <input type="email" name="email" value={borrador.email} autoComplete="off" onChange={(event) => cambiar('email', event.target.value)} />
          </label>
          <label>
            <span>Teléfono <small>· opcional</small></span>
            <input type="tel" name="telefono" value={borrador.telefono} autoComplete="off" onChange={(event) => cambiar('telefono', event.target.value)} />
          </label>
        </div>
        <p className="pat-note" id={`${idFormulario}-nota`}>Usa solo datos ficticios. Guardar no crea una cuenta, no envía invitaciones y no cambia acceso ni inmuebles.</p>
        {error && <p className="pat-error" id={`${idFormulario}-error`} role="alert">{error}</p>}
        <div className="pat-actions">
          <button type="button" className="pat-button" onClick={onCancelar}>Cancelar</button>
          <button type="submit" className="pat-button pat-primary">Guardar en la demo</button>
        </div>
      </form>
    </section>
  );
}
