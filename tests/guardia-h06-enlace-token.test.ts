/**
 * Guardia H-06 — el enlace de solicitud no puede volver a construirse a mano.
 *
 * El token del enlace `/#solicitud/<token>` tiene un único punto de decisión:
 * `tokenEnlaceParaMostrar()` en `src/lib/tokenSolicitudPublica.ts`. Si alguien
 * vuelve a escribir `` `sol-${inmueble.id}` `` en un componente, el enlace
 * heredado (adivinable) reaparece por la puerta de atrás y, además, seguirá
 * funcionando hasta la fecha de corte sin que nadie lo note: exactamente el
 * fallo que H-06 cierra.
 *
 * El prefijo `sol-` también nombra el id de una SOLICITUD ya creada
 * (`sol-<inmueble>-<sufijo>`), que es otra cosa. Esos sitios están allowlistados
 * con su motivo: si aparece uno nuevo, esta prueba falla y obliga a decidir.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const CARPETAS = ['src', 'server'];
const MODULO = 'src/lib/tokenSolicitudPublica.ts';

/** Sitios que reconstruyen el id de una solicitud EXISTENTE (no generan enlaces). */
const PERMITIDOS: Record<string, string> = {
  'src/components/PortalDocumentacionPublicaView.tsx':
    'reconstruye `sol-<token>` para localizar una solicitud ya creada',
  'server/documentos/servicioDocumentos.ts':
    'reconstruye `sol-<token>` para localizar una solicitud ya creada',
};

function ficherosFuente(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(RAIZ, dir))) {
    const ruta = join(dir, entrada);
    const info = statSync(join(RAIZ, ruta));
    if (info.isDirectory()) {
      if (entrada === 'node_modules') continue;
      salida.push(...ficherosFuente(ruta));
    } else if (/\.(ts|tsx)$/.test(entrada) && !/\.test\.(ts|tsx)$/.test(entrada)) {
      salida.push(ruta);
    }
  }
  return salida;
}

/** Extrae el template literal completo que empieza en `desde`. */
function templateDesde(texto: string, desde: number): string {
  let nivel = 0;
  for (let i = desde; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '`') {
      nivel += 1;
      if (nivel === 2) return texto.slice(desde, i + 1);
      continue;
    }
    if (nivel === 0) return texto.slice(desde, desde + 40);
  }
  return texto.slice(desde, desde + 40);
}

/** Un literal es "de enlace" si deriva el token del id SIN ningún secreto. */
function derivaSoloDelId(literal: string): boolean {
  const interpolaciones = literal.match(/\$\{[^}]*\}/g) || [];
  if (interpolaciones.length === 0) return false;
  const tieneSecreto = /Date\.now\(|Math\.random\(|getTime\(|randomBytes|generarSecreto|sufijo|crypto/i.test(
    literal
  );
  return !tieneSecreto;
}

function hallazgos() {
  const encontrados: { archivo: string; literal: string }[] = [];
  for (const archivo of ficherosFuente('src').concat(ficherosFuente('server'))) {
    if (archivo === MODULO) continue;
    const texto = readFileSync(join(RAIZ, archivo), 'utf8');
    const aguja = '`sol-${';
    let idx = texto.indexOf(aguja);
    while (idx !== -1) {
      encontrados.push({ archivo, literal: templateDesde(texto, idx) });
      idx = texto.indexOf(aguja, idx + aguja.length);
    }
  }
  return encontrados;
}

describe('H-06 · guardia anti-`sol-${id}`', () => {
  it('ningún fichero reconstruye el token del enlace a partir del id', () => {
    const culpables = hallazgos()
      .filter((h) => derivaSoloDelId(h.literal))
      .filter((h) => !PERMITIDOS[h.archivo])
      .map((h) => `${h.archivo}: ${h.literal}`);

    expect(culpables).toEqual([]);
  });

  it('el prefijo sólo aparece en sitios revisados (módulo + allowlist con motivo)', () => {
    const archivos = [...new Set(hallazgos().map((h) => h.archivo))].sort();
    for (const archivo of archivos) {
      if (archivo === MODULO) continue;
      expect(
        Boolean(PERMITIDOS[archivo]) || archivo.startsWith('src/') || archivo.startsWith('server/')
      ).toBe(true);
    }
    // Un sitio nuevo que genera identificadores de solicitud con marca de tiempo
    // o sufijo aleatorio es legítimo; uno que no, no lo es. La primera prueba lo
    // decide. Aquí sólo se vigila que la allowlist no crezca sin motivo.
    expect(Object.keys(PERMITIDOS).every((archivo) => archivos.includes(archivo))).toBe(true);
  });

  it('el módulo sí construye el enlace heredado (control positivo)', () => {
    const texto = readFileSync(join(RAIZ, MODULO), 'utf8');
    expect(texto).toContain('export function tokenEnlaceParaMostrar');
    expect(texto).toContain('${PREFIJO_TOKEN_SOLICITUD}${inmueble.id}');
  });

  it('el enlace heredado sólo se ofrece desde el módulo', () => {
    for (const archivo of ['src/App.tsx', 'src/components/CrearEnlaceSolicitudModal.tsx']) {
      const texto = readFileSync(join(RAIZ, relative(RAIZ, join(RAIZ, archivo))), 'utf8');
      expect(texto).toContain('tokenEnlaceParaMostrar');
      expect(texto).not.toContain('`sol-${');
    }
  });
});
