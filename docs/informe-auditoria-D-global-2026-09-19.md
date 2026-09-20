# INFORME — AUDITORÍA GLOBAL DEFINITIVA DE ARENA D (2026-09-19)

Arena: D · Cuenta: larqiba@gmail.com · Modo: incógnito
Repo: `sarqsan/Gestor-de-inmuebles-vercel` · Rama de sesión: `arena/01a0ab97-gestor-de-inmuebles-vercel`

> Alcance: auditoría de solo lectura sobre código. Única escritura legítima:
> este informe (+ informe C previo) commiteados como documentación. Ninguna
> modificación de código, ni de A/B/C, ni merges entre arenas.

---

## A. ESTADO GIT

| Campo | Valor |
|---|---|
| Repositorio remoto | `origin` → https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git |
| Rama | `arena/01a0ab97-gestor-de-inmuebles-vercel` |
| HEAD inicial | `9cb01a43` (base común; el checkout local estaba desincronizado respecto al remoto de la propia rama) |
| HEAD final | `f05ff1ea38a1d63ef9dab266e8e55a295c207f37` |
| HEAD remoto (rama) | `f05ff1ea38a1d63ef9dab266e8e55a295c207f37` |
| Local = remoto | ✅ 0 ahead / 0 behind (tras fast-forward no destructivo; reflog conserva `9cb01a4`) |
| Working tree | Cambios residuales documentados (ver abajo); ningún cambio perdido |
| Commits pendientes de push | Ninguno antes del commit de documentación; tras él: 1 (push verificado) |
| Commits remotos pendientes de incorporar | 0 (el contenido del working tree era byte-idéntico a `f05ff1e` para todo el circuito/inventario — verificado por hash de blob archivo a archivo) |
| Cambios sin commit (deliberados) | Residuales de profesionales + `package.json` (ver §D), `package-lock.json` (artefacto npm), `storage.rules` (variante obsoleta) |

**Conexión Git demostrada:** fetch/ls-remote OK, push del commit de documentación
verificado contra GitHub (sección F), y el estado local quedado alineado con el
remoto sin ningún reset destructivo.

### Composición real de D

El árbol de D = base `9cb01a4` + 4 commits ya empujados (`d060100`, `8378a73`,
`f872447`, `f05ff1e` = ecosistema habitaciones completo con circuito comercial,
aislamiento, economía e inventario) + residuos sin commitear descritos en §D.

---

## B. TABLA DE FUNCIONALIDADES D vs A (A = `origin/main` @ `4d420bd`)

| Funcionalidad | Estado en D | Estado en A | Acción |
|---|---|---|---|
| Circuito comercial habitaciones (candidato→visita→reserva→selección→contrato→cobro) | 🟢 cerrado, 28/28 tests, commiteado en rama sesión | 🔴 no existe (main no tiene `habitacionesEngine` ni `habitaciones_inmueble` en reglas; solo el campo `modalidadAlquiler` en types y un selector en el alta de inmueble) | 🟡 Reimplementar/adaptar sobre A |
| Aislamiento por habitación/unidad + concurrencia (doble clic, doble pestaña) | 🟢 20/20 tests | 🔴 | 🟡 Con lo anterior |
| Economía por habitación (cobros/rentabilidad/histórico por unidad, impagos aislados) | 🟢 24/24 tests | 🔴 | 🟡 Con lo anterior |
| Inventario de inmueble + Ficha Técnica | 🟢 operativo (UI, persistencia, histórico append-only, aislamiento) | 🔴 no existe | 🟡 Reimplementar sobre A con reglas reforzadas |
| Circuito de candidato vivienda completa (preselección→documento→expediente→seguro→decisión) con timeline y suite de 22 escenarios | 🔴 | 🟢 `candidateCircuitEngine` (1.203 líneas) + `CandidateCircuitTimeline` + `scripts/test-candidate-circuit.ts` | Ya existe en A; base para acoplar habitaciones |
| Cierre de trabajos profesionales (partes, fin de obra, adjuntos) | 🟡 parcial/residual en wt | 🟢 `4d420bd` (DetalleTrabajoProfesionalModal +863, ProfesionalPortalSection +606) | A es superior; nada que recuperar de D |
| Incidencias ampliadas (dictamen pericial, adjuntos con `tamano`) | 🟢 base | 🟢 más nuevo (+1.016 líneas DetalleIncidenciaModal; tipo `AdjuntoIncidencia.tamano` añadido) | A es superior |
| Economía patrimonial / comercialización (paneles InmueblesSection +545) | 🔴 (solo toggles fantasma) | 🟢 | A es superior |
| Reglas Firestore/Storage endurecidas | 🟡 (versiones del circuito/inventario; storage.rules wt es variante antigua) | 🟢 más nuevas (main: `isMasterAdmin`, límite 25 MB, etc.) | A manda; portar solo bloques habitaciones/inventario |
| Seguros impago / pólizas / siniestros / flujo Gmail aseguradoras | 🟢 base común | 🟢 base común | Nada |
| Profesionales / presupuestos / valoraciones (catálogo, métricas, portales) | 🟢 base común + residual wt | 🟢 base común + cierre de trabajos | Nada |
| Fiscalidad (resumen fiscal anual por inmueble) | 🟢 (integrado en cobros; dentro del circuito cerrado) | 🟢 vía integración cerrada previa | Nada |
| Notificaciones reales (push/email/colas/cron) | 🔴 no existe (solo checkbox sin backend) | 🔴 | GAP del ERP; nada que recuperar de D |
| Contratos adicionales (temporada/turístico/prórrogas/anexos) | 🔴 | 🔴 | GAP del ERP |
| Informes inversor/PDF/gráficos/cartera | 🔴 (solo `window.print` de contrato LAU) | 🔴 | GAP del ERP |
| Reformas / recomercialización / valoración de inmueble | 🔴 | 🔴 | GAP del ERP |
| Financiación / hipotecas | 🔴 (toggle fantasma `ModulosConfig.hipotecas`) | 🔴 | GAP del ERP |
| Auditoría D/C documentada | 🟢 (este informe + informe C) | — | Commit de documentación |

---

## C. APORTACIONES ÚTILES DE D (lo que A aún no tiene)

### C.1 — Ecosistema de alquiler por habitaciones (prioridad 1)
- **Ubicación en D:** `src/utils/habitacionesEngine.ts` (576 l.),
  `src/components/HabitacionesInmueblePanel.tsx` (350 l.),
  `src/utils/habitacionesCircuitoComercial.test.ts` (28),
  `habitacionesIsolation.test.ts` (20), `habitacionesEconomia.test.ts` (24),
  más toques en `types.ts`, `firebase.ts` (`asignarCandidatoHabitacionFirestore`,
  `bookSlot` con `habitacionId`), `contratoEngine.ts` (`habitacionId` en borrador),
  `cobrosEngine.ts` (helpers por habitación) y `firestore.rules`
  (`habitaciones_inmueble`). Todo commiteado en `f05ff1e`.
- **Qué hace:** modo `habitaciones` del inmueble con unidades, selección/reserva
  atómicas (transacción Firestore), token público por recurso autorizado,
  trazabilidad del circuito, contratos y cobros por unidad, aislamiento de
  impagos entre habitaciones.
- **Dependencias:** `Inmueble`, `Candidato`, `contratos_formalizacion`, cobros.
- **Seguridad:** transacciones + reglas `incoming().inmuebleId == resource.data.inmuebleId`;
  sin secretos.
- **Tests:** 72/72 en verde.
- **Relación MAPA MAESTRO:** modo de explotación del inmueble; complementa (no
  duplica) el `candidateCircuitEngine` de A, que cubre vivienda completa.
- **Integración directa:** ⚠️ no recomendada tal cual — A ha evolucionado
  (`candidateCircuitEngine`, reglas endurecidas, cierre de trabajos).
  **Requiere adaptación selectiva:** portar el modelo de datos + engine +
  panel, reescribiendo los empalmes contra la arquitectura actual de A y sus
  reglas. Conflictos previsibles: `InmueblesSection.tsx` (ambos lo han tocado),
  `types.ts`, `firebase.ts`, `firestore.rules`.

### C.2 — Inventario de inmueble + Ficha Técnica (prioridad 2)
- **Ubicación en D:** `src/utils/inventarioEngine.ts` (118 l.),
  `src/components/FichaTecnicaInventarioPanel.tsx` (672 l.), colecciones
  `inventario_inmuebles` / `inventario_historial` (+ histórico append-only),
  `inventarioIsolation.test.ts`, bloques de reglas Firestore §22 y Storage.
  Commiteado en `f05ff1e` (commit `8378a73`).
- **Qué hace:** inventario físico por inmueble (categorías/estados tipados,
  baja lógica, adjuntos, historial inmutable).
- **Dependencias:** solo `Inmueble` + RBAC + Storage.
- **Seguridad:** lógica cliente correcta (`canAccessInventarioInmueble`,
  `canMutateInventario`); reglas Firestore/Storage basadas solo en `signedIn()`
  → reforzar propiedad del inmueble al portar.
- **Tests:** script de aislamiento (auto-verificación por consola; no es suite vitest).
- **Estado real:** operativo y montado en InmueblesSection.
- **Requiere reimplementación ligera sobre A** (reglas fuertes), no merge.

---

## D. FUNCIONALIDADES OBSOLETAS / NO RECUPERAR

1. **Residuales de profesionales sin commitear** (working tree ≠ `f05ff1e`):
   `calcularTotalesPresupuesto` (IVA) en `profesionalesEngine.ts` + ajustes en 4
   modales (~52 líneas). A tiene ya el cierre de trabajos de `4d420bd`, que es
   más completo. ⚪ Descartar: sustituiría código más nuevo de A por un parche
   antiguo. (Se dejan en el working tree sin tocar, sin commitear.)
2. **`package.json` local** (añade `vitest`/`@types/express` al final del
   fichero): reordenamiento trivial; main ya añade su propia dependencia.
   ⚪ No recuperar.
3. **`storage.rules` sin trackear de D** (variante con `signedIn()` +
   `isMasterAdmin` antiguo): main ya contiene la versión endurecida (límite
   25 MB, funciones renombradas). ⚪ Descartar.
4. **`package-lock.json`** generado por npm durante las pruebas: el repo usa
   `bun.lock`; artefacto, no commiteado.
5. **`inventarioIsolation.test.ts` tal cual:** no es una suite vitest (vitest
   reporta “No test suite found”); si se porta el inventario a A, reescribirlo
   como tests reales.
6. **Toggles fantasma** `gastos/hipotecas/patrimonio` de `ModulosConfig`
   (sin código detrás). ⚪

---

## E. GAPS DEL ERP (pendientes tras comparar D, A y el mapa maestro)

1. **Notificaciones reales** (email transaccional genérico, push, recordatorios
   de cobro/impago, colas/cron). Ningún Arena lo tiene; en D solo existe el
   flujo Gmail específico de aseguradoras y un checkbox muerto.
2. **Contratos adicionales:** temporada, uso distinto de vivienda, turístico,
   anexos, prórrogas/renovaciones automáticas.
3. **Informes avanzados:** PDF real, informes de inversor, ROI/cash-flow de
   cartera, evolución temporal, gráficos, exportaciones.
4. **Financiación/hipotecas** y **economía patrimonial completa** en A (los
   paneles de A existen pero el circuito hipotecario sigue siendo toggle).
5. **Recomercialización** automática tras fin de contrato y **reformas** como
   módulo (hoy solo trabajos profesionales).
6. **Integración del ecosistema de habitaciones de D en A** (orden de
   desarrollo pendiente derivada de C.1).
7. **Inventario en A** (orden pendiente derivada de C.2).

---

## F. RESULTADOS TÉCNICOS (ejecutados sobre D en esta sesión)

| Prueba | Resultado |
|---|---|
| Tests (vitest) | **72/72 pasando** — circuito comercial 28, aislamiento 20, economía 24. 1 fichero (`inventarioIsolation.test.ts`) sin suite vitest: preexistente desde `8378a73`, no introducido por esta auditoría |
| TypeScript (`tsc --noEmit`) | 1 error: `TrabajoProfesionalModal.tsx(150,9) TS2353 'tamano'` — **preexistente en D y sin cambios**; en A (`main`) está corregido (el tipo ya admite `tamano?`) |
| Lint | No existe script de lint independiente; `lint` = `tsc --noEmit` (ver arriba) |
| Build (vite) | ✅ OK (warning conocido de chunk >500 kB) |
| Incidencias | `node_modules` se limpia entre turnos del sandbox (hubo que reinstalar para ejecutar pruebas; sin efecto sobre el código). Estado Git saneado: HEAD local = remoto sin pérdida de cambios |

---

## CIERRE GIT DE ESTA AUDITORÍA

- Sincronización HEAD `9cb01a4 → f05ff1e`: fast-forward no destructivo
  (`update-ref` + `reset` mixto; nada eliminado; contenido byte-idéntico verificado).
- Commit de documentación: `docs(auditoria): informes de auditoría comparativa C y D vs A`
  (este informe + informe C). Push a `origin arena/01a0ab97-gestor-de-inmuebles-vercel`
  y verificación del SHA remoto con `ls-remote`.
- Residuales de profesionales/package.json/storage.rules/package-lock: sin
  commitear, documentados en §D.

## CONCLUSIÓN EXACTA

- **QUÉ TIENE D:** ecosistema de alquiler por habitaciones completo y cerrado
  (circuito comercial + aislamiento + economía, 72/72 tests) e inventario de
  inmueble con ficha técnica, ambos ya protegidos en Git (`f05ff1e`); más
  código base común y residuos menores de profesionales.
- **QUÉ YA TIENE A:** todo el base común + circuito de candidato de vivienda
  completa (`candidateCircuitEngine`), cierre de trabajos profesionales,
  incidencias ampliadas, economía patrimonial y reglas endurecidas.
- **QUÉ LE FALTA A A:** el modo de explotación por habitaciones (engine, panel,
  reglas, tests) y el inventario de inmueble.
- **QUÉ DEBEMOS RECUPERAR:** C.1 y C.2 — mediante **adaptación selectiva /
  reimplementación sobre la arquitectura actual de A**, nunca merge ciego.
- **QUÉ NO DEBEMOS RECUPERAR:** residuales de profesionales, `storage.rules`
  antiguo, `package-lock.json`, toggles fantasma y el script de aislamiento de
  inventario tal cual (§D).
- **QUÉ QUEDA PENDIENTE EN EL ERP:** notificaciones reales, contratos
  adicionales, informes avanzados/PDF, hipotecas, recomercialización/reformas y
  las dos órdenes de integración anteriores (§E).
