/**
 * P0.2.3 — Limitador de ventana deslizante EN MEMORIA, sin dependencias nuevas.
 * ===========================================================================
 * Se usa en las rutas públicas de escritura (`/api/solicitud/:token`,
 * `/api/catastro/consultar`). No es un servicio distribuido: cada instancia
 * serverless tiene su propia ventana. Se declara así explícitamente para no
 * vender una garantía global que no existe; en Vercel se complementa con el
 * límite de plataforma. La protección fuerte es que el alta anónima ya NO
 * escribe en Firestore (P0.2.1/P0.2.2).
 *
 * Contrato:
 *  · `permitir(clave)` devuelve `{ permitido, reintentarEnSegundos, restantes }`.
 *  · Las claves se limpian al caducar; hay un tope de claves para evitar que
 *    un atacante con IPs rotadas crezca la memoria sin límite.
 *  · Reloj inyectable para pruebas deterministas.
 */
export interface OpcionesLimitador {
  /** Máximo de peticiones por ventana y clave. */
  limite: number;
  /** Duración de la ventana en milisegundos. */
  ventanaMs: number;
  /** Tope de claves vivas (defensa de memoria). */
  maxClaves?: number;
  ahora?: () => number;
}

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  reintentarEnSegundos: number;
}

export interface LimitadorVentana {
  permitir(clave: string): ResultadoLimite;
  /** Solo para diagnóstico/tests: número de claves vivas. */
  clavesVivas(): number;
  reiniciar(): void;
}

export function crearLimitadorVentana(opciones: OpcionesLimitador): LimitadorVentana {
  const limite = Math.max(1, Math.floor(opciones.limite));
  const ventanaMs = Math.max(1, Math.floor(opciones.ventanaMs));
  const maxClaves = Math.max(1, Math.floor(opciones.maxClaves ?? 10000));
  const ahora = opciones.ahora ?? (() => Date.now());
  const marcas = new Map<string, number[]>();

  function depurar(instante: number): void {
    for (const [clave, lista] of marcas) {
      const vivas = lista.filter((t) => instante - t < ventanaMs);
      if (vivas.length === 0) marcas.delete(clave);
      else marcas.set(clave, vivas);
    }
    // Si aun así se supera el tope, se descartan las claves más antiguas.
    while (marcas.size > maxClaves) {
      const primera = marcas.keys().next().value as string | undefined;
      if (primera === undefined) break;
      marcas.delete(primera);
    }
  }

  return {
    permitir(clave: string): ResultadoLimite {
      const instante = ahora();
      const lista = (marcas.get(clave) ?? []).filter((t) => instante - t < ventanaMs);
      if (lista.length >= limite) {
        marcas.set(clave, lista);
        const espera = Math.max(1, Math.ceil((ventanaMs - (instante - lista[0])) / 1000));
        return { permitido: false, restantes: 0, reintentarEnSegundos: espera };
      }
      lista.push(instante);
      marcas.set(clave, lista);
      if (marcas.size > maxClaves) depurar(instante);
      return { permitido: true, restantes: Math.max(0, limite - lista.length), reintentarEnSegundos: 0 };
    },
    clavesVivas(): number {
      return marcas.size;
    },
    reiniciar(): void {
      marcas.clear();
    },
  };
}

/**
 * H-05 — ¿Hay un proxy de confianza delante? En Vercel, sí: la plataforma
 * SOBRESCRIBE `x-forwarded-for` con la IP del cliente. Fuera de ahí la cabecera
 * la escribe cualquiera, así que usarla para la cuota permitía cambiar de «IP»
 * en cada petición y saltarse el límite.
 */
export function proxyDeConfianza(entorno: NodeJS.ProcessEnv = process.env): boolean {
  if (String(entorno.VERCEL || '').trim()) return true;
  return ['1', 'true', 'si', 'sí', 'on'].includes(String(entorno.TRUST_PROXY || '').trim().toLowerCase());
}

/**
 * Clave de limitación para una ruta pública. Combina IP y token de capacidad
 * para que un mismo bot no reutilice la IP contra todos los enlaces.
 *
 * La IP sale de la conexión (`ipRemota`); sólo se acepta `x-forwarded-for`
 * cuando hay un proxy de confianza declarado (`VERCEL` / `TRUST_PROXY`). En
 * ambos casos se exige forma de IP: una cabecera arbitraria nunca inventa clave.
 */
export function claveClientePeticion(
  headers: Readonly<Record<string, unknown>>,
  token: string,
  ipRemota = '',
  usarProxy: boolean = proxyDeConfianza(),
): string {
  const reenvio = typeof headers['x-forwarded-for'] === 'string'
    ? (headers['x-forwarded-for'] as string).split(',')[0].trim()
    : '';
  const ip = usarProxy && esIp(reenvio) ? reenvio : esIp(ipRemota) ? ipRemota : 'ip-desconocida';
  return `${ip}|${String(token || '-').slice(0, 200)}`;
}

function esIp(valor: string): boolean {
  if (!valor || valor.length > 64) return false;
  return /^[0-9a-fA-F:.]+$/.test(valor) && (valor.includes('.') || valor.includes(':'));
}
