import type { ContextoDestinoImportacion, PrevisualizacionImportacion } from '../contracts.ts';
import { SelectorPropietarioDestino } from './SelectorPropietarioDestino.tsx';
import { EstadoDatosBadge } from './EstadoDatosBadge.tsx';

export interface RevisionImportacionProps {
  propietarios: ContextoDestinoImportacion['propietarios'];
  preview: PrevisualizacionImportacion;
  onDestinoChange: (propietarioDestinoId: string | null) => void;
  indiceRevision: number | null;
  onRevisarRegistro: (indiceOrigen: number | null) => void;
}

export function RevisionImportacion({ propietarios, preview, onDestinoChange, indiceRevision, onRevisarRegistro }: RevisionImportacionProps) {
  const seleccionado = preview.registros.find((r) => r.indiceOrigen === indiceRevision);
  return <section className="pat-panel pat-import-preview" aria-label="Previsualización de importación">
    <p className="pat-eyebrow">Preparación / sin escrituras</p>
    <h2>Revisa antes de importar</h2>
    <p className="pat-muted">Esta vista solo propone resultados con el contexto recibido. No importa, no cambia titularidad y no autoriza operaciones.</p>
    <SelectorPropietarioDestino propietarios={propietarios} propietarioDestinoId={preview.destino.propietarioDestinoId} onChange={onDestinoChange} />
    <p className="pat-note">El destino no se toma de tu cuenta, de la ficha abierta ni del primer propietario. Seleccionar no concede permisos.</p>
    <div className="pat-notice" role="status">
      <strong>Destino: {preview.destino.estado}</strong>
      {preview.destino.estado === 'VALIDO' && <p>{preview.destino.propietario.nombre} · {preview.destino.propietarioDestinoId}</p>}
      {preview.destino.incidencias.map((i) => <p key={i.codigo}>{i.mensaje}</p>)}
    </div>
    <div className="pat-preview-summary">
      <span><strong>{preview.registrosQueSeCrearian.length}</strong> propuestas de creación</span>
      <span><strong>{preview.registrosIncompletos.length}</strong> registros incompletos</span>
      <span><strong>{preview.registrosBloqueados.length}</strong> propuestas bloqueadas</span>
      <span><strong>{preview.datosQueRequierenRevision.length}</strong> requieren atención</span>
    </div>
    <p className="pat-note">Los recuentos de incompletos y atención pueden incluir registros bloqueados. Ninguna propuesta es una escritura ejecutada.</p>
    {preview.registros.length === 0 ? <p>No hay registros de origen.</p> : <ol className="pat-preview-list">
      {preview.registros.map((registro) => <li key={registro.indiceOrigen}>
        <div className="pat-owner-top">
          <strong>Registro de origen {registro.indiceOrigen + 1}</strong>
          <EstadoDatosBadge estado={registro.evaluacionDatos.estadoDatos} />
        </div>
        <p className="pat-note">Propuesta: <strong>{registro.decision}</strong>. Política: {registro.evaluacionDatos.politicaId ?? 'No disponible'}.</p>
        {registro.evaluacionDatos.camposFaltantes.length > 0 && <p>Campos pendientes: {registro.evaluacionDatos.camposFaltantes.join(', ')}.</p>}
        <ul className="pat-note">{registro.incidencias.map((i, index) => <li key={index}>{i.mensaje}</li>)}</ul>
        <button type="button" className="pat-button" aria-pressed={indiceRevision === registro.indiceOrigen} onClick={() => onRevisarRegistro(registro.indiceOrigen)}>Ver origen e incidencias</button>
      </li>)}
    </ol>}
    {seleccionado && <section className="pat-origin-detail" aria-label="Origen en revisión">
      <h3>Origen {seleccionado.indiceOrigen + 1} · copia para revisión</h3>
      <p className="pat-note">Abrir esta vista no resuelve incidencias ni acepta la importación.</p>
      <pre>{JSON.stringify(seleccionado.datosOrigen, null, 2)}</pre>
      <button type="button" className="pat-button" onClick={() => onRevisarRegistro(null)}>Cerrar revisión</button>
    </section>}
    <p className="pat-note">Invitación, activación, validación autorizada y ejecución de la importación permanecen desconectadas.</p>
  </section>;
}
