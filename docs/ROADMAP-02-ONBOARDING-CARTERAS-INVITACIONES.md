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

## Revalidación resolutiva — 2026-09-28

**Estado vigente: BLOQUEO EXTERNO DEMOSTRADO para validación oficial; no validado completamente.** Sustituye cualquier interpretación de «cierre» anterior como certificación Emulator.

### Entorno y reparación

- Checkout inicial real: `c6b858d`, rama dedicada correcta, con contenido restaurado sin commit. Se contrastaron todos los archivos de `ac705123ec1be1780c7e42f2ac5027569940deb1`: idénticos byte a byte. Se preservó el contenido en stash, se completó el historial shallow y se avanzó por fast-forward a `ac70512`, sin reset, rebase ni modificación de main.
- Node `22.22.3`, npm `10.9.8`. Java, javac y Firebase CLI no estaban instalados; tampoco las dependencias locales de aplicación.
- `npm ci`: 397 paquetes, 0 vulnerabilidades reportadas. No se alteró el manifiesto ni lock de producción.
- Firebase CLI `15.31.0` instalado mediante npm en `/home/user/validation-tools`, separado del repositorio, junto con Firebase SDK y rules-unit-testing. CLI comprobada con `--version`. Esta CLI exige Java 21 o posterior.
- Configuración existente: Firestore con database nombrada y Storage, sin configuración de puertos Emulator ni `.firebaserc`. Las suites R02 existentes son locales, no una suite oficial ejecutable equivalente. No se atribuye a esas suites validación del planificador Firebase.

### Intentos de resolver Java y binarios oficiales

1. `sudo -n apt-get update`: repositorios Debian bookworm, updates y security inaccesibles, `Connection failed` en puerto 80.
2. HTTPS a Debian: `SSL_ERROR_SYSCALL` en puerto 443.
3. JDK 21 Temurin localizado mediante API oficial GitHub; descarga directa de release y API de assets con `Accept: application/octet-stream`: redirección a `release-assets.githubusercontent.com` falla por SSL/EOF; archivo descargado de 0 bytes.
4. Alternativas oficiales Oracle, Azul, Amazon Corretto y Microsoft: conexiones HTTPS fallan por `SSL_ERROR_SYSCALL`.
5. CLI `setup:emulators:firestore`: falla descarga oficial `cloud-firestore-emulator-v1.22.0.jar` desde Google Storage.
6. CLI `setup:emulators:storage`: falla descarga oficial `cloud-storage-rules-runtime-v1.1.3.jar` desde Google Storage.
7. Pruebas adicionales de Google Storage: endpoint JSON, `storage-download.googleapis.com`, `www.googleapis.com` y conexión IPv4/HTTP1.1: mismo fallo TLS. npm y API GitHub sí responden: no es ausencia general de conectividad ni una petición de credenciales Firebase.
8. `firebase emulators:exec --project demo-roadmap02 --only firestore,storage 'true'`: salida 1, `Could not spawn java -version`. Es un intento de arranque, **no una ejecución de tests**.

Hay dos obstáculos independientes: no se puede obtener JDK y no se pueden obtener los JAR oficiales. Se requiere habilitar descargas HTTPS a una distribución oficial JDK y Google Storage, o proporcionar esos artefactos oficiales con checksums verificables en el entorno. No se rebajaron reglas ni se desactivó TLS. No hubo correcciones funcionales basadas en resultados Emulator inexistentes.

### Resultados efectivamente ejecutados

- Global Vitest: **112 archivos, 2.385/2.385 PASS**, incluidos R02 originales 33, integración 30, reglas locales 2 y resumen 8.
- B **92/92**, C **82/82**, E **64/64**.
- `npm run lint` (`tsc --noEmit`): PASS.
- `npm run build`: PASS, advertencia conocida de chunks grandes.
- `git diff --check`: PASS.
- Firestore/Storage Emulator, aislamiento real, consultas reales y recuperación real con Auth: **PENDIENTES / NO EJECUTADOS**, no PASS.

Procedimiento permanente: [Principio resolutivo de Arena](operaciones/PRINCIPIO-RESOLUTIVO-ARENA.md).
