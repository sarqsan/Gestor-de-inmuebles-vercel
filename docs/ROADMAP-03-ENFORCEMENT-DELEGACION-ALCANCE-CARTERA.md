# BLOQUE 3 — ROADMAP-03: enforcement de delegación y alcance de cartera

**Estado de desarrollo:** implementado y probado localmente; sin merge.  
**Alcance:** autorización efectiva por titular, gestor, relación vigente y conjunto de `inmuebleIds`; no añade roles ni un sistema paralelo de permisos.

## Decisión de autorización

`usuarios_auth/{uid}.gestionesPorPropietario` es una ruta de resolución de relación, no una lista de permisos. El código de proyección mantiene las delegaciones parciales fuera de `carterasL` y `carterasE`. El índice se deriva de gestiones activas, aceptadas y del gestor correspondiente. En cada operación las reglas consultan la relación canónica y verifican titular, gestor, estado, aceptación y ámbito.

- Una relación de cartera completa (`inmuebleIds: []`, contrato existente) conserva el acceso completo autorizado.
- Una relación parcial concede acceso únicamente a IDs incluidos en `inmuebleIds`.
- Para escritura, además exige `LECTURA_ESCRITURA` y `responsableActual == GESTOR`.
- Gestiones pendientes, suspendidas, revocadas, no aceptadas, inexistentes o incoherentes deniegan acceso. El conocimiento de IDs no autoriza.
- La mutación transaccional de relación y espejo actualiza o retira el índice sin convertir el alcance parcial en cartera completa. Las carteras L/E continúan derivándose mediante `proyectarCarterasGestionadas`.
- Las Rules de Firestore y Storage aplican el mismo predicado a inmuebles, recursos de Firestore enlazados por `inmuebleId` y evidencias de Storage bajo `inmuebles/{id}/inventario/`. El borrado Storage sigue restringido al titular/admin.
- La lectura de imágenes de catálogo en `inmuebles/{id}/{file}` y fichas públicas mantiene el contrato público deliberado de R3; no equivale a autorización sobre el documento privado del inmueble ni sus evidencias de inventario.

## Cambios

- `src/lib/carterasGestion.ts`: helper canónico que indexa relaciones activas/aceptadas para resolución de Rules, separado de la proyección L/E.
- `src/lib/gestionesCarteraServicioFirebase.ts`: aplicación transaccional del índice en transiciones y proyección a espejo, incluyendo delegaciones parciales.
- `firestore.rules`: derivación de ámbito por inmueble reusa `inmuebleParcialIndexado` para recursos con `inmuebleId`, sin ampliar consultas generales del titular.
- `storage.rules`: relación vigente y propiedad de inmueble verificadas por lectura/escritura en inventario/evidencias; mantiene `[]` como cartera completa y listas no vacías como parciales.
- `tests/roadmap03-delegacion-alcance.test.ts` y `src/lib/carterasGestion.test.ts`: permisos y denegaciones, permisos parciales, titular propio, aislamiento intertitular, permiso de escritura, estado/identidad/índice y Storage.

## Validación y límite de Emulator

Resultados ejecutados en esta Arena:

- `npx vitest run`: **113 archivos / 2.397 tests PASS**.
- ROADMAP-03: **12/12** tests específicos; proyección/índice: **11/11**.
- Seguridad R02 afectada (integración, onboarding, reglas y Storage): **129/129** en ejecución dirigida.
- Bloques B/C/E: **92/92, 82/82 y 64/64**.
- `npx tsc --noEmit`: PASS; `npm run build`: PASS (avisos de bundle grande y chunks, no bloqueantes); `git diff --check`: PASS.

La suite Vitest usa los intérpretes de reglas locales del repositorio; prueba texto de reglas con fixtures, pero **no es Firebase Emulator**. El Emulator no se reintentó en este bloque para no repetir la incidencia compartida documentada en [ROADMAP-02](ROADMAP-02-ONBOARDING-CARTERAS-INVITACIONES.md): faltan Java 21+ y los JAR oficiales, y las descargas oficiales fallaron por problemas de red/TLS. Firestore Rules y Storage Rules requieren ejecución posterior con Emulator antes de integración final.

Registrar esa única incidencia compartida; no duplicar la investigación de infraestructura en ROADMAP-03.
