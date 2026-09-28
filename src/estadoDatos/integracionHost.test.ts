/**
 * BLOQUE 10 · UX-2 — INVARIANTES DE CABLEADO EN EL HOST (`App.tsx`).
 *
 * El contrato de estados vive en `src/estadoDatos/*`. Este test comprueba, sobre
 * el CÓDIGO REAL, que el host lo respeta de extremo a extremo:
 *
 *  1. Toda lectura que el host mantiene activa por perfil tiene camino a ERROR
 *     (callback de error instrumentado en la capa de datos) → jamás se queda en
 *     CARGANDO para siempre.
 *  2. Toda lectura instrumentada que el host envuelve tiene camino a LISTO →
 *     ninguna pantalla queda en carga por un origen que no se marca.
 *  3. La puerta de pantalla, el contador de reintento y `loadingMain` están
 *     alimentados por el estado real (una única fuente de verdad).
 *  4. Ningún error de lectura se registra sólo en consola: todas las
 *     suscripciones pasan por el canal de incidencias.
 *  5. Ninguna lectura convierte un error en una lista vacía (`cb([])` / `: []`
 *     en el manejador de error).
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { origenesActivosDePerfil } from './canalIncidencias';
import type { OrigenDatos } from './canalIncidencias';

const RAIZ = path.resolve(__dirname, '..');
const leer = (relativo: string) => fs.readFileSync(path.resolve(RAIZ, relativo), 'utf-8');

function ficherosFuente(dir = RAIZ): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return ficherosFuente(ruta);
    if (!/\.(ts|tsx)$/.test(entrada.name)) return [];
    if (/\.test\.(ts|tsx)$/.test(entrada.name)) return [];
    return [ruta];
  });
}

const FUENTES = ficherosFuente().map((ruta) => ({ ruta, contenido: fs.readFileSync(ruta, 'utf-8') }));
const HOST = leer('App.tsx');

/**
 * Orígenes con camino a ERROR en la capa de datos. Se aceptan dos formas:
 *  - literal: `reportarErrorLectura('inmuebles', …)`;
 *  - dinámica: las fábricas genéricas (`subscribeColeccionPropietario`) instrumentan
 *    `reportarErrorLectura(etiqueta, …)` y reciben la etiqueta del origen en la
 *    llamada, así que el origen queda cubierto si aparece junto a esa instrumentación.
 */
function origenesConReporteDeLectura(): Set<string> {
  const encontrados = new Set<string>();
  for (const { contenido } of FUENTES) {
    for (const match of contenido.matchAll(/reportarErrorLectura\(\s*'([a-z_]+)'/g)) {
      encontrados.add(match[1]);
    }
    if (contenido.includes('reportarErrorLectura(etiqueta')) {
      for (const match of contenido.matchAll(/^\s*'([a-z_]+)',?\s*$/gm)) {
        encontrados.add(match[1]);
      }
    }
  }
  return encontrados;
}

/** Orígenes que el host marca como LISTO: `conDatos<…>('x', …)`. */
function origenesMarcadosPorElHost(): Set<string> {
  const encontrados = new Set<string>();
  for (const match of HOST.matchAll(/conDatos<[^>]*>\(\s*'([a-z_]+)'/g)) {
    encontrados.add(match[1]);
  }
  return encontrados;
}

describe('UX-2 · invariante 1: lectura activa ⇒ puede terminar en ERROR', () => {
  const conReporte = origenesConReporteDeLectura();

  it.each([
    ['ADMINISTRADOR', null],
    ['PROPIETARIO', 'pid-1'],
    ['PROPIETARIO', null],
    ['PROFESIONAL', null],
  ])('el perfil %s (propietarioId=%s) tiene instrumentadas todas sus lecturas', (perfil, pid) => {
    const activos = origenesActivosDePerfil(perfil, pid);
    const sinInstrumentar = activos.filter((origen) => !conReporte.has(origen));
    expect(sinInstrumentar).toEqual([]);
  });

  it('no queda ningún error de suscripción que sólo se registre en consola', () => {
    // El único sitio que puede registrar un error de suscripción directamente en
    // consola es el propio canal de incidencias (que además avisa a la interfaz).
    const conLogDirecto = FUENTES.filter(
      ({ ruta, contenido }) =>
        path.basename(ruta) !== 'canalIncidencias.ts' && /console\.error\([^)]*snapshot error/.test(contenido)
    ).map(({ ruta }) => path.relative(RAIZ, ruta));
    expect(conLogDirecto).toEqual([]);
  });
});

describe('UX-2 · invariante 2: lectura envuelta por el host ⇒ puede terminar en LISTO', () => {
  it('todo origen que el host marca está en la lista activa de algún perfil', () => {
    const universales = new Set(origenesActivosDePerfil('ADMINISTRADOR', 'pid-1'));
    const huerfanos = [...origenesMarcadosPorElHost()].filter((origen) => !universales.has(origen));
    expect(huerfanos).toEqual([]);
  });

  it('toda lectura activa del host está envuelta (no hay cargas eternas)', () => {
    const envueltos = origenesMarcadosPorElHost();
    const sinEnvolver = origenesActivosDePerfil('PROFESIONAL', null).filter((origen) => !envueltos.has(origen));
    expect(sinEnvolver).toEqual([]);
  });

  it('el host envuelve todas las lecturas con su etiqueta de origen', () => {
    const envueltos = origenesMarcadosPorElHost();
    // Al menos las lecturas primarias de las pantallas principales.
    const primarias: OrigenDatos[] = ['inmuebles', 'contratos', 'gastos', 'candidatos', 'propietarios', 'incidencias'];
    for (const origen of primarias) {
      expect(envueltos.has(origen)).toBe(true);
    }
  });
});

describe('UX-2 · invariante 3: el host usa una única fuente de verdad', () => {
  it('las pantallas se renderizan tras la puerta de estado de datos', () => {
    expect(HOST).toContain('<PuertaEstadoDatos');
    expect(HOST).toContain('estado={estadoDePantalla(activeSection)}');
    expect(HOST).toContain('onReintentar={reintentarLecturas}');
  });

  it('el reintento es un contador de estado que rehace las suscripciones (sin recargar)', () => {
    // El contador forma parte de las dependencias del efecto de suscripciones…
    expect(HOST).toContain('claveInmueblesParcialesGestionados, intentoLecturas]');
    // …y no hay recarga de página en el flujo de reintento.
    const hook = leer('estadoDatos/useEstadoLecturas.ts');
    expect(hook).toContain('setIntento((n) => n + 1)');
    expect(hook).not.toContain('location.reload');
    expect(HOST).not.toContain('location.reload');
  });

  it('las lecturas arrancan en CARGANDO al (re)suscribirse y `loadingMain` se alimenta del estado real', () => {
    expect(HOST).toContain('iniciarLecturas();');
    expect(HOST).toContain("loadingMain={estadoDePantalla('dashboard').estado === 'CARGANDO'}");
    expect(HOST).toContain('<AvisoIncidenciasDatos');
  });

  it('el estado de lectura se deriva de los orígenes activos del perfil', () => {
    expect(HOST).toContain(
      'useEstadoLecturas(origenesActivosDePerfil(currentUser?.tipoPerfil, currentUser?.propietarioId))'
    );
  });
});

describe('UX-2 · invariante 4: guardado — el resultado de la persistencia no se descarta', () => {
  it('el host informa de los guardados que no confirma la persistencia (contrato B5)', () => {
    // UX-3 conserva este invariante y en algunos puntos lo delega en
    // `ejecutarOperacion` (que trata un retorno `false` de B5 como fallo y nunca
    // presenta éxito). Se cuentan los dos mecanismos: lo que no puede ocurrir es
    // que el resultado de la persistencia vuelva a descartarse.
    const reportados = HOST.match(/reportarResultadoGuardado\(/g) ?? [];
    const ejecutados = HOST.match(/ejecutarOperacion\(/g) ?? [];
    // alta de inmueble, actualización, borrado, alta de candidato, invitaciones,
    // importación masiva y asignación de profesional.
    expect(reportados.length + ejecutados.length).toBeGreaterThanOrEqual(6);
    expect(reportados.length).toBeGreaterThanOrEqual(4);
  });

  it('el host ya no descarta el resultado de las escrituras en lote', () => {
    // Antes: `void persistirMejorEsfuerzo(tareas);` (fallos invisibles).
    expect(HOST).not.toContain('void persistirMejorEsfuerzo(tareas);');
    const consumidos = HOST.match(/persistirMejorEsfuerzo\(tareas\)\.then\(/g) ?? [];
    expect(consumidos.length).toBe(2);
  });
});

describe('UX-2 · invariante 5: ningún ERROR se convierte en lista vacía', () => {
  it('la capa de datos no emite `[]` desde un manejador de error de suscripción', () => {
    const sospechosos: string[] = [];
    for (const { ruta, contenido } of FUENTES) {
      // Patrón prohibido por UX-2: callback de error que entrega una lista vacía.
      if (/\(\s*\)\s*=>\s*cb\(\[\]\)/.test(contenido)) sospechosos.push(path.relative(RAIZ, ruta));
      if (/onSnapshot\([\s\S]{0,400}?,\s*\(\)\s*=>\s*\[\]/.test(contenido)) sospechosos.push(path.relative(RAIZ, ruta));
    }
    expect(sospechosos).toEqual([]);
  });

  it('los mensajes de usuario del canal son los exigidos y no exponen el SDK', () => {
    const canal = leer('estadoDatos/canalIncidencias.ts');
    const inicio = canal.indexOf('export function mensajeLegible');
    const bloque = canal.slice(
      inicio,
      canal.indexOf('// ─────────────────────────────────────────────────────────────', inicio)
    );

    // Los dos mensajes que fija la orden UX-2.
    expect(bloque).toContain("'No se han podido cargar los datos.'");
    expect(bloque).toContain("'No se han podido guardar los cambios.'");

    // Las ramas de una línea (permisos, sesión, conexión…): ninguna nombra el SDK.
    // (La cobertura completa por código/tipo está en canalIncidencias.test.ts.)
    const unaLinea = [...bloque.matchAll(/return ('[^']*')/g)].map((m) => m[1]);
    expect(unaLinea.length).toBeGreaterThanOrEqual(3);
    for (const mensaje of unaLinea) {
      expect(mensaje).not.toMatch(/permission|firebase|firestore|storage|code/i);
    }
  });
});
