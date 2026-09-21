/**
 * BLOQUE C · verificación textual de `firestore.rules` (secciones §32–§37).
 * -------------------------------------------------------------------------
 * No se dispone de un emulator de reglas en este repo, así que este test fija
 * los INVARIANTES de seguridad leyendo el fichero: deny-by-default, aislamiento
 * por `propietarioId`, invariante de id, append-only del histórico, prohibición
 * de borrado ordinario y rechazo de secretos. Si alguien relaja una regla, el
 * test falla (es la red de seguridad del bloque, no un adorno).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const RULES_PATH = resolve(__dirname, '../../../firestore.rules');
const SRC = readFileSync(RULES_PATH, 'utf8');

/** Bloque `match /{coleccion}/{param}` con su contenido (llaves anidadas incluidas). */
function bloqueDe(coleccion: string): string {
  const inicio = SRC.indexOf(`match /${coleccion}/`);
  if (inicio < 0) throw new Error(`No existe la sección ${coleccion} en firestore.rules`);
  let nivel = 0;
  // el cuerpo empieza en la llave de la línea `match` (la anterior es el {param} del path)
  for (let i = SRC.indexOf('{', SRC.indexOf('\n', inicio)); i < SRC.length; i++) {
    if (SRC[i] === '{') nivel++;
    else if (SRC[i] === '}') {
      nivel--;
      if (nivel === 0) return SRC.slice(inicio, i + 1);
    }
  }
  throw new Error(`Sección ${coleccion} sin cerrar`);
}

const COLECCIONES_C = [
  'expedientes_morosidad',
  'expedientes_morosidad_hist',
  'evidencias_morosidad',
  'compromisos_morosidad',
  'politicas_morosidad',
  'morosidad_resumen_propietario',
] as const;

describe('BLOQUE C · firestore.rules: deny-by-default e aislamiento', () => {
  it('el fichero está balanceado y termina en denegación global', () => {
    const abre = (SRC.match(/{/g) || []).length;
    const cierra = (SRC.match(/}/g) || []).length;
    expect(abre).toBe(cierra);
    const catchAll = SRC.indexOf('match /{document=**}');
    expect(catchAll).toBeGreaterThan(0);
    expect(SRC.slice(catchAll)).toContain('allow read, write: if false;');
    // el catch-all es el ÚLTIMO bloque match del fichero: nada se escribe después
    expect(SRC.indexOf('match /', catchAll + 10)).toBe(-1);
  });

  it('existen las 6 colecciones del bloque C y ninguna otra de morosidad', () => {
    for (const c of COLECCIONES_C) expect(SRC).toContain(`match /${c}/`);
    const secciones = [...SRC.matchAll(/^ {4}match \/([a-z_]+)\//gm)].map((m) => m[1]);
    const deMorosidad = secciones.filter((s) => s.includes('morosidad'));
    expect(deMorosidad.sort()).toEqual([...COLECCIONES_C].sort());
  });

  it('toda escritura del bloque C exige administración (isMasterAdmin) y rechaza secretos', () => {
    for (const c of COLECCIONES_C) {
      const bloque = bloqueDe(c);
      // se ignoran las líneas de denegación explícita (`allow ... if false`)
      const escrituras = bloque
        .split('\n')
        .filter((l) => /allow (create|update|write)/.test(l))
        .filter((l) => !l.includes('if false'));
      expect(escrituras.length, c).toBeGreaterThan(0);
      // cada línea de escritura (y la que continúa su condición) está bajo isMasterAdmin()
      const idxAdmin = bloque.indexOf('isMasterAdmin()');
      for (const linea of escrituras) {
        const condicion = bloque.slice(bloque.indexOf(linea), bloque.indexOf(';', bloque.indexOf(linea)) + 1);
        expect(condicion, `${c}: ${linea.trim()}`).toContain('isMasterAdmin()');
        expect(condicion.includes('sinSecretosMorosidad()'), `${c} sin verificación de secretos`).toBe(true);
        expect(idxAdmin).toBeGreaterThan(-1);
      }
      expect(bloque).not.toMatch(/allow (create|update|write)[^;]*if true/);
    }
  });

  it('el id del documento es invariante en cada colección (sin duplicados por escritura)', () => {
    const pares: [string, string][] = [
      ['expedientes_morosidad', 'expedienteId'],
      ['expedientes_morosidad_hist', 'transicionId'],
      ['evidencias_morosidad', 'evidenciaId'],
      ['compromisos_morosidad', 'compromisoId'],
      ['politicas_morosidad', 'politicaId'],
      ['morosidad_resumen_propietario', 'docId'],
    ];
    for (const [coleccion, param] of pares) {
      const bloque = bloqueDe(coleccion);
      expect(bloque, coleccion).toContain(`incoming().id == ${param}`);
      expect(bloque, coleccion).toContain(`isValidId(${param})`);
    }
  });

  it('histórico y evidencias son append-only: nadie borra, el histórico no se actualiza', () => {
    const hist = bloqueDe('expedientes_morosidad_hist');
    expect(hist).toMatch(/allow update, delete: if false;/);
    for (const c of COLECCIONES_C) {
      const bloque = bloqueDe(c);
      const deleteLines = bloque.split('\n').filter((l) => /allow delete/.test(l));
      for (const l of deleteLines) expect(l, `${c}: ${l.trim()}`).toContain('if false');
    }
  });

  it('el propietario solo lee espejos recortados, nunca el expediente completo', () => {
    // accesible en lectura para el propietario: compromisos y resumen (aislados por propietarioId)
    for (const c of ['compromisos_morosidad', 'morosidad_resumen_propietario']) {
      const bloque = bloqueDe(c);
      const lecturas = bloque.split('\n').filter((l) => /allow (get|list|read)/.test(l));
      expect(lecturas.length, c).toBeGreaterThan(0);
      for (const linea of lecturas) {
        const condicion = bloque.slice(bloque.indexOf(linea), bloque.indexOf(';', bloque.indexOf(linea)) + 1);
        expect(condicion, `${c}: ${linea.trim()}`).toContain('resource.data.propietarioId == myPropId()');
      }
    }
    // expedientes, histórico y evidencias: solo administración (el inquilino/propietario no ve estrategia)
    for (const c of ['expedientes_morosidad', 'expedientes_morosidad_hist', 'evidencias_morosidad', 'politicas_morosidad']) {
      const bloque = bloqueDe(c);
      expect(bloque, c).not.toContain('isPropietarioRole()');
      expect(bloque, c).toMatch(/allow get, list: if isMasterAdmin\(\);/);
    }
  });

  it('propietarioId es invariante en las escrituras que lo llevan', () => {
    for (const c of ['expedientes_morosidad', 'compromisos_morosidad', 'morosidad_resumen_propietario']) {
      const bloque = bloqueDe(c);
      expect(bloque, c).toContain('incoming().propietarioId is string');
      expect(bloque, c).toContain('incoming().propietarioId.size() > 0');
    }
    for (const c of ['expedientes_morosidad', 'compromisos_morosidad']) {
      expect(bloqueDe(c), c).toContain('request.resource.data.propietarioId == existing().propietarioId');
    }
    // el histórico y las evidencias quedan ligados al expediente y a su propietario
    for (const c of ['expedientes_morosidad_hist', 'evidencias_morosidad']) {
      const bloque = bloqueDe(c);
      expect(bloque, c).toContain('incoming().propietarioId is string');
    }
    expect(bloqueDe('expedientes_morosidad_hist')).toContain('incoming().expedienteId is string');
    // ...y el espejo del propietario no admite actualización cruzada de Cartera
    expect(bloqueDe('morosidad_resumen_propietario')).toContain('request.resource.data.id == existing().id');
  });

  it('la helper anti-secretos existe, precede a su uso y cubre los casos críticos', () => {
    const def = SRC.indexOf('function sinSecretosMorosidad()');
    expect(def).toBeGreaterThan(-1);
    const cuerpo = SRC.slice(def, SRC.indexOf('\n    }', def));
    for (const clave of ['credentials', 'apiKey', 'accessToken', 'refreshToken', 'privateKey', 'password', 'secret', 'token', 'base64Data', 'adjuntoBase64']) {
      expect(cuerpo, clave).toContain(`'${clave}' in incoming()`);
    }
    // la helper se define ANTES de su primer uso en las secciones §32–§37
    const primerUso = SRC.indexOf('&& sinSecretosMorosidad();');
    expect(primerUso).toBeGreaterThan(def);
    expect(primerUso).toBeGreaterThan(SRC.indexOf('match /expedientes_morosidad/'));
  });

  it('GAP 1 (notificaciones) no se re-regula desde el bloque C', () => {
    const notifs = bloqueDe('notificaciones');
    expect(notifs).not.toContain('morosidad');
    // sigue siendo la sección §22 con su propio aislamiento (bandeja por propietario/inmueble)
    expect(notifs).toContain('notifDelUsuario()');
    expect(SRC.indexOf('match /notificaciones/')).toBeLessThan(SRC.indexOf('match /expedientes_morosidad/'));
  });
});
