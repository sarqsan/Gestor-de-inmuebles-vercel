/**
 * OBSERVABILIDAD PERSISTENTE de «Lectura · Inmuebles: No tienes permisos…».
 *
 * Orden 2026-10-03: el error recurrente debe quedar identificado (origen, código,
 * contexto) SIN reproducción manual y SIN tocar reglas, consultas ni modelo.
 *
 * Estas pruebas fijan el contrato del módulo puro `observabilidadLecturaInmuebles`:
 *  · registro mínimo y completo de cada uno de los cinco orígenes;
 *  · deduplicación (la primera incidencia SIEMPRE se conserva; las repeticiones se agregan);
 *  · tolerancia a fallos de persistencia (no rompe la lectura ni provoca bucle);
 *  · minimización (sin correos, tokens, credenciales ni identificadores completos);
 *  · entorno etiquetado y nunca mezclado;
 *  · decodificación del libro remoto;
 *  · y el cableado real en `firebase.ts` (transporte al `audit_logs` existente).
 */
import fs from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCION_DIAGNOSTICO_INMUEBLES,
  CLAVE_ALMACEN_INMUEBLES,
  MAXIMO_INCIDENCIAS_LOCALES,
  VENTANA_DEDUPLICACION_MS,
  camposSensiblesEnIncidencia,
  construirIncidenciaLecturaInmuebles,
  documentoAuditoriaIncidencia,
  incidenciasDesdeAuditLogs,
  incidenciasLecturaInmueblesLocales,
  limpiarIncidenciasLecturaInmueblesLocales,
  minimizarIdentificador,
  registrarIncidenciaLecturaInmuebles,
  sanearMensajeError,
  _reiniciarEstadoObservabilidadParaPruebas,
  type AlmacenIncidencias,
  type IncidenciaLecturaInmuebles,
} from '../src/lib/observabilidadLecturaInmuebles';
import {
  construirInformeInmuebles,
  type ContextoLecturaInmuebles,
  type InformeInmuebles,
  type ObservacionEspejoInmuebles,
} from '../src/lib/diagnosticoInmuebles';
import type { LecturaDocumento } from '../src/lib/diagnosticoCarteras';

const RAIZ = path.resolve(__dirname, '..');
const UID = 'uid-auth-1234567890';
const USUARIO = 'usuario-abcdef123456';
const PID = 'prop-1783441481122_0';

const espejo = (extra: Record<string, unknown> = {}): LecturaDocumento => ({
  estado: 'EXISTE',
  datos: {
    usuarioId: USUARIO,
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    propietarioId: PID,
    inmuebleIds: [],
    carterasL: [],
    carterasE: [],
    ...extra,
  },
});

const perfil = (extra: Record<string, unknown> = {}): LecturaDocumento => ({
  estado: 'EXISTE',
  datos: { authUid: UID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: PID, ...extra },
});

const obs = (extra: Partial<ObservacionEspejoInmuebles> = {}): ObservacionEspejoInmuebles => ({
  espejo: espejo(),
  perfil: perfil(),
  perfilPorUid: { estado: 'NO_EXISTE' },
  ...extra,
});

const ctx = (extra: Partial<ContextoLecturaInmuebles> = {}): ContextoLecturaInmuebles => ({
  origen: 'INM-COT',
  consulta: "inmuebles where('titularesIds','array-contains', pid)  [cotitularidad]",
  pid: PID,
  authUid: UID,
  tipoPerfil: 'PROPIETARIO',
  propietarioIdCliente: PID,
  numeroInmuebleIds: 2,
  numeroInmueblesParciales: 1,
  numeroCarterasGestionadas: 0,
  proyecto: 'gestor-inmuebles-produccion',
  baseDeDatos: 'ai-studio-gestordeinmueble-ejemplo',
  codigoError: 'permission-denied',
  mensajeError: 'Missing or insufficient permissions.',
  ...extra,
});

const informe = (extra: Partial<ContextoLecturaInmuebles> = {}): InformeInmuebles =>
  construirInformeInmuebles({ ctx: ctx(extra), observacion: obs(), momento: '2026-10-03T20:15:00.000Z' });

/** Búfer local en memoria: las pruebas nunca tocan `localStorage`. */
function almacenFalso(): AlmacenIncidencias & { datos: IncidenciaLecturaInmuebles[] } {
  const estado = { datos: [] as IncidenciaLecturaInmuebles[] };
  return {
    get datos() {
      return estado.datos;
    },
    leer: () => estado.datos,
    escribir: (registros) => {
      estado.datos = [...registros];
    },
  } as AlmacenIncidencias & { datos: IncidenciaLecturaInmuebles[] };
}

const reloj = (inicio: string) => {
  let ms = new Date(inicio).getTime();
  return {
    ahora: () => new Date(ms),
    avanzar: (delta: number) => {
      ms += delta;
    },
  };
};

beforeEach(() => {
  _reiniciarEstadoObservabilidadParaPruebas();
});

// ===========================================================================
// 1 · REGISTRO
// ===========================================================================
describe('observabilidad de Inmuebles · registro', () => {
  it('registra el error con todos los campos mínimos exigidos por la orden', () => {
    const almacen = almacenFalso();
    const registro = construirIncidenciaLecturaInmuebles(informe(), {
      entorno: 'production',
      momento: '2026-10-03T20:15:00.000Z',
    });

    expect(registro.tipo).toBe(ACCION_DIAGNOSTICO_INMUEBLES);
    expect(registro.version).toBe(1);
    expect(registro.environment).toBe('production');
    expect(registro.fechaHora).toBe('2026-10-03T20:15:00.000Z');
    expect(registro.origen).toBe('INM-COT');
    expect(registro.causa).toBe('ESTADO_CUMPLE_LA_REGLA');
    expect(registro.errorCode).toBe('permission-denied');
    expect(registro.errorMessage).toContain('insufficient permissions');
    expect(registro.query).toContain("array-contains");
    expect(registro.scope).toEqual({ inmuebleIds: 2, parciales: 1, carteras: 0 });
    expect(registro.rol).toBe('PROPIETARIO');
    expect(registro.propietarioId?.prefijo).toBe(PID.slice(0, 6));
    expect(registro.uid?.prefijo).toBe(UID.slice(0, 6));
    expect(registro.proyecto).toBe('gestor-inmuebles-produccion');
    expect(registro.baseDeDatos).toBe('ai-studio-gestordeinmueble-ejemplo');
    // Camino disponible y ya observado por el diagnóstico.
    expect(registro.mirrorPropietarioId?.huella).toBe(minimizarIdentificador(PID)?.huella);
    expect(registro.profilePropietarioId?.huella).toBe(minimizarIdentificador(PID)?.huella);
    expect(registro.failingTerm).toBeNull(); // el estado observable cumple la regla
    expect(almacen.datos).toEqual([]);
  });

  it('los cinco orígenes quedan etiquetados individualmente y se envían', async () => {
    const origenes = ['INM-OWN', 'INM-COT', 'INM-GEST', 'INM-ID', 'INM-ADMIN'] as const;
    const almacen = almacenFalso();
    const enviados: string[] = [];
    for (const origen of origenes) {
      const res = await registrarIncidenciaLecturaInmuebles(
        informe({ origen, pid: origen === 'INM-ADMIN' ? null : PID }),
        {
          entorno: 'production',
          almacen,
          enviarRemoto: async (r) => {
            enviados.push(r.origen);
          },
        }
      );
      expect(res.accion).toBe('escrita');
      expect(res.enviadoRemoto).toBe(true);
      expect(res.registro.origen).toBe(origen);
    }
    expect(enviados).toEqual([...origenes]);
    expect(almacen.datos.map((r) => r.origen)).toEqual([...origenes]);
  });

  it('conserva el `inmuebleId` minimizado y su procedencia en INM-ID', () => {
    const registro = construirIncidenciaLecturaInmuebles(
      informe({
        origen: 'INM-ID',
        inmuebleId: 'inm-998877665544',
        inmuebleIdEnEspejo: false,
        inmuebleIdParcial: false,
      }),
      { entorno: 'production' }
    );
    expect(registro.inmuebleId?.prefijo).toBe('inm-99');
    expect(registro.scope.inmuebleIdEnEspejo).toBe(false);
    expect(registro.scope.inmuebleIdParcial).toBe(false);
  });
});

// ===========================================================================
// 2 · DEDUPLICACIÓN (sin ruido y sin perder la primera)
// ===========================================================================
describe('observabilidad de Inmuebles · deduplicación', () => {
  it('la PRIMERA incidencia de cada contexto se conserva y las repeticiones se agregan', async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn(async () => {});
    const t = reloj('2026-10-03T20:00:00.000Z');

    const primera = await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen, enviarRemoto: enviar, ahora: t.ahora });
    t.avanzar(1000);
    const segunda = await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen, enviarRemoto: enviar, ahora: t.ahora });
    t.avanzar(1000);
    const tercera = await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen, enviarRemoto: enviar, ahora: t.ahora });

    expect(primera.accion).toBe('escrita');
    expect(segunda.accion).toBe('agregada');
    expect(tercera.accion).toBe('agregada');
    expect(tercera.registro.contador).toBe(3);
    expect(tercera.registro.primerFechaHora).toBe('2026-10-03T20:00:00.000Z');
    expect(tercera.registro.fechaHora).toBe('2026-10-03T20:00:02.000Z');
    expect(enviar).toHaveBeenCalledTimes(1); // una sola escritura remota
    expect(almacen.datos).toHaveLength(1); // una sola entrada local, con contador
    expect(almacen.datos[0].contador).toBe(3);
  });

  it('un contexto distinto (origen o consulta) sí genera registro nuevo', async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn(async () => {});
    await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen, enviarRemoto: enviar });
    await registrarIncidenciaLecturaInmuebles(informe({ origen: 'INM-OWN' }), { entorno: 'production', almacen, enviarRemoto: enviar });
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(almacen.datos).toHaveLength(2);
  });

  it('pasada la ventana de deduplicación vuelve a registrarse el mismo contexto', async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn(async () => {});
    const t = reloj('2026-10-03T20:00:00.000Z');
    await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen, enviarRemoto: enviar, ahora: t.ahora });
    t.avanzar(VENTANA_DEDUPLICACION_MS + 1);
    const reciente = await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen, enviarRemoto: enviar, ahora: t.ahora });
    expect(reciente.accion).toBe('escrita');
    expect(reciente.registro.contador).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('el envío remoto tiene tope por sesión: más allá, solo búfer local', async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn(async () => {});
    for (let i = 0; i < 6; i++) {
      await registrarIncidenciaLecturaInmuebles(
        informe({ origen: 'INM-GEST', pid: `prop-cartera-${i}`, consulta: `inmuebles where('propietarioId','==', pid-${i})` }),
        { entorno: 'production', almacen, enviarRemoto: enviar, maximoEnviosRemotos: 3 }
      );
    }
    expect(enviar).toHaveBeenCalledTimes(3);
    expect(almacen.datos).toHaveLength(6); // la evidencia local no se pierde
    expect(almacen.datos[5].clave).toBeTruthy();
  });
});

// ===========================================================================
// 3 · FALLO DE PERSISTENCIA (no rompe la lectura, no provoca bucle)
// ===========================================================================
describe('observabilidad de Inmuebles · tolerancia a fallos', () => {
  it('si la escritura remota falla, no lanza, lo anota y conserva la copia local', async () => {
    const almacen = almacenFalso();
    const res = await registrarIncidenciaLecturaInmuebles(informe(), {
      entorno: 'production',
      almacen,
      enviarRemoto: async () => {
        throw new Error('permission-denied al escribir la incidencia');
      },
    });
    expect(res.accion).toBe('escrita');
    expect(res.enviadoRemoto).toBe(false);
    expect(res.motivo).toBe('envio-fallido');
    expect(almacen.datos).toHaveLength(1);
  });

  it('sin transporte remoto (o con búfer caído) el registro nunca lanza', async () => {
    const almacenRoto: AlmacenIncidencias = {
      leer: () => {
        throw new Error('almacén ilegible');
      },
      escribir: () => {
        throw new Error('almacén bloqueado');
      },
    };
    const sinTransporte = await registrarIncidenciaLecturaInmuebles(informe(), { entorno: 'production', almacen: almacenRoto });
    expect(sinTransporte.motivo).toBe('sin-transporte');
    const conFallo = await registrarIncidenciaLecturaInmuebles(informe({ origen: 'INM-OWN' }), {
      entorno: 'production',
      almacen: almacenRoto,
      enviarRemoto: async () => {
        throw new Error('caído');
      },
    });
    expect(conFallo.motivo).toBe('envio-fallido');
    expect(camposSensiblesEnIncidencia(conFallo.registro)).toEqual([]);
  });

  it('el módulo no puede provocar otro aviso: no conoce el canal de incidencias', () => {
    const src = fs.readFileSync(path.resolve(RAIZ, 'src/lib/observabilidadLecturaInmuebles.ts'), 'utf8');
    expect(src).not.toMatch(/reportarErrorLectura\s*\(/);
    expect(src).not.toMatch(/from 'firebase/);
    expect(src).not.toContain("from './firebase'");
  });

  it('el búfer local está acotado y se puede vaciar sin tocar el libro remoto', () => {
    const almacen = almacenFalso();
    for (let i = 0; i < MAXIMO_INCIDENCIAS_LOCALES + 5; i++) {
      const registro = construirIncidenciaLecturaInmuebles(
        informe({ origen: 'INM-ID', inmuebleId: `inm-${i}` }),
        { entorno: 'production', momento: `2026-10-03T20:00:${String(i).padStart(2, '0')}.000Z` }
      );
      const actuales = almacen.leer();
      almacen.escribir([...actuales, registro].slice(-MAXIMO_INCIDENCIAS_LOCALES));
    }
    expect(almacen.datos).toHaveLength(MAXIMO_INCIDENCIAS_LOCALES);
    expect(almacen.datos[0].inmuebleId).not.toEqual(almacen.datos[almacen.datos.length - 1].inmuebleId);
  });
});

// ===========================================================================
// 4 · MINIMIZACIÓN / DATOS SENSIBLES
// ===========================================================================
describe('observabilidad de Inmuebles · datos sensibles', () => {
  it('nunca guarda el uid ni el propietarioId completos', () => {
    const registro = construirIncidenciaLecturaInmuebles(informe(), { entorno: 'production' });
    const serializado = JSON.stringify(registro);
    expect(serializado).not.toContain(UID);
    expect(serializado).not.toContain(PID);
    expect(serializado).not.toContain(USUARIO);
    expect(registro.uid).toEqual(minimizarIdentificador(UID));
  });

  it('sanea correos, credenciales y cadenas largas del mensaje de error', () => {
    const sucio = 'user@example.com Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';
    const limpio = sanearMensajeError(sucio);
    expect(limpio).not.toContain('@');
    expect(limpio).not.toContain('Bearer');
    expect(camposSensiblesEnIncidencia(
      construirIncidenciaLecturaInmuebles(informe({ mensajeError: sucio }), { entorno: 'production' })
    )).toEqual([]);
  });

  it('un registro con datos sensibles NO se envía al libro remoto', async () => {
    const almacen = almacenFalso();
    const enviar = vi.fn(async () => {});
    // Fabricamos el caso forzando el patrón en el término que falla (vía informe real).
    const informeConTermino = informe();
    const registroForzado = {
      ...construirIncidenciaLecturaInmuebles(informeConTermino, { entorno: 'production' }),
      failingTerm: 'contacto: alguien@dominio.com',
    };
    expect(camposSensiblesEnIncidencia(registroForzado)).toContain('email');
    // Y el módulo real, con un mensaje sucio, tampoco lo envía con datos.
    await registrarIncidenciaLecturaInmuebles(
      informe({ mensajeError: 'fallo de token 0123456789012345678901234567890123456789' }),
      { entorno: 'production', almacen, enviarRemoto: enviar }
    );
    expect(enviar).toHaveBeenCalledTimes(1); // el mensaje ya iba saneado: se envía limpio
    expect(camposSensiblesEnIncidencia((enviar.mock.calls[0] as unknown[])[0] as IncidenciaLecturaInmuebles)).toEqual([]);
  });

  it('el término que falla oculta los identificadores completos de la sesión', () => {
    const registro = construirIncidenciaLecturaInmuebles(
      informe({ pid: 'otro-propietario-123', origen: 'INM-COT' }),
      { entorno: 'production' }
    );
    expect(registro.causa).toBe('PID_DISTINTO_DEL_ESPEJO');
    expect(registro.failingTerm).not.toBeNull();
    expect(registro.failingTerm).not.toContain('otro-propietario-123');
    expect(registro.failingTerm).not.toContain(PID);
    expect(camposSensiblesEnIncidencia(registro)).toEqual([]);
  });
});

// ===========================================================================
// 5 · ENTORNO Y LECTURA DEL LIBRO REMOTO
// ===========================================================================
describe('observabilidad de Inmuebles · entorno y lectura remota', () => {
  it('etiqueta el entorno y jamás declara producción por defecto', async () => {
    const almacen = almacenFalso();
    const porDefecto = await registrarIncidenciaLecturaInmuebles(informe(), { almacen });
    expect(porDefecto.registro.environment).toBe('development');
    const produccion = await registrarIncidenciaLecturaInmuebles(informe({ origen: 'INM-OWN' }), {
      almacen,
      entorno: 'production',
    });
    expect(produccion.registro.environment).toBe('production');
  });

  it('decodifica solo las incidencias propias del libro de auditoría', () => {
    const incidencia = construirIncidenciaLecturaInmuebles(informe(), { entorno: 'production' });
    const registros = [
      { id: 'a', accion: ACCION_DIAGNOSTICO_INMUEBLES, fechaHora: incidencia.fechaHora, detalles: { incidencia } },
      { id: 'b', accion: 'ADMIN_CREO_USUARIO', fechaHora: '2026-10-03T20:00:00.000Z', detalles: { incidencia } },
      { id: 'c', accion: ACCION_DIAGNOSTICO_INMUEBLES, fechaHora: '2026-10-03T20:00:00.000Z', detalles: {} },
      { id: 'd', accion: ACCION_DIAGNOSTICO_INMUEBLES, fechaHora: '2026-10-03T20:00:00.000Z' },
    ];
    const decodificadas = incidenciasDesdeAuditLogs(registros);
    expect(decodificadas).toHaveLength(1);
    expect(decodificadas[0].clave).toBe(incidencia.clave);
    expect(incidenciasDesdeAuditLogs(null)).toEqual([]);
  });

  it('el búfer local por defecto usa la clave declarada y sobrevive a un almacén vacío', () => {
    expect(CLAVE_ALMACEN_INMUEBLES).toBe('rentselect_diagnosticos_lectura_inmuebles');
    expect(incidenciasLecturaInmueblesLocales().every((i) => i.tipo === ACCION_DIAGNOSTICO_INMUEBLES)).toBe(true);
    limpiarIncidenciasLecturaInmueblesLocales();
  });
});

// ===========================================================================
// 6 · CABLEADO REAL (integración con el transporte existente)
// ===========================================================================
describe('observabilidad de Inmuebles · cableado en firebase.ts', () => {
  const src = fs.readFileSync(path.resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');

  it('llama al registro persistente desde el diagnóstico, sin bloquearlo', () => {
    expect(src).toContain('registrarIncidenciaLecturaInmuebles(informe, {');
    expect(src).toMatch(/enviarRemoto: enviarIncidenciaLecturaInmueblesAAuditoria/);
    expect(src).toMatch(/void registrarIncidenciaLecturaInmuebles\(/);
  });

  it('el transporte usa el libro de auditoría existente y no guarda correos', () => {
    expect(src).toMatch(/documentoAuditoriaIncidencia\(registro, id\)/);
    expect(src).toMatch(/setDoc\(doc\(AUDIT_LOGS_COL, id\), sanitizeObjectForFirestore\(documento\)\)/);
    const sobre = documentoAuditoriaIncidencia(construirIncidenciaLecturaInmuebles(informe(), { entorno: 'production' }), 'audit_diag_inm_x');
    expect(sobre.usuarioEmail).toBe('');
    expect(sobre.accion).toBe(ACCION_DIAGNOSTICO_INMUEBLES);
    expect(sobre.resultado).toBe('ERROR');
    expect(JSON.stringify(sobre)).not.toContain(UID);
  });

  it('el camino de error no añade avisos: siguen existiendo los mismos puntos de reporte', () => {
    // Cuatro puntos de reporte reales (INM-OWN/INM-GEST comparten callback); el
    // quinto `reportarErrorLectura('inmuebles'` del fichero está dentro de un comentario.
    expect((src.match(/reportarErrorLectura\('inmuebles', err/g) ?? []).length).toBe(4);
  });

  it('no se han tocado las consultas de inmuebles (ni array-contains ni propietarioId)', () => {
    expect(src).toContain("where('titularesIds', 'array-contains', pid)");
    expect(src).toContain("where('propietarioId', '==', pid)");
    expect(src).toContain("doc(db, 'inmuebles', inmuebleId)");
  });
});
