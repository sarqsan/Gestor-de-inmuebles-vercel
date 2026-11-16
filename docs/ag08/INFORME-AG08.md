# AG-08 · Eliminación segura de `passwordHash`

**Rama:** `arena/d44d3f9e-gestor-de-inmuebles-vercel`
**Base:** `main` @ `d314856d02f26577b074f7ea7617cec849cf0846` (AG-11 fusionado y desplegado)
**Fecha:** 2026-11-16
**Estado:** **código y migración preparados y validados · REVISIÓN FINAL DE SEGURIDAD COMPLETADA · MIGRACIÓN NO EJECUTADA**

> **Criterio de parada respetado.** No se ha borrado `passwordHash` de Firestore, no se ha
> tocado ningún dato de producción, no se han modificado cuentas reales, credenciales,
> reglas de Firebase ni configuración de autenticación. No hay fusión ni despliegue.
> La sección §9 enumera exactamente qué requiere autorización expresa.

---

## 1. Resumen ejecutivo

`passwordHash` era un campo de credencial **obsoleto y ya inoperante**: guardaba un SHA-256
sin sal (o el fallback `fb_<hex>` de 32 bits) de la contraseña, y solo se consumía en un
camino de «verificación directa» que **nunca podía ejecutarse con éxito**, porque las reglas
de Firestore exigen sesión (`isSignedIn()`) para leer `usuarios/*` y ese camino se ejecuta,
por definición, sin sesión.

Por tanto la retirada **no cambia quién puede entrar**: la autoridad de autenticación es y
sigue siendo Firebase Auth, cuyas credenciales viven en su propio almacén y no se tocan.
Lo que se elimina es (a) la escritura del hash, (b) la comparación muerta y (c) el propio
derivador `hashPassword`, incluido su **fallback de 32 bits**, que era el peor elemento de
todo el conjunto.

**Decisión de orden:** los datos se limpian **antes** que la regla, y la regla no se ha
tocado en este bloque (ver §6).

---

## 2. Inventario de referencias

Estado inicial: **14 sitios** (10 en código, 2 en reglas, 2 en artefactos P0).

| # | Ubicación | Tipo | Función | Acción AG-08 |
|---|---|---|---|---|
| 1 | `src/lib/authService.ts:321` | lectura | compara hash del admin en login directo | **eliminada** (camino muerto) |
| 2 | `src/lib/authService.ts:332` | lectura | compara hash de usuario en login directo | **eliminada** (camino muerto) |
| 3 | `src/lib/authService.ts:365` | escritura | `saveUsuarioFirestore({...usuario, passwordHash})` (auto-creación admin) | **eliminada** |
| 4 | `src/lib/authService.ts:486` | escritura | objeto de bootstrap del admin | **eliminada** |
| 5 | `src/lib/authService.ts:777` | escritura | `setDoc(usuarios/{uid}, {...nuevoUsuario, passwordHash})` | **eliminada** |
| 6 | `src/lib/authService.ts:128` | derivación | `hashPassword` (SHA-256 + fallback débil) | **eliminada** (0 consumidores) |
| 7 | `src/lib/firebase.ts:3476` | firma | `saveUsuarioFirestore` admitía `passwordHash?: string` | **retirada del tipo** |
| 8 | `firestore.rules:2437` | regla | **inmoviliza** el campo (lista negra) | **intacta** (§6) |
| 9 | `reglas-firestore-r12/firestore-cierre-corregido.rules:2357` | regla espejo | ídem | **intacta** |
| 10 | `docs/p0/p0-matriz-roles.json:1978` | artefacto | texto de la regla | **intacto** |
| 11 | `docs/p0/p0-inventario-reglas.json:719` | artefacto | texto de la regla | **intacto** |
| 12 | `src/test/e/bloqueE.servicios.test.ts:161` | prueba | exigía `typeof doc.passwordHash === 'string'` | **rebasada** (§7.1) |
| 13 | `tests/acceso-propietarios.test.ts:344` | prueba | exige **ausencia** del campo en la ficha | **intacta** (sigue verde) |
| 14 | `tests/acceso-propietarios.test.ts:357` | prueba | exige ausencia en `clavesUpdate` | **intacta** (sigue verde) |
| — | `tests/acceso-propietarios.test.ts:499` | prueba | **ata** la regla a contener `'passwordHash',` | **intacta** (la regla no cambia) |

**Las «cinco referencias conocidas» de `authService.ts` siguen vigentes como inventario**
(líneas 321, 332, 365, 486, 777 del estado inicial): se localizaron las cinco, se clasificaron
(2 lecturas + 3 escrituras) y las cinco han sido retiradas. A ellas se añadieron, en este
diagnóstico, `hashPassword` (#6), la firma de `firebase.ts` (#7) y los dos artefactos P0
(#10, #11), que no figuraban en el recuento previo.

### 2.1 Diferencias entre código y datos persistidos

- **Código (antes):** 3 puntos de escritura del campo y 2 de lectura.
- **Datos persistidos:** los documentos escritos por esas rutas contienen `passwordHash`
  **solo si** el flujo llegó a escribir el perfil. Las cuentas creadas o reparadas
  exclusivamente por Firebase Auth pueden no tenerlo. No existe migración ni esquema que
  garantice su presencia: el campo es **opcional en la práctica**.
- **Consecuencia:** el número de documentos afectados **no se conoce sin leer producción**, y
  no se ha leído. Por eso la migración (§5) calcula el plan en el momento de ejecutarse y
  exige manifiesto previo.
- **Forma del valor:** SHA-256 hex de 64 caracteres, o `fb_<hex>` (fallback, 31+ bits de
  entropía real). Ambos formatos se contemplan; el plan borra el campo **sea cual sea su
  forma** (incluidos `null` u objeto, por robustez ante datos heredados).

---

## 3. Dependencias analizadas y por qué ninguna se rompe

| Dependencia | ¿Consume el campo? | Veredicto |
|---|---|---|
| Login `loginWithEmail` | Solo en el camino directo **inalcanzable** | Retirado; el resto del login (Firebase Auth + perfil + `lastLoginAt` + auditoría + espejo) intacto |
| Registro por invitación | **Escribe**, no lee | Retirada la escritura; el alta sigue creando perfil, rol, permisos y vínculos |
| Bootstrap del admin principal | **Escribe** | Retirada la escritura; el perfil se sigue creando y guardando |
| `saveUsuarioFirestore` | Lo arrastraba por tipo | Firma restringida: **ningún llamador puede ya persistirlo** |
| Recuperación de acceso | No participa | Sin cambios |
| Administración (`tipoPerfil`, roles, permisos) | No participa | Sin cambios |
| **Reglas de Firestore** | **No lo consume: lo inmoviliza** | **Intactas** (§6) |
| Storage rules | Sin referencias | Sin cambios |

### 3.1 Evidencia de que el camino directo era inalcanzable

1. `firestore.rules` para `usuarios/{usuarioId}`: `allow get: if isMasterAdmin() || (isSignedIn() && …)` y `list` no abierto a anónimos. Sin sesión, **toda** lectura se deniega.
2. El camino directo se activa **solo** cuando `signInWithEmailAndPassword` falla con
   `auth/operation-not-allowed`, es decir, **sin** usuario autenticado (`firebaseUser === null`).
3. El propio código ya envolvía las lecturas en un `catch` que, ante un error de permisos,
   lanzaba `MENSAJE_LOGIN_SIN_PERMISOS`. Es decir: **el fallo estaba previsto y traducido**.
4. La prueba `tests/login-admin-principal.test.ts` (B.3, B.4) documenta exactamente este
   diagnóstico y **ya lo daba por roto** antes de AG-08: «el modo directo sigue sin acceso a
   `usuarios/*`».

Por eso se sustituye por un rechazo determinista con el mismo mensaje accionable
(`MENSAJE_LOGIN_SIN_PERMISOS`), en lugar de intentar lecturas que siempre fallan. El
comportamiento observable para el usuario no cambia; el código deja de fingir una vía de
acceso que no existe.

---

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/lib/authService.ts` | −73/+25. Retirado el camino directo muerto; retiradas las 3 escrituras; retirada `hashPassword` (con su fallback débil). El rechazo sin sesión es explícito. |
| `src/lib/firebase.ts` | Firma de `saveUsuarioFirestore` sin `passwordHash?`; se conserva `authMethod?` (metadato de diagnóstico, no credencial, con valores legacy en datos). |
| `src/test/e/bloqueE.servicios.test.ts` | La expectativa «el alta **escribe** el hash» se rebasa a «el alta **no** lo escribe» (más estricta). |
| `tests/login-admin-principal.test.ts` | C.4 rebasada: ya no exige usos de `esErrorPermisosFirestore` (venir del camino retirado), exige el rechazo explícito, la ausencia de construcción de perfil y la ausencia de `passwordHash`/`hashPassword` en `loginWithEmail`. |
| `scripts/ag08/migrar-passwordhash.mjs` | **Nuevo.** Migración offline/real, dry-run por defecto, idempotente, auditable, sin registrar hashes. |
| `src/features/ag08/tests/migracion-passwordhash.test.ts` | **Nuevo.** 9 pruebas de la migración con datos ficticios. |
| `src/features/operaciones/tests/isolation.test.mjs` | Guarda de superficie: se declara `SUPERFICIE_AG08` fichero a fichero (exigencia de la propia guardia de AG-11). |
| `docs/ag08/INFORME-AG08.md` | **Nuevo.** Este informe. |

Ninguna regla, ningún dato, ninguna cuenta.

---

## 5. Estrategia de migración de datos (preparada, NO ejecutada)

`scripts/ag08/migrar-passwordhash.mjs`

**Propiedades exigidas por la orden, y cómo se cumplen:**

| Requisito | Implementación |
|---|---|
| **Idempotente** | Solo planifica documentos donde `hasOwnProperty('passwordHash')`. Reejecutar sobre estado limpio ⇒ 0 escrituras. Verificado por prueba (§7.3) y por la verificación posterior del propio script. |
| **Auditable** | Manifiesto JSON con `resumen`, `idsAfectados` y `detalle` (id + motivo + tipo/longitud). En modo real, además, un documento en `audit_logs` por documento con `accion: AG08_PASSWORDHASH_RETIRADO`. |
| **Sin registrar hashes ni credenciales** | `describirValorSeguro()` devuelve solo `<string:64>`; `validarManifiestoSinSecretos()` **aborta** si un valor real aparece en el manifiesto o si se cuela una clave `passwordHash` con valor. Probado por mutación (§7.4, M3). |
| **Datos ajenos intactos** | Usa `update({ passwordHash: FieldValue.delete() })` con **un único campo**: no reescribe el documento, no recalcula `updatedAt` y no toca ningún otro valor. Probado con centinelas, comparación profunda y objetos anidados (§7.3 y §11.6). *(Nota: `update` sí estampa `updateTime` del servidor, metadato interno de Firestore que no forma parte de los datos del documento.)* |
| **Respaldo verificable** | `--aplicar` **exige** `--respaldo <id-export>`; sin él aborta. El respaldo es el export de Firestore (§5.2). |
| **Dry-run por defecto** | Sin `--aplicar` no escribe nada; solo informa y emite manifiesto. |
| **Guardas de producción** | `--aplicar` exige `--proyecto` + `--credencial`; si el proyecto no acaba en `-test` o no empieza por `demo-`, exige además `--confirmo-produccion`. |

### 5.1 Procedimiento previsto (para cuando se autorice)

```bash
# 0) Respaldo (bucket privado con retención). Anotar el id del export.
gcloud firestore export gs://<bucket-respaldo>/ag08-pre --collection-ids=usuarios

# 1) Validación offline con datos ficticios (sin credenciales, sin red)
node scripts/ag08/migrar-passwordhash.mjs --entrada fixtures.json

# 2) Dry-run contra el proyecto de pruebas (no escribe)
node scripts/ag08/migrar-passwordhash.mjs --proyecto <proy>-test --credencial sa-test.json

# 3) Aplicar en PRUEBAS y reejecutar para demostrar idempotencia
node scripts/ag08/migrar-passwordhash.mjs --aplicar --proyecto <proy>-test \
     --credencial sa-test.json --respaldo <id-export>
node scripts/ag08/migrar-passwordhash.mjs --aplicar --proyecto <proy>-test \
     --credencial sa-test.json --respaldo <id-export>   # ⇒ 0 borrados

# 4) Producción: SOLO con autorización expresa.
```

### 5.2 Respaldo y reversión

- **Artefacto de vuelta atrás:** export de Firestore **previo** a la migración, en bucket
  privado con retención. *No* se versiona en el repositorio (contendría credenciales).
- **Reversión:** restaurar el export. Como el código ya no lee ni escribe el campo,
  restaurarlo es **inerte** para la autenticación: no reabre ningún camino, y devuelve el
  estado exacto anterior.
- **Ventana de cambio:** registrar el id del export y la hora junto al despliegue.

---

## 6. Las reglas de Firestore NO se han tocado (decisión razonada)

`firestore.rules:2437` incluye `'passwordHash',` dentro de
`affectedKeys().hasAny([...])`, es decir, **impide** que el usuario modifique ese campo en su
propio documento.

- **No es una dependencia funcional: es una protección.**
- Retirarla **mientras existan documentos con el campo** permitiría a un usuario escribir su
  propio `passwordHash`, lo que **debilitaría** la seguridad.
- Por tanto el orden correcto es **datos primero → regla después**, y ese segundo paso
  requiere autorización expresa (no forma parte de este bloque).
- Consecuencia práctica: `tests/acceso-propietarios.test.ts:499` (que ata la regla a contener
  el literal) **sigue verde y no se ha modificado**. Es coherente, no un olvido.

---

## 7. Validaciones ejecutadas (resultados exactos)

### 7.1 Pruebas específicas de auth y cuentas

| Conjunto | Resultado |
|---|---|
| `tests/login-admin-principal.test.ts` (A.1–A.4, B.1–B.7, C.1–C.5) | **16/16 verde** |
| `tests/acceso-propietarios.test.ts` | **verde** (incl. guardas de ausencia del campo y de la regla) |
| `src/test/e/bloqueE.servicios.test.ts` | **31/31 verde** |
| `src/features/ag08/tests/migracion-passwordhash.test.ts` | **9/9 verde** (nuevas) |

### 7.2 Suite completa

```
npm test
Test Files  336 passed (336)
Tests       5569 passed | 7 todo (5576)     · 0 fallos · 0 omitidas
```

Primera pasada en clon superficial: `5567 passed | 2 skipped`. Las 2 omitidas estaban en
`tests/seguridad-firestore-valoraciones.test.ts` (§10.9) y dependen de un commit histórico
(`33fcf38`) ausente del clon superficial; **no las causa este cambio**. Con
`git fetch --unshallow origin` ⇒ **0 omitidas**. Se documenta para no confundirlo con una
regresión.

### 7.3 Integración

```
npm run test:integracion
operaciones: 303 pass · 0 fail · 0 skipped   (5.560 → 303 + 88 = 391 contenedores de integración)
patrimonial:  88 pass · 0 fail · 0 skipped
```

La guarda de superficie de AG-11 falló inicialmente porque AG-08 toca `src/lib/*`, fuera de
`src/features/operaciones/`. Se resolvió **declarando la superficie exacta** de AG-08
(fichero a fichero), que es precisamente lo que la guarda exige. También exigió que los
ficheros nuevos estuvieran confirmados en Git (verificado).

### 7.4 TypeScript

```
npx tsc --noEmit  → 0 errores
```

### 7.5 Build de producción

```
npm run build → ✓ built in 13.62s (sin errores; solo el aviso habitual de chunk size)
```

### 7.6 Mutación (4/4 detectadas y restauradas)

| # | Mutación | Detectada por |
|---|---|---|
| M1 | Reintroducir `passwordHash` en el `setDoc` del registro | `bloqueE.servicios.test.ts` (alta INQUILINO) |
| M2 | Reintroducir material de credencial en `loginWithEmail` | `login-admin-principal.test.ts` C.4 |
| M3 | Hacer que el manifiesto registre el valor real del hash | 3 pruebas de la migración (no exposición + guarda) |
| M4 | Romper la idempotencia (marcar «a borrar» sin campo) | 4 pruebas (plan, idempotencia, manifiesto) |

Tras cada mutación el fichero se restauró desde copia y se verificó el diff contra la versión
intacta.

### 7.7 Sin referencias funcionales inesperadas

- Código de aplicación (`src/lib/**`): **0 referencias funcionales**. Solo comentarios explicativos.
- `passwordHash` aparece únicamente en: el script de migración (intencional), las pruebas
  (ficticias), comentarios, y `firestore.rules` + espejo + artefactos P0 (**intactos a propósito**).
- `hashPassword`: **0 referencias** en todo el repositorio.

---

## 8. Riesgos residuales

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | Documentos existentes conservan el hash hasta que se autorice la migración | **Media** (material obsoleto en reposo) | Campo inmovilizado por regla (no escribible por el usuario); ningún código lo lee. Se retira al autorizar §5. |
| R2 | El fallback `fb_<hex>` tenía ~31 bits de entropía | Baja tras AG-08 | **Eliminado del código**: ya no puede generarse ningún valor nuevo. |
| R3 | Un cliente antiguo en caché sigue enviando `passwordHash` | Baja | La regla lo **inmoviliza**; `update` no lo incluye y el tipo ya no lo admite. |
| R4 | `authMethod: 'direct_firestore'` queda como valor legacy inerte | Baja | Se conserva a propósito (metadato histórico, no credencial). Documentado en la firma. |
| R5 | La migración, si se ejecuta sin respaldo | **Alta si ocurriera** | `--aplicar` **aborta** sin `--respaldo` (verificado). Requiere autorización expresa. |
| R6 | Fuga de hashes en el manifiesto | Media | `validarManifiestoSinSecretos()` aborta; probado por mutación (M3). |

**Riesgo aceptado y explícito:** mientras no se ejecute la migración, los hashes siguen en
reposo. Es un estado **mejor** que el inicial (ya no se generan, no se leen, no se escriben y
no pueden modificarse), pero **no** un estado final.

---

## 9. Datos y operaciones que requieren autorización expresa

Ninguna de estas acciones se ha ejecutado:

1. **Ejecutar la migración sobre Firestore** (pruebas o producción), incluido el `--aplicar`.
2. **Crear el export de respaldo** en el bucket correspondiente y registrar su id.
3. **Instalar `firebase-admin`** como dependencia (no está declarada; el script lo exige solo
   cuando se autorice, y el modo offline no lo necesita).
4. **Retirar `'passwordHash'` de `firestore.rules:2437`** y de su espejo
   `reglas-firestore-r12/firestore-cierre-corregido.rules:2357` — **después** de limpiar los
   datos, y con dictamen.
5. **Rebasar `tests/acceso-propietarios.test.ts:499`** (atado a la regla) y **regenerar** los
   artefactos P0 `p0-matriz-roles.json` / `p0-inventario-reglas.json`.
6. **Fusionar y desplegar** este bloque.

---

## 10. Estado del CI de la PR

| Job | Resultado |
|---|---|
| **Tipos, suite completa y build** | **success** |
| Vercel / Vercel Preview Comments | success |
| **Reglas Firestore y Storage (emuladores oficiales)** | **failure** — *preexistente, no causado por AG-08* |

**El fallo del job de emuladores es PREEXISTENTE.** Evidencia:

- El **mismo job ya fallaba en la PR #90** (base `main`, antes de AG-08), con
  **cifras idénticas**: `p0-cobertura-reglas.emulador.test.ts → FAILED · 767/771 correctas ·
  4 fallidas · 0 omitidas` y resumen `878/894 · 4 fallidas · 12 omitidas`.
- Esos **4 fallos son los 4 fallos históricos de P0** que la orden marca como
  **no tocar** (`enlaces_registro` 6/8/9 y `audit_logs` 7).
- AG-08 **no modifica** `firestore.rules` ni `storage.rules` (los emuladores cargan esas
  reglas desde `firebase.json`), y no toca ningún flujo de esas colecciones.
- Efecto neto: **878/894 correctas**, exactamente el mismo que en `main`.

No se ha ocultado ni desactivado ninguna prueba para evitar este fallo. No se puede
reproducir en el sandbox por ausencia de `java` (el emulador oficial no arranca).

> Este job queda por tanto **en rojo por la línea base heredada**, no por este bloque.
> Dejarlo en verde exige abordar los 4 fallos históricos de P0, que están **fuera del
> alcance autorizado**.

---

## 11. Revisión final de seguridad (previa a la fusión)

Revisión solicitada antes de autorizar el merge. **Encontró 5 defectos reales en el script
de migración, todos corregidos y ahora cubiertos por pruebas.**

### 11.1 Revisión del código

| Comprobación | Resultado |
|---|---|
| La retirada del login directo no rompe flujos legítimos de Firebase Auth | **Confirmado.** `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail` y `signOut` intactos. Solo se retiró la rama sin sesión, que era inalcanzable. |
| No quedan escrituras ni lecturas funcionales de `passwordHash` | **Confirmado.** 0 en código de aplicación (solo comentarios). Única aparición funcional: el script de migración, que solo borra. |
| Las tres escrituras retiradas no tenían efectos secundarios necesarios | **Confirmado.** `saveUsuarioFirestore` sigue persistiendo perfil, espejo `usuarios_auth`, auditoría y `lastLoginAt`; solo cambió el campo retirado. El alta sigue creando rol, permisos y vínculos. |
| Las pruebas modificadas son más estrictas y no ocultan regresiones | **Confirmado y reforzado.** Ver §11.2: las 2 rebasadas son más estrictas y se han **añadido 13 pruebas nuevas** (D.1–D.5 y guardas/núcleo). |
| `firestore.rules` conserva intacta la protección del campo | **Confirmado, verificado empíricamente.** Ver §11.3. |
| Sin dependencias ni cambios ajenos al bloque | **Confirmado.** `package.json`/`package-lock.json` sin cambios; 9 ficheros, todos de AG-08. |

### 11.2 Pruebas añadidas en la revisión (13)

- **D.1–D.5** contra las **reglas reales**: el alta **sin** `passwordHash` sigue permitida; con y
  sin campo el resultado de `create` es idéntico; el titular **no puede** modificar ni fabricarse
  el campo; el campo sigue inmovilizado en el texto de las reglas.
- **Guardas de `--aplicar`** (7): fail-closed, lista blanca, `--confirmo-produccion` no abre la
  puerta, huella de respaldo sin ruta.
- **Núcleo de escritura** (3): solo se toca `passwordHash`; un fallo no aborta el resto; una
  auditoría caída no impide el borrado.

### 11.3 La protección del campo sigue viva (y una precisión importante)

- D.3/D.4 demuestran **contra las reglas reales** que el titular no puede modificar el campo ni
  crearlo si no existía: `allow update` sigue vetándolo vía `affectedKeys().hasAny([...])`.
- `passwordHash` aparece **una sola vez** en las reglas (línea 2437) y solo en un bloque de
  **update** (`existing()`/`diff`). **No es requisito de `create`** — por eso dejar de escribirlo
  no rompe ningún alta (D.1/D.2).
- **Precisión que corrige una afirmación demasiado amplia mía:** el script usa el **SDK Admin**,
  que **omite las reglas de Firestore**. Las reglas **no** pueden frenar la migración. La única
  protección real contra una migración mal apuntada son las guardas del script (§11.4, D4).

### 11.4 Defectos encontrados en la migración y corregidos

| # | Defecto | Riesgo | Corrección |
|---|---|---|---|
| **D1** | Los mensajes de error de Firestore/**`JSON.parse`** se imprimían tal cual. Un service-account mal formado puede aparecer **dentro del mensaje** de `JSON.parse`. | **Fuga de credencial en logs** | `codigoError()` imprime solo el **código**; la lectura de credencial se captura y se sustituye por un motivo opaco. Verificado: con `--credencial /tmp/SECRETO-sa.json` inexistente el log dice `Error`, **no la ruta**. |
| **D2** | El manifiesto guardaba la **ruta completa** del fichero de entrada. | Fuga de rutas del entorno | Se guarda `path.basename()`. Verificado: `/tmp/ag08r` no aparece. |
| **D3** | El manifiesto y `audit_logs` guardaban el **id completo del export** de respaldo. | Revela bucket/ruta de infraestructura | `huellaRespaldo()` → `respaldo#<hex>`; permite correlacionar sin revelar la ruta. |
| **D4** | Guarda de producción **débil**: bastaba `--confirmo-produccion` para que `gestor-real` pasara. | **Apuntar a producción por error** | **Fail-closed**: exige lista blanca `AG08_PROYECTOS_PRUEBA` y pertenencia a ella. Verificado: producción + `--confirmo-produccion` ahora **aborta**. |
| **D5** | La **simulación** replicaba el bucle de escritura en vez de ejecutar el código de la migración. | Prueba complaciente: no detectaba un borrado de campo de más | Se extrajo `aplicarPlan()` (núcleo único, usado por la ejecución real **y** por la simulación). Verificado: la mutación «borrar un campo de más» **ahora sí** se detecta. |

### 11.5 Auditoría de la migración, punto por punto

| Requisito | Cómo se cumple | Evidencia |
|---|---|---|
| El dry-run no modifica datos | Sin `--aplicar` no hay ninguna escritura; el modo offline ni siquiera carga el SDK | Simulación paso [2]: 0 escrituras en dry-run |
| El respaldo contiene los documentos necesarios para restaurar | Export íntegro previo; obligatorio `--respaldo` para aplicar | Simulación pasos [1] y [5] |
| Nunca imprime ni incorpora hashes | Solo `<string:N>`; guarda que aborta si se cuela un valor | Tests + simulación paso [6]; mutación M3 |
| Identifica exactamente los documentos afectados | Solo `hasOwnProperty('passwordHash')` | Simulación paso [2]; prueba de plan |
| No modifica campos distintos de `passwordHash` | `update` con un único `FieldValue.delete()` | Núcleo probado (3 tests) + simulación paso [4] con comparación profunda |
| Es idempotente | Reejecutar ⇒ 0 escrituras | Simulación paso [3]; 3 pruebas |
| Aborta ante errores / documentos inesperados / respaldo incompleto | Fail-closed en todas las guardas; cuenta fallos y marca INCOMPLETO | 5 guardas verificadas por CLI + 7 pruebas |
| La restauración funciona de verdad | Prueba ejecutable con datos ficticios | **Simulación paso [5]: 20/20, base idéntica al original** |
| No se puede apuntar a producción por accidente | Lista blanca obligatoria (D4) | 4 pruebas + verificación CLI |

### 11.6 Resultado de las pruebas de respaldo y restauración

`scripts/ag08/simular-respaldo-restauracion.mjs` — **20/20 comprobaciones**, ejecutable y
repetible, sin red y sin Firestore real:

```
[1] Respaldo previo ............ export con TODOS los documentos y los 3 hashes restaurables
[2] Dry-run y aplicación ....... 0 escrituras en dry-run · 3 documentos · solo el campo
[3] Idempotencia ............... 2.º plan = 0 · 2.ª ejecución = 0 escrituras
[4] Sin cambios colaterales .... documentos idénticos salvo el campo · createdAt y anidados intactos
[5] RESTAURACIÓN ............... base restaurada IDÉNTICA al original · el hash vuelve
[6] Sin hashes en lo registrado . 3/3 hashes ausentes
```

**Validez del arnés verificada por mutación:** romper la idempotencia y forzar un borrado de
campo de más hacen **fallar** la simulación. No es un test complaciente.

### 11.7 Resultado de las pruebas y del CI

```
npm test                 336 archivos · 5583 passed · 0 fallos · 7 todo · 0 omitidas  (antes 5569)
npm run test:integracion 303 + 88 · 0 fallos · 0 omitidas
npx tsc --noEmit         0 errores
npm run build            OK
```

### 11.8 Los cuatro fallos históricos de P0, documentados por separado

Verificado **por nombre exacto**, no por el total (el total podría coincidir por azar). Comparé el
resumen de emuladores de la **PR #90 (main, sin AG-08)** con el de la **PR #91**:

- Fallos en la base: **4** · Fallos en AG-08: **4**
- Coinciden **4/4 por nombre exacto** · **Nuevos: 0** · **Desaparecidos: 0**
- Desglose por archivo: **idéntico** · Omitidas (12): **idénticas**

| # | Fallo histórico | Colección | Archivo:línea | No se toca porque |
|---|---|---|---|---|
| 1 | «el propietario A no lee el documento del propietario B (lectura cruzada)» | `enlaces_registro` (supuesto 6) | `p0-cobertura-reglas.emulador.test.ts:2399` | Fallo histórico de P0 |
| 2 | «un profesional no lee lo que no está en su ámbito» | `enlaces_registro` (8) | `:2410` | Fallo histórico de P0 |
| 3 | «un inquilino no lee lo que no le corresponde» | `enlaces_registro` (9) | `:2415` | Fallo histórico de P0 |
| 4 | «el propietario A no puede escribir en nombre de B (escritura cruzada)» | `audit_logs` (7) | `:2527` | Fallo histórico de P0 |

Los cuatro son `Expected request to fail, but it succeeded` en **lecturas/escrituras cruzadas** de
`enlaces_registro` y `audit_logs`. **No tienen relación con `passwordHash`**, con la autenticación
ni con `usuarios`. Quedan **fuera del alcance autorizado** y por eso no se han corregido: hacerlo
exigiría modificar reglas de Firebase, expresamente prohibido en esta orden.

**No hay regresiones nuevas:** 0 fallos nuevos por nombre, 0 archivos nuevos en rojo.

### 11.9 Confirmaciones exigidas

- **La migración NO se ha ejecutado.** Ni sobre pruebas ni sobre producción. No se ha creado
  ningún export de respaldo real (solo se ha *simulado* con datos ficticios).
- **Producción y sus datos permanecen intactos.** No se ha ejecutado ningún despliegue, ni
  `firebase deploy`, ni ninguna escritura contra Firestore. Este bloque solo añade código y
  documentación al repositorio.
- **No se ha fusionado la PR #91 ni se ha desplegado.** No se han modificado reglas de Firebase
  ni configuración de autenticación (verificado: 0 cambios en `firestore.rules`, `storage.rules`,
  `reglas-firestore-r12/` y `docs/p0/`).

---

## 12. Conclusión

- Ningún flujo legítimo de autenticación depende ya de `passwordHash`: la autoridad es
  Firebase Auth.
- No se pierde ninguna cuenta ni acceso: no se ha tocado ninguna credencial, ni el almacén de
  Firebase Auth, ni las reglas.
- El código ya **no puede** generar ni persistir el campo, y ha desaparecido el fallback débil.
- La limpieza de datos está **preparada, probada y es reversible**, pero **no ejecutada**,
  a la espera de autorización.
- Las dos pruebas que se han rebasado han quedado **más estrictas**, con justificación escrita
  en el propio código; no se ha eliminado ninguna prueba.
- Suite: **336 archivos / 5.583 pruebas / 0 fallos / 0 omitidas**; integración **303 + 88**;
  `tsc` 0; build OK; mutación 4/4 + mutación del arnés de restauración.
- **Revisión final de seguridad completada:** 5 defectos encontrados en el script de migración
  (D1–D5), **todos corregidos** y cubiertos por pruebas. La migración es ahora fail-closed de
  verdad y su simulación de respaldo/restauración prueba el **código real** (20/20).

**Parada respetada: no hay migración real, ni fusión, ni despliegue.**
