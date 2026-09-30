# DIAGNÓSTICO TÉCNICO — MODELO DE TITULARES + BAJA/ELIMINACIÓN DE INMUEBLES

**Fecha:** 2026-09-30
**Rama:** `arena/01a0f18c-gestor-de-inmuebles-vercel`
**Commit base:** `c6b858d4bc0e744ec302e497f2d318884e669c0d`
**Alcance:** INSPECCIÓN Y DIAGNÓSTICO. **Sin cambios de código, datos, reglas, commits ni PR.**
**Estado del repo al auditar:** `git status` limpio (sin modificaciones previas).

---

## 0. RESUMEN EJECUTIVO (3 hallazgos principales)

| # | Hallazgo | Clasificación |
|---|---|---|
| **H1** | El modelo de titularidad es **binario por diseño** (`propietarioPrincipalId` + `propietarioSecundarioId`). No existe array `titulares[]`. **El límite real es 2 titulares por inmueble** y la cuenta de acceso tiene **un único** `propietarioId` escalar (1 cuenta ↔ 1 titular). | **G7** — arquitectura insuficiente para el caso real |
| **H2** | Un PROPIETARIO **no puede crear otro titular**. Bloqueo triple y coincidente: no hay UI, no hay servicio, y `firestore.rules` lo prohíbe de forma absoluta (`propietarios/{id}` create exige `propietarioId == myPropId()`). | **G5** — funcionalidad inexistente (+ **G7**) |
| **H3** | "Eliminar inmueble" es **borrado físico exclusivo de MASTER**. `firestore.rules:465` → `allow delete: if isMasterAdmin()`. El PROPIETARIO recibe **permission-denied silencioso**: el handler hace borrado optimista en React, la tarjeta desaparece, el documento sigue en Firestore y **reaparece** en el siguiente snapshot o al recargar. Además **desvincula candidatos en Firestore aunque el borrado falle** (efecto destructivo colateral). **No existe baja lógica, ni estado INACTIVO, ni archivado.** | **G4** + **G6** + **G2** |

---

## A. MODELO ACTUAL DE TITULARES

### A.1 Cómo se representa un titular

Colección **`propietarios/{propietarioId}`**, tipo `Propietario` (`src/types.ts:425-455`):

| Campo | Notas |
|---|---|
| `id` | `prop-<timestamp>` (generado en `PropietariosSection.tsx:255`) o `prop_<ts>_<rand>` (`authService.ts:548`) |
| `nombre`, `nifCif` | Identidad fiscal |
| `tipoPropietario` | `'persona_fisica' \| 'persona_juridica' \| 'comunidad_bienes'` |
| `telefono`, `email` | Contacto |
| `direccion`, `ciudad`, `codigoPostal`, `provincia` | Domicilio a efectos de notificaciones |
| `tieneRepresentanteLegal`, `nombreRepresentante`, `nifRepresentante`, `cargoRepresentante`, `tituloRepresentacion` | Representación |
| `cuentasBancarias: CuentaBancariaPropietario[]` | 1..N cuentas (`types.ts:415-423`) |
| `notasPrivadas`, `fechaCreacion`, `fechaActualizacion` | Metadatos |

**No hay** campo de porcentaje de participación, ni de "titular de una cartera", ni de grupo/agrupación patrimonial.

### A.2 Cómo se representa la cuenta de acceso

Colección **`usuarios/{usuarioId}`**, tipo `UsuarioApp` (`src/types.ts:1695-1719`):
`id`, `authUid`, `nombre`, `apellidos`, `email`, `telefono`, `tipoPerfil`, `estado`, `roles[]`, `permisos[]`, `inmuebleIds[]`, `propietarioId?`, `profesionalId?`, `contratoIds?`, `enlaceRegistroId?`.

Espejo no falsificable **`usuarios_auth/{uid}`** (`firestore.rules:265-312`), que es **lo que las reglas leen** (`me()`, `myPropId()`, `myInmuebleIds()`). Su escritura exige `indexIsTruthful()` (`rules:230-258`): los campos sensibles deben coincidir con `usuarios/{id}`.

### A.3 Cómo se relaciona cuenta ↔ titular

**Relación estrictamente 1:1 y en un solo sentido:**

```
usuarios.propietarioId  (string escalar, ÚNICO)  ──►  propietarios/{id}
```

- Helper de reglas: `myPropId() = me().propietarioId` (`firestore.rules:154-156`).
- `syncAuthIndex()` escribe `propietarioId: usuario.propietarioId || ''` (`src/lib/authService.ts:95`) → **un solo string, nunca una lista**.
- `indexIsTruthful()` compara `incoming().propietarioId == src.propietarioId` → un espejo con un array rompería la validación.

**No existe `propietarioIds[]`.** Una sola cuenta de acceso no puede representar a dos titulares.

**Única vía de delegación** (`UsuarioApp.inmuebleIds[]`): permite operar inmuebles de **otro** titular. Helper `canReachInmuebleId()` (`rules:167-170`). Pero:
- `usuarios` update **prohíbe al propio usuario** modificar `inmuebleIds` (está en la lista negra de `affectedKeys()`, `rules:1112-1119`).
- Solo `isMasterAdmin()` puede concederlo.

### A.4 Cómo se relaciona titular ↔ inmueble

Dos mecanismos **paralelos y redundantes**, ambos de cardinalidad fija:

**(a) Campos escalares en `Inmueble` (`src/types.ts:499-503`):**

```ts
propietarioId?: string;            // "ID permanente del Propietario titular vinculado"
propietarioPrincipalId?: string;
propietarioSecundarioId?: string;
```

**(b) Copia desnormalizada embebida en el propio documento del inmueble** — `DatosFiscalesInmueble` (`src/types.ts:467-476`):

```ts
propietarioPrincipal: PropietarioFiscal;   // nombre, nifDni, direccion, telefono, email, esPersonaJuridica, propietarioId
tieneSegundoPropietario?: boolean;
segundoPropietario?: PropietarioFiscal;
```

**Consecuencia (gap de coherencia):** los datos fiscales del inmueble son una **foto** de la ficha del titular en el momento del alta. Editar `propietarios/{id}` **no propaga** a `inmuebles.datosFiscales`. El propio código lo admite literalmente en `PropietariosSection.tsx:1322`:

> *"Los inmuebles ya existentes conservarán sus datos fiscales archivados."*

**No existe** `titulares: Titular[]`, ni `%` de participación por inmueble, ni colección de vinculación (join table).

### A.5 Número máximo REAL de titulares por inmueble

> ## **2**

Confirmado en las 4 capas:

| Capa | Evidencia |
|---|---|
| **Tipos** | `types.ts:500-501` — exactamente 2 campos; `types.ts:473-475` — exactamente 2 bloques fiscales |
| **UI (alta)** | `InmueblesSection.tsx:3184-3195` — checkbox único *"Inmueble con Segundo Propietario / Co-Arrendador"*; selectores `newSelectedPropId` (`:2980`) y `newSelectedProp2Id` (`:3208`, filtrado `p.id !== newSelectedPropId`) |
| **UI (edición)** | `InmueblesSection.tsx:636-661` — resolución de `prop1Id` y `prop2Id`; escritura en `:778-780` |
| **Motor de contratos LAU** | `src/utils/contratoEngine.ts:225-254` — resuelve sólo `owner1` (`propietarioPrincipalId`) y `owner2` (`propietarioSecundarioId`); `tieneSegundoProp` es booleano (`:255`) |
| **Motor de liquidaciones (BLOQUE B)** | `src/tesoreria/liquidacionEngine.ts:83-90` y `:305-314` — `repartoCopropiedad: { segundoPropietarioId, segundoPropietarioNombre, porcentajeSegundo }` ⇒ reparto **binario** |
| **Fiscalidad** | `src/utils/fiscalEngine.ts:587-588` — un solo `propietarioId` y un solo `propietarioNombre` (sólo `propietarioPrincipal`) |
| **Documentación** | `docs/auditoria/DIAGNOSTICO_FUNCIONAL_2026-09-16.md:36` — *"2 propietarios/copropiedad con porcentaje en documentos fiscales"* |

### A.6 ¿Existe soporte real para 3, 4 o N titulares?

> # **NO.**

Verificado el caso real solicitado:

| Requisito | ¿Soportado? | Motivo |
|---|---|---|
| `INMUEBLE X → titular A + B + C` | ❌ | Sólo hay 2 ranuras (`propietarioPrincipalId`, `propietarioSecundarioId`). El tercero no tiene dónde escribirse. |
| `INMUEBLE Y → A + C` | ⚠️ | Posible sólo si A es principal y C secundario; y **C no vería el inmueble** (ver A.7). |
| `INMUEBLE Z → B + C` | ⚠️ | Igual: C sería "secundario" e invisible para sí mismo. |
| `PROPIETARIO A crea B, B crea C…` | ❌ | Imposible por UI, servicio y reglas (ver apartado B). |

### A.7 Limitaciones encontradas

1. **Cardinalidad fija 2** en tipos, UI, contratos, liquidaciones y fiscalidad.
2. **1 cuenta ↔ 1 titular** (`propietarioId` escalar en `usuarios`/`usuarios_auth`).
3. **El titular "secundario" es invisible para sí mismo.** Ni `scopedInmuebles` (`App.tsx:540-546`) ni `misViviendas` (`PropietarioPortalSection.tsx:99-104`) consultan `propietarioSecundarioId`; sólo `propietarioId` y `propietarioPrincipalId`. Único sitio donde sí se considera: `PropietariosSection.tsx:108` (vista de administración) y `contratoEngine.ts:239`.
   ⇒ Un cotitular en ranura 2 sólo accede si un administrador le añade manualmente el ID en `usuarios.inmuebleIds`.
4. **Datos fiscales duplicados y desincronizados** (A.4b).
5. **Fiscalidad de un solo titular:** `fiscalEngine.ts:587-588` ignora al segundo titular ⇒ la imputación fiscal de la copropiedad no existe.
6. **Reparto de liquidación binario y externo al inmueble** (`config_liquidacion/{propietarioId}`, escritura **sólo MASTER** — `firestore.rules:1751-1758`).
7. **`propietarioId` vs `propietarioPrincipalId` redundantes y divergentes.** Se escriben siempre juntos en el alta (`InmueblesSection.tsx:508-509`), pero las reglas de `update` y de `create` los tratan como alternativos ⇒ dos fuentes de verdad para "quién es el titular".
8. **No existe el concepto "cartera" como entidad.** Es una derivación implícita en cliente (`App.tsx:537-553`). Tampoco existe entidad **gestor**: `GESTOR_INMUEBLES` es sólo un rol (`types.ts:1909-1931`), sin relación gestor↔titular.
9. **Lectura de `inmuebles` sin aislamiento servidor:** `allow get/list: if isStaff()` (`rules:445-450`) y la suscripción es a la **colección completa** (`firebase.ts:261-277`, invocada sin `dataScope` en `App.tsx:967`). Todo propietario descarga la ficha completa (IBAN, NIF, inquilino, notas internas) de **todos** los inmuebles; el filtro es sólo de cliente.

---

## B. ¿PUEDE UN PROPIETARIO CREAR OTRO TITULAR?

> # **NO.** Bloqueo triple y coincidente.

### B.1 Frontend — **NO existe el flujo**

| Pantalla | Qué permite |
|---|---|
| `PropietarioPortalSection` (portal del propietario, 1008 líneas) | Pestañas: Mis Viviendas / Mis Profesionales / Mis Contratos / Mis Liquidaciones / Morosidad / Gastos / Cobros / Incidencias / **Mi Perfil**. |
| Pestaña **Mi Perfil** (`PropietarioPortalSection.tsx:868-1003`) | Sólo **su** ficha fiscal: `handleGuardarFicha()` (`:142-185`) construye `Propietario` forzando `id: currentUser.propietarioId` (`:166`). |
| Botón **"Gestionar Propietarios"** (`InmueblesSection.tsx:2968-2978`) | Navega a la sección `propietarios`, pero el route-guard de `App.tsx:3390` **sustituye `PropietariosSection` por `PropietarioPortalSection`** cuando `tipoPerfil === 'PROPIETARIO'`. Es un callejón sin salida. |
| `PropietariosSection` (CRUD de titulares, `:255` crea `prop-<ts>`) | **Sólo se renderiza para perfil ≠ PROPIETARIO** (`App.tsx:3406-3412`). |
| `CrearUsuarioModal` / `CrearEnlaceRegistroModal` | Montados únicamente desde `AdminControlCenter` (`App.tsx:3778`, `:4162`). `SECCIONES_PROPIETARIO` (`App.tsx:286-311`) **no incluye `'administracion'`**. |

⇒ **Cero puntos de entrada** en el portal del propietario para dar de alta un titular o una cuenta de acceso.

### B.2 Servicios — existe la primitiva, no el flujo

- `savePropietarioFirestore()` (`src/lib/firebase.ts:239-246`) y `handleSavePropietario()` (`App.tsx:2675-2687`) **sí existen** y son genéricos.
- `deletePropietarioFirestore()` existe (`firebase.ts:251-257`) pero **`handleDeletePropietario` no se pasa nunca al portal** (sólo a `PropietariosSection`, `App.tsx:3410`).
- `registrarUsuarioConEnlace()` (`authService.ts:455-627`) es la única vía real de alta de titulares: crea `usuarios/{id}` + `usuarios_auth/{uid}` + `propietarios/{propId}`. **Se invoca sólo desde `PortalRegistroView`** y requiere un `enlaces_registro` activo.
- `enlaces_registro` → `allow create, delete: if isStaff()` (`rules:1156`): las reglas **sí** permitirían a un propietario crear invitaciones, **pero no hay UI que lo haga**.

### B.3 Firestore Rules — **bloqueo absoluto**

```js
// firestore.rules:412-429
match /propietarios/{propietarioId} {
  allow get:    if isMasterAdmin() || ownsPropietario(propietarioId);
  allow list:   if isMasterAdmin();                       // ← un propietario NO puede listar titulares
  allow create: if isMasterAdmin() || (
                  isPropietarioRole()
                  && propietarioId == myPropId()          // ← SÓLO puede crear SU PROPIA ficha
                  && 'id' in incoming() && incoming().id == propietarioId
                );
  allow update: if isMasterAdmin() || ( ... propietarioId == myPropId() ... );
  allow delete: if isMasterAdmin();
}
```

- **`create`** exige que el ID del documento sea **exactamente** su propio `propietarioId` ⇒ es **imposible por construcción** crear la ficha de otro titular con cualquier ID distinto.
- **`list`** denegado ⇒ no puede descubrir titulares existentes (de ahí el `doc(db,'propietarios',pid)` individual en `firebase.ts:208-220`).
- `usuarios_auth` (`rules:271-282`) exige `request.auth.uid == uid` + `indexIsTruthful()` ⇒ no se puede crear un espejo para un tercero.
- `usuarios` (`rules:1084-1100`) permite `create` a cualquier firmado, pero con `authUid == request.auth.uid` y, si se indica `propietarioId`, **éste debe NO existir** ⇒ crear una cuenta apuntando a un titular nuevo es inútil: la ficha `propietarios` nunca podrá crearse.

### B.4 ¿Limitación intencionada o ausencia funcional?

**Ambas cosas a la vez:**

- **Intencionada en seguridad:** el comentario de `rules:413` (*"Cada propietario sólo puede leer su propia ficha"*) y el helper `ownsPropietario()` muestran una decisión deliberada de aislamiento. El diseño asume **1 usuario = 1 titular = 1 cartera**.
- **Ausencia funcional respecto al caso real:** nunca se construyó el modelo N-titulares. No hay `titulares[]`, no hay porcentajes, no hay invitación de cotitulares, no hay relación cuenta↔N titulares. **Es una carencia de modelo, no una restricción de negocio.**

### B.5 Qué habría que cambiar (diagnóstico, sin implementar)

> ⚠️ Requiere **cambio de modelo**. No es un parche de UI ni de reglas.

1. **Modelo de datos:** introducir una entidad de vinculación (`titularidades` / subcollección `inmuebles/{id}/titulares/{titularId}`) con `{ propietarioId, porcentaje, rol, desde, hasta, activo }`, o un array `titulares[]` en `Inmueble`, **sustituyendo** `propietarioPrincipalId`/`propietarioSecundarioId` (manteniéndolos como compatibilidad/índice de consulta).
2. **Identidad:** `usuarios.propietarioId` escalar → permitir múltiples titularidades por cuenta (`propietarioIds[]` o colección `titularidades_usuario`), con repercusión directa en `usuarios_auth`, `indexIsTruthful()`, `myPropId()`, `ownsPropietario()`, `contratoEsMio()`, `gastoEsMio()`, `aisladoEsMio()`… **Toda la capa de aislamiento de reglas está construida sobre `myPropId()` escalar.**
3. **Alta de titulares por el propietario:** flujo de invitación cotitular (reutilizar `enlaces_registro` con `tipoPerfil: 'PROPIETARIO'` + `propietarioIdVinculado`) y reglas que permitan `create` de `propietarios/{nuevoId}` a un propietario que actúa como "titular principal" de una cartera.
4. **Datos fiscales:** dejar de desnormalizar (`datosFiscales.propietarioPrincipal/segundoPropietario`) o establecer propagación/contraste; hoy son copias huérfanas.
5. **Contratos / liquidaciones / fiscalidad:** `contratoEngine`, `liquidacionEngine.repartoCopropiedad` y `fiscalEngine` están hard-coded a 2 titulares.
6. **Visibilidad del cotitular:** incluir `propietarioSecundarioId` (o los nuevos índices) en `scopedInmuebles` y en `misViviendas`.
7. **Lectura de `inmuebles`:** el aislamiento actual es sólo de cliente (`allow list: if isStaff()`); hay que acotarlo.

---

## C. INMUEBLE DE PRUEBA — QUÉ OCURRE AL INTENTAR ELIMINARLO DESDE PROPIETARIO

Existen **dos recorridos distintos** y conviene distinguirlos, porque producen síntomas distintos.

### C.1 RECORRIDO 1 — Portal del Propietario (`Portal del Propietario → Mis Viviendas / Mi Perfil`)

| Elemento | Valor |
|---|---|
| **Pantalla** | Sección `propietarios` → `PropietarioPortalSection` (`App.tsx:3390-3404`, se fuerza al entrar: `App.tsx:509-512`) |
| **Componente** | `src/components/sections/PropietarioPortalSection.tsx` |
| **Pestaña "Mis Viviendas"** | `:298-370`. Tarjeta por inmueble. **Única acción disponible:** botón *"Ver detalles de vivienda"* (`:365-372`). |
| **Pestaña "Mi Perfil"** | `:868-1003`. Sólo lectura: *"Viviendas en propiedad autorizadas: N viviendas"* (`:906-909`) + formulario de su ficha fiscal. |
| **Handler** | `onNavigateToInmueble(inm.id)` → `App.tsx:3403` → `setActiveSection('inmuebles')` (**ignora el `id`** pasado) |
| **Servicio** | Ninguno. |
| **Operación Firestore** | Ninguna. |
| **Reglas** | No intervienen. |
| **Error** | Ninguno (no hay nada que falle). |
| **Resultado final** | **El botón de eliminar NO EXISTE.** No hay handler, no hay modal de confirmación, no hay servicio. La interfaz del portal del propietario es de **sólo lectura** sobre viviendas. |

> **Clasificación: G5 — funcionalidad inexistente.**

### C.2 RECORRIDO 2 — Sección `Inmuebles` (el propietario SÍ tiene acceso: `App.tsx:289`)

Este es el recorrido en el que "parece ejecutarse pero no hace nada".

| Paso | Elemento | Referencia |
|---|---|---|
| **1. Pantalla** | Sección `inmuebles` → `InmueblesSection` | `App.tsx:3686-3724` |
| **2. Botón** | Icono papelera. Dos puntos: (a) tarjeta del grid, (b) cabecera de la ficha de detalle | `InmueblesSection.tsx:1877-1890` y `:957-966` |
| **3. Visibilidad** | **SÍ aparece y SÍ está habilitado.** Condición de render: `{onDeleteInmueble && (…)}`; `onDeleteInmueble` se pasa **incondicionalmente** | `App.tsx:3700` → `handleDeleteInmueble` |
| **4. Handler 1** | `setInmuebleToDelete(inm)` | `InmueblesSection.tsx:1882`, `:961` |
| **5. Modal** | `ConfirmDeleteModal` — texto genérico: *"¿Estás seguro de que deseas eliminar el inmueble «X»? Los candidatos vinculados pasarán a estado 'Sin inmueble'."* **Sin comprobación de contratos, inquilinos, gastos ni dependencias** | `InmueblesSection.tsx:3392-3409`; componente `src/components/ConfirmDeleteModal.tsx` |
| **6. Handler 2** | `onDeleteInmueble(id)` → **`handleDeleteInmueble`** | `InmueblesSection.tsx:3401-3402` → `App.tsx:1662-1683` |

**Código exacto de `handleDeleteInmueble` (`App.tsx:1662-1683`):**

```ts
const handleDeleteInmueble = (inmuebleId: string) => {     // ← NO es async, NO devuelve Promise
  setInmuebles((prev) => {                                  // ① BORRADO OPTIMISTA en React…
    const next = prev.filter((i) => i.id !== inmuebleId);
    try { localStorage.setItem('rentselect_inmuebles', JSON.stringify(next)); } catch (e) {}
    return next;                                            //    …y persistido en localStorage
  });
  deleteInmuebleFirestore(inmuebleId);                      // ② fire-and-forget: SIN await, SIN .catch
  setCandidatos((prev) => { … saveCandidatoFirestore(updated); … });  // ③ efectos colaterales
};
```

| Paso | Elemento | Referencia |
|---|---|---|
| **7. Servicio** | `deleteInmuebleFirestore(inmuebleId)` | `src/lib/firebase.ts:371-381` |
| **8. Documento + operación** | `deleteDoc(doc(db, 'inmuebles', inmuebleId))` y, en "mejor esfuerzo", `deleteFichaPublicaInmueble(inmuebleId)` | `firebase.ts:373`, `:376` |
| **9. Regla que interviene** | **`firestore.rules:465` → `allow delete: if isMasterAdmin();`** | `rules:465` |
| **10. Condición evaluada** | `isMasterAdmin()` = `isSignedIn() && authEmail() == 'sarqsan2@gmail.com'` | `rules:28-31` |
| **11. Error real** | **FirebaseError: `permission-denied` / "Missing or insufficient permissions"** — capturado y **tragado**: `catch (err) { console.error('Error deleting inmueble from Firestore:', err); }`. **No se relanza, no se muestra en UI, no se revierte el estado local.** | `firebase.ts:379-381` |
| **12. Resultado final** | Ver desglose ↓ | |

**Resultado final — secuencia observable:**

1. El usuario pulsa la papelera → aparece el modal → confirma.
2. **La tarjeta desaparece inmediatamente** de la UI (borrado optimista) y se reescribe `localStorage.rentselect_inmuebles` sin el inmueble.
3. **El documento de Firestore NO se borra.** `permission-denied` silencioso.
4. **Nada informa al propietario.** Ni toast, ni alerta, ni reversión. Sólo `console.error`.
5. **El inmueble REAPARECE** en cuanto el listener vuelva a emitir. `subscribeInmuebles` (`firebase.ts:261-277`) escucha la **colección completa** (`App.tsx:967` lo invoca **sin `dataScope`**) y su callback hace `setInmuebles(data)` con todos los documentos (`App.tsx:967-982`). Dispara en: primer cambio de cualquier inmueble por cualquier usuario, o **al recargar la página** (estado inicial desde localStorage + primer snapshot).
6. **Efecto destructivo colateral (importante):** el paso ③ de `handleDeleteInmueble` sí se ejecuta y **SÍ persiste**: pone `inmuebleId: ''` / `inmuebleNombre: 'Sin inmueble asignado'` en los candidatos vinculados y los escribe en Firestore. La regla `candidatos` update es `if isSignedIn() || (…)` (`rules:988-1006`) ⇒ **cualquier usuario autenticado puede modificar cualquier candidato**. Resultado: **los candidatos quedan huérfanos aunque el inmueble siga existiendo.**

> **Clasificación: G4 (roto) + G6 (permisos) + G2 (UX: fallo silencioso, sin rollback, sin mensaje).**

### C.3 Respuesta a las hipótesis planteadas

| Hipótesis | ¿Confirmada? |
|---|---|
| El botón no aparece | **SÍ en el Portal del Propietario** (C.1). NO en la sección Inmuebles. |
| Aparece pero está deshabilitado | ❌ No. Está habilitado siempre. |
| Parece ejecutarse pero no hace nada | ✅ **SÍ** — es el síntoma dominante. |
| Produce un error visible | ❌ No. Se traga en `console.error`. |
| Produce permission-denied | ✅ **SÍ**, en Firestore, pero **silenciado**. |
| Hace baja lógica pero la UI no se actualiza | ❌ No existe baja lógica (ver apartado D). |
| Elimina el documento pero reaparece | ❌ Al revés: **NO elimina** el documento; la UI lo oculta y el snapshot lo restaura. |
| Existe una dependencia que impide la operación | ❌ **No.** No hay ninguna comprobación de dependencias en el código. La denegación es puramente de rol. |

### C.4 Nota sobre el alta del inmueble de prueba (coherencia del diagnóstico)

Para que el alta persista, el documento **debe** llevar `propietarioId` o `propietarioPrincipalId` igual al `propietarioId` del usuario (`rules:452-457`). Sin embargo:

- `newSelectedPropId` se inicializa a `''` y **no hay ningún `useEffect` en `InmueblesSection`** que lo preseleccione (verificado: 0 `useEffect` en el archivo).
- El desplegable de titulares muestra `scopedPropietarios`, que para un propietario es **sólo su ficha** (`App.tsx:556-566` + `firebase.ts:197-220`).
- Si el propietario **no selecciona explícitamente** su ficha en la pestaña *Apartado Fiscal*, el alta se crea con `propietarioId: undefined` → `JSON.parse(JSON.stringify())` en `sanitizeInmuebleForFirestore` (`firebase.ts:332`) **elimina la clave undefined** → la regla no la encuentra → **permission-denied silencioso** (mismo patrón: `catch` + `console.error` en `firebase.ts:364-366`).

**Consecuencia:** el inmueble de prueba puede existir **sólo en `localStorage`** (fantasma). Y además:

- `handleUpdateInmueble` → `allow update` exige `existing().propietarioId == myPropId()` ⇒ **editar también fallaría en silencio**.
- `allow delete: if isMasterAdmin()` ⇒ **eliminar falla en todos los casos**.

**Recomendación de verificación manual (sin tocar datos):** abrir la consola del navegador durante la prueba. Aparecerá `Error deleting inmueble from Firestore: FirebaseError: Missing or insufficient permissions` (y, si procede, `Error saving inmueble to Firestore: …`). Y comprobar en Firestore si el documento `inmuebles/{id}` existe y si tiene `propietarioId`.

---

## D. DEPENDENCIAS DEL INMUEBLE

### D.1 ¿Existe comprobación de dependencias antes de eliminar?

> # **NO.**

- `ConfirmDeleteModal` es un componente **genérico y tonto** (sólo `title`/`description`/`onConfirm`). No recibe ni evalúa dependencias.
- La descripción del modal (`InmueblesSection.tsx:3396`) es **estática** y sólo menciona candidatos: *"Los candidatos vinculados pasarán a estado 'Sin inmueble'"*.
- `handleDeleteInmueble` tampoco consulta nada: filtra el array local y llama a `deleteDoc`.
- `deleteInmuebleFirestore` no hace cascada: **sólo** borra `inmuebles/{id}` y, en "mejor esfuerzo", `fichas_publicas_inmueble/{id}`.
- **`firestore.rules` no expresa ninguna restricción por dependencias** en `inmuebles` (sólo `allow delete: if isMasterAdmin()`).

⇒ **El sistema NO está diseñado para impedir la eliminación por dependencias.** La denegación observada es **exclusivamente de rol**, no de integridad referencial.

### D.2 Colecciones que referencian un inmueble (y que quedarían huérfanas)

Enumeradas desde `firestore.rules` (75 colecciones). Referencian `inmuebleId` directa o indirectamente:

| Dominio | Colecciones | Riesgo si se borra el inmueble |
|---|---|---|
| **Contratos / arrendamiento** | `contratos_formalizacion` | Contrato vigente huérfano; `inmueble.contratoActivoId` apunta a un contrato sin vivienda |
| **Inquilinos / Portal** | `usuarios` (`contratoIds`), `mensajes_portal`, `suministros`, `lecturas_suministro`, `cambios_titular` | El inquilino pierde `get` del inmueble (`rules:445-449` depende de `contratoIdsAutorizados`/`contratoActivoId`) ⇒ **portal roto** |
| **Economía** | `gastos`, `gastos_recurrentes`, `prestamos`, `gastos_inmuebles`, `liquidaciones_propietarios`, `ordenes_pago`, `ficheros_sepa`, `mandatos_sepa`, `config_liquidacion`, `movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias` | Histórico contable y liquidaciones sin soporte; préstamo/hipoteca sin garantía referenciada |
| **Morosidad (BLOQUE C)** | `expedientes_morosidad`, `expedientes_morosidad_hist`, `evidencias_morosidad`, `compromisos_morosidad`, `politicas_morosidad`, `morosidad_resumen_propietario` | Expediente legal sin vivienda; espejo del propietario inconsistente |
| **Mantenimiento / incidencias** | `incidencias`, `tareas_mantenimiento`, `garantias_reparacion`, `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales` | Trabajos y garantías huérfanos |
| **Reformas / inversión** | `necesidades_reforma`, `proyectos_reforma`, `analisis_inversion` | Inversión asociada a vivienda inexistente |
| **Inventario / activos** | `inventario_inmuebles`, `inventario_historial`, `habitaciones_inmueble` | Inventario y habitaciones huérfanos |
| **Seguros** | `polizas_seguros`, `siniestros`, `solicitudes_seguro_impago`, `configuracion_aseguradoras` | Póliza sin riesgo asegurado |
| **Captación** | `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion` | Sólo `candidatos` se "repara" (a `''`); el resto queda huérfano |
| **Actas (BLOQUE D)** | `actas`, `actas_evidencias`, `actas_incidencias`, `actas_otp` | Acta de entrada/salida sin vivienda ⇒ **valor probatorio comprometido** |
| **Publicación / sindicación** | `sindicacion_inmuebles`, `fichas_publicas_inmueble` | Sólo la ficha pública se limpia (mejor esfuerzo); los anuncios en portales quedan fuera |
| **Facturación** | `facturas`, `registros_facturacion`, `envios_verifactu`, `series_facturacion`, `facturas_electronicas_b2b` | Facturas sin inmueble; riesgo VERI*FACTU |
| **Otros** | `propuestas_inmobiliaria`, `leads_inmobiliario`, `expedientes_recomercializacion`, `notificaciones`, `financiaciones` | Huérfanos |

**Dependencias del inmueble de prueba concretas:** no auditable sin acceso de lectura a Firestore (fuera del alcance de esta orden, que prohíbe tocar datos). **Lo relevante es que da igual:** el borrado está denegado por rol, no por dependencias. Si un MASTER lo borrara, **todas** las colecciones anteriores quedarían huérfanas **sin cascada ni aviso**.

### D.3 Consecuencias para las preguntas del apartado 3.I

| Pregunta | Respuesta |
|---|---|
| ¿Se informa correctamente al propietario? | **No.** No hay mensaje de error ni explicación. |
| ¿Existe alternativa de "dar de baja/archivar"? | **No.** Ver apartado D/E. |
| ¿La interfaz explica qué debe hacer? | **No.** Ni en el portal (no hay acción) ni en Inmuebles (modal genérico). |
| ¿El comportamiento es coherente con la gestión patrimonial? | **No.** Un inmueble con contrato, actas, liquidaciones y facturas no debería poder borrarse físicamente; y el propietario no tiene ninguna vía para retirarlo de su cartera. |

---

## E. PERMISOS — PROPIETARIO vs ADMINISTRADOR vs MASTER

### E.1 Definiciones reales (importante: **no coinciden con los nombres**)

| Actor | Definición real |
|---|---|
| **MASTER** | `firestore.rules:28-31` → `isMasterAdmin()` = `request.auth.token.email == 'sarqsan2@gmail.com'`. **Un único email en el código.** Es el **único** con privilegios de escritura globales. |
| **ADMINISTRADOR** | `tipoPerfil === 'ADMINISTRADOR'` en `usuarios`. **Las reglas NO lo reconocen:** no existe `isAdminRole()` en `firestore.rules` (verificado: 254 usos de `isMasterAdmin`, 0 de rol administrador). En el frontend ve todo (`App.tsx:540`, `:557`, `:3768`), pero **sus escrituras son denegadas**. |
| **PROPIETARIO** | `isPropietarioRole()` = `usuarios_auth.estado == 'ACTIVO' && tipoPerfil == 'PROPIETARIO'`. Aislamiento por `myPropId()`. |

> ⚠️ **Hallazgo mayor:** el rol **ADMINISTRADOR** (distinto de `sarqsan2@gmail.com`) es **prácticamente cosmético**: tiene toda la UI de `AdminControlCenter` pero **no puede crear/modificar/borrar propietarios, inmuebles, contratos ni gastos**. Sólo puede escribir en lo que las reglas abren a `isStaff()` (p. ej. `enlaces_registro`, `especialidades`) y en `candidatos` (abierto a `isSignedIn()`).

### E.2 Matriz de permisos efectivos (comportamiento REAL, no teórico)

| Operación | PROPIETARIO | ADMINISTRADOR (no master) | MASTER (`sarqsan2@gmail.com`) |
|---|---|---|---|
| **Crear inmueble** | ✅ Sólo si el doc lleva `propietarioId` o `propietarioPrincipalId` == su `propietarioId` (`rules:452-457`).<br>⚠️ El formulario **no lo preselecciona** ⇒ falla en silencio si no lo elige a mano. | ❌ **Denegado** (`isMasterAdmin()` no se cumple; `isPropietarioRole()` tampoco) | ✅ |
| **Editar inmueble** | ✅ Si `existing.propietarioId == myPropId()` **o** `propietarioPrincipalId == myPropId()` **o** `canReachInmuebleId()` (`rules:458-464`).<br>⚠️ Si el alta no persistió `propietarioId` ⇒ **denegado en silencio**. | ❌ Denegado | ✅ |
| **Dar de baja inmueble** | ❌ **No existe el concepto** en el sistema | ❌ No existe | ❌ No existe |
| **Eliminar inmueble** | ❌ **`allow delete: if isMasterAdmin()`** (`rules:465`).<br>UI: botón visible + modal + borrado optimista + **permission-denied silencioso** | ❌ Denegado (mismo síntoma silencioso desde `AdminControlCenter`/`InmueblesSection`) | ✅ `deleteDoc(inmuebles/{id})` + `fichas_publicas_inmueble/{id}` (mejor esfuerzo). **Sin cascada.** |
| **Crear titulares** | ❌ **`rules:418-422`** exige `propietarioId == myPropId()` ⇒ imposible crear otra ficha. Además `list` denegado (`rules:415`). | ❌ **Denegado por reglas**, aunque la UI (`PropietariosSection`) lo ofrezca ⇒ **fallo silencioso** | ✅ |
| **Asociar titulares a inmueble** | ⚠️ Sólo a **sí mismo** como principal. El selector de 2º titular queda **vacío** (el `scopedPropietarios` tiene 1 elemento y se filtra `p.id !== newSelectedPropId`). Puede escribir el 2º **manualmente** (texto libre en `datosFiscales.segundoPropietario`), pero sin vincular cuenta. | ⚠️ UI completa (ve todas las fichas) pero la escritura del inmueble está denegada ⇒ **no persiste** | ✅ |
| **Modificar titulares** | ⚠️ **Sólo su propia ficha** (`rules:423-427`); nunca la de otro. Desde `PropietarioPortalSection → Mi Perfil`. | ❌ Denegado | ✅ |
| **Eliminar titulares** | ❌ `rules:428` (`isMasterAdmin`) — y `handleDeletePropietario` ni se pasa al portal | ❌ Denegado | ✅ |
| **Crear cuentas / invitaciones** | ❌ Sin UI (`SECCIONES_PROPIETARIO` no incluye `administracion`). Reglas: `enlaces_registro` create sería `isStaff()` ⇒ posible, pero inalcanzable. | ⚠️ UI sí; `enlaces_registro` create **permitido** (`isStaff()`), pero el alta posterior de `propietarios`/`inmuebles` denegada | ✅ |

### E.3 ¿Puede un PROPIETARIO dar de baja / eliminar un inmueble de su cartera?

> # **NO.**
> - **Eliminar:** denegado por `firestore.rules:465` (`isMasterAdmin` únicamente).
> - **Dar de baja:** **no existe la operación** en ninguna capa (ni modelo, ni servicio, ni UI, ni reglas).

### E.4 ¿Puede un PROPIETARIO modificar SÓLO inmuebles de su ámbito? (aislamiento entre carteras)

| Capa | ¿Aislado? | Detalle |
|---|---|---|
| **Lectura Firestore** | ❌ **NO** | `allow get/list: if isStaff()` (`rules:445-450`). `subscribeInmuebles` escucha la **colección completa** (`firebase.ts:261-277`; llamada **sin `dataScope`** en `App.tsx:967`). Cualquier propietario recibe **todos** los inmuebles con IBAN, NIF, inquilino y notas internas. |
| **Filtrado cliente** | ✅ Sí | `scopedInmuebles` (`App.tsx:537-553`) y `misViviendas` (`PropietarioPortalSection.tsx:99-104`). ⚠️ Ninguno de los dos considera `propietarioSecundarioId`. |
| **Escritura Firestore (update)** | ✅ Sí | `rules:458-464`: exige titularidad o `canReachInmuebleId()`. Correcto. |
| **Escritura Firestore (create)** | ✅ Sí | `rules:452-457`. Correcto. |
| **Escritura Firestore (delete)** | ✅ Denegado a todos menos MASTER | Correcto en intención, incorrecto en UX. |
| **Efectos colaterales (`candidatos`)** | ❌ **NO** | `allow update: if isSignedIn()` (`rules:988-1006`) ⇒ cualquier propietario puede modificar **cualquier** candidato de **cualquier** cartera. `handleDeleteInmueble` lo hace de hecho. |
| **Permisos declarativos (`permisos[]`)** | ❌ No se usan | Verificado: **ningún** componente evalúa `currentUser.permisos` (salvo para mostrarlos en `AuthModal.tsx:135-136` y en el contexto de tutoriales). El RBAC de UI es **sólo** el route-guard por `tipoPerfil`. |

**Conclusión de aislamiento:** el aislamiento entre carteras **depende del cliente** en lectura, es correcto en escritura de inmuebles/contratos/gastos, y está **roto** en `candidatos`. Para soportar N titulares con garantías hay que endurecer `allow list` de `inmuebles` (hoy `isStaff()`).

---

## F. GAPS — CLASIFICACIÓN

| ID | Gap | Clasificación |
|---|---|---|
| **F01** | Modelo de titularidad binario (`propietarioPrincipalId`/`propietarioSecundarioId`); sin `titulares[]` ni porcentajes → **no soporta 3, 4 o N titulares** | **G7** — arquitectura insuficiente para el caso real |
| **F02** | `usuarios.propietarioId` escalar (1 cuenta ↔ 1 titular); toda la capa de aislamiento (`myPropId`, `ownsPropietario`, `contratoEsMio`, `gastoEsMio`, `aisladoEsMio`) depende de ello | **G7** |
| **F03** | El propietario **no puede crear otro titular** (sin UI, sin flujo de servicio, bloqueo absoluto en `rules:418-422`) | **G5** — funcionalidad inexistente |
| **F04** | El propietario **no puede asociar titulares**: selector de 2º titular vacío; sin invitación de cotitulares | **G5** |
| **F05** | El **cotitular secundario es invisible para sí mismo**: `scopedInmuebles` y `misViviendas` ignoran `propietarioSecundarioId` | **G3** (parcialmente implementado) + **G6** |
| **F06** | Datos fiscales **desnormalizados y desincronizados** (`datosFiscales` es copia; `PropietariosSection.tsx:1322` lo reconoce) | **G3** |
| **F07** | Fiscalidad de un solo titular (`fiscalEngine.ts:587-588`: ignora al 2º) | **G3** |
| **F08** | Reparto de liquidación **binario** y configurable **sólo por MASTER** (`config_liquidacion` rules:1751-1758) | **G3** + **G7** |
| **F09** | **Eliminar inmueble** desde PROPIETARIO: botón activo → modal → borrado optimista → **permission-denied silencioso** → no borra → reaparece | **G4** — roto |
| **F10** | `deleteInmuebleFirestore` **no propaga el error** (`catch` + `console.error`); `handleDeleteInmueble` **no hace `await`** ⇒ sin mensaje, sin rollback, sin reintento | **G4** |
| **F11** | **Efecto destructivo colateral:** el fallo de borrado **sí** desvincula candidatos en Firestore (`rules:988-1006` abierto a `isSignedIn()`) | **G4** + **G6** |
| **F12** | **No existe baja lógica, archivado ni estado INACTIVO** para inmuebles (`estado: 'disponible' \| 'alquilado'`, `types.ts:484`) | **G5** |
| **F13** | **Sin comprobación de dependencias** antes de borrar (contratos, inquilinos, actas, liquidaciones, facturas, suministros…) y **sin cascada** | **G4** (para MASTER) / **G5** |
| **F14** | Portal del Propietario: **sin ninguna acción** sobre viviendas (ni borrar ni archivar ni desasociar). "Ver detalles" ignora el `id` y sólo cambia de sección | **G5** + **G2** |
| **F15** | `allow list` de `inmuebles` = `isStaff()` + suscripción a colección completa sin `dataScope` ⇒ **aislamiento de lectura sólo en cliente** | **G6** — problema de permisos/aislamiento |
| **F16** | `candidatos` update/delete = `isSignedIn()` ⇒ **cualquier usuario modifica candidatos de cualquier cartera** | **G6** |
| **F17** | Rol **ADMINISTRADOR** inexistente en `firestore.rules`: UI completa + escrituras denegadas (salvo el email master) ⇒ fallos silenciosos generalizados | **G6** |
| **F18** | `permisos[]` declarativo sin uso funcional: ningún componente lo evalúa; el RBAC de UI es sólo route-guard por `tipoPerfil` | **G3** |
| **F19** | Alta de inmueble: `newSelectedPropId` no se preselecciona (0 `useEffect` en `InmueblesSection`) ⇒ alta sin `propietarioId` → **permission-denied silencioso** y registro fantasma en `localStorage` | **G4** |
| **F20** | Tarjeta "Mis Viviendas" lee campos **inexistentes**: `inm.precioRentaMensual` y `inm.superficieConstruida` (`PropietarioPortalSection.tsx:336` y `:351`) no existen en `Inmueble` (son `precio` y `superficie`) ⇒ muestra `undefined €/mes` y `0 m²` | **G4** (menor, visible) |
| **F21** | `propietarioId` y `propietarioPrincipalId` redundantes y tratados como alternativos por las reglas ⇒ dos fuentes de verdad | **G3** |
| **F22** | `GestionImagenesModal`/Storage: las imágenes del inmueble no se eliminan al borrar el documento (residuo en Storage) | **G3** |

**Resumen por clasificación:**

| Clase | Total | IDs |
|---|---|---|
| **G1** correcto | 0 | — (ningún aspecto auditado de estos dos bloques funciona correctamente de extremo a extremo) |
| **G2** UX mejorable | 3 | F10, F14, F20 |
| **G3** parcialmente implementado | 7 | F05, F06, F07, F08, F18, F21, F22 |
| **G4** roto | 6 | F09, F10, F11, F13, F19, F20 |
| **G5** inexistente | 5 | F03, F04, F12, F13, F14 |
| **G6** permisos/aislamiento | 4 | F05, F11, F15, F16, F17 |
| **G7** arquitectura insuficiente | 3 | F01, F02, F08 |

---

## G. RECOMENDACIÓN FUNCIONAL (sin implementar)

### G.1 Comportamiento objetivo del portal PROPIETARIO

#### (1) Titularidad N-aria

- Sustituir el par `propietarioPrincipalId` / `propietarioSecundarioId` por una **colección de titularidades**:
  `titularidades/{titularidadId}` o subcollección `inmuebles/{id}/titulares/{titularId}`
  con: `{ inmuebleId, propietarioId, porcentajeParticipacion, rol: 'titular'|'usufructuario'|'nudo_propietario'|'representante', fechaDesde, fechaHasta, activo }`, e **índice `propietarioIds[]` en `Inmueble`** para poder consultar con `array-contains`.
- Los campos antiguos se mantienen **sólo como índice de compatibilidad** durante la migración.
- **Regla de negocio:** la suma de `porcentajeParticipacion` por inmueble debe ser 100 (validable en reglas y en cliente).

#### (2) Cuenta de acceso ↔ N titulares

- Permitir que **una cuenta** represente a varios titulares: `usuarios.propietarioIds[]` (o colección puente), manteniendo `propietarioId` como "titular principal" para compatibilidad.
- Repercusión obligatoria en `firestore.rules`: `myPropId()` → `myPropIds()` (lista); `ownsPropietario()`, `contratoEsMio()`, `gastoEsMio()`, `aisladoEsMio()` y las ~254 referencias a `isMasterAdmin`/`myPropId`. **Éste es el punto de mayor coste del cambio.**
- `indexIsTruthful()` debe validar el nuevo array.

#### (3) Alta de titulares desde el propietario

- Nueva pantalla en el portal: **"Mis Titulares / Copropietarios"** con:
  - Alta de titular **existente** (por NIF) y **nuevo** (nombre, NIF, tipo, domicilio fiscal, %).
  - **Invitación de acceso**: reutilizar `enlaces_registro` con `tipoPerfil: 'PROPIETARIO'` + `propietarioIdVinculado` (ya soportado en `authService.ts:547-581`); mostrar estado de la invitación.
  - **Selección/deselección de titulares por inmueble** (A+B+C en X; A+C en Y; B+C en Z).
- Reglas necesarias: permitir `create` en `propietarios/{nuevoId}` a un propietario que actúa sobre **su** cartera (p. ej. el titular principal del inmueble), **sin** abrir la creación de fichas arbitrarias.

#### (4) Aislamiento entre carteras

- Endurecer `inmuebles`: `allow list` debe exigir titularidad (hoy `isStaff()`), y `subscribeInmuebles` debe pasar `dataScope` (hoy no lo recibe, `App.tsx:967`).
- Cerrar `candidatos`: `allow update/delete` debe exigir ámbito de propietario (hoy `isSignedIn()`).
- Incluir **todos** los índices de titularidad (incluido el secundario) en `scopedInmuebles` y `misViviendas`.
- Definir la relación **gestor ↔ titular** (hoy inexistente: `GESTOR_INMUEBLES` es sólo un rol) como entidad con permisos delegados y caducidad.

#### (5) Baja / eliminación de inmuebles — modelo recomendado

> **Un inmueble con historia económica, contractual o legal NUNCA debe borrarse físicamente.**

Propuesta de dos operaciones distintas:

| Operación | Semántica | Cuándo |
|---|---|---|
| **Archivar / Dar de baja** (`estado: 'ARCHIVADO'`, `fechaBaja`, `motivoBaja`, `bajaPorId`) | Baja lógica. Desaparece de las listas operativas y del portal; se conserva en informes, fiscalidad y actas. Reversible. | **Acción principal del propietario.** Siempre disponible sobre inmuebles de su ámbito. |
| **Eliminar (físico)** | `deleteDoc` real. Sólo si el inmueble **no tiene dependencias bloqueantes** (sin contrato vigente ni histórico, sin cobros, sin actas, sin facturas, sin liquidaciones). Con confirmación reforzada. | Excepcional. Para errores de alta. |

Requisitos transversales:

1. **Comprobación previa de dependencias** en cliente y espejo en reglas (contratos vigentes/históricos, inquilinos, cobros, gastos, actas, suministros, pólizas, facturas, publicaciones activas, inventario, préstamos).
2. **Bloqueo con mensaje accionable** si hay dependencias: *"Este inmueble tiene 1 contrato vigente, 3 actas y 12 liquidaciones. No se puede eliminar. Puedes **archivarlo** para retirarlo de tu cartera operativa; los datos históricos se conservan."*
3. **Modal informado**, no genérico: listar las dependencias detectadas y el número de registros afectados.
4. **Operaciones fiables**: `await`, manejo de errores visible (toast/alerta), **rollback del estado local** si Firestore rechaza, y **sin efectos colaterales** hasta que la operación principal confirme.
5. **Despublicación previa**: retirar el anuncio de portales (`sindicacion_inmuebles` → `DESPUBLICADO`) y borrar/ocultar `fichas_publicas_inmueble`.
6. **Auditoría**: registrar en `audit_logs` quién archiva/elimina, cuándo y por qué (hoy no se registra nada en todo el flujo de borrado).
7. **Cascada o bloqueo explícito** para MASTER: hoy borra en cascada cero.

#### (6) Correcciones previas recomendadas (independientes del rediseño)

Son de bajo coste y eliminan los fallos silenciosos que hoy impiden diagnosticar:

1. Propagar errores de Firestore a la UI (`saveInmuebleFirestore`, `deleteInmuebleFirestore`, `savePropietarioFirestore`, `deletePropietarioFirestore`) y hacer `await` en los handlers de `App.tsx`.
2. Preseleccionar `propietarioId` del usuario actual en el alta de inmuebles (evita altas fantasma).
3. Corregir `inm.precioRentaMensual` / `inm.superficieConstruida` (`PropietarioPortalSection.tsx:336`, `:351`).
4. Cerrar `candidatos` en reglas (F16).
5. Pasar `dataScope` a `subscribeInmuebles` y endurecer `allow list` (F15).
6. Definir el rol ADMINISTRADOR en reglas o retirarlo de la UI (F17).
7. Activar el uso real de `permisos[]` o eliminarlo (F18).

---

## ANEXO — Índice de evidencias

| Tema | Archivo:Línea |
|---|---|
| `Propietario` (titular) | `src/types.ts:425-455` |
| `PropietarioFiscal` / `DatosFiscalesInmueble` | `src/types.ts:457-476` |
| `Inmueble` (campos de titularidad) | `src/types.ts:478-545` (`:499-503`) |
| `UsuarioApp` (cuenta de acceso) | `src/types.ts:1695-1719` |
| `estado` del inmueble (sólo disponible/alquilado) | `src/types.ts:484` |
| Roles y permisos declarativos | `src/types.ts:1838-1846`, `:1891-1946` |
| isMasterAdmin (email único) | `firestore.rules:28-31` |
| myPropId / canReachInmuebleId | `firestore.rules:154-170` |
| Reglas `propietarios` | `firestore.rules:412-429` |
| Reglas `inmuebles` (**delete = isMasterAdmin**) | `firestore.rules:444-466` (`:465`) |
| Reglas `fichas_publicas_inmueble` | `firestore.rules:477-495` |
| Reglas `candidatos` (abierto) | `firestore.rules:979-1007` (`:988`, `:1006`) |
| Reglas `usuarios` | `firestore.rules:1078-1131` |
| Reglas `enlaces_registro` | `firestore.rules:1153-1165` |
| Reglas `config_liquidacion` | `firestore.rules:1751-1758` |
| Denegación global por defecto | `firestore.rules:2197-2199` |
| `deleteInmuebleFirestore` | `src/lib/firebase.ts:371-381` |
| `saveInmuebleFirestore` + sanitize | `src/lib/firebase.ts:352-369`, `:332` |
| `subscribeInmuebles` (colección completa) | `src/lib/firebase.ts:261-277` |
| `subscribePropietarios` (scope) | `src/lib/firebase.ts:192-231` |
| Llamada sin `dataScope` | `src/App.tsx:967-982` |
| `scopedInmuebles` | `src/App.tsx:537-553` |
| `scopedPropietarios` | `src/App.tsx:556-566` |
| `SECCIONES_PROPIETARIO` | `src/App.tsx:286-311` |
| `handleDeleteInmueble` | `src/App.tsx:1662-1683` |
| `handleAddInmueble` / `handleUpdateInmueble` | `src/App.tsx:1686-1710` |
| `handleSavePropietario` / `handleDeletePropietario` | `src/App.tsx:2675-2698` |
| Render `InmueblesSection` (delete sin gatear) | `src/App.tsx:3686-3724` (`:3700`) |
| Render `PropietarioPortalSection` vs `PropietariosSection` | `src/App.tsx:3390-3413` |
| Botón papelera (ficha) | `src/components/sections/InmueblesSection.tsx:957-966` |
| Botón papelera (tarjeta) | `src/components/sections/InmueblesSection.tsx:1877-1890` |
| Alta: escritura de propietario/ppal/secundario | `src/components/sections/InmueblesSection.tsx:463`, `:475`, `:508-510` |
| Checkbox "Segundo Propietario" | `src/components/sections/InmueblesSection.tsx:3184-3195` |
| Selector 2º titular (filtrado) | `src/components/sections/InmueblesSection.tsx:3208-3212` |
| Estado inicial `newSelectedPropId = ''` | `src/components/sections/InmueblesSection.tsx:168` |
| `ConfirmDeleteModal` de inmueble | `src/components/sections/InmueblesSection.tsx:3392-3409` |
| `ConfirmDeleteModal` (genérico) | `src/components/ConfirmDeleteModal.tsx` |
| Portal: `misViviendas` (sin delete) | `src/components/sections/PropietarioPortalSection.tsx:99-104`, `:298-370` |
| Portal: campos inexistentes | `src/components/sections/PropietarioPortalSection.tsx:336`, `:351` |
| Portal: guardado de ficha propia | `src/components/sections/PropietarioPortalSection.tsx:142-185` |
| Creación de titular (sólo admin) | `src/components/sections/PropietariosSection.tsx:240-278` (`:255`) |
| "Datos fiscales archivados" | `src/components/sections/PropietariosSection.tsx:1322` |
| Contrato: sólo 2 titulares | `src/utils/contratoEngine.ts:225-255` |
| Fiscalidad: sólo 1 titular | `src/utils/fiscalEngine.ts:587-588` |
| Liquidación: reparto binario | `src/tesoreria/liquidacionEngine.ts:83-90`, `:305-314` |
| Alta por enlace (crea ficha titular) | `src/lib/authService.ts:455-627` (`:547-581`) |
| Espejo de identidad | `src/lib/authService.ts:86-100` |

---

**Fin del diagnóstico. No se ha modificado código, datos, reglas, usuarios ni se ha realizado commit/push/PR.**
