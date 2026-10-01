# Carteras como capacidad adicional — cierre de «Lectura · Carteras» (2026-10-01 · Orden 3)

> **Actualización (misma fecha, PR siguiente):** además de ser una capacidad adicional con aviso propio y reintento, la lectura de Carteras ya no muestra un falso «No tienes permisos» cuando la persona está autorizada y solo se deniega la consulta de colección (lectura por relación). El aviso real incluye la causa y qué hacer. Ver `CARTERAS_Y_TITULARES_INTERVENCION_2026-10-01.md`.

Rama `arena/01a0f801-gestor-de-inmuebles-vercel` (PR #17, base `origin/main` `21afea4`) ·
commit de partida `ecf9380`. Este documento **cierra** el incidente descrito en
`DIAGNOSTICO_LECTURA_CARTERAS_2026-10-01.md` y en `ESTABILIZACION_PORTAL_TITULARES_2026-10-01.md` §2.

---

## 1. Causa técnica

### 1.1. Por qué el aviso rompía el Portal (causa residente en el repositorio, **corregida**)

La lectura de `gestiones_cartera` es una **capacidad adicional**: localiza las carteras/delegaciones
donde la persona es gestora para ampliar su ámbito de inmuebles. Un propietario puro no necesita nada de
ella (su resultado natural es `[]`).

Sin embargo, su fallo se reportaba por el **mismo canal que las lecturas primarias**
(`reportarErrorLectura('gestiones_cartera', …)`), sin distinguir alcance. Consecuencia:

- `AvisoIncidenciasDatos` la agrupaba con las lecturas de datos y mostraba el mensaje **global**
  «No se han podido leer algunos datos» / «Falló la lectura de: Carteras.», que se lee como si el Portal
  no hubiera podido cargar los datos del usuario;
- el único «Reintentar lectura» disponible era el de los datos primarios (y, antes de `ecf9380`, ni
  siquiera reabría la escucha de Carteras);
- una denegación real de permisos —o una regla publicada distinta de la del repositorio— se presentaba,
  de hecho, como un fallo de carga del Portal.

**Nada de eso era un fallo de las reglas del repositorio: era la política de errores de la aplicación.**
La consulta y la regla del repositorio encajan (§3).

### 1.2. Por qué Firestore denegaba en producción (**fuera** del cliente)

El repositorio **sí** autoriza la consulta exacta para cuentas coherentes: está demostrado documento a
documento (`tests/carteras-lectura-matriz-reglas.test.ts`, 27 tests) y por equivalencia exhaustiva en las
1.024 combinaciones de sesión × espejo × ficha × valor de consulta
(`tests/carteras-diagnostico-puro.test.ts`, 16 tests). Lo que queda fuera del cliente es qué reglas hay
**publicadas** en el Firebase real.

La auditoría halló una discrepancia **en el propio repositorio**: las instrucciones de publicación
(`MAPA-MAESTRO-ERP-ACTUAL.md`, `FASE_1.4`, `2.0`, `2.2`, `2.3`, `3.0`, `3.2`) desplegaban
`firestore.rules` en `startup-sanctuary-sln7n`, mientras la aplicación (y el preview de Vercel) inicializa
el SDK con **`gestor-inmuebles-produccion`** (`firebase-applet-config.json`), y no existía `.firebaserc`.
Quien siguiera esas instrucciones dejaba la aplicación con las reglas antiguas. **Esa es la única causa
compatible con «todo el estado observable cumple la regla del repositorio y aun así se deniega»**, y es la
que se corrige aquí.

## 2. Solución aplicada

### 2.1. Carteras deja de ser un error fatal de carga (código)

| Archivo | Cambio |
|---|---|
| `src/estadoDatos/canalIncidencias.ts` | `AlcanceIncidencia` (`DATOS` \| `CAPACIDAD`) en cada incidencia; `ORIGENES_CAPACIDAD_ADICIONAL = ['gestiones_cartera']`; `reportarErrorLectura(…, { alcance })`; `partirIncidenciasPorAlcance`. El **registro técnico se conserva íntegro** (código, mensaje, `console.error`). |
| `src/lib/firebase.ts` | La escucha de Carteras reporta con `{ alcance: 'CAPACIDAD' }` y **sigue** lanzando el diagnóstico `[diag:carteras]` tras la denegación. |
| `src/estadoDatos/useEstadoLecturas.ts` | `intentoDeCapacidad(origen)` y `reintentarCapacidad(origen)`: contador y reintento **propios**; las incidencias de capacidad no entran en el mapa de estados de pantalla. |
| `src/components/estado-datos/AvisoIncidenciasDatos.tsx` | El aviso global sólo resume datos primarios. Las capacidades se muestran en un aviso **específico** («Carteras: no se han podido leer tus carteras ni delegaciones») con su botón «Reintentar lectura», sin detalles técnicos. |
| `src/App.tsx` | `intentoCarteras = intentoDeCapacidad('gestiones_cartera')` alimenta la escucha; `onReintentarCapacidad={reintentarCapacidad}` en el aviso. El «Reintentar» de los datos no toca Carteras y viceversa. |

Comportamiento resultante:

| Caso | Antes | Ahora |
|---|---|---|
| Gestor autorizado con carteras | carteras + ámbito parcial | **igual** (siguen llegando; delegación válida intacta) |
| Cuenta sin carteras | `[]` | **igual** (`[]`, sin aviso) |
| Propietario sin cartera | `[]` | **igual** (entra al Portal con normalidad) |
| Carteras denegadas o no publicadas | aviso **global** «No se han podido leer algunos datos»; reintento ineficaz | incidencia registrada (diagnóstico intacto) + **aviso específico** + reintento dirigido que **sí** reabre la escucha; el Portal sigue completo |
| Datos primarios denegados | error de carga de la pantalla | **igual** (sin cambios: siguen siendo fatales y accionables) |

### 2.2. Despliegue de reglas inequívoco (configuración)

- Nuevo **`.firebaserc`** con `default: gestor-inmuebles-produccion`: `firebase deploy --only firestore:rules`
  ya no puede ir a otro proyecto por omisión.
- Instrucciones de publicación corregidas en `MAPA-MAESTRO-ERP-ACTUAL.md`, `FASE_1.4`, `2.0`, `2.2`, `2.3`,
  `3.0` y `3.2`, con aviso explícito de que **`startup-sanctuary-sln7n` NO es producción**.
- Guarda automática: `tests/reglas-despliegue-produccion.test.ts` (4 tests) fija que `.firebaserc`, la
  configuración de la app y `firebase.json` apuntan al mismo proyecto/base, y que ninguna instrucción de
  despliegue publica en el proyecto antiguo.

## 3. `firestore.rules`: **sin cambios**

No se ha modificado ninguna regla (`git diff` de `firestore.rules`, `storage.rules`, `firestore.indexes.json`
vacío). La condición que autoriza la consulta real ya es la correcta, específica y de mínimo privilegio:

```
match /gestiones_cartera/{gestionId} {
  allow get: if esAdminInmuebles() || gestionInvolucraAMi(resource.data) || leerGestionInvitada(resource.data);
  allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);
  …
}
function gestionInvolucraAMi(d) {
  return activeUser() && (
    (isPropietarioRole() && 'propietarioId' in d && d.propietarioId == myPropId()) ||
    ('gestorUsuarioId' in d && 'usuarioId' in me() && d.gestorUsuarioId == me().usuarioId)
  );
}
```

- NO existe `allow read: if true` ni acceso global; la colección completa sin `where` sigue denegada.
- Un gestor **no** puede leer la cartera de otro gestor (la consulta con un id ajeno se deniega).
- El titular conserva su propia cartera; el aislamiento A/B y el N-TITULARES no se tocan.
- Demostrado con el evaluador del repositorio sobre el **texto real** del fichero, incluida la consulta
  exacta que ejecuta el cliente: `tests/carteras-capacidad-adicional.test.tsx` (casos 6 y 8) y
  `tests/carteras-lectura-matriz-reglas.test.ts`.

### Qué hay que hacer **después del merge** (acción manual, no la hace Vercel)

Publicar las reglas del repositorio en el proyecto real de la aplicación:

```bash
npm i -g firebase-tools            # sólo la primera vez
firebase login
firebase deploy --only firestore:rules --project gestor-inmuebles-produccion
# o sin --project: el destino por defecto lo fija el .firebaserc de este repositorio
```

Comprobación (2 minutos): Firebase Console › proyecto **`gestor-inmuebles-produccion`** › Firestore › base
`ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` › Reglas, y verificar que contiene
`match /gestiones_cartera/{gestionId}`, `allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);`,
`perfilActualVeraz` y `match /titularidades/…` tal como están en `firestore.rules` de la rama.
**Nunca** publicar en `startup-sanctuary-sln7n`.

Si tras publicar la denegación persistiera, el diagnóstico `[diag:carteras]` (consola) devolvería
`causa: REGLAS_PUBLICADAS_O_PLANIFICADOR` con `dondeComprobarReglas`; ese sería el único escenario restante
(planificador de consultas de Google), y **no bloquea el Portal**: la aplicación seguiría funcionando sin
carteras y con reintento disponible.

## 4. Pruebas (los 9 criterios de cierre)

Archivo nuevo `tests/carteras-capacidad-adicional.test.tsx` (14 tests) + ampliaciones en los tests
existentes. Host de prueba = módulos **reales** (`useEstadoLecturas`, `useGestionesCarteraGestor`,
`AvisoIncidenciasDatos`, `PuertaEstadoDatos`, `PropietarioPortalSection`); sólo se sustituye la frontera de
datos.

| # | Criterio | Dónde |
|---|---|---|
| 1 | Carteras autorizadas → devuelve datos | `1 · gestor autorizado…` (+ `A3/A4` de la matriz de reglas) |
| 2 | Sin carteras → `[]` | `2 · sin ninguna cartera…` (+ `A1/A2`) |
| 3 | `permission-denied` → la aplicación continúa | `3 · …no produce el aviso global`, `3b` |
| 4 | `permission-denied` → no se pierde el resto del estado | `4 · …NO se pierde lo leído ni el resto del Portal` |
| 5 | Reintentar → vuelve a ejecutar la lectura | `5 · …reabre la escucha con el contador propio` (+ `E1/E2` de la matriz) |
| 6 | Un gestor no puede leer cartera ajena | `6 · …id propio autorizado / id ajeno denegado` (+ `B1`) |
| 7 | Propietario sin cartera no queda bloqueado | `7 · …entra normalmente al Portal` |
| 8 | Las reglas mantienen aislamiento | `8 · …condición específica (nunca if true)` |
| 9 | No se rompe la delegación válida | `9 · …delegación ACTIVA + aceptada mantiene su ámbito` |
| — | Carteras no es error de datos (unidad) | `canalIncidencias.test.ts` (+6) · `useEstadoLecturas.test.tsx` (+3) · `estadoDatosUI.test.tsx` (+3) · matriz (+1) |
| — | Despliegue al proyecto real | `reglas-despliegue-produccion.test.ts` (4) |

Se mantienen intactos los tests de titularidades (`tests/titularidades-lecturas-acotadas.test.tsx`,
`tests/f2-acceso-titularidades.test.ts`, `tests/portal-titularidades.integracion.test.tsx`), de Portal
(`tests/portal-contador-viviendas-baja.test.tsx`, `tests/portal-propietario.test.tsx`) y de baja patrimonial
(`tests/baja-patrimonial-inmuebles.test.tsx`), todos en verde.

## 5. Validación final (rama, commit de cierre)

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` (= `tsc --noEmit`; no hay ESLint en el repo) | exit 0 |
| `npm run build` (`vite build` + `esbuild server.ts`) | exit 0 |
| `npx vitest run` | **176 archivos · 3.181 tests pasados · 2 omitidos · 0 fallos** (antes de esta orden: 174 · 3.150 · 2; +2 archivos y +31 tests) |
| `git diff --check` | limpio |
| Alcance del diff | sólo `estadoDatos/*`, `estado-datos/*`, `App.tsx`, `firebase.ts`, `.firebaserc`, documentos de despliegue y tests. **Sin cambios** en `firestore.rules`, `storage.rules`, `firestore.indexes.json`, N-TITULARES, baja patrimonial, titulares ni contratos |

## 6. Resumen para el merge

- **Causa**: la denegación de una capacidad adicional se presentaba con la política de errores de los datos
  primarios (causa de código, corregida) y las instrucciones del repositorio publicaban reglas en un
  proyecto distinto del que usa la aplicación (causa de configuración, corregida con `.firebaserc` y docs).
- **Solución**: alcance `CAPACIDAD` en el canal de incidencias + aviso específico + reintento dirigido;
  `firestore.rules` sin cambios (ya era correcta y específica).
- **Tras el merge**: `firebase deploy --only firestore:rules --project gestor-inmuebles-produccion`.
- **PR #17**: listo para merge (tests, lint, build y diff-check en verde).
