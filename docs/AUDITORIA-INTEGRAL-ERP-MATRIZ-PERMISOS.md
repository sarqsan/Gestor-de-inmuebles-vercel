# AUDITORÍA INTEGRAL — MATRIZ DE PERMISOS EFECTIVA

**SHA:** `2563831df9b026dec8276c45db40977f72883f9d`
**Fuentes de autoridad (en este orden):** `firestore.rules` (4.069 L, 84 bloques `match`) · `storage.rules` (denegación total salvo foto pública) · servidor (`server.ts` + `server/**`, verificación de ID token y de perfil) · `src/App.tsx` (*route guard*, **solo UX**).

> **Advertencia de método:** la matriz describe el comportamiento **del código**, no el de producción. No se ha podido comparar con las reglas publicadas (V-1). Las comprobaciones con el motor real de Firestore no se han ejecutado en esta máquina; se apoyan en la CI del mismo árbol (emuladores oficiales, run `39500652329`, verde) y en el harness de reglas del repositorio.

---

## 1. Perfiles reales y cómo se identifican

| Perfil | Predicado en reglas | Se identifica por | ¿Puede crear cuentas? |
|---|---|---|---|
| **Master** | `isMasterAdmin()` → `request.auth.token.email == 'sarqsan2@gmail.com'` (`firestore.rules:28-30`) | Email verificado por Firebase | Sí, y es el único que escribe `usuarios_auth`, `carterasL/E` y la auditoría obligatoria |
| **Administrador** | `esAdminInmuebles()` → `usuarios/{auth.uid}.tipoPerfil == 'ADMINISTRADOR'` + `ACTIVO` + `authUid` coincidente (`:213-217`) | Perfil autoritativo (solo el master puede escribirlo) | No |
| **Staff** | `isStaff()` → master **o** (espejo veraz **y** (`ADMINISTRADOR` **o** `PROFESIONAL` con ficha `profesionales/{profesionalId}` existente)) (`:546-553`) | Espejo `usuarios_auth` + ficha de profesional | Indirectamente (enlaces de registro, ver §5) |
| **Propietario / titular** | `isPropietarioRole()` → espejo `tipoPerfil == 'PROPIETARIO'`; `myPropId()` = `usuarios_auth.propietarioId` | Espejo con `propietarioId` | No |
| **Gestor de cartera** | Es un `PROFESIONAL` con `carterasL`/`carterasE` en el espejo (solo el master las escribe) | Espejo | No |
| **Profesional (contratista)** | `isProfesionalRole()` con `myProfId()` | Espejo + ficha | No |
| **Inquilino** | `isTenant()` → espejo/`usuarios` con `tipoPerfil == 'INQUILINO'` + `contratoIds` (1–5) | Espejo y perfil | No (nace de invitación) |
| **Anónimo con token** | El servidor resuelve el token en la base con nombre | Token de capacidad | No |
| **Anónimo** | Sin `request.auth` | — | Solo alta pública mínima de `solicitudes`/`candidatos` y foto pública |

**Consecuencia crítica que se documenta en A-20:** `isStaff()` **no distingue** entre administrador interno, gestor de cartera y profesional contratista. Un fontanero con ficha es «staff». **Reproducido con el harness de reglas (E2):** con espejo veraz + ficha `profesionales/prof_1`, un PROFESIONAL obtuvo `list`, `get` y `delete` sobre un candidato de la cartera `prop_A`, `list`/`delete` sobre una solicitud ajena y `list` sobre un aviso de otro propietario.

---

## 2. Acceso a pantallas (interfaz)

Fuente: `src/App.tsx:352-383` (`SECCIONES_PROPIETARIO`, `SECCIONES_PROFESIONAL`) y `:698-717` (guard).

| Sección | Master | Admin | Gestor (PROFESIONAL + GESTOR_PATRIMONIAL) | Profesional | Propietario | Inquilino |
|---|---|---|---|---|---|---|
| `dashboard`, `inicio` | ✔ | ✔ | ✔ | ✔ | ✔ | portal |
| `avisos` | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| `administracion` | ✔ | ✔ | ✔ (renderiza solo si ADMINISTRADOR) | ✔ (idem) | ✘ | ✘ |
| `inmuebles` | ✔ | ✔ | ✔ | ✔ | ✔ | portal |
| `propietarios`, `titulares` | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| `datos`, `inversion`, `configuracion`, `ayuda` | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| `formalizacion`, `cobros` | ✔ | ✔ | ✔ | ✘ | ✔ | portal (recibos) |
| `tesoreria`, `gastos`, `financiacion`, `conciliacion`, `facturacion`, `fiscal`, `informes`, `polizas`, `actas`, `incidencias`, `operaciones`, `recomercializacion`, `suministros` | ✔ | ✔ | ✘ | ✘ | ✔ | ✘ |
| `morosidad`, `inquilinos` | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ (solo lectura de su cobro) |
| `candidatos`, `solicitudes`, `preseleccionados`, `seguro_impago`, `analisis` | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ |
| `incidencias` (portal), `mensajes`, `documentos`, `contrato` | — | — | — | — | — | ✔ |

**Importante:** la ocultación es **solo de interfaz**. Las secciones 100 % ADMIN (`morosidad`, `inquilinos`) se protegen con `currentUser.tipoPerfil === 'ADMINISTRADOR'` en el render; el resto depende de las reglas. Se comprobó que las reglas no conceden al propietario nada que el guard le oculte salvo lo indicado en §4.

---

## 3. Qué datos puede leer cada perfil (por colección)

| Colección | Master | Admin | Profesional (**staff**) | Gestor (carteras) | Propietario | Inquilino | Anónimo |
|---|---|---|---|---|---|---|---|
| `inmuebles` | todo | todo (`esAdminInmuebles`) | solo `inmuebleIds` del espejo | L/E por cartera | propios + `titularesIds` | el de su contrato | ✘ |
| `propietarios` | todo | todo | ✘ | por cartera | su ficha | ✘ | ✘ |
| `contratos_formalizacion` | todo | todo (`inmuebleEnCarteraGestionada` evalúa carteras) | solo los de su ámbito/cartera | L/E por cartera | propios | `get` de los suyos | ✘ |
| `gastos`, `gastos_recurrentes` | todo | por cartera/propietario | ✘ | L/E | propios | ✘ | ✘ |
| **`candidatos`** | todo | todo | **TODO (A-20)** | **TODO (A-20)** | por `propietarioId` (consulta filtrada) | ✘ | ✘ (get solo por regla de ámbito) |
| **`solicitudes`** | todo | todo | **TODO (A-20)** | **TODO (A-20)** | ✘ (regla: `list` solo staff) | ✘ | ✘ |
| **`invitaciones`, `slots_visita`, `solicitudes_documentacion`** | todo | todo | **TODO (A-20)** | **TODO (A-20)** | por cartera | ✘ | ✘ |
| `profesionales` | todo | todo | **todo el catálogo (A-20)** | todo | públicos + propios | ✘ | ✘ |
| **`notificaciones`** (bandeja) | todo | todo | **TODO (`list: isStaff()`)** | **TODO** | las suyas | ✘ | ✘ |
| `enlaces_registro` | todo | gestión | **genéricos (A-20)** | **genéricos** | consume el suyo | consume el suyo | `get` del genérico activo |
| `audit_logs` | todo | lectura | ✘ | ✘ | ✘ | ✘ | ✘ |
| `usuarios` | todo | `get`/`list` solo master | `get` propio | `get` propio | `get` propio | `get` propio | ✘ |
| `titularidades`, `personas` | todo | por cartera | ✘ | por cartera | propias | ✘ | ✘ |
| `polizas_seguros`, `siniestros`, `suministros`, `actas` | todo | por cartera | ✘ (salvo ramas de ámbito) | por cartera | propios | los de su contrato | ✘ |
| `justificantes_cobro` | servidor | servidor | servidor (autorizado por ámbito) | servidor | servidor | servidor | ✘ |
| `fichas_publicas_inmueble` / foto | todo | todo | lectura | lectura | lectura | lectura | **lectura pública** |

---

## 4. Las diez comprobaciones exigidas, por perfil

### 4.1 Administrador principal (master)

1. **Páginas:** todas.
2. **Datos:** todas las colecciones (incluidas las que solo él puede escribir).
3. **Crear/modificar/anular/eliminar:** todo; único que puede escribir `usuarios_auth`, `carterasL/E`, y el único cuyas escrituras exigen `auditoriaVinculada`/`auditoriaNueva`.
4. **Documentos:** todo (la autorización documental del servidor incluye la rama master por identidad verificada).
5. **Confirmaciones:** las operaciones de riesgo (baja de usuario, transmisión de titularidad) piden confirmación en la UI; **no** hay confirmación de servidor adicional.
6. **Prohibido:** nada en las reglas.
7. **URL directa / servicio:** permitido por diseño.
8. **Cambio de usuario / logout:** `logoutUser()` limpia las 11 claves de `localStorage` y hace `signOut`.
9. **Controles en servidor y reglas:** sí (es la identidad de referencia).
10. **Otras carteras:** acceso total por diseño.

### 4.2 Administrador

1. Páginas: todas.
2. Datos: lectura amplia por `esAdminInmuebles()` y por `isStaff()` (incluye `candidatos`, `solicitudes`, `notificaciones`).
3. Escritura: **no** puede escribir `usuarios` ajenos (solo el master) ni `usuarios_auth`; **no** puede cambiar roles ni `propietarioId`.
4. Documentos: rama administrativa del servidor.
5. Confirmaciones: igual que master.
6. Prohibido: crear cuentas, elevar roles, escribir carteras, borrar inmuebles/contratos con titulares (`allow delete: if isMasterAdmin()` en inmuebles).
7. URL directa: permitido según reglas.
8. Logout: limpia caché.
9. Controles: sí, en reglas y servidor.
10. Otras carteras: acceso de administración (por diseño).

### 4.3 Gestor de cartera (PROFESIONAL + `carterasL/E`)

1. Páginas: `administracion`, `inmuebles`, `inversion`, `configuracion`, `ayuda`, `avisos` + `formalizacion` y `cobros` si `GESTOR_PATRIMONIAL`. (La sección `administracion` no renderiza para él: exige `tipoPerfil === 'ADMINISTRADOR'`.)
2. Datos: **de su cartera** (L) y **escritura en carteras E** (`inmuebleEnCarteraEscritura`, `carterasEscritura`); *pero* por `isStaff()` recibe además `candidatos`, `solicitudes`, `invitaciones`, `slots`, `solicitudes_documentacion`, `notificaciones` y el catálogo de `profesionales` **de toda la instalación** (A-20).
3. Crear/modificar/anular/eliminar: inmuebles/contratos/gastos/incidencias de su cartera; **no** transmite titularidad (`propietarioCanonicoInalterado`, `titularidadInalterada`); **sí** puede borrar contratos y gastos de su cartera (`allow delete`).
4. Documentos: sube/lee en su cartera; borra solo titular/administración (según destino).
5. Confirmaciones: UI.
6. Prohibido: cambiar `propietarioId` de un inmueble/contrato; escribir `usuarios_auth`; conceder carteras.
7. URL directa / id ajeno: `get` denegado si el documento no cae en su cartera.
8. Logout: limpia caché; revocación de cartera → siguiente petición denegada (la autorización se resuelve en cada acceso).
9. Controles: sí, en reglas + servidor documental.
10. **Otras carteras: sí para `candidatos`/`solicitudes`/`notificaciones` (A-20); no para el resto.**

### 4.4 Profesional (contratista, con ficha)

1. Páginas: 6 (`administracion`, `inmuebles`, `inversion`, `configuracion`, `ayuda`, `avisos`).
2. Datos: sus `trabajos_profesionales`, sus `presupuestos_profesionales`, las `incidencias` donde `profesionalAsignadoId == myProfId()`, sus `documentos_profesionales` y su ficha. **Además, por `isStaff()`: `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `notificaciones` y todo el catálogo `profesionales` (A-20).**
3. Escritura: avance de sus trabajos/valoraciones/presupuestos; **borrado de candidatos y solicitudes ajenas (A-20)**; creación de enlaces de registro genéricos.
4. Documentos: sube a su carpeta `profesionales/{id}/documentos` (servidor).
5. Confirmaciones: UI.
6. Prohibido: ver datos económicos del propietario (gastos, contratos, cobros) — **correcto**: esas reglas no tienen rama profesional.
7. URL directa: `get` de un trabajo ajeno → denegado.
8. Logout: limpia caché.
9. Controles: sí en reglas, **pero con el exceso de A-20**.
10. **Otras carteras: sí para captación (A-20).**

### 4.5 Propietario / titular

1. Páginas: 25 (`SECCIONES_PROPIETARIO`).
2. Datos: sus inmuebles (por `propietarioId`, `propietarioPrincipalId`, `titularesIds`), contratos, cobros, gastos, fiscalidad, pólizas, suministros, actas, incidencias, operaciones de sus inmuebles.
3. Escritura: sus inmuebles (sin cambiar el canónico), sus contratos (sin mover `inmuebleId`/`propietarioId`), sus gastos, sus incidencias; **borra** sus contratos/gastos/incidencias/trabajos.
4. Documentos: sube y lee los de su cartera; borra los suyos (servidor).
5. Confirmaciones: UI (baja, transmisión, pagos).
6. Prohibido: `usuarios_auth`, roles, permisos, `carteras*`, `audit_logs`, `morosidad`, `inquilinos`, `solicitudes` (list).
7. **URL directa / id ajeno:** `get` denegado (no demostrable); `list` exige `where('propietarioId','==', myPropId())` — una consulta sin filtro se deniega.
8. Cambio de usuario/logout: limpia caché; revocación del perfil → espejo vacío → deny.
9. Controles: sí (reglas + servidor documental).
10. **Otras carteras: no** (salvo si es cotitular por `titularesIds`, que es acceso legítimo a ese inmueble).

### 4.6 Inquilino

1. Páginas: su portal (no el ERP) — `src/App.tsx:3726-3728`.
2. Datos: sus contratos (1–5), inmueble, recibos, justificantes, incidencias, mensajes, suministros, lecturas, actas de su contrato.
3. Escritura: crea incidencias propias (`origen INQUILINO`, `estado ABIERTA`), añade evidencias (listas que solo crecen), índice `incidenciaIds`/`mensajeIds` de su contrato, mensajes con `remitenteUid` propio.
4. Documentos: justificantes de cobro (servidor) y evidencias de incidencia.
5. Confirmaciones: UI.
6. Prohibido: listar cualquier colección, cambiar estado de una incidencia, marcar cobros, ver datos de otro contrato.
7. URL directa / id ajeno: `get` denegado salvo `tenantTieneContrato`.
8. Logout / expiración: cierre estándar de Firebase Auth; el portal recarga por `contratoIds`.
9. Controles: sí (reglas; `tenantContratoIds` se lee del perfil autoritativo, no del cliente).
10. Otras carteras: no.

### 4.7 Candidato y público con token

1. Páginas: `/solicitud/:token`, `/visita/:token`, `/cuestionario/:token`, `/documentacion/:token`, ficha pública.
2. Datos: **solo** el objeto del token, con lista blanca (`CAMPOS_INVITACION`, `CAMPOS_RESERVA`, etc.).
3. Escritura: reservar/cancelar su visita, guardar su cuestionario, aportar documentación — por el servidor, con precondición de versión y escritura atómica.
4. Documentos: subida directa a Storage mediante sesión reanudable abierta por el servidor (ruta `documentos_solicitados/{solicitudId}/…` validada).
5. Confirmaciones: n/a.
6. Prohibido: enumerar, listar, acceder a otro token, leer el resto del ERP.
7. URL directa con id (no token): **denegado** por `localizarPorToken`, que descarta el id si el documento ya tiene token emitido.
8. Caducidad/revocación: **NO existe** (A-04).
9. Controles: sí, en el servidor (las reglas niegan al anónimo).
10. Otras carteras: no.

---

## 5. Comprobaciones específicas solicitadas

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Separación cuenta de acceso ↔ titular jurídico ↔ gestor | **Correcta.** `usuarios_auth` solo la escribe el master; `indexIsTruthful()` obliga a igualdad con `usuarios/{usuarioId}`; el usuario no puede tocar `propietarioId`, `permisos`, `roles`, `carterasL/E`, `inmuebleIds`, `contratoIds` | `firestore.rules:403-449, 2280-2360` |
| Carteras compartidas 50 % / 100 % | **Implementadas** por `titularesIds` (acceso) + `titularidades/{inmuebleId}__{pid}` (participación). `inmuebleEsMio` reconoce al copropietario | `firestore.rules:229-243`; `tests/h10-migracion-porcentajes.test.ts` |
| Importaciones que conservan participaciones | **Sí** en el motor de importación | `src/lib/importExport/titularidadImportacion.ts`; `tests/h10-*` |
| Cambios de titularidad | **Solo master** para el canónico; el titular no puede desvincularse solo | `propietarioCanonicoInalterado`, `titularidadInalterada` |
| Gestor que intenta transmutar titularidad | Denegado (`carterasE` no altera titularidad) | `firestore.rules:1140-1180` |
| Acceso por URL directa a `usuarios`, `inmuebles`, `contratos`, `gastos` ajenos | Denegado | Reglas §11, §3, §2A, §2B |
| Escritura privilegiada del propio usuario (`tipoPerfil`, `estado`, `roles`) | Denegada (`diff().affectedKeys().hasAny([...])`) | `firestore.rules:2350-2375` |
| Token caducado / revocado | **No implementado** (A-04) | `server/portalPublico/servicioPortalPublico.ts:116-121` |
| Cambio de usuario en el mismo navegador | Caché limpiada en `logoutUser()` (11 claves) | `src/lib/authService.ts:1256-1272` |
| Fuga entre carteras | **Sí, en captación y notificaciones** (A-20) | `firestore.rules:2049-2180, 2619` |

---

## 6. Resultado de la matriz

- **Aislamiento por titularidad, cartera y contrato:** correcto en las 60+ colecciones revisadas; no se ha encontrado ninguna regla que permita a un propietario leer datos de otro propietario ni a un inquilino salir de su contrato.
- **Aislamiento por rol interno:** **incorrecto** en las colecciones de captación y notificaciones, porque `isStaff()` incluye a cualquier `PROFESIONAL` con ficha (A-20, reproducido con el harness).
- **Enlaces públicos:** correctos en autorización por capacidad, **deficientes** en ciclo de vida (sin caducidad ni revocación, A-04).
- **Interfaz vs. autoridad:** la interfaz no concede nada; el problema de A-20 es de **reglas**, no de pantallas.
