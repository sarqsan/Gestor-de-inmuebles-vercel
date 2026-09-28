/** Diagnóstico PURO y read-only de espejos D3, no corrige ni migra datos.
 * Solo reutiliza proyectarCarterasGestionadas: no es otro resolver de ámbito.
 * Datos de entrada deben proceder de una lectura administrativa autorizada.
 */
import { proyectarCarterasGestionadas, type CarterasProyectadas } from './carterasGestion';
import type { GestionCartera } from './gestionesCartera';

export type HallazgoProyeccion = 'ESPEJO_SOBREAUTORIZADO' | 'ESPEJO_DESACTUALIZADO' |
  'GESTION_PARCIAL' | 'GESTION_DUPLICADA' | 'PROPIETARIO_INEXISTENTE' |
  'GESTOR_INCORRECTO' | 'ESTADO_INVALIDO' | 'PROPIETARIO_INVALIDO';
export interface InformeProyeccion {
  esperado: CarterasProyectadas;
  hallazgos: { codigo: HallazgoProyeccion; referencia: string }[];
  /** Cualquier acceso de más obliga a bloquear uso del espejo hasta reparación manual. */
  requiereRevisionAntesDeUsar: boolean;
}

export function auditarProyeccionCarteras(gestorUsuarioId: string,
  gestiones: readonly GestionCartera[], espejo: CarterasProyectadas,
  propietarioIdsExistentes: ReadonlySet<string>): InformeProyeccion {
  const hallazgos: InformeProyeccion['hallazgos'] = [];
  const push = (codigo: HallazgoProyeccion, referencia: string) => hallazgos.push({ codigo, referencia });
  const pares = new Set<string>();
  for (const g of gestiones) {
    if (!g.propietarioId || !g.id) { push('PROPIETARIO_INVALIDO', g.id || 'sin ID'); continue; }
    if (g.gestorUsuarioId !== gestorUsuarioId) { push('GESTOR_INCORRECTO', g.id); continue; }
    if (!propietarioIdsExistentes.has(g.propietarioId)) push('PROPIETARIO_INEXISTENTE', g.id);
    if (!['PENDIENTE_ACEPTACION','ACTIVA','SUSPENDIDA','REVOCADA'].includes(g.estado))
      push('ESTADO_INVALIDO', g.id);
    if (g.inmuebleIds?.length) push('GESTION_PARCIAL', g.id);
    if (g.estado !== 'REVOCADA') {
      if (pares.has(g.propietarioId)) push('GESTION_DUPLICADA', g.propietarioId);
      pares.add(g.propietarioId);
    }
  }
  // No emitir una propuesta de ampliación cuando hay datos anómalos. Un
  // documento sin titular existente o con estado inválido nunca da acceso.
  const seguras = gestiones.filter(g => g.gestorUsuarioId === gestorUsuarioId &&
    propietarioIdsExistentes.has(g.propietarioId) &&
    ['PENDIENTE_ACEPTACION','ACTIVA','SUSPENDIDA','REVOCADA'].includes(g.estado));
  const esperado = proyectarCarterasGestionadas(seguras, gestorUsuarioId);
  for (const permiso of ['carterasL','carterasE'] as const) {
    if (!Array.isArray(espejo[permiso])) { push('ESPEJO_SOBREAUTORIZADO', permiso); continue; }
    for (const id of espejo[permiso]) {
      if (!esperado[permiso].includes(id)) push('ESPEJO_SOBREAUTORIZADO', `${permiso}:${id}`);
    }
    for (const id of esperado[permiso]) {
      if (!espejo[permiso].includes(id)) push('ESPEJO_DESACTUALIZADO', `${permiso}:${id}`);
    }
  }
  return { esperado, hallazgos, requiereRevisionAntesDeUsar: hallazgos.some(h =>
    h.codigo !== 'ESPEJO_DESACTUALIZADO') };
}
