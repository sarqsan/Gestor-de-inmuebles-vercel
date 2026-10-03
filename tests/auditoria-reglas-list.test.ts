/**
 * REGRESIÓN — orden de guardas en `allow list` (auditoría de permisos 2026-10-03).
 * ================================================================================
 * Contexto (FASE 6 y FASE 10 de la orden):
 *
 *   Las Firestore Rules NO son filtros. Una consulta se evalúa contra su
 *   conjunto potencial de resultados, así que una regla `list` que exige
 *   CUALQUIER condición sobre el contenido del documento (`resource.data`)
 *   sólo es demostrable si la consulta incorpora el filtro que la satisface.
 *
 *   Cinco colecciones tenían el short-circuit administrativo DETRÁS de esa
 *   demanda de contenido:
 *
 *       allow list: if '<campo>' in resource.data && ambitoPor<X>Lectura(...);
 *
 *   aunque `ambitoPor<X>Lectura()` empieza por `esAdminInmuebles()`. Como el
 *   cliente pide la colección COMPLETA (sin `where`) para el ámbito
 *   administrativo, la consulta se denegaba siempre —incluido el
 *   administrador—: era el `permission-denied` de «Seguro de impago».
 *
 * Qué fija este fichero:
 *   1. El auditor del repositorio no encuentra hoy ninguna incompatibilidad
 *      bloqueante (guarda: si el defecto reaparece, este test FALLA).
 *   2. El auditor DETECTA el defecto cuando se le dan las reglas con el orden
 *      anterior (guarda: el detector tiene dientes, no es una aserción vacía).
 *   3-5. Las cinco correcciones son sólo de ORDEN: no se ha concedido nada,
 *      no se ha relajado nada y el diseño de mínimo privilegio de
 *      `morosidad_resumen_propietario` sigue intacto.
 *   6-7. La forma real de la consulta del cliente: colección completa para el
 *      ámbito administrativo y consulta acotada para el titular (aislamiento).
 *
 * No usa red, ni credenciales, ni datos reales, ni emulador: es análisis del
 * texto REAL de `firestore.rules` y del comportamiento REAL de la capa de datos
 * con un doble de `firebase/*`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  auditar,
  dividirDisyuntos,
  extraerReglasList,
  leerFuentes,
} from '../scripts/auditoria-reglas-list.mts';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const FUENTES = leerFuentes(resolve(RAIZ, 'src'));

/** Las cinco colecciones corregidas y el campo por el que derivan su ámbito. */
const CORREGIDAS: Array<{ coleccion: string; campo: 'inmuebleId' | 'contratoId' }> = [
  { coleccion: 'solicitudes_seguro_impago', campo: 'inmuebleId' },
  { coleccion: 'mensajes_portal', campo: 'contratoId' },
  { coleccion: 'suministros', campo: 'inmuebleId' },
  { coleccion: 'lecturas_suministro', campo: 'inmuebleId' },
  { coleccion: 'cambios_titular', campo: 'inmuebleId' },
];

/** Reconstruye el ruleset con el orden de guardas DEFECTUOSO (el anterior). */
function reglasConDefecto(rules: string): string {
  let salida = rules;
  for (const { coleccion, campo } of CORREGIDAS) {
    const funcion = campo === 'inmuebleId' ? 'ambitoPorInmuebleLectura' : 'ambitoPorContratoLectura';
    const corregido = `      allow list: if esAdminInmuebles()\n        || ('${campo}' in resource.data && ${funcion}(resource.data.${campo}));`;
    expect(salida, `no se encuentra la regla corregida de ${coleccion}`).toContain(corregido);
    salida = salida.replace(
      corregido,
      `      allow list: if '${campo}' in resource.data && ${funcion}(resource.data.${campo});`
    );
  }
  return salida;
}

function reglaDe(coleccion: string, rules = RULES) {
  const regla = extraerReglasList(rules).find((r) => r.coleccion === coleccion);
  if (!regla) throw new Error(`No existe allow list para ${coleccion}`);
  return regla;
}

// ===========================================================================
describe('auditor: `allow list` frente a una consulta sin filtro', () => {
  it('HOY ninguna colección consultada sin filtro por el ámbito administrativo está bloqueada', () => {
    const informe = auditar(RULES, FUENTES);

    // El conjunto de colecciones afectadas es el que el cliente consulta
    // completo: si alguien añade una colección nueva, entra sola en la guarda.
    expect(informe.consultadasSinFiltro.length).toBeGreaterThan(0);
    expect(informe.bloqueantes).toEqual([]);
  });

  it('el auditor SÍ detecta el defecto en el ruleset anterior (no es una aserción vacía)', () => {
    const informe = auditar(reglasConDefecto(RULES), FUENTES);

    const nombres = informe.bloqueantes.map((b) => b.coleccion).sort();
    expect(nombres).toEqual(CORREGIDAS.map((c) => c.coleccion).sort());
  });

  it('`dividirDisyuntos` respeta los paréntesis (base del análisis)', () => {
    expect(dividirDisyuntos('a || (b || c) || d')).toEqual(['a', '(b || c)', 'd']);
  });
});

// ===========================================================================
describe('las cinco correcciones son SÓLO de orden de guardas', () => {
  it.each(CORREGIDAS)('$coleccion: el short-circuit administrativo es el PRIMER término', ({ coleccion, campo }) => {
    const regla = reglaDe(coleccion);
    const primerDisyunto = dividirDisyuntos(regla.condicion)[0];

    expect(primerDisyunto).toBe('esAdminInmuebles()');
    // La demanda de contenido sigue existiendo: no se ha eliminado ninguna
    // comprobación, sólo se ha movido a una rama evaluable con el documento.
    expect(regla.condicion).toContain(`'${campo}' in resource.data`);
  });

  it.each(CORREGIDAS)('$coleccion: la rama no administrativa conserva su ámbito derivado', ({ coleccion, campo }) => {
    const funcion = campo === 'inmuebleId' ? 'ambitoPorInmuebleLectura' : 'ambitoPorContratoLectura';
    const regla = reglaDe(coleccion);

    expect(regla.condicion).toContain(`${funcion}(resource.data.${campo})`);
    // La rama de ámbito NO se ha simplificado: sigue exigiendo el campo.
    expect(regla.condicion.split('||').length).toBe(2);
  });

  it('no se ha concedido lectura global: ninguna de las cinco admite `if true`', () => {
    for (const { coleccion } of CORREGIDAS) {
      expect(reglaDe(coleccion).condicion).not.toMatch(/^\s*true\s*$/);
      expect(reglaDe(coleccion).condicion).not.toContain('isSignedIn() ||');
    }
  });

  it('`morosidad_resumen_propietario` sigue SIN rama administrativa (mínimo privilegio intacto)', () => {
    // Esta colección es un espejo recortado que el propietario lee sólo de sí
    // mismo; NO se le ha añadido el short-circuit administrativo a propósito.
    const regla = reglaDe('morosidad_resumen_propietario');

    expect(regla.condicion).not.toContain('esAdminInmuebles()');
    expect(regla.condicion).not.toContain('isMasterAdmin()');
    expect(regla.condicion).toContain('isPropietarioRole()');
    expect(regla.condicion).toContain('resource.data.propietarioId == myPropId()');
  });

  it('`inmuebles` mantiene su orden correcto (referencia de la corrección)', () => {
    // `inmuebles` ya tenía `esAdminInmuebles()` primero: es el patrón que se
    // ha aplicado a las cinco colecciones corregidas.
    expect(dividirDisyuntos(reglaDe('inmuebles').condicion)[0]).toBe('esAdminInmuebles()');
  });
});

// ===========================================================================
// Forma REAL de la consulta del cliente (por qué la regla era indemostrable)
// ===========================================================================
type Consulta = { col: string; filtros: Array<{ campo: string; valor: string }> };
const salas = vi.hoisted(() => ({ consultas: [] as Consulta[] }));

vi.mock('firebase/app', () => ({ initializeApp: () => ({}), getApps: () => [] }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('firebase/storage', () => ({
  getStorage: () => ({}), ref: () => ({}), uploadBytes: async () => ({}),
  uploadString: async () => ({}), getDownloadURL: async () => '', deleteObject: async () => {},
}));
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, nombre: string) => ({ __col: nombre }),
  doc: (...args: any[]) => ({
    __col: args.length === 2 ? args[0].__col : args[1],
    id: args.length === 2 ? args[1] : args[2],
  }),
  where: (campo: string, _op: string, valor: string) => ({ campo, valor }),
  query: (col: any, ...filtros: any[]) => ({ __col: col.__col, filtros: filtros.filter((f) => f && f.campo) }),
  onSnapshot: (ref: any, onNext: (s: any) => void) => {
    salas.consultas.push({ col: ref.__col, filtros: (ref.filtros ?? []) as Array<{ campo: string; valor: string }> });
    onNext({ docs: [], forEach: () => {} });
    return () => {};
  },
  getDocs: async () => ({ empty: true, docs: [] }),
  getDoc: async () => ({ exists: () => false, data: () => ({}) }),
  setDoc: async () => {}, deleteDoc: async () => {}, updateDoc: async () => {},
  deleteField: () => ({}), writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
  runTransaction: async () => ({}), serverTimestamp: () => ({}),
  arrayUnion: () => ({}), arrayRemove: () => ({}),
}));

describe('forma de la consulta del cliente (hecho que hacía indemostrable la regla)', () => {
  it('ADMINISTRADOR sin inmuebles delega pide la colección COMPLETA (sin where)', async () => {
    const { subscribeSolicitudesSeguro } = await import('../src/lib/firebase');
    salas.consultas.length = 0;

    subscribeSolicitudesSeguro(() => {}, {
      tipoPerfil: 'ADMINISTRADOR',
      propietarioId: '',
      inmuebleIds: [],
      propietariosGestionados: [],
      inmueblesGestionadosParciales: [],
    });

    expect(salas.consultas).toHaveLength(1);
    expect(salas.consultas[0].col).toBe('solicitudes_seguro_impago');
    // Éste es el hecho decisivo: sin este filtro, la regla anterior exigía
    // contenido del documento en todas sus ramas y Firestore denegaba SIEMPRE.
    expect(salas.consultas[0].filtros).toEqual([]);
  });

  it('PROPIETARIO sigue consultando acotado por inmuebleId (aislamiento intacto)', async () => {
    const { subscribeSolicitudesSeguro } = await import('../src/lib/firebase');
    salas.consultas.length = 0;

    subscribeSolicitudesSeguro(() => {}, {
      tipoPerfil: 'PROPIETARIO',
      propietarioId: 'prop_A',
      inmuebleIds: ['inm_A'],
      propietariosGestionados: [],
      inmueblesGestionadosParciales: [],
    });

    expect(salas.consultas.length).toBeGreaterThan(0);
    expect(salas.consultas[0].col).toBe('solicitudes_seguro_impago');
    expect(salas.consultas[0].filtros).toEqual([{ campo: 'inmuebleId', valor: 'inm_A' }]);
  });
});
