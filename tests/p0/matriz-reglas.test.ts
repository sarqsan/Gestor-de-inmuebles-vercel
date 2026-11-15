/**
 * P0-A · MATRIZ DE POLÍTICAS DECLARADAS (Firestore + Storage)
 * ===========================================================
 * Objetivo: que NINGUNA colección quede sin política documentada y que el
 * inventario no se desactualice en silencio.
 *
 * LÍMITE IMPORTANTE Y EXPLÍCITO:
 *   Estas pruebas verifica la POLÍTICA DECLARADA en el texto de las reglas.
 *   NO sustituyen al motor de reglas: la verificación de comportamiento
 *   (autorizado/no autorizado por rol) vive en `tests/emulador/*` y requiere
 *   JRE + `firebase-tools`. Ver informe P0 (§Cobertura).
 *
 * Las pruebas son de estructura y de invariantes, no de interpretación: no
 * evalúan condiciones (eso lo hace el motor), pero garantizan que:
 *   · toda colección declara al menos una política;
 *   · ninguna colección queda abierta a `if true` sin ser intencional;
 *   · el borrado está restringido en las colecciones que lo exigen;
 *   · los invariantes de seguridad que P0 debía PRESERVAR siguen intactos.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extraerAllows,
  extraerBloques,
  inventariarDestinosServidor,
  inventariarFirestore,
  inventariarStorage,
  sinComentarios,
} from '../../scripts/p0/inventario-reglas.mjs';

const RAIZ = resolve(__dirname, '../..');
const INVENTARIO = inventariarFirestore(resolve(RAIZ, 'firestore.rules'));
const STORAGE = inventariarStorage(resolve(RAIZ, 'storage.rules'));
const DESTINOS = inventariarDestinosServidor(resolve(RAIZ, 'server/documentos/autorizacionDocumental.ts'));
const REGLAS_TXT = sinComentarios(readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8'));

describe('P0-A · inventario de Firestore', () => {
  it('el inventario no está vacío y coincide con el recuento declarado', () => {
    expect(INVENTARIO.totalColecciones).toBeGreaterThan(50);
    expect(INVENTARIO.colecciones).toHaveLength(INVENTARIO.totalColecciones);
  });

  it('NO existe ninguna colección sin política declarada', () => {
    const sinPolitica = INVENTARIO.colecciones.filter((c) => c.sentenciasAllow === 0);
    expect(sinPolitica, `Colecciones sin allow: ${sinPolitica.map((c) => c.coleccion).join(', ')}`).toEqual([]);
  });

  it('todas las colecciones tienen nombre válido y único', () => {
    // `{document=**}` es el comodín de denegación global, no una colección.
    const nombres = INVENTARIO.colecciones
      .map((c) => c.coleccion)
      .filter((n) => !n.includes('{'));
    expect(nombres.every((n) => n && /^[A-Za-z0-9_]+$/.test(n))).toBe(true);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('el recuento real es 77 colecciones + 4 subcolecciones (auditoría decía ~80)', () => {
    // Se fija el número para que cualquier cambio exija actualizar el inventario
    // y el informe: el objetivo es detectar deriva, no impedirla.
    expect(INVENTARIO.totalColecciones).toBe(77);
    expect(INVENTARIO.subcolecciones).toHaveLength(4);
    expect(INVENTARIO.subcolecciones.map((s) => s.ruta).sort()).toEqual([
      '/documentos_patrimoniales/{documentoId}',
      '/documentos_profesionales/{documentoId}',
      '/entidades/{entidadKey}',
      '/progreso_tutoriales/{progresoId}',
    ]);
  });

  it('existe denegación global por defecto al final del fichero', () => {
    expect(REGLAS_TXT).toMatch(/match\s+\/\{document=\*\*\}/);
    const bloqueFinal = REGLAS_TXT.slice(REGLAS_TXT.lastIndexOf('match /{document=**}'));
    expect(bloqueFinal).toMatch(/allow\s+read\s*,\s*write\s*:\s*if\s+false/);
  });

  it('las colecciones abiertas (`if true`) son SOLO las de lectura pública justificada', () => {
    // Se fija la lista blanca: cualquier colección nueva que se abra a `if true`
    // hará fallar esta prueba y exigirá una decisión explícita.
    const abiertas = INVENTARIO.colecciones
      .filter((c) => Object.entries(c.permite).some(([, cond]) => /^\s*true\s*$/.test(String(cond))))
      .map((c) => c.coleccion)
      .sort();
    expect(abiertas).toEqual(['especialidades', 'fichas_publicas_inmueble']);

    // Y ninguna de ellas puede estar abierta a ESCRITURA.
    for (const nombre of abiertas) {
      const c = INVENTARIO.colecciones.find((x) => x.coleccion === nombre)!;
      for (const op of ['create', 'update', 'delete', 'write', 'create,update,delete']) {
        expect(c.permite[op], `${nombre} abierta a ${op}`).not.toBe('true');
      }
    }
  });
});

describe('P0-A · invariantes de seguridad que P0 debía PRESERVAR', () => {
  const porNombre = (n) => INVENTARIO.colecciones.find((c) => c.coleccion === n);

  it('trabajos_profesionales: el profesional NO puede crear (solo master o propietario)', () => {
    const c = porNombre('trabajos_profesionales');
    const create = c.permite.create || '';
    expect(create).toBeTruthy();
    // La única rama de create es master o el predicado de propietario.
    expect(create).toMatch(/aisladoCreateOk/);
    expect(create).not.toMatch(/isProfesionalRole/);
  });

  it('presupuestos_profesionales: el profesional SÍ puede crear el suyo (capacidad existente)', () => {
    const create = porNombre('presupuestos_profesionales').permite.create || '';
    expect(create).toMatch(/isProfesionalRole/);
    expect(create).toMatch(/myProfId/);
  });

  it('usuarios_auth: el borrado está prohibido (ni el master borra el binding)', () => {
    expect(porNombre('usuarios_auth').permite.delete).toBe('false');
  });

  it('usuarios_auth: create/update exigen auditoría vinculada al master', () => {
    const c = porNombre('usuarios_auth');
    expect(c.permite.create).toMatch(/auditoriaVinculada/);
    expect(c.permite.update).toMatch(/auditoriaNueva/);
  });

  it('usuarios_auth: el propio usuario no puede autoasignarse carteras', () => {
    const c = porNombre('usuarios_auth');
    expect(c.permite.create).toMatch(/carterasNoAutoasignadasEnCreacion/);
    expect(c.permite.update).toMatch(/carterasSinCambiarPorUsuario/);
  });

  it('audit_logs es append-only: update y delete denegados', () => {
    const c = porNombre('audit_logs');
    const denegaciones = Object.entries(c.permite)
      .filter(([, cond]) => cond === 'false')
      .map(([op]) => op);
    // La regla declara `allow update, delete: if false;`
    expect(denegaciones.join('|')).toContain('update');
    expect(denegaciones.join('|')).toContain('delete');
    expect(c.permite.read).toBe('isMasterAdmin()');
  });

  it('inmuebles mantiene el listado acotado (no `isSignedIn`)', () => {
    const list = porNombre('inmuebles').permite.list || '';
    expect(list).not.toMatch(/isSignedIn\s*\(\s*\)/);
    expect(list).toMatch(/esAdminInmuebles|inmuebleEsMio/);
  });

  it('notificaciones sigue sin permitir listar al inquilino (estado previo a P2)', () => {
    const list = porNombre('notificaciones').permite.list || '';
    expect(list).not.toMatch(/isTenant\s*\(\s*\)/);
  });

  it('las colecciones económicas exigen ámbito de propietario/cartera', () => {
    for (const nombre of ['gastos', 'liquidaciones_propietarios', 'mandatos_sepa', 'facturas']) {
      const c = porNombre(nombre);
      expect(c, `falta ${nombre}`).toBeTruthy();
      const todo = Object.values(c.permite).join(' ');
      expect(todo, `${nombre} sin ámbito`).toMatch(/myPropId|cartera|ambito|isMasterAdmin/);
    }
  });

  it('ninguna colección concede borrado a `isSignedIn()` sin más', () => {
    const malas = INVENTARIO.colecciones.filter((c) =>
      /^\s*isSignedIn\s*\(\s*\)\s*$/.test(String(c.permite.delete || '')),
    );
    expect(malas.map((c) => c.coleccion)).toEqual([]);
  });
});

describe('P0-A · Storage', () => {
  it('toda ruta de Storage declara política', () => {
    expect(STORAGE.rutas.length).toBeGreaterThan(0);
    for (const r of STORAGE.rutas) expect(r.permite.length).toBeGreaterThan(0);
  });

  it('el SDK de cliente NO puede escribir en Storage', () => {
    const txt = sinComentarios(readFileSync(resolve(RAIZ, 'storage.rules'), 'utf8'));
    expect(txt).toMatch(/allow\s+create\s*,\s*update\s*,\s*delete\s*:\s*if\s+false/);
  });

  it('solo la foto de catálogo es pública y no se puede listar', () => {
    const txt = sinComentarios(readFileSync(resolve(RAIZ, 'storage.rules'), 'utf8'));
    expect(txt).toMatch(/allow\s+get\s*:\s*if\s+true/);
    expect(txt).toMatch(/allow\s+list\s*:\s*if\s+false/);
  });

  it('deniega todo lo no contemplado con comodín final', () => {
    expect(STORAGE.rutas.some((r) => r.ruta.includes('allPaths'))).toBe(true);
  });
});

describe('P0-A · destinos documentales autorizados en servidor', () => {
  it('están inventariados los destinos P3/P5', () => {
    expect(DESTINOS.length).toBeGreaterThanOrEqual(20);
    const claves = DESTINOS.map((d) => d.clave);
    for (const requerido of ['CONTRATO_DOCUMENTO', 'RECIBO', 'GASTOS_FACTURAS',
      'INCIDENCIA_EVIDENCIA', 'INMUEBLE_DOCUMENTO_PATRIMONIAL', 'PROFESIONAL_DOCUMENTO']) {
      expect(claves, `falta destino ${requerido}`).toContain(requerido);
    }
  });

  it('cada destino declara un patrón de ruta', () => {
    for (const d of DESTINOS) expect(d.patron.length).toBeGreaterThan(10);
  });
});

describe('P0-A · helpers de extracción (contrato del propio inventario)', () => {
  it('extrae bloques y allows de un fragmento sintético', () => {
    // Indentación real del proyecto: 4 espacios para el bloque de colección.
    const txt = [
      "rules_version = '2';",
      'service cloud.firestore {',
      '  match /databases/{database}/documents {',
      '    match /demo/{id} {',
      '      allow read: if true;',
      '      allow create, update: if request.auth != null;',
      '      function localFn() { return true; }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const bloques = extraerBloques(txt, { soloPrimerNivel: true });
    expect(bloques).toHaveLength(1);
    expect(bloques[0].ruta).toBe('/demo/{id}');
    const allows = extraerAllows(bloques[0].cuerpo);
    expect(allows.map((a) => a.operaciones.join(','))).toEqual(['read', 'create,update']);
  });

  it('ignora comentarios (un allow comentado no cuenta)', () => {
    const txt = [
      '    match /x/{id} {',
      '      // allow read: if true;',
      '      /* allow write: if true; */',
      '      allow get: if request.auth != null;',
      '    }',
    ].join('\n');
    const bloques = extraerBloques(txt, { soloPrimerNivel: true });
    expect(bloques).toHaveLength(1);
    const allows = extraerAllows(bloques[0].cuerpo);
    expect(allows).toHaveLength(1);
    expect(allows[0].operaciones).toEqual(['get']);
  });

  it('NO atribuye al padre los allow de un sub-bloque anidado', () => {
    const txt = [
      '    match /padre/{id} {',
      '      allow read: if request.auth != null;',
      '      allow delete: if false;',
      '      match /hijo/{cid} {',
      '        allow delete: if request.auth.uid == id;',
      '      }',
      '    }',
    ].join('\n');
    const padre = extraerBloques(txt, { soloPrimerNivel: true });
    expect(padre).toHaveLength(1);
    const allows = extraerAllows(padre[0].cuerpo);
    // Solo las dos del padre; el delete del hijo NO se cuela.
    expect(allows.map((a) => a.operaciones.join(','))).toEqual(['read', 'delete']);
    expect(allows.find((a) => a.operaciones.includes('delete'))!.condicion).toBe('false');
  });
});
