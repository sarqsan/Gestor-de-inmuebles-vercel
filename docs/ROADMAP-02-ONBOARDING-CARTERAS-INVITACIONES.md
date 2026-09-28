# ROADMAP-02 — Onboarding, carteras e invitaciones

## Estado — 2026-09-28

**Implementación completada; cierre de código apto para integración.** UI integrada para preparación de propietario/Persona, invitación de destinatario, aceptación/rechazo, vinculación y consulta limitada de delegaciones. Las reglas privadas deniegan list a identidades ordinarias; la UI resuelve por ID autenticado. Auth y Firestore se recuperan por retry con identificadores estables; nunca se borra Auth como compensación.

### Seguridad incorporada

- `usuarios/{id}` ya no se lee por el mero hecho de estar autenticado, por `isStaff`, rol o conocimiento del ID. La ficha propia se lee por UID ya ligado; antes del primer enlace, solo el email Auth verificado de la ficha pendiente de PROPIETARIO; perfiles pendientes genéricos exponen lectura propia únicamente tras un enlace nominal activo ligado al usuario/email. El master conserva su función administrativa. No hay list para cuentas ordinarias.
- `enlaces_registro` R02 excluidos del list de staff; get solo master o destinatario autenticado/verificado cuya ficha, Persona, propietario y UID son coherentes. El commit de aceptación enlaza estado, UID, Persona, cartera y auditoría.
- Acceso parcial consulta documentos de inmueble por IDs acotados, nunca hace list de propietario. Para carteras completas, las queries son igualdad `gestorUsuarioId == usuario.id` sobre `gestiones_cartera` y `propietarioId == pid` sobre `inmuebles`; el servicio ata el UID al espejo propio. Pruebas evalúan un resultado potencial incluso con colección vacía. La prueba oficial de query-planning queda pendiente de Emulator.
- Gestión requiere estado vigente para autorizar; el índice solo localiza relación. Se mantienen la titularidad, Persona, contratos B/C/E, Storage y writer único del espejo.

### Carreras y adversarial

- Permanecen intactos los **33 tests originales** de `tests/roadmap02-onboarding.test.ts`.
- Suite `tests/roadmap02-integracion.test.tsx`: integra UI/servicios y comprueba lecturas A/B, destinatario propio, correo/UID, mutación de propietario/Persona/UID/alcance/estado/cartera, rol sin relación, consultas parciales y completas.
- Pruebas deterministas de commit simultáneo aceptación+revocación en ambos órdenes, aceptación+expiración con reloj de commit, aceptación+rechazo, doble aceptación/rechazo/revocación, consumed/retry Auth/Firestore y sin residual de acceso. Hacen uso de harness local; **no equivalen a Firebase Emulator**.
- Última batería global local: **2.385/2.385 Vitest en 112 archivos**; incluye los 33 casos onboarding originales. La integración adversarial ejecuta queries potenciales con evaluador local determinista, no Firebase. B **92/92**, C **82/82**, E **64/64**, `tsc --noEmit`, build y `git diff --check` pasaron. Build conserva advertencia de bundle principal grande (~4.9 MB sin gzip).

### Validación oficial pendiente

Firebase Emulator no pudo arrancar: `java` no está instalado y la conexión TLS a `storage.googleapis.com` termina en `SSL_ERROR_SYSCALL`. Por ello no se afirma validación oficial de Firestore Rules/Storage ni query planner. Ejecutar `firebase emulators:exec --only firestore,storage ...` en CI/entorno con Java y descarga accesible antes de despliegue. No retirar las Rules implementadas por esta limitación.

### Identidad y compatibilidad

Se reutilizan `personas`, `propietarios`, `usuarios`, `enlaces_registro`, `gestiones_cartera`, auditoría y los servicios de ROADMAP-01. No se crea segunda entidad de propietario, Persona, Auth, relación canónica ni mecanismo paralelo de identidad. Enlaces históricos/estados y flujos de inquilino/profesional permanecen.
