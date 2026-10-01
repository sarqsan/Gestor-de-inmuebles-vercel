# Diagnóstico «Lectura · Carteras: No tienes permisos…» — 2026-10-01 (Orden 2)

> **Actualización (misma fecha, PR siguiente):** el veredicto `REGLAS_PUBLICADAS_O_PLANIFICADOR` ya no termina en un aviso cuando todos los términos de la regla se cumplen: la capa de datos lee entonces las carteras **por relación** (un `get` por gestión indexada en el espejo propio) y solo avisa si ni el `get` se autoriza. Ver `CARTERAS_Y_TITULARES_INTERVENCION_2026-10-01.md`.

> **CIERRE (Orden 3, mismo PR #17).** Resuelto: Carteras se trata como **capacidad adicional**
> (aviso específico + reintento dirigido; ya no produce «No se han podido leer algunos datos» ni
> puede dejar el Portal inutilizable) y el destino de publicación de reglas queda fijado a
> **`gestor-inmuebles-produccion`** (`.firebaserc` + instrucciones corregidas). `firestore.rules`
> sigue **sin cambios**: la regla del repositorio ya era la correcta y específica. Detalle y criterios
> de cierre en `CARTERAS_CAPACIDAD_ADICIONAL_2026-10-01.md`.

Rama `arena/01a0f801-gestor-de-inmuebles-vercel` · PR #17 · base `origin/main` `21afea4`.
Complementa `ESTABILIZACION_PORTAL_TITULARES_2026-10-01.md` §2 («Carteras — qué se sabe y qué no»).

## Resultado

**B — causa aún no reproducible porque depende de Firebase publicado.** Lo que sí es **demostrable y
está demostrado** es qué operación lo provoca, para quién, con qué consulta exacta y que el repositorio
la autoriza. Lo que **no se puede demostrar desde aquí** es por qué el Firebase real la deniega, y por eso
no se toca ninguna regla ni se oculta el aviso: se deja la instrumentación que lo decidirá en una sola
prueba (§7).

| | Estado |
|---|---|
| Operación que provoca el aviso, consulta, usuarios, momento | **Demostrado** (§1) |
| ¿Necesita el Portal Propietario esta lectura? | **Demostrado** (§2): el Portal no; `App` sí, solo para quien además es gestor |
| La regla del repositorio autoriza la consulta de cada perfil legítimo | **Demostrado** a nivel de documento (§3) |
| Por qué el Firebase **publicado** la deniega | **No determinable offline** (§4). Hallazgo de configuración que lo hace verosímil: §5 |
| Defecto de flujo propio del aviso: «Reintentar lectura» no reintentaba Carteras | **Demostrado y corregido** (§6) |
| `firestore.rules` | **Sin cambios** |

## 1. Qué operación lo provoca (demostrado)

El texto sale de `AvisoIncidenciasDatos` («Lectura · {etiqueta}: {mensaje}»). La etiqueta «Carteras» es la
de `gestiones_cartera`, y el único productor de esa incidencia en todo el repositorio es el callback de error
de `subscribeGestionesCarteraGestor` (`reportarErrorLectura('gestiones_cartera', …)`, un solo sitio).

| Pregunta | Respuesta |
|---|---|
| Componente / flujo | `App` → `useGestionesCarteraGestor(currentUser, intentoLecturas, subscribeGestionesCarteraGestor)` (antes: efecto inline ROADMAP-04 en `App.tsx`). Nada que ver con el Portal, con el alta de inmueble ni con crear propietarios |
| Función | `subscribeGestionesCarteraGestor` (`src/lib/firebase.ts`) |
| Condición | `currentUser` fijado **y** `tipoPerfil ∈ {PROPIETARIO, PROFESIONAL}`. No se ejecuta para ADMINISTRADOR (ni master) ni INQUILINO |
| Momento | nada más iniciar sesión (al fijarse `currentUser`), y al cambiar de persona o de perfil. Antes **no** se rehacía al pulsar «Reintentar lectura» (§6) |
| Consulta exacta | `onSnapshot(query(collection(db,'gestiones_cartera'), where('gestorUsuarioId','==', <gestorUsuarioId>)))` — sin `orderBy`, sin índice compuesto |
| «uid» que usa | **No es el UID de Firebase Auth.** Es `currentUser.id`, el id de **perfil** (`usuarios/{id}`). Coincide con el UID solo si la ficha vive en `usuarios/{authUid}` |
| `gestorUsuarioId` | ese mismo valor. La regla lo compara con `usuarios_auth/{uid}.usuarioId` (el espejo del UID) |
| Para qué se consulta | localizar **delegaciones parciales** (`inmuebleIds ≠ ∅`, ACTIVA + ACEPTADA) donde esta persona es gestora. El espejo solo lleva carteras **completas** (`carterasL/E`; `proyectarCarterasGestionadas` descarta las parciales) y un puntero `gestionesPorPropietario[pid] = gestionId` sin `inmuebleIds` |
| Quién consume el resultado | `inmueblesParcialesActivosDe`, `ambitosInmueblesParcialesActivosDe`, `inmueblesParcialesEscrituraDe` → `dataScope.inmueblesGestionadosParciales` (suscripción de inmuebles), `usuarioConAmbitoAlquiler` y `ambitoEscrituraInmuebles` |

Comportamiento por caso (con la consulta autorizada → resultado; con denegación → efecto):

| Caso | Consulta autorizada | Si Firestore la deniega |
|---|---|---|
| **Propietario que no es gestor** | lista vacía; `gestionesCarteraGestor = []` (idéntico al estado inicial) | aviso «Lectura · Carteras»; **sin efecto funcional** (los derivados ya eran `[]`) |
| **Gestor** (PROFESIONAL, o PROPIETARIO que además gestiona) | solo **sus** gestiones; deriva el ámbito parcial | aviso; **pierde el ámbito parcial** (la escucha queda cerrada; Firestore no la reabre) |
| **No existe ninguna cartera** | lista vacía, **sin error**: Firestore no usa las reglas como filtro, la autorización depende de la consulta y del perfil, nunca de si hay documentos | exactamente igual que con carteras: una consulta no autorizable se deniega aunque la colección esté vacía |
| ADMINISTRADOR / master / INQUILINO | no se ejecuta | — |

## 2. ¿Necesita el Portal Propietario leer Carteras?

- **El Portal Propietario (`PropietarioPortalSection`) no lee ni consume `gestiones_cartera`.** La lectura es
  de `App`, no del Portal.
- **`App` la necesita solo para quien, además, es gestor.** El modelo D1R admite al «gestor propietario»
  (caso E: `propietarioId` propio + gestiones de terceros) y R02 crea gestiones con
  `tipoGestor: 'PROPIETARIO_GESTOR'`. Un propietario puro no necesita nada de esa lectura: su resultado es `[]`.
- **Qué información necesita y por qué:** las gestiones `ACTIVA` + `ACEPTADA` de las que es `gestorUsuarioId`,
  con su `propietarioId`, `inmuebleIds` y `permiso`, para acotar `subscribeInmuebles` y el ámbito de alquiler
  de las delegaciones parciales. El espejo no la sustituye (sin `inmuebleIds`).
- **Condición de autorización que debe permitirla** (ya existe, no se añade nada):
  `gestionInvolucraAMi` → `activeUser() && 'gestorUsuarioId' in d && 'usuarioId' in me() && d.gestorUsuarioId == me().usuarioId`.
- **Por qué no se condiciona la lectura en este PR:** el cliente no puede saber sin leer si un propietario es
  gestor. Las únicas señales (rol `GESTOR_PATRIMONIAL`, que las reglas no exigen; o el índice del espejo, que
  exigiría una segunda escucha) son heurísticas nuevas en el camino de acceso de las delegaciones, y además
  ocultarían la **única señal visible** de si el camino del gestor está autorizado en el Firebase publicado.
  Con el origen del fallo sin determinar, quitar la lectura a quien «no la necesita» sería precisamente
  hacer desaparecer el mensaje. Si la prueba del §7 confirma una causa que solo afecta a cuentas sin
  relación, se revisa entonces con el dato en la mano.

## 3. Consulta → usuario → condición de regla → resultado esperado

Evaluado sobre el **texto real** de `firestore.rules` con el evaluador del repo
(`tests/harness/firestoreRulesEval.ts`) y la **función real** del cliente. Para decidir si una *consulta* es
autorizable se evalúa la regla sobre un documento representante que solo conoce los campos que fija la
consulta (igualdad). Tests: `tests/carteras-lectura-matriz-reglas.test.ts` (26) y
`tests/carteras-diagnostico-puro.test.ts` (16).

| # | Consulta | Usuario / estado | Condición de la regla | Resultado esperado |
|---|---|---|---|---|
| A1 | `gestorUsuarioId == miId` | PROPIETARIO, no gestor, **sin ninguna cartera**, perfil veraz | `activeUser()` ✔ · `'gestorUsuarioId' in d` ✔ · `d.gestorUsuarioId == me().usuarioId` ✔ | **Autorizada** → `[]`, sin aviso. La gestión ajena existente no se entrega |
| A2 | ídem | ídem, colección **sin ninguna gestión** | ídem | **Autorizada** → `[]` |
| A3 | ídem | PROFESIONAL gestor (1 gestión propia + 1 ajena en la colección) | ídem | **Autorizada** → solo la suya |
| A4 | ídem | PROPIETARIO que además es gestor | ídem | **Autorizada** → solo la suya; su ámbito de titular no se amplía |
| B1 | `gestorUsuarioId == idDeOtro` | cualquier cuenta | `d.gestorUsuarioId == me().usuarioId` ✘ | **Denegada** (aislamiento por gestor) |
| B2 | sin `where` (colección completa) | no administradora | ninguna rama demostrable | **Denegada**; la regla no contiene `if true` |
| C1 | `gestorUsuarioId == miId` | sin espejo `usuarios_auth/{uid}` | `exists(usuarios_auth/uid)` ✘ | **Denegada** (`ESPEJO_AUSENTE`) |
| C2 | ídem | espejo enlaza a **otro** `usuarioId` (dos fichas para un UID) | `d.gestorUsuarioId == me().usuarioId` ✘ | **Denegada** (`CONSULTA_DISTINTA_DEL_ESPEJO`) |
| C3–C4 | ídem | ficha sin enlazar a este UID, o inexistente | `exists(usuarios/…)` / `authUid == uid` ✘ | **Denegada** (`PERFIL_AUSENTE_O_NO_VINCULADO`) |
| C5–C7 | ídem | ficha o espejo no `ACTIVO`; `tipoPerfil` distinto | `estado == 'ACTIVO'` / `tipoPerfil == me().tipoPerfil` ✘ | **Denegada** (`PERFIL_NO_ACTIVO`, `ESPEJO_NO_ACTIVO`, `PERFIL_TIPO_DISTINTO_DEL_ESPEJO`) |
| C8 | ídem | espejo sin `usuarioId` | `isValidId(me().usuarioId)` ✘ | **Denegada** (`ESPEJO_SIN_USUARIOID_VALIDO`) |
| — | ídem | master / ADMINISTRADOR | `esAdminInmuebles()` ✔ | Autorizada, pero el efecto **no se ejecuta** para ellos |

**Equivalencia exhaustiva:** de las 1.024 combinaciones de sesión × espejo × ficha × valor de consulta, el
evaluador del cliente (con lo que observaría leyendo sus dos documentos) decide **exactamente** lo que decide
la regla; **solo 2** (los estados plenamente coherentes) autorizan y 1.022 se deniegan. Se verificó por
mutación: quitar cualquiera de los cinco términos del evaluador hace fallar la prueba.

**Límite declarado:** el evaluador del repo trabaja documento a documento; **no es el planificador de
consultas de Google**.

## 4. Qué no se puede demostrar aquí

No hay motor real de reglas en este entorno: sin `java`; `storage.googleapis.com` (descarga del emulador de
Firebase), `dl.google.com` (componente del SDK de Google Cloud), `repo1.maven.org` y los binarios de las
*releases* de GitHub son inaccesibles; npm y PyPI responden pero ningún paquete incluye el emulador ni el
motor de reglas (`@firebase/rules-unit-testing` lo necesita; `@firebase-bridge/firestore-admin` es un *mock*
del SDK de administración, que ni siquiera aplica reglas). Tampoco se accede al Firebase real ni se usan
credenciales.

Por tanto **no se puede afirmar** que el motor de Google acepte la consulta (planificador) ni qué reglas hay
**publicadas**. Queda por verificar exactamente eso, y solo eso.

## 5. Hallazgo de configuración: el proyecto de la app no es el de las instrucciones de publicación

| Dónde | Proyecto Firebase |
|---|---|
| `firebase-applet-config.json` (con el que la app inicializa el SDK; **también el preview de Vercel**) | **`gestor-inmuebles-produccion`** (`authDomain`, `storageBucket`) · base `ai-studio-gestordeinmueble-c6444afd-…` |
| Instrucciones de publicación de reglas (`MAPA-MAESTRO-ERP-ACTUAL.md` §«Reglas Firestore/Storage», `FASE_1.4`, `2.0`, `2.2`, `2.3`, `3.0`, `3.2`) | `firebase deploy --only firestore:rules … --project` **`startup-sanctuary-sln7n`** |
| Pantalla «Configuración» (escrito a mano, *antes* de este PR) | «ID del proyecto Firebase activo: `startup-sanctuary-sln7n`» |
| `.firebaserc` | **no existe**: el destino de `firebase deploy` lo decide quien despliega |
| `firebase.json` | publica `firestore.rules` en la base `ai-studio-gestordeinmueble-c6444afd-…`, **la misma** que usa la app (comprobado por test) |

Lectura: quien siga las instrucciones del repositorio publica las reglas en `startup-sanctuary-sln7n`,
mientras la aplicación (y el preview) habla con `gestor-inmuebles-produccion`. **Esto no demuestra que sea
la causa de la denegación**: es una discrepancia comprobada entre dos fuentes del propio repositorio, y no
sabemos qué se publicó realmente (quizá se usó `--project gestor-inmuebles-produccion`). Encaja con lo
observado —solo se han reportado denegaciones en lecturas añadidas en las últimas fases—, aunque en
`titularidades` la causa en código ya estaba demostrada y corregida, de modo que la discrepancia afectaría
sobre todo a Carteras. Convierte «reglas publicadas distintas del repositorio» en la primera comprobación,
y es barata (§7).

## 6. Correcciones aplicadas

1. **«Reintentar lectura» ahora reintenta Carteras.** Demostrado: `reintentar()` solo limpia los avisos de los
   orígenes activos del perfil (`gestiones_cartera` no figura) y el efecto de Carteras no tenía el contador
   `intentoLecturas` en sus dependencias; una escucha denegada la cierra Firestore y no se reabre sola. El
   botón del propio aviso no hacía nada. Ahora el contador forma parte de las dependencias
   (`src/estadoDatos/useGestionesCarteraGestor.ts`, extraído de `App` sin cambiar qué se consulta ni para
   quién) y cada apertura limpia el aviso anterior **de ese origen**. Si el reintento sigue denegado, el
   aviso vuelve (una sola vez). Tests: mutación verificada (sin el contador, fallan los del reintento).
2. **La pantalla «Configuración» muestra el proyecto real** (`FIREBASE_PROYECTO_ID`, de la misma
   configuración que inicializa el SDK) en lugar de un identificador escrito a mano que contradecía la
   configuración. Es lo que lee quien decide dónde publicar reglas.
3. **Instrumentación** (§7).

## 7. Instrumentación y prueba concreta en Firebase real

### Qué se registra (solo consola técnica, nunca interfaz, nunca correo ni nombre)

Filtro de consola: `[diag:carteras]`.

| Fase | Contenido |
|---|---|
| `consulta` (al abrir la escucha) | `momento`, `authUid`, `gestorUsuarioId`, `tipoPerfil`, `roles`, `motivo` (`inicio`/`reintento`), `proyecto`, `baseDeDatos`, `consulta` |
| `resultado` (primer snapshot) | `momento`, `gestorUsuarioId`, `documentos`, `desdeCache` |
| `denegada` (solo tras `permission-denied`) | informe completo: resumen no sensible del espejo y de la ficha, las **10 comprobaciones** de la regla con su valor observado, `reintento` (`OK`/`DENEGADO`/`ERROR:…`), `causa`, `lectura` (explicación) y `dondeComprobarReglas` |

El diagnóstico solo lee los **dos documentos propios** que usa `perfilActualVeraz()` (`usuarios_auth/{uid}` y
`usuarios/{id}`) y repite la misma consulta una vez. No crea avisos, no toca datos y nunca lanza.

### La prueba (≈ 2 minutos, sin tocar nada)

1. Abrir el **preview del PR #17** (se compila con la misma configuración: habla con el Firebase real; el
   diagnóstico solo lee).
2. DevTools → **Console** → filtro `[diag:carteras]` (niveles Info y Warnings activos).
3. Iniciar sesión con la cuenta que ve el aviso (PROPIETARIO o PROFESIONAL). Si ya está dentro, pulsar
   **«Reintentar lectura»** en el aviso (ahora reabre Carteras).
4. Copiar el objeto de la línea `denegada` (clic derecho → *Copy object*) y la línea `consulta`.
5. Leer `causa`:

| `causa` | Significado | Qué hacer |
|---|---|---|
| `TRANSITORIA` | el reintento inmediato sí se autoriza | no es de reglas: es de momento/estado; «Reintentar lectura» ya lo resuelve |
| `SIN_SESION_FIREBASE` | no hay sesión de Auth | revisar el inicio de sesión |
| `ESPEJO_ILEGIBLE_POR_SU_TITULAR` | Firestore no deja a un UID leer **su propio** espejo, algo que la regla del repo siempre permite | **las reglas publicadas no son las del repo** → publicar `firestore.rules` en el proyecto/base de `dondeComprobarReglas` |
| `ESPEJO_AUSENTE` / `ESPEJO_SIN_USUARIOID_VALIDO` | falta o es inválido `usuarios_auth/{uid}` | buscar el `console.warn` «No se pudo sincronizar el espejo»; es un dato, no una regla |
| `PERFIL_AUSENTE_O_NO_VINCULADO`, `PERFIL_AUTHUID_DISTINTO`, `PERFIL_NO_ACTIVO`, `ESPEJO_NO_ACTIVO`, `PERFIL_TIPO_DISTINTO_DEL_ESPEJO` | la ficha o el espejo no cumplen `perfilActualVeraz()` | reparar el dato de la cuenta (alta/activación); **no** tocar la regla. Si es así, fallarán también otras lecturas por rol |
| `CONSULTA_DISTINTA_DEL_ESPEJO` | el id de perfil que usa el cliente no es el que enlaza el espejo (dos fichas para un UID) | resolver la ficha duplicada |
| **`REGLAS_PUBLICADAS_O_PLANIFICADOR`** | todo el estado cumple la regla del repo y aun así se deniega de forma persistente | **comparar las reglas publicadas** (paso 6). Es el caso esperado si §5 es la causa |
| `INCONCLUSA` | error distinto de permisos | repetir con conexión estable |

6. Si sale `REGLAS_PUBLICADAS_O_PLANIFICADOR`: abrir **Firebase Console › proyecto
   `gestor-inmuebles-produccion` › Firestore Database › base `ai-studio-gestordeinmueble-c6444afd-…` ›
   Reglas** (los valores exactos vienen en `dondeComprobarReglas`) y comprobar que contiene
   `match /gestiones_cartera/{gestionId}`, `gestionInvolucraAMi`, `perfilActualVeraz` y
   `match /titularidades/…` **tal como están en `firestore.rules` de esta rama**.
   - Si **difieren** → publicar las del repo en ese proyecto/base (acción de quien despliega; no se hace
     desde aquí). Es el cierre esperado del incidente.
   - Si **coinciden** y sigue denegado → entonces, y solo entonces, es el planificador. El único cambio que
     se plantearía —sin ampliar acceso, solo retirando las guardas `'campo' in d`— sería sustituir `allow list`
     por `esAdminInmuebles() || (activeUser() && resource.data.gestorUsuarioId == me().usuarioId) ||
     (isPropietarioRole() && resource.data.propietarioId == myPropId())`, y **requiere validarse con el
     emulador** antes de publicarse. No se aplica ahora.

## 8. Revisión de regresión del PR #17

| Comprobación | Resultado |
|---|---|
| Contador del Portal coherente con las viviendas visibles | `tests/portal-contador-viviendas-baja.test.tsx` (11) en verde; el Portal sigue filtrando con `inmueblesOperativos` (utilidad común); `SIN_EXPLOTACION` ≠ baja |
| Dashboard coherente | `App` pasa `inmueblesCarteraOperativa` a todos los paneles; «Inmuebles en Gestión» (Administración) usa la misma cartera operativa: `tests/admin-propietarios-contador-baja.test.tsx` (5) |
| Navegación defensiva | el *route guard* de `App` y las pestañas del Portal **no se tocaron**: el diff de `App.tsx` en PR #17 es solo el alta (`handleAddInmueble` y sus dos imports) y, en esta orden, la escucha de Carteras; `tests/portal-propietario.test.tsx`, `propietarioPortal.test.tsx`, `src/navegacion/*` en verde |
| Titularidades sin consultas hipotéticas | `tests/titularidades-lecturas-acotadas.test.tsx` (14), `tests/f2-acceso-titularidades.test.ts`, `tests/portal-titularidades.integracion.test.tsx` en verde |
| N-TITULARES intacto | `titularesIds[]` y `titularidades/{inmuebleId}__{propietarioId}` sin cambios; `titularidades` conserva `allow list: if false` y `allow delete: if false`; suites F2/F3 en verde |
| Sin borrado físico | ni PR #17 ni esta orden añaden `deleteDoc`/`.delete(`; baja patrimonial intacta: `tests/baja-patrimonial-inmuebles.test.tsx` en verde |
| Sin cambio innecesario de reglas | `git diff origin/main -- firestore.rules storage.rules firestore.indexes.json package.json package-lock.json` **vacío** |

### Validación de esta orden

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` (= `tsc --noEmit`; no hay ESLint) | exit 0 |
| `npm run build` | exit 0 |
| `npx vitest run` | **174 archivos · 3.150 tests pasados · 2 omitidos · 0 fallos** (PR #17 antes de esta orden: 170 · 3.089 · 2; la diferencia son los 4 archivos y 61 tests nuevos: 26 + 16 + 17 + 2) |
| 28 suites específicas (Portal, titularidades, alta, baja, reglas, navegación, estado de datos, cableado de `App`) | 429 tests, todos en verde |
| `git diff --check` | limpio |
| Mutaciones | sin el contador de reintento fallan los tests del hook; sin limpiar el aviso falla E1; quitando cualquiera de 5 términos del evaluador falla la equivalencia; volviendo a escribir a mano el proyecto falla el de Configuración |

## 9. Qué NO se ha hecho (y por qué)

- **No se tocó `firestore.rules`** ni se abrió ninguna lectura: no hay lectura legítima bloqueada
  demostrada (§3 la autoriza) y la causa de la denegación publicada es externa al repositorio (§4–5).
- **No se condicionó la lectura** de Carteras (§2): sin conocer la causa, quitarla a quien «no la necesita»
  sería hacer desaparecer el mensaje.
- **No se empezó** la sección Propietarios/Titulares, el *backfill* de `titularesIds`/`titularidades`, ni
  trabajo de CI/emulador como tarea independiente. No se tocó `main`.
- **No se editaron** `firebase.json`, la configuración ni los documentos históricos que mencionan
  `startup-sanctuary-sln7n`: cuál de los dos proyectos es el vigente lo decide quien despliega.

> **Actualización (Orden 3).** El destino ya no queda a criterio de quien despliega: se añadió
> `.firebaserc` (`gestor-inmuebles-produccion`) y se corrigieron las instrucciones de publicación de
> reglas, con guarda automática (`tests/reglas-despliegue-produccion.test.ts`). Ver
> `CARTERAS_CAPACIDAD_ADICIONAL_2026-10-01.md`.
