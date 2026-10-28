/**
 * H-16 / H-02 — Índices declarados y destino de despliegue, SIN publicar.
 * =======================================================================
 * Este test fija el contrato del repositorio, no el estado de ningún proyecto:
 *  · los 10 índices existen, son compuestos y sus colecciones son las reales
 *    (antes el documento citaba `candidatos`/`solicitudes`, que no aparecen);
 *  · `firebase.json` declara `indexes` en la entrada de la base con nombre
 *    (H-16: sin esa clave la CLI no publica índices y el fallo es silencioso);
 *  · `.firebaserc` NO tiene proyecto por defecto (H-02: `firebase deploy` sin
 *    `--project` debe fallar, no publicar en producción);
 *  · la documentación no sugiere comandos de despliegue sin `--project` ni
 *    `--force`.
 *
 * Nada de esto acredita que los índices estén creados ni que las reglas estén
 * publicadas: eso exige staging y autorización expresa (ver informe final).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (r: string) => readFileSync(resolve(__dirname, '../' + r), 'utf8');
const firebase = JSON.parse(leer('firebase.json'));
const firebaserc = JSON.parse(leer('.firebaserc'));
const indices = JSON.parse(leer('firestore.indexes.json'));
const doc = leer('docs/CONFIGURACION-VERIFICABLE.md');

const COLECCIONES_ESPERADAS = [
  'actas',
  'actas_evidencias',
  'actas_incidencias',
  'actas_otp',
  'gestiones_cartera',
  'ia_operaciones',
];

describe('H-16 · índices compuestos', () => {
  it('hay 10 índices, todos con collectionGroup, campos y ámbito de colección', () => {
    expect(indices.indexes).toHaveLength(10);
    for (const idx of indices.indexes) {
      expect(idx.collectionGroup).toBeTypeOf('string');
      expect(idx.fields.length).toBeGreaterThan(1);
      expect(idx.queryScope).toBe('COLLECTION');
    }
  });

  it('las colecciones declaradas son las reales (sin candidatos ni solicitudes)', () => {
    const colecciones = [...new Set(indices.indexes.map((i: { collectionGroup: string }) => i.collectionGroup))];
    expect(colecciones.sort()).toEqual([...COLECCIONES_ESPERADAS].sort());
    expect(colecciones).not.toContain('candidatos');
    expect(colecciones).not.toContain('solicitudes');
  });

  it('el documento cita las colecciones reales y ya no la lista errónea', () => {
    const seccion = doc.slice(doc.indexOf('## 7. Índices compuestos'));
    for (const coleccion of COLECCIONES_ESPERADAS) {
      expect(seccion).toContain(coleccion);
    }
    expect(seccion).toContain('Ninguno de los 10 índices pertenece a esas colecciones');
  });
});

describe('H-16 · mecanismo de despliegue declarado', () => {
  it('firebase.json declara reglas E índices para la base con nombre', () => {
    expect(firebase.firestore).toBeInstanceOf(Array);
    expect(firebase.firestore[0].rules).toBe('firestore.rules');
    expect(firebase.firestore[0].indexes).toBe('firestore.indexes.json');
    expect(firebase.firestore[0].database).toContain('ai-studio-gestordeinmueble');
  });

  it('el documento NO afirma que ya esté publicado y avisa del no-op de la CLI', () => {
    const seccion = doc.slice(doc.indexOf('## 7. Índices compuestos'));
    expect(seccion).toContain('NO PUBLICADO NI VERIFICADO CON LA CLI');
    expect(seccion).toContain('no-op silencioso');
    expect(seccion).toContain('--force');
  });

  it('los comandos de la sección llevan siempre `--project`', () => {
    const seccion = doc.slice(doc.indexOf('## 7. Índices compuestos'), doc.indexOf('**Exclusión permanente recordatoria:**'));
    const comandos = seccion.split('\n').filter((l) => /(^|\s)firebase\s/.test(l) && !l.trim().startsWith('#'));
    expect(comandos.length).toBeGreaterThan(0);
    for (const comando of comandos) {
      expect(comando, comando).toContain('--project');
    }
  });
});

describe('H-02 · .firebaserc sin destino implícito', () => {
  it('no hay `projects.default` (un deploy sin --project debe fallar)', () => {
    expect(firebaserc.projects).toBeTypeOf('object');
    expect('default' in firebaserc.projects).toBe(false);
  });

  it('el identificador de producción solo existe como alias explícito', () => {
    const alias = Object.entries(firebaserc.projects as Record<string, string>)
      .filter(([, proyecto]) => proyecto === 'gestor-inmuebles-produccion')
      .map(([nombre]) => nombre);
    expect(alias).toEqual(['produccion']);
    expect(firebaserc._nota).toContain('NO hay proyecto por defecto');
  });
});
