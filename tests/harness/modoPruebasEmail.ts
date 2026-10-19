/**
 * P1 — MODO DE PRUEBAS DE CORREO (fail-closed, sin efectos externos)
 * =============================================================================
 * Vía reproducible para probar el flujo COMPLETO de entrega sin
 * enviar mensajes a destinatarios reales:
 *
 *   · Reutiliza el transporte REAL de la aplicación
 *     (`crearTransporteEmailDesdeEntorno` → `EmailProviderSMTP` →
 *     `nodemailer`): el mismo código de producción, apuntado al
 *     servidor de captura local. No hay mocks del proveedor.
 *   · El destino es EXCLUSIVAMENTE `127.0.0.1:<puerto de captura>`:
 *     no existe código de fallback, por lo que si el servidor de
 *     pruebas no está disponible el envío FALLA CERRADO (error de
 *     conexión) en lugar de cambiar silenciosamente a un proveedor
 *     real.
 *   · Fail-closed ante destinos ambiguos: todo destinatario debe
 *     pertenecer al conjunto ficticio autorizado (`*.example.test`,
 *     `*.sintetico.invalid` o la lista explícita). Cualquier otra
 *     dirección se rechaza ANTES de abrir conexión.
 *   · Fail-closed ante configuración productiva: si el entorno del
 *     proceso apunta a un proveedor real (gmail/resend/sendgrid…)
 *     o el host del SMTP_URL no es de loopback, el modo de pruebas
 *     se niega a construirse.
 *   · Ninguna credencial real entra en el repositorio: las del
 *     servidor de captura son sintéticas y fijas.
 *
 * Este módulo vive bajo `tests/` (nunca se empaqueta con la app):
 * producción no puede importarlo ni usarlo.
 */
import type { EmailProvider } from '../../src/notificaciones/canales';
import {
  crearTransporteEmailDesdeEntorno,
  type TransporteEmail,
} from '../../server/notificaciones/proveedoresEmail';

/** Dominios ficticios admitidos como destinatarios de prueba. */
export const DOMINIOS_FICTICIOS = ['example.test', 'sintetico.invalid'] as const;

/** Credenciales sintéticas (no secretos): el servidor de captura acepta cualquier AUTH. */
export const USUARIO_CAPTURA = 'pruebas.captura';
export const CONTRASENA_CAPTURA = 'captura-sintetica-16';

export interface OpcionesModoPruebasEmail {
  /** Puerto del servidor SMTP de captura local (127.0.0.1). */
  puertoCaptura: number;
  /** Destinatarios ficticios autorizados (se suman a los dominios ficticios). */
  destinosAutorizados?: string[];
  /** Remitente visible (sintético). */
  desde?: string;
}

export interface ModoPruebasEmail {
  /** Transporte con las mismas garantías de `TransporteEmail` (modo REAL, proveedor SMTP). */
  readonly transporte: TransporteEmail;
  /** Conjunto cerrado de destinatarios admitidos (minúsculas). */
  readonly destinosAutorizados: ReadonlySet<string>;
  /**
   * Comprueba que el servidor de captura responde ANTES de
   * enviar. Fallo cerrado: `false` ⇒ no se debe enviar nada.
   */
  servidorDisponible(): Promise<boolean>;
}

/**
 * ¿El destinatario pertenece al conjunto cerrado de
 * pruebas? Un buzón concreto de la lista, o cualquier
 * buzón de un dominio ficticio (o subdominio suyo,
 * p. ej. `inquilino.example.test`).
 */
export function destinoAutorizado(
  email: string,
  destinos: ReadonlySet<string>,
): boolean {
  const limpio = email.trim().toLowerCase();
  if (destinos.has(limpio)) return true;
  const arroba = limpio.lastIndexOf('@');
  if (arroba < 0) return false;
  const dominio = limpio.slice(arroba + 1); // p. ej. 'inquilino.example.test'
  for (const permitido of destinos) {
    if (permitido.startsWith('@')) {
      const base = permitido.slice(1); // p. ej. 'example.test'
      // El dominio exacto o un subdominio suyo.
      if (dominio === base || dominio.endsWith(`.${base}`)) return true;
    }
  }
  return false;
}

/**
 * Conjunto cerrado de destinatarios: los dominios ficticios
 * admiten cualquier buzón, y la lista explícita añade
 * direcciones concretas (también ficticias).
 */
export function conjuntoDestinosFicticios(extra: string[] = []): Set<string> {
  const conjunto = new Set<string>();
  for (const dominio of DOMINIOS_FICTICIOS) {
    conjunto.add(`@${dominio}`);
  }
  for (const email of extra) {
    if (typeof email === 'string' && email.trim()) {
      conjunto.add(email.trim().toLowerCase());
    }
  }
  return conjunto;
}

/**
 * Fail-closed: rechaza cualquier entorno que huela a
 * producción. Lanza (nunca construye un transporte) si:
 *   · el host de SMTP_URL no es de loopback;
 *   · hay credenciales de proveedor HTTP en el entorno;
 *   · el proveedor declarado no es SMTP;
 *   · SMTP_URL apunta a otro puerto que no sea el de captura.
 */
export function validarEntornoPruebasCerrado(
  entorno: NodeJS.ProcessEnv,
  puertoCaptura: number,
): void {
  const proveedor = (entorno.EMAIL_PROVEEDOR || '').trim().toUpperCase();
  if (proveedor && proveedor !== 'SMTP') {
    throw new Error(`P1_PRUEBAS_FAIL_CLOSED: proveedor no SMTP (${proveedor})`);
  }
  // Credenciales de proveedores HTTP en el entorno del proceso ⇒
  // riesgo de envío real: el modo de pruebas se niega a arrancar.
  for (const variable of ['RESEND_API_KEY', 'SENDGRID_API_KEY']) {
    if (entorno[variable]?.trim()) {
      throw new Error(`P1_PRUEBAS_FAIL_CLOSED: ${variable} presente en el entorno`);
    }
  }
  const smtpUrl = (entorno.SMTP_URL || '').trim();
  if (smtpUrl) {
    try {
      const url = new URL(smtpUrl);
      const host = url.hostname.toLowerCase();
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
        throw new Error(`P1_PRUEBAS_FAIL_CLOSED: SMTP_URL apunta fuera de loopback (${host})`);
      }
      if (String(url.port) !== String(puertoCaptura)) {
        throw new Error(
          `P1_PRUEBAS_FAIL_CLOSED: SMTP_URL no apunta al servidor de captura (puerto ${url.port} ≠ ${puertoCaptura})`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('P1_PRUEBAS_FAIL_CLOSED')) throw err;
      throw new Error('P1_PRUEBAS_FAIL_CLOSED: SMTP_URL del entorno no es válida');
    }
  }
}

/**
 * Crea el transporte de pruebas: transporte REAL de la app
 * (nodemailer) dirigido al servidor de captura, con guarda
 * de destinatarios.
 *
 * La guarda se aplica ANTES de conectar: un destinatario no
 * autorizado nunca llega al cable (fail-closed ante destinos
 * ambiguos y envío externo no autorizado).
 */
export function crearModoPruebasEmail(
  opciones: OpcionesModoPruebasEmail,
): ModoPruebasEmail {
  const {
    puertoCaptura,
    desde = 'Gestor de Inmuebles (PRUEBAS) <avisos.pruebas@sintetico.invalid>',
  } = opciones;

  // Fail-closed ANTES de construir nada: el entorno del
  // proceso no puede tener configuración productiva.
  validarEntornoPruebasCerrado(process.env, puertoCaptura);

  // Entorno sintético cerrado: el único destino posible es
  // el servidor de captura de loopback. No se hereda
  // SMTP_URL del proceso (aislamiento total).
  const entornoPruebas: NodeJS.ProcessEnv = {
    EMAIL_PROVEEDOR: 'SMTP',
    SMTP_URL: `smtp://${USUARIO_CAPTURA}:${CONTRASENA_CAPTURA}@127.0.0.1:${puertoCaptura}`,
    EMAIL_FROM: desde,
  };
  validarEntornoPruebasCerrado(entornoPruebas, puertoCaptura);

  const transporte = crearTransporteEmailDesdeEntorno(entornoPruebas);
  if (transporte.modo !== 'REAL' || transporte.proveedor !== 'SMTP') {
    throw new Error('P1_PRUEBAS_FAIL_CLOSED: el modo de pruebas exige transporte SMTP real');
  }

  const destinos = conjuntoDestinosFicticios(opciones.destinosAutorizados ?? []);
  const providerOriginal = transporte.provider;
  const providerConGuarda: EmailProvider = {
    async enviar(mensaje) {
      if (!destinoAutorizado(mensaje.to, destinos)) {
        // Fail-closed ANTES de abrir conexión: el mensaje
        // nunca sale de la máquina, ni siquiera al buzón
        // local.
        return { ok: false, error: 'pruebas_destinatario_no_autorizado' };
      }
      return await providerOriginal.enviar(mensaje);
    },
  };

  return {
    transporte: { ...transporte, provider: providerConGuarda },
    destinosAutorizados: destinos,
    async servidorDisponible() {
      const { servidorCapturaDisponible } = await import('./servidorSmtpCaptura');
      return await servidorCapturaDisponible(puertoCaptura);
    },
  };
}
