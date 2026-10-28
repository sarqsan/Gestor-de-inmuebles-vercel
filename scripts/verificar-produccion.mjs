#!/usr/bin/env node
/**
 * VERIFICACIÓN DE PRODUCCIÓN — solo lectura.
 * ===========================================================================
 * `npm run doctor` es deliberadamente incapaz de consultar producción: rechaza
 * cualquier host `*.vercel.app` o que contenga el projectId real. Eso está bien
 * (una guardia anti-producción es una buena guardia), pero deja un hueco: nadie
 * comprobaba que lo desplegado responde de verdad.
 *
 * Este script cubre ese hueco con un contrato opuesto y explícito:
 *
 *   · SOLO lectura y rechazos garantizados. No hay ninguna petición que pueda
 *     crear, modificar o borrar un documento:
 *       - `GET /api/health`                       (lectura)
 *       - `POST /api/actas/otp/entregar`          → debe ser 410: la ruta está retirada
 *       - `POST /api/actas/otp/solicitar` sin sesión → debe ser 401 antes de escribir
 *       - `POST /api/solicitud` con cuerpo enorme → debe ser 413 antes de parsear
 *     Si alguna de esas rutas respondiera 2xx, el informe lo marca como FALLO:
 *     significaría que producción no tiene el comportamiento esperado.
 *
 *   · No usa secretos. No hay tokens, ni credenciales, ni cookies.
 *
 *   · Verifica el destino de forma estricta (`validarDestinoProduccion`): https
 *     obligatorio, host de Vercel del proyecto, y nunca localhost (un localhost
 *     daría un falso verde sobre el despliegue real).
 *
 * Uso:
 *   node scripts/verificar-produccion.mjs --url https://<deployment>.vercel.app
 *   node scripts/verificar-produccion.mjs --url … --json
 *   node scripts/verificar-produccion.mjs --url … --host-esperado <host>
 *
 * Códigos de salida: 0 todo correcto · 1 algún fallo · 2 uso o destino inválido.
 */
import { pathToFileURL } from 'node:url';

/** Hosts admitidos: despliegues de Vercel. Nunca local, nunca otro dominio. */
const HOST_VERCEL = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i;
const HOST_LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;

/**
 * Valida la URL de producción. Lanza Error con mensaje explícito si el destino
 * no sirve para verificar el despliegue real.
 */
export function validarDestinoProduccion(url, hostEsperado = null) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(`Se exige https para verificar producción (recibido ${u.protocol})`);
  }
  if (HOST_LOCAL.test(u.hostname)) {
    throw new Error(
      `Destino local rechazado (${u.hostname}): verificar el servidor local no dice nada del despliegue real`,
    );
  }
  if (!HOST_VERCEL.test(u.hostname)) {
    throw new Error(`Destino no admitido (${u.hostname}): solo despliegues *.vercel.app del proyecto`);
  }
  if (hostEsperado && u.hostname.toLowerCase() !== String(hostEsperado).toLowerCase()) {
    throw new Error(`El host no es el esperado: recibido ${u.hostname}, esperado ${hostEsperado}`);
  }
  return u;
}

/** Cuerpo mínimo del informe de salud que producción debe cumplir. */
export function evaluarSalud(cuerpo) {
  const fallos = [];
  if (!cuerpo || typeof cuerpo !== 'object') return ['la respuesta no es un objeto JSON'];
  if (cuerpo.status !== 'ok') fallos.push(`status="${cuerpo.status}" (se espera "ok")`);
  if (cuerpo.esquemaDiagnostico !== 1) {
    fallos.push(`esquemaDiagnostico=${JSON.stringify(cuerpo.esquemaDiagnostico)} (se espera 1)`);
  }
  const capacidades = cuerpo.capacidades;
  if (!capacidades || typeof capacidades !== 'object') {
    fallos.push('no hay mapa de `capacidades`: el despliegue no es el bundle esperado');
  } else {
    for (const [nombre, valor] of Object.entries(capacidades)) {
      if (!valor || typeof valor.estado !== 'string') {
        fallos.push(`capacidad "${nombre}" sin estado legible`);
      }
    }
  }
  if (cuerpo.ia && typeof cuerpo.ia === 'object' && cuerpo.ia.autenticacion === undefined) {
    fallos.push('falta `ia.autenticacion`: el servidor no expone el diagnóstico de autenticación');
  }
  return fallos;
}

/** Traduce el resultado de una comprobación a OK/FALLO con su porqué. */
export function evaluarCodigo(nombre, esperado, recibido, cuerpo = null) {
  if (recibido !== esperado) {
    const extra = cuerpo && typeof cuerpo === 'object' && cuerpo.codigo ? ` (codigo=${cuerpo.codigo})` : '';
    return { nombre, estado: 'FALLO', detalle: `HTTP ${recibido}, se esperaba ${esperado}${extra}` };
  }
  return { nombre, estado: 'OK', detalle: `HTTP ${recibido}` };
}

/**
 * Cuerpo grande FRAGMENTADO para forzar el límite de tamaño.
 *
 * Importante: no se puede fijar la cabecera `transfer-encoding` a mano — el
 * `fetch` de Node la rechaza («invalid transfer-encoding header») y la petición
 * ni siquiera sale; ese fue el primer fallo de esta verificación. La forma
 * correcta de enviar realmente fragmentado es pasar un `ReadableStream` como
 * cuerpo (con `duplex: 'half'`), y así lo confirma el servidor: `chunked` sin
 * `content-length`.
 */
export function cuerpoGrande(bytes = 300 * 1024) {
  return JSON.stringify({ relleno: 'x'.repeat(bytes) });
}

/** Convierte el cuerpo en un flujo de `trozos` partes: fuerza `chunked` de verdad. */
export function cuerpoFragmentado(texto, trozos = 8) {
  const datos = new TextEncoder().encode(texto);
  const tamano = Math.ceil(datos.length / trozos);
  return new ReadableStream({
    start(controlador) {
      for (let i = 0; i < datos.length; i += tamano) controlador.enqueue(datos.slice(i, i + tamano));
      controlador.close();
    },
  });
}

async function pedir(url, opciones = {}, timeoutMs = 20000, fetchImpl = fetch) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), timeoutMs);
  try {
    const respuesta = await fetchImpl(url, { ...opciones, signal: control.signal, redirect: 'manual' });
    const texto = typeof respuesta.text === 'function' ? await respuesta.text() : '';
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      json = null;
    }
    return { estado: respuesta.status, json, texto };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Ejecuta el humo completo. Devuelve `{ ok, comprobaciones }`.
 * `fetch` se inyecta para poder probar la lógica sin red.
 */
export async function verificar(base, { fetchImpl = fetch } = {}) {
  const comprobaciones = [];
  const raiz = base.replace(/\/+$/, '');
  const anotar = (nombre, estado, detalle) => comprobaciones.push({ nombre, estado, detalle });

  // 1. Salud: debe responder 200 con el esquema de diagnóstico y el mapa de capacidades.
  let salud = null;
  try {
    const r = await fetchImpl(`${raiz}/api/health`, { headers: { accept: 'application/json' } });
    salud = { estado: r.status, json: typeof r.json === 'function' ? await r.json().catch(() => null) : null };
  } catch (error) {
    anotar('salud', 'FALLO', `sin respuesta: ${String(error.message).split('\n')[0]}`);
  }
  if (salud) {
    const codigo = evaluarCodigo('salud', 200, salud.estado, salud.json);
    if (codigo.estado === 'FALLO') {
      anotar('salud', 'FALLO', codigo.detalle);
    } else {
      const fallos = evaluarSalud(salud.json);
      anotar('salud', fallos.length === 0 ? 'OK' : 'FALLO', fallos.length === 0 ? 'HTTP 200, esquema 1 y capacidades legibles' : fallos.join('; '));
    }
  }

  // 2. Ruta de OTP retirada: el relé de correo con destino libre ya no existe.
  try {
    const r = await pedir(`${raiz}/api/actas/otp/entregar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, 20000, fetchImpl);
    const c = evaluarCodigo('otp-entregar-retirada', 410, r.estado, r.json);
    anotar(c.nombre, c.estado, c.estado === 'OK' ? `${c.detalle} · ruta retirada como debe` : c.detalle);
  } catch (error) {
    anotar('otp-entregar-retirada', 'FALLO', `sin respuesta: ${String(error.message).split('\n')[0]}`);
  }

  // 3. OTP real sin sesión: 401 antes de generar o enviar nada.
  try {
    const r = await pedir(`${raiz}/api/actas/otp/solicitar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }, 20000, fetchImpl);
    const c = evaluarCodigo('otp-solicitar-sin-sesion', 401, r.estado, r.json);
    anotar(c.nombre, c.estado, c.estado === 'OK' ? `${c.detalle} · no se generó ningún OTP` : c.detalle);
  } catch (error) {
    anotar('otp-solicitar-sin-sesion', 'FALLO', `sin respuesta: ${String(error.message).split('\n')[0]}`);
  }

  // 4. Cuerpo fragmentado enorme: 413 antes de parsear. Si devolviera 2xx,
  //    significaría que producción acepta cuerpos sin límite.
  try {
    const r = await pedir(`${raiz}/api/solicitud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // ReadableStream + duplex:'half' ⇒ transferencia fragmentada real, sin
      // fijar `transfer-encoding` (cabecera prohibida por el fetch de Node).
      body: cuerpoFragmentado(cuerpoGrande()),
      duplex: 'half',
    }, 20000, fetchImpl);
    const c = evaluarCodigo('limite-cuerpo-fragmentado', 413, r.estado, r.json);
    anotar(c.nombre, c.estado, c.estado === 'OK' ? `${c.detalle} · rechazado antes de parsear` : c.detalle);
  } catch (error) {
    anotar('limite-cuerpo-fragmentado', 'FALLO', `sin respuesta: ${String(error.message).split('\n')[0]}`);
  }

  return { ok: comprobaciones.every((c) => c.estado === 'OK'), comprobaciones };
}

function leerOpciones(argv) {
  const op = { url: null, json: false, hostEsperado: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') op.url = argv[++i];
    else if (a.startsWith('--url=')) op.url = a.slice(6);
    else if (a === '--json') op.json = true;
    else if (a === '--host-esperado') op.hostEsperado = argv[++i];
    else if (a.startsWith('--host-esperado=')) op.hostEsperado = a.slice(16);
    else if (a === '--help' || a === '-h') op.help = true;
  }
  return op;
}

export async function principal(argv = process.argv.slice(2), salida = console.log) {
  const op = leerOpciones(argv);
  if (op.help || !op.url) {
    salida('Uso: node scripts/verificar-produccion.mjs --url https://<deployment>.vercel.app [--json] [--host-esperado HOST]');
    salida('Solo lectura: GET /api/health y tres peticiones que DEBEN ser rechazadas (410, 401, 413).');
    return 2;
  }
  let url;
  try {
    url = validarDestinoProduccion(op.url, op.hostEsperado);
  } catch (error) {
    salida(`DESTINO RECHAZADO: ${error.message}`);
    return 2;
  }
  const { ok, comprobaciones } = await verificar(url.origin);
  if (op.json) {
    salida(JSON.stringify({ host: url.hostname, ok, comprobaciones }, null, 2));
  } else {
    salida(`Verificación de producción — ${url.hostname}`);
    for (const c of comprobaciones) salida(`  ${c.estado === 'OK' ? 'OK    ' : 'FALLO '} ${c.nombre}: ${c.detalle}`);
    salida(ok ? 'RESULTADO: producción responde como se espera.' : 'RESULTADO: hay comprobaciones fallidas.');
  }
  return ok ? 0 : 1;
}

const ejecutadoDirectamente = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ejecutadoDirectamente) {
  principal()
    .then((codigo) => process.exit(codigo))
    .catch((error) => {
      console.error(`ERROR: ${error.message}`);
      process.exit(1);
    });
}
