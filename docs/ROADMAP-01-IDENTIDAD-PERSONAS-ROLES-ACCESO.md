# ROADMAP-01 — IDENTIDAD + PERSONAS + ROLES + ACCESO

**Estado: PARCIAL / PENDIENTE; NO CERRADO.** Auditoría del árbol en `arena/01a0e460-gestor-de-inmuebles-vercel`, base real `3778a5a7add700a7e3824452d0a30db0e7eef50f` (`main = origin/main = HEAD` al inicio). Clon shallow; árbol limpio, sin commits locales propios ni ficheros sin seguimiento al iniciar. Baseline real: Vitest 98 ficheros, 2253 aprobados, 2 omitidos; `tsc` y build verdes. El historial previo a este SHA NO está disponible localmente.

## Inventario y regla de no duplicación

- Auth: Firebase Auth UID + `usuarios_auth/{uid}` (espejo), `usuarios/{id}` (`UsuarioApp`) contiene perfil, estado de acceso, roles operativos y vínculos. `authService.ts` conserva login, autorregistro y activación nominal; el alta autónoma todavía mezcla cuenta y propietario. La existencia de `personaId` NO da privilegios en Rules ni crea Auth.
- Propiedad: `propietarios/{id}` es entidad jurídica/fiscal independiente; inmuebles conservan `propietarioId` canónico, principal/secundario. `fichaPatrimonial.estadoDatos` ya tiene COMPLETO / INCOMPLETO / BLOQUEADO (módulo C); titularidad/histórico no se infieren de la completitud.
- Gestión: **se conserva** `gestiones_cartera`, `gestionesCartera.ts`, `accesoGestores.ts`, `gestionesCarteraServicio.ts`, `carterasGestion.ts`; eventos append-only, `tipoGestor` PROPIETARIO_GESTOR/GESTOR_PROFESIONAL, permisos L/E, estados PENDIENTE_ACEPTACION, ACTIVA, SUSPENDIDA, REVOCADA. `GESTOR_PATRIMONIAL` no sustituye al rol operativo `GESTOR_INMUEBLES`. D2/D3 derivan ámbito de `usuarios_auth.carterasL/E` y, para recursos sin propietarioId, de inmueble/contrato. `isStaff()` sigue en algunos bloques heredados; NO se ha creado un nuevo resolver de ámbito.
- Invitaciones: `enlaces_registro` + `accesoPropietarios.ts` reutilizados (nominal, email, caducidad, un uso); UI en `PortalRegistroView`, perfil/administración en `AdministracionSection`/modales de usuario, gestión en secciones de la app. Flujo integral rechazo/revocación concurrente/expiración server-side queda PENDIENTE (ROADMAP-02).
- Auditoría: `audit_logs` inmutable (create sin bloqueo a usuario ordinario en reglas legacy); gestión tiene además `eventos[]`, auth e importación emplean el logger existente; operaciones usa su transporte transaccional en el mismo libro. B4/O7 requieren propietario destino explícito y autorizaciones existentes; este bloque NO ejecuta importaciones ni altera su contrato. Storage D3 usa el espejo, no necesita cambios de identidad; documentos finales dependen de ROADMAP-06.

## Delta implementado (aditivo y opt-in)

1. `personas/{id}`: persona real con nombre, estado propio ACTIVA/BLOQUEADA, estadoDatos, roles descriptivos, propietarioIds jurídicos y, opcionalmente, usuarioId. `Propietario.personaId` y `UsuarioApp.personaId` opcionales (legacy válido). Auth no contiene datos de la persona. El titular puede existir sin usuario/UID. Un usuario pendiente se vincula a la misma persona sin tocar Auth, ficha, inmuebles, histórico o fiscalidad. Roles `PROPIETARIO`, `GESTOR_PROPIETARIO`, `GESTOR_PROFESIONAL` NO conceden capacidad: la relación de gestión y su proyección D3 siguen siendo la única fuente de acceso a terceros. Propietario propio y gestionado permanecen conjuntos distintos.
2. Servicio Firestore opt-in `personasServicioFirebase.ts`: create, vincular ficha existente, vincular perfil existente, cambiar roles. Transacciones comprueban IDs/colisiones y escriben `audit_logs` con los mismos commits, sin doble colección de auditoría. Solo sesión master; Rules reservan persona al master, no permiten delete y vetan autoasignación/cambio de personaId en propietarios/usuarios no-master. La UI y el registro actual NO llaman al servicio: no se crean personas automáticamente ni se migra ningún dato.
3. En la proyección EXISTENTE `carterasGestion.ts`, una gestión con `inmuebleIds` no vacíos ya no puede convertirse en `carterasL/E` de propietario completo: esas listas otorgan acceso a TODOS los recursos del titular y carecen de granularidad por inmueble. Fail closed hasta ROADMAP-03. `[]` mantiene semántica existente de cartera completa. ATENCIÓN: proyecciones parciales ya persistidas antes del despliegue no se corrigen solas; requieren auditoría/reproyección del espejo con decisión operativa autorizada, nunca migración silenciosa.
4. `adminUsuarios.ts` protege `personaId` en el editor de usuarios y lo incluye en su diff auditable. Estados de persona, cuenta, datos y gestión son distintos; BLOQUEADO en persona no es un bloqueo de la cuenta (para revocar acceso debe bloquearse también el perfil/espejo con el flujo existente).

## Matriz y frontera de seguridad

| Actor | Propietario propio | Gestionado | Ajeno |
|---|---|---|---|
| Propietario | Titular según D2 | Sin relación: no | No |
| Gestor propietario | Titular + carteras autorizadas D3 | L o E según gestión | No |
| Gestor profesional | No requiere titularidad propia | L o E según gestión | No |
| Sin relación / revocado sin lectura / bloqueado | No | No | No |

La cartera L permite leer, E permite leer/escribir sujeto a reglas de recurso; no concede borrado. Revocada con conservación explícita de lectura sigue siendo L histórica (contrato S7). La titularidad principal no se transmite con gestión. Contratos, gastos, operaciones y fiscalidad mantienen sus Rules D2/D3 anteriores. En particular, `personaId` jamás es un permiso. No se ha ampliado `isStaff()` ni `isTenant()`.

**Cambios de Rules y motivo/test:** nueva colección `personas` con esquema mínimo y master-only, lectura/escritura positiva master y negativa propietario/tenant; protección de `personaId` en create/update de ficha jurídica y usuario, positiva master/negativa titular; no hay rutas globales nuevas. Test de mutaciones evalúa Rules efectivas modificadas (global, falta de cartera, propietario/inmueble incorrectos, rol, isStaff/isTenant y personaId), no solo coincidencias de texto. Harness local NO equivale a emulador Firebase; pruebas reales con emulador + despliegue siguen PENDIENTES.

## Fuera de alcance / pendientes que impiden cerrar ROADMAP-01

- **PENDIENTE:** integración real de `personas` en UI, bootstrap de usuarios legacy, resolución de personas existentes/colisiones y comprobación operativa en Firebase (sin credenciales de producción ni emulador). No declarar el modelo totalmente migrado ni desplegado. El master podría escribir directamente sin el adaptador y sin `audit_logs`; las Rules legacy de auditoría solo garantizan inmutabilidad, NO obligatoriedad transaccional para toda vía.
- **PENDIENTE — ROADMAP-02:** onboarding completo, invitaciones con rechazo/expiración/revocación atómicos verificados server-side, quién invita por cartera y auditoría del ciclo completo. Los enlaces nominales actuales son preexistentes, no se presentan como cierre de esa infraestructura.
- **PENDIENTE — ROADMAP-03:** enforcement por inmueble de delegaciones parciales, cotitulares y relaciones jurídicas multi-persona; las Rules actuales usan la titularidad principal/económica según recurso. No reactivar relaciones parciales mediante un rol o una lista `carterasL/E` de propietario completo.
- **BLOQUEADO:** auditoría de proyecciones D3 preexistentes (pueden tener delegaciones parciales publicadas), y verificación de la colección `usuarios`/`enlaces_registro` legacy con políticas de privacidad estrictas y emulador. `isStaff` global residual de otros módulos NO se ha cerrado dentro de esta entrega; sería incorrecto prometer fail-closed integral.
- **ROADMAP-06:** documentos y Storage finales dependen del modelo documental; Storage D3 no se ha abierto ni modificado. B4/O7, Import/Export, alquiler, operaciones, contratos, cobros, fiscalidad e histórico NO modificados.

## Validación local (sin emulador ni despliegue)

Baseline antes de modificar: Vitest 98/98 archivos, 2253 aprobados y 2 omitidos; TSC 0 errores; build OK. Después: suite específica ROADMAP-01 13/13 (3 archivos), más 1 prueba añadida a la suite D3; Vitest global 101/101 archivos, **2267 aprobados, 2 omitidos**. `npm run lint` TSC 0 errores, `npm run build` OK (advertencia preexistente de bundle >500 kB). Scripts B 92/92, C 82/82 y E 64/64. D2, D3, gestión, B4/O7, Import/Export, Storage y auditoría se ejecutan además dentro de Vitest global. Fallo intermedio autocorregido: el test de estados usó inicialmente un usuario todavía PENDIENTE para esperar ACTIVO; se corrigió el fixture, no el control. Otro fallo intermedio fue una mutación que coincidía con más de un bloque; se acotó al `match` concreto y se volvió a ejecutar. Emulador y datos reales NO verificados.

Este documento NO renumera los bloques históricos del Mapa Maestro. ROADMAP-01 no está cerrado aunque tests/TS/build locales resulten verdes; integración y seguridad real tienen trabajo pendiente.
