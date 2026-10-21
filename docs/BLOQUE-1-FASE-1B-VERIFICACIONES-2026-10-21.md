# BLOQUE 1 — FASE 1B: VERIFICACIONES PREVIAS A LA CORRECCIÓN

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel`
**SHA auditado:** `2563831df9b026dec8276c45db40977f72883f9d` (merge de PR #61)
**Rama:** `arena/99f27608-gestor-de-inmuebles-vercel` — HEAD al iniciar la fase: `941049c` (documentación del diagnóstico 1A)
**Fecha:** 2026-10-21
**Carácter:** solo lectura y documentación. **No se ha modificado código, reglas, configuración, dependencias, credenciales ni datos. No hay despliegues, publicaciones de reglas ni merges.**
**Continuación de:** `docs/BLOQUE-1-SEGURIDAD-DIAGNOSTICO-2026-10-21.md`

---

## 0. Resumen de la fase

| Verificación | Resultado | Clasificación |
|---|---|---|
| **V1 · Reglas publicadas** | Proyecto esperado identificado sin ambigüedad, pero **no hay credenciales ni salida de red** para leer el ruleset publicado. Se entrega procedimiento exacto y huella del fichero del repositorio para comparar. Hallazgo nuevo: **existen dos ficheros de reglas**, uno huérfano y más laxo (A-27). | **PENDIENTE DE VERIFICACIÓN** |
| **V2 · Cuentas PROFESIONAL activas** | No hay acceso a datos. **Se ha acotado mucho la exposición**: se ha reconstruido el camino completo de alta y resulta que **ninguna pantalla actual escribe `profesionalId`**; el auto-registro de profesional **es rechazado por las reglas**; el único camino realista es el master o la siembra demo en una instalación vacía. Se entrega la consulta agregada (un solo número, sin datos personales) que zanja la cuestión. | **PENDIENTE DE VERIFICACIÓN** (con alcance reducido) |
| **V3 · Enlaces heredados** | Formatos, puntos de generación y validación y condiciones de caducidad/revocación **completamente identificados** (tabla §4). La **cantidad exacta no se puede obtener** sin acceso; se entrega el procedimiento con proyección de campos (sin leer datos personales) y el criterio de clasificación. Hallazgo nuevo: la caducidad de los enlaces de registro **no se aplica al leer** (A-26). | Formatos: **CONFIRMADA EN CÓDIGO** · Cantidad: **PENDIENTE DE VERIFICACIÓN** |
| **Plan de corrección** | Entregado en §5–§7: orden por riesgo, archivos, comportamiento esperado, pruebas negativas/positivas y regresiones por perfil. | — |

**Conclusión:** la corrección de A-20 puede diseñarse ya (el defecto está probado y su alcance acotado), pero **no puede dimensionarse el impacto en producción** hasta que el propietario del proyecto ejecute dos lecturas (§2.4 y §3.4). La corrección de A-04/A-24 **sí puede diseñarse por completo**; solo la migración de enlaces heredados necesita el recuento.

---

## 1. Base de la verificación

| Comprobación | Evidencia |
|---|---|
| HEAD de la rama | `941049c` — solo documentación; `git diff 2563831 HEAD -- . ':!docs'` vacío |
| `firestore.rules` del SHA | 4.069 líneas · 246.326 bytes · 84 bloques `match` (incluidas subcolecciones) · **SHA-256 `2c67dc0019c6d89d86f45e975bfbdd7e3a74bc29758d7446152f5f55fdcddfa3`** (sin normalización: el fichero no tiene CRLF ni espacios finales) |
| `storage.rules` del SHA | 66 líneas · 3.984 bytes · **SHA-256 `631d45acb977ec3a91040e33ed161ae8aa24bd3561dcf8106b41881a634e93b9`** |
| Clon | **superficial** (`git rev-parse --is-shallow-repository` = `true`, único *shallow point* `2563831`): **no se puede verificar ninguna afirmación histórica** del tipo «las reglas no cambian desde el commit X» |
| Dependencias | `npm ci` correcto (416 paquetes) para poder ejecutar las comprobaciones E2 |

---

## 2. Verificación 1 — ¿Coinciden las reglas publicadas con el repositorio?

### 2.1 Proyecto esperado (identificado, no asumido)

Tres fuentes independientes, **coincidentes**:

| Fuente | Valor |
|---|---|
| `firebase-applet-config.json` (la que usa el SDK de la app) | `projectId: gestor-inmuebles-produccion` · `firestoreDatabaseId: ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` · `storageBucket: gestor-inmuebles-produccion.firebasestorage.app` |
| `.firebaserc` (destino de `firebase deploy`) | `projects.default: gestor-inmuebles-produccion` — **sin alias alternativos** |
| `firebase.json` | `firestore[0] = { database: ai-studio-gestordeinmueble-…, rules: firestore.rules }` · `storage.rules = storage.rules` |
| Documentación del repositorio | `docs/MAPA-MAESTRO-ERP-ACTUAL.md:512` y `:1781`; `docs/arquitectura/FASE_1.4_SEGURIDAD_PERMISOS.md:77-87`; `docs/AG-03.1-…:45-46`. Todos señalan el mismo proyecto y advierten que `startup-sanctuary-sln7n` **no** es producción |

Conclusión de esta parte: **el proyecto esperado es `gestor-inmuebles-produccion`, base con nombre `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`**. Es un dato del repositorio, no una suposición.

**Matiz que afecta al procedimiento:** las reglas de Firestore se publican como *release* por **base de datos**. Una lectura de `projects/gestor-inmuebles-produccion/releases` devuelve varias entradas (la de `(default)` y la de la base con nombre); hay que **listar primero** y quedarse con la que corresponda a la base con nombre, nunca con la primera de la lista. Comparar contra `(default)` daría un falso negativo.

### 2.2 Cómo se publican las reglas (y por qué no hay rastro en el repositorio)

- `.github/workflows/` contiene **un solo workflow**, `emulador-reglas.yml`, y **no publica nada**: ejecuta emuladores en PR y en dos ramas concretas, con `permissions: contents: read`.
- No hay `firebase deploy` en ningún script de `package.json` (revisados los 26 scripts).
- La publicación es **manual y documentada como tal**: `docs/MAPA-MAESTRO-ERP-ACTUAL.md:1781` («Publicación manual `firebase deploy --only firestore:rules,storage --project gestor-inmuebles-produccion`»).
- Consecuencia: **el repositorio no puede atestiguar qué reglas están publicadas**. Solo la API/consola de Firebase puede.

### 2.3 Por qué esta comprobación no se ha podido ejecutar

| Comprobación | Resultado |
|---|---|
| `gcloud` / `firebase` en el entorno | **no instalados** (`which` vacío) |
| Credenciales de aplicación por defecto | inexistentes: sin `~/.config/gcloud`, sin `GOOGLE_APPLICATION_CREDENTIALS`, sin variables `GOOGLE*`/`FIREBASE*`/`GCLOUD*` |
| Salida de red al endpoint de reglas | **bloqueada**: `curl https://firebaserules.googleapis.com/v1/projects/…/releases` → `OpenSSL SSL_connect: SSL_ERROR_SYSCALL` (HTTP 000); el DNS resuelve, la conexión no se establece |

Por indicación expresa de la orden («si no puede garantizarse la identidad del proyecto, detener esta comprobación»), **se detiene aquí**. No se ha intentado ninguna vía alternativa (consola web, descarga de credenciales, cambio de proyecto).

### 2.4 Procedimiento autorizado de solo lectura (para ejecutar quien tenga permiso)

**Opción A — consola (la más simple, sin CLI).**
1. Firebase console → proyecto `gestor-inmuebles-produccion` → *Firestore Database*.
2. Comprobar arriba que la base seleccionada es `ai-studio-gestordeinmueble-c6444afd-…` (selector de base de datos; **no** `(default)`).
3. Pestaña **Rules** → **Historial**: anotar la fecha de la versión publicada vigente y abrir su contenido.
4. Comparar con `firestore.rules@2563831`. **Criterio objetivo:** `sha256sum` del contenido publicado (texto plano, tal cual se muestra/copia) debe ser `2c67dc00…dfa3`; alternativamente `diff` contra el fichero del repositorio debe salir vacío. Si la consola no permite exportar el texto, basta con pegar el contenido en un fichero y calcular el hash.
5. Repetir en *Storage → Rules → Historial* para `storage.rules` (`631d45ac…e93b9`).

**Opción B — API (auditable, requiere `roles/firebaserules.viewer` sobre el proyecto).**
```bash
# 1) Listar releases (aquí se ve qué base tiene qué ruleset)
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firebaserules.googleapis.com/v1/projects/gestor-inmuebles-produccion/releases"
# 2) Leer el ruleset apuntado por la release de la BASE CON NOMBRE
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://firebaserules.googleapis.com/v1/projects/gestor-inmuebles-produccion/rulesets/<RULESET_NAME>"
# 3) Extraer .source.files[0].content y comparar
jq -r '.source.files[0].content' reglas-publicadas.json > publicado.rules
sha256sum publicado.rules      # debe ser 2c67dc0019c6d89d86f45e975bfbdd7e3a74bc29758d7446152f5f55fdcddfa3
diff -u firestore.rules publicado.rules && echo "IDÉNTICAS"
```
Ninguna de las dos escrituras: `GET` puro. **No ejecutar `firebase deploy`** bajo ningún concepto en esta fase.

**Qué informar de vuelta:** (i) hash calculado de la versión publicada de la base con nombre; (ii) fecha de publicación; (iii) si existe alguna release en la base `(default)` con contenido distinto (dato relevante por AG-03). Con eso la verificación V1 pasa a CONFIRMADA.

### 2.5 Hallazgo nuevo · A-27 · P3 · Duplicado de reglas huérfano y más laxo

`reglas-firestore-r12/firestore-cierre-corregido.rules` (3.867 líneas, SHA-256 `ceee1ffa…62d5c`) es una **copia antigua** de las reglas que **nadie referencia** (`grep` en `.ts/.tsx/.json/.yml/.md/.mjs/.mts`: 0 coincidencias) pero que se llama «cierre corregido». Sus diferencias con `firestore.rules` no son inocuas:

| Diferencia | Efecto si se publicara |
|---|---|
| `profesionales.update`: `allow update: if isStaff() \|\| (isPropietarioRole() …)` **sin** la guarda `esAdminInmuebles() \|\| mismoCampoOpcional('creadoPorPropietarioId')` | un PROFESIONAL podría **reasignar la cartera de una ficha** (empeora A-21) |
| No contiene el bloque `documentos_profesionales` (P3), ni las transiciones `ERROR_STORAGE` de `transiciones` | se perderían las garantías de custodia documental auditadas |
| 202 líneas menos en total | otras reglas intermedias ausentes |

**Riesgo:** es un candidato plausible a publicación por error en una operación manual (`firebase deploy` toma `firebase.json`, que apunta a `firestore.rules`; el riesgo es humano: copiar/pegar el fichero equivocado en la consola). **Corrección propuesta:** renombrar a `.rules.historico` fuera de cualquier ruta de despliegue o eliminar el directorio, y añadir al workflow una comprobación de que solo existe un `*.rules` de Firestore. **No se ha tocado** (restricción de la fase).

---

## 3. Verificación 2 — ¿Existen cuentas PROFESIONAL activas con ficha?

### 3.1 Método: reconstruir el camino de alta (en lugar de suponerlo)

`isStaff()` exige **tres** condiciones simultáneas: (a) espejo `usuarios_auth/{uid}` con `perfilVerazDesde` (usuario ACTIVO, mismo UID y mismo `tipoPerfil`), (b) `tipoPerfil == 'PROFESIONAL'`, (c) `profesionalId` no vacío **y** `profesionales/{profesionalId}` existente.

Se ha recorrido **todo** el código que escribe `profesionalId` en `usuarios` o en el espejo:

| Vía | ¿Escribe `profesionalId`? | ¿Puede dejar la cuenta ACTIVA con espejo veraz? | Evidencia |
|---|---|---|---|
| `CrearUsuarioModal` (única pantalla de alta/edición de usuarios, usada también desde Administración) | **No** — el objeto construido no incluye `profesionalId` | No: sin `profesionalId` el espejo queda con `''` y `personalDesdeEspejo()` es `false` | `src/components/modals/CrearUsuarioModal.tsx:170-188` |
| `registerAutonomo` (auto-registro público de profesional) | Sí (`profesionalId: entidadId`) | **No**: escribe `estado: 'ACTIVO'` y las reglas exigen `estado == 'PENDIENTE'` + invitación nominal para PROFESIONAL, de modo que la escritura se **deniega** | `src/lib/authService.ts:1110-1133`; `firestore.rules:2258-2285` (exige `estado == 'PENDIENTE'`, `:2276`) |
| `registerWithInvitationLink` (registro con enlace) | Sí, si `enlace.profesionalIdVinculado` | **No** por dos motivos: (i) el cliente escribe `estado: 'ACTIVO'` (misma denegación); (ii) **no existe ninguna pantalla que cree una invitación con `profesionalIdVinculado`** — el campo solo aparece en `types.ts` y en el `fallback` de `authService.ts:769` | `src/lib/authService.ts:749, 769`; `grep profesionalIdVinculado` en `src/` = 2 apariciones (tipo + fallback) |
| `seedAuthAndRolesIfEmpty` (siembra demo) | Sí (`user_profesional_demo` + `prof_demo_1`) | **Sí, pero solo si**: `usuarios` está **vacía** *y* la sesión es el **master** (el camino no-master de `usuarios.create` exige `authUid == request.auth.uid` y la siembra crea la ficha de otro) | `src/lib/firebase.ts:3421-3490` y `:3190-3210` (escritura de usuarios); `firestore.rules:2248-2249` |
| Escritura del master desde consola o script | Sí | **Sí** (el master puede fijar cualquier `profesionalId`/`estado`) | `firestore.rules:2248-2249` |
| Datos históricos anteriores a los cambios de la UI | Desconocido | Posible | **EVIDENCIA AUSENTE** (clon superficial: no hay historial) |

**Lectura:** la exposición no nace de un flujo de producto que funcione, sino de (i) cuentas creadas por el master, (ii) datos heredados, o (iii) una instalación sembrada en vacío. El **portal profesional existe y está enlazado en la navegación** (`src/navegacion/navegacion.ts:139,148`), lo que indica que el producto **cuenta** con profesionales autenticados; por tanto la hipótesis de trabajo debe ser que **sí existen**, hasta que un recuento diga lo contrario.

> **Corrección de una afirmación de la fase 1A.** El diagnóstico anterior decía que la cuenta PROFESIONAL activa con ficha «es el estado normal del portal profesional». Tras recorrer el alta, la afirmación correcta es: **el portal está preparado para ese perfil, pero ninguna pantalla actual escribe `profesionalId`, y el auto-registro de profesional está bloqueado por las reglas**. No es «el estado normal»; es un estado **posible por master o por datos heredados**. Se deja constancia para no sobrestimar el impacto sin el recuento (§3.4).

### 3.2 Vía de exposición en la interfaz (confirmada, no requiere SDK)

Con una cuenta PROFESIONAL con ficha, **sin usar herramientas**:

1. `App.tsx:1318` — `subscribeCandidatos(...)` **sin ámbito** → la consulta se autoriza por `isStaff()` (`firestore.rules:2054`) y el navegador recibe **toda** la colección; se copia a `localStorage.rentselect_candidatos` (`:1319-1322`).
2. `App.tsx:1340` — `subscribeSolicitudes(...)` sin ámbito → igual (`:2085`).
3. **`avisos`**: la sección está habilitada para PROFESIONAL (`navegacion.ts:139`), y `BandejaAvisosSection.tsx:52` calcula `esStaff = ADMINISTRADOR || PROFESIONAL` para lanzar una consulta **sin filtro** (`src/lib/bandejaAvisos.ts:91-94`). Es decir, la bandeja rotulada «Avisos de mis inmuebles» muestra en realidad **los avisos de toda la instalación** con datos de propietarios e inquilinos. La propia etiqueta demuestra que el comportamiento observado no es el diseñado.

### 3.3 Lo que sí está acotado

- **No hay autoelevación**: `usuarios_auth` exige `indexIsTruthful()` (`firestore.rules:402-421`) y `usuarios` no permite cambiar `tipoPerfil`, `estado`, `profesionalId` ni `permisos` desde la propia cuenta (`:2351-2385`).
- **El espejo no es falsificable** por un tercero: escritura limitada al propio UID y contrastada con la ficha autoritativa.

### 3.4 Consulta agregada que resuelve la duda (sin datos personales)

Solo hace falta **un número**. Ejecutar con una cuenta de **solo lectura** (`roles/datastore.viewer`), sobre la base con nombre:

**Paso 1 — agregación pura (devuelve un entero; no devuelve ningún documento):**
```
POST https://firestore.googleapis.com/v1/projects/gestor-inmuebles-produccion/databases/ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51/documents:runAggregationQuery
{
  "structuredAggregationQuery": {
    "structuredQuery": {
      "from": [{ "collectionId": "usuarios_auth" }],
      "where": { "compositeFilter": { "op": "AND", "filters": [
        { "fieldFilter": { "field": { "fieldPath": "tipoPerfil" }, "op": "EQUAL", "value": { "stringValue": "PROFESIONAL" } } },
        { "fieldFilter": { "field": { "fieldPath": "estado" },     "op": "EQUAL", "value": { "stringValue": "ACTIVO" } } }
      ]}}
    },
    "aggregations": [{ "alias": "n", "count": {} }]
  }
}
```
Anotar **N1** = valor de `n`.

**Paso 2 — si N1 > 0 (proyección de UN campo, sin PII):** misma consulta sin agregación, con
`"select": { "fields": [{ "fieldPath": "profesionalId" }] }`
y contar localmente cuántos valores son cadenas no vacías. **No** imprimir ni registrar esos valores: son identificadores de ficha. Informar únicamente de dos enteros: `con_ficha` / `sin_ficha`.

**Paso 3 (opcional, para saber si además la ficha es de contratista):** `n` de `profesionales` con `creadoPorPropietarioId` presente.

**Árbol de decisión:**

| Resultado | Conclusión | Efecto sobre A-20 |
|---|---|---|
| **N1 = 0** | Ninguna cuenta PROFESIONAL activa ⇒ `isStaff()` no puede activarse por esta rama | A-20 **latente** (no explotable hoy, se activaría con el primer profesional real o en una instalación sembrada). Sigue siendo P0 de diseño, no de explotación. |
| **N1 > 0 y `con_ficha` = 0** | Hay profesionales pero ninguno con ficha ⇒ `personalDesdeEspejo()` es `false` en todos | A-20 latente igualmente |
| **N1 > 0 y `con_ficha` > 0** | **Exposición real** a datos personales de terceros | A-20 **activo**: pasar a corrección urgente y revisar `audit_logs`/ausencia de registros de lectura |

Sin estos números, cualquier afirmación sobre producción sigue siendo **PENDIENTE DE VERIFICACIÓN**.

---

## 4. Verificación 3 — Enlaces heredados: formatos, generación, validación y vigencia

### 4.1 Inventario completo (código verificado)

| Superficie | Campo que actúa como capacidad | Generador actual | Formato heredado | Caducidad | Revocación |
|---|---|---|---|---|---|
| `/visita/:token`, `POST reservar/cancelar` | `invitaciones.token` | `generarTokenCapacidad('vst')` → `vst-<32 hex>` (128 bits) `src/lib/tokensPublicos.ts:110-128` | **Sin token** ⇒ el **id del documento** es la capacidad (`servicioPortalPublico.ts:407-418`); ids tipo `inv_…`/`cand-1` | **Ninguna** (ni campo, ni servicio, ni reglas) | Solo borrando el documento (`deleteInvitacionFirestore`, `firebase.ts:1349-1355`, invocado al borrar candidato `App.tsx:2018-2020`) |
| `/cuestionario/:token` | `candidatos.cuestionarioToken` | `generarTokenCapacidad('q')` → `q-<32 hex>` (`App.tsx:2512`, `EnviarCuestionarioModal.tsx:49,66`) | `Math.random()` 4 chars base36 y, antes de AG-02, el **id de la solicitud** (`tokensPublicos.ts:99-108`); fallback id | **Ninguna** | Reemisión manual del token (`EnviarCuestionarioModal.tsx:66`): el anterior deja de resolver. No hay botón de revocación |
| `/documentacion/:token` | `solicitudes_documentacion.token` | `generarTokenCapacidad('doc')` (`documentTemplates.ts:271`) | Sin token ⇒ id del documento; posible `docToken` histórico | **Ninguna** (`estado` tampoco se mira) | **No existe** |
| Enlaces de registro genéricos (`?registro=`, `?registroInq=`, `?registroProp=`) | **`enlaces_registro/{id}`** — el **id es el secreto** (`accesoPropietarios.ts:202-205`) | semilla fija en código: `registro_propietario_oficial`, `registro_profesional_oficial` (`firebase.ts:3543-3552`) | `enlace_<ms>_<4 base36>` (`accesoPropietarios.ts:148-151`, **≈20,7 bits**) · invitación de inquilino: `enl_inq_<8 base36><ms base36>` con `token == id` y `Math.random()` (`suministrosFirestore.ts:446-449`) | **Solo para invitaciones nominales de propietario y de cartera**, y **solo al activar**: `firestore.rules:779-780` (`invitacionNominalVigente`, exige `request.time < fechaCaducidadMs`) y `:662-667`. **El `get` no comprueba caducidad** (§4.3). La invitación de **inquilino** no tiene caducidad efectiva: `enlaceInquilinoValido` (`:735-744`) solo mira `activo`, contrato y usos | `activo: false` (`App.tsx:3514`). Funciona: comprobado (§4.3) |
| Invitaciones de cartera (ONBOARDING_CARTERA) | `enlaces_registro/{id}` con `finalidad` | `onboardingCarterasFirebase.ts:174` | — | Sí, en lectura y en respuesta | Sí (máquina de estados) |

### 4.2 Puntos de validación (dónde se decide)

| Capa | Qué comprueba | Qué **no** comprueba |
|---|---|---|
| `server/portalPublico/servicioPortalPublico.ts:116-121` (`exigirToken`) | patrón `^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$` | existencia, caducidad, estado, revocación |
| `localizarPorToken` `:393-419` | 1 resultado exacto (2 ⇒ `TOKEN_AMBIGUO`); si no hay, prueba el id **solo** cuando el documento no tiene token | fecha, estado, relación |
| `obtenerVisita` / `reservarVisita` `:449-560` | `status === 'HORARIO RESERVADO'`; slot disponible; mismo inmueble | `status` CANCELADA/ANULADA, `fechaCaducidad`, candidato descartado |
| `guardarCuestionario` `:726-770` | longitud/máscara de campos | estado del candidato: **reescribe** `estado` y solvencia |
| `obtenerDocumentacion` `:776-823` | lista blanca de campos | `estado` (ARCHIVADA/CERRADA), caducidad |
| Reglas `firestore.rules:2525-2573` | `activo`, usos, `estadoInvitacion`, permisos por tipo | **caducidad en `get`** salvo invitaciones de cartera; usos en `get` |

### 4.3 Evidencia ejecutada en esta fase (E2, harness sobre `firestore.rules` real)

| Caso | Esperado | Observado | Resultado |
|---|---|---|---|
| Enlace genérico **activo** / anónimo | legible solo si se conoce el id | legible | **PASS** (diseño de capacidad) |
| Enlace genérico **inactivo** / anónimo | denegado | denegado | **PASS** |
| **Invitación nominal CADUCADA** (`fechaCaducidadMs` en el pasado) **activa** / anónimo | denegado | **legible** → expone `emailInvitado`, `usuarioIdVinculado`, `propietarioIdVinculado`, `token` | **FAIL** (A-26) |
| Ídem / usuario autenticado cualquiera | denegado salvo destinatario | **legible** | **FAIL** (A-26) |
| Invitación nominal caducada **inactiva** / anónimo | denegado | denegado | **PASS** (la revocación sí funciona) |
| **Enlace de inquilino caducado** / anónimo | denegado | **legible** | **FAIL** (A-26) |
| Invitación de cartera caducada / anónimo (control) | denegado | denegado | **PASS** |
| Id inexistente / anónimo (control) | denegado | denegado | **PASS** |

Fichero temporal eliminado; `git status` limpio. Sumado a las 8 pruebas de servicio de la fase 1A (§4.2 de aquel documento), el comportamiento de A-04/A-24 queda fijado en **17 comprobaciones reproducidas**.

### 4.4 Hallazgo nuevo · A-26 · P2 · Caducidad no aplicada al leer y capacidad de baja entropía en enlaces de registro

1. **La caducidad existe pero no protege la lectura.** `enlaces_registro.get` (`firestore.rules:2527`) autoriza al anónimo con `activo == true` **sin mirar `fechaCaducidadMs`** (salvo invitaciones de cartera). Una invitación nominal caducada sigue siendo legible y expone el **email del invitado** y los vínculos. La caducidad solo se aplica al **activar** (`:779-780`), que es cuando ya no importa para la confidencialidad.
2. **La invitación de inquilino no caduca nunca** a efectos de lectura ni de alta: `enlaceInquilinoValido` (`:735-744`) ignora `fechaCaducidad`. `crearInvitacionInquilino` la deja **opcional** (`suministrosFirestore.ts:456`).
3. **Entropía insuficiente en el identificador-capacidad:** `enlace_<Date.now()>_<4 base36>` ≈ **20,7 bits** más una marca de tiempo en milisegundos. No hay límite de tasa ni App Check (A-18), de modo que la enumeración es costosa pero no despreciable; y los dos enlaces de semilla son **cadenas fijas publicadas en el repositorio** (`registro_propietario_oficial`, `registro_profesional_oficial`).
   *Atenuante:* la semilla solo se escribe si `enlaces_registro` está vacía y con el master en sesión (`firebase.ts:3541-3552`), y el alta pública de propietario es una **decisión de producto** (existe también `registerAutonomo`). No se eleva la severidad por esto.
4. **Impacto real de (1) y (2):** el enlace caducado **no permite activar** una cuenta (la regla de activación sí comprueba la fecha y el `usosMaximos`), así que el daño es **confidencialidad** (email del invitado, existencia de la invitación, vínculos) y **persistencia de una capacidad** que el producto cree extinguida. No permite suplantación.

**Corrección propuesta (no aplicada):** añadir a `enlaces_registro.get` la condición de vigencia para las ramas anónima y de usuario (`request.time.toMillis() < resource.data.fechaCaducidadMs` cuando el campo exista, o `activo == true` **y** `estadoInvitacion == 'PENDIENTE'`), y añadir `fechaCaducidadMs` a la validación de `enlaceInquilinoValido`. Migración: los enlaces sin `fechaCaducidadMs` (legado) deben reemitirse — la regla actual ya lo exige para la activación nominal (`:768-770`).

### 4.5 Estimación de cuántos enlaces siguen vivos: qué falta

**No se puede calcular sin acceso a datos.** Y no se puede inferir del repositorio: el clon es superficial y no hay copia de datos.

Procedimiento que **sí** es seguro (no lee datos personales, no abre enlaces, no cambia estados). Para cada colección, proyección **solo** de los campos de control:

```bash
# Ejemplo para candidatos. Repetir cambiando colección/campo.
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 "https://firestore.googleapis.com/v1/projects/gestor-inmuebles-produccion/databases/ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51/documents:runQuery" \
 -d '{"structuredQuery":{
   "from":[{"collectionId":"candidatos"}],
   "select":{"fields":[{"fieldPath":"cuestionarioToken"},{"fieldPath":"createdAt"}]}}}' \
 | jq -r '. | map(.document.fields)[] | [(.cuestionarioToken.stringValue // ""), (.createdAt.stringValue // "")] | @tsv' \
 | awk -F'\t' 'BEGIN{c=0}{ if($1=="") v++; else if($1 ~ /^q-[0-9a-f]{32}$/) ok++; else otra++; if($2 < "2026-10-20") viejo++ } END{printf "sin_token=%d formato_actual=%d formato_desconocido=%d creados_antes_AG02=%d\n", v, ok, otra, viejo}'
```
**Regla de oro:** el script imprime **solo agregados**; los tokens son secretos y **no deben aparecer** en la salida, en un fichero ni en un ticket. Si el operador necesita depurar, que cuente prefijos, nunca valores completos.

Consultas equivalentes para el resto:

| Colección | Campo | Qué contar |
|---|---|---|
| `candidatos` | `cuestionarioToken`, `createdAt` | `sin_token` (⇒ id como capacidad, A-24), `formato_actual ^q-[0-9a-f]{32}$`, `formato_desconocido` (⇒ heredado previsible) |
| `invitaciones` | `token`, `createdAt` | `sin_token` (⇒ id como capacidad) y formato |
| `solicitudes_documentacion` | `token`, `estado`, `createdAt` | sin token, formato, y **cuántas tienen `estado` terminal** (ARCHIVADA/CERRADA) y siguen sirviendo |
| `enlaces_registro` | `token`, `tipoPerfil`, `activo`, `fechaCaducidadMs`, `estadoInvitacion`, `usosActuales`, `usosMaximos`, `createdAt` | `activo == true` **y** (`fechaCaducidadMs` ausente **o** vencida) ⇒ **enlaces caducados que siguen legibles** (A-26); `id` con patrón `^enlace_[0-9]{13}_[a-z0-9]{1,4}$` o `^enl_inq_`  ⇒ capacidad de baja entropía |

**Evidencia que falta para cerrar V3:** los cuatro recuentos anteriores. Con ellos se decide si hace falta reemisión masiva (bloqueante para retirar el fallback del `id`) o si puede retirarse de inmediato.

---

## 5. Plan técnico de corrección (ordenado por riesgo)

> **Nada de esto está implementado.** Es el diseño que se ejecutará tras autorización expresa.

### 5.0 Orden de despliegue (crítico)

El código y las reglas no pueden ir en el mismo salto sin orden. Secuencia propuesta, cada paso desplegable y reversible por separado:

| Paso | Contenido | ¿Rompe algo si se despliega solo? |
|---|---|---|
| **1** | **Cliente**: acotar suscripciones (`iniciarLecturas`, `BandejaAvisosSection`) — §5.1.3 | No: solo añade filtros que las reglas actuales ya autorizan |
| **2** | **Reglas**: A-20 + A-21 + A-22 + A-23 (un solo ruleset) — §5.1.1/§5.1.2 | No, si el paso 1 está desplegado. Riesgo residual: navegadores con la versión antigua en caché (ver rollback) |
| **3** | **Servidor**: ciclo de vida de tokens (A-04) + emisión de `expiraEn` en cliente — §5.2 | En dos sub-pasos: 3a emitir el campo, 3b exigirlo |
| **4** | **Reglas**: A-26 (vigencia en `get` de `enlaces_registro`) | Requiere que los enlaces vivos tengan `fechaCaducidadMs` (reemisión previa) |
| **5** | A-13, A-24 (retirada del fallback del id), A-08 en reglas si se decide | Requiere recuento de §4.5 |
| **6** | A-27, A-28 (higiene y alta de profesional) | Independiente |

### 5.1 A-20 y A-21 — permisos de profesionales y escritura cruzada

**Prioridad: P0 (A-20) y P1 (A-21). Causa común: `isStaff()` se usa como sustituto de «personal interno».**

#### 5.1.1 Reglas: retirar PROFESIONAL del predicado y poner ámbito explícito

**Fichero:** `firestore.rules` (único fichero de esta corrección).

| Bloque | Línea actual | Cambio |
|---|---|---|
| `personalDesdeEspejo` | `:546-550` | Quitar la rama PROFESIONAL: `return m.tipoPerfil == 'ADMINISTRADOR';`. `isStaff()` queda master **o** ADMINISTRADOR verificado y **desaparece** como comodín sobre datos personales |
| `candidatos` | `:2049-2078` | `get`: `esAdminInmuebles() \|\| ('inmuebleId' in resource.data && ambitoPorInmuebleLectura(...))`; `list`: `esAdminInmuebles() \|\| inmuebleEnCarteraGestionada(resource.data) \|\| (isPropietarioRole() && propietarioId == myPropId())`; `create` ya tiene rama interna + alta pública (ver A-13); `update`/`delete`: ámbito de escritura |
| `solicitudes` | `:2081-2092` | igual, **más** añadir rama de `list` para titular/cartera (hoy inexistente: A-08) |
| `invitaciones` | `:2100-2115` | `isStaff()` → `esAdminInmuebles()` |
| `slots_visita` | `:2125-2136` | idem |
| `solicitudes_documentacion` | `:2161-2178` | idem |
| `notificaciones` | `:2619` | `list`: `esAdminInmuebles() \|\| (isPropietarioRole() && propietarioId == myPropId())` |
| `profesionales` | `:2401-2418` | `get`: `esAdminInmuebles() \|\| (isProfesionalRole() && myProfId() == profesionalId) \|\| (ramas de propietario actuales)`; `list`: `esAdminInmuebles()` + ramas de propietario + `(isProfesionalRole() && resource.data.usuarioId == request.auth.uid)`; `update`: `isStaff()` → `esAdminInmuebles()` en la rama administrativa, **más** una rama «mi ficha» con **lista blanca de campos** (A-21) |
| `especialidades` | `:2585-2588` | `isStaff()` → `esAdminInmuebles()` (A-22) |
| `system` | `:2223` | `isStaff()` → `esAdminInmuebles()`; y el `get` por `docId` restringido a `modulos_config` sigue igual (A-23: valorar si el cliente necesita leerlo para todos los perfiles — hoy lo lee `ConfiguracionSection`, que es de administración) |

**Lista blanca de campos para «mi ficha» (A-21).** Un profesional solo puede modificar su propia ficha y solo estos campos, que son los que la UI envía de verdad (`ProfesionalPortalSection.tsx:187-200`): `nombreComercial`, `razonSocial`, `cifNif`, `contactoNombre`, `email`, `telefono`, `web`, `especialidades`, `zonasServicio`, `disponible`, `updatedAt`. **Prohibido siempre**: `creadoPorPropietarioId`, `esPrivado`, `usuarioId`, `activo`, `estado`, `valoracionMedia`, `totalValoraciones`, `inmuebleIdsAsignados`, `documentos`, `createdAt`.

**Comportamiento esperado tras el cambio**

| Actor | Esperado |
|---|---|
| PROFESIONAL con ficha | `candidatos`/`solicitudes`/`invitaciones`/`slots`/`solicitudes_documentacion`: **denegado** en toda operación sobre documentos de cualquier cartera. `notificaciones`: denegado. `profesionales`: lee y edita **solo su ficha**, con campos acotados. `especialidades`: lectura (catálogo público) |
| ADMINISTRADOR / master | Sin cambios: gestión completa |
| PROPIETARIO / gestor L/E | Sin cambios en su cartera; **mejora**: `solicitudes.list` pasa a funcionar (A-08) |
| INQUILINO | Sin cambios (ya denegado) |
| Anónimo | Sin cambios (ya denegado; alta pública de captación intacta) |

**Pruebas de seguridad negativas (deben fallar el acceso)**
1. PROFESIONAL con ficha + `get/list/create/update/delete` sobre `candidatos` de otra cartera → `permission-denied` (6 casos).
2. Ídem sobre `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion` (20 casos).
3. PROFESIONAL: `list` de `notificaciones` → denegado; `get` de un aviso ajeno → denegado.
4. PROFESIONAL: `update` de **otra** ficha (incluido solo `telefono`) → denegado.
5. PROFESIONAL sobre su propia ficha: `update` de `creadoPorPropietarioId`, `esPrivado`, `activo`, `valoracionMedia`, `usuarioId` → denegado (5 casos); `update` de `telefono` → permitido.
6. PROFESIONAL: `delete` de `especialidades` ajena → denegado.
7. ANÓNIMO: mismas 6 colecciones → denegado (no regresión del cierre de 2026-10-14).

**Pruebas positivas (deben seguir funcionando)**
1. PROFESIONAL: `get` de su ficha por id y `list` con `where('usuarioId','==',uid)`.
2. PROFESIONAL: `trabajos_profesionales` con `profesionalId == myProfId()`, `presupuestos_profesionales` propios, `incidencias` con `profesionalAsignadoId == myProfId()`, `documentos_profesionales` de su ficha (estas ramas ya están bien y **no se tocan**).
3. ADMINISTRADOR: las 8 colecciones, sin cambios.
4. PROPIETARIO A: cartera completa; PROPIETARIO B: denegado.
5. Gestor con `carterasL`/`carterasE`: lectura/escritura según permiso; revocación de cartera ⇒ denegado en la siguiente petición.
6. INQUILINO: contrato, mensajes, suministros propios (6 controles de la fase 1A).

**Regresión que este cambio introduce si no se hace §5.1.3:** el portal profesional pierde `profesionales` (su propia ficha) y las suscripciones sin filtro empiezan a registrar `permission-denied` en consola (candidatos, solicitudes, avisos).

**Dependencias:** ninguna de datos. **Riesgo de publicación:** un ruleset inválido deja **toda** la app denegada (deny-by-default). Mitigación: emulador oficial + tener identificado el ruleset publicado actual (§2.4) para revertir en un clic.

#### 5.1.2 Alternativa considerada y descartada

Un campo `ambito: 'INTERNO' | 'CONTRATISTA'` en la ficha escrita solo por el master permitiría conservar `isStaff()` para profesionales internos. **Descartada para este bloque** por tres motivos: (a) exige migración de datos y decisión de producto; (b) el catálogo `profesionales` no distingue hoy interno/contratista en ningún flujo real; (c) el mínimo privilegio se consigue sin migrar. Si el producto lo pide, es un cambio posterior **sobre** este.

#### 5.1.3 Cliente: `iniciarLecturas` y bandeja de avisos

**Ficheros:** `src/App.tsx` (`iniciarLecturas`, líneas 1276-1345 y 1390), `src/components/sections/BandejaAvisosSection.tsx:52`, `src/lib/bandejaAvisos.ts:91-96`, `src/lib/firebase.ts` (nuevas variantes con `where`).

| Suscripción | Hoy | Propuesta |
|---|---|---|
| `inmuebles` (`:1309`) | ya con `dataScope`, y `subscribeInmuebles` devuelve vacío para PROFESIONAL sin autorización | sin cambios |
| `candidatos` (`:1318`) | **sin ámbito** | solo si `puedeVerCaptacion = ADMINISTRADOR \|\| (PROPIETARIO && propietarioId)`; y con `where('propietarioId','==',pid)`. PROFESIONAL/INQUILINO: **no se suscribe** y el estado se deja vacío |
| `solicitudes` (`:1340`) | **sin ámbito** | ídem (misma condición). Tras §5.1.1 la rama de titular existe, así que el propietario sí las recibe |
| `profesionales` (`:1390`) | **sin ámbito** | ADMINISTRADOR: colección completa. PROPIETARIO: dos consultas (`where('esPrivado','==',false)` + `where('creadoPorPropietarioId','==',pid)`) unidas en memoria. PROFESIONAL: `get` puntual de su ficha por `currentUser.profesionalId` (más `where('usuarioId','==',uid)` como respaldo) |
| `avisos` (`BandejaAvisosSection:52`) | `esStaff = ADMINISTRADOR \|\| PROFESIONAL` ⇒ consulta global | `esStaff = ADMINISTRADOR`; con `PROPIETARIO`/`PROFESIONAL` se usa siempre `where('propietarioId','==',…)` y, si no hay `propietarioId`, **lista vacía con mensaje** (no error) |

**Nota de Firestore que condiciona el diseño:** en una consulta `list`, la regla no puede referenciar el `{id}` de la ruta; por eso el acceso del profesional a **su** ficha se resuelve con `get()` (documento único) o filtrando por `usuarioId`, nunca con `myProfId()` sobre una colección.

**Pruebas del cliente (nuevas, `vitest` con Firebase simulado):**
1. PROFESIONAL: `iniciarLecturas` **no** llama a `subscribeCandidatos` ni a `subscribeSolicitudes`; `BandejaAvisosSection` no ejecuta consulta sin filtro. (Negativa, se puede comprobar con espías.)
2. PROPIETARIO: `subscribeCandidatos` recibe `where('propietarioId','==',pid)`; un snapshot vacío **no** reescribe Firestore (no regresión de A-03).
3. ADMINISTRADOR: comportamiento actual sin cambios.
4. PROFESIONAL sin `profesionalId`: no rompe; la ficha queda `null` y el portal muestra el estado vacío existente.
5. Regresión: `src/navegacion/navegacion.ui.test.tsx`, `src/estadoDatos/*` y `src/components/experiencia/*` (usan perfiles PROFESIONAL) siguen en verde.

### 5.2 A-04 y A-24 — caducidad, revocación y tokens heredados

**Prioridad: P1.** **Ficheros:** `server/portalPublico/servicioPortalPublico.ts`, `server/portalPublico/rutasPortalPublico.ts` (cabeceras), emisores de enlaces (`App.tsx:1837,2512`, `CrearAgendaVisitasModal.tsx:353`, `EnviarCuestionarioModal.tsx:49,66`, `PreseleccionadosSection.tsx:127`, `documentTemplates.ts:271`), `src/lib/tokensPublicos.ts` (helper de expiración), `src/lib/firebase.ts` (persistir el campo), UI de revocación en `CandidatosSection`/`PreseleccionadosSection`.

**Modelo propuesto (mínimo, sin migración destructiva):** tres campos opcionales por documento — `expiraEn` (ISO, escrito al emitir), `revocadoEn` (ISO, lo escribe el propietario/administración) y `usoUnico` (bool, opcional). El servicio **falla cerrado** cuando el campo existe y la condición no se cumple; mientras no exista, se comporta como hoy **y se contabiliza** (§4.5) para planificar la reemisión.

**Comportamiento esperado**

| Caso | Hoy | Esperado |
|---|---|---|
| `expiraEn` vencido | sirve | **410 `ENLACE_NO_VALIDO`** en GET y POST |
| `revocadoEn` presente | sirve | 410 |
| `invitaciones.status` en `CANCELADA`, `CANCELADO`, `ANULADA` | reserva aceptada | 409/410, **sin escritura** |
| `candidatos.estado` en `descartado`, `contratado`, `rechazado` | acepta cuestionario y reescribe estado/solvencia | 409, **sin escritura** |
| `solicitudes_documentacion.estado` en `ARCHIVADA`, `CERRADA` | sirve y admite aportaciones | 410 |
| Token inexistente / ambiguo / mal formado | 404/409 | igual (no regresión) |
| Documento **sin** token y sin `expiraEn` (legado) | id como capacidad | **igual hasta que el recuento lo permita**; luego 404 |

**Pruebas negativas**
1. `expiraEn` pasado ⇒ 410 y **cero escrituras** (verificar `puerto.commits.length === 0`).
2. `revocadoEn` ⇒ 410 inmediato (sin caché: `Cache-Control: no-store`).
3. Invitación cancelada ⇒ reserva rechazada y el slot **sigue disponible**.
4. Candidato descartado ⇒ cuestionario rechazado y el documento **byte a byte igual**.
5. Documentación archivada ⇒ 410 en GET y POST.
6. Token de otro inmueble/slot ⇒ 409 (ya cubierto; no regresión).
7. Alta anónima directa por SDK en `candidatos`/`solicitudes`: no se ve afectada por este cambio (se trata en A-13).

**Pruebas positivas**
1. Enlace vigente: ver, reservar, cancelar, cuestionario y aportación funcionan igual (las 8 pruebas actuales de `servicioPortalPublico.test.ts` y `rutasPortalPublico.test.ts` deben seguir en verde).
2. Doble envío del mismo cuestionario: idempotente, sin duplicar historial.
3. Reserva concurrente: una gana, la otra recibe conflicto (ya probado).
4. Respuesta sin datos internos (score, notas privadas, análisis IA) — lista blanca intacta.

**Regresión por perfil:** admin y titular siguen pudiendo emitir/rotar/revocar enlaces; el candidato anónimo no nota diferencia mientras su enlace esté vigente. **Cabecera `Referrer-Policy: no-referrer`** en `/api/visita|cuestionario|documentacion` y en las rutas SPA públicas (A-25): verificar con `curl -I`.

**Migración:** 3a emitir (>14 días por defecto), 3b exigir. Los enlaces sin `expiraEn` se listan con el script de §4.5 y se reemiten por lotes **con confirmación humana**, nunca automáticamente.

### 5.3 A-22, A-23, A-25 — prioridad y encaje

| ID | Sev. | Encaje | Pruebas |
|---|---|---|---|
| A-22 `especialidades` | P2 | mismo ruleset que §5.1.1 (una línea) | profesional no crea/edita/borra; propietario sigue creando las suyas (`creadoPorUid`); catálogo legible por todos (registro público) |
| A-23 `system/modulos_config` | P3 | mismo ruleset | profesional/propietario: denegado; ADMINISTRADOR: permitido; verificar que `ConfiguracionSection` sigue leyendo con perfil de administración |
| A-25 cabeceras | P3 | `vercel.json` (`headers`) o middleware Express | `curl -I` en las 3 rutas públicas y en `/`; sin `Referrer-Policy` ⇒ prueba en rojo |

### 5.4 A-08 y A-13 — incorporados al inventario

| ID | Qué falta | Dónde | Pruebas |
|---|---|---|---|
| **A-08** | (a) reglas: rama de `list` para titular/cartera en `solicitudes`; (b) cliente: filtros por ámbito en `candidatos`, `solicitudes` y `profesionales` (§5.1.3) | `firestore.rules:2085`; `App.tsx:1318,1340,1390`; `firebase.ts:1017-1050, 3220-3234` | propietario ve sus candidatos y solicitudes y **solo** los suyos; contadores del panel coinciden con la cartera; gestor L/E ve la cartera; B sigue viendo cero |
| **A-13** | lista blanca de campos en el `create` anónimo de `candidatos` (hoy acepta `estado`, solvencia, `cuestionarioToken`, `documentos[]` con URL externa: reproducido) y de `solicitudes`; límite de tasa por IP en las tres rutas públicas (`crearLimitadorVentana`, hoy solo usado en `/api/asistente` y en la prueba SMTP); App Check (A-18) | `firestore.rules:2058-2067, 2086-2088`; `server/portalPublico/rutasPortalPublico.ts` | alta anónima con campo fuera de lista blanca ⇒ denegada; alta legítima ⇒ permitida; >N peticiones/min desde una IP ⇒ 429; el flujo de captación real sigue funcionando de punta a punta |

**Nota de coherencia:** aplicar A-13 en reglas **exige** revisar el alta desde `PortalCaptacion`/`solicitudPublica.ts` para que envíe exactamente los campos permitidos. Va en el mismo cambio que la prueba de regresión correspondiente.

### 5.5 Hallazgos nuevos de esta fase

| ID | Sev. | Título | Corrección |
|---|---|---|---|
| **A-26** | P2 | La caducidad de los enlaces de registro no se aplica al leer; la invitación de inquilino no caduca; capacidad de ≈20,7 bits | §4.4 |
| **A-27** | P3 | Duplicado de reglas huérfano y más laxo (`reglas-firestore-r12/`) | renombrar fuera de la ruta de despliegue o eliminar; comprobación en CI de que solo hay un `.rules` |
| **A-28** | P2 | **El alta de profesional no puede completarse**: el cliente escribe `estado: 'ACTIVO'` y las reglas exigen `PENDIENTE` + invitación nominal; además **no existe pantalla** que cree la invitación con `profesionalIdVinculado` | decisión de producto (¿alta de profesional por invitación o por administración?) + alinear cliente y reglas. **No se corrige en este bloque**; se documenta porque condiciona cuántos profesionales pueden existir (V2) |

### 5.6 Matriz de regresiones por perfil (resumen ejecutable)

| Perfil | Qué debe seguir funcionando | Qué debe dejar de funcionar |
|---|---|---|
| **Inquilino** | `get` de su contrato, inmueble, mensajes, suministros; crear incidencias de su contrato; índice de mensajes | Nada cambia aquí; verificar que ninguna regla nueva dependa de `isStaff()` (hoy el inquilino nunca fue staff) |
| **Propietario** | inmuebles, contratos, gastos, incidencias, cobros, avisos propios; crear/editar sus profesionales privados; **nuevo**: ver sus candidatos y solicitudes (A-08) | **Nada**: su ámbito no se toca; solo se le añade la rama que le faltaba |
| **Gestor (carteras L/E)** | lectura/escritura según permiso; delegación parcial; revocación ⇒ denegado inmediato | Nada |
| **Profesional** | su ficha (campos acotados), sus trabajos, presupuestos, incidencias asignadas, documentos de su ficha; catálogo de especialidades | **Captación completa** (candidatos, solicitudes, invitaciones, slots, documentación), bandeja global de avisos, fichas ajenas, `especialidades` de escritura |
| **Administrador / master** | todo | Nada |

Cada fila debe existir como prueba en el **emulador oficial** (`.github/workflows/emulador-reglas.yml`) antes de publicar reglas; el workflow ya corre en cada PR.

---

## 6. Decisiones que necesitan al product owner (no técnicas)

1. **¿Existe el concepto «profesional interno»?** Si sí, hace falta un campo escrito solo por el master (hoy no existe en ningún flujo) y un plan de datos. Si no, `isStaff()` no debe incluir nunca a un profesional (opción propuesta).
2. **¿El alta de profesional es por invitación o por administración?** Determina si A-28 se arregla alineando el cliente (invitación) o cerrando el auto-registro (administración).
3. **¿Qué debe ver un profesional en «Avisos de mis inmuebles»?** Hoy ve todo. Las opciones son: ningún aviso, los de los inmuebles donde tiene trabajos, o los de sus propias órdenes.
4. **Vigencia por defecto de cada enlace** (visita, cuestionario, documentación) y **qué pasa al caducar**: ¿reemisión manual, aviso al propietario, o ambos?
5. **Registro público de propietario/profesional**: ¿se mantiene abierto (semilla y `registerAutonomo`) o pasa a invitación? Afecta a A-24 y a los tokens fijos del repositorio.

---

## 7. Limitaciones de esta fase y qué falta exactamente

| # | Limitación | Consecuencia | Cómo se cierra |
|---|---|---|---|
| L1 | Sin credenciales de Google ni salida de red al endpoint de reglas | No se sabe qué reglas están publicadas | `GET releases` + hash (§2.4) |
| L2 | Sin acceso a datos | No se sabe si existe una cuenta PROFESIONAL activa con ficha | recuento agregado N1 (§3.4) |
| L3 | Sin acceso a datos | No se sabe cuántos enlaces heredados o caducados siguen vivos | recuentos con proyección (§4.5) |
| L4 | Clon **superficial** (`depth` = 1 *shallow point*) | No se puede datar ningún cambio de reglas ni afirmar «sin cambios desde X» | clonar con historial completo si se necesita |
| L5 | Sin Java ni `firebase-tools` en el entorno | La verificación de reglas es E2 (harness), no el motor de Google | CI del PR (§8) o máquina autorizada |
| L6 | Sin entorno de aceptación | No hay E4; el portal profesional no se ha probado con una cuenta real | entorno con datos sintéticos |
| L7 | No se ha abierto ni probado ningún enlace real | Los fallos de A-04 están reproducidos contra el servicio con puerto falso, no contra producción | pruebas de aceptación |

---

## 8. Pruebas ejecutadas en esta fase

| Prueba | Tipo | Resultado |
|---|---|---|
| Lectura del ruleset real con el harness para `enlaces_registro.get` (9 casos: genérico activo/inactivo, nominal caducado activo/inactivo, inquilino caducado, gestión caducada, id inexistente) | E2 | **PASS en 5 controles, FAIL en 3** (documentados en §4.3) → A-26 |
| `npm ci` + comprobación de que el árbol de trabajo queda limpio tras las pruebas | — | OK (`git status` vacío) |
| Análisis de caminos de alta de profesional (grep exhaustivo de `profesionalId` en escrituras) | E1 | §3.1 |
| Verificación de publicación de reglas (CI, scripts, docs) | E1 | §2.2 |
| Comprobación de entorno (CLI, ADC, red) | — | §2.3 |

**No ejecutado:** emulador oficial (sin Java); suites completas (no aportan a esta fase y ya están registradas en el informe integral: 4.932/4.943 en `vitest`, 487 pruebas de seguridad en verde).

---

## 9. Qué **no** se ha hecho (restricciones cumplidas)

- No se ha modificado ningún archivo de aplicación, reglas, configuración, dependencias ni datos: `git diff 2563831 -- . ':!docs'` vacío.
- No se ha publicado ni desplegado nada; no se ha ejecutado `firebase deploy` ni ninguna escritura en producción.
- No se han cambiado credenciales, variables de entorno ni permisos.
- No se ha abierto, probado, revocado ni migrado ningún enlace real.
- No se ha consultado ningún dato personal (no había acceso; además los procedimientos propuestos están diseñados para no leerlo).
- No se ha fusionado nada. Se espera **autorización explícita** antes de tocar código o reglas.

---

### Anexo A — Huellas para comparar las reglas publicadas

| Fichero | Líneas | Bytes | Bloques `match` | SHA-256 |
|---|---|---|---|---|
| `firestore.rules` | 4.069 | 246.326 | 84 | `2c67dc0019c6d89d86f45e975bfbdd7e3a74bc29758d7446152f5f55fdcddfa3` |
| `storage.rules` | 66 | 3.984 | 3 (1 de raíz + 2) | `631d45acb977ec3a91040e33ed161ae8aa24bd3561dcf8106b41881a634e93b9` |
| `reglas-firestore-r12/firestore-cierre-corregido.rules` (**huérfano, no usar**) | 3.867 | — | — | `ceee1ffaf290c4c4dcec0046dd499b447a91ac389a93e480e633d98f95962d5c` |

### Anexo B — Clasificación de cada conclusión

| Conclusión | Clasificación |
|---|---|
| Proyecto y base esperados = `gestor-inmuebles-produccion` / base con nombre | **CONFIRMADA EN CÓDIGO** |
| La publicación de reglas es manual y no deja rastro en el repositorio | **CONFIRMADA EN CÓDIGO** |
| Las reglas publicadas coinciden con el SHA | **PENDIENTE DE VERIFICACIÓN** |
| Existe un duplicado de reglas huérfano y más laxo | **CONFIRMADA EN CÓDIGO** (A-27) |
| Ninguna pantalla actual escribe `profesionalId`; el auto-registro de profesional es rechazado por reglas | **CONFIRMADA EN CÓDIGO** |
| Existen cuentas PROFESIONAL activas con ficha en producción | **PENDIENTE DE VERIFICACIÓN** |
| La bandeja de avisos del profesional consulta sin filtro y muestra avisos de toda la instalación | **CONFIRMADA EN CÓDIGO** (+ A-20 reproducida) |
| Los tokens de captación no caducan, no se revocan y no miran el estado | **REPRODUCIDA EN PRUEBAS** (17 comprobaciones acumuladas) |
| La caducidad de `enlaces_registro` no se aplica al leer | **REPRODUCIDA EN PRUEBAS** (A-26) |
| Número de enlaces heredados/caducados vivos | **PENDIENTE DE VERIFICACIÓN** |
| A-20 activo en producción | **PENDIENTE DE VERIFICACIÓN** (depende de N1/`con_ficha`) |
