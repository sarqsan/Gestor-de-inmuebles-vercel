/**
 * IA · FASE 9 — LLAVES DE USUARIO (Vía 2: clave propia de cada usuario)
 * ======================================================================
 * Sin red, sin Firebase y sin proveedor real. Comprueba, contra el diseño
 * (`docs/IA-FASE-9-LLAVES-DE-USUARIO-DISENO-Y-DECISIONES.md` §4 y §11):
 *
 *   · contrato puro: validación de FORMA de la clave, sufijo, DTO sin secretos;
 *   · cifrado en reposo: ida y vuelta, AAD = uid, clave maestra inválida, huella;
 *   · servicio (memoria y Firestore simulado con CAS): alta, SIN_CAMBIOS,
 *     sustitución, revocación, idempotencia por evento, resolución interna;
 *   · rutas HTTP: guardias (503/401/403), alta/revocación/verificación con
 *     Idempotency-Key, 422 por formato, 409 por duplicado, 404 sin llave;
 *   · núcleo: el cliente del proveedor nace de la llave del USUARIO (nunca de
 *     GEMINI_API_KEY), respaldo o 428 sin llave, cabecera X-IA-Llave-Usuario,
 *     fallo cerrado con clave maestra inválida, estado en /api/health;
 *   · composición (`configuracionIA`) y guardias estáticas (server.ts monta las
 *     rutas; la llave jamás se interpola en logs).
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CABECERA_LLAVE_USUARIO_IA,
  MARCADOR_LLAVE_GEMINI,
  RUTA_LLAVE_USUARIO_IA,
  RUTA_VERIFICAR_LLAVE_USUARIO_IA,
  llaveActiva,
  modoSinLlaveDesdeEntorno,
  modoVerificacionDesdeEntorno,
  resumenLlaveAusente,
  validarFormatoLlaveProveedorIA,
} from '../src/ia/llavesUsuarioContrato';
import { resumenAltaGuiadaLlave, TUTORIAL_LLAVE_USUARIO_IA } from '../src/ia/tutorialLlaveUsuarioIA';
import {
  cifrarLlaveUsuario,
  descifrarLlaveUsuario,
  generarClaveMaestraLlaves,
  huellaLlaveUsuario,
  resolverClaveMaestraLlaves,
} from '../server/ia/cifradoLlavesIA';
import {
  COLECCION_EVENTOS_LLAVES_IA,
  COLECCION_LLAVES_IA,
  crearServicioLlavesFirestore,
  crearServicioLlavesMemoria,
  idEventoLlaveIA,
  type PuertoLlavesFirestoreIA,
  type ServicioLlavesIA,
} from '../server/ia/llavesUsuarioIA';
import { montarRutasLlavesIA, type EventoLlavesIA, type VerificadorLlaveIA } from '../server/ia/rutasLlavesIA';
import { clienteIA, crearNucleoIA, type ClienteProveedorIA, type ContextoProveedorIA, type EventoNucleoIA } from '../server/ia/nucleoIA';
import { crearRegistroMemoria } from '../server/ia/registroOperacionesIA';
import { crearGobiernoMemoria } from '../server/ia/gobiernoIA';
import { crearDependenciasNucleoIA } from '../server/ia/configuracionIA';
import { CABECERA_IDEMPOTENCIA_IA } from '../src/ia/catalogoOperacionesIA';
import { construirPoliticaIACompleta, OPERACIONES_IA_IDS } from '../src/ia/gobiernoIAContrato';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';

const RAIZ = resolve(__dirname, '..');
const AHORA = new Date('2026-10-16T10:00:00.000Z');
const LLAVE_ANA = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'; // 39 caracteres, forma válida
const LLAVE_LUIS = 'AIzaSyZ9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J';
const CLAVE_MAESTRA_B64 = generarClaveMaestraLlaves();
const claveMaestra = () => {
  const r = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: CLAVE_MAESTRA_B64 });
  if (r.estado !== 'VALIDA') throw new Error('clave maestra de prueba inválida');
  return r.clave;
};

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-ana': { uid: 'uid-ana' },
  'token-luis': { uid: 'uid-luis' },
  'token-inactivo': { uid: 'uid-inactivo' },
};

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
});

function gobiernoDePrueba() {
  const politica = construirPoliticaIACompleta({
    permisos: { PROPIETARIO: OPERACIONES_IA_IDS, PROFESIONAL: OPERACIONES_IA_IDS, INQUILINO: OPERACIONES_IA_IDS, ADMINISTRADOR: OPERACIONES_IA_IDS },
    costeCreditosPorOperacion: Object.fromEntries(OPERACIONES_IA_IDS.map((id) => [id, 0])),
  });
  const registro = crearRegistroMemoria();
  const gobierno = crearGobiernoMemoria(politica, { listarOperaciones: () => registro.listar() });
  const fijar = (uid: string, estado = 'ACTIVO') =>
    gobierno.fijarPerfil(uid, { usuarioId: `usuario-${uid}`, tipoPerfil: 'PROPIETARIO', estado }, { authUid: uid, tipoPerfil: 'PROPIETARIO', estado });
  fijar('uid-ana');
  fijar('uid-luis');
  fijar('uid-inactivo', 'BAJA');
  return { politica, registro, gobierno };
}

async function escuchar(app: express.Express): Promise<string> {
  const servidor = app.listen(0, '127.0.0.1');
  servidores.push(servidor);
  await once(servidor, 'listening');
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}

const LLAVE_AQ = 'AQ.' + 'aB9_-'.repeat(20); // token sintético, sin credencial real

// ---------------------------------------------------------------------------
describe('IA Fase 9 · contrato puro (forma de la clave y DTO sin secretos)', () => {
  it('acepta una clave con la forma de Google AI Studio y devuelve sólo el sufijo', () => {
    const r = validarFormatoLlaveProveedorIA(`  "${LLAVE_ANA}"\n`);
    expect(r).toEqual({ estado: 'VALIDA', valor: LLAVE_ANA, sufijo: LLAVE_ANA.slice(-4) });
  });

  it.each([32, 64, 103, 197])('acepta AQ. con cuerpo base64url variable (%i), sin atribuir validez del proveedor', (longitud) => {
    const valor = 'AQ.' + 'a'.repeat(longitud - 4) + 'B9_-';
    expect(validarFormatoLlaveProveedorIA(` "${valor}" `)).toEqual({ estado: 'VALIDA', valor, sufijo: 'B9_-' });
  });

  it.each([
    ['AQ.', 'LONGITUD'], ['AQ.corta', 'LONGITUD'],
    ['AQ.' + 'a'.repeat(31), 'LONGITUD'], ['AQ.' + 'a'.repeat(198), 'LONGITUD'],
    ['AQ.' + 'a'.repeat(32) + '!', 'CARACTERES'],
    ['AQ.' + 'a'.repeat(32) + '.abc', 'CARACTERES'],
    ['AQ.' + 'a'.repeat(32) + ' x', 'CARACTERES'],
    ['AQ.' + 'a'.repeat(32) + '\nx', 'CARACTERES'],
    ['AQ.' + 'a'.repeat(32) + 'é', 'CARACTERES'],
    ['AQ.' + 'a'.repeat(32) + '/=', 'CARACTERES'],
    ['aq.' + 'a'.repeat(40), 'PREFIJO'],
  ])('rechaza AQ. malformada (%#) sin revelar el valor', (valor, codigo) => {
    const r = validarFormatoLlaveProveedorIA(valor);
    expect(r).toMatchObject({ estado: 'INVALIDA', codigo });
    if (r.estado === 'INVALIDA' && valor.length > 3) expect(r.mensaje).not.toContain(valor);
  });

  it('rechaza con código accionable: vacía, marcador, prefijo, longitud y caracteres', () => {
    const casos: Array<[unknown, string]> = [
      ['', 'VACIA'],
      [undefined, 'VACIA'],
      [MARCADOR_LLAVE_GEMINI, 'MARCADOR_DE_POSICION'],
      ['sk-1234567890123456789012345678901234567', 'PREFIJO'],
      ['AIzaCorta', 'LONGITUD'],
      [`${LLAVE_ANA}X`, 'LONGITUD'],
      [LLAVE_ANA.slice(0, -1) + '!', 'CARACTERES'],
    ];
    for (const [entrada, codigo] of casos) {
      const r = validarFormatoLlaveProveedorIA(entrada);
      expect(r.estado, String(entrada)).toBe('INVALIDA');
      if (r.estado === 'INVALIDA') {
        expect(r.codigo).toBe(codigo);
        expect(r.mensaje).not.toContain(LLAVE_ANA);
      }
    }
  });

  it('el resumen ausente no lleva nada identificable y sólo REGISTRADA/VERIFICADA cuentan como activa', () => {
    const ausente = resumenLlaveAusente();
    expect(ausente).toMatchObject({ estado: 'AUSENTE', sufijo: null, registradaEn: null, proveedor: 'GEMINI' });
    expect(llaveActiva({ estado: 'AUSENTE' })).toBe(false);
    expect(llaveActiva({ estado: 'REVOCADA' })).toBe(false);
    expect(llaveActiva({ estado: 'REGISTRADA' })).toBe(true);
    expect(llaveActiva({ estado: 'VERIFICADA' })).toBe(true);
  });

  it('los modos del entorno son conservadores por defecto', () => {
    expect(modoSinLlaveDesdeEntorno({})).toBe('RESPALDO');
    expect(modoSinLlaveDesdeEntorno({ IA_LLAVES_SIN_LLAVE: 'exigir' })).toBe('EXIGIR');
    expect(modoSinLlaveDesdeEntorno({ IA_LLAVES_SIN_LLAVE: 'lo-que-sea' })).toBe('RESPALDO');
    expect(modoVerificacionDesdeEntorno({})).toBe('DESACTIVADA');
    expect(modoVerificacionDesdeEntorno({ IA_LLAVES_VERIFICACION: 'PROVEEDOR' })).toBe('PROVEEDOR');
  });

  it('el alta guiada tiene los 7 pasos de §11.2 con el enlace oficial y sin claves', () => {
    const pasos = resumenAltaGuiadaLlave();
    expect(pasos.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pasos.find((p) => p.clave === 'CREAR_EN_AI_STUDIO')?.enlace).toBe('https://aistudio.google.com/app/apikey');
    expect(JSON.stringify(TUTORIAL_LLAVE_USUARIO_IA)).not.toMatch(/AIza[0-9A-Za-z_-]{35}/);
  });
});

// ---------------------------------------------------------------------------
describe('IA Fase 9 · cifrado en reposo', () => {
  it('la clave maestra se valida estrictamente (32 bytes en base64) y nunca se imprime', () => {
    expect(resolverClaveMaestraLlaves({})).toEqual({ estado: 'AUSENTE' });
    expect(resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: '   ' })).toEqual({ estado: 'AUSENTE' });
    const corta = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: Buffer.alloc(16, 1).toString('base64') });
    expect(corta.estado).toBe('INVALIDA');
    const rara = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: 'no es base64 ***' });
    expect(rara.estado).toBe('INVALIDA');
    if (rara.estado === 'INVALIDA') expect(rara.error).not.toContain('***');
    const valida = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: CLAVE_MAESTRA_B64 });
    expect(valida.estado).toBe('VALIDA');
    // base64url también se admite
    const url = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: CLAVE_MAESTRA_B64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') });
    expect(url.estado).toBe('VALIDA');
  });

  it('cifra y descifra con AAD = uid: otro uid, otra clave maestra o un byte cambiado no descifran', () => {
    const maestra = claveMaestra();
    const cifrado = cifrarLlaveUsuario(LLAVE_ANA, maestra, 'uid-ana');
    expect(cifrado.algoritmo).toBe('AES-256-GCM');
    expect(JSON.stringify(cifrado)).not.toContain(LLAVE_ANA);
    expect(descifrarLlaveUsuario(cifrado, maestra, 'uid-ana')).toBe(LLAVE_ANA);
    expect(descifrarLlaveUsuario(cifrado, maestra, 'uid-luis')).toBeNull();
    const otra = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: generarClaveMaestraLlaves() });
    if (otra.estado === 'VALIDA') expect(descifrarLlaveUsuario(cifrado, otra.clave, 'uid-ana')).toBeNull();
    const datos = Buffer.from(cifrado.datos, 'base64');
    datos[0] ^= 0xff;
    expect(descifrarLlaveUsuario({ ...cifrado, datos: datos.toString('base64') }, maestra, 'uid-ana')).toBeNull();
    // IV distinto en cada cifrado: dos criptogramas de la misma llave no coinciden.
    expect(cifrarLlaveUsuario(LLAVE_ANA, maestra, 'uid-ana').datos).not.toBe(cifrado.datos);
  });

  it('la huella es HMAC con la clave maestra (misma llave ⇒ misma huella; distinta maestra ⇒ distinta)', () => {
    const maestra = claveMaestra();
    expect(huellaLlaveUsuario(LLAVE_ANA, maestra)).toBe(huellaLlaveUsuario(LLAVE_ANA, maestra));
    expect(huellaLlaveUsuario(LLAVE_ANA, maestra)).not.toBe(huellaLlaveUsuario(LLAVE_LUIS, maestra));
    const otra = resolverClaveMaestraLlaves({ IA_LLAVES_CLAVE_MAESTRA: generarClaveMaestraLlaves() });
    if (otra.estado === 'VALIDA') expect(huellaLlaveUsuario(LLAVE_ANA, otra.clave)).not.toBe(huellaLlaveUsuario(LLAVE_ANA, maestra));
  });
});

// ---------------------------------------------------------------------------
/** Mini-Firestore con updateTime monotónico y CAS (misma semántica que el REST real). */
function puertoSimulado() {
  const documentos = new Map<string, { datos: Record<string, unknown>; updateTime: string }>();
  let reloj = 0;
  const nuevaVersion = () => `2026-10-16T10:00:00.${String(++reloj).padStart(6, '0')}Z`;
  const puerto: PuertoLlavesFirestoreIA & { documentos: typeof documentos; fallarLecturas: boolean } = {
    documentos,
    fallarLecturas: false,
    async leerDocumento(ruta) {
      if (puerto.fallarLecturas) throw new Error('Firestore unavailable');
      const d = documentos.get(ruta);
      return d ? { datos: structuredClone(d.datos), updateTime: d.updateTime } : null;
    },
    async crearDocumento(coleccion, id, datos) {
      const ruta = `${coleccion}/${id}`;
      if (documentos.has(ruta)) return 'YA_EXISTE';
      documentos.set(ruta, { datos: structuredClone(datos), updateTime: nuevaVersion() });
      return 'CREADO';
    },
    async actualizarCamposSiVersion(coleccion, id, datos, esperado) {
      const ruta = `${coleccion}/${id}`;
      const actual = documentos.get(ruta);
      if (!actual || actual.updateTime !== esperado) return false;
      documentos.set(ruta, { datos: { ...actual.datos, ...structuredClone(datos) }, updateTime: nuevaVersion() });
      return true;
    },
  };
  return puerto;
}

function pruebasServicio(nombre: string, crear: () => { servicio: ServicioLlavesIA; documentos: () => Map<string, Record<string, unknown>>; eventos: () => Map<string, Record<string, unknown>> }) {
  describe(`IA Fase 9 · servicio de llaves (${nombre})`, () => {
    it.each([LLAVE_ANA, LLAVE_AQ])('alta: valida forma, cifra, no expone el valor y deja evento ALTA (%#)', async (llave) => {
      const { servicio, documentos, eventos } = crear();
      expect(await servicio.resumen('uid-ana')).toMatchObject({ estado: 'AUSENTE' });
      const r = await servicio.registrar({ uid: 'uid-ana', valor: ` ${llave} `, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
      expect(r.estado).toBe('REGISTRADA');
      if (r.estado === 'REGISTRADA') {
        expect(r.sustitucion).toBe(false);
        expect(r.resumen).toMatchObject({ estado: 'REGISTRADA', sufijo: llave.slice(-4), registradaEn: AHORA.toISOString(), sustituciones: 0 });
        expect(JSON.stringify(r.resumen)).not.toContain(llave);
      }
      const doc = documentos().get('uid-ana');
      expect(doc).toBeDefined();
      expect(JSON.stringify(doc)).not.toContain(llave);
      expect(doc).toMatchObject({ version: 1, estado: 'REGISTRADA', proveedor: 'GEMINI' });
      const evento = eventos().get(idEventoLlaveIA('uid-ana', 'alta-ana-0001'));
      expect(evento).toMatchObject({ uid: 'uid-ana', tipo: 'ALTA', sufijo: llave.slice(-4) });
      expect(JSON.stringify(evento)).not.toContain(llave);
    });

    it('formato inválido no escribe nada; misma llave ⇒ SIN_CAMBIOS; misma Idempotency-Key ⇒ DUPLICADA', async () => {
      const { servicio, documentos, eventos } = crear();
      const mal = await servicio.registrar({ uid: 'uid-ana', valor: 'AIzaCorta', claveIdempotencia: 'alta-mal-0001', ahora: AHORA });
      expect(mal).toMatchObject({ estado: 'FORMATO_INVALIDO', codigo: 'LONGITUD' });
      expect(documentos().size).toBe(0);
      expect(eventos().size).toBe(0);
      await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
      const repetida = await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0002', ahora: AHORA });
      expect(repetida.estado).toBe('SIN_CAMBIOS');
      expect(eventos().size).toBe(1);
      const duplicada = await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_LUIS, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
      expect(duplicada).toEqual({ estado: 'DUPLICADA' });
      expect((await servicio.resumen('uid-ana')).sufijo).toBe(LLAVE_ANA.slice(-4));
    });

    it('sustitución cuenta, revocación borra el criptograma y conserva el historial; resolución interna sólo con llave activa', async () => {
      const { servicio, documentos, eventos } = crear();
      await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
      expect(await servicio.resolverParaOperacion('uid-ana')).toEqual({ estado: 'DISPONIBLE', valor: LLAVE_ANA, sufijo: LLAVE_ANA.slice(-4) });
      const sust = await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_LUIS, claveIdempotencia: 'alta-ana-0003', ahora: new Date(AHORA.getTime() + 1000) });
      expect(sust).toMatchObject({ estado: 'REGISTRADA', sustitucion: true });
      if (sust.estado === 'REGISTRADA') expect(sust.resumen.sustituciones).toBe(1);
      expect(await servicio.resolverParaOperacion('uid-ana')).toMatchObject({ estado: 'DISPONIBLE', valor: LLAVE_LUIS });
      expect(eventos().get(idEventoLlaveIA('uid-ana', 'alta-ana-0003'))).toMatchObject({ tipo: 'SUSTITUCION' });

      const rev = await servicio.revocar({ uid: 'uid-ana', claveIdempotencia: 'rev-ana-0001', ahora: new Date(AHORA.getTime() + 2000) });
      expect(rev.estado).toBe('REVOCADA');
      if (rev.estado === 'REVOCADA') expect(rev.resumen).toMatchObject({ estado: 'REVOCADA', sufijo: null, revocadaEn: new Date(AHORA.getTime() + 2000).toISOString(), sustituciones: 1 });
      const doc = documentos().get('uid-ana');
      expect(doc?.cifrado).toBeNull();
      expect(doc?.huella).toBeNull();
      expect(doc?.estado).toBe('REVOCADA');
      expect(await servicio.resolverParaOperacion('uid-ana')).toEqual({ estado: 'AUSENTE' });
      expect(await servicio.revocar({ uid: 'uid-ana', claveIdempotencia: 'rev-ana-0002', ahora: AHORA })).toEqual({ estado: 'SIN_LLAVE' });
      expect(await servicio.revocar({ uid: 'uid-ana', claveIdempotencia: 'rev-ana-0001', ahora: AHORA })).toEqual({ estado: 'SIN_LLAVE' });
      // Tras revocar se puede volver a dar de alta: es un ALTA (no sustitución) y mantiene el contador.
      const re = await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0004', ahora: AHORA });
      expect(re).toMatchObject({ estado: 'REGISTRADA', sustitucion: false });
      expect(eventos().get(idEventoLlaveIA('uid-ana', 'alta-ana-0004'))).toMatchObject({ tipo: 'ALTA' });
    });

    it('la verificación marca VERIFICADA (OK) o deja REGISTRADA con última comprobación FALLIDA', async () => {
      const { servicio } = crear();
      expect(await servicio.marcarVerificacion({ uid: 'uid-ana', resultado: 'OK', claveIdempotencia: 'ver-0001', ahora: AHORA })).toEqual({ estado: 'SIN_LLAVE' });
      await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
      const fallida = await servicio.marcarVerificacion({ uid: 'uid-ana', resultado: 'FALLIDA', claveIdempotencia: 'ver-0001', ahora: AHORA });
      expect(fallida).toMatchObject({ estado: 'MARCADA', resumen: { estado: 'REGISTRADA', ultimaVerificacion: 'FALLIDA', verificadaEn: null } });
      const ok = await servicio.marcarVerificacion({ uid: 'uid-ana', resultado: 'OK', claveIdempotencia: 'ver-0002', ahora: AHORA });
      expect(ok).toMatchObject({ estado: 'MARCADA', resumen: { estado: 'VERIFICADA', ultimaVerificacion: 'OK', verificadaEn: AHORA.toISOString() } });
      expect(await servicio.marcarVerificacion({ uid: 'uid-ana', resultado: 'OK', claveIdempotencia: 'ver-0002', ahora: AHORA })).toEqual({ estado: 'DUPLICADA' });
      expect(await servicio.resolverParaOperacion('uid-ana')).toMatchObject({ estado: 'DISPONIBLE' });
    });

    it('aislamiento por usuario: la llave de Ana no se resuelve para Luis', async () => {
      const { servicio } = crear();
      await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
      expect(await servicio.resolverParaOperacion('uid-luis')).toEqual({ estado: 'AUSENTE' });
      expect(await servicio.resumen('uid-luis')).toMatchObject({ estado: 'AUSENTE' });
    });
  });
}

pruebasServicio('memoria', () => {
  const servicio = crearServicioLlavesMemoria(claveMaestra());
  return { servicio, documentos: () => servicio.documentos(), eventos: () => servicio.eventos() };
});

pruebasServicio('Firestore simulado', () => {
  const puerto = puertoSimulado();
  const servicio = crearServicioLlavesFirestore(puerto, claveMaestra());
  const filtrar = (coleccion: string) =>
    new Map([...puerto.documentos].filter(([ruta]) => ruta.startsWith(`${coleccion}/`)).map(([ruta, d]) => [ruta.slice(coleccion.length + 1), d.datos]));
  return { servicio, documentos: () => filtrar(COLECCION_LLAVES_IA), eventos: () => filtrar(COLECCION_EVENTOS_LLAVES_IA) };
});

describe('IA Fase 9 · servicio Firestore: CAS y criptograma ajeno', () => {
  it('si otro escritor gana la carrera, relee y reintenta; un criptograma de otro uid se trata como AUSENTE', async () => {
    const puerto = puertoSimulado();
    const servicio = crearServicioLlavesFirestore(puerto, claveMaestra());
    await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana-0001', ahora: AHORA });
    // Carrera: la primera escritura condicional pierde (versión cambiada), la segunda gana.
    const original = puerto.actualizarCamposSiVersion.bind(puerto);
    let perdidas = 0;
    puerto.actualizarCamposSiVersion = async (c, id, datos, esperado) => {
      if (perdidas === 0) {
        perdidas++;
        const actual = puerto.documentos.get(`${c}/${id}`);
        if (actual) puerto.documentos.set(`${c}/${id}`, { ...actual, updateTime: `${actual.updateTime}-otro` });
        return false;
      }
      return original(c, id, datos, esperado);
    };
    const r = await servicio.registrar({ uid: 'uid-ana', valor: LLAVE_LUIS, claveIdempotencia: 'alta-ana-0002', ahora: AHORA });
    expect(r.estado).toBe('REGISTRADA');
    expect(perdidas).toBe(1);
    expect(await servicio.resolverParaOperacion('uid-ana')).toMatchObject({ estado: 'DISPONIBLE', valor: LLAVE_LUIS });

    // Copiar el documento de Ana al uid de Luis: AAD = uid ⇒ no descifra ⇒ AUSENTE.
    const deAna = puerto.documentos.get(`${COLECCION_LLAVES_IA}/uid-ana`)!;
    puerto.documentos.set(`${COLECCION_LLAVES_IA}/uid-luis`, structuredClone(deAna));
    expect(await servicio.resolverParaOperacion('uid-luis')).toEqual({ estado: 'AUSENTE' });
  });
});

// ---------------------------------------------------------------------------
interface OpcionesMontaje {
  llaves?: ServicioLlavesIA | null;
  errorLlaves?: 'LLAVES_CLAVE_MAESTRA_INVALIDA';
  sinLlave?: 'RESPALDO' | 'EXIGIR';
  verificador?: VerificadorLlaveIA | null;
  conGobierno?: boolean;
  proveedor?: (contexto?: ContextoProveedorIA) => ClienteProveedorIA | null;
}

async function montar(opciones: OpcionesMontaje = {}) {
  const { registro, gobierno } = gobiernoDePrueba();
  const llaves = opciones.llaves === undefined ? crearServicioLlavesMemoria(claveMaestra()) : opciones.llaves;
  const eventos: EventoLlavesIA[] = [];
  const eventosNucleo: EventoNucleoIA[] = [];
  const contextosProveedor: Array<ContextoProveedorIA | undefined> = [];
  const verificarToken = async (token: string) => TOKENS[token] ?? null;
  const app = express();
  app.use(express.json());
  montarRutasLlavesIA(app, {
    verificarToken,
    gobierno: opciones.conGobierno === false ? null : gobierno,
    llaves,
    ...(opciones.errorLlaves ? { errorLlaves: opciones.errorLlaves } : {}),
    sinLlave: opciones.sinLlave ?? 'RESPALDO',
    verificador: opciones.verificador ?? null,
    ahora: () => AHORA,
    log: (e) => eventos.push(e),
  });
  const nucleo = crearNucleoIA({
    verificarToken,
    registro,
    gobierno,
    llaves,
    ...(opciones.errorLlaves ? { errorLlaves: opciones.errorLlaves } : {}),
    ...(opciones.sinLlave ? { sinLlave: opciones.sinLlave } : {}),
    crearClienteProveedor: (contexto) => {
      contextosProveedor.push(contexto);
      if (opciones.proveedor) return opciones.proveedor(contexto);
      if (!contexto?.llaveUsuario) return null;
      return {
        models: {
          async generateContent() {
            return { text: `respuesta-con-${contexto.llaveUsuario}`, usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } };
          },
        },
      };
    },
    log: (e) => eventosNucleo.push(e),
    ahora: () => AHORA,
  });
  app.post('/api/redactar-clausula', nucleo.operacion('REDACTAR_CLAUSULA'), async (_req, res) => {
    const ai = clienteIA(res);
    if (!ai) return res.json({ motor: 'respaldo' });
    const r = await ai.models.generateContent({ model: 'm', contents: 'x' });
    return res.json({ motor: 'proveedor', texto: r.text });
  });
  const base = await escuchar(app);
  const llamar = (ruta: string, init: RequestInit & { token?: string; idem?: string } = {}) =>
    fetch(`${base}${ruta}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.idem ? { [CABECERA_IDEMPOTENCIA_IA]: init.idem } : {}),
        ...((init.headers as Record<string, string>) ?? {}),
      },
    });
  return { app, base, llamar, llaves, registro, gobierno, nucleo, eventos, eventosNucleo, contextosProveedor };
}

describe('IA Fase 9 · rutas HTTP del alta guiada', () => {
  it('sin clave maestra: 503 LLAVES_NO_CONFIGURADAS en todas las rutas (nadie registra llaves)', async () => {
    const m = await montar({ llaves: null });
    for (const [ruta, method] of [[RUTA_LLAVE_USUARIO_IA, 'GET'], [RUTA_LLAVE_USUARIO_IA, 'PUT'], [RUTA_LLAVE_USUARIO_IA, 'DELETE'], [RUTA_VERIFICAR_LLAVE_USUARIO_IA, 'POST']] as const) {
      const r = await m.llamar(ruta, { method, token: 'token-ana', idem: 'clave-0001', body: method === 'GET' ? undefined : JSON.stringify({ llave: LLAVE_ANA }) });
      expect(r.status, `${method} ${ruta}`).toBe(503);
      expect(await r.json()).toMatchObject({ codigo: 'LLAVES_NO_CONFIGURADAS', llaves: 'NO_CONFIGURADO' });
    }
  });

  it('clave maestra inválida: 503 fallo cerrado; sin gobierno: 503; sin token: 401; perfil inactivo: 403', async () => {
    const invalida = await montar({ errorLlaves: 'LLAVES_CLAVE_MAESTRA_INVALIDA' });
    expect((await invalida.llamar(RUTA_LLAVE_USUARIO_IA, { token: 'token-ana' })).status).toBe(503);
    expect(await (await invalida.llamar(RUTA_LLAVE_USUARIO_IA, { token: 'token-ana' })).json()).toMatchObject({ codigo: 'LLAVES_CLAVE_MAESTRA_INVALIDA', llaves: 'CLAVE_MAESTRA_INVALIDA' });
    const sinGobierno = await montar({ conGobierno: false });
    expect(await (await sinGobierno.llamar(RUTA_LLAVE_USUARIO_IA, { token: 'token-ana' })).json()).toMatchObject({ codigo: 'GOBIERNO_NO_DISPONIBLE' });
    const m = await montar();
    expect((await m.llamar(RUTA_LLAVE_USUARIO_IA)).status).toBe(401);
    expect((await m.llamar(RUTA_LLAVE_USUARIO_IA, { token: 'token-falso' })).status).toBe(401);
    const inactivo = await m.llamar(RUTA_LLAVE_USUARIO_IA, { token: 'token-inactivo' });
    expect(inactivo.status).toBe(403);
    expect(await inactivo.json()).toMatchObject({ codigo: 'PERFIL_NO_VALIDO' });
  });

  it('GET devuelve estado del subsistema, resumen SIN secretos y los pasos del alta guiada', async () => {
    const m = await montar();
    const r = await m.llamar(RUTA_LLAVE_USUARIO_IA, { token: 'token-ana' });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.llaves).toEqual({ modo: 'USUARIO', sinLlave: 'RESPALDO', verificacion: 'DESACTIVADA' });
    expect(cuerpo.llave).toMatchObject({ estado: 'AUSENTE', sufijo: null });
    expect(cuerpo.altaGuiada).toHaveLength(7);
  });

  it('PUT: exige Idempotency-Key, valida cuerpo y forma (422), registra (200), SIN_CAMBIOS, 409 al repetir la clave; nunca devuelve la llave', async () => {
    const m = await montar();
    const sinIdem = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', body: JSON.stringify({ llave: LLAVE_ANA }) });
    expect(sinIdem.status).toBe(400);
    expect(await sinIdem.json()).toMatchObject({ codigo: 'IDEMPOTENCIA_REQUERIDA' });
    const cuerpoMal = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0000', body: JSON.stringify({ llave: 42 }) });
    expect(cuerpoMal.status).toBe(422);
    expect(await cuerpoMal.json()).toMatchObject({ codigo: 'CUERPO_INVALIDO' });
    const forma = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0001', body: JSON.stringify({ llave: 'sk-no-es-de-google' }) });
    expect(forma.status).toBe(422);
    expect(await forma.json()).toMatchObject({ codigo: 'LLAVE_FORMATO_INVALIDO', detalle: 'PREFIJO' });
    // La clave de idempotencia de un intento con formato inválido NO se gasta.
    const alta = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0001', body: JSON.stringify({ llave: LLAVE_ANA }) });
    expect(alta.status).toBe(200);
    const cuerpoAlta = await alta.json();
    expect(cuerpoAlta).toMatchObject({ estado: 'REGISTRADA', llave: { estado: 'REGISTRADA', sufijo: LLAVE_ANA.slice(-4) } });
    expect(JSON.stringify(cuerpoAlta)).not.toContain(LLAVE_ANA);
    const igual = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0002', body: JSON.stringify({ llave: LLAVE_ANA }) });
    expect(await igual.json()).toMatchObject({ estado: 'SIN_CAMBIOS' });
    const repetida = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0001', body: JSON.stringify({ llave: LLAVE_LUIS }) });
    expect(repetida.status).toBe(409);
    expect(await repetida.json()).toMatchObject({ codigo: 'LLAVE_ACCION_DUPLICADA' });
    // Los logs llevan uid y sufijo, nunca la llave.
    expect(m.eventos.some((e) => e.evento === 'LLAVE_ALTA' && e.uid === 'uid-ana' && e.sufijo === LLAVE_ANA.slice(-4))).toBe(true);
    expect(JSON.stringify(m.eventos)).not.toContain(LLAVE_ANA);
  });

  it('PUT acepta AQ., aísla por usuario y no incluye el secreto en respuestas ni logs; rechaza AQ. inválida', async () => {
    const m = await montar();
    const alta = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'aq-alta-0001', body: JSON.stringify({ llave: LLAVE_AQ }) });
    expect(alta.status).toBe(200);
    const cuerpo = await alta.json();
    expect(cuerpo).toMatchObject({ estado: 'REGISTRADA', llave: { sufijo: LLAVE_AQ.slice(-4) } });
    expect(JSON.stringify(cuerpo)).not.toContain(LLAVE_AQ);
    expect(await m.llaves!.resolverParaOperacion('uid-ana')).toMatchObject({ estado: 'DISPONIBLE', valor: LLAVE_AQ });
    expect(await m.llaves!.resumen('uid-luis')).toMatchObject({ estado: 'AUSENTE' });
    for (const [i, llave] of ['AQ.corta', LLAVE_AQ + '!', 'AQ.' + 'a'.repeat(198)].entries()) {
      const r = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: `aq-mal-000${i}`, body: JSON.stringify({ llave }) });
      expect(r.status).toBe(422);
      expect(JSON.stringify(await r.json())).not.toContain(llave);
    }
    expect(JSON.stringify(m.eventos)).not.toContain(LLAVE_AQ);
    expect(JSON.stringify(m.eventosNucleo)).not.toContain(LLAVE_AQ);
  });

  it('DELETE: 404 sin llave, 200 al revocar, 404 al repetir (ya no hay llave activa); verificar: 503 desactivada por defecto', async () => {
    const m = await montar();
    expect((await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'DELETE', token: 'token-ana', idem: 'rev-0001' })).status).toBe(404);
    await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0001', body: JSON.stringify({ llave: LLAVE_ANA }) });
    const verificar = await m.llamar(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', token: 'token-ana', idem: 'ver-0001', body: '{}' });
    expect(verificar.status).toBe(503);
    expect(await verificar.json()).toMatchObject({ codigo: 'VERIFICACION_NO_DISPONIBLE' });
    expect(await m.llaves!.resumen('uid-ana')).toMatchObject({ estado: 'REGISTRADA' }); // sigue utilizable
    const rev = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'DELETE', token: 'token-ana', idem: 'rev-0002' });
    expect(rev.status).toBe(200);
    expect(await rev.json()).toMatchObject({ estado: 'REVOCADA', llave: { estado: 'REVOCADA', sufijo: null } });
    // Repetir la misma clave o usar otra: ya no hay llave activa ⇒ 404 (la revocación es idempotente de facto).
    expect((await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'DELETE', token: 'token-ana', idem: 'rev-0002' })).status).toBe(404);
    expect((await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'DELETE', token: 'token-ana', idem: 'rev-0003' })).status).toBe(404);
    // Pero la clave de idempotencia gastada no sirve para un alta posterior ⇒ 409.
    const reuso = await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'rev-0002', body: JSON.stringify({ llave: LLAVE_ANA }) });
    expect(reuso.status).toBe(409);
  });

  it('verificar con verificador inyectado: OK ⇒ VERIFICADA; RECHAZADA ⇒ 422 y REGISTRADA con FALLIDA; ERROR ⇒ 503 sin marcar', async () => {
    let veredicto: 'OK' | 'RECHAZADA' | 'ERROR' = 'RECHAZADA';
    const recibidas: string[] = [];
    const m = await montar({ verificador: async (valor) => { recibidas.push(valor); return veredicto; } });
    expect((await m.llamar(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', token: 'token-ana', idem: 'ver-0000', body: '{}' })).status).toBe(404);
    await m.llamar(RUTA_LLAVE_USUARIO_IA, { method: 'PUT', token: 'token-ana', idem: 'alta-0001', body: JSON.stringify({ llave: LLAVE_ANA }) });
    const rechazada = await m.llamar(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', token: 'token-ana', idem: 'ver-0001', body: '{}' });
    expect(rechazada.status).toBe(422);
    expect(await rechazada.json()).toMatchObject({ codigo: 'LLAVE_RECHAZADA_POR_PROVEEDOR', llave: { estado: 'REGISTRADA', ultimaVerificacion: 'FALLIDA' } });
    expect(recibidas).toEqual([LLAVE_ANA]); // el verificador recibe la llave real del usuario
    veredicto = 'ERROR';
    const error = await m.llamar(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', token: 'token-ana', idem: 'ver-0002', body: '{}' });
    expect(error.status).toBe(503);
    expect(await m.llaves!.resumen('uid-ana')).toMatchObject({ estado: 'REGISTRADA', ultimaVerificacion: 'FALLIDA' });
    veredicto = 'OK';
    const ok = await m.llamar(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', token: 'token-ana', idem: 'ver-0003', body: '{}' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ estado: 'VERIFICADA', llave: { estado: 'VERIFICADA', ultimaVerificacion: 'OK' } });
    expect((await m.llamar(RUTA_VERIFICAR_LLAVE_USUARIO_IA, { method: 'POST', token: 'token-ana', idem: 'ver-0003', body: '{}' })).status).toBe(409);
    expect(JSON.stringify(m.eventos)).not.toContain(LLAVE_ANA);
  });
});

// ---------------------------------------------------------------------------
describe('IA Fase 9 · núcleo con Vía 2 (la llave del usuario crea el cliente del proveedor)', () => {
  const operar = (m: Awaited<ReturnType<typeof montar>>, token: string, idem: string) =>
    m.llamar('/api/redactar-clausula', { method: 'POST', token, idem, body: JSON.stringify({ texto: 'x' }) });

  it('sin llave (modo RESPALDO): respaldo sin consumo, cabecera ausente y NO se pide el cliente al proveedor', async () => {
    const m = await montar();
    const r = await operar(m, 'token-ana', 'op-00001');
    expect(r.status).toBe(200);
    expect(r.headers.get(CABECERA_LLAVE_USUARIO_IA.toLowerCase())).toBe('ausente');
    expect(await r.json()).toEqual({ motor: 'respaldo' });
    expect(m.contextosProveedor).toEqual([]);
    const registro = m.registro.listar().at(-1)!;
    expect(registro).toMatchObject({ estado: 'COMPLETADA', origenRespuesta: 'RESPALDO', llamadasProveedor: 0 });
  });

  it('con llave: el cliente se crea con ESA llave (y sólo con ella), cabecera activa y registro PROVEEDOR', async () => {
    const m = await montar();
    await m.llaves!.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana', ahora: AHORA });
    const r = await operar(m, 'token-ana', 'op-00002');
    expect(r.status).toBe(200);
    expect(r.headers.get(CABECERA_LLAVE_USUARIO_IA.toLowerCase())).toBe('activa');
    expect(await r.json()).toEqual({ motor: 'proveedor', texto: `respuesta-con-${LLAVE_ANA}` });
    expect(m.contextosProveedor).toEqual([{ uid: 'uid-ana', operacion: 'REDACTAR_CLAUSULA', llaveUsuario: LLAVE_ANA }]);
    expect(m.registro.listar().at(-1)).toMatchObject({ origenRespuesta: 'PROVEEDOR', llamadasProveedor: 1 });
    // El registro no guarda la llave.
    expect(JSON.stringify(m.registro.listar())).not.toContain(LLAVE_ANA);
    // Luis no tiene llave: su operación va a respaldo aunque Ana tenga la suya.
    const rLuis = await operar(m, 'token-luis', 'op-00003');
    expect(rLuis.headers.get(CABECERA_LLAVE_USUARIO_IA.toLowerCase())).toBe('ausente');
    expect(await rLuis.json()).toEqual({ motor: 'respaldo' });
    expect(m.contextosProveedor).toHaveLength(1);
  });

  it('modo EXIGIR: 428 LLAVE_USUARIO_REQUERIDA sin gastar idempotencia, cuota ni saldo; con llave funciona', async () => {
    const m = await montar({ sinLlave: 'EXIGIR' });
    const r = await operar(m, 'token-ana', 'op-00001');
    expect(r.status).toBe(428);
    expect(r.headers.get(CABECERA_LLAVE_USUARIO_IA.toLowerCase())).toBe('ausente');
    expect(await r.json()).toMatchObject({ codigo: 'LLAVE_USUARIO_REQUERIDA', altaGuiada: RUTA_LLAVE_USUARIO_IA });
    expect(m.registro.listar()).toHaveLength(0); // nada reservado
    expect(m.eventosNucleo.at(-1)).toMatchObject({ evento: 'RECHAZADA', codigo: 'LLAVE_USUARIO_REQUERIDA', codigoHttp: 428, uid: 'uid-ana' });
    await m.llaves!.registrar({ uid: 'uid-ana', valor: LLAVE_ANA, claveIdempotencia: 'alta-ana', ahora: AHORA });
    // La misma clave de idempotencia sigue disponible: el 428 no la consumió.
    const ok = await operar(m, 'token-ana', 'op-00001');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ motor: 'proveedor' });
  });

  it('almacén de llaves caído: 503 LLAVES_NO_DISPONIBLES (fallo cerrado, nada se ejecuta)', async () => {
    const puerto = puertoSimulado();
    const llaves = crearServicioLlavesFirestore(puerto, claveMaestra());
    const m = await montar({ llaves });
    puerto.fallarLecturas = true;
    const r = await operar(m, 'token-ana', 'op-00001');
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'LLAVES_NO_DISPONIBLES' });
    expect(m.registro.listar()).toHaveLength(0);
  });

  it('clave maestra inválida: 503 LLAVES_CLAVE_MAESTRA_INVALIDA antes de autenticar; estado lo refleja', async () => {
    const m = await montar({ errorLlaves: 'LLAVES_CLAVE_MAESTRA_INVALIDA' });
    expect(m.nucleo.estado().llaves).toBe('CLAVE_MAESTRA_INVALIDA');
    const r = await m.llamar('/api/redactar-clausula', { method: 'POST', body: '{}' });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: 'LLAVES_CLAVE_MAESTRA_INVALIDA' });
  });

  it('estado del núcleo: USUARIO con servicio, NO_CONFIGURADO sin él (y entonces los deps deciden el cliente, como el sandbox de Fase 8)', async () => {
    const con = await montar();
    expect(con.nucleo.estado().llaves).toBe('USUARIO');
    let pedidos = 0;
    const sin = await montar({ llaves: null, proveedor: () => { pedidos++; return null; } });
    expect(sin.nucleo.estado().llaves).toBe('NO_CONFIGURADO');
    const r = await operar(sin, 'token-ana', 'op-00001');
    expect(r.headers.get(CABECERA_LLAVE_USUARIO_IA.toLowerCase())).toBe('no-configurado');
    expect(await r.json()).toEqual({ motor: 'respaldo' });
    expect(pedidos).toBe(1);
    expect(sin.contextosProveedor[0]).toEqual({ uid: 'uid-ana', operacion: 'REDACTAR_CLAUSULA' });
  });

  it('el permiso se evalúa ANTES que la llave: un perfil sin permiso no dispara lecturas del almacén', async () => {
    const puerto = puertoSimulado();
    const lecturas: string[] = [];
    const original = puerto.leerDocumento.bind(puerto);
    puerto.leerDocumento = async (ruta) => { lecturas.push(ruta); return original(ruta); };
    const llaves = crearServicioLlavesFirestore(puerto, claveMaestra());
    const { registro } = gobiernoDePrueba();
    const politica = construirPoliticaIACompleta({ permisos: { PROPIETARIO: [] } });
    const gobierno = crearGobiernoMemoria(politica, { listarOperaciones: () => registro.listar() });
    gobierno.fijarPerfil('uid-ana', { usuarioId: 'usuario-uid-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, { authUid: 'uid-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
    const nucleo = crearNucleoIA({ verificarToken: async (t) => TOKENS[t] ?? null, registro, gobierno, llaves, crearClienteProveedor: () => null, log: () => {} });
    const app = express();
    app.use(express.json());
    app.post('/api/redactar-clausula', nucleo.operacion('REDACTAR_CLAUSULA'), (_req, res) => res.json({ ok: true }));
    const base = await escuchar(app);
    const r = await fetch(`${base}/api/redactar-clausula`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-ana', [CABECERA_IDEMPOTENCIA_IA]: 'op-perm-00001' }, body: '{}' });
    expect(r.status).toBe(403);
    expect(lecturas.filter((ruta) => ruta.startsWith(`${COLECCION_LLAVES_IA}/`))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('IA Fase 9 · composición del servidor (configuracionIA) y guardias estáticas', () => {
  it('sin IA_LLAVES_CLAVE_MAESTRA: llaves null (NO_CONFIGURADO) y el cliente NUNCA sale de GEMINI_API_KEY', () => {
    const deps = crearDependenciasNucleoIA({ NODE_ENV: 'development', GEMINI_API_KEY: LLAVE_ANA });
    expect(deps.registro?.tipo).toBe('MEMORIA');
    expect(deps.llaves).toBeNull();
    expect(deps.errorLlaves).toBeUndefined();
    expect(deps.sinLlave).toBe('RESPALDO');
    expect(deps.verificacionLlaves).toBe('DESACTIVADA');
    expect(deps.crearClienteProveedor()).toBeNull();
    expect(deps.crearClienteProveedor({ uid: 'u', operacion: 'REDACTAR_CLAUSULA' })).toBeNull();
    expect(crearNucleoIA(deps).estado().llaves).toBe('NO_CONFIGURADO');
  });

  it('con clave maestra válida en desarrollo: servicio en MEMORIA; el cliente nace de la llave del contexto', () => {
    const deps = crearDependenciasNucleoIA({ NODE_ENV: 'development', IA_LLAVES_CLAVE_MAESTRA: CLAVE_MAESTRA_B64, IA_LLAVES_SIN_LLAVE: 'EXIGIR', IA_LLAVES_VERIFICACION: 'PROVEEDOR' });
    expect(deps.llaves?.modo).toBe('MEMORIA');
    expect(deps.sinLlave).toBe('EXIGIR');
    expect(deps.verificacionLlaves).toBe('PROVEEDOR');
    expect(deps.crearClienteProveedor({ uid: 'u', operacion: 'REDACTAR_CLAUSULA' })).toBeNull();
    const cliente = deps.crearClienteProveedor({ uid: 'u', operacion: 'REDACTAR_CLAUSULA', llaveUsuario: LLAVE_ANA });
    expect(cliente).not.toBeNull();
    expect(typeof cliente?.models.generateContent).toBe('function');
    expect(crearNucleoIA(deps).estado().llaves).toBe('USUARIO');
  });

  it('clave maestra inválida: errorLlaves (fallo cerrado) incluso con llave en el contexto', () => {
    const deps = crearDependenciasNucleoIA({ NODE_ENV: 'development', IA_LLAVES_CLAVE_MAESTRA: 'corta' });
    expect(deps.llaves).toBeNull();
    expect(deps.errorLlaves).toBe('LLAVES_CLAVE_MAESTRA_INVALIDA');
    expect(deps.crearClienteProveedor({ uid: 'u', operacion: 'REDACTAR_CLAUSULA', llaveUsuario: LLAVE_ANA })).toBeNull();
    expect(crearNucleoIA(deps).estado().llaves).toBe('CLAVE_MAESTRA_INVALIDA');
  });

  it('en producción sin credencial de servicio no hay servicio de llaves aunque haya clave maestra (sin traza duradera no hay consumo)', () => {
    const deps = crearDependenciasNucleoIA({ VERCEL: '1', IA_LLAVES_CLAVE_MAESTRA: CLAVE_MAESTRA_B64 });
    expect(deps.registro).toBeNull();
    expect(deps.llaves).toBeNull();
    expect(deps.crearClienteProveedor({ uid: 'u', operacion: 'REDACTAR_CLAUSULA', llaveUsuario: LLAVE_ANA })).toBeNull();
  });

  it('server.ts monta las rutas de llaves y pasa el servicio al núcleo; GEMINI_API_KEY ya no alimenta crearClienteProveedor', () => {
    const server = readFileSync(join(RAIZ, 'server.ts'), 'utf8');
    expect(server).toMatch(/montarRutasLlavesIA\(app, \{/);
    expect(server).toMatch(/llaves: dependenciasIA\.llaves/);
    expect(server).toMatch(/verificacionLlaves === 'PROVEEDOR'/);
    const configuracion = readFileSync(join(RAIZ, 'server', 'ia', 'configuracionIA.ts'), 'utf8');
    expect(configuracion).not.toMatch(/crearClienteGemini\(entorno\.GEMINI_API_KEY\)/);
    expect(configuracion).toMatch(/crearClienteGemini\(contexto\.llaveUsuario\)/);
  });

  it('ni el servicio ni las rutas ni el núcleo interpolan el valor de la llave en logs', () => {
    for (const fichero of ['llavesUsuarioIA.ts', 'rutasLlavesIA.ts', 'nucleoIA.ts', 'cifradoLlavesIA.ts']) {
      const fuente = readFileSync(join(RAIZ, 'server', 'ia', fichero), 'utf8');
      expect(fuente, fichero).not.toMatch(/console\.(log|info|warn|error)\([^)]*(valor|llaveUsuario|resolucion\.valor)/);
      expect(fuente, fichero).not.toMatch(/log\(\{[^}]*(valor|llaveUsuario)\b/);
    }
  });

  it('firestore.rules no abre ia_llaves ni ia_llaves_eventos (las cubre el deny-by-default)', () => {
    const reglas = readFileSync(join(RAIZ, 'firestore.rules'), 'utf8');
    expect(reglas).not.toMatch(/ia_llaves/);
    expect(reglas).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});
