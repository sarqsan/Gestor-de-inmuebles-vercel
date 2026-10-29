/**
 * Los índices de la consola se crean **a mano**, copiando una tabla de la
 * documentación. Si esa tabla se separa de `firestore.indexes.json`, alguien
 * crea en producción un índice que no es, o deja de crear uno que sí hace falta
 * — y el fallo aparece semanas después, en mitad de una pantalla de actas, con
 * un «la consulta requiere un índice» que nadie relaciona con esto.
 *
 * Esta prueba ata las dos copias de la tabla (la guía de publicación y la lista
 * para el usuario) al fichero real. Si `firestore.indexes.json` cambia, hay que
 * actualizar las tablas o CI se pone rojo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

type Campo = { fieldPath: string; order?: string; arrayConfig?: string };
type Indice = { collectionGroup: string; queryScope?: string; fields: Campo[] };

const declarados: Indice[] = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes || [];

/** Nombre en la consola para el orden declarado en el fichero. */
function orden(campo: Campo): string {
  if (campo.arrayConfig) return campo.arrayConfig === 'CONTAINS' ? 'ARRAY-CONTAINS' : 'ARRAY';
  return campo.order === 'DESCENDING' ? 'DESC' : 'ASC';
}

/** Fila normalizada: `colección · campo ASC · campo DESC`. */
function filasDeclaradas(): string[] {
  return declarados.map((indice) =>
    [indice.collectionGroup, ...indice.fields.map((c) => `${c.fieldPath} ${orden(c)}`)].join(' · ')
  );
}

/**
 * Extrae las filas de una tabla markdown del tipo:
 *   | 1 | `actas` | `ownerId` ASC · `propertyId` ASC |
 * y las devuelve en el mismo formato normalizado que `filasDeclaradas()`.
 */
function filasDocumentadas(ruta: string): string[] {
  const texto = readFileSync(ruta, 'utf8');
  const filas: string[] = [];
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/);
    if (!m) continue;
    const coleccion = m[1].trim();
    const campos = [...m[2].matchAll(/`([^`]+)`\s*(ASC|DESC|ARRAY-CONTAINS|ARRAY)/g)].map(
      (c) => `${c[1]} ${c[2]}`
    );
    if (campos.length === 0) continue;
    filas.push([coleccion, ...campos].join(' · '));
  }
  return filas;
}

const DOCS = [
  'docs/PUBLICACION-REGLAS-INDICES-PRODUCCION.md',
  'docs/PENDIENTE-USUARIO-2026-10-28.md',
  // La tabla del documento de cierre se copió de la CONSOLA (lo que se vio), no
  // del fichero: es justo la que más importa atar, porque es la que certifica.
  'docs/P-01-CIERRE-CONSOLA-2026-10-29.md',
];

describe('índices · la tabla que se copia en la consola es la del fichero', () => {
  it('firestore.indexes.json declara los 10 índices, todos de colección y sin overrides', () => {
    expect(declarados).toHaveLength(10);
    const fichero = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
    expect(fichero.fieldOverrides || []).toEqual([]);
    for (const indice of declarados) {
      expect(indice.queryScope).toBe('COLLECTION');
    }
  });

  it.each(DOCS)('%s documenta exactamente los mismos índices, en el mismo orden', (doc) => {
    expect(filasDocumentadas(doc)).toEqual(filasDeclaradas());
  });

  it('cada colección documentada existe en las reglas (o es de servicio)', () => {
    const reglas = readFileSync('firestore.rules', 'utf8');
    // Colecciones que SOLO toca el servidor con credencial de servicio. Sin
    // `match` propio, Firestore las deniega por defecto: no necesitan reglas,
    // pero sí índice, porque el servidor consulta con igualdades + orden.
    const deServicio = new Set([
      'actas_otp', // H-07: el OTP es material del servidor
      'ia_operaciones', // registro de operaciones de IA, escrito por el servidor
    ]);
    for (const indice of declarados) {
      if (deServicio.has(indice.collectionGroup)) continue;
      expect(reglas).toContain(`match /${indice.collectionGroup}/{`);
    }
  });
});
