import type {
  CambioOperativoPreparado, ComandoOperativo, ContextoOperativo, EntidadOperativa, EstadoOperaciones,
  EventoOperativo, FlujoEstados, ResultadoOperacion, TipoConEstado,
} from './contracts.ts';
import { POLITICA_ESTADOS } from './policies.ts';
import { CAMPOS, ErrorOperacion, claves, exigir, instante, mismoAmbito, obtener, texto, validarContexto, validarEntidad } from './validation.ts';

export function crearEstadoOperaciones(): EstadoOperaciones { return { revision: 0, entidades: [], historial: [] }; }

/** Ordena claves para reintentos semánticamente idénticos, sin reloj, IDs ni red implícitos. */
function canonico(valor: unknown): string {
  return JSON.stringify(valor, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])) : value);
}
function validarJson(valor: unknown): void {
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return;
  if (typeof valor === 'number') { exigir(Number.isFinite(valor), 'DATO_INVALIDO', 'Número no finito.'); return; }
  exigir(typeof valor === 'object', 'DATO_INVALIDO', 'Solo datos serializables; omite los campos opcionales ausentes.');
  if (!Array.isArray(valor)) claves(valor, Object.keys(valor));
  else exigir(Object.keys(valor).length === valor.length, 'DATO_INVALIDO', 'No se admiten listas con huecos o propiedades adicionales.');
  for (const v of Object.values(valor)) validarJson(v);
}
export function flujoPara(ctx: ContextoOperativo, tipo: TipoConEstado): FlujoEstados {
  const flujo = tipo === 'incidencia' ? ctx.flujoIncidencias ?? POLITICA_ESTADOS.incidencia : POLITICA_ESTADOS[tipo];
  exigir(flujo && typeof flujo === 'object', 'POLITICA_INVALIDA', 'Flujo ausente.');
  texto(flujo.inicial, 'estado inicial');
  claves(flujo, ['inicial', 'transiciones', 'terminales']);
  exigir(flujo.transiciones && Object.hasOwn(flujo.transiciones, flujo.inicial) && Array.isArray(flujo.terminales), 'POLITICA_INVALIDA', 'Flujo incompleto.');
  for (const [estado, destinos] of Object.entries(flujo.transiciones)) {
    texto(estado, 'estado'); exigir(Array.isArray(destinos) && destinos.every((d) => typeof d === 'string' && Object.hasOwn(flujo.transiciones, d)), 'POLITICA_INVALIDA', 'Transición con destino desconocido.');
  }
  exigir(flujo.terminales.every((t) => Object.hasOwn(flujo.transiciones, t)), 'POLITICA_INVALIDA', 'Terminal desconocido.');
  return flujo;
}
function conEstado(tipo: string): tipo is TipoConEstado { return Object.hasOwn(POLITICA_ESTADOS, tipo); }

const INMUTABLES = ['incidenciaId', 'averiaId', 'equipoId', 'contratoId', 'inquilinoId', 'vinculo'];
function ejecutarCambio(estado: EstadoOperaciones, ctx: ContextoOperativo, cmd: ComandoOperativo): { antes: EntidadOperativa | null; despues: EntidadOperativa } {
  if (cmd.accion === 'CREAR') {
    exigir(!estado.entidades.some((e) => e.tipo === cmd.tipo && e.id === cmd.id), 'DUPLICADO', 'ID ya registrado; no se sobrescribe.');
    claves(cmd.datos, CAMPOS[cmd.tipo]);
    const base = { id: cmd.id, tipo: cmd.tipo, version: 1, creadoEn: cmd.fecha, actualizadoEn: cmd.fecha };
    const despues = {
      ...structuredClone(cmd.datos), ...base,
      ...(cmd.tipo === 'proveedor' ? { propietarioId: ctx.ambito.propietarioId } : { ambito: structuredClone(ctx.ambito), documentoIds: [] }),
      ...(conEstado(cmd.tipo) ? { estado: flujoPara(ctx, cmd.tipo).inicial } : {}),
    } as EntidadOperativa;
    validarEntidad(despues, estado, ctx);
    return { antes: null, despues };
  }
  const antes = obtener(estado, ctx, cmd.tipo, cmd.id);
  let despues: EntidadOperativa = structuredClone(antes);
  if (cmd.accion === 'MODIFICAR') {
    claves(cmd.cambios, CAMPOS[cmd.tipo]);
    exigir(Object.keys(cmd.cambios).length > 0, 'SIN_CAMBIOS', 'Indica al menos un cambio.');
    exigir(!Object.keys(cmd.cambios).some((k) => INMUTABLES.includes(k)), 'RELACION_INMUTABLE', 'No se reescriben vínculos históricos.');
    exigir(antes.tipo !== 'factura', 'FACTURA_INMUTABLE', 'Anula o anota la factura; la asociación tiene su comando explícito.');
    exigir(antes.tipo !== 'presupuesto' || antes.estado === 'PENDIENTE', 'PRESUPUESTO_DECIDIDO', 'No se cambia el contenido de un presupuesto decidido. Registra otra versión con referencia propia.');
    exigir(antes.tipo !== 'reparacion' || !['FINALIZADA', 'CANCELADA'].includes(antes.estado), 'REPARACION_TERMINADA', 'Conserva el resultado; las correcciones se anotan o se registran como nueva actuación.');
    if (antes.tipo === 'reparacion' && antes.estado === 'EN_CURSO') exigir(!Object.keys(cmd.cambios).some((k) => ['proveedorId', 'presupuestoId'].includes(k)), 'RELACION_INMUTABLE', 'No se sustituye la autorización o el ejecutor de una reparación iniciada.');
    despues = { ...despues, ...structuredClone(cmd.cambios) } as EntidadOperativa;
    exigir(canonico(antes) !== canonico(despues), 'SIN_CAMBIOS', 'No hay cambios efectivos.');
  } else if (cmd.accion === 'CAMBIAR_ESTADO') {
    exigir('estado' in antes && conEstado(antes.tipo), 'ESTADO_INVALIDO', 'Esta entidad no tiene flujo de estados.');
    const flujo = flujoPara(ctx, antes.tipo);
    exigir(Object.hasOwn(flujo.transiciones, antes.estado) && flujo.transiciones[antes.estado].includes(cmd.estado), 'TRANSICION_INVALIDA', 'Transición no permitida. No se fuerza el estado.');
    if (antes.tipo === 'incidencia' && (flujo.terminales.includes(cmd.estado) || cmd.estado === 'RESUELTA')) {
      const pendientes = estado.entidades.some((e) => (e.tipo === 'averia' || e.tipo === 'reparacion') && e.incidenciaId === antes.id
        && mismoAmbito(e.ambito, ctx.ambito) && !flujoPara(ctx, e.tipo).terminales.includes(e.estado));
      exigir(!pendientes, 'ACTUACIONES_PENDIENTES', 'Resuelve o cancela las averías y reparaciones antes de cerrar/cancelar la incidencia.');
    }
    if (antes.tipo === 'averia' && flujo.terminales.includes(cmd.estado)) {
      exigir(!estado.entidades.some((e) => e.tipo === 'reparacion' && e.averiaId === antes.id && mismoAmbito(e.ambito, ctx.ambito) && !POLITICA_ESTADOS.reparacion.terminales.includes(e.estado)), 'ACTUACIONES_PENDIENTES', 'La avería tiene reparaciones pendientes.');
    }
    if (antes.tipo === 'presupuesto' && cmd.estado === 'CANCELADO') {
      exigir(!estado.entidades.some((e) => e.tipo === 'reparacion' && e.presupuestoId === antes.id && mismoAmbito(e.ambito, ctx.ambito) && ['EN_CURSO', 'FINALIZADA'].includes(e.estado)), 'PRESUPUESTO_UTILIZADO', 'Conserva la autorización utilizada por una reparación iniciada.');
    }
    if ((antes.tipo === 'averia' || antes.tipo === 'reparacion') && !flujo.terminales.includes(cmd.estado)) {
      const incidencia = obtener(estado, ctx, 'incidencia', antes.incidenciaId);
      exigir(!flujoPara(ctx, 'incidencia').terminales.includes(incidencia.estado), 'INCIDENCIA_TERMINADA', 'Reabre primero la incidencia.');
    }
    if (antes.tipo === 'reparacion' && cmd.estado === 'EN_CURSO') {
      exigir(obtener(estado, ctx, 'proveedor', antes.proveedorId).activo, 'PROVEEDOR_INACTIVO', 'El proveedor está inactivo.');
      if (antes.averiaId) exigir(!POLITICA_ESTADOS.averia.terminales.includes(obtener(estado, ctx, 'averia', antes.averiaId).estado), 'AVERIA_TERMINADA', 'Reabre primero la avería.');
    }
    despues = { ...despues, estado: cmd.estado } as EntidadOperativa;
  } else if (cmd.accion === 'VINCULAR_DOCUMENTO') {
    exigir(antes.tipo !== 'proveedor' && antes.tipo !== 'documento', 'RELACION_INCOHERENTE', 'Vincula documentos a actuaciones o equipos del inmueble.');
    obtener(estado, ctx, 'documento', cmd.documentoId);
    exigir(!antes.documentoIds.includes(cmd.documentoId), 'DUPLICADO', 'Documento ya vinculado.');
    despues = { ...antes, documentoIds: [...antes.documentoIds, cmd.documentoId] };
  } else if (cmd.accion === 'ASOCIAR_FACTURA') {
    exigir(antes.tipo === 'factura' && antes.estado !== 'ANULADA', 'FACTURA_INMUTABLE', 'No se asocia una factura anulada.');
    if (cmd.presupuestoId !== undefined) texto(cmd.presupuestoId, 'presupuestoId');
    despues = { ...antes, vinculo: structuredClone(cmd.vinculo), ...(cmd.presupuestoId !== undefined ? { presupuestoId: cmd.presupuestoId } : {}) };
    exigir(canonico(antes) !== canonico(despues), 'SIN_CAMBIOS', 'La factura ya tiene esa asociación.');
  } else if (cmd.accion === 'ANOTAR') {
    texto(cmd.texto, 'anotación');
    exigir(['DIAGNOSTICO', 'ACTUACION', 'COMUNICACION', 'NOTA'].includes(cmd.clase), 'DATO_INVALIDO', 'Clase de anotación inválida.');
  }
  // Anotar o adjuntar evidencias a registros históricos no exige que un proveedor siga activo.
  if (cmd.accion !== 'ANOTAR' && cmd.accion !== 'VINCULAR_DOCUMENTO') validarEntidad(despues, estado, ctx);
  despues = { ...despues, version: antes.version + 1, actualizadoEn: cmd.fecha };
  return { antes, despues };
}

/** Servicio puro: éxito devuelve snapshot nuevo; error devuelve exactamente el original. */
export function ejecutarOperacion(estado: EstadoOperaciones, contexto: ContextoOperativo, comando: ComandoOperativo): ResultadoOperacion {
  try {
    validarContexto(contexto);
    exigir(Number.isSafeInteger(estado.revision) && estado.revision >= 0 && estado.revision === estado.historial.length, 'SNAPSHOT_INVALIDO', 'Se necesita el snapshot íntegro del libro local.');
    exigir(comando && typeof comando === 'object' && !Array.isArray(comando), 'COMANDO_INVALIDO', 'Se requiere un comando plano.');
    validarJson(comando);
    const extra: Record<string, readonly string[]> = {
      CREAR: ['datos'], MODIFICAR: ['cambios'], CAMBIAR_ESTADO: ['estado'], ANOTAR: ['clase', 'texto'],
      VINCULAR_DOCUMENTO: ['documentoId'], ASOCIAR_FACTURA: ['vinculo', 'presupuestoId'],
    };
    exigir(Object.hasOwn(extra, comando.accion) && Object.hasOwn(CAMPOS, comando.tipo), 'COMANDO_INVALIDO', 'Acción o entidad desconocida.');
    exigir(!(comando.accion === 'MODIFICAR' && (comando.tipo as string) === 'documento')
      && !(comando.accion === 'ASOCIAR_FACTURA' && comando.tipo !== 'factura')
      && !(comando.accion === 'CAMBIAR_ESTADO' && !conEstado(comando.tipo)), 'COMANDO_INVALIDO', 'Acción no admitida para esta entidad.');
    if (comando.accion === 'CREAR') claves(comando.datos, CAMPOS[comando.tipo]);
    claves(comando, ['operacionId', 'fecha', 'actor', 'revisionEsperada', 'motivo', 'accion', 'tipo', 'id', ...extra[comando.accion]]);
    texto(comando.id, 'id'); texto(comando.operacionId, 'operacionId'); texto(comando.actor, 'actor'); texto(comando.motivo, 'motivo'); instante(comando.fecha);
    exigir(Number.isSafeInteger(comando.revisionEsperada) && comando.revisionEsperada >= 0, 'REVISION_INVALIDA', 'Revisión explícita no negativa requerida.');
    const anterior = estado.historial.find((h) => h.operacionId === comando.operacionId);
    if (anterior) {
      exigir(mismoAmbito(anterior.ambito, contexto.ambito), 'AISLAMIENTO', 'La operación corresponde a otro ámbito.');
      exigir(canonico(anterior.comando) === canonico(comando), 'CONFLICTO_IDEMPOTENCIA', 'La clave de reintento ya se usó con otro contenido.');
      return { ok: true, estado, evento: structuredClone(anterior), repetida: true };
    }
    exigir(comando.revisionEsperada === estado.revision, 'CONFLICTO_REVISION', 'El snapshot ha cambiado; relee antes de operar.');
    const ultimo = estado.historial.at(-1);
    exigir(!ultimo || comando.fecha >= ultimo.fecha, 'ORDEN_TEMPORAL', 'La fecha del registro no puede retroceder; la fecha del hecho sí puede ser histórica.');
    if (comando.accion === 'CREAR' && (comando.tipo === 'averia' || comando.tipo === 'reparacion')) {
      const incidencia = obtener(estado, contexto, 'incidencia', comando.datos.incidenciaId);
      exigir(!flujoPara(contexto, 'incidencia').terminales.includes(incidencia.estado), 'INCIDENCIA_TERMINADA', 'Reabre explícitamente la incidencia antes de añadir actuaciones.');
      if (comando.tipo === 'reparacion' && comando.datos.averiaId) {
        exigir(!POLITICA_ESTADOS.averia.terminales.includes(obtener(estado, contexto, 'averia', comando.datos.averiaId).estado), 'AVERIA_TERMINADA', 'Reabre la avería antes de añadir una reparación.');
      }
    }
    const { antes, despues } = ejecutarCambio(estado, contexto, comando);
    const revision = estado.revision + 1;
    const evento: EventoOperativo = {
      operacionId: comando.operacionId, fecha: comando.fecha, actor: comando.actor, motivo: comando.motivo,
      ambito: structuredClone(contexto.ambito), referencia: { tipo: despues.tipo, id: despues.id }, revision,
      comando: structuredClone(comando), antes: antes ? structuredClone(antes) : null, despues: structuredClone(despues),
    };
    const entidades = antes ? estado.entidades.map((e) => e.tipo === despues.tipo && e.id === despues.id ? despues : e) : [...estado.entidades, despues];
    // Ningún alias entre el input, el libro resultante, la entidad y la evidencia del evento.
    return { ok: true, estado: structuredClone({ revision, entidades, historial: [...estado.historial, evento] }), evento: structuredClone(evento), repetida: false };
  } catch (error) {
    if (error instanceof ErrorOperacion) return { ok: false, estado, error: { codigo: error.codigo, mensaje: error.message } };
    // Errores de programación no se ocultan como rechazos de negocio.
    throw error;
  }
}

export function prepararCambioPersistencia(resultado: ResultadoOperacion): CambioOperativoPreparado | null {
  if (!resultado.ok || resultado.repetida) return null;
  return structuredClone({ ambito: resultado.evento.ambito, revisionSnapshotEsperada: resultado.evento.revision - 1,
    versionEntidadEsperada: resultado.evento.antes?.version ?? null, entidad: resultado.evento.despues, evento: resultado.evento });
}
