# BLOQUE 12 — REPARACIÓN INTEGRAL POST-AUDITORÍA · **CIERRE** (§13)

> Orden: reparación integral autónoma tras la auditoría del BLOQUE 11 (`62afa2f`).
> Documentos de entrada: `docs/BLOQUE-11-AUDITORIA-INTEGRAL-INSPECCION.md` y
> `docs/BLOQUE-11-AUDITORIA-INTEGRAL-CIERRE.md`.
> Documento de inspección de este bloque: `docs/BLOQUE-12-REPARACION-INTEGRAL-INSPECCION.md`.
> Todas las cifras de este documento proceden **de la ejecución final** sobre el árbol
> final (§H); no se reutilizan cifras de bloques anteriores.

---

## A. Estado inicial

| Comprobación | Valor |
|---|---|
| Rama | `arena/01a0e939-gestor-de-inmuebles-vercel` |
| HEAD de partida | `62afa2f267bd90933abe8b62810d5caa4d8b714b` («audit: complete block 11 integral audit») |
| Árbol del commit | `947c9bbd…` · sha256 `b3d93772…` · padre `a526980` |
| `main` / `origin/main` | `c0c82245d1adccf752903765ea554cb3544f1072` — **no tocado** en todo el bloque |
| `origin/arena/…` | `62afa2f…` (local = remoto) |
| Custodia | 8.ª restauración con protocolo no destructivo: `git fetch origin <sha>` (solo objetos) → verificación `git hash-object` 713/713 → `update-ref` de `refs/heads/<rama>`, `refs/remotes/origin/<rama>`, `refs/heads/main`, `refs/remotes/origin/main` → `reset -q HEAD` → verificación de árbol/status. Sin `reset --hard`, sin `clean`, sin borrados |
| Base histórica B `46bb9f79…` | ausente tras el snapshot (los tests de custodia fallaban por falta de referencia); recuperada con `git fetch origin <sha>` **solo objetos** → línea base restaurada (los 3 fallos de custodia volvieron a ser 2 en operaciones + 1 en patrimonial, es decir los de la allowlist A-04-B11) |
| `node_modules` | ausente → `npm ci` |

---

## B. Tabla de incidencias (ID | Incidencia | Diagnóstico | Reparación | Resultado)

| ID | Incidencia | Diagnóstico | Reparación (mínima) | Resultado |
|---|---|---|---|---|
| **A-01** | 22 suscripciones sin ámbito en 8 secciones visibles a PROPIETARIO (Incidencias 5, Operaciones 9, Suministros 3, Actas 1, Dashboard 1, Fiscalidad 1, Formalización 1, Pólizas 1) | Las reglas conceden `list` con condición por documento y Firestore no usa reglas como filtros ⇒ consulta no acotada no autorizable en perfiles no master (denegación + sección vacía). Sin fuga: la regla es la autoridad | Helper único `subscribeColeccionPorAmbito`/`subscribeUnionDeFuentes`/`scopeDeUsuario`/`claveScope` en `src/lib/firebase.ts`; acotado de **todas** las suscripciones patrimoniales (secciones, paneles, modales y App) y desmontaje por cambio de ámbito | **RESUELTA** (con prueba de regresión de 41 aserciones; ver §C) |
| **A-02** | `suministrosFirestore.subscribeCol` suscribía la colección sin `where` (suministros, lecturas, cambios de titular) | Caso concreto de A-01 | `subscribeCol` eliminado; las 4 suscripciones delegan en el helper (`inmuebleId` ×3, `contratoId` para el portal) | **RESUELTA** |
| **A-03** | R-5 Storage: `presupuestos/`, `trabajos/`, `profesionales/{id}/documentos/` sin bloque ⇒ deny final; 3 puntos de subida degradan a data-URL | Añadir bloques exige decisión de producto + pruebas de reglas | No se toca (fuera de una corrección mínima) | **PENDIENTE ARQUITECTÓNICA** (no bloqueante) |
| **A-04-B11** | Aserciones de custodia con allowlists congeladas en B5/B7: `operaciones #113`, `#120` y `patrimonial #87` (preexistentes) y, **como consecuencia aditiva de A-05**, `patrimonial #85` (`package.json solo añade los scripts B5/B7`) | Las listas/expectativas describen la superficie de la integración B/C y no contemplan los ficheros y scripts legítimos de bloques posteriores. El cambio de este bloque es **puramente aditivo** (`git diff --numstat`: 0 líneas borradas en `package.json`; ninguna dependencia, metadato ni script previo alterado) | No se amplían las listas ni se toca la aserción: exige el mismo dictamen que A-04-B11 | **PENDIENTE ARQUITECTÓNICA** (exige dictamen; no bloqueante). Señalizada explícitamente: es una señal de custodia **nueva** causada por la integración ordenada en §7, de impacto nulo en producto |
| **A-04-B12** | No existía guardia técnica de integridad de refs git para el síntoma recurrente «HEAD→main + muchos modificados tras snapshot» | 8 restauraciones manuales del mismo síntoma | `scripts/guardia-a04-repositorio.mts` + `npm run auditoria:repositorio`: **solo lectura**, salida `A-04: OK/WARNING/BLOCKED` (0/1/2), detecta rama incorrecta, HEAD→main, rama ausente, divergencia con origin, árbol masivo, índice inconsistente, objetos ausentes; imprime el protocolo manual no destructivo | **RESUELTA** (guardia en verde en la ejecución final) |
| **A-05** | Las 21 suites `.mjs` de test no las ejecutaba ningún script `npm` | Vitest las excluye (`vite.config.ts`) y no había mecanismo oficial | Scripts `test:operaciones`, `test:patrimonial`, `test:integracion`, `test:emulador:operaciones`; clasificación completa de los 28 `.mjs` (§E) | **RESUELTA** |
| **A-06** | Regresión UX-5/6 en `ui.test.mjs` (fallo real del proceso) | Ya corregida en `62afa2f` con `renderToStaticMarkup` | — | **RESUELTA (B11)** |
| **A-07** | `MorosidadSection.tsx:183`: `catch` fijaba historial y evidencias a `[]` sin aviso («parece sin datos») | Error de lectura silenciado | `reportarErrorLectura('morosidad_historial', …)` en el `catch` (sin cambio de UI) | **RESUELTA** |
| **A-08** | 37 `catch {}` vacíos / 56 solo-consola en 22 ficheros | Todos en rutas de mejor esfuerzo; los servicios informan por estado | No se refactoriza (cambio mayor, sin defecto observado) | **DOCUMENTADA** (no bloqueante) |
| **A-09** | 276 símbolos exportados sin uso productivo (114 sin uso, 103 solo-test, 52 solo-doc, 7 contrato externo) | Análisis estático; 0 usos dinámicos como cadena | No se elimina nada | **DOCUMENTADA** (no bloqueante) |
| **A-10** | Caché `localStorage` de dominio (`rentselect_*`, 9 claves, 11 `removeItem`) | Comportamiento deliberado; limpieza en logout | No se toca | **DOCUMENTADA** (no bloqueante) |
| **A-11** | R-3 (`application/octet-stream` aceptado por `isPdfOrImage()`) y R-4 (downloadURL con token = enlace de capacidad) | Conocidos y comentados en `storage.rules` | No se toca | **DOCUMENTADA** (no bloqueante) |
| **A-12** | INFRA-01: emulador no ejecutable (sin `firebase-tools` ni `java`) | Limitación del entorno | No se reintenta | **LIMITACIÓN DE INFRAESTRUCTURA** |
| **A-13** | Sin hallazgos de duplicidad, huérfanas de navegación, escrituras que vulneren reglas ni cambios de motor | — | — | **NO APLICA** |
| **B12-1** | Ampliación del alcance real de A-01: paneles y modales con suscripciones sin acotar (`CentroOperativoInmueblePanel` 4, `MantenimientoInmueblePanel` 4, `ReformasInmueblePanel` 5, `ProfesionalesSection` 4, `DetalleTrabajoProfesionalModal` 1, `App.tsx` 1) | El re-escaneo con paréntesis equilibrado (la regex de ventana daba falsos positivos) mostró consumidores fuera de las 8 secciones; los paneles filtran en cliente y la consulta no era autorizable | Acotadas con el mismo helper (el filtrado local se conserva como defensa en profundidad) | **RESUELTA** |
| **B12-2** | `src/test/e/setupE.ts` (arnés BLOQUE E) no exportaba `scopeDeUsuario`/`claveScope`/`subscribeColeccionPorAmbito` y su `subscribeIncidencias` ignoraba el ámbito | Al cablear A-01, el mock quedó desincronizado: rompía las pruebas F2 y **ocultaba** fallos de aislamiento (devolvía todo aunque el componente pidiera ámbito) | Mock ampliado con la misma semántica del helper, reactivo sobre la memoria del arnés | **RESUELTA** (cierra un agujero de la propia red de pruebas) |

---

## C. A-01 · inventario de las 22 suscripciones señaladas (y ampliación)

Estado por suscripción: **colección** / **campo de ámbito** / **titular** / **gestor**
(PROFESIONAL con carteras) / **profesional sin cartera** / **sin ámbito (master)** /
**resultado**. Todos los consumidores pasan hoy `scopeDeUsuario(currentUser)`, `dataScope`
o `scope` derivado, y el efecto declara `claveScope` como dependencia.

| # | Suscripción (definición) | Colección | Campo | Titular | Gestor (carteras) | Profesional | Master | Resultado |
|---|---|---|---|---|---|---|---|---|
| 1 | `subscribeIncidencias` | `incidencias` | `propietarioId` + `profesionalAsignadoId`, `conCarteras` | pid propio | unión pid de carteras ∪ asignadas | asignadas por `profesionalAsignadoId` | colección completa | Acotada + test |
| 2 | `subscribePolizas` / `subscribePolizasSeguras` | `polizas_seguros` | `propietarioId`, `conCarteras` | pid propio | unión carteras | vacío | completa | Acotada + test |
| 3 | `subscribeSiniestros` | `siniestros` | `propietarioId`, `conCarteras` | pid propio | unión carteras | vacío | completa | Acotada + test |
| 4 | `subscribeTareasMantenimiento` | `tareas_mantenimiento` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada (helper delegado) |
| 5 | `subscribeGarantiasReparacion` | `garantias_reparacion` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada |
| 6 | `subscribeTrabajosProfesionales` | `trabajos_profesionales` | `profesionalId` si PROFESIONAL, si no `propietarioId` | pid propio | pid (rol PROP) / `profesionalId` (rol PROF) | `profesionalId` | completa | Acotada + test |
| 7 | `subscribePresupuestosProfesionales` | `presupuestos_profesionales` | idem #6 | pid propio | idem #6 | `profesionalId` | completa | Acotada + test |
| 8 | `subscribeValoracionesProfesionales` | `valoraciones_profesionales` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada + test |
| 9 | `subscribeGastos` / `subscribeGastosSeguros` | `gastos` | `propietarioId` (unión multicartera) | pid propio ∪ carteras | unión carteras | vacío (sin carteras) | completa | Acotada + test |
| 10 | `subscribeNecesidadesReforma` | `necesidades_reforma` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada + test |
| 11 | `subscribeProyectosReforma` | `proyectos_reforma` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada + test |
| 12 | `subscribeSuministros` | `suministros` | `inmuebleId` | inmuebles propios | inmuebles del scope | inmuebles del scope | completa | Acotada + test |
| 13 | `subscribeLecturas` | `lecturas_suministro` | `inmuebleId` | ídem #12 | ídem | ídem | completa | Acotada |
| 14 | `subscribeCambiosTitular` | `cambios_titular` | `inmuebleId` | ídem #12 | ídem | ídem | completa | Acotada |
| 15 | `subscribeMensajesPortal` | `mensajes_portal` | `contratoId` | contratos propios | contratos del scope | contratos del scope | completa | Acotada + test |
| 16 | `subscribeContratos` | `contratos_formalizacion` | `propietarioId` + `inmuebleId` | pid/inmuebles | unión carteras | vacío (INQUILINO: por id) | completa | Acotada |
| 17 | `subscribeExpedientesRecomercializacion` | `expedientes_recomercializacion` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada |
| 18 | `subscribePropuestasInmobiliaria` | `propuestas_inmobiliaria` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada |
| 19 | `subscribeLeadsInmobiliarios` | `leads_inmobiliario` | `propietarioId` | pid propio | pid propio | vacío | completa | Acotada |
| 20 | `subscribeInmuebles` | `inmuebles` | pid ∪ autorizados ∪ cartera | pid ∪ autorizados | unión cartera | propios/autorizados | completa (staff) | Acotada (ya correcta, sin cambios) |
| 21 | `subscribePropietarios` | `propietarios` | `doc(id)` por pid ∪ delegados | sólo el suyo (+delegados) | — | vacío | completa | Acotada (ya correcta, sin cambios) |
| 22 | `subscribeHabitacionesInmueble` | `habitaciones` | `where('inmuebleId','==',id)` | por inmueble | por inmueble | por inmueble | por inmueble | **Ya correcta — no se modifica** (documentada como patrón) |

Notas de inventario:

- `subscriptionAuditLogs` (`audit_logs`, sólo master) se suscribe **después** del gate
  `esUsuarioMaster(currentUser)`: no requiere parámetro de ámbito y así queda documentado y
  probado (`las tres colecciones sin parámetro de ámbito están justificadas`).
- **ActasSection** ya usaba el patrón correcto (scope en sus dos suscripciones): no se toca;
  su lectura se usó como referencia.
- Las ramas de cartera **no se piden** en `trabajos_profesionales`/`presupuestos_profesionales`
  porque las reglas sólo conceden `list` al profesional por `profesionalId`
  (`firestore.rules:1519-1521`, `1543-1545`): límite documentado, no defecto.
- Ampliación verificada con `npm run auditoria:reglas:matriz` (matriz perfil × colección
  contra el texto real de las reglas).

---

## D. A-04 · guardia técnica y protocolo manual

`npm run auditoria:repositorio` → `scripts/guardia-a04-repositorio.mts`. **Solo lectura**
(no escribe refs, índice ni ficheros). Comprueba: repositorio/raíz correcta, rama actual,
HEAD desacoplado, `HEAD == main` (síntoma del incidente), rama ausente, punta de rama ≠ HEAD,
`main` movido, árbol con >150 entradas de status, ficheros borrados, índice con cambios no
confirmados, `origin/<rama>` ausente o divergente, `origin/main` divergente y objetos
ausentes en el grafo de HEAD (`rev-list --objects --missing=print`).

Salida: una línea final `A-04: OK` (código 0) / `WARNING` (1) / `BLOCKED` (2). No recupera
nada automáticamente: si detecta anomalía, imprime el protocolo manual:

1. No usar `reset --hard`, `clean`, borrados ni `checkout` destructivo.
2. `git fetch origin <sha-esperado>` (solo objetos).
3. Verificar blobs: `git ls-tree -r <sha>` + `git hash-object` de cada fichero.
4. `git update-ref refs/heads/<rama> <sha>`; `refs/remotes/origin/<rama>`; `refs/heads/main`; `refs/remotes/origin/main`.
5. `git reset -q HEAD` (sincroniza índice; no toca el árbol).
6. Re-ejecutar la guardia hasta `A-04: OK`.

**Límites de entorno documentados:** la guardia sólo ve el clon local; no puede detectar
objetos perdidos en el remoto ni forzar la sincronización del snapshot de la plataforma
(la causa raíz del síntoma es externa al repositorio). INFRA-01 sigue impidiendo la
verificación con emulador.

---

## E. A-05 · clasificación de los 28 `.mjs`

| Tipo | Ficheros | Tratamiento |
|---|---|---|
| **A — test real (21)** | `operaciones/tests/*.test.mjs` (16: business-versions, canonical-identity, canonical-source, contexto-permisos, document-provenance, domain, emulator-safety, firebase-adapter, integration-boundaries, isolation, persistence, queries-security, rules-architecture, rules-harness, ui, validation) + `patrimonial/tests/*.test.mjs` (5: completeness, components, domain, import-preview, isolation) | Integrados en el mecanismo oficial: `npm run test:operaciones`, `npm run test:patrimonial` (y `test:integracion`). Un fallo real rompe el proceso (exit ≠ 0). Sin duplicar: no se re-empaquetan en vitest (usan `node:test` y están excluidos en `vite.config.ts`) |
| **A-infraestructura (1)** | `operaciones/tests/emulator/operaciones.emulator.mjs` | Es un test real pero **exige** emulador (Auth+Firestore) y falla —no omite— si falta infraestructura: `npm run test:emulador:operaciones` documentado; bloqueado por INFRA-01. No se integra en `test:integracion` para no convertir una limitación de entorno en un fallo de proceso |
| **B — auxiliar (4)** | `operaciones/tests/support.mjs`, `operaciones/tests/memory-transport.mjs`, `patrimonial/tests/revision-support.mjs`, `patrimonial/tests/tsx-loader.mjs` | No son tests: se importan desde las suites. No se convierten artificialmente en tests |
| **C — herramienta/manual (2)** | `operaciones/demo/recorrido.mjs` (recorrido ficticio ejecutable, importado por `isolation.test.mjs`), `patrimonial/demo/vite.config.mjs` (config de la demo, importada por `isolation.test.mjs`) | Documentados; se ejecutan vía la demo o desde las suites que los importan |

Comandos documentados en `package.json` (`test:operaciones`, `test:patrimonial`,
`test:integracion`, `test:emulador:operaciones`) y reproducibles con
`node --import tsx --test "src/features/<módulo>/tests/*.test.mjs"`.

---

## F. Cambios de código de este bloque

**Producción (18 ficheros):**

| Fichero | Cambio |
|---|---|
| `src/lib/firebase.ts` | Helper único de ámbito (`CampoAmbito`, `subscribeUnionDeFuentes`, `subscribeUnionPorCampo`, `subscribeColeccionPorAmbito`, `scopeDeUsuario`, `claveScope`); `DataAccessScope` + `profesionalId`/`contratoIds`; `subscribeColeccionPropietario` delega; `subscribePolizas`, `subscribeSiniestros`, `subscribeIncidencias` (rama profesional asignada), `subscribeTrabajosProfesionales`, `subscribePresupuestosProfesionales`, `subscribeGastos`, `subscribeContratos` acotadas |
| `src/lib/suministrosFirestore.ts` | `subscribeCol` global eliminado; 4 suscripciones acotadas por `inmuebleId`/`contratoId` |
| `src/App.tsx` | `subscribeTrabajosProfesionales` de tesorería con `dataScope` |
| `src/components/sections/{Incidencias,Operaciones,Suministros,DashboardEjecutivo,Fiscalidad,PolizasSeguros,ProfesionalPortal,Inquilinos,Profesionales}Section.tsx` | Scope + `claveScope` en dependencias (en Dashboard y Fiscalidad el ámbito se memoiza y entra como dependencia: al cambiar titular/cartera se re-suscribe); Dashboard: `audit_logs` sólo tras `esUsuarioMaster` |
| `src/components/modals/DetalleIncidenciaModal.tsx`, `DetalleTrabajoProfesionalModal.tsx` | Scope en sus suscripciones |
| `src/components/{inmueble/CentroOperativoInmueblePanel,mantenimiento/MantenimientoInmueblePanel,reformas/ReformasInmueblePanel}.tsx` | Scope + deps (filtrado local conservado) |
| `src/components/sections/MorosidadSection.tsx` | A-07: error de lectura visible por el canal de incidencias |

**Pruebas y arneses (5 ficheros):**

| Fichero | Cambio |
|---|---|
| `tests/bloque-12-a01-ambito-suscripciones.test.ts` | **Nuevo**: 41 pruebas de ámbito/aislamiento/cambio de ámbito/desmontaje + guarda estática sobre `src/` |
| `src/test/e/setupE.ts` | Mock del arnés E con `scopeDeUsuario`, `claveScope` y `subscribeColeccionPorAmbito` reactivo y fiel; `subscribeIncidencias` respeta el ámbito |
| `tests/seguridad-firestore-valoraciones.test.ts` | 2 aserciones actualizadas al helper único y al ámbito canónico (mismo objeto de control) |
| `src/accesibilidad/ux7.integracion.ui.test.tsx` | 2 números de línea fijados del inventario de pendientes (mismo inventario, desplazamiento por el código nuevo) |
| `package.json` | Scripts `test:operaciones`, `test:patrimonial`, `test:integracion`, `test:emulador:operaciones`, `auditoria:repositorio`, `auditoria:reglas:matriz` |

**Herramientas (2 ficheros nuevos):** `scripts/guardia-a04-repositorio.mts` (guardia
read-only) y `scripts/diagnostico-b12-list.mts` (matriz perfil × colección contra las reglas;
se conserva como herramienta manual documentada, no como test).

**Sin cambios (por orden expresa):** identidad, roles, permisos, onboarding, invitaciones,
contratos, motores B2–B9, documentos, import-export, migración, IA, ayuda, navegación, UX y
las suscripciones ya correctas (`ActasSection`, `subscribeHabitacionesInmueble`,
`subscribeAuditLogs`, `subscribeInmuebles`, `subscribePropietarios`).

---

## G. Pruebas ejecutadas tras cada reparación

1. `npx tsc --noEmit` tras **cada** edición de código de producción (verificación de tipos
   inmediata; se corrigieron los errores reales detectados: import de `propietariosGestionadosDe`,
   alias provisional eliminado, tipos del arnés E).
2. `vitest run tests/bloque-12-a01-ambito-suscripciones.test.ts` — iterado hasta verde; el
   propio test descubrió **1 defecto real de la reparación** (la rama del profesional no
   estaba cubierta en `subscribeIncidencias`) y **1 defecto de proceso** (mock del arnés E
   desincronizado), ambos corregidos antes de continuar.
3. Suites afectadas por el cambio de superficie del módulo: `seguridad-firestore-valoraciones`,
   `ux7.integracion.ui`, `experiencia.f2/f3/f4.ui`, `experiencia/progreso` — verde.
4. `npm run test:operaciones` y `npm run test:patrimonial` — cifras finales en §H.
5. `vitest run` completo — cifras finales en §H.

---

## H. Regresión final (árbol final, ejecución única)

Ejecución final, árbol final, sin cambios posteriores (ficheros/valores de **esta** ejecución):

| Comando | Resultado |
|---|---|
| `vitest run` | **149 ficheros · 2.797 pruebas PASS · 0 fail · 0 skip** |
| `tests/bloque-12-a01-ambito-suscripciones.test.ts` (nuevo) | 41 PASS (incluidas las 6 de reglas reales, las 8 de aislamiento por perfil, las 3 de cambio de ámbito/desmontaje y la guarda estática sobre `src/`) |
| `npm run test:operaciones` (`node --import tsx --test`) | **302 pruebas · 300 PASS · 2 FAIL** → `#113` y `#120` (allowlist de custodia A-04-B11, preexistentes; `#119` vuelve a pasar al restaurar la base histórica) |
| `npm run test:patrimonial` | **87 pruebas · 85 PASS · 2 FAIL** → `#87` (allowlist A-04-B11, preexistente) y `#85` (nueva señal aditiva por los scripts npm de A-05, ver §B) |
| `npm run test:bloque-b` | 92 PASS · 0 FAIL |
| `npm run test:bloque-c` | 82 PASS · 0 FAIL (vitest interno 79/79) |
| `npm run test:bloque-e` | 64 PASS · 0 FAIL |
| `npm run test:bloque-5` | 186 PASS · 0 FAIL (vitest interno 182/182) |
| `npm run test:bloque-7` | 435 PASS · 0 FAIL (vitest interno 428/428) |
| `npm run test:bloque-8` | 4 ficheros · 211 PASS · 0 FAIL |
| `npm run test:bloque-9` | 12 ficheros · 119 PASS · 0 FAIL |
| `npm run test:emulador:operaciones` | No ejecutable: INFRA-01 (sin `firebase-tools`/`java`) |
| Regresiones UX-1…UX-7 y controles de seguridad B11 | Integrados en `vitest run` (incl. `ux7.integracion.ui`, `experiencia.f2/f3/f4.ui`, `seguridad-*` ×11): 0 fail |
| `tests/features/patrimonial/tests/*.mjs` byte-a-byte (por fichero) | PASS (el fallo es de allowlist global, no de contenido) |

**Ninguna regresión funcional detectada.** Los únicos fallos son de **libro de referencia de
custodia** (allowlists congeladas) y uno de ellos (patrimonial `#85`) es la señal aditiva ya
explicada. No hay fallos de producto, de aislamiento ni de regresión UX.

---

## I. Calidad

| Comprobación | Resultado |
|---|---|
| `npm run lint` (`tsc --noEmit`) | **0 errores** |
| `npm run build` (`vite build` + `esbuild server.ts`) | **OK** (`dist/server.cjs` 170,6 kB + sourcemap) |
| `git diff --check` | **limpio** (sin espacios/errores de formato) |
| `firestore.rules` / `storage.rules` | **sin cambios** (0 líneas): las reglas no se relajan ni se endurecen en este bloque |
| Motores B2–B9, identidad, permisos, documentos, import-export, migración, IA, ayuda, navegación, UX | sin cambios (los diffs se limitan a los ficheros listados en §F) |
| Código muerto/duplicación introducidos | ninguno: los 7 helpers nuevos tienen consumidores (`subscribeUnionDeFuentes` 3, `subscribeUnionPorCampo` 5, `subscribeUnionPorPropietario` 3, `subscribeColeccionPropietario` 11, `subscribeColeccionPorAmbito` 13, `scopeDeUsuario` 27, `claveScope` 22 referencias) |
| Guardia de custodia | `npm run auditoria:repositorio` → **`A-04: OK`** (HEAD = punta de rama = `origin/arena/…`; `main` = esperado; 0 objetos ausentes) |

---

## J. Git

- **Un único commit** de este bloque: `fix(audit): complete post-audit repairs` sobre
  `arena/01a0e939-gestor-de-inmuebles-vercel` (sin commits intermedios, sin merge, sin PR,
  sin rebase, sin tocar `main`).
- Ficheros del commit: los 12 de producción + 5 de pruebas/arnés + 2 herramientas + 2
  documentos de bloque (`BLOQUE-12-…-INSPECCION.md`, `BLOQUE-12-…-CIERRE.md`) + `package.json`.
- Verificación **posterior al push**: `git rev-parse HEAD == git rev-parse @{u}`;
  `main == origin/main == c0c8224…`; `origin/arena/… == HEAD`; `git status` sin cambios
  accidentales. Los valores se reportan en el informe final de 10 puntos.
- `scripts/diagnostico-b12-list.mts` y `scripts/guardia-a04-repositorio.mts` se incorporan al
  repositorio (herramientas reproducibles, documentadas en `package.json`); no son tests.

---

## K. Incidencias restantes

**BLOQUEANTES:** ninguna.

**NO BLOQUEANTES:** A-03 (R-5 Storage), A-04-B11 (allowlists de custodia), A-08 (`catch`
vacíos), A-09 (símbolos sin uso), A-10 (caché `localStorage`), A-11 (R-3/R-4 Storage).

**ARQUITECTÓNICAS:** A-03 y A-04-B11 requieren decisión de producto/dictamen (ampliar
allowlists de custodia o añadir bloques de Storage con sus pruebas de reglas). Ambas
documentadas sin cambios para no debilitar controles ni improvisar arquitectura.

**INFRAESTRUCTURA:** INFRA-01 (emulador no ejecutable: sin `firebase-tools`/`java`) —
incluye la confirmación en Firestore real de las consultas acotadas de A-01 y el despliegue
de `firestore.rules`/`storage.rules`. El harness de reglas del repo (texto real, documento a
documento) cubre la parte verificable sin emulador.
