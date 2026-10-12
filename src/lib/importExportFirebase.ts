/**
 * Adaptador Firebase del importador/exportador canónicos.
 *
 * ÚNICA pieza con I/O del módulo: implementa `PuertoPersistenciaImport` y
 * construye catálogos/ámbitos. Reutiliza SIEMPRE persistencia existente:
 *  · lecturas: `subscribePropietarios`/`subscribeInmuebles`/`subscribeContratos`/
 *    `subscribeGastos` (con `DataAccessScope`; Rules = autorización efectiva);
 *  · escrituras: `saveGastoFirestore` / `saveContratoFirestore` (cobros
 *    embebidos vía read-modify-write; las Rules validan propietario/cartera);
 *  · auditoría: `registrarAuditoriaFirestore` best-effort (transporte
 *    genérico de firebase.ts; NO el transaccional de operaciones — se
 *    conserva la distinción documentada en `src/lib/auditoria.ts`);
 *  · carteras: `proyectarCarterasGestionadas` (D2/D3 intactos).
 *
 * Sin cambios en Rules: las escrituras cursan por colecciones existentes con
 * las reglas existentes (master/titular/carterasE). Sin bypass admin.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  Propietario,
} from '../types';
import {
  db,
  deepCleanForFirestore,
  registrarAuditoriaFirestore,
  saveContratoFirestore,
  saveGastoFirestore,
  subscribeContratos,
  subscribeGastos,
  subscribeInmuebles,
  subscribePropietarios,
  type DataAccessScope,
} from './firebase';
import { ambitoAutorizadoDesdeUsuario } from './importExport/ambito';
import type { CatalogosMigracion, ExistenteDestino } from './migracion/tipos';
import type {
  EventoAuditoriaImport,
  InmueblePatrimonialNuevo,
  PuertoPersistenciaImport,
} from './importExport/ejecucion';

/** Cota anti-cuelgue de lecturas únicas (los suscriptores tragan el error de Rules). */
export const LECTURA_UNICA_TIMEOUT_MS = 25_000;

/** Una lectura única a partir de un suscriptor existente (sin duplicar consultas). */
function unaVez<T>(
  suscribir: (cb: (v: T) => void, scope?: DataAccessScope) => () => void,
  scope?: DataAccessScope,
  timeoutMs = LECTURA_UNICA_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    let fin = false;
    const off = suscribir((v) => {
      if (fin) return;
      fin = true;
      clearTimeout(timer);
      queueMicrotask(() => off());
      resolver(v);
    }, scope);
    // Anti-cuelgue (auditoría 3ac21a5/D2): si Rules deniega la consulta, el
    // suscriptor solo hace console.error y jamás llama al callback. Sin cota,
    // el panel se quedaba en "Analizando…" para siempre. Ahora falla honesto.
    const timer = setTimeout(() => {
      if (fin) return;
      fin = true;
      try { off(); } catch { /* noop */ }
      rechazar(new Error(`lectura de catálogo sin respuesta en ${timeoutMs} ms (posible denegación de Rules por ámbito; no se continúa a ciegas)`));
    }, timeoutMs);
    // Evita que el timer retenga el proceso en Node/tests.
    if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
  });
}

export interface FuentesCatalogo {
  propietarios: Propietario[];
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  gastos: Gasto[];
}

export async function cargarFuentesCatalogo(scope?: DataAccessScope, timeoutMs = LECTURA_UNICA_TIMEOUT_MS): Promise<FuentesCatalogo> {
  const [propietarios, inmuebles, contratos, gastos] = await Promise.all([
    unaVez(subscribePropietarios, scope, timeoutMs),
    unaVez(subscribeInmuebles, scope, timeoutMs),
    unaVez(subscribeContratos, scope, timeoutMs),
    unaVez(subscribeGastos, scope, timeoutMs),
  ]);
  return { propietarios, inmuebles, contratos, gastos };
}

/** Proyecta entidades ERP a catálogos B4 (snapshots; B4 nunca lee en vivo). */
export function catalogosDesdeFuentes(
  fuentes: FuentesCatalogo,
  extra?: {
    mapeos?: CatalogosMigracion['mapeos'];
    propietariosPermitidosIds?: string[];
    importador?: CatalogosMigracion['importador'];
  },
): CatalogosMigracion {
  const existentes: ExistenteDestino[] = fuentes.gastos.map((g) => ({
    claveOrigen: g.origen && g.origenId ? `${g.origen}:${g.origenId}` : undefined,
    destinoId: g.id,
    entidad: 'GASTO' as const,
  }));
  for (const c of fuentes.contratos) {
    for (const cobro of c.registroCobros ?? []) {
      existentes.push({ destinoId: cobro.id, entidad: 'COBRO' as const });
    }
  }
  return {
    propietarios: fuentes.propietarios.map((p) => ({ id: p.id, nombre: p.nombre, nifCif: p.nifCif, email: p.email })),
    inmuebles: fuentes.inmuebles.map((i) => ({
      id: i.id,
      direccion: i.direccion,
      ciudad: i.ciudad,
      referenciaCatastral: i.referenciaCatastral,
      propietarioId: i.propietarioId ?? i.propietarioPrincipalId,
    })),
    contratos: fuentes.contratos.map((c) => ({ id: c.id, inmuebleId: c.inmuebleId, propietarioId: c.propietarioId })),
    mapeos: extra?.mapeos ?? [],
    existentes,
    ...(extra?.propietariosPermitidosIds ? { propietariosPermitidosIds: extra.propietariosPermitidosIds } : {}),
    ...(extra?.importador ? { importador: extra.importador } : {}),
  };
}

/** Reexportado del núcleo puro (D2/D3 intactos; Rules = autorización efectiva). */
export { ambitoAutorizadoDesdeUsuario };

/** Puerto real: escrituras por funciones existentes + auditoría best-effort. */
export function crearPuertoFirebase(
  identidad: { usuarioId: string; usuarioEmail: string; usuarioNombre: string },
): PuertoPersistenciaImport {
  return {
    async existeDestino(coleccion: string, destinoId: string): Promise<boolean> {
      if (coleccion !== 'gastos' && coleccion !== 'inmuebles') {
        throw new Error(`colección no escribible por importación: '${coleccion}'`);
      }
      const snap = await getDoc(doc(db, coleccion, destinoId));
      return snap.exists();
    },
    async existeCobro(contratoId: string, cobroId: string): Promise<boolean> {
      const snap = await getDoc(doc(db, 'contratos_formalizacion', contratoId));
      if (!snap.exists()) return false;
      const data = snap.data() as Partial<ContratoFormalizacion>;
      return (data.registroCobros ?? []).some((c) => c.id === cobroId);
    },
    async crearGasto(gasto: Gasto): Promise<void> {
      // Verificación post-escritura (auditoría 3ac21a5/D12): saveGastoFirestore
      // traga errores (catch+console.error sin rethrow, preexistente en
      // firebase.ts y NO tocado aquí por radio de impacto). Sin verificar, una
      // denegación de Rules se informaba como CREADO (+auditoría falsa EXITO).
      await saveGastoFirestore(gasto);
      const verif = await getDoc(doc(db, 'gastos', gasto.id));
      if (!verif.exists()) {
        throw new Error(`escritura no verificada en 'gastos/${gasto.id}' (posible denegación de Rules o fallo de red; no se informa CREADO)`);
      }
    },
    /**
     * ALTA DE INMUEBLE PATRIMONIAL (importación).
     *
     * Escribe SÓLO `inmuebles/{id}` y SÓLO los campos declarados. Deliberadamente
     * NO se reutiliza `saveInmuebleFirestore`: ese camino escribe además el
     * espejo público `fichas_publicas_inmueble` (R3) y el builder no exige
     * estado de publicación, así que daría de ALTA un inmueble sin datos de
     * alquiler a la vez que lo PUBLICARÍA (la ficha es de lectura abierta). Un
     * alta patrimonial no es una publicación: aquí no se publica nada. La
     * publicación sigue siendo un acto explícito del panel de inmuebles.
     *
     * Verificación post-escritura (mismo criterio que `crearGasto`): `setDoc`
     * puede fallar por Rules y hay que demostrar que el documento existe antes
     * de informar CREADO. Un id ya ocupado se detecta antes (existeDestino) y
     * jamás se sobrescribe: aquí no se usa `merge`.
     */
    async crearInmueble(inmueble: InmueblePatrimonialNuevo): Promise<void> {
      const { id, ...campos } = inmueble;
      await setDoc(doc(db, 'inmuebles', id), { id, ...deepCleanForFirestore(campos) });
      const verif = await getDoc(doc(db, 'inmuebles', id));
      if (!verif.exists()) {
        throw new Error(`escritura no verificada en 'inmuebles/${id}' (posible denegación de Rules o fallo de red; no se informa CREADO)`);
      }
    },

    async anexarCobro(contratoId: string, cobro: CobroPeriodo): Promise<void> {
      const ref = doc(db, 'contratos_formalizacion', contratoId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error(`contrato destino inexistente: '${contratoId}'`);
      const contrato = { id: snap.id, ...(snap.data() as object) } as ContratoFormalizacion;
      const actuales = contrato.registroCobros ?? [];
      if (actuales.some((c) => c.id === cobro.id)) return; // idempotente
      await saveContratoFirestore({ ...contrato, registroCobros: [...actuales, cobro] });
    },
    async auditar(evento: EventoAuditoriaImport): Promise<void> {
      await registrarAuditoriaFirestore({
        usuarioId: identidad.usuarioId,
        usuarioEmail: identidad.usuarioEmail,
        usuarioNombre: identidad.usuarioNombre,
        accion: `IMPORTACION_${evento.accion}`,
        descripcion: `${evento.descripcion} [run ${evento.importRunId} / ${evento.migrationRunId} ← ${evento.source}:${evento.sourceRecordId}]`,
        entidadAfectada: 'importacion_general',
        idAfectado: evento.entidadId,
        resultado: evento.resultado === 'FALLIDO' ? 'ERROR' : 'EXITO',
        detalles: {
          entidad: evento.entidad,
          propietarioId: evento.propietarioId,
          ...(evento.inmuebleId ? { inmuebleId: evento.inmuebleId } : {}),
          importRunId: evento.importRunId,
          migrationRunId: evento.migrationRunId,
          source: evento.source,
          sourceRecordId: evento.sourceRecordId,
          resultado: evento.resultado,
          ...(evento.motivo ? { motivo: evento.motivo } : {}),
        },
      });
    },
  };
}
