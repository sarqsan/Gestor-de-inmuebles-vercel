# CONTRATO CANÓNICO DE AUTORIZACIÓN Y AUDITORÍA — B → C

> **Fuente única para Arena C.** Este documento NO define arquitectura nueva:
> EXTRAE y CONSOLIDA el contrato real que ya existe en Arena B
> (`arena/01a0d97d-gestor-de-inmuebles-vercel`, base `a9ef729`) para que el
> Bloque 2 de operaciones de Arena C (persistencia + Rules + auditoría + UI +
> validación) lo consuma sin inventar nada.
>
> Todo lo aquí escrito está derivado de código real inspeccionado el
> 2026-09-26 (ficheros y símbolos citados en cada sección). Si el código y
> este documento divergen en el futuro, **manda el código** y este documento
> se actualiza por commit de docs.
>
> Marco general multi-Arena: `docs/CONTRATO-INTEGRACION-ARENAS.md`.
> Modelo de cuentas aprobado: `docs/D1-REVISADA-MODELO-CUENTAS-PROPIETARIOS-GESTORES.md`
> (decisiones S1–S7) y `docs/MAPA-MAESTRO-ERP-ACTUAL.md` §4.

---

## A. IDENTIDAD — UID → usuario → propietario

Cadena canónica (única válida para autorizar):

```
Firebase Auth UID (request.auth.uid)
   │  get() de RUTA FIJA (las reglas no pueden hacer consultas)
   ▼
usuarios_auth/{uid}            ← ESPEJO de identidad (reglas: ~l.348)
   │  · tipoPerfil, estado, propietarioId, profesionalId,
   │    inmuebleIds, carterasL, carterasE, usuarioId
   ▼
usuarios/{usuarioId}           ← PERFIL autoritativo de la cuenta de acceso
   │  (usuarioId = usuarios_auth/{uid}.usuarioId)
   ▼
propietarios/{propietarioId}   ← TITULAR jurídico (ficha fiscal)
```

Hechos verificados en código:

1. **`usuarios_auth/{uid}` (espejo)** — `syncAuthIndex()` en
   `src/lib/authService.ts` lo mantiene en cada login (idempotente,
   `merge: true`, nunca bloquea el inicio de sesión). Contiene SOLO:
   `uid, usuarioId, email, tipoPerfil, estado, roles, propietarioId,
   profesionalId, inmuebleIds, updatedAt` (+ `carterasL`/`carterasE` que el
   propio `syncAuthIndex` NO escribe: son exclusivos del master).
   Reglas de escritura del espejo: el usuario sólo puede crear/actualizar el
   SUYO (`request.auth.uid == uid`), con `tipoPerfil in ['PROPIETARIO',
   'PROFESIONAL']`, índice veraz (`indexIsTruthful()`) y SIN carteras
   (`carterasNoAutoasignadasEnCreacion()` / `carterasSinCambiarPorUsuario()`);
   `delete` sólo master. Nunca puede auto-afirmar `ADMINISTRADOR`.
2. **`usuarios/{usuarioId}` (perfil)** — `UsuarioApp` en `src/types.ts`
   (~l.1695). Es la CUENTA DE ACCESO: nombre, email, `tipoPerfil`
   (`PROPIETARIO | PROFESIONAL | ADMINISTRADOR | INQUILINO`), `estado`,
   `roles[]`, `permisos[]`, `propietarioId?`, `profesionalId?`,
   `inmuebleIds?`, `contratoIds?`. Resolución de login:
   `getUsuarioByAuthUid()` en `src/lib/authService.ts` (directo por docId=uid
   → admin principal fijo `user_admin_principal` → espejo `usuarios_auth/{uid}`
   → `usuarios/{usuarioId}`).
3. **`propietarios/{propietarioId}` (titular)** — `Propietario` en
   `src/types.ts`: nombre/razón social, `nifCif`, domicilio fiscal,
   representante legal, `cuentasBancarias[]`, notas privadas,
   `fechaCreacion/fechaActualizacion`. **NO contiene uid ni credenciales**:
   es el titular jurídico, no una cuenta.
4. **Diferencia cuenta ↔ titular**: `propietarioId` en el usuario es un
   ENLACE (`usuarios/{id}.propietarioId → propietarios/{id}`). El espejo lo
   replica para que las reglas lo lean en un solo `get()`.
5. **Propietario sin cuenta (S4)**: la ficha `propietarios/{id}` existe y
   funciona sin cuenta asociada (el master la administra; una gestión de
   cartera con `requiereAceptacion=false` no bloquea la preparación
   administrativa — `src/lib/gestionesCartera.ts`). Invariantes del dominio:
   «S4: propietario sin cuenta no bloquea la preparación administrativa».
6. **Usuario que no es propietario**: `propietarioId` ausente o `''` en el
   espejo → `ownsPropietario()`/`myPropId()` no conceden nada; su acceso
   patrimonial sólo puede venir de `inmuebleIds` (autorización explícita,
   sólo lectura de inmuebles) o de `carterasL/E` (si es gestor).
7. **Gestor que gestiona propietarios de terceros**: NO tiene
   `propietarioId` de esos titulares; su ámbito nace de
   `gestiones_cartera` proyectado a `carterasL`/`carterasE` (sección D).
8. **Administrador Principal**: se reconoce por EMAIL verificado por Firebase
   (`isMasterAdmin()` ⇔ `authEmail() == 'sarqsan2@gmail.com'`), imposible de
   suplantar desde el cliente. El perfil `ADMINISTRADOR` en `usuarios/{uid}`
   es un ámbito administrativo secundario (`esAdminInmuebles()`) que sólo el
   master puede escribir.
9. **Campos que NO deben usarse para autorizar** (no los consume ninguna
   regla de autorización patrimonial): `roles[]`, `permisos[]`, `nombre`,
   `telefono`, `lastLoginAt`, `activo?`, `rol?` (alias legacy), `email`
   (salvo el del master). La autorización REAL sale exclusivamente de:
   `request.auth.uid`, `usuarios_auth/{uid}` (`estado`, `tipoPerfil`,
   `propietarioId`, `profesionalId`, `inmuebleIds`, `carterasL`,
   `carterasE`, `usuarioId`) y `usuarios/{uid}.tipoPerfil` (sólo para
   `esAdminInmuebles()`/tenant).

## B. TITULARIDAD

- Ser **titular** = existir `propietarios/{pid}` y que el recurso lleve
  `propietarioId == pid`. En reglas: `ownsPropietario(pid)` ⇔
  `isPropietarioRole() && myPropId() == pid`.
- En inmuebles existe además `propietarioPrincipalId` (copropiedad):
  `inmuebleEsMio(d)` acepta ambos campos.
- **La titularidad NUNCA la modifican la gestión ni las herramientas**:
  `gestionesCartera.ts` (invariante: «La gestión NO modifica la titularidad
  legal»), y CESION→`responsableActual=TITULAR`… (ver H). Ningún flujo de C
  puede alterar `propietarioId` de un recurso como efecto de la gestión.

## C. GESTIÓN — qué es un gestor y cómo se representa

Dominio puro: `src/lib/gestionesCartera.ts` (BLOQUE F / D1R, 100% puro, sin
Firebase). Colección persistida: **`gestiones_cartera/{gestionId}`** con
`GestionCartera`:

| Campo | Significado real |
|---|---|
| `propietarioId` | Titular legal de la cartera (`propietarios/{id}`). |
| `gestorUsuarioId` | Usuario gestor (`usuarios/{id}`). |
| `tipoGestor` | `PROPIETARIO_GESTOR` (gestiona lo suyo) \| `GESTOR_PROFESIONAL`. |
| `inmuebleIds` | `[]` = cartera completa del titular. |
| `permiso` | `LECTURA` \| `LECTURA_ESCRITURA` (S7). |
| `responsableActual` | `GESTOR` \| `TITULAR` (quién opera hoy la cartera). |
| `estado` | `PENDIENTE_ACEPTACION` \| `ACTIVA` \| `SUSPENDIDA` \| `REVOCADA`. |
| `requiereAceptacion` | S4: true si el titular tiene cuenta y el flujo exige consentimiento. |
| `conservarLecturaHistorica` | S7: al revocar, si se conserva lectura histórica. |
| `eventos[]` | Histórico **append-only** (`EventoGestionCartera`: tipo, actor, fecha, estadoAnterior→estadoNuevo, permiso, motivo). Formato compatible con `AuditLog.detalles` (reutilización, no sistema paralelo). |

Máquina de estados CERRADA (`transicionPermitida`):
`PENDIENTE_ACEPTACION → INVITACION/ACEPTACION/ACTIVACION/REVOCACION`;
`ACTIVA → CESION/DEVOLUCION/CAMBIO_PERMISOS/SUSPENSION/REVOCACION`;
`SUSPENDIDA → REACTIVACION/REVOCACION`; **`REVOCADA` es terminal** (sin
reactivación ni reutilización de histórico).

Roles (S1): `GESTOR_PATRIMONIAL` (patrimonial, este dominio) ≠
`GESTOR_INMUEBLES` (operativo: candidatos/visitas/contratos/seguros). No se
reutilizan entre sí.

## D. CARTERAS — significado exacto de `carterasL` y `carterasE`

Derivado del código (`src/lib/carterasGestion.ts`, módulo de proyección D3;
comentarios de reglas D2b/D3; `UsuarioApp` en `src/types.ts`):

- **`carterasL`** = lista de `propietarioId` cuya cartera puedo **LEER**.
  Se obtiene de gestiones con `puedeLeer()` (dominio D1R):
  - `ACTIVA` (cualquier permiso), o
  - `REVOCADA` con `conservarLecturaHistorica=true` (S7: lectura histórica ≠
    gestión activa).
- **`carterasE`** = lista de `propietarioId` cuya cartera puedo
  **LEER + ESCRIBIR**. Exige TODO a la vez (`puedeEscribir()`):
  - `ACTIVA` **y** `permiso == 'LECTURA_ESCRITURA'` **y**
    `responsableActual == 'GESTOR'`.
  - `carterasE ⊆ carterasL` siempre.
- `SUSPENDIDA` → nada. `REVOCADA` sin conservación / `PENDIENTE_ACEPTACION`
  → nada.
- **Residencia**: espejo `usuarios_auth/{uid}` (ruta fija; las reglas no
  pueden consultar `gestiones_cartera`). **SÓLO el master las escribe**
  (anti-autoasignación en reglas del espejo). El cliente las LEE únicamente
  para acotar consultas (`dataScope`); la autorización efectiva está en las
  reglas.
- **Consumo en reglas** (`firestore.rules`): `carterasLectura()`,
  `carterasEscritura()`, `inmuebleEnCarteraGestionada(d)` (L∪E → lectura),
  `inmuebleEnCarteraEscritura(d)` (sólo E → escritura),
  `carteraGestionadaPorMi(pid)` (ficha del propietario).
- **Consumo en cliente**: `proyectarCarterasGestionadas()` y
  `propietariosGestionadosDe()` (`src/lib/carterasGestion.ts`);
  `getUsuarioByAuthUid()` rellena `usuario.carterasL/E` desde el espejo.
- Límite documentado (D3): sin `firebase-admin` en el repo, la proyección se
  persiste en el espejo vía master; no hay custom claims.

## E. PERMISOS — lectura/escritura por tipo de relación

| Relación | Lectura | Escritura |
|---|---|---|
| Titular (`propietarioId == myPropId()`) | Sus recursos | Sus recursos (create/update; delete sólo master) |
| Autorización explícita (`inmuebleIds` del espejo) | `inmuebles` (get, documento a documento) | `update` de inmuebles vía `canReachInmuebleId` (D2a no la amplió más) |
| Gestor L (cartera L) | Recursos de la cartera (get/list acotados) | **NADA** (S7) |
| Gestor E (cartera E) | Idem L | create/update de recursos de la cartera (según colección, ver F); **nunca** delete ni create de `propietarios` (S3) |
| ADMINISTRADOR (`usuarios/{uid}.tipoPerfil`) | `esAdminInmuebles()`: inmuebles, gestiones_cartera, registros_patrimoniales | Sólo donde la regla cite `esAdminInmuebles()` en create |
| Master (email) | Todo | Todo (incl. delete y escritura del espejo/carteras) |
| Inquilino | Su contrato/inmueble/notificaciones (ramas preexistentes) | Campos acotados de su contrato |
| Anónimo | `fichas_publicas_inmueble` (get) y cuestionarios de candidatos | Nada patrimonial |

Reglas transversales que C debe respetar:
- `list` sólo es demostrable por el motor con `where('propietarioId','==', …)`
  (constante de ruta fija) → las consultas de C DEBEN acotarse así.
- Sin `isStaff()` como bypass patrimonial (retirado en D2a para inmuebles;
  los bloques patrimoniales nuevos NO lo reintroducen).
- Delete de datos patrimoniales: sólo master (y titular en pólizas/siniestros
  propios). C no añade deletes.

## F. RULES — matriz real por colección y helpers a reutilizar

Matriz derivada de `firestore.rules` (bloques citados; ✓ permitido, ✗
denegado, «ficha» = sólo el subobjeto indicado):

| Colección | Titular | Gestor L | Gestor E | Admin(perfil) | Master | Anónimo |
|---|---|---|---|---|---|---|
| `propietarios` (~l.500) | get/create/update propios ✓; list ✗; delete ✗ | get ✓ | get ✓; update SÓLO `fichaPatrimonial` ✓; create ✗ (S3) | ✗ | todo ✓ (único list) | ✗ |
| `inmuebles` (~l.557) | get ✓; list con where propietarioId ✓; create/update propios ✓; delete ✗ | get ✓; list pid a pid ✓ | get/list ✓; update ✓ (`inmuebleEnCarteraEscritura`) | get/list ✓ (`esAdminInmuebles`) | todo ✓ (único create ajeno/delete) | ✗ (sólo ficha pública) |
| `gestiones_cartera` (~l.616) | get/list si es el titular ✓ | get/list si es el gestor designado ✓ (mismo helper `gestionInvolucraAMi`) | idem L | get/list ✓ | **única escritura** (create/update/delete) | ✗ |
| `audit_logs` (~l.1447) | ✗ | ✗ | ✗ | ✗ | read ✓ | ✗ |
| `registros_patrimoniales` (~l.638) | get/list/create ✓ | get/list ✓ | get/list/create ✓ | get/list/create ✓ | todo ✓ (único update/delete) | ✗ |
| `gastos` (~l.752) | get/list/create/update/delete propios ✓ | ✗ (los profesionales no tienen regla) | ✗ | ✗ (sólo master) | todo ✓ | ✗ |
| `polizas_seguros` / `siniestros` (~l.1165) | get/list/create/update/delete propios ✓ | get/list ✓ | get/list/create ✓; update ✓ (mismo propietarioId); delete ✗ | ✗ (sólo master) | todo ✓ | ✗ |
| `usuarios_auth/{uid}` (~l.348) | lee/edita el SUYO con guardas ✓ | idem | idem | ✗ | read ✓; única escritura de carteras/delete | ✗ |
| `usuarios/{id}` (~l.1306) | get propio ✓ | get ✓ (isStaff preexistente: cualquier no-inquilino lee fichas) | ✓ idem | ✓ idem | list ✓ | ✗ |

Notas de la matriz (comportamiento REAL, no deseado):
- `audit_logs`: `create: if isSignedIn()` (cualquier autenticado puede
  añadir entradas); append-only: `update, delete: if false`; `read` SOLO
  master.
- El perfil `ADMINISTRADOR` NO lee `propietarios` ni `polizas` (sólo master);
  sí entra por `esAdminInmuebles()` en inmuebles/gestiones/registros.
- Los gestores NO leen `gastos` (bloque FASE 2.0: «Los profesionales no
  tienen ninguna regla permitida»). El expediente documental de B3 no cambió
  esto (ver `tests/seguridad-expediente.test.ts` E3).

Helpers canónicos que C DEBE reutilizar (nunca reimplementar):
`isSignedIn`, `authEmail`, `isMasterAdmin`, `me`, `activeUser`,
`isPropietarioRole`, `isProfesionalRole`, `myPropId`, `myProfId`,
`myInmuebleIds`, `ownsPropietario`, `canReachInmuebleId`, `esAdminInmuebles`,
`inmuebleEsMio`, `inmuebleAutorizadoExplicito`, `carterasLectura`,
`carterasEscritura`, `inmuebleEnCarteraGestionada`,
`inmuebleEnCarteraEscritura`, `gestionInvolucraAMi`,
`carterasNoAutoasignadasEnCreacion`, `carterasSinCambiarPorUsuario`,
`contratoEsMio`, `contratoVisible`, `gastoEsMio`, `gastoVisible`,
`aisladoEsMio`, `aisladoVisible`, `aisladoCreateOk`, `aisladoUpdateOk`,
`indexIsTruthful`. Patrón para colecciones nuevas de C: el patrón
`aislado*`/carteras usado en `polizas_seguros` (titular + L lectura + E
escritura acotada + master).

Harness de validación: `tests/harness/firestoreRulesEval.ts` (evalúa el
TEXTO REAL de `firestore.rules`, fail-loud). Toda regla nueva de C lleva sus
casos (titular/otro propietario/gestor L/gestor E/admin/anónimo/revocado…)
en una suite `tests/seguridad-firestore-*.test.ts`.

## G. AUDITORÍA — contrato de `audit_logs`

- **Colección**: `audit_logs/{auditId}` — única. NO existe (ni se creará)
  `audit_logs_fiscal`, `historico_documentos` ni equivalente paralelo.
- **Documento** (`AuditLog` en `src/types.ts` ~l.1832):
  `id`, `usuarioId` (actor), `usuarioEmail`, `usuarioNombre`, `accion`
  (string, convención `SUJETO_VERBO_OBJETO`, p.ej. `EXPEDIENTE_EXPORTACION`),
  `descripcion`, `fechaHora` (ISO, la estampa la función), `entidadAfectada`
  (unión cerrada: `usuario | profesional | inmueble | enlace | rol | modulo |
  especialidad | contrato | incidencia | suministro | mensaje | propietario |
  importacion_patrimonial | poliza_seguro | documento_expediente |
  expediente_fiscal`), `idAfectado`, `resultado` (`EXITO|ERROR`),
  `detalles?` (mapa libre: antes/después, origen, metadatos — los eventos de
  `gestiones_cartera` usan formato compatible con `detalles`).
- **Función canónica**: `registrarAuditoriaFirestore(log)` en
  `src/lib/firebase.ts` (alias `saveAuditLogFirestore`). Genera `id`
  (`audit_{ts}_{rand}`) y `fechaHora` si no se aportan, sanea con
  `sanitizeObjectForFirestore` y hace `setDoc` (sin merge). 10 ficheros la
  consumen ya (admin, usuarios, patrimonial, seguros, expediente B3…).
- **Comportamiento ante fallo**: try/catch → `console.warn`; NO bloquea la
  operación de negocio (best-effort en cliente). C debe conocerlo: la
  garantía dura de integridad la dan las reglas (append-only), no la función.
- **Quién escribe**: cualquier usuario autenticado (`allow create: if
  isSignedIn()`), siempre sobre su propia actuación como actor.
- **Quién lee**: SOLO master (`allow read: if isMasterAdmin()`). Nadie más,
  nunca en UI de propietario/gestor.
- **Append-only**: `allow update, delete: if false` (nadie, ni master, por
  reglas). Tripwires de test: `tests/baja-usuarios.test.ts` («auditoría
  append-only: sin update ni delete») y
  `tests/seguridad-firestore-patrimonial.test.ts`.
- **Acciones de gestión de carteras**: los `EventoGestionCartera` (sección C)
  se registran con el mismo mecanismo (formato compatible con `detalles`).

## H. HISTORIAL — qué permanece tras cesión/revocación

- **Eventos**: append-only, nunca se modifican ni eliminan (invariante de
  dominio + reglas de `gestiones_cartera` donde sólo el master escribe).
- **CESION** (`ACTIVA`, evento CESION): `responsableActual → TITULAR`; la
  gestión SIGUE ACTIVA. Efecto en carteras: el gestor SALE de `carterasE`
  (ya no es responsable) y permanece en `carterasL` mientras esté ACTIVA
  (proyección `puedeEscribir` exige `responsableActual == 'GESTOR'`).
- **DEVOLUCION** (`ACTIVA`, evento DEVOLUCION): `responsableActual → GESTOR`
  (vuelve a operar); con `LECTURA_ESCRITURA` reentra en `carterasE`.
- **SUSPENSION**: sin acceso operativo (sale de L y E) hasta REACTIVACION.
- **REVOCACION** (terminal):
  - con `conservarLecturaHistorica=true` → el gestor permanece en
    `carterasL` (lectura histórica S7);
  - sin conservación → sale de todo.
  - Nunca reactivable; el histórico de eventos permanece intacto.
- Los RECURSOS (inmuebles, documentos, auditoría, importaciones) no se
  borran ni se reasignan: la revocación cambia ACCESO, no datos.

## I. REGLAS DE INTEGRACIÓN PARA ARENA C

Obligatorias e innegociables (derivan de S1–S7, D1R, D2a/D2b/D3 y del marco
multi-Arena):

1. C **NO** puede crear otra ACL ni otro mecanismo de autorización: sólo
   `firestore.rules` + espejo `usuarios_auth/{uid}` + helpers de F.
2. C **NO** puede crear otra colección de usuarios/roles ni otro modelo de
   perfiles: `usuarios` + `usuarios_auth` + `propietarios` son los únicos.
3. C **NO** puede crear otro `audit_logs`: toda operación de C se registra
   con `registrarAuditoriaFirestore` (ampliando `entidadAfectada`/`accion`
   si hace falta, por el cauce tipado existente).
4. C **NO** puede autorizar por la mera existencia de login: `isSignedIn()`
   no concede nada patrimonial; hace falta relación demostrable (titularidad,
   `inmuebleIds`, carteras, admin).
5. C **NO** puede asumir que `UsuarioApp`/`UserProfile` equivale a
   autorización patrimonial: `roles[]`/`permisos[]` no autorizan en reglas.
6. C **DEBE** comprobar el contexto patrimonial mediante este contrato:
   `propietarioId` del recurso vs `myPropId()` (titular) o
   `carterasLectura()/carterasEscritura()` (gestor).
7. C **DEBE** reutilizar la auditoría canónica (G) y el harness
   `tests/harness/firestoreRulesEval.ts` con casos fail-loud por regla nueva
   (titular / otro propietario / gestor L / gestor E / admin / anónimo /
   revocado / suspendido / pendiente).
8. C **DEBE** mantener aislamiento por propietario/cartera: sin lecturas
   globales, sin `isStaff()` como bypass en bloques nuevos, `list` siempre
   demostrable con `where('propietarioId','==', …)`.
9. C **NO** debe modificar el modelo de titularidad: nada en C altera
   `propietarios/{id}`, `propietarioId`/`propietarioPrincipalId` de recursos,
   ni la máquina de estados de `gestiones_cartera`.
10. Sin `firebase-admin`, sin custom claims simulados, sin escrituras reales
    no justificadas, sin TTL sobre histórico/auditoría/procedencia.

## J. DISCREPANCIAS — PENDIENTE_DE_RESOLUCION

Inspección del 2026-09-26 (código + reglas + tests + docs D1R/MAPA):

- **No se encontró ninguna contradicción** entre documentación, código,
  reglas y tests en el contrato aquí extraído (S1–S7, D2a/D2b/D3 y auditoría
  son consistentes en `src/lib/gestionesCartera.ts`,
  `src/lib/carterasGestion.ts`, `firestore.rules`, `src/types.ts` y las
  suites citadas en K).
- Aclaraciones que NO son discrepancias (comportamiento real, registrado
  para evitar malentendidos en C):
  1. `audit_logs.create` permite a cualquier autenticado (diseño
     append-only existente; la lectura sigue siendo sólo master).
  2. `usuarios/{id}.get` usa `isStaff()` (preexistente de BLOQUE E):
     cualquier cuenta no-inquilino puede leer fichas de usuario. No es un
     bypass patrimonial y C no lo extiende.
  3. El perfil `ADMINISTRADOR` no accede a `propietarios`/`polizas` (sólo
     master): asimetría real documentada en la matriz F.

## K. TESTS QUE RESPALDAN ESTE CONTRATO

| Contrato | Suite real |
|---|---|
| Identidad UID→usuario→propietario, espejo, login | `tests/acceso-propietarios.test.ts` (11), `tests/fase14-espejo-identidad.test.ts`, `tests/login-admin-principal.test.ts`, `tests/login-unico.test.ts` |
| Dominio `gestiones_cartera` (estados, eventos append-only, REVOCADA terminal, S4/S7) | `src/lib/gestionesCartera.test.ts` (16) |
| Proyección `carterasL`/`carterasE` (incl. REVOCADA+conservar, SUSPENDIDA) | `src/lib/carterasGestion.test.ts` (10) |
| Reglas: gestor sólo sus carteras, titular, admin, anti-autoasignación, gestiones_cartera | `tests/seguridad-firestore-carteras.test.ts` (18; describe D2b·A/B, D3·C, D2b·D) |
| Inmuebles D2a (sin isStaff global, explícitos, tenant) | `tests/seguridad-firestore-inmuebles.test.ts` |
| Registros patrimoniales + auditoría append-only | `tests/seguridad-firestore-patrimonial.test.ts` |
| Pólizas/siniestros (titular + carteras) | `tests/seguridad-firestore-polizas.test.ts` |
| Gastos aislados (gestor sin acceso) + invariantes de reglas/Storage | `tests/seguridad-expediente.test.ts` (7; E1–E4, I1–I3) |
| Auditoría append-only (tripwire) | `tests/baja-usuarios.test.ts` |
| Admin/usuarios | `tests/admin-usuarios.test.ts` |

Estado de validación en la base de este documento: suite completa
**1747/1747** (77 ficheros) en `a9ef729`, `tsc --noEmit` 0 errores,
`vite build` OK.
