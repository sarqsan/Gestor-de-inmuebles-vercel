# AG-09 — El snapshot vacío de candidatos reescribía Firestore

**Rama:** `arena/7a5c64cb-gestor-de-inmuebles-vercel`
**Base:** `main` @ `7784414` (producción)
**Estado:** PR abierta. **No fusionada, no desplegada.**

---

## 1. Diagnóstico

### Descripción original (auditoría global, S2 · prioridad 5)

> Restauración caché → Firestore de candidatos: si el snapshot autorizado llega
> vacío, se reescriben en Firestore los candidatos en memoria (de `localStorage`).
> · `src/App.tsx:1305-1318`
> · Impacto: resurrección de candidatos borrados (personal) o escrituras denegadas
> en bucle (resto); contradice la norma aplicada a inmuebles (`App.tsx:1293-1296`).
> · Corrección mínima: eliminar la rama de reescritura.
> · Verificación: prueba unitaria del callback con snapshot vacío.

### Estado real en `main` (`7784414`)

**PENDIENTE.** El defecto seguía presente, en `src/App.tsx:1297-1311`:

```js
const unsubscribeCand = subscribeCandidatos(conDatos('candidatos', (data) => {
  if (data && data.length > 0) {
    setCandidatos(data);
    guardarCacheLocal('candidatos', data);
  } else {
    setCandidatos((current) => {
      if (current.length > 0) {
        current.forEach((c) => saveCandidatoFirestore(c));   // ← el defecto
        return current;
      }
      return [];
    });
  }
}));
```

No estaba «parcialmente implementado»: **estaba intacto**. Y no era un falso
positivo de la auditoría.

### Por qué es un defecto real, no cosmético

Un snapshot vacío **puede ser un resultado legítimo**. Cuando Firestore devuelve
cero documentos, el código interpretaba «vacío» como «falta de datos, restaura la
caché» y reescribía en Firestore todo lo que hubiera en memoria:

1. **Para el personal** (que sí tiene `list` global): si se han borrado todos los
   candidatos, el snapshot llega vacío y **los candidatos borrados vuelven a
   Firestore** con sus datos personales. Un borrado no se sostiene.
2. **Para el resto de perfiles**: la escritura se deniega → bucle de escrituras
   denegadas, incidencias y ruido en cada sesión.
3. **Contradice la norma D2a** que ya se aplicó a inmuebles: `snapshotInmueblesCache.ts`
   prohíbe explícitamente restaurar caché → Firestore y lo declara estructuralmente
   imposible. Inmuebles estaba protegido; candidatos no.

---

## 2. Corrección

Se reutiliza el **mismo patrón ya auditado** de inmuebles, sin crear un mecanismo
paralelo ni una arquitectura nueva: un helper puro con las mismas garantías.

**`src/lib/snapshotCandidatosCache.ts`** (nuevo):

- `procesarSnapshotCandidatos(data, deps)`.
- Con datos → estado = datos y caché de lectura = datos.
- Con snapshot vacío o nulo → estado = `[]`. **No escribe en Firestore** y **no
  borra** la caché histórica, que sigue disponible como caché de lectura.
- **No importa el SDK de Firebase ni recibe ninguna función de escritura**, así que
  es estructuralmente incapaz de restaurar datos. Igual que su equivalente de
  inmuebles.

**`src/App.tsx`**: el callback de candidatos pasa por el helper. La rama de
reescritura desaparece. `saveCandidatoFirestore` sigue importado y en uso en sus
15 llamadas legítimas (altas y ediciones de candidato) — **no se ha tocado ninguna
de ellas**.

Lo que **no** cambia: la caché local de candidatos sigue siendo de lectura
(`guardarCacheLocal('candidatos', …)`), la sincronización entre pestañas sigue
igual, y la ruta de inmuebles (D2a) queda intacta.

---

## 3. Pruebas

**`tests/seguridad-candidatos-snapshot.test.ts`** — **10 pruebas:**

| Caso | Qué comprueba |
|---|---|
| Snapshot con datos | Sincroniza estado y caché de lectura |
| Snapshot vacío | Estado = `[]`, **cero** escrituras y **cero** actualizaciones de caché |
| Snapshot `null` / `undefined` | Se comporta como vacío, sin lanzar |
| Estado en memoria | El snapshot vacío **no** devuelve los candidatos en memoria |
| Guarda estructural | El helper no importa Firebase ni contiene funciones de escritura |
| App.tsx · rama eliminada | No queda `current.forEach((c) => saveCandidatoFirestore(c))` |
| App.tsx · helper conectado | El callback pasa por `procesarSnapshotCandidatos` |
| App.tsx · callback limpio | El callback real no invoca ninguna escritura |
| App.tsx · caché de lectura | Sigue actualizándose como caché de lectura |
| App.tsx · D2a intacta | La ruta de inmuebles no se ha tocado |

### Prueba de mutación

Revertí el callback al código antiguo y **3 pruebas fallaron**, confirmando que la
guarda detecta el defecto de verdad y no da un verde decorativo. Después restauré
el código.

### Un detalle de la propia prueba

La guarda estructural falló la primera vez **por mi propio comentario de
cabecera**, que cita a propósito el código antiguo para explicar el defecto. El
fallo estaba en la prueba, no en el código: la corregí para inspeccionar el
código **sin comentarios**. Una guarda que se satisface ignorando la prosa es
más frágil, pero una que falla por citar el defecto que documenta es inútil.

---

## 4. Resultados

| Comprobación | Resultado |
|---|---|
| Pruebas específicas de AG-09 | **10/10** |
| Regresión completa | **330 archivos / 5.482 pruebas / 0 fallos** |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** (14,1 s) |
| `test:operaciones` / `test:patrimonial` | 300/0 · 88/0 |

---

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/snapshotCandidatosCache.ts` | **nuevo** — helper puro (18 líneas de código) |
| `src/App.tsx` | callback de candidatos + 1 import; **−4 líneas netas** |
| `tests/seguridad-candidatos-snapshot.test.ts` | **nuevo** — 10 pruebas |
| `docs/ag09/INFORME-AG09.md` | este informe |

## 6. Límites respetados

- **No se reabre** AG-05, AG-06 ni AG-07: sus ficheros no se tocan y sus pruebas
  siguen en verde en la regresión.
- **Sin cambios** en reglas de Firebase, datos, migraciones ni `src/types.ts`.
- **AG-08 no se ha tocado.**
- Un solo bloque; sin acumulación.
- El arreglo es **más pequeño que el propio defecto**: elimina una rama, no añade
  funcionalidad.
