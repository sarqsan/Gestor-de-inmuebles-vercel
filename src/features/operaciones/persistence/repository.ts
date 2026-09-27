import type { AmbitoOperacion, ComandoOperativo, ContextoOperativo, EntidadOperativa, EstadoOperaciones, EventoOperativo } from '../contracts.ts';
import { ejecutarOperacion } from '../service.ts';
import { exigirAcceso, type IdentidadCanonica } from './authorization.ts';
import { idAuditoria, auditoriaDe, registrarAuditoriaFirestore, type RegistroAuditoriaOperativa } from '../../../lib/auditoria.ts';

export interface CabeceraOperativa {
  readonly revision: number; readonly ultimoEventoId: string; readonly propietarioId: string;
  readonly abiertasPorIncidencia: Record<string, number>; readonly abiertasPorAveria: Record<string, number>;
  readonly presupuestosEnUso: Record<string, number>;
}
export interface LecturaOperativa { readonly estado: EstadoOperaciones; readonly cabecera: CabeceraOperativa | null }
export interface TransaccionOperativa {
  leerCabecera: () => Promise<CabeceraOperativa | null>;
  comprobarInmuebleActual: (ambito: AmbitoOperacion) => Promise<void>;
  guardarEntidad: (evento: EventoOperativo, auditId: string) => void;
  crearAuditoria: (id: string, registro: RegistroAuditoriaOperativa) => void;
  guardarCabecera: (cabecera: CabeceraOperativa) => void;
}
export interface TransporteOperativo {
  identidad: () => Promise<IdentidadCanonica | null>;
  leer: (propietarioId: string) => Promise<LecturaOperativa>;
  contexto: (ambito: AmbitoOperacion) => Promise<ContextoOperativo>;
  transaccion: <T>(propietarioId: string, trabajo: (tx: TransaccionOperativa) => Promise<T>) => Promise<T>;
}
export function cabeceraDe(estado: EstadoOperaciones, evento: EventoOperativo, anterior: CabeceraOperativa | null = null): CabeceraOperativa {
  const ceros = (map: Record<string,number> = {}) => Object.fromEntries(Object.keys(map).map((k)=>[k,0]));
  const abiertasPorIncidencia = ceros(anterior?.abiertasPorIncidencia), abiertasPorAveria = ceros(anterior?.abiertasPorAveria), presupuestosEnUso = ceros(anterior?.presupuestosEnUso);
  const sumar = (map: Record<string, number>, id: string) => { map[id] = (map[id] ?? 0) + 1; };
  for (const e of estado.entidades) {
    if (e.tipo === 'averia' || e.tipo === 'reparacion') {
      // Conservar ceros hace estable la prueba de contadores en las Rules.
      abiertasPorIncidencia[e.incidenciaId] ??= 0;
      if (e.tipo === 'reparacion' && e.averiaId) abiertasPorAveria[e.averiaId] ??= 0;
      if (!(e.tipo === 'averia' ? ['RESUELTA', 'CANCELADA'] : ['FINALIZADA', 'CANCELADA']).includes(e.estado)) {
        sumar(abiertasPorIncidencia, e.incidenciaId);
        if (e.tipo === 'reparacion' && e.averiaId) sumar(abiertasPorAveria, e.averiaId);
      }
      if (e.tipo === 'reparacion' && e.presupuestoId) {
        presupuestosEnUso[e.presupuestoId] ??= 0;
        if (['EN_CURSO', 'FINALIZADA'].includes(e.estado)) sumar(presupuestosEnUso, e.presupuestoId);
      }
    }
  }
  return { propietarioId: evento.ambito.propietarioId, revision: estado.revision, ultimoEventoId: idAuditoria(evento), abiertasPorIncidencia, abiertasPorAveria, presupuestosEnUso };
}
/** Adapta el motor existente; no acepta snapshots ni actores del navegador como autoridad. */
export function crearRepositorioOperativo(transporte: TransporteOperativo) {
  async function cargar(ambito: AmbitoOperacion) {
    const identidad = await transporte.identidad(); exigirAcceso(identidad, ambito.propietarioId);
    const [lectura, contexto] = await Promise.all([transporte.leer(ambito.propietarioId), transporte.contexto(ambito)]);
    if ((lectura.cabecera?.revision ?? 0) !== lectura.estado.historial.length) throw new Error('Lectura concurrente/incompleta; vuelve a cargar.');
    return { ...lectura, contexto, identidad };
  }
  async function ejecutar(ambito: AmbitoOperacion, comando: ComandoOperativo): Promise<EstadoOperaciones> {
    const identidad = await transporte.identidad(); exigirAcceso(identidad, ambito.propietarioId, true);
    if (comando.actor !== identidad.uid) throw new Error('El actor debe ser la identidad autenticada.');
    const { estado, contexto, cabecera } = await cargar(ambito);
    const resultado = ejecutarOperacion(estado, contexto, comando);
    if (resultado.ok === false) throw new Error(`${resultado.error.codigo}: ${resultado.error.mensaje}`);
    if (resultado.repetida) return resultado.estado;
    return transporte.transaccion(ambito.propietarioId, async (tx) => {
      const actual = await tx.leerCabecera();
      if ((actual?.revision ?? 0) !== (cabecera?.revision ?? 0)) throw new Error('CONFLICTO_REVISION: vuelve a cargar antes de repetir.');
      await tx.comprobarInmuebleActual(ambito);
      // Todas las lecturas preceden a cualquier escritura. Un error aborta TODO, incluida auditoría.
      const evento = resultado.evento;
      tx.guardarEntidad(evento, idAuditoria(evento));
      registrarAuditoriaFirestore(auditoriaDe(evento, identidad), tx);
      tx.guardarCabecera(cabeceraDe(resultado.estado, evento, actual));
      return resultado.estado;
    });
  }
  return { cargar, ejecutar };
}
export type RepositorioOperativo = ReturnType<typeof crearRepositorioOperativo>;
