import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { procesarSnapshotCandidatos } from '../src/lib/snapshotCandidatosCache';

/**
 * AG-09 · El snapshot vacío de candidatos no puede restaurar la caché a Firestore.
 *
 * Se prueba el comportamiento del helper y, además, que el código REAL de
 * `App.tsx` ya no contiene la rama de reescritura (una prueba que solo cubriera
 * el helper daría verde aunque App.tsx siguiera con el defecto).
 */

const RAIZ = resolve(__dirname, '..');

interface CandidatoFicticio { id: string; nombre: string }

/** Elimina comentarios de bloque y de línea: se valida el código, no la prosa. */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CON_DATOS: CandidatoFicticio[] = [
  { id: 'cand-a', nombre: 'Candidato A (sintético)' },
  { id: 'cand-b', nombre: 'Candidato B (sintético)' },
];

function deps() {
  return {
    setCandidatos: vi.fn(),
    escribirCacheLectura: vi.fn(),
  };
}

describe('AG-09 · procesarSnapshotCandidatos', () => {
  it('con datos: sincroniza el estado y actualiza la caché de lectura', () => {
    const d = deps();
    procesarSnapshotCandidatos(CON_DATOS, d);

    expect(d.setCandidatos).toHaveBeenCalledExactlyOnceWith(CON_DATOS);
    expect(d.escribirCacheLectura).toHaveBeenCalledExactlyOnceWith(CON_DATOS);
  });

  it('con snapshot vacío: deja el estado en [] y no escribe en ningún sitio', () => {
    const d = deps();
    procesarSnapshotCandidatos([], d);

    expect(d.setCandidatos).toHaveBeenCalledExactlyOnceWith([]);
    expect(d.escribirCacheLectura).not.toHaveBeenCalled();
  });

  it('con snapshot nulo o indefinido se comporta como vacío, sin lanzar', () => {
    for (const valor of [null, undefined]) {
      const d = deps();
      expect(() => procesarSnapshotCandidatos(valor, d)).not.toThrow();
      expect(d.setCandidatos).toHaveBeenCalledExactlyOnceWith([]);
      expect(d.escribirCacheLectura).not.toHaveBeenCalled();
    }
  });

  it('el snapshot vacío NO devuelve los candidatos en memoria: el estado se vacía', () => {
    // El defecto anterior conservaba `current` y lo reescribía en Firestore.
    // Aquí se comprueba que la única instrucción recibida es `[]`.
    const enMemoria = [...CON_DATOS];
    const d = deps();
    procesarSnapshotCandidatos([], d);

    const [[recibido]] = d.setCandidatos.mock.calls as unknown as [[CandidatoFicticio[]]];
    expect(recibido).toEqual([]);
    expect(recibido).not.toEqual(enMemoria);
  });

  it('es estructuralmente incapaz de escribir en Firestore', () => {
    const fuente = readFileSync(resolve(RAIZ, 'src/lib/snapshotCandidatosCache.ts'), 'utf8');
    // Se inspecciona el CÓDIGO, no la prosa: el comentario de cabecera cita a
    // propósito el código antiguo para explicar el defecto, y comprobarlo en
    // bruto daría un falso negativo.
    const codigo = sinComentarios(fuente);
    expect(codigo).not.toMatch(/from\s+'firebase/);
    expect(codigo).not.toMatch(/saveCandidatoFirestore|setDoc|updateDoc|deleteDoc|addDoc/);
    // No recibe ninguna función de escritura entre sus dependencias.
    expect(codigo).not.toMatch(/guardarCandidato|escribirFirestore/);
  });
});

describe('AG-09 · App.tsx ya no contiene la restauración caché -> Firestore de candidatos', () => {
  const app = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');

  it('no queda la reescritura masiva desde el callback de candidatos', () => {
    expect(app).not.toContain('current.forEach((c) => saveCandidatoFirestore(c))');
  });

  it('el callback de candidatos pasa por el helper auditado', () => {
    expect(app).toContain('procesarSnapshotCandidatos(data');
  });

  it('el snapshot de candidatos no escribe en Firestore dentro del callback', () => {
    // Se aísla el callback real de suscripción a candidatos y se comprueba que
    // no invoca ninguna función de escritura.
    const inicio = app.indexOf("subscribeCandidatos(conDatos<Candidato[]>('candidatos'");
    expect(inicio).toBeGreaterThan(-1);
    // El callback termina en la primera secuencia `}));` tras el inicio.
    const fin = app.indexOf('}));', inicio);
    const callback = app.slice(inicio, fin + 4);

    expect(callback).toContain('procesarSnapshotCandidatos');
    expect(callback).not.toMatch(/saveCandidatoFirestore|setDoc|updateDoc/);
  });

  it('la caché local de candidatos sigue siendo de LECTURA', () => {
    const inicio = app.indexOf("subscribeCandidatos(conDatos<Candidato[]>('candidatos'");
    const fin = app.indexOf('}));', inicio);
    const callback = app.slice(inicio, fin + 4);

    expect(callback).toContain("guardarCacheLocal('candidatos'");
  });

  it('no se ha tocado la ruta de inmuebles (D2a sigue intacta)', () => {
    expect(app).toContain('procesarSnapshotInmuebles(data');
    expect(app).not.toContain('current.forEach((inm) => saveInmuebleFirestore(inm))');
  });
});
