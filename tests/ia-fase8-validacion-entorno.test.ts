/**
 * IA · FASE 8 — VALIDACIÓN EN ENTORNO NO PRODUCTIVO (SIN COSTE REAL)
 * =================================================================
 * Comprueba, sin red y sin credenciales, que la activación gradual puede
 * ensayarse de verdad y que NADA de esta fase activa consumo:
 *
 *   · la guardia de entorno se niega en producción y explica qué falta
 *     (proyecto, política declarada y completa) sin inventar valores;
 *   · los límites de gasto se derivan de la política declarada (peor caso);
 *   · el proveedor simulado no usa SDK, ni clave, ni red, y permite simular
 *     fallos por operación para verificar los reembolsos;
 *   · el sandbox recorre las 12 operaciones con cuenta de prueba y devuelve
 *     consumo, reembolsos, log y registro sin datos sensibles;
 *   · la ruta del proveedor real está explícitamente BLOQUEADA y el sandbox no
 *     añade ninguna ruta al servidor HTTP.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearDependenciasNucleoIA } from '../server/ia/configuracionIA';
import { CAMPOS_REGISTRO_IA } from '../server/ia/registroOperacionesIA';
import { OPERACIONES_IA } from '../src/ia/catalogoOperacionesIA';
import {
  CUOTAS_IA_REFERENCIA,
  TARIFAS_IA_REFERENCIA,
  construirPoliticaIACompleta,
  politicaGobiernoIADesdeEntorno,
  type PoliticaGobiernoIA,
} from '../src/ia/gobiernoIAContrato';
import {
  CLAVE_PROVEEDOR_SIMULADO,
  evaluarEntornoIA,
  ejecutarSandboxIA,
  limitesGastoIA,
  proveedorRealBloqueado,
  proveedorSimulado,
} from '../server/ia/validacionEntornoIA';

const RAIZ = resolve(__dirname, '..');
const FUENTE_VALIDACION = readFileSync(join(RAIZ, 'server', 'ia', 'validacionEntornoIA.ts'), 'utf8');
const SERVER = readFileSync(join(RAIZ, 'server.ts'), 'utf8');

/** Entorno NO productivo canónico: sin VERCEL ni NODE_ENV=production (proyecto resuelto como en servidor). */
const ENTORNO_NO_PRODUCTIVO: NodeJS.ProcessEnv = {};
const PROYECTO_APLICACION = (JSON.parse(readFileSync(join(RAIZ, 'firebase-applet-config.json'), 'utf8')) as { projectId: string }).projectId;

const plantilla = (): PoliticaGobiernoIA => construirPoliticaIACompleta();

describe('IA Fase 8 · guardia de entorno (nada se valida en producción)', () => {
  it('marca producción con VERCEL o NODE_ENV=production y bloquea el ensayo', () => {
    for (const entorno of [{ VERCEL: '1', FIREBASE_PROJECT_ID: 'p' }, { NODE_ENV: 'production', FIREBASE_PROJECT_ID: 'p' }]) {
      const evaluacion = evaluarEntornoIA(entorno, plantilla());
      expect(evaluacion.produccion).toBe(true);
      expect(evaluacion.puedeValidarEnSandbox).toBe(false);
      expect(evaluacion.bloqueos.join(' ')).toMatch(/PRODUCCIÓN/);
    }
  });

  it('en no productivo con la política declarada y completa permite validar, sin credencial (sólo aviso)', () => {
    const evaluacion = evaluarEntornoIA(ENTORNO_NO_PRODUCTIVO, plantilla());
    expect(evaluacion.produccion).toBe(false);
    expect(evaluacion.puedeValidarEnSandbox).toBe(true);
    expect(evaluacion.bloqueos).toEqual([]);
    expect(evaluacion.avisos.join(' ')).toMatch(/credencial de servicio/i);
    // La identificación es la MISMA del servidor (nunca un proyecto inventado).
    expect(evaluacion.identificacion.proyecto).toBe(PROYECTO_APLICACION);
    expect(evaluacion.identificacion.baseDatos).toBeTruthy();
  });

  it('apuntar el ensayo a OTRO proyecto por variable no cuela: la configuración incoherente bloquea', () => {
    const evaluacion = evaluarEntornoIA({ FIREBASE_PROJECT_ID: 'proyecto-ajeno-fase8' }, plantilla());
    expect(evaluacion.puedeValidarEnSandbox).toBe(false);
    expect(evaluacion.bloqueos.join(' ')).toMatch(/FIREBASE_OVERRIDE_INCOMPATIBLE/);
  });

  it('sin política (o POR_DEFECTO) NO se valida: el consumo sigue bloqueado por diseño', () => {
    const sinPolitica = evaluarEntornoIA(ENTORNO_NO_PRODUCTIVO, null);
    expect(sinPolitica.puedeValidarEnSandbox).toBe(false);
    expect(sinPolitica.bloqueos.join(' ')).toMatch(/No hay política de IA declarada/);

    const porDefecto = politicaGobiernoIADesdeEntorno({});
    const conPorDefecto = evaluarEntornoIA(ENTORNO_NO_PRODUCTIVO, porDefecto.estado === 'VALIDA' ? porDefecto.politica : null);
    expect(conPorDefecto.puedeValidarEnSandbox).toBe(false);
    expect(conPorDefecto.bloqueos.join(' ')).toMatch(/POR_DEFECTO/);
  });

  it('una política declarada pero incompleta tampoco valida', () => {
    const incompleta = { ...plantilla(), cuotas: { operacionesPorDia: 5, operacionesPorMes: 50 }, permisos: { ...plantilla().permisos, PROFESIONAL: [] } } as PoliticaGobiernoIA;
    // Ámbito vacío declarado sigue siendo válido estructuralmente, así que se rompe la tarifa:
    const sinTarifa = { ...plantilla(), costeCreditosPorOperacion: { ...TARIFAS_IA_REFERENCIA } } as Record<string, unknown>;
    delete (sinTarifa.costeCreditosPorOperacion as Record<string, number>).REDACTAR_CLAUSULA;
    const evaluacion = evaluarEntornoIA(ENTORNO_NO_PRODUCTIVO, sinTarifa as never);
    expect(evaluacion.puedeValidarEnSandbox).toBe(false);
    expect(evaluacion.bloqueos.join(' ')).toMatch(/incompleta/i);
    expect(incompleta.permisos.PROFESIONAL).toEqual([]);
  });

  it('la ausencia de credencial de servicio es aviso (sandbox en memoria), no bloqueo', () => {
    const conCredencial = evaluarEntornoIA({ ...ENTORNO_NO_PRODUCTIVO, FIREBASE_SERVICE_ACCOUNT: '{"project_id":"p"}' }, plantilla());
    expect(conCredencial.avisos.join(' ')).not.toMatch(/Sin credencial de servicio/);
    const conClaveProveedor = evaluarEntornoIA({ ...ENTORNO_NO_PRODUCTIVO, GEMINI_API_KEY: CLAVE_PROVEEDOR_SIMULADO }, plantilla());
    expect(conClaveProveedor.avisos.join(' ')).toMatch(/no la usa/i);
    expect(conClaveProveedor.avisos.join(' ')).not.toContain(CLAVE_PROVEEDOR_SIMULADO);
  });

  it('la configuración real del repositorio sigue SIN permitir validar ni consumir', () => {
    // Sin IA_POLITICA_JSON (estado del repositorio) el núcleo queda bloqueado.
    const deps = crearDependenciasNucleoIA({ VERCEL: '1' });
    expect(deps.politica?.origen).toBe('POR_DEFECTO');
    const evaluacion = evaluarEntornoIA({ VERCEL: '1' }, deps.politica);
    expect(evaluacion.puedeValidarEnSandbox).toBe(false);
    expect(evaluacion.bloqueos).toHaveLength(2); // producción + política POR_DEFECTO
  });
});

describe('IA Fase 8 · límites de gasto derivados de la política', () => {
  it('calcula el peor caso por usuario y del sistema con las cuotas y tarifas declaradas', () => {
    const politica = construirPoliticaIACompleta({ cuotas: { operacionesPorDia: 10, operacionesPorMes: 100 }, costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 7 } });
    const limites = limitesGastoIA(politica, 30);
    expect(limites).toMatchObject({
      usuariosPrevistos: 30,
      operacionesPorDiaPorUsuario: 10,
      operacionesPorMesPorUsuario: 100,
      creditosPorOperacionMasCara: 7,
      operacionesDiaSistema: 300,
      operacionesMesSistema: 3000,
      creditosDiaPeorCaso: 300 * 7,
      creditosMesSistema: 3000 * 7,
    });
    // La matriz de perfiles es la declarada, no una heurística.
    expect(limites.perfilesPorOperacion.ASISTENTE_INCIDENCIAS_INQUILINO).toEqual(['INQUILINO', 'ADMINISTRADOR']);
    expect(limites.perfilesPorOperacion.ANALIZAR_INSPECCION).toEqual(['PROFESIONAL', 'ADMINISTRADOR']);
  });

  it('con la plantilla del repositorio los límites son finitos y coherentes con la tabla declarada', () => {
    const limites = limitesGastoIA(plantilla(), 25);
    expect(limites.operacionesPorDiaPorUsuario).toBe(CUOTAS_IA_REFERENCIA.operacionesPorDia);
    expect(limites.operacionesPorMesPorUsuario).toBe(CUOTAS_IA_REFERENCIA.operacionesPorMes);
    expect(limites.creditosPorOperacionMasCara).toBe(Math.max(...(Object.values(TARIFAS_IA_REFERENCIA) as number[])));
    expect(limites.creditosMesSistema).toBe(limites.operacionesMesSistema * limites.creditosPorOperacionMasCara);
    expect(Number.isFinite(limites.creditosMesSistema)).toBe(true);
    expect(Object.keys(limites.perfilesPorOperacion)).toHaveLength(OPERACIONES_IA.length);
    expect(OPERACIONES_IA.every(({ id }) => limites.perfilesPorOperacion[id].length > 0)).toBe(true);
  });
});

describe('IA Fase 8 · proveedor simulado y bloqueo del real', () => {
  it('el simulador no usa SDK, ni clave, ni red: el módulo no importa el SDK ni llama a fetch', () => {
    expect(FUENTE_VALIDACION).not.toMatch(/@google\/genai|googleapis|node-fetch/);
    expect(FUENTE_VALIDACION).not.toMatch(/crearClienteGemini/);
    expect(FUENTE_VALIDACION).toMatch(/proveedorRealBloqueado/);
    // El único `fetch` del módulo es contra el servidor LOCAL del sandbox (0.0.0.0/127.0.0.1),
    // nunca contra un host externo.
    expect(FUENTE_VALIDACION).not.toMatch(/fetch\(\s*['"`]https?:/);
    const destinos = [...FUENTE_VALIDACION.matchAll(/fetch\(\s*`?([^`'"]*)/g)].map((m) => m[1].trim());
    expect(destinos.length).toBeGreaterThan(0);
    expect(destinos.filter((d) => d.startsWith('http')).length).toBe(0);
    expect(FUENTE_VALIDACION).toMatch(/app\.listen\(0, '127\.0\.0\.1'\)/);
  });

  it('registra la operación de cada llamada y permite simular fallos por operación', async () => {
    const { cliente, llamadas, fallosRestantes } = proveedorSimulado({ fallos: { ANALIZAR_INSPECCION: 1 } });
    // El primer intento de esa operación falla…
    await expect(cliente.models.generateContent({ operacion: 'ANALIZAR_INSPECCION' })).rejects.toThrow(/UNAVAILABLE/);
    // …y el segundo responde: el fallo es SIMULADO, no del proveedor real.
    await expect(cliente.models.generateContent({ operacion: 'ANALIZAR_INSPECCION' })).resolves.toBeDefined();
    expect(llamadas).toEqual(['ANALIZAR_INSPECCION', 'ANALIZAR_INSPECCION']);
    expect(fallosRestantes.ANALIZAR_INSPECCION).toBe(0);
    // Otra operación no se ve afectada por el fallo de una: no hay estado global.
    await expect(cliente.models.generateContent({ operacion: 'REDACTAR_CLAUSULA' })).resolves.toBeDefined();
  });

  it('la ruta del proveedor real está bloqueada y explica QUÉ falta para autorizarla', () => {
    expect(() => proveedorRealBloqueado()).toThrow(/autorización expresa/i);
    expect(() => proveedorRealBloqueado()).toThrow(/presupuesto|cuotas de API/i);
    expect(() => proveedorRealBloqueado()).toThrow(/NO productivo/i);
  });
});

describe('IA Fase 8 · sandbox de las doce operaciones con cuenta de prueba', () => {
  it('ADMINISTRADOR: 12 operaciones permitidas, proveedor simulado y consumo igual a la suma de tarifas', async () => {
    const informe = await ejecutarSandboxIA({ politica: plantilla(), perfil: 'ADMINISTRADOR', uidPrueba: 'uid-prueba-admin' });
    expect(informe.filas).toHaveLength(12);
    expect(informe.filas.every((f) => f.codigoHttp === 200)).toBe(true);
    expect(informe.filas.every((f) => f.motor === 'gemini-simulado')).toBe(true);
    expect(informe.consumo.llamadasProveedor).toBe(12);
    const esperado = OPERACIONES_IA.reduce((total, { id }) => total + TARIFAS_IA_REFERENCIA[id], 0);
    expect(informe.consumo.creditosConsumidos).toBe(esperado);
    expect(informe.consumo.creditosReembolsados).toBe(0);
    expect(informe.consumo.operaciones).toBe(12);
    // El registro de consumo lleva sólo la lista blanca y ninguna credencial.
    for (const registro of informe.registros) {
      for (const clave of Object.keys(registro)) expect(CAMPOS_REGISTRO_IA).toContain(clave);
    }
    expect(JSON.stringify(informe.registros)).not.toMatch(/prompt|Bearer|example\.com|MY_GEMINI/);
  });

  it('INQUILINO: sólo sus dos operaciones; el resto 403 sin abrir operación ni llamar al proveedor', async () => {
    const informe = await ejecutarSandboxIA({ politica: plantilla(), perfil: 'INQUILINO', uidPrueba: 'uid-prueba-inquilino' });
    const permitidas = informe.filas.filter((f) => f.codigoHttp === 200).map((f) => f.operacion);
    expect(permitidas.sort()).toEqual(['ASISTENTE_INCIDENCIAS_INQUILINO', 'ASISTENTE_INTERPRETAR'].sort());
    const denegadas = informe.filas.filter((f) => !f.permitida);
    expect(denegadas).toHaveLength(10);
    expect(denegadas.every((f) => f.codigo === 'OPERACION_NO_PERMITIDA' && f.codigoHttp === 403)).toBe(true);
    expect(denegadas.every((f) => f.costeCreditos === 0 && f.llamadasProveedor === 0)).toBe(true);
    expect(informe.consumo.llamadasProveedor).toBe(2);
    expect(informe.consumo.creditosConsumidos).toBe(TARIFAS_IA_REFERENCIA.ASISTENTE_INTERPRETAR + TARIFAS_IA_REFERENCIA.ASISTENTE_INCIDENCIAS_INQUILINO);
    expect(informe.eventos.filter((e) => e.evento === 'RECHAZADA')).toHaveLength(10);
  });

  it('un fallo simulado del proveedor se ensaya hasta el final: respaldo determinista y reembolso íntegro', async () => {
    const informe = await ejecutarSandboxIA({
      politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: { ASISTENTE_INCIDENCIAS_INQUILINO: 4 } }),
      perfil: 'INQUILINO',
      uidPrueba: 'uid-prueba-fallos',
      proveedor: proveedorSimulado({ fallos: { ASISTENTE_INCIDENCIAS_INQUILINO: 9 } }).cliente,
    });
    const fila = informe.filas.find((f) => f.operacion === 'ASISTENTE_INCIDENCIAS_INQUILINO');
    expect(fila).toMatchObject({ codigoHttp: 200, motor: 'respaldo', creditosReembolsados: 4 });
    // Sólo se reembolsa la operación que falló; la otra permitida al inquilino sí consume su tarifa.
    expect(informe.consumo.creditosReembolsados).toBe(4);
    expect(informe.consumo.creditosConsumidos).toBe(TARIFAS_IA_REFERENCIA.ASISTENTE_INTERPRETAR);
    const registros = informe.registros.filter((r) => r.operacion === 'ASISTENTE_INCIDENCIAS_INQUILINO');
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ origenRespuesta: 'RESPALDO', costeCreditos: 4, creditosReembolsados: 4 });
  });

  it('el sandbox es de UNA sola cuenta y con saldo acotado (nada compartido entre perfiles)', async () => {
    const informe = await ejecutarSandboxIA({ politica: plantilla(), perfil: 'PROPIETARIO', uidPrueba: 'uid-prueba-prop', creditoInicial: 3 });
    const permitidas = informe.filas.filter((f) => f.permitida);
    expect(permitidas).toHaveLength(5); // las 5 del propietario en la plantilla
    // Cada fila registra su propio uid: no hay escrituras cruzadas.
    for (const registro of informe.registros) expect(registro.uid).toBe('uid-prueba-prop');
  });

  it('el sandbox no añade rutas ni dependencias al servidor HTTP de la aplicación', () => {
    expect(SERVER).not.toMatch(/validacionEntornoIA/);
    expect(SERVER).not.toMatch(/ejecutarSandboxIA|proveedorSimulado/);
    // Y el catálogo de rutas no cambia con esta fase (12 operaciones, ninguna nueva).
    expect(OPERACIONES_IA).toHaveLength(12);
    expect(OPERACIONES_IA.map((o) => o.ruta)).not.toContain('/api/ia/validar');
  });
});
