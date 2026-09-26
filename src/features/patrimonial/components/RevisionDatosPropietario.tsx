import type { EvaluacionDatos } from '../contracts.ts';
import { EstadoDatosBadge } from './EstadoDatosBadge.tsx';

export interface RevisionDatosPropietarioProps {
  evaluacion: EvaluacionDatos;
  onRevisar?: () => void;
}

export function RevisionDatosPropietario({ evaluacion, onRevisar }: RevisionDatosPropietarioProps) {
  return <section className="pat-revision-datos" aria-label="Revisión de datos de la ficha">
    <h3>Datos, por separado del acceso</h3>
    <EstadoDatosBadge estado={evaluacion.estadoDatos} />
    <p className="pat-note">Política: {evaluacion.politicaId ?? 'No disponible'}. El resultado solo aplica a los criterios suministrados; no certifica validez fiscal ni concede permisos.</p>
    {evaluacion.camposFaltantes.length > 0 && <p>Campos pendientes: {evaluacion.camposFaltantes.join(', ')}.</p>}
    {evaluacion.incidencias.length > 0 && <ul className="pat-note">
      {evaluacion.incidencias.map((incidencia, index) => <li key={index}>{incidencia.mensaje}</li>)}
    </ul>}
    {onRevisar && <button type="button" className="pat-button" onClick={onRevisar}>Revisar datos de la ficha</button>}
  </section>;
}
