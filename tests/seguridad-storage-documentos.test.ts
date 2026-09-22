/**
 * SEGURIDAD DE ACCESO A DOCUMENTOS Y ARCHIVOS · tests del bloque endurecido
 * Auditoría 2026-09-22 → docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md
 * ---------------------------------------------------------------------------------
 * METODOLOGÍA (leer antes de dar por bueno ningún verde):
 *  · En esta base NO hay emulador de Firebase (`firebase-tools` no es dependencia
 *    y no hay credenciales), así que las reglas no se ejecutan: se analiza el
 *    fichero real `storage.rules` / `firestore.rules` con un parser de bloques y
 *    un evaluador de las expresiones de autorización que usan (verdadero / falso
 *    / cuenta interna / admin). Es **verificación estructural**, no una prueba
 *    del motor de reglas de Google.
 *  · Lo que sí se ejecuta de verdad es `src/lib/documentosServidor.ts`, el módulo
 *    que concentra el control de acceso de los documentos que sirve el propio
 *    `server.ts` (fuera del alcance de las reglas de Storage: ahí la única
 *    defensa es el id y las cabeceras).
 *  · Los cerrojos de deudas (base64 en Firestore, caché en localStorage,
 *    colecciones con acceso público) son ratchets: fallan si la deuda CRECE, y
 *    exigen que cada deuda registrada siga documentada en la auditoría.
 *
 * Correspondencia con los escenarios exigidos: #1 público, #2 privado sin sesión,
 * #3 documento ajeno, #4 cuenta interna, #5 autenticado sin derechos de listado,
 * #6 admin, #7 rutas internas, #8 escritura, #9 modificación, #10 borrado,
 * #11 listado, #12 URL pública de documento privado, #13 localStorage,
 * #14 base64, #15 rutas dinámicas.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AlmacenDocumentosEfimeros,
  MAX_BYTES_POR_DOCUMENTO,
  cabecerasDocumento,
  decodificarBase64Documento,
  generarIdDocumento,
  idDeDocumentoValido,
  nombreMostrable,
  normalizarTipoContenido,
} from '../src/lib/documentosServidor';

// ==========================================================================
// mini-anizador de reglas (sintaxis común a storage.rules y firestore.rules)
// ==========================================================================

type Accion = 'get' | 'list' | 'create' | 'update' | 'delete';
type Rol = 'anonimo' | 'interno' | 'admin';

interface Permiso {
  acciones: Accion[];
  condicion: string;
}

interface Bloque {
  patron: string;
  permisos: Permiso[];
  lineaInicio: number;
}

const EXPANDIR: Record<string, Accion[]> = {
  read: ['get', 'list'],
  write: ['create', 'update', 'delete'],
};

function sinComentario(linea: string): string {
  const i = linea.indexOf('//');
  return i >= 0 ? linea.slice(0, i) : linea;
}

/** Extrae cada `match /ruta { ... }` y sus `allow acciones: if condicion;`. */
function extraerBloques(fuente: string): Bloque[] {
  const lineas = fuente.split('\n');
  const bloques: Bloque[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const cabecera = sinComentario(lineas[i]).match(/^(\s*)match\s+(\/.*?)\s*\{\s*$/);
    if (!cabecera) continue;
    const indentacion = cabecera[1].length;
    const cuerpo: string[] = [];
    let j = i + 1;
    for (; j < lineas.length; j++) {
      const cruda = lineas[j];
      const limpia = sinComentario(cruda).trim();
      const cierra = /^\}\s*$/.test(limpia) && (cruda.match(/^\s*/)?.[0].length ?? 0) === indentacion;
      if (cierra) break;
      // Un `match` anidado abre su propio bloque: aquí se corta el padre.
      if (/^\s*match\s/.test(cruda)) break;
      cuerpo.push(limpia);
    }
    const texto = cuerpo.join(' ');
    const re = /allow\s+([^:]+):\s*if\s+([^;]+);/g;
    const permisos: Permiso[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const acciones: Accion[] = [];
      for (const base of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        for (const a of EXPANDIR[base] || [base as Accion]) if (!acciones.includes(a)) acciones.push(a);
      }
      permisos.push({ acciones, condicion: m[2].replace(/\s+/g, ' ').trim() });
    }
    bloques.push({ patron: cabecera[2].trim(), permisos, lineaInicio: i + 1 });
  }
  return bloques;
}

/** `{x}` = un segmento; `{x=**}` = resto del trayecto (incluida la propia carpeta). */
function patronARegex(patron: string): RegExp {
  const partes = patron.replace(/^\//, '').split('/');
  let re = '^';
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (/^\{\w+=\*\*\}$/.test(p)) {
      re += '.*';
      break;
    }
    re += /^\{\w+\}$/.test(p) ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (i < partes.length - 1) re += '/';
  }
  return new RegExp(`${re}$`);
}

/**
 * Semántica de las condiciones empleadas en storage.rules:
 * `true` → todo el mundo; `false` → nadie; `internalUser()`/`isSignedIn()` →
 * cualquier cuenta autenticada; `isMasterAdmin()` → sólo el administrador; el
 * resto (límites de tamaño/tipo/nombre) no cambia el "quién", sólo el "qué".
 */
function condicionPermite(condicion: string, rol: Rol): boolean {
  if (condicion === 'true') return true;
  if (condicion === 'false') return false;
  if (/internalUser\(\)|isSignedIn\(\)/.test(condicion)) return rol !== 'anonimo';
  if (/isMasterAdmin\(\)/.test(condicion)) return rol === 'admin';
  return true;
}

const BLOQUES_STORAGE = extraerBloques(readFileSync(new URL('../storage.rules', import.meta.url), 'utf8')).filter(
  (b) => b.permisos.length > 0,
);
const FUENTE_STORAGE = readFileSync(new URL('../storage.rules', import.meta.url), 'utf8');
const FUENTE_FIRESTORE = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const BLOQUES_FIRESTORE = extraerBloques(FUENTE_FIRESTORE);
const AUDITORIA = readFileSync(
  new URL('../docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md', import.meta.url),
  'utf8',
);

function evaluarStorage(ruta: string, accion: Accion, rol: Rol): 'permitido' | 'rechazado' {
  for (const bloque of BLOQUES_STORAGE) {
    if (!patronARegex(bloque.patron).test(ruta)) continue;
    for (const p of bloque.permisos) {
      if (p.acciones.includes(accion) && condicionPermite(p.condicion, rol)) return 'permitido';
    }
  }
  return 'rechazado';
}

function bloqueStorage(patron: string): Bloque {
  const b = BLOQUES_STORAGE.find((x) => x.patron === patron);
  if (!b) throw new Error(`falta el bloque ${patron} en storage.rules`);
  return b;
}

function permisosFirestore(patron: string): Permiso[] {
  const b = BLOQUES_FIRESTORE.find((x) => x.patron === patron);
  if (!b) throw new Error(`falta el bloque ${patron} en firestore.rules`);
  return b.permisos;
}

const CATALOGO_PUBLICO = '/inmuebles/{inmuebleId}/{fileName}';

/** Árboles de documentos privados declarados en storage.rules (patrón + ejemplo real). */
const RUTAS_PRIVADAS: { patron: string; muestra: string }[] = [
  { patron: '/cobros_justificantes/{propietarioId}/{cobroPeriodoId}/{fileName}', muestra: 'cobros_justificantes/P1/CP1/justificante.pdf' },
  { patron: '/cobros_justificantes/{cobroPeriodoId}/{fileName}', muestra: 'cobros_justificantes/CPVIEJO/justificante.pdf' },
  { patron: '/gastos_facturas/{propietarioId}/{gastoId}/{fileName}', muestra: 'gastos_facturas/P1/G1/factura.pdf' },
  { patron: '/documentos_solicitados/{solicitudDocId}/{fileName}', muestra: 'documentos_solicitados/SOL1/dni.jpg' },
  { patron: '/inmuebles/{inmuebleId}/{subcarpeta}/{allFiles=**}', muestra: 'inmuebles/INM1/inventario/INV1/1700_foto.png' },
  { patron: '/recomercializacion_fotos/{propietarioId}/{expedienteId}/{fileName}', muestra: 'recomercializacion_fotos/P1/EXP1/estado.jpg' },
  { patron: '/incidencias_fotos/{propietarioId}/{incidenciaId}/{fileName}', muestra: 'incidencias_fotos/P1/INC1/foto.jpg' },
  { patron: '/reformas_documentos/{propietarioId}/{proyectoId}/{fileName}', muestra: 'reformas_documentos/P1/PROY1/contrato.pdf' },
  { patron: '/reformas_fotos/{propietarioId}/{proyectoId}/{fileName}', muestra: 'reformas_fotos/P1/PROY1/antes.jpg' },
  { patron: '/incidencias/{incidenciaId}/{fileName}', muestra: 'incidencias/INC1/video.mp4' },
  { patron: '/presupuestos/{presupuestoId}/{fileName}', muestra: 'presupuestos/PRE1/presupuesto.pdf' },
  { patron: '/trabajos/{trabajoId}/{fileName}', muestra: 'trabajos/TRA1/factura-final.pdf' },
  { patron: '/profesionales/{profesionalId}/documentos/{fileName}', muestra: 'profesionales/PRO1/documentos/contrata.pdf' },
];

function rutaDeFuente(relativa: string): string {
  return fileURLToPath(new URL(`../${relativa}`, import.meta.url));
}

function listarFicheros(dirRelativa: string, extensiones: string[]): string[] {
  const raiz = new URL(`../${dirRelativa}`, import.meta.url);
  const out: string[] = [];
  const caminar = (url: URL, prefijo: string) => {
    for (const entrada of readdirSync(url, { withFileTypes: true })) {
      const rel = prefijo ? `${prefijo}/${entrada.name}` : entrada.name;
      if (entrada.isDirectory()) caminar(new URL(`${entrada.name}/`, url), rel);
      else if (extensiones.some((e) => entrada.name.endsWith(e))) out.push(`${dirRelativa}${rel}`);
    }
  };
  caminar(raiz, '');
  return out.sort();
}

// ==========================================================================
// 1-12 · matriz de acceso sobre las rutas reales
// ==========================================================================

describe('storage.rules · matriz de acceso (público / cuenta interna / admin)', () => {
  it('#1 la imagen de catálogo proyectada por R3 es la única lectura pública', () => {
    expect(evaluarStorage('inmuebles/INM1/img_1700_54321_foto.jpg', 'get', 'anonimo')).toBe('permitido');
    const publicos = BLOQUES_STORAGE.filter((b) => b.permisos.some((p) => p.condicion === 'true'));
    expect(publicos.map((b) => b.patron)).toEqual([CATALOGO_PUBLICO]);
    expect(bloqueStorage(CATALOGO_PUBLICO).permisos.filter((p) => p.condicion === 'true')).toEqual([
      { acciones: ['get'], condicion: 'true' },
    ]);
    // y el público es sólo el OBJETO de una ruta plana del catálogo
    expect(CATALOGO_PUBLICO.split('/').filter(Boolean)).toEqual(['inmuebles', '{inmuebleId}', '{fileName}']);
  });

  it('#2 ningún documento privado es accesible sin sesión (ni lectura ni listado)', () => {
    for (const { muestra } of RUTAS_PRIVADAS) {
      expect(evaluarStorage(muestra, 'get', 'anonimo'), `get anónimo en ${muestra}`).toBe('rechazado');
      expect(evaluarStorage(muestra, 'list', 'anonimo'), `list anónimo en ${muestra}`).toBe('rechazado');
    }
  });

  it('#3/#4/#5/#6 la cuenta interna lee; enumerar es sólo de administración', () => {
    for (const { patron, muestra } of RUTAS_PRIVADAS) {
      expect(evaluarStorage(muestra, 'get', 'interno'), `get interno en ${muestra}`).toBe('permitido');
      const bloque = bloqueStorage(patron);
      expect(bloque.permisos.some((p) => p.acciones.includes('list')), `${patron} debe declarar list explícito`).toBe(true);
      // Un usuario autenticado que no es admin (p. ej. un profesional con cuenta)
      // NO puede enumerar los documentos de otros.
      expect(evaluarStorage(muestra, 'list', 'interno'), `list interno en ${muestra}`).toBe('rechazado');
      expect(evaluarStorage(muestra, 'list', 'admin'), `list admin en ${muestra}`).toBe('permitido');
    }
  });

  it('#3b el aislamiento fino por propietario es un residual DECLARADO, no un silencio', () => {
    // Storage no puede comparar `{propietarioId}` con el uid sin custom claims:
    // el bloque G-1 tiene que seguir documentado en el propio fichero y en el doc.
    expect(FUENTE_STORAGE).toContain('G-1');
    expect(AUDITORIA).toContain('G-1');
    // Toda ruta privada mantiene el segmento de propietario para poder activar
    // el claim sin mover un solo objeto.
    const conPropietario = RUTAS_PRIVADAS.filter((r) => r.patron.includes('{propietarioId}'));
    expect(conPropietario.length).toBe(6);
    expect(conPropietario.every((r) => r.patron.includes('/{propietarioId}/'))).toBe(true);
    // Y las que no lo tienen son las que no son de un propietario (candidatos,
    // inmuebles, circuitos operativos por id de entidad).
    const sinPropietario = RUTAS_PRIVADAS.filter((r) => !r.patron.includes('{propietarioId}')).map((r) => r.patron);
    expect(sinPropietario).toEqual([
      '/cobros_justificantes/{cobroPeriodoId}/{fileName}',
      '/documentos_solicitados/{solicitudDocId}/{fileName}',
      '/inmuebles/{inmuebleId}/{subcarpeta}/{allFiles=**}',
      '/incidencias/{incidenciaId}/{fileName}',
      '/presupuestos/{presupuestoId}/{fileName}',
      '/trabajos/{trabajoId}/{fileName}',
      '/profesionales/{profesionalId}/documentos/{fileName}',
    ]);
  });

  it('#7 las rutas internas bajo el catálogo (inventario) ya no heredan lo público', () => {
    const inventario = 'inmuebles/INM1/inventario/INV1/1700_arc_on.png';
    expect(evaluarStorage(inventario, 'get', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage(inventario, 'list', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage(inventario, 'get', 'interno')).toBe('permitido');
    expect(evaluarStorage(inventario, 'create', 'anonimo')).toBe('rechazado');
    // el catálogo plano sigue vivo (no se ha cerrado de más)
    expect(evaluarStorage('inmuebles/INM1/img_1_a.jpg', 'get', 'anonimo')).toBe('permitido');
    // cualquier otra subcarpeta futura bajo inmuebles/ es privada por defecto
    expect(evaluarStorage('inmuebles/INM1/documentos/2026/nomina.pdf', 'get', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage('inmuebles/INM1/documentos/2026/nomina.pdf', 'create', 'anonimo')).toBe('rechazado');
  });

  it('#7b/#11 el acceso público al catálogo es al objeto, nunca al listado', () => {
    // `allow read: if true` sobre `{allFiles=**}` permitía ENUMERAR el inmueble.
    expect(BLOQUES_STORAGE.some((b) => b.permisos.some((p) => p.acciones.includes('list') && p.condicion === 'true'))).toBe(false);
    expect(FUENTE_STORAGE).not.toMatch(/allow\s+read:\s*if\s+true/);
    expect(evaluarStorage('inmuebles/INM1', 'list', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage('inmuebles/INM1/img_1_a.jpg', 'list', 'anonimo')).toBe('rechazado');
    // listado interno del catálogo: permitido (la app no lo usa, pero no se rompe nada)
    expect(evaluarStorage('inmuebles/INM1/img_1_a.jpg', 'list', 'interno')).toBe('permitido');
    // inventario: sólo admin
    expect(evaluarStorage('inmuebles/INM1/inventario/INV1/f.png', 'list', 'interno')).toBe('rechazado');
    expect(evaluarStorage('inmuebles/INM1/inventario/INV1/f.png', 'list', 'admin')).toBe('permitido');
  });

  it('#8 escritura no autorizada: sólo el portal anónimo de candidatos crea, y acotado', () => {
    for (const { muestra } of RUTAS_PRIVADAS.filter((r) => !r.patron.startsWith('/documentos_solicitados'))) {
      expect(evaluarStorage(muestra, 'create', 'anonimo'), `create anónimo en ${muestra}`).toBe('rechazado');
    }
    for (const ruta of ['inmuebles/INM1/ladrillo.jpg', 'morosidad/EXP1/x.pdf', 'config/secreto.json', 'cobros_justificantes/P1/x.pdf', 'server_doc_1.pdf']) {
      expect(evaluarStorage(ruta, 'create', 'anonimo'), `create anónimo en ${ruta}`).toBe('rechazado');
    }
    const create = bloqueStorage('/documentos_solicitados/{solicitudDocId}/{fileName}').permisos.find((p) =>
      p.acciones.includes('create'),
    )?.condicion;
    expect(create).toBeDefined();
    expect(create).toMatch(/withinSize\(15\)/);
    expect(create).toMatch(/isPdfOrImage\(\)/);
    // withinSize es el helper que sigue usando `request.resource.size`
    expect(FUENTE_STORAGE).toMatch(/function withinSize\(limitMb\) \{\s*return request\.resource\.size </);
    expect(create).toMatch(/hasSafeObjectName\(\)/);
    // Deliberado: el candidato sube sin sesión. A cambio, nunca sustituye un
    // objeto existente (update: false) ni obtiene acceso de lectura.
    expect(create).not.toMatch(/internalUser\(\)/);
    expect(evaluarStorage('documentos_solicitados/SOL1/dni.jpg', 'create', 'anonimo')).toBe('permitido');
    expect(evaluarStorage('documentos_solicitados/SOL1/sub/carpeta.jpg', 'create', 'anonimo')).toBe('rechazado');
    // toda subida ADMITIDA del bucket declara límite de tamaño (las rutas
    // congeladas no lo necesitan: su create es `false`)
    for (const b of BLOQUES_STORAGE) {
      for (const p of b.permisos.filter((x) => x.acciones.includes('create') && x.condicion !== 'false')) {
        expect(p.condicion, b.patron).toMatch(/withinSize\(\d+\)/);
        expect(p.condicion, b.patron).toMatch(/isImage\(\)|isPdfOrImage\(\)|isOperativeDoc\(\)/);
      }
    }
  });

  it('#9 modificación no autorizada: todos los objetos son inmutables', () => {
    for (const bloque of BLOQUES_STORAGE) {
      expect(
        bloque.permisos.some((p) => p.acciones.includes('update') && p.condicion === 'false'),
        `${bloque.patron} debe denegar update de forma explícita`,
      ).toBe(true);
      for (const p of bloque.permisos.filter((x) => x.acciones.includes('update'))) {
        expect(p.condicion, `update en ${bloque.patron}`).toBe('false');
      }
    }
    for (const rol of ['anonimo', 'interno', 'admin'] as Rol[]) {
      expect(evaluarStorage('gastos_facturas/P1/G1/factura.pdf', 'update', rol)).toBe('rechazado');
      expect(evaluarStorage('cobros_justificantes/P1/CP1/j.pdf', 'update', rol)).toBe('rechazado');
      expect(evaluarStorage('inmuebles/INM1/img_1_a.jpg', 'update', rol)).toBe('rechazado');
    }
  });

  it('#10 borrado: nunca anónimo, siempre cuenta interna', () => {
    for (const { muestra } of RUTAS_PRIVADAS.concat([{ patron: CATALOGO_PUBLICO, muestra: 'inmuebles/INM1/img_1_a.jpg' }])) {
      expect(evaluarStorage(muestra, 'delete', 'anonimo'), `delete anónimo en ${muestra}`).toBe('rechazado');
      expect(evaluarStorage(muestra, 'delete', 'interno'), `delete interno en ${muestra}`).toBe('permitido');
    }
    expect(FUENTE_STORAGE).not.toMatch(/allow\s+[^:]*delete[^:]*:\s*if\s+true/);
    // La ruta congelada de justificantes heredados no admite nuevas subidas.
    expect(bloqueStorage('/cobros_justificantes/{cobroPeriodoId}/{fileName}').permisos.some((p) => p.acciones.includes('create') && p.condicion === 'false')).toBe(true);
  });

  it('#12 una URL conocida no convierte un documento privado en público', () => {
    // Aunque el `downloadURL` caiga en manos de un tercero, la capa de reglas
    // no da `get` anónimo a ningún árbol privado ni al subárbol de inventario.
    expect(evaluarStorage('inmuebles/INM1/inventario/INV1/f.png', 'get', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage('documentos_solicitados/SOL1/dni.jpg', 'get', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage('cobros_justificantes/P1/CP1/j.pdf', 'get', 'anonimo')).toBe('rechazado');
    // Y la proyección pública sigue siendo propiedad de R3: este bloque no copia
    // ni amplía ninguna lista de campos (G-6).
    expect(AUDITORIA).toContain('fichas_publicas_inmueble');
    expect(AUDITORIA).toContain('CAMPOS_FICHA_PUBLICA');
  });

  it('#15 las rutas dinámicas no permiten saltarse la autorización', () => {
    for (const b of BLOQUES_STORAGE) {
      if (b.patron === '/{allPaths=**}') continue;
      const primero = b.patron.replace(/^\//, '').split('/')[0];
      expect(/^\{/.test(primero), `el primer segmento de ${b.patron} no puede venir del cliente`).toBe(false);
      expect(primero.includes('..'), b.patron).toBe(false);
    }
    // Un identificador de cliente sólo puede elegir el nombre de objeto, y ése
    // está acotado de forma (además del sanitizador del cliente).
    expect(FUENTE_STORAGE).toMatch(/&&\s*hasSafeObjectName\(\);/);
    // Ningún patrón depende de un comodín inicial: un prefijo inventado o un `..`
    // no abre nunca una puerta anónima (como mucho cae en el árbol privado que
    // corresponda, o en la denegación global).
    for (const ruta of ['../etc/passwd', 'inmuebles', 'inmuebles/INM1/../INM2/x.jpg', 'x/INM1/y.jpg', 'documentos_solicitados/../SOL2/x.pdf']) {
      for (const accion of ['get', 'list', 'create', 'update', 'delete'] as Accion[]) {
        expect(evaluarStorage(ruta, accion, 'anonimo'), `anónimo ${accion} de ${ruta}`).toBe('rechazado');
      }
    }
    // Y la única subida anónima posible no puede esconderse bajo otro árbol.
    expect(evaluarStorage('inmuebles/INM1/documentos/x.pdf', 'create', 'anonimo')).toBe('rechazado');
    expect(evaluarStorage('documentos_solicitados/../INM1/x.pdf', 'create', 'anonimo')).toBe('rechazado');
  });

  it('el catch-all deniega todo lo no declarado y es el último bloque', () => {
    const ultimo = BLOQUES_STORAGE[BLOQUES_STORAGE.length - 1];
    expect(ultimo.patron).toBe('/{allPaths=**}');
    expect(ultimo.permisos).toEqual([{ acciones: ['get', 'list', 'create', 'update', 'delete'], condicion: 'false' }]);
  });
});

// ==========================================================================
// coherencia reglas ↔ rutas que construye la aplicación
// ==========================================================================

describe('storage.rules · cobertura de las rutas que usa la aplicación', () => {
  function rutasDelCliente(): string[] {
    const fuente = readFileSync(rutaDeFuente('src/lib/firebase.ts'), 'utf8');
    const re = /const storagePath = `([^`]+)`/g;
    const encontradas: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(fuente))) encontradas.push(m[1].replace(/\$\{[^}]*\}/g, 'VALOR1'));
    return encontradas;
  }

  it('toda ruta del cliente está cubierta por un bloque explícito, no por el catch-all', () => {
    const rutas = rutasDelCliente();
    expect(rutas.length).toBeGreaterThanOrEqual(12);
    for (const ruta of rutas) {
      const cubiertos = BLOQUES_STORAGE.filter((b) => b.patron !== '/{allPaths=**}' && patronARegex(b.patron).test(ruta));
      expect(cubiertos.length, `la ruta ${ruta} cae en la denegación por defecto`).toBeGreaterThan(0);
      const condicion = cubiertos.flatMap((b) => b.permisos).find((p) => p.acciones.includes('create'))?.condicion || 'false';
      expect(condicionPermite(condicion, 'interno'), `create para cuenta interna en ${ruta}`).toBe(true);
    }
  });

  it('F-6 corregida: las cuatro rutas sin regla son ahora árboles privados', () => {
    for (const patron of [
      '/incidencias/{incidenciaId}/{fileName}',
      '/presupuestos/{presupuestoId}/{fileName}',
      '/trabajos/{trabajoId}/{fileName}',
      '/profesionales/{profesionalId}/documentos/{fileName}',
    ]) {
      const b = bloqueStorage(patron);
      expect(b.permisos.some((p) => p.acciones.includes('get') && p.condicion === 'true'), `${patron} no debe ser público`).toBe(false);
      expect(b.permisos.some((p) => p.acciones.includes('get') && /internalUser\(\)/.test(p.condicion)), patron).toBe(true);
      const ejemplo = b.patron.replace(/^\//, '').replace(/\{\w+\}/g, 'VALOR1');
      expect(evaluarStorage(ejemplo, 'create', 'anonimo'), `${patron} alta anónima`).toBe('rechazado');
      expect(evaluarStorage(ejemplo, 'create', 'interno'), `${patron} alta interna`).toBe('permitido');
    }
  });

  it('el inventario del inmueble es una ruta propia y privada', () => {
    expect(rutasDelCliente().some((r) => r.startsWith('inmuebles/VALOR1/inventario/'))).toBe(true);
    expect(BLOQUES_STORAGE.some((b) => b.patron === '/inmuebles/{inmuebleId}/{subcarpeta}/{allFiles=**}')).toBe(true);
  });

  it('la app no necesita list() ni updateMetadata(): cerrarlos no rompe nada', () => {
    const fuente = readFileSync(rutaDeFuente('src/lib/firebase.ts'), 'utf8');
    expect(fuente).not.toMatch(/\blistAll\s*\(/);
    expect(fuente).not.toMatch(/\blist\s*\(\s*ref/);
    expect(fuente).not.toMatch(/updateMetadata|getMetadata/);
    expect(fuente).not.toMatch(/uploadBytesResumable/);
    // y toda subida declara un contentType explícito o con reserva segura
    expect(fuente).toMatch(/uploadBytes\([^,]+,\s*[^,]+,\s*\{\s*contentType:/);
  });

  it('los borrados del cliente pasan por la ruta guardada (sin prefijos falsos)', () => {
    const fuente = readFileSync(rutaDeFuente('src/lib/firebase.ts'), 'utf8');
    expect(fuente).toMatch(/startsWith\('local_'\)/);
    expect(fuente).toMatch(/startsWith\('server_'\)/);
  });
});

// ==========================================================================
// firestore.rules · metadatos y coherencia con el archivo físico
// (en este bloque NO se cambian las reglas: se certifican los invariantes y
//  se cerrojan los accesos públicos existentes)
// ==========================================================================

describe('firestore.rules · metadatos de documentos y URLs', () => {
  /**
   * Único acceso público admitido hoy (arquitectura de portales por token y
   * catálogo). Cualquier colección nueva con `if true` hace fallar el test y
   * obliga a pasar por la auditoría.
   */
  const PUBLICO_AUTORIZADO: Record<string, string> = {
    '/inmuebles/{inmuebleId}': 'catálogo público hasta que la ficha pública de R3 esté integrada en la rama (GAP G-2)',
    '/candidatos/{candidatoId}': 'portal de visita por token (sólo get; list ya exige sesión)',
    '/invitaciones/{invitacionId}': 'confirmación de visita por token (GAP G-3)',
    '/slots_visita/{slotId}': 'reserva de turno pública (GAP G-3)',
    '/solicitudes_documentacion/{solicitudDocId}': 'portal de documentación del candidato (GAP G-3)',
    '/profesionales/{profesionalId}': 'ficha de contacto del profesional',
    '/enlaces_registro/{enlaceId}': 'validación pública del token de registro',
    '/especialidades/{especialidadId}': 'catálogo de especialidades',
  };

  it('el conjunto de colecciones con acceso público es exactamente el registrado', () => {
    const publicos: string[] = [];
    for (const b of BLOQUES_FIRESTORE) {
      if (b.patron === '/{document=**}' || b.permisos.length === 0) continue;
      if (b.permisos.some((p) => p.condicion === 'true')) publicos.push(b.patron);
    }
    expect(publicos.sort()).toEqual(Object.keys(PUBLICO_AUTORIZADO).sort());
    // Cada acceso público registrado tiene que estar explicado en la auditoría.
    for (const patron of publicos) {
      const coleccion = patron.replace(/^\//, '').split('/')[0];
      expect(AUDITORIA, coleccion).toContain(coleccion);
    }
  });

  it('#2/#4 las colecciones de documentos privados exigen sesión y titularidad', () => {
    // Predicados REALES de este fichero de reglas (no se inventan ninguno):
    // el acceso a un documento privado exige titularidad, rol o ser el admin.
    const INDICIO_TITULARIDAD =
      /myPropId\(\)|myInmuebleIds\(\)|canReachInmuebleId\(|aisladoVisible\(|aisladoEsMio\(|contratoVisible\(|contratoEsMio\(|gastoVisible\(|gastoEsMio\(|facturaVisible\(|facturaEsMia\(|liqEsMia\(|movimientoVisible\(|movimientoEsMio\(|incidenciaAsignadaAmi\(|myProfId\(\)|isMasterAdmin\(\)/;
    const privados = [
      '/contratos_formalizacion/{contratoId}',
      '/gastos/{gastoId}',
      '/evidencias_morosidad/{evidenciaId}',
      '/expedientes_morosidad/{expedienteId}',
      '/inventario_inmuebles/{inventarioId}',
      '/facturas/{facturaId}',
      '/facturas_electronicas_b2b/{febId}',
      '/incidencias/{incidenciaId}',
      '/trabajos_profesionales/{trabajoId}',
      '/presupuestos_profesionales/{presupuestoId}',
      '/polizas_seguros/{polizaId}',
      '/siniestros/{siniestroId}',
      '/liquidaciones_propietarios/{liqId}',
      '/movimientos_bancarios/{movimientoId}',
      '/gastos_inmuebles/{gastoId}',
      '/compromisos_morosidad/{compromisoId}',
      '/expedientes_morosidad_hist/{transicionId}',
    ];
    for (const patron of privados) {
      const permisos = permisosFirestore(patron);
      const lectura = permisos.filter((p) => p.acciones.includes('get') || p.acciones.includes('list'));
      expect(lectura.length, `${patron} no declara reglas de lectura`).toBeGreaterThan(0);
      for (const p of lectura) {
        expect(p.condicion, `${patron} no puede ser de lectura pública`).not.toBe('true');
        expect(p.condicion, `${patron}: ${p.condicion}`).toMatch(/isSignedIn\(\)|isPropietarioRole\(\)|isProfesionalRole\(\)|isMasterAdmin\(\)|isUsuarioInterno\(\)/);
      }
      expect(
        lectura.some((p) => INDICIO_TITULARIDAD.test(p.condicion)),
        `${patron} no comprueba la titularidad del documento`,
      ).toBe(true);
    }
  });

  it('#5/#6 un rol no autorizado no puede crear documentos ajenos', () => {
    // Los profesionales sólo escriben sus propios trabajos/presupuestos.
    const trabajos = permisosFirestore('/trabajos_profesionales/{trabajoId}');
    const create = trabajos.find((p) => p.acciones.includes('create'));
    expect(create?.condicion).toMatch(/isMasterAdmin\(\)|aisladoCreateOk\(\)/);
    const borrado = trabajos.find((p) => p.acciones.includes('delete'));
    expect(borrado?.condicion).toMatch(/myPropId\(\)|isMasterAdmin\(\)/);
    // Y los justificantes de un propietario no los borra un tercero: la
    // colección de gastos exige titularidad también en el borrado.
    const gastos = permisosFirestore('/gastos/{gastoId}');
    const deleteGasto = gastos.find((p) => p.acciones.includes('delete'));
    expect(deleteGasto?.condicion).toMatch(/isMasterAdmin\(\)|myPropId\(\)|aislado/);
  });

  it('#13/#14 ninguna colección de documentos admite escritura anónima fuera del registro', () => {
    const escrituraAnonima: string[] = [];
    for (const b of BLOQUES_FIRESTORE) {
      if (b.patron === '/{document=**}' || b.permisos.length === 0) continue;
      const escribe = b.permisos.filter((p) => p.acciones.some((a) => a === 'create' || a === 'update'));
      if (escribe.length > 0 && escribe.every((p) => p.condicion === 'true')) escrituraAnonima.push(b.patron);
    }
    expect(escrituraAnonima.sort()).toEqual([
      '/invitaciones/{invitacionId}',
      '/slots_visita/{slotId}',
      '/solicitudes_documentacion/{solicitudDocId}',
    ]);
  });

  it('#12 las URL públicas que salen de Firestore apuntan a rutas legibles por diseño', () => {
    // `downloadURL`/`storagePath` se guardan en Firestore; lo público es sólo lo
    // que R3 proyecta. Ningún campo de documento privado puede abrirse en el
    // portal: se comprueba que las reglas del portal no exponen estas colecciones.
    for (const coleccion of ['contratos_formalizacion', 'gastos', 'gastos_inmuebles', 'evidencias_morosidad', 'inventario_inmuebles', 'liquidaciones_propietarios']) {
      const bloques = BLOQUES_FIRESTORE.filter((b) => b.patron.includes(coleccion));
      for (const b of bloques) {
        expect(b.permisos.some((p) => p.condicion === 'true'), `${b.patron} no debe ser de lectura pública`).toBe(false);
      }
    }
  });

  it('el aislamiento por propietario de Firestore existe (contraste con el residual G-1 de Storage)', () => {
    const inmuebles = permisosFirestore('/inmuebles/{inmuebleId}');
    expect(inmuebles.some((p) => p.acciones.includes('update') && /myPropId\(\)|canReachInmuebleId\(/.test(p.condicion))).toBe(true);
    expect(inmuebles.some((p) => p.acciones.includes('delete') && p.condicion.includes('isMasterAdmin()'))).toBe(true);
    // Y el hueco que cierra R3 (no en esta rama): aquí `inmuebles` se lee en claro.
    expect(inmuebles.some((p) => p.acciones.includes('get') && p.condicion === 'true')).toBe(true);
    expect(AUDITORIA).toContain('G-2');
  });

  it('denegación global por defecto presente y última en los dos ficheros de reglas', () => {
    const catchAll = BLOQUES_FIRESTORE.filter((b) => b.patron === '/{document=**}');
    expect(catchAll).toHaveLength(1);
    expect(catchAll[0].permisos).toEqual([{ acciones: ['get', 'list', 'create', 'update', 'delete'], condicion: 'false' }]);
    const otros = BLOQUES_FIRESTORE.filter((b) => b.patron !== '/{document=**}' && b.permisos.length > 0);
    expect(catchAll[0].lineaInicio).toBeGreaterThan(Math.max(...otros.map((b) => b.lineaInicio)));
    expect(BLOQUES_STORAGE[BLOQUES_STORAGE.length - 1].patron).toBe('/{allPaths=**}');
  });
});

// ==========================================================================
// deudas registradas (ratchet): no crecen, no se ocultan
// ==========================================================================

describe('deuda de datos: base64 en Firestore y caché en localStorage', () => {
  /**
   * Ficheros que hoy arrastran contenido en base64 hacia el estado persistido o
   * hacia el servidor. La auditoría NO los migra: hacerlo cambiaría el modelo de
   * datos y tocaría R1/R2/R3 y el portal del candidato (GAP G-4). Este cerrojo
   * falla si la lista CRECE.
   */
  const DEUDA_BASE64 = [
    'src/App.tsx',
    'src/components/CandidateModal.tsx',
    'src/components/CrearSolicitudSeguroModal.tsx',
    'src/components/DetalleSolicitudDocModal.tsx',
    'src/components/DetalleSolicitudSeguroModal.tsx',
    'src/components/DocumentUploadModal.tsx',
    'src/components/DocumentosListSection.tsx',
    'src/components/PortalDocumentacionPublicaView.tsx',
    'src/components/modals/DetallePolizaModal.tsx',
    'src/lib/firebase.ts',
    'src/lib/gmailClient.ts',
    'src/utils/morosidad/morosidadEngine.test.ts',
  ];

  function ficherosConBase64(): string[] {
    const re = /(base64Data|documentBase64|fileBase64)\s*:/;
    return listarFicheros('src/', ['.ts', '.tsx']).filter((rel) => re.test(readFileSync(rutaDeFuente(rel), 'utf8')));
  }

  it('#14 la deuda de base64 no ha crecido y está documentada', () => {
    const encontrados = ficherosConBase64();
    expect(encontrados).toEqual(DEUDA_BASE64);
    expect(AUDITORIA).toContain('G-4');
    expect(AUDITORIA).toMatch(/base64/i);
  });

  /** Claves de caché local existentes (mismo criterio: ratchet, no mejora). */
  const DEUDA_LOCALSTORAGE = [
    'rentselect_active_session',
    'rentselect_candidatos',
    'rentselect_contratos',
    'rentselect_current_user_id',
    'rentselect_inmuebles',
    'rentselect_invitaciones',
    'rentselect_propietarios',
    'rentselect_slots',
    'rentselect_solicitudes',
    'rentselect_solicitudes_doc',
    'rentselect_solicitudes_seguro',
  ];

  function clavesLocalStorage(): string[] {
    const re = /localStorage\.(?:setItem|getItem|removeItem)\(\s*'([^']+)'/g;
    const claves = new Set<string>();
    for (const rel of listarFicheros('src/', ['.ts', '.tsx'])) {
      const fuente = readFileSync(rutaDeFuente(rel), 'utf8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(fuente))) claves.add(m[1]);
    }
    return [...claves].sort();
  }

  it('#13 no hay caché local de evidencias, justificantes ni documentos de morosidad', () => {
    const claves = clavesLocalStorage();
    expect(claves).toEqual(DEUDA_LOCALSTORAGE);
    expect(claves.some((k) => /morosidad|evidencia|justificante|factura|poliza|inventario|storage/i.test(k))).toBe(false);
    // El borrador del cuestionario público se guarda con su propio prefijo y sin adjuntos.
    const cuestionario = readFileSync(rutaDeFuente('src/components/CuestionarioPublicoView.tsx'), 'utf8');
    expect(cuestionario).toMatch(/cuestionario_draft_v2_/);
    expect(cuestionario).not.toMatch(/base64Data|localStorage\.setItem\([^)]*downloadURL/);
  });

  it('G-5 registrado: la caché offline de inmuebles/contratos es deuda consciente', () => {
    for (const clave of ['rentselect_inmuebles', 'rentselect_contratos', 'rentselect_solicitudes_doc', 'rentselect_propietarios']) {
      expect(AUDITORIA, clave).toContain(clave);
    }
  });
});

// ==========================================================================
// servidor de documentos: lo que sí se puede ejecutar de verdad
// ==========================================================================

describe('server.ts · almacén y cabeceras de documentos privados', () => {
  it('#12 S-1 un Content-Type hostil no se sirve inline desde el origen de la app', () => {
    expect(normalizarTipoContenido('text/html', 'factura.html')).toEqual({ tipo: 'application/octet-stream', permitirInline: false });
    expect(normalizarTipoContenido('image/svg+xml', 'logo.svg')).toEqual({ tipo: 'application/octet-stream', permitirInline: false });
    expect(normalizarTipoContenido('application/javascript', 'x.js')).toEqual({ tipo: 'application/octet-stream', permitirInline: false });
    expect(normalizarTipoContenido('image/png', 'foto.png')).toEqual({ tipo: 'image/png', permitirInline: true });
    expect(normalizarTipoContenido('application/pdf', 'contrato.pdf')).toEqual({ tipo: 'application/pdf', permitirInline: true });
    expect(normalizarTipoContenido('video/mp4', 'a.mp4').permitirInline).toBe(false); // no se previsualiza: se descarga
    expect(normalizarTipoContenido('', 'otro.pdf').tipo).toBe('application/pdf');
    expect(normalizarTipoContenido('', 'desconocido').tipo).toBe('application/octet-stream');
    // el tipo se normaliza (mayúsculas, parámetros) y un tipo desconocido cae a octet-stream
    expect(normalizarTipoContenido(' IMAGE/PNG ; charset=utf-8', 'a').tipo).toBe('image/png');
    expect(normalizarTipoContenido('IMAGE/PDF', 'a').tipo).toBe('application/octet-stream');
  });

  it('S-2 las cabeceras impiden cachear y olfatear el documento', () => {
    const h = cabecerasDocumento('application/pdf', true, 'contrato-alquiler.pdf');
    expect(h['Cache-Control']).toBe('private, no-store, max-age=0');
    expect(h['Cache-Control']).not.toMatch(/public|max-age=[1-9]/);
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Content-Disposition']).toMatch(/^inline;/);
    const h2 = cabecerasDocumento('application/octet-stream', false, 'documento.svg');
    expect(h2['Content-Disposition']).toMatch(/^attachment;/);
    expect(h2['Content-Type']).toBe('application/octet-stream');
  });

  it('#9/#10 S-5 un nombre de fichero no inyecta cabeceras ni rutas', () => {
    const nombre = nombreMostrable('a.png\r\nX-Evil: 1"onload=alert(1)');
    expect(nombre).not.toMatch(/[\r\n"]/);
    const h = cabecerasDocumento('image/png', true, nombre);
    for (const valor of Object.values(h)) {
      expect(valor).not.toMatch(/[\r\n]/);
    }
    expect(nombreMostrable('')).toBe('documento');
    expect(nombreMostrable('../../etc/passwd')).not.toMatch(/[\\/]/);
    expect(nombreMostrable('x'.repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it('#15 S-3 el id del documento es inenumerable y se valida en la lectura', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generarIdDocumento()));
    expect(ids.size).toBe(200);
    const [ejemplo] = [...ids];
    expect(ejemplo).toMatch(/^doc_[0-9a-f]{32}$/);
    expect(idDeDocumentoValido(ejemplo)).toBe(true);
    for (const malo of ['doc_1700000000_abcde', '../doc_x', 'doc_' + 'Z'.repeat(32), '', 'doc_', 'server_1', null, 42]) {
      expect(idDeDocumentoValido(malo), String(malo)).toBe(false);
    }
  });

  it('#8/#14 S-4 el almacén acota tamaño, entradas y caducidad', () => {
    const deco = decodificarBase64Documento('data:image/png;base64,aGVsbG8=');
    expect(deco.ok).toBe(true);
    expect(deco.buffer?.length).toBe(5);
    expect(decodificarBase64Documento(undefined).ok).toBe(false);
    expect(decodificarBase64Documento('esto no es base64 !!!').ok).toBe(false);
    expect(decodificarBase64Documento('data:text/plain,hola').ok).toBe(false);
    expect(decodificarBase64Documento('').ok).toBe(false);
    const gigante = 'A'.repeat(Math.ceil(((MAX_BYTES_POR_DOCUMENTO + 10) * 4) / 3));
    expect(decodificarBase64Documento(gigante).error).toMatch(/m\u00e1ximo/);

    let reloj = Date.parse('2026-01-01T00:00:00.000Z');
    const idCon = (letra: string) => `doc_${'0'.repeat(31)}${letra}`;
    const almacen = new AlmacenDocumentosEfimeros({ maxEntradas: 3, maxBytes: 3000, ttlMs: 1000, ahora: () => reloj });
    const poner = (letra: string, bytes: number, cuando = reloj) =>
      almacen.set(idCon(letra), {
        buffer: Buffer.alloc(bytes),
        mimeType: 'application/pdf',
        filename: 'x.pdf',
        uploadedAt: new Date(cuando).toISOString(),
        permitirInline: true,
        bytes,
      });

    expect(poner('a', 100).ok).toBe(true);
    expect(poner('a', 100).motivo).toBe('id_ya_existe'); // inmutabilidad: no se sobrescribe
    expect(
      almacen
        .set('doc_forma-invalida', {
          buffer: Buffer.alloc(1),
          mimeType: 'application/pdf',
          filename: 'x',
          uploadedAt: new Date(reloj).toISOString(),
          permitirInline: true,
          bytes: 1,
        })
        .motivo,
    ).toBe('id_no_valido');
    poner('b', 100);
    poner('c', 100);
    poner('d', 100);
    expect(almacen.tamano).toBe(3); // desalojo por LRU
    expect(almacen.get(idCon('a'))).toBeNull(); // el más antiguo ya no está
    expect(almacen.bytes).toBeLessThanOrEqual(3000);

    reloj += 2000;
    expect(almacen.get(idCon('d'))).toBeNull(); // TTL
    expect(almacen.purgar()).toBeGreaterThanOrEqual(1);

    const chico = new AlmacenDocumentosEfimeros({ maxBytes: 100, maxEntradas: 10, ahora: () => reloj });
    expect(
      chico
        .set(idCon('e'), {
          buffer: Buffer.alloc(1000),
          mimeType: 'application/pdf',
          filename: 'x.pdf',
          uploadedAt: new Date(reloj).toISOString(),
          permitirInline: true,
          bytes: 1000,
        })
        .motivo,
    ).toBe('documento_demasiado_grande');
    expect(chico.tamano).toBe(0);
  });

  it('server.ts usa el módulo y conserva el contrato de la respuesta del cliente', () => {
    const fuente = readFileSync(rutaDeFuente('server.ts'), 'utf8');
    expect(fuente).toContain("from './src/lib/documentosServidor'");
    expect(fuente).toContain('new AlmacenDocumentosEfimeros()');
    expect(fuente).toContain('generarIdDocumento()');
    expect(fuente).toContain('idDeDocumentoValido(fileId)');
    expect(fuente).toContain('cabecerasDocumento(');
    // ya no queda ninguno de los patrones vulnerables auditados
    expect(fuente).not.toMatch(/Cache-Control',\s*'public/);
    expect(fuente).not.toMatch(/max-age=86400/);
    expect(fuente).not.toMatch(/Math\.random\(\)\.toString\(36\)\.substring\(2, 7\)/);
    expect(fuente).not.toMatch(/new Map<\s*string,\s*\{ buffer: Buffer/);
    expect(fuente).not.toMatch(/rawBase64\.split\(';base64,'\)/);
    // el contrato que consume el cliente sigue intacto
    for (const clave of ['fileId,', 'url: fileUrl', 'downloadURL: fileUrl', 'storagePath: `server_${fileId}`', 'mimeType: tipo', 'size: buffer.length']) {
      expect(fuente, clave).toContain(clave);
    }
    expect(fuente).toMatch(/const \{ tipo, permitirInline \} = normalizarTipoContenido\(mimeType, filename\)/);
    // y el único consumo de este módulo es el servidor (no entra en el bundle cliente)
    const clientes = listarFicheros('src/', ['.ts', '.tsx']).filter((rel) =>
      readFileSync(rutaDeFuente(rel), 'utf8').includes('documentosServidor'),
    );
    expect(clientes).toEqual([]);
  });

  it('ningún componente guarda en el estado una URL de documento sin prefijo conocido', () => {
    // El cliente sólo construye rutas Storage con prefijos literales declarados.
    const fuente = readFileSync(rutaDeFuente('src/lib/firebase.ts'), 'utf8');
    const prefijos = [...fuente.matchAll(/const storagePath = `([a-z_]+)\//g)].map((m) => m[1]);
    expect(prefijos.length).toBeGreaterThanOrEqual(12);
    const declarados = BLOQUES_STORAGE.map((b) => b.patron.replace(/^\//, '').split('/')[0]);
    for (const prefijo of new Set(prefijos)) {
      expect(declarados, `prefijo ${prefijo} sin bloque en storage.rules`).toContain(prefijo);
    }
  });
});
