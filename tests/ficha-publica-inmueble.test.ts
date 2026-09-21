/**
 * R3 — Seguridad de la ficha pública de inmueble.
 * Suite auto-contenida:
 *  A. Constructor de ficha: lista blanca cerrada (los privados no salen).
 *  B. Resolución anónima con Firestore mockeado (solo toca el espejo).
 *  C. Invariantes textuales de `firestore.rules` (§1 endurecido + espejo R3).
 *  D. Invariantes textuales de `storage.rules` (inventario ya no público).
 *  E. Tripwires: R1/R2 intactos.
 *
 * Estos tests comprueban seguridad real del flujo (qué datos salen y qué
 * reglas lo permiten), no que un componente oculte campos.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks Firestore (mínimo para el módulo R3)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const docCalls: Array<{ col: string; id: string }> = [];
  let denyGet = false;
  return { store, docCalls, denyGet };
});

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => {
    mem.docCalls.push({ col, id });
    return { __col: col, __id: id };
  },
  getDoc: async (r: { __col: string; __id: string }) => {
    if (mem.denyGet) throw new Error('permission-denied');
    const v = mem.store.get(`${r.__col}/${r.__id}`);
    return { exists: () => v !== undefined, data: () => v };
  },
  setDoc: async (r: { __col: string; __id: string }, data: unknown) => {
    mem.store.set(`${r.__col}/${r.__id}`, data);
  },
  deleteDoc: async (r: { __col: string; __id: string }) => {
    mem.store.delete(`${r.__col}/${r.__id}`);
  },
}));

vi.mock('../src/lib/firebase', () => ({ db: {} }));

import {
  CAMPOS_FICHA_PUBLICA,
  CAMPOS_PRIVADOS_INMUEBLE,
  FICHAS_PUBLICAS_COL,
  adaptarFichaAInmuebleVista,
  buildFichaPublicaInmueble,
  candidatosIdFichaPublica,
  cargarFichaPublicaPorToken,
  deleteFichaPublicaInmueble,
  getFichaPublicaInmueble,
  saveFichaPublicaInmueble,
} from '../src/lib/fichaPublicaInmueble';
import type { Inmueble } from '../src/types';

// ---------------------------------------------------------------------------
// Fixture: inmueble completo con TODOS los privados poblados
// ---------------------------------------------------------------------------
const INMUEBLE_COMPLETO: Inmueble = {
  id: 'inm_1',
  tokenSolicitud: 'tok-SECRETO-xyz',
  direccion: 'Calle Mayor 1, 2B',
  ciudad: 'Alicante',
  precio: 950,
  estado: 'disponible',
  habitaciones: 3,
  banos: 2,
  superficie: 90,
  descripcion: 'Piso luminoso cerca del centro.',
  imagenUrl: 'https://fotos.test/portada.jpg',
  images: [
    {
      id: 'img_pub',
      storagePath: 'inmuebles/inm_1/img_pub_salon.jpg',
      downloadURL: 'https://fotos.test/salon.jpg',
      order: 2,
      isCover: false,
      isPublic: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      nombreOriginal: 'salon.jpg',
      tamañoBytes: 12345,
    },
    {
      id: 'img_cover',
      storagePath: 'inmuebles/inm_1/img_cover_fachada.jpg',
      downloadURL: 'https://fotos.test/fachada.jpg',
      order: 9,
      isCover: true,
      isPublic: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'img_priv',
      storagePath: 'inmuebles/inm_1/img_priv_despacho.jpg',
      downloadURL: 'https://fotos.test/despacho.jpg',
      order: 1,
      isCover: false,
      isPublic: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'img_dataurl',
      storagePath: '',
      downloadURL: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      order: 0,
      isCover: false,
      isPublic: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  candidatosCount: 4,
  fianzaMeses: 2,
  referenciaCatastral: '1234567AB1234C0001XY',
  codigoPostal: '03001',
  datosCatastrales: {
    referenciaCatastral: '1234567AB1234C0001XY',
    superficieCatastralConstruida: 88,
    anioConstruccion: 1975,
    valorCatastral: 45000,
    usoCatastral: 'V: Vivienda',
    direccionCatastral: 'CL MAYOR 1',
    latitud: 38.345,
    longitud: -0.489,
    fuente: 'manual',
  },
  propietarioId: 'prop_A',
  propietarioPrincipalId: 'prop_A',
  propietarioSecundarioId: 'prop_B',
  cuentaBancariaCobroId: 'cta_1',
  ibanCobro: 'ES9121000418450200051332',
  datosFiscales: {
    referenciaCatastral: '1234567AB1234C0001XY',
    ibanCobro: 'ES9121000418450200051332',
    propietarioPrincipal: {
      nombre: 'Ana Propietaria',
      nifDni: '12345678Z',
      direccion: 'Calle Privada 99',
      telefono: '600111222',
      email: 'ana@privado.test',
    },
  },
  modalidadAlquiler: 'completo',
  tipoInmueble: 'piso',
  inquilinoActualId: 'inq_1',
  inquilinoActualNombre: 'Juan Inquilino',
  contratoActivoId: 'ctr_activo',
  valorAdquisicion: 180000,
  valoracionEstimada: 210000,
  rentabilidadEstimada: 5.1,
  fechaAdquisicion: '2020-05-01',
  notasInternas: 'No alquilar a estudiantes. Negociar.',
  alias: 'Piso centro',
  municipio: 'Alicante',
  provincia: 'Alicante',
  rentaMensual: 950,
  planta: '2',
  ascensor: true,
  terraza: false,
  balcon: true,
  interiorExterior: 'exterior',
  orientacion: 'sur',
  anioConstruccion: 1975,
  estadoConservacion: 'bueno',
  aireAcondicionado: true,
  calefaccion: false,
  cocinaEquipada: true,
  electrodomesticosIncluidos: true,
  armariosEmpotrados: true,
  tipoVentanas: 'PVC',
  tipoPersianas: 'aluminio',
  fechaActualizacionFicha: '2026-09-01',
  actualizadoPorFicha: 'admin@erp.test',
  suministroIds: ['sum_1'],
  contratoIdsAutorizados: ['ctr_activo'],
};

beforeEach(() => {
  mem.store.clear();
  mem.docCalls.length = 0;
  mem.denyGet = false;
});

// ---------------------------------------------------------------------------
// A. Constructor: lista blanca cerrada
// ---------------------------------------------------------------------------
describe('R3 buildFichaPublicaInmueble: solo lo publicable', () => {
  it('conserva los campos públicos con sus valores', () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO, '2026-09-21T00:00:00.000Z')!;
    expect(f).not.toBeNull();
    expect(f.id).toBe('inm_1');
    expect(f.inmuebleId).toBe('inm_1');
    expect(f.propietarioId).toBe('prop_A');
    expect(f.direccion).toBe('Calle Mayor 1, 2B');
    expect(f.ciudad).toBe('Alicante');
    expect(f.codigoPostal).toBe('03001');
    expect(f.precio).toBe(950);
    expect(f.estado).toBe('disponible');
    expect(f.habitaciones).toBe(3);
    expect(f.imagenUrl).toBe('https://fotos.test/portada.jpg');
    expect(f.fianzaMeses).toBe(2);
    expect(f.tipoInmueble).toBe('piso');
    expect(f.actualizadoEn).toBe('2026-09-21T00:00:00.000Z');
  });

  it('las claves emitidas están todas en CAMPOS_FICHA_PUBLICA (lista cerrada)', () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    const permitidas = new Set(CAMPOS_FICHA_PUBLICA);
    for (const k of Object.keys(f)) expect(permitidas.has(k)).toBe(true);
  });

  it('ningún campo de CAMPOS_PRIVADOS_INMUEBLE aparece en la ficha', () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    const claves = new Set(Object.keys(f));
    for (const p of CAMPOS_PRIVADOS_INMUEBLE) expect(claves.has(p)).toBe(false);
    expect(CAMPOS_FICHA_PUBLICA.filter((c) => (CAMPOS_PRIVADOS_INMUEBLE as readonly string[]).includes(c))).toEqual([]);
  });

  it('los valores sensibles no aparecen ni siquiera anidados (IBAN, NIF, notas, token, inquilino)', () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    const json = JSON.stringify(f);
    for (const secreto of [
      'ES9121000418450200051332',
      '12345678Z',
      'ana@privado.test',
      'No alquilar a estudiantes',
      'tok-SECRETO-xyz',
      'Juan Inquilino',
      'ctr_activo',
      '1234567AB1234C0001XY',
      '45000',
      '180000',
      'cta_1',
      'prop_B',
      'sum_1',
      '600111222',
    ]) {
      expect(json).not.toContain(secreto);
    }
  });

  it('imágenes: solo isPublic!==false con https, recortadas y portada primero', () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    expect(f.imagenes.map((i) => i.id)).toEqual(['img_cover', 'img_pub']);
    for (const img of f.imagenes) {
      expect(Object.keys(img).sort()).toEqual(
        ['downloadURL', 'id', 'isCover', 'isPublic', 'order', 'storagePath'].sort(),
      );
      expect(img.downloadURL.startsWith('https://')).toBe(true);
    }
    expect(JSON.stringify(f)).not.toContain('data:image');
    expect(JSON.stringify(f)).not.toContain('nombreOriginal');
    expect(JSON.stringify(f)).not.toContain('tamañoBytes');
    expect(JSON.stringify(f)).not.toContain('createdAt');
  });

  it('imagenUrl data-URL se elimina (nunca base64 en la ficha)', () => {
    const f = buildFichaPublicaInmueble({ ...INMUEBLE_COMPLETO, imagenUrl: 'data:image/png;base64,xx' })!;
    expect('imagenUrl' in f).toBe(false);
  });

  it('sin titular efectivo no hay ficha (cierre por defecto)', () => {
    const { propietarioId: _a, propietarioPrincipalId: _b, ...sinTitular } = INMUEBLE_COMPLETO;
    void _a;
    void _b;
    expect(buildFichaPublicaInmueble(sinTitular as Inmueble)).toBeNull();
    // Con solo principal sí (misma derivación que las reglas).
    const { propietarioId: _c, ...soloPrincipal } = INMUEBLE_COMPLETO;
    void _c;
    expect(buildFichaPublicaInmueble(soloPrincipal as Inmueble)!.propietarioId).toBe('prop_A');
  });

  it('adaptarFichaAInmuebleVista conserva lo que consumen las vistas públicas', () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    const v = adaptarFichaAInmuebleVista(f);
    expect(v.direccion).toBe('Calle Mayor 1, 2B');
    expect(v.precio).toBe(950);
    expect(v.ciudad).toBe('Alicante');
    expect(v.images).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// B. Resolución anónima: solo el espejo, cierre por defecto
// ---------------------------------------------------------------------------
describe('R3 resolución anónima (Firestore mockeado)', () => {
  it('candidatosIdFichaPublica: exacto y sol-<id>', () => {
    expect(candidatosIdFichaPublica('inm_1')).toEqual(['inm_1']);
    expect(candidatosIdFichaPublica('sol-inm_1')).toEqual(['sol-inm_1', 'inm_1']);
    expect(candidatosIdFichaPublica('  ')).toEqual([]);
    expect(candidatosIdFichaPublica('sol-')).toEqual(['sol-']);
  });

  it('acceso legítimo: id exacto devuelve la ficha', async () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    await saveFichaPublicaInmueble(f);
    const leida = await cargarFichaPublicaPorToken('inm_1');
    expect(leida?.id).toBe('inm_1');
    expect(leida?.precio).toBe(950);
  });

  it('enlace generado sol-<id> resuelve a la ficha', async () => {
    await saveFichaPublicaInmueble(buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!);
    mem.docCalls.length = 0;
    const leida = await cargarFichaPublicaPorToken('sol-inm_1');
    expect(leida?.id).toBe('inm_1');
    // Probó primero el token literal y luego el id sin prefijo.
    expect(mem.docCalls.map((c) => c.id)).toEqual(['sol-inm_1', 'inm_1']);
  });

  it('id manipulado/inexistente → null (sin datos, sin excepción)', async () => {
    await saveFichaPublicaInmueble(buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!);
    expect(await cargarFichaPublicaPorToken('inm_OTRO')).toBeNull();
    expect(await cargarFichaPublicaPorToken('')).toBeNull();
  });

  it('SEGURIDAD: el flujo público jamás toca la colección `inmuebles`', async () => {
    await saveFichaPublicaInmueble(buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!);
    await cargarFichaPublicaPorToken('sol-inm_1');
    await getFichaPublicaInmueble('inm_1');
    await deleteFichaPublicaInmueble('inm_1');
    expect(mem.docCalls.length).toBeGreaterThan(0);
    for (const c of mem.docCalls) expect(c.col).toBe(FICHAS_PUBLICAS_COL);
  });

  it('denegación de lectura → null (cierre por defecto, no excepción)', async () => {
    mem.denyGet = true;
    expect(await getFichaPublicaInmueble('inm_1')).toBeNull();
    expect(await cargarFichaPublicaPorToken('inm_1')).toBeNull();
  });

  it('save/delete operan sobre el espejo con id == inmuebleId', async () => {
    const f = buildFichaPublicaInmueble(INMUEBLE_COMPLETO)!;
    await saveFichaPublicaInmueble(f);
    expect(mem.docCalls).toEqual([{ col: FICHAS_PUBLICAS_COL, id: 'inm_1' }]);
    expect(await getFichaPublicaInmueble('inm_1')).not.toBeNull();
    await deleteFichaPublicaInmueble('inm_1');
    expect(await getFichaPublicaInmueble('inm_1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C. firestore.rules: §1 endurecido + espejo R3
// ---------------------------------------------------------------------------
const FS_SRC = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

function bloqueFs(inicio: string): string {
  const pos = FS_SRC.indexOf(inicio);
  if (pos < 0) throw new Error(`No existe «${inicio}» en firestore.rules`);
  let nivel = 0;
  for (let i = FS_SRC.indexOf('{', FS_SRC.indexOf('\n', pos)); i < FS_SRC.length; i++) {
    if (FS_SRC[i] === '{') nivel++;
    else if (FS_SRC[i] === '}') {
      nivel--;
      if (nivel === 0) return FS_SRC.slice(pos, i + 1);
    }
  }
  throw new Error(`Bloque «${inicio}» sin cerrar`);
}

describe('R3 firestore.rules: inmuebles ya no públicos + espejo mínimo', () => {
  const INM = 'match /inmuebles/{inmuebleId}';
  const FICHA = 'match /fichas_publicas_inmueble/{fichaId}';

  it('§1: ningún allow de lectura es público (adiós `allow read: if true`)', () => {
    const b = bloqueFs(INM);
    expect(b).not.toContain('allow read:');
    expect(b).not.toContain('if true');
  });

  it('§1 get: personal autenticado o inquilino vinculado a SU vivienda', () => {
    const b = bloqueFs(INM);
    expect(b).toContain('allow get: if isStaff()');
    expect(b).toContain('isTenant()');
    expect(b).toContain("contratoIdsAutorizados");
    expect(b).toContain('contratoActivoId');
    expect(b).toContain('tenantTieneContrato');
  });

  it('§1 list: solo personal autenticado (sin enumeración anónima)', () => {
    const b = bloqueFs(INM);
    expect(b).toContain('allow list: if isStaff();');
  });

  it('§1 escrituras INTACTAS (create/update/delete sin cambios R3)', () => {
    const b = bloqueFs(INM);
    expect(b).toContain('allow create: if isMasterAdmin() || (');
    expect(b).toContain("'propietarioPrincipalId' in incoming() && incoming().propietarioPrincipalId == myPropId()");
    expect(b).toContain('allow update: if isMasterAdmin() || (');
    expect(b).toContain('canReachInmuebleId(inmuebleId)');
    expect(b).toContain('allow delete: if isMasterAdmin();');
  });

  it('existe el espejo con get público, list autenticado y escritura titular', () => {
    const b = bloqueFs(FICHA);
    expect(b).toContain('allow get: if true;');
    expect(b).toContain('allow list: if isSignedIn();');
    expect(b).toContain('isMasterAdmin() || (isPropietarioRole() && incoming().propietarioId == myPropId())');
    expect(b).toContain('incoming().id == fichaId');
    expect(b).toContain('incoming().inmuebleId == fichaId');
    expect(b).toContain('incoming().propietarioId is string');
    expect(b).toContain('clavesFichaPublicaOk()');
    expect(b).toContain('allow delete: if isMasterAdmin();');
  });

  it('paridad: clavesFichaPublicaOk() == CAMPOS_FICHA_PUBLICA (ni una más)', () => {
    const ini = FS_SRC.indexOf('function clavesFichaPublicaOk()');
    expect(ini).toBeGreaterThan(0);
    expect(ini).toBeLessThan(FS_SRC.indexOf('match /fichas_publicas_inmueble/'));
    const fin = FS_SRC.indexOf(']);', ini);
    const clavesRegla = new Set([...FS_SRC.slice(ini, fin).matchAll(/'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]));
    clavesRegla.delete('clavesFichaPublicaOk');
    expect(clavesRegla).toEqual(new Set(CAMPOS_FICHA_PUBLICA));
  });

  it('el total de `if true` no crece (10: ninguno nuevo fuera del espejo)', () => {
    const total = (FS_SRC.match(/if true/g) || []).length;
    expect(total).toBe(10);
  });

  it('el fichero está balanceado y el catch-all sigue último', () => {
    const abre = (FS_SRC.match(/{/g) || []).length;
    const cierra = (FS_SRC.match(/}/g) || []).length;
    expect(abre).toBe(cierra);
    const catchAll = FS_SRC.indexOf('match /{document=**}');
    expect(catchAll).toBeGreaterThan(0);
    expect(FS_SRC.slice(catchAll)).toContain('allow read, write: if false;');
    expect(FS_SRC.indexOf('match /', catchAll + 10)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// D. storage.rules: inventario interno, R2 intacto
// ---------------------------------------------------------------------------
const ST_SRC = readFileSync(resolve(__dirname, '../storage.rules'), 'utf8');

describe('R3 storage.rules: catálogo público, inventario interno', () => {
  it('catálogo: solo el primer segmento es público', () => {
    expect(ST_SRC).toContain('match /inmuebles/{inmuebleId}/{fileName} {');
    expect(ST_SRC).not.toContain('match /inmuebles/{inmuebleId}/{allFiles=**} {');
  });

  it('inventario: lectura/escritura solo interna (sin `if true`)', () => {
    const ini = ST_SRC.indexOf('match /inmuebles/{inmuebleId}/inventario/{allFiles=**}');
    expect(ini).toBeGreaterThan(0);
    const fin = ST_SRC.indexOf('match /{allPaths=**}');
    const zonaInventario = ST_SRC.slice(ini, ST_SRC.indexOf('}\n', ST_SRC.indexOf('allow update, delete', ini)) + 2);
    expect(zonaInventario).toContain('allow read: if internalUser();');
    expect(zonaInventario).not.toContain('if true');
    void fin;
  });

  it('R2 intacto: bloque morosidad_evidencias sin cambios', () => {
    expect(ST_SRC).toContain('match /morosidad_evidencias/{propietarioId}/{expedienteId}/{fileName} {');
    expect(ST_SRC).toContain('allow read: if isMasterAdmin();');
    expect(ST_SRC).toContain('allow create: if isMasterAdmin() && esEvidenciaValida();');
    expect(ST_SRC).toContain('allow update, delete: if false;');
  });

  it('catch-all último y fichero balanceado', () => {
    const abre = (ST_SRC.match(/{/g) || []).length;
    const cierra = (ST_SRC.match(/}/g) || []).length;
    expect(abre).toBe(cierra);
    const catchAll = ST_SRC.indexOf('match /{allPaths=**}');
    expect(ST_SRC.slice(catchAll)).toContain('allow read, write: if false;');
    expect(ST_SRC.indexOf('match /', catchAll + 10)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// E. Tripwires R1/R2
// ---------------------------------------------------------------------------
describe('R3 no rompe R1 ni R2 (tripwires)', () => {
  it('R1: API de persistencia de conciliación intacta', async () => {
    const r1 = await import('../src/lib/conciliacionFirestore');
    expect(typeof r1.cargarConciliacionPropietario).toBe('function');
    expect(typeof r1.guardarImportacionConciliacion).toBe('function');
    expect(r1.esPropietarioPersistible('prop_demo')).toBe(false);
    expect(r1.esPropietarioPersistible('prop_A')).toBe(true);
  });

  it('R2: API de evidencias Storage intacta', async () => {
    const r2 = await import('../src/lib/morosidadEvidenciasStorage');
    expect(typeof r2.subirEvidenciaMorosidadStorage).toBe('function');
    expect(typeof r2.obtenerUrlEvidenciaMorosidad).toBe('function');
    expect(r2.validarArchivoEvidencia(null).ok).toBe(false);
    expect(r2.construirRutaEvidenciaMorosidad('p', 'e', 'a.pdf', { ahora: 1, aleatorio: 'r' })).toBe(
      'morosidad_evidencias/p/e/1_r_a.pdf',
    );
  });
});
