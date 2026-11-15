# P0 — FASE DE RESOLUCIÓN Y DECISIÓN

**Fecha:** 2026-11-15
**Naturaleza de esta fase:** análisis, contraste y documentación. **No se ha modificado nada.**

> **Aviso de honestidad sobre esta entrega.** Esta fase se ha realizado **leyendo las reglas
> y el código del repositorio**, no ejecutando nuevas pruebas. El entorno local se reinició y
> no conserva el motor de emuladores. Por tanto, todo lo que sigue se apoya en dos fuentes:
> (1) el texto literal de `firestore.rules` en el commit `2bed683`, idéntico al que se probó;
> y (2) los resultados **ya obtenidos** en CI con los emuladores oficiales (commits `6312cab`
> y `0f7fe91`). No hay resultados nuevos y no se presentan como tales.

---

## 0. Estado de la rama y de la PR #86

| Elemento | Estado |
|---|---|
| Rama | `arena/77999d3b-gestor-de-inmuebles-vercel` |
| Commit en la rama remota | `81c6401656da8b0f83ebb7404acd435de736c106` |
| PR | **#86 — OPEN**, `mergeable: MERGEABLE` |
| Job «Tipos, suite completa y build» | ✅ **PASA** (323/323 archivos, 5.361/5.368 correctas, 0 fallidas) |
| Job «Reglas Firestore y Storage (emuladores oficiales)» | ❌ **FALLA** (847/868; 4 fallos reales en P0-A + 12 omitidas preexistentes de P3) |
| Repositorio local | vuelto a `2bed683`; el trabajo consta como **no confirmado** en local pero **sí está en el remoto** (`81c6401`) |
| Tag `p0-base-2bed683` | **AUSENTE en local** tras el reinicio; apunta al mismo commit que `2bed683`, por lo que el punto de recuperación real es el propio commit `2bed683d…` |
| Merge / despliegue | **ninguno**, conforme a la orden |

**Consecuencia práctica:** el punto de recuperación no se ha perdido (es `2bed683`, que existe
y es inmutable), pero **el tag debe recrearse** si se quiere conservar el nombre. Es una
operación de 1 comando y no la he ejecutado porque esta fase prohíbe cambios.

---

## 1. Hallazgo A — `enlaces_registro`

### A.1 Regla exacta que permite la lectura

`firestore.rules:2528`:

```
allow get: if (esInvitacionGestion(resource.data)
  ? (isMasterAdmin() || destinatarioGestion(resource.data))
  : (isSignedIn() || (isValidId(enlaceId) && resource.data.activo == true)));
```

`firestore.rules:2531`:

```
allow list: if isMasterAdmin()
  || (isStaff() && !('finalidad' in resource.data && resource.data.finalidad == 'ONBOARDING_CARTERA'));
```

### A.2 Tipos de usuario que pueden acceder

| Rol | `get` sobre enlace **no** de gestión | `get` sobre enlace **de gestión** (`finalidad == 'ONBOARDING_CARTERA'`) |
|---|---|---|
| No autenticado | ✅ **sí**, si el enlace está `activo == true` (rama `isValidId(enlaceId) && activo`) | ❌ no |
| Autenticado (cualquier rol) | ✅ **sí, sin condición** (`isSignedIn()`) | Solo master o el destinatario nominal |
| Master | ✅ sí | ✅ sí |
| Profesional / Inquilino | ✅ **sí**, igual que cualquier autenticado | Solo si es el destinatario |

**`list`**: cerrado a master y staff, y el staff tiene excluidas las invitaciones de gestión.
Es decir, **no se puede enumerar**, pero **sí se puede leer por id**.

### A.3 Qué campos quedan expuestos

El documento completo. Interfaz `EnlaceRegistro` (`src/types.ts:2093`):

| Campo | Sensibilidad |
|---|---|
| `token` | **Credencial de un solo uso**. Es el dato crítico. |
| `emailInvitado` | Dato personal |
| `usuarioIdVinculado`, `propietarioIdVinculado`, `profesionalIdVinculado`, `personaIdVinculada` | Identificadores internos |
| `contratoIdVinculado`, `inmuebleIdVinculado` | Relación contractual |
| `alcanceInmuebleIds`, `permisoGestion`, `gestionId` | Alcance de permisos |
| `estadoInvitacion`, `usosActuales`, `usosMaximos`, `fechaCaducidadMs` | Estado del enlace |
| `creadoPor`, `createdAt`, `resueltaPor`, `resueltaAt` | Trazabilidad |

### A.4 ¿Pueden leer enlaces de otros propietarios?

**Sí.** Para enlaces que no son de gestión, la rama `isSignedIn()` no mira a quién pertenece el
enlace. Un propietario A, un profesional o un inquilino autenticados pueden leer por id un
enlace nominal de un propietario B.

### A.5 Consecuencias prácticas — con la atenuante importante

**Atenuante verificada:** el token **no se valida en la aceptación**. En `authService.ts:531`
la aceptación usa `doc(db, 'enlaces_registro', enlace.id)` y las reglas
`invitacionNominalVigente()` comparan `enlaceId`, `usuarioIdVinculado`,
`propietarioIdVinculado`, `emailInvitado`, `activo` y `estadoInvitacion`. **El `token` no
participa.** Por tanto, **extraer el token no permite por sí solo consumir el enlace**.

Lo que sí permite:

1. **Enumerar la existencia** de invitaciones ajenas (por id adivinable o conocido).
2. **Obtener datos personales**: `emailInvitado`, y la relación con `personaIdVinculada`,
   `propietarioIdVinculado`, `usuarioIdVinculado`.
3. **Obtener el `token`**, que se usa en `descripcion` de la auditoría
   (`authService.ts:856`) y puede acabar en textos visibles o logs.
4. **Saber el estado** de una invitación ajena (`PENDIENTE`, `ACEPTADA`, `REVOCADA`) y sus
   `usosActuales`.

**Riesgo real: MEDIO-BAJO**, no alto. Es una fuga de metadatos y de datos personales entre
propietarios, no una vía de escalada de privilegios. **Corrijo aquí la calificación que di en
el informe anterior** («MEDIA» sin matiz): la severidad es *media-baja* precisamente porque
el token no es la credencial efectiva.

### A.6 Pruebas que demuestran el comportamiento

En `tests/emulador/p0-cobertura-reglas.emulador.test.ts`, suite
`P0-A · enlaces_registro (10 supuestos)`:

| Caso | Prueba | Resultado en CI |
|---|---|---|
| 6 | propietario A lee enlace de propietario B | ❌ **falla: la lectura sucede** |
| 8 | profesional lee enlace ajeno | ❌ **falla: la lectura sucede** |
| 9 | inquilino lee enlace ajeno | ❌ **falla: la lectura sucede** |
| 1, 2, 3, 4 | sin autenticación: leer/crear/modificar/eliminar | ✅ pasan |
| 10 | borrado prohibido a todos los roles | ✅ pasa |

Estos tres fallos son la **evidencia empírica** del hallazgo, obtenida con el motor oficial.

### A.7 Propuesta de corrección mínima (NO implementada)

En `firestore.rules:2528`, sustituir la rama genérica `isSignedIn()` por una que exija
relación con el enlace:

```
: (isMasterAdmin()
   || (isStaff())
   || (isSignedIn() && emailInvitadoDeEnlaceCoincide(resource.data, authEmail())))
```

donde `emailInvitadoDeEnlaceCoincide(d, email)` devuelve `true` si `d.emailInvitado == email`
o si el documento no tiene `emailInvitado` (enlaces genéricos sin destinatario nominal, que
son los que el flujo público necesita).

**Por qué esta forma y no otra:** los enlaces **genéricos sin email** deben seguir siendo
legibles para el flujo de registro público; los **nominales** (con `emailInvitado`) no deben
serlo por nadie que no sea su destinatario. La corrección no toca `list`, ni `create`, ni
`update`, ni `delete`.

**Riesgo de la corrección:** si algún flujo de UI lee un enlace nominal antes de que el
usuario haya iniciado sesión con el email invitado, se rompería. Hay que verificar
`authService.ts:637` (segunda lectura del enlace) antes de aplicarla.

### A.8 Pruebas de regresión necesarias

1. Las 3 pruebas que hoy fallan deben pasar.
2. Un enlace **genérico** (`sin emailInvitado`, `activo == true`) debe seguir siendo legible
   por un usuario autenticado → **flujo de alta pública intacto**.
3. Un enlace **nominal** debe seguir siendo legible por su destinatario con email verificado.
4. El flujo completo de aceptación (`tests/emulador` + `src/lib/authService` tests) debe
   seguir verde: 5.361 pruebas de la suite completa.
5. Un enlace `activo == false` no debe ser legible por un tercero.

---

## 2. Hallazgo B — `audit_logs`

### B.1 Regla exacta de creación

`firestore.rules:2602-2607`:

```
allow create: if isSignedIn() && (
  isMasterAdmin()
  || !('usuarioEmail' in incoming())
  || incoming().usuarioEmail == ''
  || incoming().usuarioEmail == authEmail()
);
allow update, delete: if false;
```

### B.2 Qué campos puede controlar quien crea el registro

La regla **solo restringe `usuarioEmail`**. Todos los demás campos son libres: `id`,
`accion`, `resultado`, `fecha`, `detalles` (incluidos `detalles.actorUid`,
`detalles.rutas`, `detalles.propietarioId`), `documentoAfectado`, etc.

### B.3 ¿Puede falsificar autor, rol, fecha u operación?

| Campo | ¿Falsificable en un `create` directo? |
|---|---|
| `usuarioEmail` | **No** (salvo que sea su propio email) |
| `detalles.actorUid` | **Sí** — no hay ninguna comprobación |
| `resultado` | **Sí** — puede declarar `EXITO` o `ERROR` a voluntad |
| `accion` | **Sí** |
| `fecha` / `createdAt` | **Sí** — es un campo de texto, no `request.time` |
| `detalles.rutas` | **Sí** |

### B.4 ¿Puede alterar registros existentes?

**No.** `allow update, delete: if false` (línea 2608). Los registros son inmutables una vez
creados. Esto es correcto y hay prueba en verde (caso 10 de `audit_logs`).

### B.5 ¿El mecanismo de evento en el mismo commit sigue siendo efectivo?

**Sí, y es más fuerte de lo que dije en el informe anterior.** `auditoriaVinculada`
(`firestore.rules:41-49`) exige sobre el log escrito **en el mismo commit**
(`getAfter`):

```
.data.id              == d.roadmap01AuditId
.data.resultado       == 'EXITO'
.data.usuarioEmail    == authEmail()
.data.detalles.actorUid == request.auth.uid
.data.detalles.rutas.hasAny([ruta])
```

Esto **vincula el evento al actor autenticado** y a la ruta exacta escrita. Un usuario **no
puede** fabricar un evento que atribuya una acción administrativa a otra persona para
satisfacer `auditoriaVinculada`: la comprobación de `usuarioEmail` y `actorUid` lo impide.

**Corrección al informe anterior:** dije que «un usuario cualquiera puede insertar entradas de
auditoría falsas» sin matizar. Preciso el alcance:

- **No** puede falsificar un evento que respalde una escritura privilegiada ajena.
- **Sí** puede insertar **ruido**: registros con `usuarioEmail` propio (o vacío), `resultado`
  inventado y `fecha` inventada. Eso **degrada la confianza en el libro de auditoría**: un
  revisor que filtre por `resultado == 'EXITO'` puede ver éxitos que nunca ocurrieron.

### B.6 Consecuencias sobre la trazabilidad

| Propiedad | Estado |
|---|---|
| Integridad de una escritura privilegiada concreta | **Preservada** (por `auditoriaVinculada`) |
| Inmutabilidad del log | **Preservada** (`update, delete: if false`) |
| Autenticidad global del libro | **Degradada**: se pueden inyectar eventos no respaldados por ninguna operación |
| Confianza en métricas o informes sobre `audit_logs` | **Comprometible** |

**Riesgo: MEDIO**, y es **menor** de lo que sugerí antes. No permite escalar privilegios ni
borrar huellas; permite **contaminar** el histórico.

### B.7 Propuesta de corrección mínima (NO implementada)

Dos opciones, de menor a mayor alcance:

**Opción 1 (mínima, recomendada):** exigir forma al evento. En `allow create`, añadir que
`detalles.actorUid == request.auth.uid` y que `resultado in ['EXITO','ERROR']`:

```
allow create: if isSignedIn()
  && (isMasterAdmin() || !('usuarioEmail' in incoming())
      || incoming().usuarioEmail == '' || incoming().usuarioEmail == authEmail())
  && (!('detalles' in incoming()) || !('actorUid' in incoming().detalles)
      || incoming().detalles.actorUid == request.auth.uid);
```

**Opción 2 (estructural):** que `audit_logs` solo se escriba desde el servidor (cuenta de
servicio, con `allow create: if false` para el SDK de cliente). Es la solución de fondo, pero
exige revisar **todos** los puntos que hoy escriben auditoría desde el cliente.

**Riesgo de la Opción 1:** si algún flujo legítimo escribe `detalles.actorUid` de un tercero
(por ejemplo, una acción administrativa en nombre de otro), se rompería. Hay que verificar
antes los usos reales.

### B.8 Pruebas de regresión necesarias

1. El caso que hoy falla (propietario A crea un `audit_log` arbitrario) debe pasar a fallar.
2. Todos los flujos existentes que escriben auditoría deben seguir funcionando: **la suite
   completa (5.361 pruebas)** es la red de seguridad, porque `auditoriaVinculada` participa en
   decenas de reglas.
3. `update` y `delete` deben seguir prohibidos.

---

## 3. Hallazgo C — `mensajes_portal`

### C.1 Regla o expresión que provoca el error

`firestore.rules:3000`:

```
allow get: if ('contratoId' in existing() && ambitoPorContratoLectura(existing().contratoId))
  || (isTenant() && ('contratoId' in resource.data) && tenantTieneContrato(resource.data.contratoId));
```

### C.2 Diferencia entre documento existente e inexistente

| Operación | `existing()` | Resultado |
|---|---|---|
| `get` sobre documento **existente** | tiene datos | la condición se evalúa con normalidad |
| `get` sobre documento **inexistente** | **no tiene datos** | `existing().contratoId` **no se puede evaluar** → `evaluation error` |

El motor de reglas aborta la evaluación de la condición en vez de devolver «no existe». El
cliente recibe un `FirebaseError` de evaluación, no un `permission-denied` limpio.

### C.3 ¿Afecta solo al master?

**No. Afecta a todos los roles que lleguen a esa condición.** Como la primera rama del `||`
se evalúa antes (`'contratoId' in existing()`), el error se produce para **cualquier rol**:
master, propietario, gestor, inquilino y profesional. La prueba saltó con el master porque es
el rol cuyo caso esperaba éxito y recibió error de evaluación.

**Matiz:** `'contratoId' in existing()` sobre un documento inexistente puede cortocircuitar a
`false` sin error; lo que provoca el fallo observado es la combinación con las lecturas
`ambitoPorContratoLectura()`, que hacen `get()` de rutas que tampoco existen. En cualquier
caso, el comportamiento observado está documentado: **la guarda no degrada correctamente**.

`allow list` (línea 3011) usa `resource.data` y **no** tiene este problema.

### C.4 Impacto real

**BAJO.** Un documento inexistente devuelve un error feo en lugar de «no existe». No concede
ni deniega permisos indebidamente: no hay fuga ni escalada. El único efecto es de robustez y
de diagnóstico (mensajes de error confusos, posibles falsos positivos en monitorización).

### C.5 Propuesta de corrección mínima (NO implementada)

Reescribir la primera rama para usar `resource.data` en lugar de `existing()` en un `get`:

```
allow get: if ('contratoId' in resource.data && ambitoPorContratoLectura(resource.data.contratoId))
  || (isTenant() && ('contratoId' in resource.data) && tenantTieneContrato(resource.data.contratoId));
```

`resource` está vacío cuando el documento no existe y `'contratoId' in resource.data` es
`false` sin error. **Riesgo:** verificar que el cambio no altera el comportamiento de `list`
(que ya usa `resource.data`) ni de `update` (que usa `existing()` correctamente, porque en un
`update` el documento existe por definición).

---

## 4. El cuarto fallo — **ACLARADO: no existe**

La orden señala con razón que el informe enumeraba tres hallazgos y hablaba de cuatro. La
investigación da este resultado:

**El cuarto fallo era `fichas_publicas_inmueble`, casos 6 y 8. Era un defecto de la batería,
no un hallazgo, y está corregido desde el commit `0f7fe91`.**

| Pregunta | Respuesta |
|---|---|
| Cuarto caso | `P0-A · fichas_publicas_inmueble` casos **6** (lectura cruzada) y **8** (profesional) — y sus gemelos en `especialidades` |
| Identificador de prueba | «6. el propietario A no lee el documento del propietario B» / «8. un profesional no lee lo que no está en su ámbito» |
| Colección y operación | `fichas_publicas_inmueble` y `especialidades` · `get` |
| Resultado esperado por la prueba | fallo (denegación) |
| Resultado obtenido | **éxito** (lectura permitida) |
| Clasificación | **Defecto de la batería.** Ambas colecciones son de **lectura pública por diseño** (`allow get: if true`, fijado en lista blanca por el test estructural). La prueba exigía una denegación inexistente. |

**Reconciliación de la aritmética** (verificada contra los comentarios de CI de la PR #86):

| Ejecución | Fallos | Desglose |
|---|---|---|
| 1.ª (`6312cab`) | **9** | `fichas_publicas_inmueble` 2 · `especialidades` 2 · `enlaces_registro` 3 · `audit_logs` 1 · `mensajes_portal` 1 → 2+2+3+1+1 = **9** ✅ |
| 2.ª (`0f7fe91`) | **4** | `enlaces_registro` 3 · `audit_logs` 1 → 3+1 = **4** ✅ |

Comprobado: el texto de la 1.ª ejecución contiene `mensajes_portal`; el de la 2.ª **no lo
contiene**. Los 4 fallos de la 2.ª son exactamente los casos 6, 8 y 9 de `enlaces_registro` y
el caso 7 de `audit_logs`.

**Por tanto, la cifra correcta no es «4 hallazgos reales» sino 3:**

| # | Colección | Casos | ¿Hallazgo? |
|---|---|---|---|
| 1 | `enlaces_registro` | 6, 8, 9 | ✅ **Sí** (lectura entre titulares) |
| 2 | `audit_logs` | 7 | ✅ **Sí** (eventos no respaldados) |
| 3 | `mensajes_portal` | 5 | ⚠️ **Latente**: falló en la 1.ª ejecución y no en la 2.ª porque el estímulo cambió (al añadir `contratoId` al documento sintético). El **defecto de la regla existe** (`existing()` en un `get`), pero la batería actual **no lo captura de forma fiable** |

**Conclusión honesta:** mi informe anterior contó mal. Dije «4 hallazgos» enumerando 3, y el
cuarto era un defecto de mi batería. **P0-A no se puede cerrar como «sin discrepancias»
hasta que `mensajes_portal` tenga una prueba estable que lo capture a propósito** (un `get`
explícito sobre un id inexistente en esa colección). Eso es trabajo de corrección, no de esta
fase.

---

## 5. Conciliación de la cobertura

### 5.1 Las cifras y por qué no cuadran a simple vista

| Cifra | Valor real | Explicación |
|---|---|---|
| «77 colecciones» | **77 bloques** `match` de primer nivel | **Incluye el comodín** `match /{document=**}` de denegación global, que no es una colección de datos |
| Colecciones de datos reales | **76** | 77 − comodín |
| Subcolecciones | **4** | `progreso_tutoriales`, `documentos_patrimoniales`, `documentos_profesionales`, `entidades` |
| «76 bloques × 10 pruebas = 760» | **760** | Correcto: 76 suites × 10 |
| Casos ejecutados | **761** | 760 + 1 prueba de meta-cobertura («cubre 76 colecciones») |
| Celdas de la matriz | **304** | 76 colecciones × 4 operaciones. **No incluye el comodín ni las subcolecciones** |
| Rutas de Storage | **2** | `inmuebles/{inmuebleId}/{fileName}` y `{allPaths=**}` |
| Destinos documentales | **20** | Claves de `DESTINOS` en `autorizacionDocumental.ts` |

### 5.2 Qué está probado realmente

| Ámbito | Probado por el motor oficial | Cómo | Veredicto |
|---|---|---|---|
| 76 colecciones de primer nivel · `get` sin sesión | ✅ sí | 76 pruebas | Cubierto |
| 76 colecciones · `create` sin sesión | ✅ sí | 76 pruebas | Cubierto |
| 76 colecciones · `update` sin sesión | ✅ sí | 76 pruebas | Cubierto |
| 76 colecciones · `delete` sin sesión | ✅ sí | 76 pruebas | Cubierto |
| 76 colecciones · lectura del master | ✅ sí | 76 pruebas (positivas) | Cubierto |
| 76 colecciones · lectura cruzada entre titulares | ⚠️ **parcial** | 76 pruebas, pero **no distingue** si la denegación viene del ámbito o de otra condición | Cubierto con reserva |
| 76 colecciones · escritura cruzada | ⚠️ **parcial** | igual | Cubierto con reserva |
| 76 colecciones · `list` (enumeración) | ❌ **no probado** | la batería solo hace `get` por id | **Hueco** |
| Restricción de borrado | ✅ sí | 76 pruebas (caso 10) | Cubierto |
| 4 subcolecciones | ❌ **no cubiertas por P0** | `progreso_tutoriales` no aparece en ninguna prueba; las otras 3 solo en suites P3 | **Hueco** |
| Rutas de Storage (2) | ✅ sí, pero **solo por suites preexistentes** | `storage-ambitos` 5/5, `documentos-servidor` 7/7 | Cubierto, fuera de P0 |
| 20 destinos documentales | ❌ **no probados por clave** | ninguna prueba de emulador nombra un destino | **Hueco** |
| Permisos por relación (inmueble/contrato/incidencia/orden) | ⚠️ **parcial** | la matriz los identifica; las pruebas usan un documento sintético único | **Hueco importante** |

### 5.3 Por qué 760 pruebas ≠ cobertura completa

Cuatro razones concretas y verificables:

1. **`list` no se prueba.** Las reglas distinguen `get` y `list` (varias colecciones tienen
   `allow get` permisivo y `allow list: if false`). La batería solo hace `get`. Una regla
   `list` mal escrita **no sería detectada**.
2. **Un solo documento sintético por colección.** `{ sintetico, propietarioId, inmuebleId,
   contratoId, id }`. Las condiciones que dependen de otros campos (estado, rol específico,
   profesional asignado, cotitularidad) **no se ejercitan**.
3. **Las subcolecciones quedan fuera.** El generador filtra el comodín pero no recorre
   subcolecciones; `progreso_tutoriales` no está probada por nadie.
4. **Los 20 destinos documentales no se prueban por identidad.** Que el servidor autorice
   `CONTRATO_DOCUMENTO` para el titular correcto y lo deniegue para otro es un requisito de
   P0-A §2.1 y hoy no tiene prueba con el nombre del destino.

### 5.4 Veredicto de cobertura

| Nivel | Estado |
|---|---|
| Colecciones inventariadas | **100 %** (76 + 4 + comodín) |
| Colecciones con política documentada | **100 %** (matriz 304 celdas, 0 sin clasificar) |
| Colecciones con al menos 10 supuestos ejecutados | **100 % de las de primer nivel** (76/76) |
| Operaciones cubiertas | **4 de 5** (`get`, `create`, `update`, `delete`; falta `list`) |
| Permisos por relación profunda | **parcial**, no medido |

**No se puede declarar «cobertura completa».** Se puede declarar, con precisión: *«cobertura
del 100 % de colecciones de primer nivel para las operaciones `get`/`create`/`update`/`delete`,
con reservas en `list`, subcolecciones, profundidad por relación y destinos documentales»*.

---

## 6. Backup y restauración — qué falta exactamente

### 6.1 Lo que ya está hecho y probado

| Elemento | Estado |
|---|---|
| Identidad de la base (63 caracteres, nombre exacto) | ✅ validado y probado |
| Prohibición de la base por defecto | ✅ probada (por formato, sin literal) |
| `snapshotId` único compartido Firestore+Storage | ✅ probado |
| Manifiesto con SHA-256 y recuento por colección | ✅ probado |
| Verificador de coherencia registro↔archivo | ✅ probado con fixtures |
| Retención generacional | ✅ probado |
| Guardas anti-producción de restauración | ✅ probadas por CLI |
| Separación Firestore / Storage | ✅ correcta: **no se asume** que el export incluya Storage |

### 6.2 Lo que falta, en orden

| # | Falta | Exige |
|---|---|---|
| 1 | **Proyecto aislado de restauración** (`gestor-inmuebles-restore-test`) creado y con facturación activa | Acceso a Google Cloud Console |
| 2 | **Bucket de backups** (`gestor-inmuebles-backups`) con acceso restringido y sin exposición pública | Consola / `gcloud` |
| 3 | **Cuenta de servicio** con permisos mínimos | IAM |
| 4 | **Una exportación real** de la base nombrada | `gcloud firestore export --database=<id>` |
| 5 | **Copia de Storage** con rutas, metadatos y hashes | `gcloud storage rsync` |
| 6 | **Importación en el proyecto aislado** | `gcloud firestore import` + `rsync` |
| 7 | **Verificación real**: recuentos, relaciones, apertura de archivos, hashes | Scripts ya escritos |
| 8 | **Informe de errores** de la prueba | — |

### 6.3 Permisos mínimos documentados (propuesta, NO aplicada)

Cuenta de servicio `backup-p0@gestor-inmuebles-produccion.iam.gserviceaccount.com`:

| Rol | Ámbito | Para qué |
|---|---|---|
| `roles/datastore.importExportAdmin` | proyecto | exportar / importar Firestore |
| `roles/storage.objectAdmin` | **solo** el bucket de backups | escribir copias |
| `roles/storage.objectViewer` | **solo** el bucket de la app | leer los archivos a copiar |

**Sin** `roles/owner`, `roles/editor` ni acceso de escritura al bucket de la aplicación.
**Separación clave:** el bucket de backups debe estar en **otro proyecto** (o con
`retention policy` / object-lock) para cumplir el requisito de P0-B §3.7: *que un usuario
comprometido no pueda borrar datos y copias a la vez*.

### 6.4 Procedimiento seguro en proyecto aislado

Ya documentado en `docs/p0/P0-B-PROCEDIMIENTO-RESTAURACION.md` (8 pasos, guardas probadas).
Nada que añadir salvo que **la lista blanca se pasa por variable de entorno**
(`P0_PROYECTOS_RESTAURACION`), nunca por valor por defecto en el repositorio.

**No se ha ejecutado nada contra producción.**

---

## 7. MFA y cuenta master

### 7.1 El flujo que falta, punto por punto

| Pieza | Estado | Dónde falta exactamente |
|---|---|---|
| **Enrolamiento del segundo factor** | ❌ ausente | No existe pantalla ni llamada a `multiFactor(user).enroll()`. El SDK lo soporta (`TotpMultiFactorGenerator`, `PhoneMultiFactorGenerator`) |
| **Validación durante el inicio de sesión** | ❌ ausente | `authService.ts:295` hace `signInWithEmailAndPassword` y en `catch` (línea 298) solo trata `auth/operation-not-allowed`. **Un `auth/multi-factor-auth-required` cae en el `throw authErr` genérico** |
| **Resolución del reto** | ❌ ausente | No se llama a `getMultiFactorResolver()` en ningún punto |
| **Recuperación de acceso** | ⚠️ parcial | `enviarRecuperacionPassword` existe (`authService.ts:1225`), pero **restablecer la contraseña no satisface un segundo factor activo** |
| **Protección frente al bloqueo** | ❌ ausente | No hay códigos de respaldo, ni administrador de respaldo, ni procedimiento probado |
| **Registro de accesos** | ⚠️ parcial | `audit_logs` cubre escrituras; no hay log dedicado de inicios de sesión |

### 7.2 El riesgo exacto de activar MFA hoy

Si se activa el factor en la cuenta master **sin** el paso de validación:

1. El master introduce email y contraseña correctos.
2. Firebase devuelve `auth/multi-factor-auth-required`.
3. El código lo trata como error genérico → **no hay sesión**.
4. No hay segunda vía de administración (el master se identifica por email verificado; sin
   sesión no hay `isMasterAdmin()`).
5. **La cuenta queda fuera del sistema.** Recuperarla exige Firebase Console con rol Owner.

Por eso el orden obligatorio es: **cablear → enrolar → probar en aislado → activar**.

### 7.3 Lo que ya está preparado

`src/lib/masterSeguridad.ts` (no desplegado, 16 pruebas en verde) define:
`clasificarIntentoLogin()` (distingue el reto de un error de credenciales),
`evaluarProteccionMaster()` (detecta el «bloqueo inminente»),
`requisitosParaActivarMfa()` (lista de lo que falta) y
`PROCEDIMIENTO_RECUPERACION_MASTER` (4 pasos).

**No se ha activado MFA.**

---

## 8. Tabla de decisiones para el titular

| # | Hallazgo | Evidencia | Riesgo | Corrección propuesta | Pruebas necesarias | Dependencias | **Decisión que debe tomar el titular** |
|---|---|---|---|---|---|---|---|
| A | `enlaces_registro`: lectura de enlaces ajenos entre titulares (casos 6, 8, 9) | 3 fallos reproducibles en emulador oficial | **MEDIO-BAJO**: fuga de datos personales y estado; el token **no** es la credencial efectiva | Exigir `emailInvitado == authEmail()` en enlaces nominales; mantener genéricos legibles | Las 3 que fallan + flujo de alta pública + aceptación completa | Verificar `authService.ts:637` | ¿Se corrige en P0.1 o se acepta como riesgo residual documentado? |
| B | `audit_logs`: se pueden insertar eventos no respaldados (caso 7) | 1 fallo reproducible | **MEDIO**: contamina la trazabilidad global; **no** permite escalar privilegios ni borrar huellas | Exigir `detalles.actorUid == request.auth.uid` y `resultado` válido en `create` | El caso que falla + suite completa (5.361) | Revisar quién escribe `actorUid` de terceros | ¿Corrección mínima ahora, o migración a «solo servidor» en P1? |
| C | `mensajes_portal`: error de evaluación con documento inexistente | Falla en 1.ª ejecución; **no reproducido** en la 2.ª | **BAJO**: error feo, sin impacto en permisos | Usar `resource.data` en lugar de `existing()` en el `get` | **Falta una prueba estable** que lo capture a propósito | — | ¿Se acepta que P0-A queda con una prueba no concluyente? |
| D | Cobertura: sin `list`, sin subcolecciones, sin destinos documentales | §5.2 | **MEDIO**: puntos ciegos reales | Ampliar la batería a `list` y a `progreso_tutoriales`; una prueba por destino | — | — | ¿Se amplía antes de cerrar P0-A, o se acepta la cobertura parcial declarada? |
| E | Backup/restauración sin evidencia real (entregable K) | Sin acceso a GCP | **ALTO**: no se puede afirmar que el sistema es recuperable | Ejecutar los 8 pasos en proyecto aislado | Verificación real de recuentos, relaciones, apertura de archivos | Proyecto aislado + bucket + cuenta de servicio | ¿Se autoriza crear el proyecto aislado y ejecutar la prueba? |
| F | MFA no activable hoy | `authService.ts:295-299` sin rama MFA | **MEDIO-ALTO**: master solo protegido por contraseña | Cablear la resolución del reto **antes** de activar | Enrolamiento + login + recuperación, en aislado | Despliegue (prohibido en P0) | ¿Se autoriza el cableado de MFA como P0-C.2? |
| G | Tag de recuperación ausente en local | `git tag -l` vacío; commit `2bed683` intacto | **BAJO**: el commit existe; solo se pierde el nombre | `git tag -a p0-base-2bed683 2bed683` | — | — | ¿Se autoriza recrear el tag? |

---

## 9. Condición de cierre

- **No se ha corregido nada.** Ni reglas, ni código, ni configuración, ni permisos.
- **No se ha desplegado, fusionado ni publicado** ningún cambio adicional.
- **P1 no se ha iniciado.**
- **La PR #86 sigue OPEN** y su job de emuladores sigue en rojo, como debe estar mientras
  existan hallazgos sin resolver.

**Esta fase termina aquí. A la espera de decisión sobre la tabla del §8.**
