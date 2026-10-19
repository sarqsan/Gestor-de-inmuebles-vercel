/**
 * P1 — SERVIDOR SMTP DE CAPTURA LOCAL (transporte REAL, sin efectos externos)
 * =============================================================================
 * Servidor SMTP real sobre TCP (`node:net`, sin dependencias nuevas) que
 * habla el protocolo que la aplicación usa en producción a través de
 * `nodemailer`: banner, EHLO/HELO, AUTH (PLAIN/LOGIN), MAIL FROM,
 * RCPT TO, DATA, RSET, QUIT. Es el "buzón de pruebas" donde se reciben
 * los mensajes de extremo a extremo: el transporte REAL de la app
 * (`EmailProviderSMTP` + `nodemailer`) se conecta aquí, igual que al
 * proveedor de producción, pero el servidor solo CAPTURA y nunca reenvía
 * a Internet.
 *
 * Modos inyectables (matriz de aceptación D):
 *   · `aceptar`            — acepta todo (250/235/354/250): recepción
 *                            demostrable en la bandeja de captura.
 *   · `rechazar_destinatario` — RCPT TO → 550 (rechazo explícito del
 *                            proveedor; el mensaje NO sale).
 *   · `fallo_transporte`   — DATA → 421 y cierre (fallo de transporte
 *                            explícito y reintentable: el mensaje no
 *                            fue aceptado).
 *   · `respuesta_ambigua`  — recibe el sobre y el contenido, pero NO
 *                            responde 250 a DATA (cierra sin confirmar):
 *                            el mensaje PUEDE haber sido aceptado. El
 *                            contrato SMTP no permite deduplicación →
 *                            el sistema debe tratarlo como entrega
 *                            INCIERTA, nunca como enviado ni reenviarlo
 *                            automáticamente.
 *   · `lento`              — retrasa la confirmación de DATA (ms
 *                            configurables): comprueba que el sistema
 *                            espera al proveedor en lugar de fallar
 *                            prematuramente.
 *   · `respuesta_invalida` — responde con una línea malformada (no SMTP):
 *                            error de protocolo del proveedor.
 *
 * Seguridad de pruebas:
 *   · Las credenciales AUTH se aceptan pero NUNCA se registran
 *     (sesión muestra `AUTH PLAIN ***`).
 *   · La bandeja (`mensajes()`) es consultable en proceso; cada mensaje
 *     guarda from, destinatarios, cabeceras, cuerpo decodificado y la
 *     traza de la sesión.
 *   · `aceptadoPorServidor` solo es true si DATA terminó en 250: la
 *     evidencia de recepción es del SERVIDOR DE PRUEBA, no de Internet.
 *
 * Datos ficticios: diseñado para destinatarios `*.example.test` /
 * `*.sintetico.invalid`; no reenvía a ningún host.
 */
import net, { type Server, type Socket } from 'node:net';

/** Modos de comportamiento del servidor de captura (ver matriz D). */
export type ModoSmtpCaptura =
  | 'aceptar'
  | 'rechazar_destinatario'
  | 'fallo_transporte'
  | 'respuesta_ambigua'
  | 'lento'
  | 'respuesta_invalida';

/** Mensaje tal como lo recibió el servidor de captura. */
export interface MensajeCapturado {
  /** Índice secuencial del mensaje en este servidor. */
  indice: number;
  fechaIso: string;
  /** Sobre: remitente (MAIL FROM). */
  desde: string;
  /** Sobre: destinatarios aceptados (RCPT TO con 250). */
  destinatarios: string[];
  /** Cabeceras parseadas (subject, from, to, reply-to, message-id…). */
  cabeceras: Record<string, string>;
  /** Cuerpo decodificado (quoted-printable / base64 / 8bit). */
  cuerpo: string;
  /** Contenido DATA crudo, tal cual llegó por el cable. */
  raw: string;
  /** Modo del servidor en el momento de la recepción. */
  modo: ModoSmtpCaptura;
  /** ¿El servidor respondió 250 a DATA? (aceptación explícita) */
  aceptadoPorServidor: boolean;
}

/** Traza de una sesión SMTP (comandos; credenciales enmascaradas). */
export interface SesionCapturada {
  fechaIso: string;
  eventos: string[];
  terminada: 'quit' | 'cerrada_por_cliente' | 'cerrada_por_servidor' | 'error';
}

export interface OpcionesServidorSmtpCaptura {
  /** Modo inicial (por defecto `aceptar`). Se puede cambiar en caliente. */
  modo?: ModoSmtpCaptura;
  /** Retardo en ms para el modo `lento` (por defecto 250). */
  retardoMs?: number;
  /** Destinatarios a los que el servidor NI SIQUIERA acepta el sobre (550). */
  destinosRechazados?: Set<string>;
}

export interface ServidorSmtpCaptura {
  /** Puerto real asignado (el servidor escucha en 127.0.0.1). */
  readonly puerto: number;
  /** URL SMTP sintética lista para `SMTP_URL` (credenciales ficticias). */
  readonly url: string;
  readonly modo: () => ModoSmtpCaptura;
  /** Cambiar el comportamiento entre envíos (matriz de fallo). */
  definirModo(modo: ModoSmtpCaptura): void;
  mensajes(): readonly MensajeCapturado[];
  sesiones(): readonly SesionCapturada[];
  limpiar(): void;
  /** Espera hasta que haya al menos `n` mensajes capturados (acotado). */
  esperarMensajes(n: number, timeoutMs?: number): Promise<void>;
  cerrar(): Promise<void>;
}

/** Decodifica palabras codificadas MIME (=?UTF-8?B?…?= / =?UTF-8?Q?…?=). */
function decodificarPalabrasMime(texto: string): string {
  // RFC 2047: el espacio entre dos palabras codificadas
  // adyacentes (plegado de cabecera) NO es texto.
  const sinPlegado = texto.replace(/\?=\s+=\?/g, '?==?');
  return sinPlegado.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_m, charset, encoding, datos) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(datos, 'base64').toString('utf8');
      }
      return decodeURIComponent(
        datos.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, '%$1'),
      ).replace(/%20/g, ' ');
    } catch {
      return datos;
    }
  });
}

/** Decodifica un cuerpo según su Content-Transfer-Encoding. */
function decodificarCuerpo(cuerpo: string, encoding: string): string {
  const enc = encoding.trim().toLowerCase();
  if (enc === 'quoted-printable') {
    return cuerpo
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  if (enc === 'base64') {
    try {
      return Buffer.from(cuerpo.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return cuerpo;
    }
  }
  return cuerpo;
}

/** Parseo mínimo pero fiel de un mensaje RFC 5322 capturado. */
function parsearMensaje(raw: string): { cabeceras: Record<string, string>; cuerpo: string } {
  const corte = raw.search(/\r?\n\r?\n/);
  const bloqueCabeceras = corte >= 0 ? raw.slice(0, corte) : raw;
  const cuerpoBruto = corte >= 0 ? raw.slice(corte + raw.slice(corte).indexOf('\n') + 1) : '';
  // Unfold de cabeceras plegadas (RFC 5322 §2.2.3): las
  // líneas que empiezan por WSP continúan la anterior.
  // Se acumula CRUDO y se decodifica al final: el
  // plegado puede partir una palabra codificada MIME.
  const crudas: Record<string, string> = {};
  let clave = '';
  for (const linea of bloqueCabeceras.split(/\r?\n/)) {
    if (/^[ \t]/.test(linea) && clave) {
      crudas[clave] = `${crudas[clave]} ${linea.trim()}`;
      continue;
    }
    const dosPuntos = linea.indexOf(':');
    if (dosPuntos > 0) {
      clave = linea.slice(0, dosPuntos).trim().toLowerCase();
      crudas[clave] = linea.slice(dosPuntos + 1).trim();
    }
  }
  const cabeceras: Record<string, string> = {};
  for (const [claveActual, valor] of Object.entries(crudas)) {
    cabeceras[claveActual] = decodificarPalabrasMime(valor);
  }
  const transfer = cabeceras['content-transfer-encoding'] || '7bit';
  const charset = /charset=([^;\s"]+)/i.exec(cabeceras['content-type'] || '')?.[1] || 'utf8';
  const cuerpo = decodificarCuerpo(cuerpoBruto, transfer);
  try {
    const recodificado = Buffer.from(cuerpo, 'binary').toString(
      charset.toLowerCase().includes('iso-8859') ? 'latin1' : 'utf8',
    );
    return { cabeceras, cuerpo: recodificado };
  } catch {
    return { cabeceras, cuerpo };
  }
}

/** Extrae la dirección de `MAIL FROM:<a@b>` / `RCPT TO:<a@b>`. */
function direccionDe(argumento: string): string {
  const entre = /<([^>]*)>/.exec(argumento);
  return (entre ? entre[1] : argumento).trim().toLowerCase();
}

/**
 * Levanta el servidor SMTP de captura en 127.0.0.1 con un puerto
 * efímero. Resuelve cuando el socket acepta conexiones.
 */
export async function levantarServidorSmtpCaptura(
  opciones: OpcionesServidorSmtpCaptura = {},
): Promise<ServidorSmtpCaptura> {
  let modo: ModoSmtpCaptura = opciones.modo ?? 'aceptar';
  const retardoMs = opciones.retardoMs ?? 250;
  const destinosRechazados = opciones.destinosRechazados ?? new Set<string>();

  const mensajes: MensajeCapturado[] = [];
  const sesiones: SesionCapturada[] = [];
  let indiceMensaje = 0;

  const servidor: Server = net.createServer((socket: Socket) => {
    const eventos: string[] = [];
    const estado = {
      desde: '' as string,
      destinatarios: [] as string[],
      datos: [] as string[],
      enDatos: false,
      autenticado: false,
    };
    const registrar = (evento: string) => eventos.push(evento);
    const terminar = (como: SesionCapturada['terminada']) => {
      sesiones.push({ fechaIso: new Date().toISOString(), eventos: [...eventos], terminada: como });
    };

    const escribir = (texto: string) => {
      if (!socket.destroyed) socket.write(`${texto}\r\n`);
    };

    const procesarLinea = (lineaCruda: string) => {
      const linea = lineaCruda.trim();
      // Durante DATA se conserva TODO literalmente
      // (líneas vacías incluidas: separan cabeceras
      // del cuerpo y estructuran el mensaje).
      if (estado.enDatos) {
        if (linea === '.') {
          estado.enDatos = false;
          recibirDatos();
          return;
        }
        // Punto inicial duplicado (stuffing, RFC 5321 §4.5.2).
        estado.datos.push(lineaCruda.startsWith('.') ? lineaCruda.slice(1) : lineaCruda);
        return;
      }
      if (!linea) return;
      // Enmascarado de credenciales en la traza: AUTH nunca se registra.
      if (/^auth\s+/i.test(linea)) {
        registrar('AUTH ***');
      } else {
        registrar(linea.length > 120 ? `${linea.slice(0, 117)}...` : linea);
      }

      const mayusculas = linea.toUpperCase();

      if (mayusculas.startsWith('EHLO') || mayusculas.startsWith('HELO')) {
        escribir('250-smtp-captura-pruebas');
        escribir('250-AUTH PLAIN LOGIN');
        escribir('250-SIZE 10485760');
        escribir('250 8BITMIME');
        return;
      }
      if (mayusculas.startsWith('AUTH')) {
        // Cualquier credencial ficticia es aceptada por el servidor de
        // pruebas; el cliente solo necesita completar el diálogo.
        const partes = linea.split(/\s+/);
        if (partes[1]?.toUpperCase() === 'LOGIN') {
          escribir('334 VXNlcm5hbWU6');
          pendienteAuth = 'usuario';
          return;
        }
        estado.autenticado = true;
        escribir('235 2.7.0 Authentication successful');
        return;
      }
      if (mayusculas.startsWith('MAIL FROM:')) {
        estado.desde = direccionDe(linea.slice('MAIL FROM:'.length));
        estado.destinatarios = [];
        escribir('250 2.1.0 OK');
        return;
      }
      if (mayusculas.startsWith('RCPT TO:')) {
        const destino = direccionDe(linea.slice('RCPT TO:'.length));
        if (modo === 'rechazar_destinatario' || destinosRechazados.has(destino)) {
          registrar(`RCPT TO:${destino} → 550 (rechazado)`);
          escribir('550 5.7.1 Recipient rejected by capture-server policy');
          return;
        }
        estado.destinatarios.push(destino);
        escribir('250 2.1.5 OK');
        return;
      }
      if (mayusculas === 'DATA') {
        if (estado.destinatarios.length === 0) {
          escribir('503 5.5.1 Need RCPT command');
          return;
        }
        if (modo === 'fallo_transporte') {
          registrar('DATA → 421 + cierre (fallo de transporte)');
          escribir('421 4.4.1 Temporary internal error, try again later');
          socket.end(() => socket.destroy());
          terminar('cerrada_por_servidor');
          return;
        }
        if (modo === 'respuesta_invalida') {
          registrar('DATA → respuesta malformada');
          escribir('ESTO-NO-ES-SMTP 000 línea inválida');
          socket.end(() => socket.destroy());
          terminar('cerrada_por_servidor');
          return;
        }
        escribir('354 End data with <CR><LF>.<CR><LF>');
        estado.enDatos = true;
        estado.datos = [];
        return;
      }
      if (mayusculas === 'RSET') {
        estado.desde = '';
        estado.destinatarios = [];
        estado.datos = [];
        escribir('250 2.0.0 OK');
        return;
      }
      if (mayusculas === 'NOOP') {
        escribir('250 2.0.0 OK');
        return;
      }
      if (mayusculas === 'QUIT') {
        escribir('221 2.0.0 Bye');
        socket.end(() => {
          terminar('quit');
        });
        return;
      }
      escribir('500 5.5.2 Unrecognized command');
    };

    let pendienteAuth: 'usuario' | 'contraseña' | null = null;

    const recibirDatos = () => {
      const raw = estado.datos.join('\n');
      const { cabeceras, cuerpo } = parsearMensaje(raw);
      indiceMensaje += 1;
      // La captura del contenido ocurre igual en todos los modos: el
      // servidor de pruebas SIEMPRE registra lo que recibió por el
      // cable, aunque no lo confirme al cliente (modo ambiguo).
      mensajes.push({
        indice: indiceMensaje,
        fechaIso: new Date().toISOString(),
        desde: estado.desde,
        destinatarios: [...estado.destinatarios],
        cabeceras,
        cuerpo,
        raw,
        modo,
        aceptadoPorServidor: modo === 'aceptar' || modo === 'lento',
      });

      if (modo === 'respuesta_ambigua') {
        // El mensaje YA ESTÁ en el servidor pero el cliente no recibe
        // confirmación: cierre abrupto sin 250. Esto es la ambigüedad
        // real del contrato SMTP (no exactly-once).
        registrar('DATA recibido → cierre SIN 250 (respuesta ambigua)');
        socket.destroy();
        terminar('cerrada_por_servidor');
        return;
      }
      if (modo === 'lento') {
        setTimeout(() => {
          escribir(`250 2.0.0 OK: mensaje capturado (#${indiceMensaje})`);
        }, retardoMs);
        return;
      }
      escribir(`250 2.0.0 OK: mensaje capturado (#${indiceMensaje})`);
    };

    // AUTH LOGIN por pasos (usuario y contraseña en líneas aparte).
    const originalProcesar = procesarLinea;
    const procesarConAuth = (lineaCruda: string) => {
      if (pendienteAuth) {
        registrar(`${pendienteAuth === 'usuario' ? 'AUTH usuario ***' : 'AUTH contraseña ***'}`);
        if (pendienteAuth === 'usuario') {
          pendienteAuth = 'contraseña';
          escribir('334 UGFzc3dvcmQ6');
          return;
        }
        pendienteAuth = null;
        estado.autenticado = true;
        escribir('235 2.7.0 Authentication successful');
        return;
      }
      originalProcesar(lineaCruda);
    };

    let buffer = '';
    socket.on('data', (trozo: Buffer) => {
      buffer += trozo.toString('utf8');
      let indice;
      while ((indice = buffer.indexOf('\n')) >= 0) {
        const linea = buffer.slice(0, indice).replace(/\r$/, '');
        buffer = buffer.slice(indice + 1);
        procesarConAuth(linea);
      }
    });
    socket.on('error', () => {
      terminar('error');
    });
    socket.on('close', () => {
      if (estado.enDatos) {
        registrar('cierre durante DATA');
      }
      terminar(socket.destroyed ? 'cerrada_por_servidor' : 'cerrada_por_cliente');
    });

    escribir('220 127.0.0.1 ESMTP smtp-captura-pruebas');
  });

  await new Promise<void>((resolver, rechazar) => {
    servidor.once('error', rechazar);
    servidor.listen(0, '127.0.0.1', () => {
      servidor.removeListener('error', rechazar);
      resolver();
    });
  });

  const direccion = servidor.address();
  if (!direccion || typeof direccion === 'string') {
    throw new Error('P1_CAPTURA_SMTP_DIRECCION_INVALIDA');
  }
  const puerto = direccion.port;

  return {
    puerto,
    // Credenciales sintéticas fijas (no secretos): el servidor de
    // captura acepta cualquier AUTH; existen solo para completar el
    // diálogo exactamente como en producción.
    url: `smtp://pruebas.captura:captura-sintetica-16@127.0.0.1:${puerto}`,
    modo: () => modo,
    definirModo(nuevo: ModoSmtpCaptura) {
      modo = nuevo;
    },
    mensajes: () => mensajes,
    sesiones: () => sesiones,
    limpiar() {
      mensajes.length = 0;
      sesiones.length = 0;
      indiceMensaje = 0;
    },
    async esperarMensajes(n: number, timeoutMs = 5000) {
      const inicio = Date.now();
      while (mensajes.length < n) {
        if (Date.now() - inicio > timeoutMs) {
          throw new Error(`P1_CAPTURA_SMTP_ESPERA_AGOTADA: ${mensajes.length}/${n} mensajes`);
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    },
    cerrar() {
      return new Promise<void>((resolver, rechazar) => {
        servidor.close((err) => (err ? rechazar(err) : resolver()));
      });
    },
  };
}

/**
 * Comprueba que el servidor de captura está escuchando (connect + end
 * inmediato). Fallo cerrado: devuelve `false` si no responde.
 */
export async function servidorCapturaDisponible(puerto: number, timeoutMs = 2000): Promise<boolean> {
  return await new Promise((resolver) => {
    const socket = net.connect({ host: '127.0.0.1', port: puerto });
    const terminar = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolver(ok);
    };
    socket.setTimeout(timeoutMs, () => terminar(false));
    socket.once('connect', () => terminar(true));
    socket.once('error', () => terminar(false));
  });
}
