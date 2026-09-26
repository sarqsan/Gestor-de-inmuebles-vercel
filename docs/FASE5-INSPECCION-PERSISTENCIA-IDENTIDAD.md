# FASE 5 — PRE-B4: INSPECCIÓN DE PERSISTENCIA E IDENTIDAD (sin escrituras)

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **Naturaleza:** SOLO inspección + documentación. **0 escrituras Firestore/Storage, 0 reglas modificadas, 0 importaciones.**

**Nota de estado:** reset 6 del sandbox detectado en la inspección inicial (commits FASE 2/3/4 perdidos y restaurados como `e60be60`/`e06f331`/`7c03ee5`; ficheros intactos en disco, verificados).

---

## 5.1 — MODELO ACTUAL (verificado línea a línea en el código)

### A) Persona que inicia sesión
Firebase Auth (email/contraseña) → UID → perfil autoritativo **`usuarios/{id}`** (`UsuarioApp`: `tipoPerfil: 'ADMINISTRADOR'|'PROPIETARIO'|'PROFESIONAL'|'INQUILINO'`, `roles[]`, `permisos[]`, `inmuebleIds[]?`, `contratoIds[]?`, **`propietarioId?`**, `profesionalId?`).
Existe un **espejo de identidad no falsificable `usuarios_auth/{uid}`**: sus reglas (`firestore.rules` L265-283) exigen `indexIsTruthful()` —cada campo sensible debe coincidir con `usuarios/{usuarioId}` vía `get()` de ruta fija— y solo el master admin (email verificado `sarqsan2@gmail.com`, L29-31) puede alterar perfiles ajenos. El alta autónoma NO puede auto-asignar roles `SUPERADMIN/ADMINISTRADOR/GESTOR_INMUEBLES` (L1090-1092).

### B) Propietario legal
**`propietarios/{propietarioId}`** (`Propietario`: `nombre`, `nifCif`, `tipoPropietario`, cuentas bancarias, representante legal…). Reglas L412-429: cada propietario solo `get` de SU ficha; `list` solo master; `create/update` solo su ficha con id coincidente.

### C) Relación formal cuenta ↔ titular
**Sí existe, 1:1:** `UsuarioApp.propietarioId → propietarios/{id}`. Alta nominal por invitación de un solo uso (`src/lib/accesoPropietarios.ts`: admin crea usuario PENDIENTE vinculado a `propietarioId` → invitación nominal → el propietario crea su Auth → ficha ACTIVO + UID vinculado; "NUNCA se duplica usuario ni propietario"). Adicional: `inmuebleIds[]` = asignación explícita de inmuebles compartidos (no titularidad).

### D) Quién puede leer/escribir un inmueble (`firestore.rules` L444-467)
- `get`: `isStaff()` **o** inquilino vinculado (contrato activo / índice autorizado).
- `list`: `isStaff()`.
- `create`: master, o propietario con `incoming().propietarioId == myPropId()` (o `propietarioPrincipalId`).
- `update`: master, o titular (`existing().propietarioId/propietarioPrincipalId == myPropId()`), o inmueble asignado (`canReachInmuebleId`).
- `delete`: solo master.
- **⚠ HALLAZGO F5-1:** `isStaff() = isSignedIn() && !isTenant()` (L344-346). Es decir, **cualquier cuenta autenticada que no sea INQUILINO puede `get` Y `list` CUALQUIER inmueble por ID**, incluidos datos patrimoniales de otro propietario (IBAN/NIF/notas según el comentario R3 de las propias reglas). El aislamiento entre propietarios en `inmuebles` depende hoy del filtrado UI, NO del servidor. (En gastos/contratos/propietarios el aislamiento por servidor SÍ existe.)

### E) Quién puede leer/escribir un gasto (L542-566)
- `get`: master o propietario con `gastoVisible` (`propietarioId == myPropId()` o inmueble en `myInmuebleIds()`).
- `list`: **obliga** a `where('propietarioId','==',miPropId)` (regla `gastoEsMio` sobre `resource.data`).
- `create`: propietario con `incoming().propietarioId == myPropId()`.
- `update`: exige `existing().propietarioId == myPropId()` **Y** `incoming().propietarioId == myPropId()` → **no se puede re-asignar un gasto a otro propietario desde el cliente**.
- Profesionales: sin reglas (deny). Aislamiento por servidor correcto.

### F) Protección del acceso directo por ID/URL
- **Firestore:** `propietarios` get solo propio ✓ · `gastos`/`contratos_formalizacion` get solo titular/asignado ✓ · `usuarios` get: **cualquier staff lee cualquier ficha** (emails de otros propietarios visibles entre sí — hallazgo menor F5-2) · `inmuebles`: ver F5-1 ✗ · datos públicos solo vía espejo mínimo `fichas_publicas_inmueble` con lista blanca cerrada de claves (`clavesFichaPublicaOk`) ✓ · `audit_logs`: read solo master, create cualquier autenticado, update/delete imposibles ✓.
- **Storage:** `get = internalUser()` (cualquier autenticado, incluidos inquilinos) y `list` solo master → sin enumeración, pero **cualquier cuenta autenticada que conozca la ruta puede descargar el comprobante de otro propietario** (residuales R-1/R-2 declarados por las propias reglas; sin custom claims no hay aislamiento por `{propietarioId}` en Storage). Subidas: tamaño ≤12MB, PDF/imagen, `hasSafeObjectName()`, `update` cerrado ✓.

### G) Cambios necesarios para "varios propietarios gestionados por un mismo gestor"
Hoy **NO existe el perfil GESTOR** (`TipoPerfilUsuario` = ADMINISTRADOR/PROPIETARIO/PROFESIONAL/INQUILINO); solo el string de rol `GESTOR_INMUEBLES` (bloqueado en auto-alta) y el parche `inmuebleIds[]` (que da `update`/`get` suelto, sin lectura de gastos/contratos del gestionado y sin semántica de cesión). Se necesitaría (DISEÑO, no decisión tomada):
1. Entidad de relación **gestión/cartera** (p.ej. `gestiones_cartera/{id}`: gestorId, propietarioId, inmuebleIds[], permisos `LECTURA|LECTURA_ESCRITURA`, estado `CESION_ACTIVA|DEVUELTA|REVOCADA`, fechas, auditoría de cesión/devolución).
2. Extender el espejo `usuarios_auth` (o custom claims) para que las reglas puedan evaluar la cartera sin `get()` encadenados costosos.
3. Reglas: predicados `gestionaCartera(propietarioId)` reutilizables en gastos/contratos/inmuebles/documentos.
4. Cliente: `canAccessInmueble/canAccessContrato` con ámbito gestor + UI de cesión/devolución/revocación.
5. Auditoría específica de cesión/devolución (ver 5.5).

---

## 5.2 — MATRIZ DE ACCESO (documental; "hoy" = verificado en reglas, "objetivo" = propuesta NO implementada)

| # | Actor → Ámbito | Lectura | Escritura | Descarga docs | Modificación | Auditoría | Condición de acceso |
|---|---|---|---|---|---|---|---|
| 1 | Gestor → cartera propia | SÍ (hoy: como PROPIETARIO titular) | SÍ | SÍ (vía referencia Firestore) | SÍ (sin cambiar propietarioId) | audit_logs (create) | `propietarioId == myPropId()` (servidor) |
| 2 | Gestor → cartera de propietario gestionado | **NO EXISTE HOY** (F5-1 lo permite de facto SOLO para inmuebles, no para gastos/contratos) | NO | NO | NO | — | Objetivo: `gestiones_cartera` activa + permiso del ámbito |
| 3 | Propietario → sus inmuebles | SÍ | SÍ | SÍ | SÍ | SÍ | titularidad o `inmuebleIds` |
| 4 | Propietario → inmuebles de otro | **Servidor: PERMITIDO (F5-1, get/list isStaff)** · UI: filtrado | NO (create/update exigen titularidad) | — | NO | — | **ENDURECER** (decisión de usuario, ver 5.7-B5) |
| 5 | Propietario → gastos de otro | DENEGADO (servidor ✓) | DENEGADO ✓ | — | DENEGADO ✓ | — | `gastoEsMio/gastoVisible` |
| 6 | Propietario → documentos de otro | **Storage: PERMITIDO si conoce la ruta (R-1/R-2)** · referencias Firestore: aisladas | — | **Riesgo** | — | — | Custom claims o validación Firestore-en-regla (decisión pendiente) |
| 7 | Propietario lectura (perfil solo-lectura) | NO EXISTE como permiso formal (`permisos[]` existe en UsuarioApp pero sin semántica L/LE verificada en reglas) | — | — | — | — | Objetivo: campo de permiso por cartera |
| 8 | Propietario lectura-escritura | = caso 1 hoy | SÍ | SÍ | SÍ | SÍ | Idem |
| 9 | Cesión de gestión | NO EXISTE | — | — | — | Debe auditarse (5.5) | Objetivo: `gestiones_cartera.estado=CESION_ACTIVA` |
| 10 | Devolución de gestión | NO EXISTE | — | — | — | Debe auditarse | Objetivo: `estado=DEVUELTA` + fin de permisos |
| 11 | Revocación | NO EXISTE | — | — | — | Debe auditarse | Objetivo: `estado=REVOCADA` (inmediata) |
| 12 | Cambio de permisos (L ↔ L/E) | NO EXISTE | — | — | — | Debe auditarse | Objetivo: solo master/gestor de la cuenta, con historial |

Casos 2 y 7-12 dependen del modelo Cuenta/Titular/Gestor → **decisión de negocio pendiente; NO se implementa nada en FASE 5.**

---

## 5.3 — IMPACTO SOBRE B4 (qué necesita la importación real)

| Entidad a importar | Requisito de identidad hoy (reglas) | Estado para B4 |
|---|---|---|
| Propietarios | `propietarios/{id}` create: master o propietario con id==myPropId | B4 exigiría identidad master-admin (o `firebase-admin`, que **bypasea reglas** → el importador debería auto-aplicar el mismo aislamiento; requisito a diseñar en B4) |
| Inmuebles | create exige `propietarioId`/`propietarioPrincipalId` == myPropId | **Bloqueado**: sin propietarioId destino no hay escritura legítima |
| Gastos | create exige `propietarioId == myPropId()` + `inmuebleId` | **Bloqueado**: idem; además `aCargoDe/estado/deducible` siguen en validación (FASE 2 G-13) |
| Documentos | Storage create `internalUser()` + restricciones de ruta | Pendiente B5 (binarios además NO disponibles, reset 3) |
| Cobros | Embebidos en contrato (`registroCobros`) | Bloqueado hasta existir contrato destino (FASE 3 §J) |
| Contratos | Decenas de campos sin fuente (FASE 2 I-13) | C: completado humano |

**`propietarioId` — opciones analizadas (NO se elige; depende del modelo Cuenta/Titular/Gestor):**
- **(a) Pendiente en B4:** imposible para escritura directa: las reglas de `gastos`/`inmuebles` exigen `propietarioId` en create. Solo viable con staging (ver 5.4-B/C).
- **(b) Staging:** los registros entran sin propietarioId definitivo y se promueven al asignarse (ver 5.4).
- **(c) Asignación previa:** el usuario confirma el mapa `owner externo → Propietario ERP` antes de importar (requiere decidir antes cómo se crean/vinculan propietarios y cuentas).
La elección está **bloqueada** por la decisión de negocio Cuenta/Titular/Gestor (regla 9 y 5.7-B1).

## 5.4 — STAGING vs ESCRITURA DIRECTA

| Criterio | A) Directo a definitivas | B) Todo a staging | C) Híbrido (staging ambiguos + directo inequívocos) |
|---|---|---|---|
| Ventajas | Simple; datos visibles ya | Aislamiento total; 0 riesgo productivo; propietarioId puede quedar pendiente; preview == staging | Equilibrio: lo inequívoco avanza, lo dudoso no contamina |
| Riesgos | Reglas exigen propietarioId YA; errores visibles en productivo; marcha atrás = borrado (peor auditoría) | Doble modelo (staging↔definitivo); hay que construir promoción + reglas nuevas; los datos no son útiles hasta promover | Dos caminos que testear; criterio "inequívoco" debe ser conservador y auditado |
| Trazabilidad | lote+procedencia en cada doc | lote+procedencia en staging + acta de promoción | ambas, por rama |
| Idempotencia | ids deterministas (ya diseñados) | ídem + promoción idempotente por claveOrigen | ídem por rama |
| Encaje con reglas actuales | Exige identidad master/admin o firebase-admin | Exige colección nueva + reglas nuevas (cambio en firestore.rules → autorización explícita) | Ídem B para la parte staging |

**Recomendación técnica (no vinculante):** B o C — B4 NO debería escribir en colecciones definitivas mientras `propietarioId` sea una decisión abierta. **No se implementa ninguna opción en FASE 5.**

## 5.5 — AUDITORÍA

**Capacidad actual (verificada):** `audit_logs` append-only (create cualquier autenticado; update/delete `false`; read solo master) + `registrarAuditoriaFirestore()` (id `audit_{ts}_{rand}`, `AuditLog{usuarioId,usuarioEmail,usuarioNombre,accion,descripcion,fechaHora,entidadAfectada,idAfectado,resultado,detalles?}`).

**Brechas para B4 (propuesta, NO implementada):**
1. `entidadAfectada` no incluye `'gasto'|'cobro'|'importacion'|'lote'|'gestion'` (unión TS cliente; las reglas no validan contenido).
2. Id no determinista → propone `audit_{loteSha256}_{seq}` para idempotencia de reimportación.
3. Campos de B4 caben hoy en `detalles` (Record libre): `{loteId, loteSha256, sistemaOrigen, origenId, entidad, idCreado, operacion, propietarioIdAfectado, gestorId?, resultado, incidencias[]}` — **no hace falta cambiar reglas** para empezar; la extensión formal del tipo queda como propuesta.
4. Cesión/devolución de gestión: eventos `GESTION_CEDIDA/DEVUELTA/REVOCADA/PERMISO_MODIFICADO` con actor y ámbito (depende del modelo, pendiente).

## 5.6 — SEGURIDAD (conclusión de la inspección)

- **Aislamiento por propietario:** gastos ✓, contratos ✓, propietarios ✓, cobros (vía contrato) ✓ — por SERVIDOR. **Inmuebles ✗ (F5-1)**: get/list abiertos a todo no-inquilino; el aislamiento real depende del filtro React → **no cumple el requisito "no confiar en filtros de React"**.
- **Manipulación de `propietarioId` desde el frontend:** en gastos/contratos el update exige coincidencia existing+incoming con `myPropId()` ✓ (no se puede re-asignar). En inmuebles create exige titularidad ✓. El espejo `usuarios_auth` impide auto-escalar rol/propietarioId ✓.
- **Storage:** residual R-1/R-2 (get por cualquier autenticado que conozca la ruta; sin claims no hay aislamiento por propietario) — declarado por las propias reglas; relevante para B5 (documentos importados).
- **audit_logs create sin validación de contenido:** aceptable (append-only, read master) pero exige servidor/importador honestos.
- **Modo "directo" sin Auth** (mencionado en la cabecera de las reglas): fuera de Auth no hay garantías; el importador debe operar SIEMPRE autenticado o vía admin SDK con aislamiento auto-aplicado.

## 5.7 — DECISIÓN DE BLOQUEO (B4 NO autorizado automáticamente)

**A. RESUELTO Y LISTO PARA IMPLEMENTAR**
- Normalización/dedup/preview B0-B3 (17 tests) con ids deterministas y procedencia.
- Auditoría de lote vía `detalles` (sin tocar reglas).
- Importador operando con identidad master-admin o `firebase-admin` con aislamiento auto-aplicado (requisito documentado).

**B. REQUIERE DECISIÓN DEL USUARIO**
1. **Modelo Cuenta de acceso / Titular / Gestor** (perfil GESTOR, entidad de cartera, permisos L/LE, cesión/devolución/revocación) → **`propietarioId` de la importación permanece BLOQUEADO hasta esta decisión** (regla explícita de FASE 5).
2. Estrategia staging (A/B/C de 5.4).
3. Endurecer `inmuebles` get/list (F5-1): ¿se restringe a titular/asignado/master? (cambio de reglas → autorización explícita).
4. Aislamiento Storage por propietario (custom claims vs regla con get a Firestore) — afecta a B5.
5. Fichero canónico A/B (INC-06) — sigue bloqueando cualquier importación real.

**C. RIESGO / BLOQUEO TÉCNICO**
- Resets del sandbox (6 confirmados): sin push, los commits son volátiles; recomendación: autorizar push a la rama o custodiar los ficheros fuera.
- `firebase-admin` no está en dependencias (necesario para CLI de importación con aislamiento auto-aplicado).
- Índices compuestos nuevos pendientes de declarar (FASE 3 §I) antes de consultas de exportación.

---

## Verificación final de FASE 5
- Firestore: **0 escrituras** · Storage: **0 escrituras** · datos existentes: **0 modificaciones**.
- `firestore.rules` / `storage.rules` / `firestore.indexes.json`: **sin cambios** (diff vacío verificado).
- Pruebas: suite B0-B3 (17 tests) + lint (`tsc --noEmit`) + build — resultados en el informe de chat.
- Este documento es el único artefacto nuevo; commit de FASE 5, **sin push**.
