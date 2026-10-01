/**
 * ÍNDICE DE RELACIONES DEL ESPEJO PROPIO — LECTURA (nunca escritura).
 * ---------------------------------------------------------------------------
 * `usuarios_auth/{uid}.gestionesPorPropietario` (`{ propietarioId → gestionId }`) es el
 * índice con el que las Rules autorizan los inmuebles delegados
 * (`gestionActivaCompletaIndexada` / `inmuebleParcialIndexado`) y que SOLO escribe el
 * master (proyección D1R). Este módulo lo ESCUCHA para que la capa de datos pueda leer cada
 * gestión del gestor por su id (`get`) cuando la CONSULTA de colección se deniega aunque el
 * estado de la persona cumpla la regla (ver `subscribeGestionesCarteraGestor`).
 *
 * Por qué vive aparte de `firebase.ts`: `tests/fase14-espejo-identidad.test.ts` (D.6) mantiene
 * una lista CERRADA de quién cita el espejo para que no aparezca «un segundo sistema de
 * identidad en el cliente». Este es un lector de SOLO LECTURA de un campo de proyección: no
 * toca uid, perfil, estado, roles ni carteras, y la regla de lectura del espejo es
 * `request.auth.uid == uid` (cada persona lee el suyo). Revisado y añadido a esa lista.
 *
 * Sin dependencia de `firebase.ts` (recibe `db`): no hay importación circular.
 */
import { doc, onSnapshot, type Firestore, type Unsubscribe } from 'firebase/firestore';
import { idsGestionesIndexadas } from './carterasGestion';

/**
 * Escucha el índice del espejo PROPIO y entrega los ids de gestión que indexa (sin duplicados
 * ni valores que no puedan ser id de documento). Solo lectura; la regla decide el acceso.
 */
export function escucharIndiceRelaciones(
  db: Firestore,
  uid: string,
  alCambiar: (idsGestion: string[], lecturaEspejo: { existe: boolean }) => void,
  alFallar: (error: unknown) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'usuarios_auth', uid),
    (snap) => {
      const existe = snap.exists();
      alCambiar(idsGestionesIndexadas(existe ? snap.data()?.gestionesPorPropietario : undefined), { existe });
    },
    alFallar
  );
}
