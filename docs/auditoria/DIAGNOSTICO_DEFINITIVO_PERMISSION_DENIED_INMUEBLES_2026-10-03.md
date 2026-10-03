# DIAGNÓSTICO DEFINITIVO — `permission-denied` de Inmuebles

Orden única de diagnóstico autónomo · 2026-10-03
Repositorio: `sarqsan/Gestor-de-inmuebles-vercel` (rama `arena/01a102b7-gestor-de-inmuebles-vercel`)
Entorno: **exclusivamente AI Studio/Arena** (sin Vercel, sin GitHub, sin Firebase Console, sin Cloud Shell,
sin terminal externa, sin DevTools del navegador, sin credenciales, sin despliegues).

> **Clasificación de cada afirmación** (exigida por la orden):
> **CC** = CONFIRMADO POR CÓDIGO · **CT** = CONFIRMADO POR TEST · **CD** = CONFIRMADO POR DATOS
> DISPONIBLES EN ARENA · **H** = HIPÓTESIS · **BE** = BLOQUEADO POR ENTORNO.
> No se usa «parece que», «probablemente», «seguramente» ni «debe ser Firebase» como conclusión.

---

## 1. ESTADO ACTUAL

| Elemento | Estado | Evidencia |
|---|---|---|
| Instrumentación de diagnóstico | **PRESENTE E INTACTA** (no se elimina en esta orden) | `src/lib/diagnosticoInmuebles.ts` (27 509 B), `src/components/diagnostico/DiagnosticoInmueblesView.tsx` (8 745 B), integración en `src/lib/firebase.ts`, montaje en `src/App.tsx` bajo `import.meta.env.DEV` |
| Pruebas de la instrumentación | **PRESENTES** | `tests/diagnostico-inmuebles.test.ts` (17 casos), `tests/diagnostico-inmuebles-panel.test.tsx` (4 casos) |
| Reglas, consultas, modelo y datos | **SIN CAMBIOS en esta orden** | `git status`: solo se han añadido **pruebas** y este informe (ver §8) |
| Aviso investigado | Sigue sin corregirse (por diseño de esta orden) | — |

**Punto de partida del aviso (CC):** el texto del banner se compone en
`src/components/estado-datos/AvisoIncidenciasDatos.tsx:66-71` (`tituloAviso` → «No se han podido leer algunos
datos»), `:73-86` (`detalleAviso` → «Falló la lectura de: Inmuebles.») y `:187` («Lectura · {etiqueta}:
{mensaje}»), con el mensaje de `canalIncidencias.mensajeLegible` (`:247-251`) para `permission-denied`.

---

## 2. FLUJO COMPLETO DE LECTURA

```
Firebase Auth (uid)
   │
   ├─ CLIENTE: authService.getUsuarioByAuthUid  (authService.ts:149)
   │    0.   usuarios/{authUid}                    (:156)   ← si existe, ese es el perfil
   │    0b.  usuarios_auth/{uid}  → usuarioId      (:192)   ← espejo (aporta usuarioId y carterasL/E)
   │         usuarios/{usuarioId}  → PERFIL         (:201)   ← fuente de tipoPerfil y propietarioId
   │    1/2. usuarios where authUid / email         (histórico, solo si el espejo no resuelve)
   │
   ├─ App.tsx:1259  iniciarLecturas()
   ├─ App.tsx:1268  dataScope = { tipoPerfil, propietarioId, inmuebleIds, propietariosGestionados (carterasL∪carterasE),
   │                              inmueblesGestionadosParciales, ambitosParcialesGestionados }
   ├─ App.tsx:1292  subscribeInmuebles(conDatos('inmuebles', …), dataScope)
   │
   └─ firebase.ts:907 subscribeInmuebles ──► tres ramas:
        A) tipoPerfil === 'PROPIETARIO'  (:921) → subscribeUnionInmuebles(pid = scope.propietarioId, …)
        B) otro tipoPerfil conocido ≠ ADMINISTRADOR (:933) → subscribeUnionInmuebles(sin pid, …)
        C) ADMINISTRADOR **o tipoPerfil vacío/ausente** (:937-955) → onSnapshot(INMUEBLES_COL) completo

   subscribeUnionInmuebles (firebase.ts:380) abre hasta 5 lecturas, cada una con su etiqueta:
        INM-OWN   (:418)   where('propietarioId','==', pid)                       ← solo rama A con pid
        INM-COT   (:445)   where('titularesIds','array-contains', pid)            ← solo rama A con pid
        INM-GEST  (:463)   where('propietarioId','==', pidGestion)  (una por cartera)  ← A y B
        INM-ID    (:487)   doc(db,'inmuebles', id)  (uno por id autorizado/parcial)    ← A y B
        INM-ADMIN (:954)   colección completa (sin `where`)                        ← solo rama C

   Cada error → reportarErrorLectura('inmuebles', err, …)  (firebase.ts:409 / :442 / :484 / :953)
                 → canalIncidencias.registrar  (:301, sustituye por origen+tipo  → :322)
                 → useEstadoLecturas (estado ERROR si no estaba LISTO)
                 → AvisoIncidenciasDatos (banner «Lectura · Inmuebles: …»)
             y además → diagnosticarErrorLecturaInmuebles (firebase.ts:517) → [DIAG-INMUEBLES]
                       + registrarDiagnosticoInmuebles (:564) → panel visible (solo preview)
```

**CC**: el `dataScope` se construye **exclusivamente** con `currentUser` (`App.tsx:1268-1282`); no se relee
`usuarios_auth` antes de suscribir. **CC**: `subscribeInmuebles` no consulta ninguna colección por sí mismo;
solo compone las cinco lecturas anteriores.

---

## 3. MATRIZ DE LOS CINCO ORÍGENES

| Origen | Condición que lo abre (código real) | Consulta Firestore | Perfil previsto | Regla que debe autorizarlo | Riesgo |
|---|---|---|---|---|---|
| **INM-OWN** | `if (opts.propietarioId)` (rama A, `firebase.ts:415-421`) | `query(INMUEBLES_COL, where('propietarioId','==', pid))` | PROPIETARIO con `propietarioId` resuelto | `allow list` → `inmuebleEsMio(d)` → `d.propietarioId == myPropId()` (`firestore.rules:225-228, 946`) | **Medio**: la igualdad es demostrable **solo si `pid` == `myPropId()` del espejo**; si el cliente calcula otro `pid`, ningún documento queda autorizado y `permission-denied` es seguro |
| **INM-COT** | `if (opts.propietarioId) escucharPorCotitularidad(...)` (`:455`) — **se abre para TODO propietario con `pid`, haya o no cotitularidad; no hay otra guarda** | `query(INMUEBLES_COL, where('titularesIds','array-contains', pid))` | PROPIETARIO (titular o cotitular) | `allow list` → `(isPropietarioRole() && myPropId() in resource.data.titularesIds)` (`:947`, rama añadida por PR #21) | **ALTO**: (i) es la única consulta cuya autorización depende de la rama de PR #21; (ii) su aceptación por el **planificador** (`array-contains` ↔ `in`) no es verificable en Arena (BE); (iii) el motor evalúa la consulta completa contra su conjunto potencial, así que una denegación afecta a **toda** la consulta |
| **INM-GEST** | `for (const pid of opts.gestionadoIds)` con `pid !== propietarioId` (`:460-467`) | `query(INMUEBLES_COL, where('propietarioId','==', pidGestion))` | PROPIETARIO/PROFESIONAL con cartera en `carterasL ∪ carterasE` del espejo | `allow list` → `inmuebleEnCarteraGestionada(d)` (`:266-276`): carteras del espejo, o índice `gestionesPorPropietario` + 5 comprobaciones sobre `gestiones_cartera/{id}` | **Medio-alto**: con índice D1R la regla hace hasta **5 `get()` por evaluación** (límite de 10 accesos por petición de query) y depende de que el master haya proyectado el índice; una cartera conocida por el cliente pero ausente del espejo se deniega |
| **INM-ID** | `for (const inmuebleId of opts.autorizadoIds)` (`:469-495`) | `doc(db,'inmuebles', id)` (una lectura `get` por id) | PROPIETARIO/PROFESIONAL con `inmuebleIds` (espejo) o delegación parcial (cliente) | `allow get` → `inmuebleAutorizadoExplicito(id)` (`:242-245`), `inmuebleEnCarteraGestionada`, `inmuebleParcialIndexado` (`:686`), `inmuebleEsMio` o `esAdminInmuebles()` (`:929-937`) | **Medio**: un id **obsoleto** (inmueble borrado, o delegación parcial ya revocada que el cliente aún calcula) produce `permission-denied` **idéntico** al de un documento ajeno: `get` sobre documento inexistente también deniega |
| **INM-ADMIN** | Rama C: `tipoPerfil === 'ADMINISTRADOR'` **o `tipoPerfil` vacío/ausente** (`:933-937`) | `onSnapshot(INMUEBLES_COL)` sin `where` | ADMINISTRADOR / master | `allow list` → `esAdminInmuebles()` (`:213-217`) | **Medio**: con `tipoPerfil` **vacío** la app abre la colección completa para una sesión que **no** es administradora ⇒ denegación por diseño y aviso de Inmuebles (`CC`, camino de código) |

**CC · observaciones de forma (planificación):**
- Ninguna lectura lleva `orderBy` (**CT**: aserción en `tests/inmuebles-matriz-origenes.test.ts`).
- `inmuebleEsMio` incluye tres cláusulas: `propietarioId == myPropId()`, `propietarioPrincipalId == myPropId()` y
  `titularesIds.hasAny([myPropId()])`. Solo la **primera** casa con la consulta INM-OWN; la segunda **no** es
  accesible por `where('propietarioId','==')` (un inmueble que solo coincida por `propietarioPrincipalId` **no se
  pierde con error**: simplemente no aparece ⇒ pérdida silenciosa, no `permission-denied`).
- La consulta INM-COT se corresponde con la cláusula tercera escrita como `in`; `hasAny` es la forma que el motor
  asocia a `get`, no a esta consulta de colección (**H** con evidencia externa no normativa: blog de Firebase
  Developers y StackOverflow; **no** hay documentación oficial de Google que lo afirme literalmente).

---

## 4. AUDITORÍA CLIENTE vs RULES

| Dato | Cliente (de dónde sale) | Rules (de dónde sale) | Fuente | ¿Puede diferir? |
|---|---|---|---|---|
| UID | `auth.currentUser.uid` | `request.auth.uid` | Firebase Auth | No |
| Espejo | `usuarios_auth/{uid}` (lectura directa, solo para `usuarioId` y `carterasL/E`) — `authService.ts:192-215` | `me() = get(usuarios_auth/{uid})` — `rules:160` | `usuarios_auth/{uid}` | No (mismo documento) |
| `propietarioId` | **`usuarios/{usuarioId}.propietarioId`** (vía `App.currentUser` → `dataScope`) | **`usuarios_auth/{uid}.propietarioId`** (`myPropId()`) | **dos documentos distintos** | **SÍ — es la única divergencia estructural del sistema** |
| Rol | `usuarios/{usuarioId}.tipoPerfil` | `me().tipoPerfil` **validado** contra `usuarios/{me().usuarioId}.tipoPerfil` (`perfilActualVeraz`, `rules:504-511`) | dos documentos, cotejados por las Rules en cada lectura | Sí: si divergen, las Rules **cierran** el acceso (fail-closed) mientras el cliente sigue con el valor de la ficha |
| Titularidad | `titularesIds` (solo se usa en filtros locales de UI) | `d.titularesIds.hasAny([myPropId()])` / `myPropId() in d.titularesIds` | el documento `inmuebles/{id}` | No aplica (mismo dato) |
| Carteras | `carterasL/E` **del espejo**, copiadas a `currentUser` al resolver la sesión | `carterasLectura()/carterasEscritura()` **del espejo**, en cada evaluación | `usuarios_auth` | No en el mismo instante; **sí** si el espejo cambia después de construir `currentUser` (el cliente no lo relee: `CC`, `App.tsx:1268`) |
| Delegación parcial | Cliente la **calcula** de `gestiones_cartera` (`App.tsx:643` + `inmueblesParcialesActivosDe`) | Rules la resuelven del espejo (`gestionesPorPropietario` → `gestiones_cartera/{id}`) | cliente vs espejo | **SÍ**: si el índice del espejo no refleja la misma gestión, el cliente abre INM-ID y las Rules lo niegan |

**Dónde se produce exactamente la divergencia de `propietarioId` (CC):**
1. `syncAuthIndex` escribe `propietarioId: usuario.propietarioId || ''` (`authService.ts:102`), es decir, **copia** el
   valor de la ficha en el espejo, y `indexIsTruthful()` (`rules:395-410`) exige esa igualdad **en toda escritura
   propia** del espejo.
2. Pero el **master/auditoría** escribe el espejo por su propia rama (`rules:427-437`) y puede modificar la ficha
   `usuarios/{usuarioId}` sin tocar el espejo.
3. El cliente toma el `propietarioId` **de la ficha** (no del espejo) al resolver la sesión, y `App` no vuelve a
   leer el espejo antes de suscribir (`CC`).
4. Consecuencia: si la ficha cambió después de la última sincronización del espejo, el cliente consulta
   `where(...,'==', pid_nuevo)` y las reglas comparan contra `myPropId() = pid_viejo` ⇒ **ninguna fila queda
   autorizada** y la consulta se deniega entera (`CT`: el diagnóstico clasifica `PID_DISTINTO_DEL_ESPEJO` y el
   harness niega documento a documento).

**¿El cliente puede considerar PROPIETARIO a alguien que las Rules no consideran PROPIETARIO?** Sí, y en ese caso
las reglas deniegan: el cliente usa `usuarios/{usuarioId}.tipoPerfil`; las reglas exigen `perfilActualVeraz()`
(espejo ACTIVO + ficha ACTIVA + `authUid` coincidente + **mismo `tipoPerfil` en ambos**). Divergencia ⇒ `DENY`
(`CC` + `CT`: caso `perfilNoVeraz` del test, causa `PERFIL_NO_VERAZ`).

---

## 5. AUDITORÍA DE LAS RULES (`match /inmuebles/{inmuebleId}`, `rules:919`)

### 5.1 `allow get` (`:929-937`)
`esAdminInmuebles()` ∨ `inmuebleEsMio(resource.data)` ∨ `inmuebleAutorizadoExplicito(inmuebleId)` ∨
`inmuebleEnCarteraGestionada(resource.data)` ∨ `inmuebleParcialIndexado(resource.data.propietarioId, inmuebleId, false)`
∨ (`isTenant()` ∧ contrato activo/autorizado).

### 5.2 `allow list` (`:945-948`)
`esAdminInmuebles()` ∨ `inmuebleEsMio(resource.data)` ∨ `(isPropietarioRole() && myPropId() in resource.data.titularesIds)`
∨ `inmuebleEnCarteraGestionada(resource.data)`.

### 5.3 ¿Puede el motor demostrar cada consulta? (por consulta, no por documento)

| Consulta | Cláusula que la cubre | ¿Demostrable sin leer documentos? | Clase |
|---|---|---|---|
| `where('propietarioId','==', pid)` | `d.propietarioId == myPropId()` | Igualdad de campo con valor constante procedente de un `get()` de ruta fija: es la forma que este repositorio ya trata como demostrable (misma que `contratoEsMio`) | **H** (fundada en el diseño del repo; el planificador real no es ejecutable en Arena) |
| `where('titularesIds','array-contains', pid)` | `myPropId() in d.titularesIds` | Depende de que el planificador acepte la equivalencia `array-contains` ↔ `in` **y** de que la regla publique esa rama; ambas cosas **solo** se prueban contra el motor de Google | **BE** |
| `where('propietarioId','==', pidGestion)` | `inmuebleEnCarteraGestionada` (carteras del espejo) | Igual que la primera, con la lista del espejo como constante | **H** |
| idem, con índice `gestionesPorPropietario` | + `gestionActivaCompletaIndexada(pid)` = **5 `get()`** a `gestiones_cartera/{id}` | Los `get()` tienen ruta fija construida desde el valor acotado; la demostrabilidad y el **límite de 10 accesos** por petición no son verificables aquí | **BE** |
| `get(inmuebles/{id})` | `allow get` | Un `get` se evalúa sobre el documento real: **no interviene el planificador**. Con `resource == null` (documento inexistente) las cláusulas que leen `resource.data` fallan ⇒ denegación | **CT** (harness: `leer(null, …) === false`) |
| colección completa (sin `where`) | `esAdminInmuebles()` | Solo el ámbito administrativo; para cualquier otro perfil es denegación por diseño | **CT** |

**Aviso metodológico (obligatorio, `docs/operaciones/alcance.md`):** el harness
`tests/harness/firestoreRulesEval.ts` evalúa el **texto real** de `firestore.rules` **documento a documento**
(inyectando `resource`); **no es el planificador**. En Arena no hay emulador posible: `CD` — no existe
`firebase-tools` en `node_modules`, no hay JRE (`which java` → vacío), no hay CLI global de Firebase, y la descarga
del JAR está bloqueada por TLS (`docs/operaciones/alcance.md`, `curl (35) SSL_ERROR_SYSCALL`). Por eso **ninguna
celda dependiente del planificador se declara «autorizada»**.

---

## 6. MATRIZ POR ROLES (documento a documento, harness estático)

Leyenda: **A** = AUTORIZABLE · **N** = NO AUTORIZABLE · **D** = DEPENDE DE DATOS ·
**ND** = NO DETERMINABLE DESDE ARENA (planificador) · *(—)* = el cliente no abre esa lectura para ese rol.

| Rol | INM-OWN | INM-COT | INM-GEST | INM-ID | INM-ADMIN |
|---|---|---|---|---|---|
| **PROPIETARIO titular** (espejo ACTIVO, `propietarioId = pid`) | **A** (`d.propietarioId == myPropId`) | **D** — A si `pid ∈ d.titularesIds`; N si no (y la consulta **se abre igual**) · *ND en cuanto a planificador* | **N** sin cartera / **D** con cartera | **D** — A solo si el id está en `inmuebleIds` del espejo o en una delegación parcial vigente | **N** |
| **PROPIETARIO gestor** (carteras L/E en el espejo) | **A** para sus propios inmuebles | **D** (igual que arriba) · *ND* | **A** si la cartera cubre `pidGestion` (carteras del espejo) · *ND* con índice D1R | **D** | **N** |
| **PROFESIONAL gestor** | **N** (la cláusula exige `isPropietarioRole()`) | **N** (la rama de PR #21 exige `isPropietarioRole()`) | **A** si `prop_G ∈ carterasL∪carterasE` (la cláusula solo exige `activeUser()`) · *ND* | **D** — A si el id está en `inmuebleIds` (`inmuebleAutorizadoExplicito` no exige rol) | **N** |
| **ADMINISTRADOR** (ficha `usuarios/{uid}` ACTIVA con `authUid`) | **A** *(el cliente no la abre: solo usa INM-ADMIN)* | **A** *(no la abre)* | **A** *(no la abre)* | **A** *(no la abre)* | **A** (`esAdminInmuebles()`) |
| **Master** (email reconocido) | **A** *(no la abre)* | **A** *(no la abre)* | **A** *(no la abre)* | **A** *(no la abre)* | **A** |
| **Usuario sin perfil** (autenticado, sin espejo ni ficha) | **N** | **N** | **N** | **N** | **N** — y **sí se abre** si `tipoPerfil` llega vacío/ausente (rama C) ⇒ este es el camino por el que un no-administrador genera un `permission-denied` de INM-ADMIN |
| **Anónimo** (sin sesión) | **N** | **N** | **N** | **N** | **N** |

**CT**: cada celda A/N de esta tabla está fijada por `tests/inmuebles-matriz-origenes.test.ts` (22 casos) con el
harness sobre el texto real de las reglas; las celdas *ND* se declaran explícitamente como no verificables.

---

## 7. DATOS/FIXTURES REALMENTE DISPONIBLES EN ARENA

| Búsqueda | Resultado | Clase |
|---|---|---|
| `src/data/mockData.ts` | `INITIAL_INMUEBLES: Inmueble[] = []`, `INITIAL_PROPIETARIOS = []`, `INITIAL_CANDIDATOS = []`… (todos vacíos). Es lo único que la app usa como valor inicial si no hay caché | **CD** |
| Fixtures de test (`tests/fixtures/`) | `propietarios-bloque-reglas-anterior.txt` (bloque de **reglas** antiguo, sin `usuarios_auth` ni `titularesIds`), y `xlsx/` (hojas de cálculo para import/export, no son documentos de Firestore) | **CD** |
| Mini-base sintética de los tests | `FIRESTORE` de cada test (perfiles y documentos inventados **en el propio test**); `tests/harness/perfilesSinteticos.ts` completa fichas `usuarios/{id}` a partir de espejos sintéticos; `src/test/e/firestoreMemoria.ts` es un doble en memoria **sin red** | **CD** |
| `docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json` | Único artefacto con «inmuebles»: 7 registros con ids `prop_1783441481122_*`, pero **proceden de OTRA app** (`__PROVENANCE__.origen`: «FUENTE EXTERNA — OTRA APP (Rentasync/AEAT)»), su esquema **no tiene** `titularesIds`, `propietarioId` ni `propietarioPrincipalId`, y sus valores por campo están declarados **no recuperables** | **CD** |
| Datos reales de producción | **No existen en Arena** y no son accesibles (BE) | **BE** |

**Conclusión de FASE 7:** la matriz se ha ejecutado **contra la mini-base sintética** de los tests (arriba, §5 y §6)
y **contra ningún dato de producción**. **No se fabrica ningún resultado de producción**: no hay ni un solo
documento real de `inmuebles`, `usuarios` o `usuarios_auth` en el entorno.

---

## 8. PRUEBAS EJECUTADAS (todas reproducibles en Arena)

| Comando | Resultado |
|---|---|
| `npm run lint` (**typecheck real**: `tsc --noEmit`; el proyecto no tiene script `typecheck` ni `npm test`) | **PASS**, exit 0 |
| `npx vitest run` (suite completa) | **186 archivos · 3 413 pasados · 2 omitidos · 0 fallos** (≈ 198 s) |
| Suites afectadas (17 archivos): `seguridad-firestore-inmuebles`, `f2-acceso-titularidades`, `titulares-ambito-reglas`, `titularidades-lecturas-acotadas`, `carteras-diagnostico-puro`, `carteras-lectura-matriz-reglas`, `carteras-lectura-por-relacion`, `carteras-capacidad-adicional`, `acceso-carteras-d2`, `seguridad-firestore-carteras`, `fase14-espejo-identidad`, `acceso-propietarios`, `login-admin-principal`, `reglas-despliegue-produccion`, `inmuebles-matriz-origenes`, `diagnostico-inmuebles`, `diagnostico-inmuebles-panel` | **329 pasados, 0 fallos** |
| **Nuevas** pruebas de esta orden: `tests/inmuebles-matriz-origenes.test.ts` | **22 casos PASS** (estructura de los 5 orígenes; evaluación documento a documento por rol; cartera completa vs parcial; `get` inexistente; identidad cliente↔Rules y divergencia; datos disponibles) |
| `npm run build` (Vite + esbuild) | **PASS**; el bundle de producción **no** contiene el panel (`0` apariciones de «DIAGNÓSTICO TEMPORAL»); `dist/` eliminado después (está en `.gitignore`) |
| Instrumentación | **Intacta**: `diagnosticoInmuebles.ts`, `DiagnosticoInmueblesView.tsx`, registro y tests asociados siguen en su sitio (FASE 12) |

**Cambios de esta orden:** **solo pruebas y este informe**. Ninguna regla, consulta, dato, permiso, modelo, sesión,
caché ni UI funcional modificados. `git diff` de esta orden = `tests/inmuebles-matriz-origenes.test.ts` (nuevo) +
este informe. Los únicos ficheros con cambios acumulados de las órdenes anteriores son `src/lib/firebase.ts` y
`src/App.tsx`, y su diff se limita a instrumentación: en `firebase.ts` los `where(...)` son **literalmente**
idénticos (los hunks solo añaden un tercer argumento `scope`, el bloque de llamada y las trazas
`diagnosticarErrorLecturaInmuebles`/`registrarDiagnosticoInmuebles`; `CC`, verificado con `git diff -U0`); en
`App.tsx`, 3 líneas de import y 1 línea de montaje bajo `import.meta.env.DEV`.

---

## 9. RESULTADOS

1. **CC**: el aviso nace de **cuatro** puntos de reporte que cubren **cinco** lecturas distintas, todas con la
   etiqueta `inmuebles`; el canal guarda **una** incidencia por origen+tipo (`canalIncidencias.ts:322`), así que el
   aviso global **nunca** dice qué escucha falló (ver §10, E).
2. **CC**: `INM-COT` se abre para **todo** PROPIETARIO con `pid`, sin condición de cotitularidad (`firebase.ts:455`:
   única guarda `if (opts.propietarioId)`), y es la **única** lectura que depende de la rama añadida por PR #21.
3. **CC**: `INM-ADMIN` se abre también cuando `dataScope.tipoPerfil` llega **vacío/ausente** (rama C), incluso si la
   sesión no es administrativa ⇒ denegación por diseño con aviso «Inmuebles».
4. **CT** (harness, documento a documento): las autorizaciones por rol de §6 se comportan como dicta el texto de las
   reglas, incluida la cotitularidad (rama PR #21), la cartera completa por índice D1R (`list` A) frente a la
   delegación **parcial** (`list` N / `get` A), y el `get` sobre documento inexistente (N).
5. **CT**: el diagnóstico clasifica correctamente las divergencias de identidad
   (`PID_DISTINTO_DEL_ESPEJO`, `PERFIL_NO_VERAZ`, `ESPEJO_AUSENTE_O_ILEGIBLE`) y conserva el orden temporal de los
   errores.
6. **CD**: **no hay datos de producción** en Arena; la única evidencia con «inmuebles» es de otra aplicación y no
   sirve para esta matriz.
7. **BE**: el **planificador** de Firestore no es ejecutable aquí (sin `firebase-tools`, sin JRE, JAR bloqueado) y
   las **reglas publicadas** en `gestor-inmuebles-produccion` / base `ai-studio-gestordeinmueble-c6444afd-…` no son
   observables desde Arena.

---

## 10. CAUSA CONFIRMADA O HIPÓTESIS RESTANTES

**No hay causa confirmada.** Ninguno de los caminos de código produce por sí solo un `permission-denied` bajo el
estado observable documentado; y los dos eslabones que faltan (datos reales y reglas publicadas/planificador) están
fuera del alcance de Arena. Estado de cada hipótesis:

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| **A — consulta abierta para un perfil/estado donde no procede** | **PARCIALMENTE CONFIRMADA como camino de código; NO confirmada como causa del aviso observado** | **CC**: `INM-COT` se abre para todo propietario con `pid` (`:455`) y `INM-ADMIN` se abre con `tipoPerfil` vacío (`:937-955`). **CT**: esas consultas deniegan cuando el predicado no se cumple. **BE**: si el motor rechaza `array-contains`/el índice, no verificable |
| **B — inconsistencia perfil ↔ espejo** | **MECANISMO CONFIRMADO (CC/CT); instancia en producción: HIPÓTESIS (BE)** | **CC**: el cliente lee `propietarioId` de `usuarios/{usuarioId}`; las Rules de `usuarios_auth/{uid}`; el espejo solo se escribe en los 5 momentos del circuito de sesión (`syncAuthIndex`) y `indexIsTruthful` solo cubre escrituras **propias**. **CT**: con ficha y espejo divergentes, el diagnóstico dicta `PID_DISTINTO_DEL_ESPEJO` y ninguna fila queda autorizada |
| **C — datos históricos** | **NO VERIFICABLE (BE)**; dos mecanismos concretos identificados | **CC/CT**: (i) un `inmuebleId` obsoleto en `inmuebleIds` o en una delegación parcial ⇒ `permission-denied` en INM-ID; (ii) un documento **sin** `titularesIds` es invisible para la consulta `array-contains` (no entra en su conjunto potencial) ⇒ **pérdida silenciosa**, no denegación. Un `propietarioId` erróneo en un documento solo hace que no aparezca (no deniega) |
| **D — Rules publicadas ≠ repositorio** | **NO VERIFICABLE — `BE`** | El repositorio afirma que las reglas se publican **manualmente** y que los cambios estaban «únicamente en el repositorio» (`docs/MAPA-MAESTRO-ERP-ACTUAL.md` §12.6; `docs/auditoria/CARTERAS_Y_TITULARES_INTERVENCION_2026-10-01.md` §2.8), mientras el cuerpo de PR #21 afirma que su rama estaba «ya activa en producción». **Contradicción no resoluble desde Arena**. El tamaño del ruleset (214 395 B; límites 256 KB fuente / 250 KB compilado) añade un mecanismo creíble de publicación fallida, no una prueba |
| **E — otro origen** | **CONFIRMADO como problema de OBSERVABILIDAD, no como causa del `permission-denied`** | **CC/CT**: un único fallo de cualquiera de las cinco lecturas ⇒ banner global; el aviso **persiste** aunque las otras cuatro carguen, porque `conDatos`→`marcarListo` no limpia el canal y solo `reintentar()`/descartar lo retiran |

---

## 11. BLOQUEADO POR ENTORNO

1. **Qué dato falta**
   - la línea real `[DIAG-INMUEBLES] …` (o el panel) de **una** sesión con la cuenta afectada, que dice
     `origen=` y `causa=`;
   - las **reglas publicadas** de `gestor-inmuebles-produccion` (base `ai-studio-gestordeinmueble-c6444afd-…`);
   - los documentos reales `usuarios_auth/{uid}` y `usuarios/{usuarioId}` de esa cuenta y sus inmuebles.
2. **Por qué Arena no puede obtenerlo** — la orden prohíbe Firebase Console/Cloud Shell/DevTools/credenciales; no hay
   sesión real delegable; no hay emulador posible (`CD`: sin `firebase-tools`, sin JRE, descarga del JAR bloqueada
   por TLS), y el clon es shallow (no hay historial de reglas para comparar).
3. **Hipótesis abiertas** — D (reglas publicadas), A (planificador en INM-COT/INM-GEST), B (divergencia
   ficha↔espejo), C (id obsoleto en INM-ID / id de delegación parcial revocada). El **§13** documenta el intento
   autónomo de captura real desde Arena y añade dos bloqueos demostrados: ausencia total de sesión/cuenta de prueba
   y **filtrado de salida TLS del sandbox hacia los endpoints de Firebase/Auth** (HTTP 000 / `curl (35)`), con
   `registry.npmjs.org` y `github.com` como controles en HTTP 200.
4. **Hipótesis descartadas** — que el aviso proceda de los `getDoc` de otras capas: **descartado** por código
   (§2; los otros lectores de `inmuebles` no reportan a este origen, y `suministrosFirestore.getById` silencia el
   error). Que un documento **sin** `titularesIds` provoque la denegación de INM-COT: **descartado** (no entra en el
   conjunto potencial de `array-contains`; sería pérdida silenciosa). Que el aviso provenga de `create/update`
   (guardado): **descartado** (el texto es «Lectura ·»). Que la UI oculte el error: **descartado** (banner `role=alert`
   + incidencia).
5. **Qué NO debemos modificar mientras no exista esa evidencia** — `firestore.rules`, las cinco consultas de
   `subscribeInmuebles`/`subscribeUnionInmuebles`, `titularesIds`, `propietarioId`/`propietarioPrincipalId`,
   `usuarios_auth`/`usuarios`, permisos, sesión, caché, modelo de datos y datos. Tampoco retirar la instrumentación
   (FASE 12).

> No se solicita al usuario Vercel, Firebase Console, GitHub, Cloud Shell, DevTools ni terminal.

---

## 12. RECOMENDACIÓN PARA LA SIGUIENTE ORDEN

**Prioridad 1 (única que cierra el diagnóstico): capturar `[DIAG-INMUEBLES]` de una sesión real.** Ya está servida
la vista previa de la app instrumentada en Arena (proceso `app-instrumentada-instrumented-a-8f1fd93e`, puerto 3000):
basta abrirla en el navegador del usuario, iniciar sesión con la cuenta PROPIETARIO afectada y copiar el panel
(«Copiar diagnóstico»), **empezando por `ERROR #1`**. Con eso, la tabla siguiente decide el siguiente paso sin
ambigüedad y **sin** tocar nada más:

| Lo que muestre el panel | Qué queda demostrado | Cambio mínimo que se propondría en una orden posterior |
|---|---|---|
| `origen=INM-COT` (o INM-OWN/INM-GEST) y `causa=ESTADO_CUMPLE_LA_REGLA` | El estado de la persona cumple la regla del repositorio y aun así el motor deniega ⇒ **D** o **A-planificador** | Comparar el ruleset publicado y, si coincide, dejar de depender de esa consulta: leer la cotitularidad por `get` desde un índice propio (patrón ya existente `indiceEspejoCarteras.ts`) y/o tratar esa escucha como capacidad adicional. Ninguna relajación de reglas |
| `causa=PID_DISTINTO_DEL_ESPEJO` / `PERFIL_NO_VERAZ` / `ESPEJO_AUSENTE_O_ILEGIBLE` | **B/C identidad** | Reparar el dato de identidad y reescribir el espejo (`syncAuthIndex`); **cero** cambios de reglas |
| `origen=INM-ID` y `causa=INMUEBLE_NO_AUTORIZADO_O_INEXISTENTE` | **C datos** | Retirar el id obsoleto de `inmuebleIds`/delegación; cero cambios de reglas |
| `origen=INM-ADMIN` | Rama C abierta para una sesión no administrativa | Revisar por qué `dataScope.tipoPerfil` llega vacío; cero cambios de reglas |
| Potencialmente `INM-GEST` con `causa=CARTERA_NO_INDEXADA_EN_EL_ESPEJO` | Cartera conocida por el cliente pero no proyectada al espejo | Reconciliar la proyección (master), no la consulta |

**Prioridad 2 (sin bloquear a nadie):** mantener la instrumentación hasta el cierre del incidente y, cuando se
decida su destino (FASE 12), sustituir el panel de preview por observabilidad permanente — p. ej. conservar solo la
traza de consola y añadir un identificador de escucha al mensaje del canal (`origen: 'inmuebles:INM-COT'`), que es
la mejora de observabilidad que este diagnóstico ha demostrado necesaria (E, §10).

**No se aplica ninguna corrección en esta orden.**

---

## 13. INTENTO AUTÓNOMO DE REPRODUCCIÓN DESDE ARENA (orden de captura autónoma, 2026-10-03)

Intento realizado **íntegramente dentro de AI Studio/Arena**, sin intervención del usuario, sin credenciales, sin
herramientas externas y **sin fabricar datos**. Resultado: **BLOQUEADO POR ENTORNO** (clasificación global).

### 13.1 ¿Existía una sesión? — **NO · CONFIRMADO**

| Mecanismo inspeccionado | Resultado | Clasificación |
|---|---|---|
| Variables de entorno del sandbox (`firebase*`, `google*`, `auth*`, `token`, `credential`, `service_account`) | Solo `GH_TOKEN` y `GITHUB_TOKEN` (valores **no mostrados**). Ninguna variable de Firebase | **CONFIRMADO** (ausencia) |
| Ficheros `.env` | Únicamente `.env.example` con `GEMINI_API_KEY` y `APP_URL` **vacíos** (los inyecta AI Studio en runtime para la API de Gemini; no son de Firebase) | **CONFIRMADO** |
| Sesión de Firebase CLI en el sandbox | `~/.config/configstore/firebase-tools.json` **no existe**; `~/.firebaserc` **no existe** | **CONFIRMADO** |
| Credenciales de servicio o tokens en el repositorio | Ninguno: `firebase-applet-config.json` es la configuración **pública** del cliente (apiKey pública de web), y las coincidencias de `refreshToken`/`idToken` son variables de código de test | **CONFIRMADO** |
| Navegador o perfil con sesión dentro del sandbox | No hay `~/.cache/ms-playwright`, `~/.config/google-chrome`, `~/.config/chromium` ni `~/.mozilla` | **CONFIRMADO** (ausencia) |
| Identidad inyectada por la plataforma (AI Studio/Arena) | `grep` de `aistudio`, `window.__`, `postMessage`, `injectedAuth` en `index.html`, `main.tsx`, `App.tsx`, `firebase.ts`: **sin coincidencias** | **CONFIRMADO** (no existe el mecanismo) |
| Auto-login / bypass / modo demo | No hay `autoLogin`, `demoLogin`, `bypassAuth`, `DEV_LOGIN`; la sesión exige `signInWithEmailAndPassword` (`authService.ts:292`) o `signInWithPopup` de Google (`googleAuth.ts:65`), ambos con credencial real e interacción | **CONFIRMADO** |

### 13.2 ¿Existía un usuario de prueba utilizable? — **NO · CONFIRMADO**

- Los usuarios de los tests son **sintéticos y sin validez en producción**: `@test.local`, `@synthetic.invalid`,
  `uid_TEST_*` (`tests/`, `scripts/diagnostico-b12-list.mts:41-43`). No existen como documentos ni como cuentas de
  Auth.
- `src/data/mockData.ts` tiene **todos** los `INITIAL_*` vacíos; `seedInitialDataIfEmpty()` (`firebase.ts:179`)
  retorna de inmediato sin usuario autenticado y solo tocaría `system`/`configuracion_aseguradoras`, nunca
  identidad: no hay seed que cree sesión.
- El único identificador de cuenta real en el código es `ADMIN_MASTER_EMAIL = 'sarqsan2@gmail.com'`
  (`authService.ts:45`): es un **identificador, no una credencial**; su contraseña no existe en ningún fichero del
  entorno, y solicitarla o almacenarla está prohibido por las restricciones vigentes.

### 13.3 ¿Existía un Auth/Firestore emulator? — **NO · CONFIRMADO**

- `firebase.json` **no tiene bloque `emulators`** (solo declara `firestore` → `firestore.rules` y `storage`).
- No hay `firebase-tools` instalado (`node_modules/.bin` sin binarios de Firebase), **no hay JRE** (`which java` →
  vacío) y no existe CLI global de Firebase.
- La única referencia a emulador es `src/features/operaciones/tests/emulator/operaciones.emulator.mjs`, un script
  **manual** (`npm run test:emulador:operaciones`, no forma parte de `vitest`) que **espera** un emulador externo en
  `127.0.0.1:9099`/`8080` y pertenece a **otra** funcionalidad (operaciones). Aunque existiera, un emulador no
  contiene la cuenta afectada ni las reglas publicadas de producción, y su uso está prohibido por las restricciones
  vigentes (Firebase CLI / operaciones fuera de Arena).

### 13.4 ¿Podía Arena ejecutar el flujo real por red? — **NO · CONFIRMADO** (evidencia independiente y decisiva)

Prueba de conectividad de salida del sandbox, **sin credenciales** (solo TCP/TLS):

| Host | IPv4 | IPv6 | Resultado |
|---|---|---|---|
| `identitytoolkit.googleapis.com` (Firebase Auth) | HTTP 000 | HTTP 000 | `curl (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| `firestore.googleapis.com` (Firestore) | HTTP 000 | — | ídem |
| `gestor-inmuebles-produccion.firebaseapp.com` | HTTP 000 | — | ídem |
| `googleapis.com` | HTTP 000 | — | ídem |
| `registry.npmjs.org` (control) | **HTTP 200** | — | sale correctamente |
| `github.com` (control) | **HTTP 200** | — | sale correctamente |

El DNS **sí resuelve** `identitytoolkit.googleapis.com` (registro A `172.217.118.4`): no es un problema de
resolución, es **filtrado de salida TLS**. Consecuencia demostrada: **aunque existiera una sesión válida, el sandbox
de Arena no podría abrir `subscribeInmuebles` contra producción**, porque el SDK web de Firebase necesita alcanzar
`firestore.googleapis.com`/`identitytoolkit.googleapis.com`. La app funciona en la **vista previa** únicamente
porque el cliente se ejecuta en el **navegador del usuario** (con su propia red), no en el sandbox.

### 13.5 ¿Fue posible ejecutar `subscribeInmuebles` y capturar `[DIAG-INMUEBLES]`? — **NO · BLOQUEADO POR ENTORNO**

- **No** hubo ejecución del flujo real: sin sesión, sin cuenta de prueba y sin salida de red a Google (13.1-13.4).
- **No** apareció ninguna línea `[DIAG-INMUEBLES]`: ni una sola traza real en todo el intento.
- **No** se identificó ningún origen fallido (INM-OWN / INM-COT / INM-GEST / INM-ID / INM-ADMIN): **NO CONFIRMADO**
  y no determinable desde Arena.
- **No** se obtuvieron datos reales: ni `uid`, ni `profile`, ni `pid`, ni `scope`, ni `mirrorPropietarioId`, ni
  `profilePropietarioId`, ni `failingTerm`, ni reglas publicadas → todos **NO CONFIRMADOS**.
- La vista previa instrumentada sigue disponible en el sandbox (`app-instrumentada-instrumented-a-8f1fd93e`:3000),
  pero su lectura exige una sesión iniciada en el **navegador del usuario**, es decir, una acción que **esta orden
  prohíbe solicitar**.

### 13.6 ¿Se fabricó algo? — **NO · CONFIRMADO**

No se creó ninguna cuenta, ni documento ficticio, ni se simuló autorización o denegación del motor real. El harness
de reglas sigue siendo **estático y así declarado** (§5.3): no se ha usado ni presentado como motor real.

### 13.7 FASE 5 — Preservación del estado: **CONFIRMADO**

`git status` tras el intento es **idéntico** al de cierre de la orden anterior: `M src/App.tsx`, `M src/lib/firebase.ts`
(instrumentación de órdenes previas) y los ficheros nuevos de diagnóstico/tests/informes. **Nada** de:
quitar INM-COT, eliminar consultas, cambiar `array-contains`, cambiar `propietarioId`, copiar datos entre `usuarios`
y `usuarios_auth`, modificar Rules, ampliar permisos, `allow read` global, excepciones, roles, índices ni modelo de
titularidad. `firestore.rules` → **sin cambios** (verificado con `git status` y `git diff`); consultas de inmuebles →
**sin cambios** (literales presentes en `firebase.ts:401/434/472` y rama administrativa sin `where`).

### 13.8 FASE 7 — Validación ejecutada tras el intento

| Comprobación | Resultado |
|---|---|
| `npm run lint` (typecheck real, `tsc --noEmit`) | **PASS**, exit 0 |
| Suites afectadas (8 archivos: matriz de orígenes, reglas de inmuebles, f2, titularidades, espejo, diagnóstico, panel, despliegue) | **165 pass · 0 fail** |
| Suite completa (`npx vitest run`) | **186 archivos · 3 413 pass · 2 skip · 0 fail** (~198 s) |
| `npm run build` | **PASS**; el bundle de producción no contiene el panel (0 apariciones); `dist/` eliminado |
| `firestore.rules` / consultas / modelo / permisos / roles | **sin cambios** |

### 13.9 CONCLUSIÓN OBLIGATORIA — **CASO 2 · SIN SESIÓN REAL**

> «Arena no dispone de una sesión Firebase autenticada real de la cuenta afectada ni de un mecanismo interno que
> permita reproducirla. Por tanto, no es técnicamente posible determinar desde Arena qué lectura concreta recibe el
> `permission-denied`.»

A ello se añade, como segundo bloqueo **independiente y demostrado**, que la salida de red del sandbox hacia los
endpoints de Firebase/Auth está filtrada (§13.4). **No se propone ningún cambio de código ni de reglas.** El
siguiente paso queda pendiente hasta disponer de evidencia real (la traza `[DIAG-INMUEBLES]` de la cuenta afectada),
tal como detalla la tabla de prioridades del §12.
