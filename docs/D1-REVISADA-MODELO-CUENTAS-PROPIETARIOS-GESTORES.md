# D1 REVISADA — MODELO DE CUENTAS, PROPIETARIOS Y GESTORES (Gestión Patrimonial)

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **HEAD base:** `cc51955` (protegido en remoto).
**ESTADO: D1 APROBADA FORMALMENTE — decisiones S1–S7 resueltas y registradas el 2026-09-26 (ver §23–26). Pendiente: integración en MAPA MAESTRO e implementación (orden posterior explícita).**
**Naturaleza:** SOLO inspección + diseño. **0 escrituras Firestore/Storage · 0 reglas/índices modificados · 0 código funcional modificado · 0 dependencias · B4 NO ejecutado · dry-run NO ejecutado · no se crean propietarios reales.**
Este documento **revisa y sustituye el diseño D1 de FASE 5B §1–5** (que queda como base reutilizada, ver §18–19). NO es un mapa paralelo: el mapa central sigue siendo `docs/MAPA-MAESTRO-ERP-ACTUAL.md` (§21 de este doc detalla qué incorporarle y cuándo).

---

## 1. MODELO ACTUAL (inspeccionado sin modificar, con evidencia)

| Pieza | Estado verificado |
|---|---|
| Cuenta de acceso | Firebase Auth (uid) + espejo no falsificable `usuarios_auth/{uid}` (`indexIsTruthful()`, firestore.rules L265-283) |
| Perfil de usuario | `usuarios/{id}` (`UsuarioApp`: `tipoPerfil` ADMINISTRADOR/PROPIETARIO/PROFESIONAL/INQUILINO, `roles[]`, `permisos[]`, `propietarioId?`, `profesionalId?`, `inmuebleIds?`) |
| Titular legal | `propietarios/{id}` (`Propietario`: nombre, nifCif, tipoPropietario, representante legal, cuentas bancarias). **NO contiene campos de autenticación** → ya admite propietarios sin cuenta |
| Alta autónoma | `registerAutonomo` (authService L1063) crea a la vez `usuarios/{id}` + `propietarios/{id}` (registro = cuenta, 1:1) |
| Alta por invitación | `registerWithInvitationLink` (L700-725) vincula un `Propietario` **ya existente** a la cuenta nueva sin cambiar su id; `accesoPropietarios.ts` (puro): admin crea usuario PENDIENTE + invitación nominal de un solo uso (`usuarioIdVinculado`+`propietarioIdVinculado`) |
| Invitaciones | `EnlaceRegistro` con `tipoPerfil`, `propietarioIdVinculado`, `usuarioIdVinculado`, `emailInvitado`, caducidad, usos |
| Rol gestor | `GESTOR_INMUEBLES` existe en el catálogo de roles (types.ts ~L1917, permisos operativos de candidatos/visitas/contratos/seguros); auto-asignación bloqueada (rules L1091). **NO es un gestor patrimonial**: no tiene relación con titulares ni carteras |
| Selección de propietario | Solo UI de admin (`AdminControlCenter.tsx` `selectedPropietarioDetail`) — no hay ámbito de gestión |

**Reutilizable (1):** cuenta+espejo, `Propietario` como entidad legal independiente, invitación nominal de un solo uso, reglas por propietarioId en gastos/contratos/propietarios, catálogo de roles, módulos puros (`accesoPropietarios.ts`).
**Contradice el modelo objetivo (2):** (a) `registerAutonomo` fusiona persona+cuenta+titular en un solo paso (impide "propietario sin cuenta" desde el autoservicio, aunque el alta por admin/invitación SÍ lo permite); (b) `canAccessInmueble/canAccessContrato` solo conocen titular propio + `inmuebleIds`, sin carteras; (c) no existe relación gestor↔titular con ciclo de vida; (d) las reglas de `propietarios/create` solo permiten a master o al propio propietario → un gestor no puede dar de alta titulares (cambio necesario, §20).

## 2. MODELO PROPUESTO — ENTIDADES (3)

| Concepto pedido | Entidad propuesta | ¿Nueva? |
|---|---|---|
| A) CUENTA DE ACCESO | Firebase Auth `uid` + `usuarios_auth/{uid}` (estado ACTIVO/PENDIENTE/BLOQUEADO) | No |
| B) PERSONA / PERFIL | `usuarios/{id}` para personas CON acceso; para titulares SIN acceso la ficha `propietarios/{id}` ES la persona jurídica/física registrada. **NO se crea una colección `personas` separada** (evita arquitectura paralela; el desdoblamiento queda como evolución futura documentada) | No |
| C) PROPIETARIO | `propietarios/{id}` — titularidad legal, existe con o sin cuenta | No (se amplía) |
| D) USUARIO PROPIETARIO | `usuarios/{id}` con `propietarioId` propio | No |
| E) GESTOR PROPIETARIO | usuario con `propietarioId` propio + ≥1 gestión activa de terceros | Relación nueva |
| F) GESTOR / PROFESIONAL | usuario SIN `propietarioId` con rol de gestión y ≥1 gestión activa | Relación nueva |
| G) CARTERA / GESTIÓN | **`gestiones_cartera/{id}`** (colección independiente, base FASE 5B ampliada) | **Sí** |

**Campos nuevos necesarios (4):**
- `Propietario`: `estadoAcceso: 'SIN_CUENTA'|'INVITADO'|'ACTIVO'` (derivado de conveniencia; la fuente de verdad del vínculo sigue siendo `UsuarioApp.propietarioId` + la invitación), `creadoPorGestorId?`.
- `UsuarioApp`: sin campos nuevos (el ámbito de gestión se resuelve por `gestiones_cartera`, no se duplica en el usuario).
- `gestiones_cartera/{id}`: `id, titularId (propietarioId), gestorUsuarioId, inmuebleIds[] ([]=cartera completa), permiso: 'LECTURA'|'LECTURA_ESCRITURA', responsableActual: 'GESTOR'|'TITULAR', estado: 'PENDIENTE_ACEPTACION'|'ACTIVA'|'SUSPENDIDA'|'REVOCADA', fechaInicio, fechaFin?, aceptaRequierePropietario (bool), eventos[{tipo, actorId, actorRol, fecha, motivo?}], creadoPor, createdAt, updatedAt`.
- `Inmueble` (para §8/16): `estadoDatos?: 'COMPLETO'|'INCOMPLETO'|'BLOQUEADO'` + `camposFaltantes?: string[]` (solo lo fijan importación/guías; el alta manual sigue como hoy).

**Relaciones (5):** cuenta 1:1 perfil · perfil 0..1 propietario propio · propietario 1:N inmuebles · gestor N:M propietarios (vía `gestiones_cartera`) · gestión 1:N eventos. **Histórico/inmutable (6):** `propietarioId` de inmuebles/gastos/contratos/cobros es invariante bajo cualquier cambio de gestión; `gestiones_cartera` nunca se borra (delete prohibido); `eventos[]` y `audit_logs` append-only. **De la cuenta (7):** credenciales, uid, estado de acceso, roles, permisos, lastLogin. **Del propietario (8):** identidad legal (nifCif), fiscal, bancaria, representante, titularidad. **De la gestión (9):** ámbito, permiso, responsable, fechas, eventos.

## 3. FLUJOS (CASOS 1–12)

| Caso | Resolución en el modelo |
|---|---|
| 1. Registro propietario | Onboarding "Propietario" → Auth + `usuarios` PROPIETARIO + `propietarios/{id}` propio (flujo actual `registerAutonomo`, se reutiliza) |
| 2. Registro gestor propietario | Onboarding "Gestor propietario" → idem + rol `GESTOR_PATRIMONIAL`; puede crear titulares ajenos y solicitar carteras |
| 3. Registro gestor/profesional sin inmuebles | Onboarding "Gestor/Profesional" → Auth + `usuarios` (sin `propietarioId`) + rol `GESTOR_PATRIMONIAL`; cero patrimonio propio; gestiona carteras ajenas |
| 4. Crear Santiago, Yolanda, … sin cuenta | Alta de `propietarios/{id}` por admin/gestor (ficha legal completa; `estadoAcceso='SIN_CUENTA'`). Requiere ampliar `propietarios/create` a gestores (§20) |
| 5. Invitar después a un propietario | Invitación nominal de un solo uso (flujo `accesoPropietarios.ts` ya existente): usuario PENDIENTE + `EnlaceRegistro` con `usuarioIdVinculado`+`propietarioIdVinculado` → al aceptarla, cuenta ACTIVO vinculada. **propietarioId, titularidad e histórico NO cambian** |
| 6. Gestor añade propietarios a su cartera | `gestiones_cartera` nueva (PENDIENTE_ACEPTACION o ACTIVA según §12) + evento + auditoría |
| 7. Varios propietarios simultáneos | N documentos `gestiones_cartera` del mismo `gestorUsuarioId`; ámbito = unión |
| 8. Gestor deja de gestionar | Transición a `REVOCADA` (o `responsableActual=TITULAR` si es cesión) + evento + auditoría; el histórico permanece |
| 9. Titularidad estable al cambiar de gestor | Invariante §2-6: ningún campo de `inmuebles/gastos/contratos` se toca |
| 10. Propietario con inmuebles sin cuenta | Ya válido hoy: `inmuebles.propietarioId` referencia la ficha legal, no la cuenta |
| 11. Usuario sin inmuebles | Válido: perfil sin `propietarioId` ni `inmuebleIds` (p.ej. gestor nuevo, admin) |
| 12. Propietario y gestor a la vez | `propietarioId` propio (cartera propia) + `gestiones_cartera` activas (carteras ajenas); ámbitos se suman, nunca se confunden |

## 4. ONBOARDING — "¿Cómo vas a utilizar la aplicación?" (especificación, sin pantallas)

| Opción | Identidad creada | Propietario auto | Puede inmediatamente | NO puede todavía | Añade propietarios después |
|---|---|---|---|---|---|
| **Propietario** | Auth + `usuarios` PROPIETARIO (rol PROPIETARIO_ESTANDAR) | SÍ (su ficha, con NIF real — como hoy) | Ver/crear SUS inmuebles y datos | Ver nada de terceros; gestionar carteras ajenas | No aplica (solo su ficha) |
| **Gestor propietario** | Auth + `usuarios` PROPIETARIO + rol `GESTOR_PATRIMONIAL` | SÍ (su ficha) | Lo anterior + crear titulares ajenos y solicitar carteras | Acceder a carteras sin gestión aceptada/activa | "Añadir propietario a mi cartera" → alta de `propietarios/{id}` (SIN cuenta) + `gestiones_cartera` |
| **Gestor/Profesional** | Auth + `usuarios` sin `propietarioId` + rol `GESTOR_PATRIMONIAL` | **NO** | Crear titulares ajenos, solicitar carteras | Tener "cartera propia" (no existe ficha propia); acceder sin gestión activa | Ídem |

Regla conceptual anti-confusión: **la pantalla de onboarding crea CUENTAS; las fichas de terceros se crean en "Propietarios" del panel de gestión; el vínculo cuenta↔titular SOLO nace de (a) el alta propia del onboarding o (b) una invitación nominal aceptada.** Ningún otro flujo puede vincular.

## 5. PROPIETARIO SIN CUENTA (ya posible; se formaliza)
`propietarios/{id}` existe sin `usuarios` ni Auth (`estadoAcceso='SIN_CUENTA'`). Sus inmuebles/gastos/contratos/documentos se crean con `propietarioId` explícito por admin/gestor autorizado. **Flujo futuro "Dar acceso":** invitación nominal (caso 5) → al activarse, `estadoAcceso='ACTIVO'` sin cambiar: propietarioId, titularidad, histórico, inmuebles, gastos, contratos, documentación. (El flujo ya existe en `accesoPropietarios.ts`; solo falta el estado de conveniencia y la UI.)

## 6. CARTERA / GESTIÓN — revisión de `gestiones_cartera` (FASE 5B)
**Sigue siendo adecuada** como colección independiente; cambios respecto a 5B: (1) estados ampliados (`PENDIENTE_ACEPTACION|ACTIVA|SUSPENDIDA|REVOCADA`; 5B no tenía SUSPENDIDA); (2) `aceptaRequierePropietario` explícito; (3) eventos tipados: `ALTA, ACEPTADA, ACTIVADA, PERMISO_MODIFICADO, AMBITO_MODIFICADO, CEDIDA_AL_TITULAR, DEVUELTA_AL_GESTOR, SUSPENDIDA, REVOCADA` — cada uno con actor, fecha y motivo (histórico completo, append-only). Cesión/devolución/revocación = transiciones + eventos (semántica 5B conservada: la devolución no crea propiedad ni duplica; la revocación es inmediata).

## 7. IMPORTACIÓN FUTURA (B4) — `propietarioDestino` explícito
El contrato de importación (FASE 5B §9) ya exige titular destino; se refuerza: **cada registro/lote lleva `propietarioDestinoId` explícito** resuelto desde un mapa `owner origen → propietarios/{id}` confirmado por el usuario ANTES de importar (Santiago→prop_santiago, Yolanda→prop_yolanda). **Prohibido** resolverlo como "propietario de la cuenta que importa". La FASE 4 ya trata `propietarioId` como campo-requiere-validación permanente. D5 (fichero canónico) NO bloquea este diseño: el modelo es independiente de la fuente histórica concreta.

## 8. FUENTES EXCEL/CSV Y ESTADOS DEL DATO
Arquitectura (FASE 3, etapa 1) ya separa **parseo (por formato)** del resto del pipeline (normalizar→dedup→preview→staging→promoción), que es agnóstico: un adaptador Excel/CSV nuevo reutiliza B1–B3 sin cambios. Requisitos que el diseño garantiza:
- Registro importado nace con veredicto: **COMPLETO** (promovible) · **INCOMPLETO** (datos válidos conservados + `camposFaltantes[]`) · **BLOQUEADO** (incidencia impeditiva: p.ej. sin `propietarioDestinoId`, duplicado en conflicto, truncado).
- **Los datos válidos NO se descartan** por campos ausentes no impeditivos (regla FASE 0: no inventar lo que falta; se marca).
- Flujo posterior "Te falta completar estos datos": lectura de `camposFaltantes` por registro/inmueble + guía contextual (pantalla de pendientes del lote) — requisitos documentados, **NO se implementa ahora**.

## 9. SEGURIDAD — relación con D2/D3 (sin implementar)
- **Ámbito servidor:** `ámbito(usuario) = {propietarioId propio} ∪ inmuebleIds ∪ {titularId : gestión ACTIVA}` — predicados nuevos en `firestore.rules` reutilizando el espejo extendido (`carterasL[]/carterasE[]`, sincronización por flujo de confianza, fail-closed).
- **Aislamiento:** propietario→solo lo suyo; gestor→solo carteras activas (gastos, contratos, cobros, documentos, inmuebles del ámbito); propietario sin cuenta→no accede (no hay cuenta); acceso directo por ID→denegado fuera de ámbito.
- **D2:** el endurecimiento de `inmuebles` (F5-1) DEBE ir después de este modelo (si no, los gestores quedarían fuera); orden: carteras → endurecimiento.
- **D3:** claims Storage `{propId, carterasL, carterasE}` = imagen exacta del ámbito; cesión/devolución → re-emisión (ventana ≤1 h documentada).
- **Manipulación cliente:** `propietarioId` de gastos/contratos ya es inmutable por reglas; `gestiones_cartera` solo la modifican master/titular/gestor según transición; el espejo impide auto-asignar carteras.

## 10–17. RESPUESTAS CORTAS
- **(10) Gestor con múltiples propietarios:** N `gestiones_cartera`; UI de cambio de ámbito parecida al `selectedPropietarioDetail` de admin, pero filtrada por carteras del usuario.
- **(11) Permisos:** `LECTURA` / `LECTURA_ESCRITURA` por gestión; nunca incluyen cambiar titularidad, ceder a terceros, ni borrar.
- **(12) Transferencia/revocación:** §6. Aceptación: requerida si el titular tiene cuenta; si no la tiene, el admin/master puede activar sin aceptación (decisión pendiente S4).
- **(13) Impacto D2:** prerrequisito de ámbito gestor antes de endurecer `inmuebles`.
- **(14) Impacto D3:** claims = imagen del ámbito; sin cambios sobre lo diseñado en FASE 7 §4.
- **(15) Impacto B4:** desbloquea `propietarioId` (mapa explícito) → el gate FASE 7 pasa D1 a "diseño cerrado, pendiente aprobación".
- **(16) Excel/CSV:** §8.
- **(17) COMPLETO/INCOMPLETO/BLOQUEADO:** §8 (`estadoDatos` + `camposFaltantes`).

## 18. QUÉ REUTILIZAMOS DE FASE 5B
Colección independiente `gestiones_cartera` y sus invariantes (no-borrado, eventos append-only, titularidad invariante, una gestión no-REVOCADA por par, prohibida autogestión); espejo extendido `carterasL/E` fail-closed; claims Storage; cesión/devolución como transiciones del mismo documento; auditoría `GESTION_*` en `audit_logs`.

## 19. QUÉ SE MODIFICA/DESCARTA DE FASE 5B
- Se **amplían** estados (nuevo `SUSPENDIDA`) y eventos tipados (antes sin catálogo cerrado).
- Se **corrige** la suposición implícita de que gestor ≈ perfil nuevo: NO hay `tipoPerfil` nuevo; gestor = rol `GESTOR_PATRIMONIAL` (id nuevo propuesto; reutilizar `GESTOR_INMUEBLES` se descarta por colisión semántica con el rol operativo existente de candidatos/visitas).
- Se **descarta** (por ahora) una colección `personas` separada: `propietarios` + `usuarios` cubren B sin duplicados.
- Se **añade**: `estadoAcceso` en Propietario, `propietarioDestinoId` explícito en importación, `estadoDatos/camposFaltantes` en Inmueble.

## 20. ARCHIVOS QUE HABRÍA QUE MODIFICAR EN LA IMPLEMENTACIÓN (lista exacta; NO ahora)
1. `firestore.rules` — match `gestiones_cartera` + predicados de ámbito + ampliar `propietarios/create` a gestores + espejo extendido.
2. `firestore.indexes.json` — índices `(titularId, estado)` y `(gestorUsuarioId, estado)`.
3. `src/types.ts` — entidad GestiónCartera + estados/eventos + `estadoAcceso` + `estadoDatos/camposFaltantes` + rol `GESTOR_PATRIMONIAL` en catálogo.
4. `src/lib/authService.ts` — helpers `isGestor/canAccessPorCartera`, onboarding de 3 vías.
5. `src/lib/accesoGestores.ts` — **nuevo** módulo puro (par de `accesoPropietarios.ts`): validaciones de alta/aceptación/cesión/devolución/revocación.
6. `src/lib/accesoPropietarios.ts` — `estadoAcceso` en el flujo de invitación.
7. `src/lib/firebase.ts` — CRUD `gestiones_cartera` + helpers de auditoría `GESTION_*` + sincronización del espejo.
8. `src/lib/adminUsuarios.ts` — asignación de rol gestor.
9. `src/components/admin/AdminControlCenter.tsx` — gestión de carteras y "Dar acceso".
10. Componente de registro/onboarding (consumidor de `registerAutonomo`) — 3 vías.
11. `src/components/sections/DashboardEjecutivoSection.tsx` + `src/App.tsx` — ámbito de trabajo por cartera (se solapa con el prerrequisito D2 de `subscribeInmueblesPorAmbito`).

## 21. MAPA MAESTRO (pendiente, NO modificado en esta fase)
Incorporar cuando el diseño se apruebe e implemente: (a) en `## 4. GRANDES BLOQUES PENDIENTES` un **"BLOQUE F — Modelo Cuenta/Titular/Gestor + Carteras"** con resumen del modelo, estados y su relación con D2/D3/B4; (b) en `### 2.2 Colecciones Firestore` la fila `gestiones_cartera` (propuesta) y los campos nuevos de `propietarios/inmuebles`; (c) referencia cruzada a este documento como fuente de diseño. Motivo: el mapa maestro es la fuente central y no debe haber mapas paralelos; este doc es diseño pendiente de aprobación, por eso aún no se vuelca.

## 22. RIESGOS
(1) Orden de despliegue: endurecer reglas antes de existir el ámbito gestor dejaría a gestores sin acceso → secuencia obligatoria carteras→D2. (2) Espejo/claims obsoletos (ventana ≤1 h; fail-closed). (3) Duplicidad de titulares (Santiago creado dos veces): Firestore no tiene unicidad → validación por nifCif en módulo puro antes del alta. (4) Migración de roles: usuarios con `GESTOR_INMUEBLES` operativo NO deben convertirse en gestores patrimoniales automáticamente. (5) `propietarios/create` por gestores amplía superficie de escritura → límite: ficha legal mínima + auditoría. (6) Aceptación de gestión sin cuenta del titular (S4) podría activar carteras sin consentimiento → mitigación: solo admin/master y auditado.

## 23. DECISIONES S1–S7 — **APROBADAS FORMALMENTE (2026-09-26)**

- **S1 — APROBADA:** rol patrimonial independiente **`GESTOR_PATRIMONIAL`**. NO se reutiliza `GESTOR_INMUEBLES` (queda preservado sin cambios para su funcionalidad operativa actual de candidatos/visitas/contratos/seguros). `GESTOR_PATRIMONIAL` es el rol destinado a gestionar carteras/propietarios/inmuebles de terceros conforme a permisos explícitos.
- **S2 — APROBADA:** NO se crea colección paralela `personas`. Modelo: Cuenta/Auth → `usuarios/{id}`; propietario sin cuenta → `propietarios/{id}`. La ficha del propietario legal ES la referencia patrimonial; no se duplica una persona en una tercera colección solo para representar identidad.
- **S3 — APROBADA:** un usuario con capacidad de gestión patrimonial puede crear fichas de propietarios legales sin cuenta (Santiago, Yolanda, …). Crear la ficha NO crea cuenta de autenticación. Separación estricta: **crear propietario ≠ crear cuenta ≠ dar acceso**.
- **S4 — APROBADA:** la aceptación formal de una gestión es obligatoria cuando el propietario tiene cuenta y el modelo de relación requiere su consentimiento. Para propietario SIN cuenta, `PENDIENTE_ACEPTACION` puede existir como estado de relación sin bloquear la creación de la ficha ni la preparación administrativa de la cartera. La futura invitación/activación vincula al propietario existente sin cambiar: propietarioId, titularidad, inmuebles, gastos, contratos, documentación, histórico ni auditoría.
- **S5 — APROBADA:** ciclo de vida `PENDIENTE_ACEPTACION | ACTIVA | SUSPENDIDA | REVOCADA`. `SUSPENDIDA` = interrupción temporal sin destruir la relación histórica; NO equivale a eliminación, revocación definitiva, cambio de propietario ni transferencia de titularidad. Toda transición queda auditada mediante eventos append-only.
- **S6 — APROBADA:** `Inmueble.estadoDatos: 'COMPLETO'|'INCOMPLETO'|'BLOQUEADO'` + `camposFaltantes[]`. Los datos válidos NO se descartan por faltar datos no impeditivos; un inmueble importado parcialmente existe como `INCOMPLETO` pendiente de completar; `BLOQUEADO` se reserva para impedimentos reales de una operación concreta. La UI futura deberá explicar qué falta y guiar la completación.
- **S7 — APROBADA:** el gestor anterior puede conservar acceso de **LECTURA histórica** tras cesión/retorno cuando la relación y los permisos lo determinen. Separación estricta: **LECTURA histórica ≠ gestión activa ≠ escritura**. La cesión/retorno no borra ni duplica el histórico; toda conservación o retirada de permisos queda registrada en auditoría.

**Dependencias:** ninguna nueva para el diseño; la implementación dependerá de D2 (reglas), D3 (claims, opcional al inicio) y de los tests de seguridad (FASE 5B §11, devDeps D6).

## 24. MODELO CONTRACTUAL APROBADO
1. **Cuenta/Auth** (Firebase Auth uid + espejo `usuarios_auth/{uid}`) · 2. **Perfil/usuario** (`usuarios/{id}`) · 3. **Propietario legal** (`propietarios/{id}`, con o sin cuenta) · 4. **Usuario-propietario** (perfil con `propietarioId` propio) · 5. **Gestor propietario** (4 + gestiones activas de terceros) · 6. **Gestor/profesional** (perfil sin `propietarioId` con rol `GESTOR_PATRIMONIAL` + gestiones) · 7. **Gestión de cartera** (`gestiones_cartera/{id}`).

Relación fundamental:
```
propietario legal → inmuebles            (titularidad)
gestor → gestiones_cartera → propietario (gestión; NO cambia la titularidad)
```

## 25. REGLAS DE NO REGRESIÓN (contractuales)
1. `GESTOR_INMUEBLES` existente NO se reutiliza para gestión patrimonial.
2. NO se crea colección `personas`.
3. Un propietario puede existir sin cuenta.
4. Una cuenta puede existir sin propiedades.
5. Un usuario puede gestionar múltiples propietarios.
6. Un propietario puede tener múltiples inmuebles.
7. Un propietario puede tener varios gestores a lo largo del tiempo.
8. La gestión no modifica `propietarioId` de los inmuebles.
9. La titularidad histórica no se borra.
10. Revocar una gestión no elimina datos.
11. Dar acceso posteriormente no crea un propietario nuevo.
12. Importar nunca puede deducir el propietario por la cuenta que ejecuta la importación.
13. La importación utilizará `propietarioDestinoId` explícito.
14. D5 sigue siendo un bloqueo únicamente para la migración histórica concreta, no para esta arquitectura.
15. No se ejecuta todavía ninguna importación.

## 26. SECUENCIA APROBADA DE SIGUIENTES DEPENDENCIAS
```
D1 APROBADA (este documento)
  ↓
integración posterior en MAPA MAESTRO (actuación explícita; aún NO realizada)
  ↓
implementación de gestiones_cartera
  ↓
D2 — endurecimiento servidor de "inmuebles"
  ↓
D3 — claims/ámbito de acceso
  ↓
B4 — dry-run sobre staging
  ↓
revisión de resultados
  ↓
autorización independiente para confirmación/migración
```
Ninguna de estas fases se ejecuta automáticamente con la aprobación de D1.
