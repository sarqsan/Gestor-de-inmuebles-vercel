# AUDITORÍA INTEGRAL DEL SISTEMA DE PERMISOS — 2026-10-03

Orden maestra de auditoría y corrección · Rama `arena/01a1033e-gestor-de-inmuebles-vercel`
Base: `main` @ `a87a24bf1d126741d36a5ac201b9f1f1bd9ee053` (PR #23 ya integrado)
Entorno: **exclusivamente AI Studio/Arena** — sin Firebase Console, sin Cloud Shell, sin CLI externo,
sin Vercel, sin navegador externo y sin credenciales.

> **Clasificación de cada afirmación**
> **CC** = confirmado por código · **CT** = confirmado por test · **CD** = confirmado por dato real
> aportado por la observabilidad de producción · **H** = hipótesis · **BE** = bloqueado por entorno.
> No se usa «parece que», «probablemente» ni «debería funcionar» como conclusión.

---

## 0. RESUMEN EJECUTIVO

Se han encontrado **dos causas distintas**, no una. Una es demostrable dentro de Arena y ha sido
corregida; la otra depende de un dato que Arena no puede obtener.

| # | Causa | Módulos | ¿Demostrada? | ¿Corregida? |
|---|---|---|---|---|
| **A** | **Orden de guardas en `allow list`**: el short-circuit administrativo está *detrás* de una demanda de contenido del documento, así que la consulta sin filtro que abre el cliente para el ámbito administrativo es indemostrable y Firestore la deniega siempre. | `solicitudes_seguro_impago` (**Seguro de Impago**), `mensajes_portal`, `suministros`, `lecturas_suministro`, `cambios_titular` | **SÍ** (CC + CT + auditor mecánico) | **SÍ** |
| **B** | `INM-COT` — `where('titularesIds','array-contains', pid)` denegado pese a que el estado observable cumple la regla del repositorio. | `inmuebles` | **NO** (todas las explicaciones del repositorio quedan eliminadas; la restante depende de las reglas publicadas) | **NO** |

**Lectura correcta del resultado:** la causa A explica de forma completa y mecánicamente reproducible
el `permission-denied` de «Seguro de impago — incluso como administrador», y es una incidencia
**transversal** (5 colecciones). La causa B **no** queda explicada ni por el código ni por las reglas
del repositorio.

---

## 1. FASE 1 — INVENTARIO DEL SISTEMA DE AUTORIZACIÓN

### 1.1 Identidad — cinco fuentes, dos documentos autoritativos

| Fuente | Qué es | Quién la escribe | La usan |
|---|---|---|---|
| **Firebase Auth** | `request.auth.uid` (Rules) / `auth.currentUser.uid` (cliente) | Firebase | todo |
| **`usuarios_auth/{uid}`** — *espejo de identidad* | `usuarioId`, `tipoPerfil`, `estado`, `propietarioId`, `profesionalId`, `inmuebleIds`, `carterasL`, `carterasE`, `gestionesPorPropietario` | sólo el master (D3) | `me()` en Rules (line 160); `authService.getUsuarioByAuthUid` (cliente) |
| **`usuarios/{usuarioId}`** — *ficha de perfil* | `tipoPerfil`, `estado`, `authUid`, `email`, `propietarioId`, `inmuebleIds`, `contratoIds`, `profesionalId` | master / titular | `getUsuarioActual()` (Rules 497); `App.currentUser` (cliente) |
| **`activeUser()`** = `perfilActualVeraz()` | **cotejo fail-closed** de los dos anteriores | — | la práctica totalidad del sistema |
| **`isMasterAdmin()`** | `authEmail() == 'sarqsan2@gmail.com'` — **no es un rol**, es un correo verificado por Firebase | — | reglas de administración |

**CC** — `perfilActualVeraz()` (rules:504-511) es la puerta única:

```js
isSignedIn()
&& exists(/usuarios_auth/$(request.auth.uid))
&& isValidId(me().usuarioId)
&& exists(/usuarios/$(me().usuarioId))
&& me().estado == 'ACTIVO'
&& get(/usuarios/$(me().usuarioId)).data.authUid == request.auth.uid
&& get(/usuarios/$(me().usuarioId)).data.estado == 'ACTIVO'
&& get(/usuarios/$(me().usuarioId)).data.tipoPerfil == me().tipoPerfil
```

Si cualquiera de los ocho términos falla, **todo** lo que depende de `activeUser()` se cierra de golpe:
`isPropietarioRole`, `isProfesionalRole`, `inmuebleAutorizadoExplicito`, `inmuebleEnCarteraGestionada`,
`carterasLectura`, `carterasEscritura`, `gestionInvolucraAMi`. Es el punto de fallo único del sistema.

### 1.2 Roles reales

| Rol | Cómo se determina | Fuente consultada |
|---|---|---|
| `PROPIETARIO` | `activeUser() && me().tipoPerfil == 'PROPIETARIO'` | espejo, cotejado con la ficha |
| `PROFESIONAL` | `activeUser() && me().tipoPerfil == 'PROFESIONAL'` | espejo, cotejado con la ficha |
| `INQUILINO` | `perfilActualVeraz()` **o** `usuarios/{uid}.tipoPerfil` con `authUid == uid` | espejo o ficha |
| `ADMINISTRADOR` | **no** sale del espejo: `usuarios/{request.auth.uid}.tipoPerfil == 'ADMINISTRADOR'` + `estado == 'ACTIVO'` + `authUid == uid` (`esAdminInmuebles()`, rules:213-217) | **sólo la ficha, y con id de documento == UID** |
| `MASTER_ADMIN` | `authEmail() == 'sarqsan2@gmail.com'` | token de Firebase Auth |
| `GESTOR` | **no existe como `tipoPerfil` en las reglas** (aparece 2 veces en el cliente); en las reglas la gestión se expresa como `responsableActual == 'GESTOR'` sobre `carterasE` | cartera |

**CC** — consecuencia relevante: un `ADMINISTRADOR` cuya ficha **no** viva en `usuarios/{authUid}`
(cuenta re-enlazada, ficha migrada con otro id) **no** es administrador para las reglas, aunque el
cliente lo resuelva por el espejo y lo pinte como tal.

### 1.3 Ámbitos

| Ámbito | Campo | Concede |
|---|---|---|
| Titularidad canónica | `propietarioId` | lectura + escritura (es el identificador de ámbito) |
| Titularidad fiscal | `propietarioPrincipalId` | lectura |
| Titularidad fiscal 2ª | `propietarioSecundarioId` | **no autoriza** |
| Cotitularidad | `titularesIds[]` | lectura |
| Autorización explícita | `inmuebleIds[]` del espejo | **sólo lectura** y sólo por `get` |
| Cartera lectura | `carterasL[]` | lectura (incluye REVOCADA con lectura histórica) |
| Cartera escritura | `carterasE[]` | lectura + escritura (ACTIVA + LECTURA_ESCRITURA + `responsableActual == 'GESTOR'`) |
| Índice de gestiones | `gestionesPorPropietario[pid]` | deriva a `gestiones_cartera/{id}` (D1R, hasta 5 `get()`) |
| Delegación parcial | `inmuebleParcialIndexado(pid, inmId, escritura)` | lectura/escritura sobre inmuebles concretos |
| Ámbito derivado | `ambitoPorInmuebleLectura` / `ambitoPorContratoLectura` | entidades sin `propietarioId` directo |

**CC** — la gestión de carteras **no** altera la titularidad: `propietarioCanonicoInalterado()` lo
congela en todo `update` no-master (rules:988-991).

### 1.4 Funciones de autorización de `firestore.rules`

Identidad: `isSignedIn()` (19), `authEmail()` (23), `isMasterAdmin()` (29), `me()` (160),
`activeUser()` (164), `existeUsuarioActual()` (492), `getUsuarioActual()` (497),
`perfilActualVeraz()` (504), `isTenant()` (513), `isStaff()` (521).

Roles: `isPropietarioRole()` (170), `isProfesionalRole()` (174), `esAdminInmuebles()` (213).

Ámbito de inmueble: `myPropId()` (190), `myInmuebleIds()` (194), `ownsPropietario()` (198),
`canReachInmuebleId()` (204), `inmuebleEsMio()` (225), `inmuebleAutorizadoExplicito()` (242),
`carterasLectura()` (254), `carterasEscritura()` (258), `inmuebleEnCarteraGestionada()` (266),
`inmuebleEnCarteraEscritura()` (275), `inmuebleParcialIndexado()` (686).

Ámbito derivado: `pidEnAmbitoLectura/Escritura()` (289/293), `pidDelInmuebleAmbito()` (297),
`ambitoPorInmuebleLectura/Escritura()` (300/305), `pidDelContratoAmbito()` (310),
`ambitoPorContratoLectura/Escritura()` (313/317).

Cotitularidad (PR #21): cláusula `titularesIds.hasAny([myPropId()])` dentro de `inmuebleEsMio()` (234)
y cláusula propia `myPropId() in resource.data.titularesIds` en el `allow list` de `inmuebles` (947).

---

## 2. FASE 2 — INVENTARIO DE LECTURAS

**CC** — recuento sobre `src/` (62 colecciones referenciadas):

| Operación | Usos |
|---|---|
| `onSnapshot(` | 82 |
| `where(` | 91 |
| `getDoc(` | 52 |
| `getDocs(` | 38 |
| `query(` | 60 |
| `array-contains` | 6 |
| `array-contains-any` | 1 |

Todas las lecturas por colección pasan por dos fábricas:

| Fábrica | Uso | Forma de la consulta |
|---|---|---|
| `subscribeColeccionPorAmbito` (firebase.ts:2100) | 18 colecciones | **ADMINISTRADOR → colección COMPLETA sin `where`**; PROPIETARIO → `where('propietarioId'\|'inmuebleId','==', …)`; PROFESIONAL → por `profesionalId`/carteras |
| `subscribeInmuebles` (firebase.ts:907) | `inmuebles` | A) PROPIETARIO → INM-OWN + INM-COT + INM-GEST + INM-ID; C) ADMINISTRADOR → INM-ADMIN (completa) |

Las cinco lecturas de `inmuebles` (CC: firebase.ts:424, 451, 469, 493, 997):

| Origen | Consulta | Regla que debe autorizarla |
|---|---|---|
| `INM-OWN` | `where('propietarioId','==', pid)` | `inmuebleEsMio` cl. 1 |
| `INM-COT` | `where('titularesIds','array-contains', pid)` | `inmuebleEsMio` cl. 3 **y** cláusula propia de PR #21 |
| `INM-GEST` | `where('propietarioId','==', pidGestion)` | `inmuebleEnCarteraGestionada` |
| `INM-ID` | `doc(inmuebles/{id})` — `get` | `inmuebleAutorizadoExplicito` |
| `INM-ADMIN` | colección completa | `esAdminInmuebles()` (es el **primer** término → correcto) |

---

## 3. FASE 3 — MATRIZ GLOBAL DE AUTORIZACIÓN

Comportamiento **real** derivado de las reglas y del cliente (no permisos inventados).

`P` = permitido · `D` = denegado · `Ám` = depende del ámbito · `n/a` = no aplicable.

| Colección | GET | LIST | CREATE | UPDATE | DELETE |
|---|---|---|---|---|---|
| `inmuebles` | P/Ám/D | P/Ám/D | Ám (titular, master) | Ám | master |
| `solicitudes_seguro_impago` | Ám | **P admin · Ám propietario** *(corregido)* | Ám | Ám | Ám |
| `mensajes_portal` | Ám + tenant | **P admin · Ám** *(corregido)* | Ám + tenant | Ám + acuse tenant | `false` |
| `suministros` | Ám + tenant | **P admin · Ám** *(corregido)* | Ám | Ám + tenant | master |
| `lecturas_suministro` | Ám + tenant | **P admin · Ám** *(corregido)* | Ám + tenant | `false` | `false` |
| `cambios_titular` | Ám + tenant | **P admin · Ám** *(corregido)* | Ám + tenant | Ám | master |
| `morosidad_resumen_propietario` | master + titular | **sólo titular** (diseño) | master | master | `false` |
| `usuarios` | master / propia | master | master | master | master |
| `usuarios_auth` | propia | — | master | master | master |
| `audit_logs` | master | master | cualquier sesión | `false` | `false` |

**Por rol** (sobre las colecciones de ámbito derivado, una vez corregido el orden de guardas):

| Rol | GET propio | LIST propio | GET ajeno | LIST completo | Escritura |
|---|---|---|---|---|---|
| PROPIETARIO | P | P (con filtro) | D | D | Ámbito propio |
| PROFESIONAL | P (asignado) | P (con filtro) | D | D | carterasE |
| INQUILINO | P (su contrato) | D | D | D | sólo índices que crecen |
| ADMINISTRADOR (no master) | P | D (sin filtro) | P | D | Ámbito |
| MASTER_ADMIN | P | P | P | P | P |

> La fila «ADMINISTRADOR (no master) / LIST completo = D» es el **hallazgo secundario** del §7.2:
> 16 colecciones empiezan su `allow list` por `isMasterAdmin()` (no por `esAdminInmuebles()`), de modo
> que un administrador que no sea el master sigue sin poder listarlas sin filtro. **No se ha tocado**:
> corregirlo ampliaría permisos y exige decisión de producto.

---

## 4. FASE 4 — CAUSA COMÚN

### 4.1 `INM-COT` frente a `solicitudes_seguro_impago`

No comparten **ningún** mecanismo de autorización. Son dos fallos distintos:

| | `INM-COT` | Seguro de Impago |
|---|---|---|
| Colección | `inmuebles` (rules 919) | `solicitudes_seguro_impago` (rules 2070) |
| Rol afectado | **PROPIETARIO** | **ADMINISTRADOR** (incluido el master) |
| Consulta | **con** filtro `array-contains` | **sin** ningún filtro |
| Forma de la regla | `allow list: if esAdminInmuebles() \|\| …` (admin **primero**) | `allow list: if '<campo>' in resource.data && …` (admin **dentro**) |
| Explicado por el repositorio | **NO** | **SÍ** |

### 4.2 Causa A — demostrada (transversal)

Cinco colecciones compartían **literalmente la misma forma**:

```js
allow list: if '<campo>' in resource.data && ambitoPor<X>Lectura(resource.data.<campo>);
```

donde

```js
function ambitoPorInmuebleLectura(inmuebleId) {
  return esAdminInmuebles() || (activeUser() && …);
}
```

**El predicado administrativo ya estaba ahí — pero detrás de la demanda de contenido.**

Firestore **no usa las reglas como filtro**: evalúa la consulta contra su conjunto potencial de
resultados. Una consulta **sin `where`** no aporta ninguna restricción sobre `resource.data`, así que
`'<campo>' in resource.data` no es demostrable y **la consulta se deniega entera**, con independencia
de quién la haga y de cuántos documentos existan. Como el `&&` se evalúa antes que el `||` interior,
`esAdminInmuebles()` **nunca se alcanzaba**.

Y el cliente **sí** abre esa consulta sin filtro: en `subscribeColeccionPorAmbito` (firebase.ts:2117,
2129-2133), para `ADMINISTRADOR` con `inmuebleIds` vacío, `coleccionCompleta` es verdadero y se
ejecuta `onSnapshot(col, mapear, onError)` — colección completa, sin `where`.

**Resultado: `permission-denied` para el administrador, por diseño del orden de guardas.**

Esto responde exactamente a la observación «Seguro de impago falla **incluso** accediendo como
administrador»: el master admin cumple `esAdminInmuebles()`, y aun así se le denegaba.

**Demostración mecánica (CT)** — el auditor `scripts/auditoria-reglas-list.mts`:

```
$ npm run auditoria:reglas:list -- --contra <reglas originales>
INCOMPATIBILIDAD BLOQUEANTE — el cliente pide la colección completa y la regla no la autoriza:
  ✗ cambios_titular (2739)   ✗ lecturas_suministro (2718)
  ✗ mensajes_portal (2669)   ✗ solicitudes_seguro_impago (2075)
  ✗ suministros (2698)                                        → EXIT 1

$ npm run auditoria:reglas:list
OK — ninguna colección consultada sin filtro por el ámbito administrativo
     tiene una regla `list` indemostrable.                    → EXIT 0
```

### 4.3 Causa B — `INM-COT`, no explicada por el repositorio

La traza de producción dice `INM-COT · permission-denied · ESTADO_CUMPLE_LA_REGLA`. Ese veredicto
sólo se emite cuando **todas** las comprobaciones cliente son satisfactorias
(`diagnosticoInmuebles.ts:329-334`), y para `INM-COT` eso significa, **sobre la sesión real**:

| Comprobación (CD) | Resultado |
|---|---|
| `SESION` — hay sesión Firebase | ✅ |
| `ESPEJO_EXISTE` — `exists(usuarios_auth/{uid})` | ✅ |
| `ESPEJO_USUARIOID_VALIDO` — `isValidId(me().usuarioId)` | ✅ |
| `PERFIL_EXISTE` — `exists(usuarios/{me().usuarioId})` | ✅ |
| `PERFIL_VERAZ` — los **cuatro** términos de `perfilActualVeraz()` | ✅ (⇒ `activeUser()` y `isPropietarioRole()` son **ciertos**) |
| `PID_ESPEJO` — `myPropId() == pid` de la consulta | ✅ (⇒ el pid del cliente **es** el de las reglas) |
| `PID_PERFIL` — `usuarios/{id}.propietarioId == pid` | ✅ |

Eso **elimina** de forma concluyente las tres hipótesis de identidad/divergencia:
no es el espejo, no es `perfilActualVeraz()`, no es una divergencia cliente↔reglas de `propietarioId`.

Con `isPropietarioRole() == true` y `myPropId() == pid`, la regla del repositorio contiene **dos**
cláusulas independientes que autorizan `where('titularesIds','array-contains', pid)`:

```js
allow list: if esAdminInmuebles()
  || inmuebleEsMio(resource.data)                                   // → … || d.titularesIds.hasAny([myPropId()])
  || (isPropietarioRole() && myPropId() in resource.data.titularesIds)  // cláusula propia de PR #21
  || inmuebleEnCarteraGestionada(resource.data);
```

La forma `in` **es** la que Firestore documenta como compatible con `array-contains`
[1](https://medium.com/firebase-developers/what-does-it-mean-that-firestore-security-rules-are-not-filters-68ec14f3d003)
[2](https://stackoverflow.com/questions/52773084/firestore-security-rules-use-array-contains-to-determine-authorization/52829649),
y `hasAny` es la forma que recomienda la respuesta aceptada en
[3](https://stackoverflow.com/questions/63176122/firestore-security-get-with-a-where-query-using-array-contains-produces-a-permis).
Además, en una cadena `||` una rama satisfecha salva la consulta aunque otras ramas lean campos no
restringidos [1](https://medium.com/firebase-developers/what-does-it-mean-that-firestore-security-rules-are-not-filters-68ec14f3d003) —
lo que confirma que leer `propietarioId` (no restringido por esta consulta) en la cláusula 1 **no**
envenena la cláusula 3.

**Conclusión lógica:** con las reglas del repositorio, `INM-COT` **debe** estar autorizada.
Como producción la deniega, la explicación restante es que **el ruleset publicado no coincide con
`firestore.rules`** — lo más probable: no incluye la cláusula de cotitularidad de PR #21.

Esa conclusión es **BE**: no se puede confirmar desde Arena (§7).

---

## 5. FASE 5 — CLIENTE vs RULES

| Dato | Cliente | Rules | ¿Puede divergir? |
|---|---|---|---|
| UID | `auth.currentUser.uid` | `request.auth.uid` | No |
| Espejo | `getDoc(usuarios_auth/{uid})` (authService:192) | `me()` = `get(usuarios_auth/{uid})` (160) | No — mismo documento |
| **`propietarioId`** | **`usuarios/{usuarioId}.propietarioId`** (App.tsx:1269) | **`usuarios_auth/{uid}.propietarioId`** (`myPropId()`, 190) | **SÍ — es la única divergencia estructural** |
| Rol | `usuarios/{usuarioId}.tipoPerfil` | `me().tipoPerfil` **cotejado** con la ficha (`perfilActualVeraz`) | Sí, y las reglas cierran (fail-closed) |
| Carteras | `carterasL/E` del espejo, copiadas a `currentUser` | `carterasLectura()/Escritura()` del espejo, en cada evaluación | Sólo si el espejo cambia después |
| Titularidad | `titularesIds` (sólo filtros de UI) | `d.titularesIds` del propio documento | No |
| Administración | `currentUser.tipoPerfil == 'ADMINISTRADOR'` | **`usuarios/{request.auth.uid}`** con `authUid == uid` (213-217) | **SÍ** — el cliente la resuelve por la *ficha*, las reglas por el *id de documento == UID* |

**¿Por qué existen las dos fuentes?** `usuarios_auth/{uid}` es una proyección por UID que permite a
las reglas resolver la identidad con **un solo `get()` de ruta fija** (requisito de rendimiento y del
presupuesto de 10 accesos por consulta); `usuarios/{usuarioId}` es la ficha autoritativa de negocio.
Se sincronizan por `syncAuthIndex` y se cotejan en `perfilActualVeraz()`.

**¿Explica la duplicidad los `permission-denied`?** — **No** (CD). La traza de producción acredita que
para la sesión afectada `myPropId() == pid` y `perfilActualVeraz()` se cumple. La duplicidad es un
riesgo real, pero **no es la causa** de `INM-COT`.

**Fuente autoritativa:** las **Rules** lo son siempre (el cliente sólo acota la consulta; la
autorización la decide el motor). Dentro de las reglas, para identidad manda `perfilActualVeraz()`;
para titularidad, `usuarios_auth/{uid}.propietarioId`.

---

## 6. FASE 6 — SEMÁNTICA GET vs LIST

**La regla «el documento se puede leer» ⇒ «la query está autorizada» es falsa.** Firestore evalúa la
consulta contra su conjunto potencial, no contra los documentos reales.

Compatibilidad de las lecturas de la aplicación:

| Consulta | Regla | ¿Compatible? |
|---|---|---|
| `inmuebles` sin filtro (rama C) | `esAdminInmuebles()` **primero** | ✅ |
| `where('propietarioId','==', pid)` | `d.propietarioId == myPropId()` | ✅ (valor constante desde `get()` de ruta fija) |
| `where('titularesIds','array-contains', pid)` | `hasAny([myPropId()])` y `myPropId() in d.titularesIds` | ✅ según la documentación — **pero producción lo niega (causa B)** |
| `where('propietarioId','==', pidGestion)` | `carterasLectura().hasAny([d.propietarioId])` | ✅ |
| `get(inmuebles/{id})` | `myInmuebleIds().hasAny([id])` | ✅ (en un `get` el documento está disponible) |
| **colección completa sobre `solicitudes_seguro_impago`, `suministros`, `lecturas_suministro`, `cambios_titular`, `mensajes_portal`** | `'<campo>' in resource.data && …` con el admin **dentro** | ❌ **— causa A, corregida** |

**CC** — nótese que `hasAny` sobre una lista del espejo contra un valor restringido por la consulta
(`carterasLectura().hasAny([d.propietarioId])`, INM-GEST) funciona **en el mismo sentido** que se
esperaba de `hasAny` en INM-COT: el valor de la consulta es constante y la lista es la del espejo.

---

## 7. FASE 7 — ¿PUEDE ARENA VERIFICAR LAS REGLAS DE PRODUCCIÓN?

**No. BE.** Comprobado en esta sesión:

| Comprobación | Resultado |
|---|---|
| Salida TLS a `firestore.googleapis.com` | **HTTP 000** / `curl (35) SSL_ERROR_SYSCALL` |
| Salida TLS a `identitytoolkit.googleapis.com` | **HTTP 000** / ídem |
| Control positivo `registry.npmjs.org` | **HTTP 200** (la red funciona; el filtrado es específico) |
| Sesión de Firebase / credenciales en el entorno | No existe (sólo `GH_TOKEN`; `.env.example` sin valores) |
| Emulador posible | No (`firebase.json` sin bloque `emulators`; sin `firebase-tools`; sin JRE) |
| Cuenta de prueba utilizable | No (las de los tests son sintéticas: `@test.local`, `uid_TEST_*`) |

Consecuencia: **aunque existiera sesión, el sandbox de Arena no podría abrir una escucha contra
producción**. La app sólo funciona en la vista previa porque el cliente se ejecuta en el navegador
del usuario, no en el sandbox.

Además, **desplegar reglas queda fuera de Arena** (Firebase CLI / Console), así que ningún cambio de
`firestore.rules` puede validarse contra producción desde este entorno.

### 7.1 Antecedente — ya ocurrió una divergencia de reglas publicadas

`docs/auditoria/DIAGNOSTICO_LECTURA_CARTERAS_2026-10-01.md` documenta que las instrucciones del
repositorio publicaban `firestore.rules` en `startup-sanctuary-sln7n` mientras la app usa
`gestor-inmuebles-produccion`. **La divergencia «reglas publicadas ≠ reglas del repositorio» es un
hecho ya ocurrido en este proyecto**, no una conjetura. Existe un test que fija el destino correcto
(`tests/reglas-despliegue-produccion.test.ts`).

### 7.2 Hallazgo secundario (documentado, **no** corregido)

16 de las 18 colecciones que el cliente consulta sin filtro para `ADMINISTRADOR` empiezan su
`allow list` por `isMasterAdmin()` en lugar de `esAdminInmuebles()` (`incidencias` 1585,
`polizas_seguros` 1906, `siniestros` 1924, …). Para el **master** eso basta. Para un
**ADMINISTRADOR que no sea el master** la consulta completa sigue siendo indemostrable.

**No se ha modificado**: arreglarlo concedería lectura de 16 colecciones a un rol que hoy no la
tiene. Es una decisión de producto, no un defecto de orden de guardas como el de la causa A.

---

## 8. FASE 8 — DECISIÓN

- **Causa A** → **Resultado A**: demostrada técnicamente (CC + CT + auditor mecánico con salida
  distinta antes/después) y corregible dentro del entorno. **Corrección aplicada.**
- **Causa B** (`INM-COT`) → **Resultado B**: la explicación restante depende de las reglas publicadas,
  que Arena no puede consultar (§7). **No se inventa una causa y no se toca `INM-COT`.**

Como la pregunta central de la orden —*¿cuál es la causa común de los `permission-denied`?*— **no**
tiene respuesta demostrada para `INM-COT`, y como ningún cambio de reglas puede verificarse contra
producción desde Arena, **el estado global de cierre es BLOQUEADO POR ENTORNO**.

---

## 9. FASE 9 — CORRECCIÓN APLICADA Y PRUEBAS

### 9.1 Corrección (sólo orden de guardas)

En las cinco colecciones, el `allow list` pasa de

```js
allow list: if '<campo>' in resource.data && ambitoPor<X>Lectura(resource.data.<campo>);
```

a

```js
allow list: if esAdminInmuebles()
  || ('<campo>' in resource.data && ambitoPor<X>Lectura(resource.data.<campo>));
```

**Por qué no es una relajación:** `ambitoPorInmuebleLectura()`/`ambitoPorContratoLectura()` ya
empezaban por `esAdminInmuebles()`. Se mueve el **mismo** predicado al lugar donde el motor puede
evaluarlo sin conocer el documento. Todas las ramas no administrativas —titular, carteras L/E,
delegación parcial, tenant— quedan **literalmente idénticas** (verificado en el diff).

No se ha tocado: ningún `allow get`, `create`, `update` ni `delete`; ningún rol; ningún campo; ningún
dato; ningún índice.

### 9.2 Pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **PASS** (exit 0) |
| `npx vitest run tests/auditoria-reglas-list.test.ts` | **18/18 PASS** |
| **Suite completa** `npx vitest run` | **189 ficheros · 3 466 pasados · 2 omitidos · 0 fallidos** |
| `npm run build` | **PASS** (exit 0) |
| `npm run auditoria:reglas:list` | **EXIT 0** (0 incompatibilidades) |
| `npm run auditoria:reglas:list -- --contra <reglas originales>` | **EXIT 1** (5 bloqueantes) |

Los 18 casos nuevos cubren: la guarda de regresión (hoy 0 bloqueantes) · que el auditor **sí** detecta
el defecto en el ruleset anterior (tiene dientes) · el primer término de las cinco reglas · que la rama
no administrativa conserva su ámbito derivado · que no hay lectura global · que
`morosidad_resumen_propietario` sigue sin rama administrativa · y la **forma real de la consulta del
cliente** (colección completa para ADMINISTRADOR, acotada por `inmuebleId` para PROPIETARIO).

---

## 10. FASE 10 — PROTECCIÓN CONTRA REGRESIONES

`scripts/auditoria-reglas-list.mts` (**nuevo**, `npm run auditoria:reglas:list`):

- recorre `firestore.rules`, aísla cada `allow list` y la divide en disyuntos de primer nivel
  respetando paréntesis;
- marca como indemostrable toda regla en la que **ningún** disyunto pueda evaluarse sin
  `resource.data`;
- deriva del **código real de `src/`** (no de una lista escrita a mano) qué colecciones consulta el
  cliente sin filtro para el ámbito administrativo;
- cruza ambos conjuntos y **sale con código 1** si alguna coincide.

Si alguien vuelve a escribir `allow list: if 'campo' in resource.data && ambitoPor…` en una colección
que el cliente pide completa, **el auditor y el test fallan**.

---

## 11. FASE 11 — CAMBIOS PROHIBIDOS (respetados)

✅ Sin cambios en el modelo de titularidad · ✅ sin tocar datos de producción · ✅ sin eliminar
aislamiento · ✅ sin lectura ni escritura global · ✅ sin convertir lecturas en administrativas ·
✅ sin eliminar validaciones · ✅ sin ocultar errores · ✅ **observabilidad de PR #23 intacta**
(ningún fichero de `diagnosticoInmuebles`, `observabilidadLecturaInmuebles` ni
`DiagnosticoLecturasInmueblesPanel` modificado) · ✅ PR #22 sin fusionar · ✅ sin mecanismos externos
de despliegue · ✅ sin Vercel/Firebase Console/Cloud Shell · ✅ sin módulos funcionales ajenos a la
autorización.

---

## 12. FASE 12 — ARCHIVOS

| Archivo | Cambio |
|---|---|
| `firestore.rules` | **M** — orden de guardas en el `allow list` de 5 colecciones (+ comentario justificativo en cada una) |
| `scripts/auditoria-reglas-list.mts` | **Nuevo** — auditor `allow list` ↔ consulta sin filtro |
| `tests/auditoria-reglas-list.test.ts` | **Nuevo** — 18 casos de regresión |
| `package.json` | **M** — script `auditoria:reglas:list` |
| `docs/auditoria/AUDITORIA_PERMISOS_INTEGRAL_2026-10-03.md` | **Nuevo** — este informe |

**No se ha hecho merge.** Queda preparado para revisión.

---

## 13. RESPUESTAS A LAS 13 PREGUNTAS

1. **¿Cuál es la causa común de los `permission-denied`?** — **No hay una sola causa común.** Son dos:
   (A) el short-circuit administrativo colocado detrás de una demanda de contenido en `allow list`,
   que hace indemostrable la consulta sin filtro del ámbito administrativo — **demostrada y corregida**,
   afecta a 5 colecciones; (B) `INM-COT`, **no explicada por el repositorio**.
2. **¿Por qué falla `INM-COT`?** — **BE.** Con las reglas del repositorio debería estar autorizada:
   la traza real acredita `perfilActualVeraz()` cierto y `myPropId() == pid`, y hay dos cláusulas
   (`hasAny` y `in`) que cubren `array-contains`. La explicación restante es que las reglas
   publicadas no incluyen la cláusula de cotitularidad de PR #21. No verificable desde Arena.
3. **¿Por qué falla Seguro de impago?** — **Demostrado (CC+CT).** `solicitudes_seguro_impago` tenía
   `allow list: if 'inmuebleId' in resource.data && ambitoPorInmuebleLectura(...)`; el cliente pide la
   colección completa para el administrador, y como las reglas no son filtros, esa consulta se deniega
   siempre — `esAdminInmuebles()` quedaba inalcanzable detrás del `&&`. **Corregido.**
4. **¿Por qué puede fallar incluso ADMINISTRADOR?** — Porque el guard `'<campo>' in resource.data` se
   evalúa **antes** que el `||` interno que contiene `esAdminInmuebles()`: el rol daba igual. Además
   (§7.2) un `ADMINISTRADOR` no master sigue sin poder listar las 16 colecciones cuyo `allow list`
   empieza por `isMasterAdmin()`.
5. **¿Existe divergencia entre cliente y Rules?** — Sí, estructuralmente: `propietarioId` se lee de
   `usuarios/{usuarioId}` en el cliente y de `usuarios_auth/{uid}` en las reglas; y `ADMINISTRADOR` se
   resuelve por la ficha en el cliente pero por `usuarios/{request.auth.uid}` en las reglas. **Para la
   sesión afectada no difieren** (CD: `PID_ESPEJO` ✅, `PERFIL_VERAZ` ✅).
6. **¿Qué fuente de identidad es autoritativa?** — Las **Rules**. Dentro de ellas, `perfilActualVeraz()`
   para identidad y `usuarios_auth/{uid}.propietarioId` para titularidad.
7. **¿Son compatibles las queries con `allow list`?** — Las 5 de la causa A **no** lo eran
   (corregidas). `INM-COT` **sí** lo es según el repositorio. El resto, compatibles.
8. **¿Se han podido verificar las Rules de producción?** — **No. BE** (§7).
9. **¿Se ha podido reproducir el fallo realmente?** — **No** contra producción (§7). **Sí** de forma
   mecánica y determinista para la causa A: el auditor sale 1 con las reglas anteriores y 0 con las
   actuales sobre el mismo código cliente.
10. **¿Se ha corregido la causa raíz o un síntoma?** — La **causa raíz de A**, sí (guardas, no parche).
    La causa de B **no se ha tocado**.
11. **¿Qué archivos se han modificado?** — §12.
12. **¿Qué pruebas se han ejecutado?** — §9.2: lint, 18 nuevos, suite completa (3 466), build, auditor.
13. **¿Resultado final?** — Causa A corregida y validada dentro de Arena; causa B sin verificar.

---

### Dato que falta para desbloquear

Para cerrar `INM-COT` hace falta **exactamente una** de estas dos comprobaciones, ninguna de las
cuales puede hacerse desde Arena:

1. El **ruleset efectivamente publicado** en `gestor-inmuebles-produccion` / base
   `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`, contrastado con
   `firestore.rules` — concretamente si su `allow list` de `inmuebles` contiene la cláusula
   `(isPropietarioRole() && myPropId() in resource.data.titularesIds)`.
2. La **traza `[DIAG-INMUEBLES]`** de la cuenta afectada con las reglas ya publicadas, para descartar
   que la denegación cambie de origen tras republicar.

Mientras no exista ese dato, afirmar que `INM-COT` está resuelto sería una suposición, y la orden lo
prohíbe expresamente.

---

BLOQUEADO POR ENTORNO — CAUSA NO VERIFICABLE DESDE AI STUDIO/ARENA
