# BLOQUE 11 — AUDITORÍA INTEGRAL FINAL · CIERRE

Árbol auditado: `arena/01a0e939-gestor-de-inmuebles-vercel` @ `a52698011c2596676504567e3f288d339c1c4a13` (padre `e0c3cfa57441f787130a66d86c79d5ba78a34d5c`, `main` = `c0c82245d1adccf752903765ea554cb3544f1072`).
Inspección previa: `docs/BLOQUE-11-AUDITORIA-INTEGRAL-INSPECCION.md`. Este documento **dictamina** sobre ella. Todas las cifras están recalculadas y todas las pruebas re-ejecutadas sobre este árbol.

---

## 1. Custodia del árbol (§1 de la orden)

| Comprobación | Resultado |
|---|---|
|Rama|`arena/01a0e939-gestor-de-inmuebles-vercel`|
|HEAD esperado|`a52698011c2596676504567e3f288d339c1c4a13` ✔|
|Padre|`e0c3cfa57441f787130a66d86c79d5ba78a34d5c` ✔|
|`main`|`c0c82245d1adccf752903765ea554cb3544f1072` ✔ (no tocado)|
|Recuperación de refs (5ª pérdida de snapshot)|`ls-remote` → `fetch` de la rama → **711/711 `hash-object` idénticos** → `update-ref` (rama local, `origin/arena`, `origin/main`) → `reset -q HEAD`. sha256 del árbol `2e9ab4a338980fc4bc8a67ba13e3fd9380290dd41242cf3cd7ab9c17c03eb5d7` **antes = después**. Sin `reset --hard`, sin `clean -fd`, sin borrados|
|Árbol limpio antes de auditar|✔ (sólo los dos documentos de B11 + la corrección A-06 al cierre)|

## 2. Pruebas re-ejecutadas sobre el árbol definitivo (§2 y §13)

| Suite | Resultado |
|---|---|
|`vitest run` (148 ficheros)|**2.756 pass · 0 skip · 0 fail** — al traer la base histórica con `git fetch` (ver A-04) dejaron de omitirse las 2 pruebas de `tests/seguridad-firestore-valoraciones.test.ts:256` que dependen de `git show 33fcf38:firestore.rules`; la cobertura ejecutada ha **aumentado** durante esta auditoría (antes: 2.754 pass · 2 skip)|
|`npm run lint` (`tsc --noEmit`)|0 errores|
|`npm run build` (vite + esbuild)|OK (`dist/server.cjs` 170,6 kB)|
|`git diff --check`|limpio|
|`npm run test:bloque-b`|92 PASS · 0 FAIL|
|`npm run test:bloque-c`|82 PASS · 0 FAIL (vitest 79/79)|
|`npm run test:bloque-e`|64 PASS · 0 FAIL|
|`npm run test:bloque-5`|186 PASS · 0 FAIL (vitest 182/182)|
|`npm run test:bloque-7`|435 PASS · 0 FAIL (vitest 428/428)|
|`npm run test:bloque-8`|4 ficheros / 211 tests PASS|
|`npm run test:bloque-9`|12 ficheros / 119 tests PASS|
|`node --import tsx --test src/features/operaciones/tests/*.test.mjs`|**300 pass · 2 fail** (tras A-06; eran 299/3)|
|`node --import tsx --test src/features/patrimonial/tests/*.test.mjs`|86 pass · **1 fail** (custodia, A-04)|

Los 3 fallos restantes son **de libro de referencia de custodia**, no de producto: A-04 (allowlist histórica desactualizada). Un cuarto fallo **sí era de producto de pruebas** y se corrigió: A-06.

## 3. F2 · Cuenta ≠ titular ≠ gestor, ámbitos y revocación (§4)

- **Separación de identidades**: `tests/fase14-espejo-identidad.test.ts` exige que las funciones de reglas (`isSignedIn`, `authEmail`, `isMasterAdmin`, `me`, `activeUser`) sean *literalmente* las del fichero desplegable; el binding `UID = usuarioId` y `UID ≠ usuarioId` se prueban en `src/features/patrimonial/tests/*.mjs` («sin binding o perfil inexistente no se infiere identidad»).
- **Titular con cuenta propia**: `tests/seguridad-firestore-d2.test.ts` (el titular edita su ficha fiscal, **no** cambia el `propietarioId` canónico ni puede vaciarlo), `tests/seguridad-firestore-inmuebles.test.ts` A1-A6.
- **Gestor multi-titular con delegación**: `tests/seguridad-firestore-carteras.test.ts` A1-A4 (lee los inmuebles de su cartera, no ve carteras ajenas, gestor sin carteras = vacío, `carterasL` **no** concede escritura y `carterasE` sí); `.mjs`: «gestor profesional sin propiedad propia puede gestionar varios propietarios sin cuenta».
- **Ámbitos lectura vs lectura+escritura**: `tests/seguridad-firestore-d3.test.ts` A1-A4 (ámbito derivado inmueble→propietario+carteras, transversal denegado, `create/update` exigen ámbito **E**, cambio de inmueble exige ambos en ámbito); `tests/seguridad-firestore-patrimonial.test.ts` («gestor con `carterasL` lee pero NO crea»).
- **Aislamiento A/B**: `tests/seguridad-firestore-inmuebles.test.ts` A4 («consulta no acotada denegada»), `tests/seguridad-firestore-polizas.test.ts` P2, `tests/seguridad-firestore-valoraciones.test.ts`, `tests/seguridad-storage-d3.test.ts` A3 («cross-cartera por path conocido: denegado»), `.mjs` («el mismo inmueble con otro propietario no hereda acceso a los datos del anterior»).
- **Revocación efectiva (no ocultar UI)**: `perfilActualVeraz()` se evalúa en **cada** petición; `.mjs`: «revocación conserva L sin recuperar E ni convertirse en gestión activa», «estado de cuenta BLOQUEADO/INACTIVO/PENDIENTE no concede carteras ni titularidad», «master canónico procede del email autenticado, no del perfil ni de carteras», «ADMINISTRADOR sin relación no recibe bypass operativo».
- **Storage y cuentas**: `tests/seguridad-storage-documentos.test.ts` (subida sólo bajo metadata pendiente, MIME/tamaño, descarga exige el ID referenciado y acceso al inmueble, borrado sólo titular/admin en `PENDIENTE_ELIMINACION`).

**Dictamen**: separación de identidades y revocación verificadas en el texto real de las reglas. Sin hallazgos en esta fase.

## 4. F3 · Seguridad UI → servicio → persistencia → reglas (§5)

- **Cobertura**: 68 colecciones usadas, **todas** con `match`; 20 declaran campo de aislamiento explícito y el resto se protege con los helpers canónicos (`aisladoEsMio/CreateOk/UpdateOk/Visible`, `ambitoPorInmueble*`, `ambitoPorContrato*`, `pidEnAmbito*`, `carteras*`, `gestion*Indexada`, `inmuebleParcial*`, `sinSecretos*`). Sólo `audit_logs` e `inmobiliarias_directorio` quedan con control exclusivamente master/staff, que es su diseño.
- **Escrituras con IDs de UI / IDs manipulables**: los `setDoc` usan id derivado o validado por reglas (`isValidId`, `aisladoCreateOk`, `carterasNoAutoasignadasEnCreacion`, `carterasSinCambiarPorUsuario`, `inmuebleAutorizadoExplicito`).
- **Operaciones admin amplias**: no se detectan `allow write: if true` ni bypass por rol sin relación (probado en `.mjs` y en `seguridad-firestore-*`).
- **Hallazgos** (matriz §17): A-01 (consultas sin acotar en secciones de PROPIETARIO, **ALTO**), A-02 (caso concreto en suministros/lecturas/cambios), A-03 (R-5 Storage), A-11 (residuales R-3/R-4).
- **Ninguna modificación de reglas ni de permisos** en este bloque (§20 respetado).

## 5. F4 · El inmueble como centro (§6)

- Relaciones verificadas por pruebas del árbol: `src/features/operaciones/tests/*` («referencias a otro inmueble rechazadas al crear avería / garantía / presupuesto», «factura y reparación deben pertenecer al mismo proveedor», «el ámbito requiere propietario e inmueble explícitos y referencias no ambiguas», «contrato no accesible: referencia no verificable falla en cerrado»), `src/features/patrimonial/tests/*` (cross-owner, versión y snapshot alterados se rechazan).
- Huérfanas y duplicados: `tests/migracion-dry-run-b4.test.ts` los **cuantifica** (C3 «huérfano (cobro sin contrato) ⇒ INCOMPLETO con motivo»), `tests/expediente-documental.test.ts` rechaza huérfanas en sustituciones, `tests/facturacion.test.ts` marca la huella rota al eliminar el primero de una cadena.
- No se detectan dependencias de estado visual para la integridad: las referencias se validan en motor/reglas, no en el render.
- **Dictamen**: sin hallazgos. No se cambia el modelo de datos (§20).

## 6. F5 · Auditoría individual de bloques B0–B9 (§7)

| Bloque | Artefacto | Suite re-ejecutada en B11 | Estado |
|---|---|---|---|
|B0 consolidación|`REPARACION-FINAL-INTEGRACION-BLOQUES-3-9-2026-09.md`, `ESTADO-GIT-ERP.md`|custodia de árbol (A-04)|superficie histórica intacta salvo documentación de bloques posteriores|
|B1 identidad/roles/contratos|`ROADMAP-01-*`, `FASE5-INSPECCION-PERSISTENCIA-IDENTIDAD.md`|`fase14-espejo-identidad`, `.mjs` identidad|PASS|
|B2 onboarding/carteras/invitaciones/revocación|`ROADMAP-02-*`, `docs/BLOQUE_D_ACTAS.md`|`roadmap02-*`, `seguridad-firestore-carteras`, `.mjs` onboarding|PASS|
|B3 inmueble CRUD/relaciones|`ROADMAP-03-*`|`seguridad-firestore-inmuebles`, `altaInmueblePropietario`|PASS|
|B4 alquiler end-to-end|`docs/operaciones/*`, `BLOQUE_C-*`|`test:bloque-c` 82/82, `test:bloque-e` 64/64|PASS|
|B5 operaciones→fiscalidad sin duplicidad|`BLOQUE-5-OPERACIONES-FISCALIDAD.md`|`test:bloque-5` 186/186 + 182/182 vitest|PASS (con A-04 en su libro de custodia)|
|B6 documentos/Storage|`FASE6-B6-EXPEDIENTE-FISCAL-EXPORT-ZIP.md`, `AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-*`|`seguridad-storage-documentos`, `seguridad-storage-d3`, `expediente-documental`|PASS (con A-03)|
|B7 import/export + XLSX|`BLOQUE-7-IMPORTACION-EXPORTACION-XLSX.md`|`test:bloque-7` 435/435 + 428/428 vitest|PASS|
|B8 inventario/dry-run (**sin migración real**)|`BLOQUE-8-INVENTARIO-FUENTES.md`|`test:bloque-8` 211/211 (dry-run)|PASS — no se ejecutó ninguna migración real (depende de los archivos reales)|
|B9 IA/ayuda|`docs/experiencia/*`, `F4-PRUEBA-REAL-GEMINI.md`|`test:bloque-9` 119/119|PASS — IA separada de motores; suites locales sin llamadas live a Gemini; contexto por pantalla/rol y tutoriales cubiertos|

## 7. F6 · Integración UX-1…UX-7 (§8)

- Navegación: `src/navegacion/navegacion.ui.test.tsx` (28 ítems / 6 grupos, `inicio` fuera de catálogo, contador real `incidenciasAbiertas` reconciliado con las incidencias leídas) — PASS.
- Accesibilidad: `src/accesibilidad/{dialogo,interaccion,ux56.integracion,ux7.integracion}.ui.test.tsx` (pila de diálogos top-only, foco, Escape, `aria`) — PASS.
- Estados de datos y feedback: `estadoDatosUI`, `canalIncidencias`, `canalFeedback`, `confirmacion` — PASS. **0 usos productivos de `window.alert/confirm/prompt`** (verificado por test y por grep).
- Formularios: `src/formularios/*.test.ts` (validaciones y mensajes) — PASS.
- Responsive y consistencia: cubierto por las mismas suites + `tests/ux7.integracion.ui.test.tsx`.
- No se reabre ningún trabajo UX: se comprobó integración, no diseño. **No hay regresiones funcionales UX detectadas**; la única regresión hallada es A-06 (prueba `.mjs` que invocaba un componente con hooks fuera de render), corregida.

## 8. F7 · Duplicidad funcional (§9)

| Patrón buscado | Resultado |
|---|---|
|`addDoc` + escritura manual posterior|**0** (`addDoc` sólo existe en `src/test/e/firestoreMemoria.ts`)|
|Listeners que escriben dentro de su propio callback|**0** (recuento con balance de paréntesis sobre 78 `onSnapshot`)|
|Efectos React que reescriben lo que acaban de leer|**0**|
|Funciones con ≥2 escrituras a colecciones distintas (doble escritura)|**0**|
|Fuente canónica por entidad|única por colección (`src/lib/*Firestore.ts` / `features/*/persistence`); `App.tsx` mantiene una única capa de suscripción global con `dataScope`|

Caché derivada: 9 claves `localStorage` de dominio, escritas por los mismos listeners y **borradas en el cierre de sesión** (`authService.ts:1259-1269`). No hay autoridad paralela: la caché nunca restaura Firestore (probado en `seguridad-firestore-inmuebles.test.ts` §F).

**Dictamen**: sin hallazgos de duplicidad contradictoria.

## 9. F8 · Errores, promesas y estados (§10)

- `catch {}` vacíos: **37 sitios** (App.tsx 23, `authService.ts` 10, DashboardEjecutivoSection 2, ActasSection 2) — todos en rutas de mejor esfuerzo (`localStorage`, envoltorios de suscripción, flujos de autenticación que informan por estado) → muestreo verificado, **documentado**.
- `catch` sólo-consola: **56 en 22 ficheros**, concentrados en capas de servicio que devuelven `{ok:false}` o propagan (verificado en `LoginView` y `CentroOperativoInmueblePanel`: `finally` + mensaje de usuario) → **documentado**.
- Fallo que parece vacío legítimo: **A-07** (`MorosidadSection.tsx:183`, historial/evidencias a `[]` sin aviso).
- Promesas flotantes: los `16` candidatos heurísticos se revisaron uno a uno; todos son cadenas `.then()` con tratamiento dentro del callback (patrón UX-2 §6 `persistirMejorEsfuerzo` / `ejecutarOperacion`) → **sin hallazgo**.
- Carga infinita / éxito falso: los manejadores de error de suscripción existen (`reportarErrorLectura` → canal de incidencias visible); A-01 es el caso donde la sección además queda sin datos.

## 10. F9 · Código muerto (§11, sólo con las 5 condiciones)

2.152 símbolos exportados. **276 sin ningún uso productivo**:

|Categoría|Nº|Condiciones|Decisión|
|---|---|---|---|
|Sin uso en producción, tests, documentación ni código externo (0 uso dinámico: 0 citados como cadena literal)|**114**|1-4 ✔, 5 ✔ (no son histórico)|candidatos reales; **no se elimina nada** en B11|
|Sólo citados por tests|103|cond. 3 ✘ (son contrato de pruebas)|conservar|
|Citados sólo en documentación|52|cond. 4 ✘ (trazabilidad documental)|conservar|
|Con contrato externo real (`server.ts`)|7 (`documentosServidor.ts` ×5, `CanalWebhook`, `resolverAutorizacion`)|cond. 4 ✘|conservar|

Muestra de los 114: `OnboardingCarteras` (componente sustituido por `CarterasOnboardingPanel`), `SUMINISTROS_COL`/`CAMBIOS_COL` (`suministrosFirestore`), 20 funciones `delete*Firestore` sin consumidor, todo `src/notificaciones/adaptadores.ts` (24 `evento*`). **Ninguna eliminación automática** (§20/§19).

## 11. F10 · Matriz funcional (§12)

28 secciones del catálogo **+ `inicio`** (fuera del catálogo por decisión de UX-1 §1). `—` significa «recibe los datos por props desde la capa única de suscripción de `App.tsx` (con `dataScope`), sin servicio propio».

|Sección|UI|Servicios invocados por la UI|Colecciones|Tests|
|---|---|---|---|---|
|inicio|InicioSection|—|—|0|
|dashboard|DashboardEjecutivoSection|`subscribeActas`, `subscribeAuditLogs` (+ global)|—|2|
|inmuebles|InmueblesSection|—|—|5|
|propietarios|PropietarioPortalSection|—|—|1|
|formalizacion|FormalizacionSection|`saveContratoFirestore`, `saveHabitacionFirestore`|`contratos_formalizacion`, `habitaciones_inmueble`|0|
|inquilinos|InquilinosSection|`saveIncidenciaFirestore`, `saveUsuarioFirestore`|`incidencias`, `usuarios`|1|
|cobros|CobrosSection|—|—|1|
|gastos|GastosSection|—|—|0|
|incidencias|IncidenciasSection|`subscribeIncidencias/Polizas/Siniestros/Tareas/Garantías/Trabajos`, `save*`, `delete*`|`incidencias`, `polizas_seguros`, `siniestros`, `tareas_mantenimiento`, `garantias_reparacion`, `trabajos_profesionales`|1|
|operaciones|OperacionesSection|`saveIncidenciaFirestore`, `savePolizaFirestore`…|`incidencias`, `polizas_seguros`, `siniestros`|1|
|suministros|SuministrosSection|`subscribeSuministros/Lecturas/CambiosTitular/MensajesPortal`|`suministros`, `lecturas_suministro`, `cambios_titular`, `mensajes_portal`|1|
|polizas|PolizasSegurosSection|`subscribePolizasSeguras`, `save/deletePolizaFirestore`|`polizas_seguros`|0|
|fiscal|FiscalidadSection|`subscribeGastosSeguros`|`gastos`|0|
|facturacion|FacturacionSection|`saveEnvioVerifactuFirestore`…|`facturas`, `envios_verifactu`, `series_facturacion`|0|
|financiacion|FinanciacionSection|`save/deleteFinanciacionFirestore`|`financiaciones`|0|
|inversion|InversionSection|`save/deleteAnalisisInversionFirestore`|`analisis_inversion`|0|
|conciliacion|ConciliacionBancariaSection|`guardarImportacionConciliacion`|`conciliaciones_bancarias`, `importaciones_bancarias`|0|
|tesoreria|TesoreriaSection|—|—|1|
|morosidad|MorosidadSection|—|—|0|
|seguro_impago|SeguroImpagoSection|—|—|0|
|actas|ActasSection|`saveActaFirestore`, `saveEvidenciaActaFirestore`|`actas`, `actas_evidencias`, `actas_incidencias`, `actas_otp`|3|
|administracion|AdminControlCenter|—|`personas`, `usuarios_auth`|3|
|analisis|AnalisisSection|—|—|0|
|candidatos|CandidatosSection|—|—|0|
|preseleccionados|PreseleccionadosSection|—|—|0|
|recomercializacion|RecomercializacionSection|—|—|0|
|informes|InformesSection|—|—|0|
|configuracion|ConfiguracionSection|—|—|0|
|ayuda|CentroAyudaSection|—|—|2|

Huérfanas de navegación: **ninguna** sección del catálogo deja de tener componente (y ningún componente de sección del catálogo queda sin ruta). `OnboardingCarteras` y `ProfesionalesSection` **no** están en el catálogo: están en la lista de código sin consumidores (A-09) y **no se eliminan**.

## 12. F12 · Integración B0–B10 (§14)

|Bloque|Evidencia de integración (no «existe un test»)|
|---|---|
|B0–B3|flujo identidad→cartera→inmueble: `.mjs` de identidad + `seguridad-firestore-{carteras,inmuebles,d2,d3,deltas-c}` en PASS; un gestor sin relación no obtiene nada y el titular no puede transmitir ni desvincular|
|B4|`test:bloque-c`/`test:bloque-e` end-to-end de alquiler (contrato→cobro) PASS|
|B5|`test:bloque-5` verifica operación→gasto→fiscalidad sin duplicar colecciones ni crear modelos paralelos|
|B6|`seguridad-storage-documentos` + `expediente-documental`: documento↔inmueble↔Storage↔auditoría encadenados|
|B7|`test:bloque-7` (435) importación/exportación y XLSX contra el modelo canónico, sin capa de I/O paralela|
|B8|dry-run 211/211: inventario de fuentes y huérfanos sin escribir nada (migración real NO ejecutada)|
|B9|IA sólo-lectura, contexto por pantalla/rol, autorización y auditoría; separada de los motores; sin envíos innecesarios a Gemini en las suites|
|B10 (UX-1…7)|navegación + contador real + diálogos accesibles + estados/feedback unificados en PASS; 0 `alert/confirm/prompt` productivos|

## 13. F13 · INFRA-01 (§15)

- **No se reintenta** el emulador (§20). En este entorno: `firebase-tools` no instalado y `java` ausente → el motor de Google **no** ejecuta las reglas.
- Sustituto real usado: `tests/harness/firestoreRulesEval.ts` evalúa el **texto desplegable** de `firestore.rules` (lanza si no cubre una construcción) y lo consumen 13 suites `seguridad-*` + `fase14`. **No se declara validación oficial de Rules.**
- Consecuencia declarada: A-01 (denegación a nivel de consulta) queda como **pendiente de entorno real**; el harness sí prueba la condición por documento.

## 14. F14 · Clasificación de lo pendiente (§16)

|Categoría|Elementos|
|---|---|
|**Validado ahora (código real, sin datos)**|integración de los 28 puntos de navegación; aislamiento y ámbitos por reglas; motores y relaciones; persistencia (68 colecciones, todas con regla); duplicidad; errores; UX; suites y build|
|**Pendiente de datos reales**|migración histórica B8 (dry-run en código; no ejecutada con los archivos reales); conciliación bancaria con extractos reales; expediente fiscal con datos de ejercicio real|
|**Pendiente de entorno real**|ejecución de Rules en emulador/proyecto (INFRA-01); confirmación de A-01 en Firestore real; despliegue de `firestore.rules`/`storage.rules` y verificación en producción|

No se introdujo ni se inventó ningún dato real.

## 15. Matriz de hallazgos (§17)

|ID|Hallazgo|Severidad|Bloque|Evidencia|Acción|
|---|---|---|---|---|---|
|A-01|22 suscripciones **sin ámbito** en 8 secciones visibles a PROPIETARIO (Incidencias 5, Operaciones 9, Suministros 3, Actas 1, Dashboard 1, Fiscalidad 1, Formalización 1, Pólizas 1): la regla `list` exige condición por documento y Firestore no usa reglas como filtros ⇒ consulta no acotada no autorizable en perfiles no master (el error se registra en el canal de datos y la sección queda sin datos)|ALTO|B4/B10 y anteriores|`IncidenciasSection:124-145` (recibe `currentUser` y no lo usa para el scope), `OperacionesSection:238-249`, `SuministrosSection:83-85`, `ActasSection:64/80` (patrón correcto de referencia), `firebase.ts:1494-1525` (`subscribeColeccionPropietario`: sin scope → `onSnapshot(col)`), reglas `list` (`incidencias` l.1431, `polizas_seguros`, `suministros`…), `reportarErrorLectura`|**Tipo B**: documentado, no corregido (22 puntos + decisión de producto: `where` por ámbito reutilizando `ActasSection:64/80` como patrón). Sin fuga de datos: la regla es la autoridad|
|A-02|`suministrosFirestore.subscribeCol` (98-111) suscribe la colección sin `where`; consumidores `SuministrosSection:83-85` y `subscribeMensajesPortal`|MEDIO|B4|rango de líneas citado + reglas de `suministros`/`lecturas_suministro`/`cambios_titular`|**Tipo B** (caso concreto de A-01 en suministros)|
|A-03|R-5 Storage: `presupuestos/`, `trabajos/`, `profesionales/{id}/documentos/` no tienen bloque ⇒ deny final; 3 puntos de subida degradan a data-URL|MEDIO|B6|`storage.rules` (19 bloques + `/{allPaths=**}` deny), `DetalleProfesionalModal:105`, `PresupuestoProfesionalModal:200`, `TrabajoProfesionalModal:171`|**Tipo B**: añadir bloques exige decisión + pruebas de reglas|
|A-04|3 aserciones de custodia fallan: las allowlists de `integration-boundaries.test.mjs:55`, `isolation.test.mjs:137` (operaciones) e `isolation.test.mjs:210` (patrimonial) describen la superficie de la integración B/C y no contemplan los 161 ficheros legítimos de bloques posteriores (además, la base histórica `46bb9f79…` no existía en el clon — se trajo con `git fetch` puntual)|MEDIO|B5/B11|salida `node --test`; `git diff --name-only 46bb9f79…` = 161 rutas, **ninguna** bajo `src/features/patrimonial/**` ni `src/patrimonial/**`; el test byte-a-byte de los 28 ficheros patrimoniales **pasa**|**Tipo B**: la guardia debe redefinirse (o congelar su ventana temporal); actualizar la lista debilitaría el control y excede una corrección mínima|
|A-05|Las 21 suites `.mjs` (`node --test`) no las ejecuta **ningún** script `npm` (vitest las excluye por `vite.config.ts`); 2 pruebas de vitest se omitían silenciosamente por falta de historial git en el clon|MEDIO|global|`package.json` (scripts `test:bloque-*`), `vite.config.ts`, `seguridad-firestore-valoraciones.test.ts:256`|**Tipo B**: documentado; añadir el script es cambio de configuración de CI, fuera de una auditoría. El `git fetch` de la base histórica ya reactivó las 2 pruebas omitidas|
|A-06|Regresión de UX-5/6 (`e0c3cfa`): `ui.test.mjs` invocaba `FormularioOperacion` como función; al incorporar `useDialogoAccesible` (`panel.tsx:38`) los hooks fuera de render lanzan `TypeError: Cannot read properties of null (reading 'useRef')`|MEDIO|B10 (UX-5/6)|traza completa del `node --test` + `git log -L` sobre `panel.tsx`|**CORREGIDO (Tipo A)** en este bloque: la prueba renderiza con `React.createElement` + `renderToStaticMarkup` (mismo patrón que el resto del fichero) y comprueba mensaje + botón de guardado deshabilitado + cancelar disponible. Suite: 299/3 → **300/2** (los 2 restantes son A-04)|
|A-07|`MorosidadSection.tsx:183`: `catch` fija historial y evidencias a `[]` sin mensaje ⇒ parece «sin datos» cuando hubo error de lectura|BAJO|previo|rango 173-185|**Tipo B** documentado|
|A-08|37 `catch {}` vacíos y 56 `catch` sólo-consola en 22 ficheros|BAJO (muestreado)|global|recuento y muestreo (todos en rutas de mejor esfuerzo; los servicios informan por estado)|Documentado|
|A-09|276 símbolos exportados sin uso productivo: 114 sin uso alguno, 103 sólo-test, 52 sólo-documentación, 7 con contrato externo|DOCUMENTAL|global|análisis estático (2.152 exportados; 0 usos dinámicos como cadena)|Documentado; **no se elimina nada**|
|A-10|Caché `localStorage` de dominio (9 claves) escrita desde listeners y borrada en logout (11 `removeItem`)|DOCUMENTAL|B1|`App.tsx` (setItem), `authService.ts:1259-1269`|Documentado|
|A-11|Residuales R-3 (`application/octet-stream` aceptado por `isPdfOrImage()`, l.271) y R-4 (las `downloadURL` con token son enlaces de capacidad ajenos a las reglas)|BAJO (conocido y comentado en el propio fichero)|B6|`storage.rules:24-26`, `:271`, `:454`|Documentado (ya lo estaban)|
|A-12|INFRA-01: emulador no ejecutable (sin `firebase-tools` ni `java`)|DOCUMENTAL (Tipo C)|global|`firebase.json` presente; binarios ausentes|Documentado; **no se reintenta**|
|A-13|Sin hallazgos de duplicidad, huérfanas de navegación, escrituras que vulneren reglas ni modificaciones de motor|—|B0–B10|secciones 5, 8, 11|—|

## 16. Correcciones aplicadas (§19 Tipo A)

**Única modificación de código del bloque 11**: `src/features/operaciones/tests/ui.test.mjs` — restauración de la prueba de visibilidad de error de guardado, rota por el hook accesible añadido en UX-5/6. Sin impacto en producción (cambio de prueba). Verificación posterior: las 21 suites `.mjs` dan 300 PASS (operaciones) + 86 PASS (patrimonial) y sólo quedan los 3 fallos de custodia (A-04).

## 17. Veredicto (§22 y §23)

**AUDITORÍA INTEGRAL SUPERADA CON INCIDENCIAS NO BLOQUEANTES.**

- **BLOQUES 0–10 CONSOLIDADOS Y AUDITADOS**: arquitectura coherente UI→servicios→motores→persistencia→reglas; aislamiento y ámbitos verificados en el texto real de las reglas; motores intactos; sin duplicidad contradictoria; sin huérfanas de navegación; UI/UX integrada; validación técnica completa en verde.
- **Lo ya validado en código**: todo lo de la tabla §14 (validado ahora).
- **Pendiente de datos reales**: migración histórica B8 (dry-run), conciliación y expediente fiscal con datos reales.
- **Pendiente de entorno real**: Rules en emulador/proyecto (INFRA-01), confirmación de A-01 en Firestore real, despliegue de reglas.
- **Pendiente de integración final**: el merge a `main` **no se realiza en esta orden**.
- Primera prioridad antes de usar la app con perfiles no master en entorno real: **A-01** (con A-05 como causa de fondo de que A-06 pasara desapercibido, y A-04 para recuperar la señal de custodia).
