# P3 Reparación Controlada — Alcance y Decisiones 2026-10-18

**Referencia:** main `c7b86380aced4e000a45e50ff23b5393ebeaa49f`, PR #45 MERGED, HEAD de trabajo `ed33382a8b4fef62c9fe7f53c024e03bfe349abf` sobre rama `arena/8bcf394a-gestor-de-inmuebles-vercel`.

## Discrepancia E-06/E-07

- Inventario canónico `docs/anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md` define:
  - **E-06**: Ficheros SEPA pain.001/pain.008 (generación, SD entrega bancaria)
  - **E-07**: Importación bancaria CSV, OFX, MT940, Norma43 + reglas conciliación
  - **E-08**: Persistencia movimientos/propuestas/importaciones
- Orden de trabajo define E-06 como barrera contra PSD2/importación.

**Resolución adoptada (conservadora, Fase 0):**

- **E-06 del inventario (SEPA) se conserva intacta.** No se elimina ni modifica generación pain.001/pain.008 salvo retirar el puente legacy que publicaba movimientos bancarios como evidencia opcional. La evidencia SEPA sigue siendo manual y no depende de conciliación.
- **E-07 (importación manual) se mantiene deshabilitada en UI y en persistencia hasta autorización formal y validación E2E.** Parsers CSV/OFX/MT940/Norma43 se conservan en `src/utils/conciliacion/` para reutilización futura, pero ningún punto de entrada cliente puede leer ficheros ni persistir movimientos/importaciones.
- **Norma43 sigue fail-closed** con error `NORMA43_FORMATO_PENDIENTE_VALIDACION`, sin movimientos aceptados.

**Referencia documental:** Esta decisión provisional se documenta aquí y en comentarios de código (`src/lib/conciliacionFirestore.ts: IMPORTACION_BANCARIA_AUTORIZADA = false`, `firestore.rules` con `allow create, update: if false;` para movimientos/importaciones). Rehabilitación futura requiere decisión expresa, pruebas E2E y reglas que impongan hash SHA-256, cuentaRef, divisa única y `idsMovimientosNuevos`.

## Importación bloqueada — implementación

- `ConciliacionBancariaSection.tsx`:
  - Input file deshabilitado (`disabled`, `aria-disabled`, `cursor-not-allowed`).
  - `handleFileUpload` no lee `file.text()`, no llama a parsers, no persiste; solo marca `importacionBloqueada`.
  - Se eliminó `registrarMovimientosSesion`/`registrarPropuestasSesion` y creación de propuestas desde UI.
  - Se eliminaron handlers legacy `confirmarPropuesta`, `aplicarConciliacion`, `rechazarPropuesta`, `marcarNoConciliable`.
- `conciliacionFirestore.ts`:
  - `IMPORTACION_BANCARIA_AUTORIZADA = false`.
  - `guardarImportacionConciliacion` lanza `IMPORTACION_BANCARIA_DESHABILITADA_POR_ALCANCE` si se invoca.
  - `actualizarPropuestaConciliacion` conservado por compatibilidad pero reglas lo deniegan para transiciones directas.
- `firestore.rules`:
  - `movimientos_bancarios` y `importaciones_bancarias`: `allow create, update: if false;` (solo master puede borrar).
  - `conciliaciones_bancarias`: `allow create: if false;` y `allow update` solo si existe evento append-only con `eventoPostDecision()` y `transicionConciliacionPermitida()`, con `actorEnAmbito`, `sinSecretosBancarios`, `historial` append-only y `candidato` validado por propietario/inmueble/tipo.
- `importEngine.ts`:
  - `construirResultado` ahora incluye `idsMovimientosNuevos` para evidencia.
  - Norma43 ya estaba fail-closed; se conserva.

**Protección contra bypass:** cualquier llamada directa a `guardarImportacionConciliacion` falla en cliente; cualquier escritura directa a Firestore falla en reglas; no hay ruta alternativa en `App.tsx` (se eliminó suscripción de sesión y props `movimientosBancarios`/`propuestasConciliacion`).

## Decisión manual P3 — flujo conectado

1. **Propuesta pendiente:** recién creada permanece `PENDIENTE`/`PROPUESTO`/`CONFIRMADO`, nunca `CONCILIADO` automático.
2. **Acción humana explícita:** UI exige motivo 5–500 chars, sin IBAN ni secuencias bancarias, y botón `Conciliar manualmente` / `Rechazar propuesta`.
3. **Validación actor:** `validarActorDecision` exige `authUid`/`uid`, perfil `ADMINISTRADOR`/`PROPIETARIO`, y propietarioId coincidente si es propietario. `registrarDecisionConciliacion` exige `auth.currentUser.uid == actor.authUid`.
4. **Motivo obligatorio:** `validarMotivo` redacta y valida longitud; se conserva en `motivoDecision` e `historial`.
5. **Titular y correspondencia:** `validarCandidatoVisible` en UI comprueba que candidato pertenece a mismo `propietarioId`, tiene `inmuebleId`, y que cobro/gasto existe en colecciones visibles con contrato/inmueble coherentes. Reglas exigen `candidato.propietarioId == propietarioId`, `inmuebleId is string`, y tipo coherente con signo de `importeMovimiento`.
6. **Evidencia verificable:** `decidirConciliacionManual` crea `EventoConciliacionBancaria` con `id = conc_evt_${operacionId}`, `actorUid`, `motivo`, `estadoAnterior`, `estadoNuevo`, `revision`, `candidatoAnteriorId`, `candidatoNuevoId`, `operacionId`.
7. **Protección replay:** `operacionId` debe match `/^[A-Za-z0-9._:-]{1,119}$/`; evento doc ID `propId_eventId`; regla `!exists(eventoDocId)` y `eventSnap.exists()` en transacción lanza `DECISION_REPETIDA`. Mismo `operacionId` produce mismo `idEvento`, idempotente.
8. **Transiciones válidas:** `PROPUESTO|PENDIENTE|CONFIRMADO -> CONCILIADO` (CONCILIAR), `-> RECHAZADO` (RECHAZAR), `CONCILIADO -> REVERSADO` (REVERSAR), `CONCILIADO -> CONCILIADO` con candidato distinto (CORREGIR). Otras denegadas.
9. **UI informa resultado real:** `guardandoDecision` state, `setErrorPersistencia` solo después de fallo, `avisarOperacion` tipo `exito` solo tras `await registrarDecisionConciliacion` que confirma transacción Firestore. No se muestra confirmación antes de commit.

**Legacy retirado:** `confirmarPropuesta`, `aplicarConciliacion`, `rechazarPropuesta`, `marcarNoConciliable` no se usan en UI; se conservan en motor por compatibilidad pero no tienen call-sites.

**No efectos contables automáticos:** `decidirConciliacionManual` no llama a `registrarPagoPeriodo`, no modifica `CobroPeriodo`, `Gasto`, saldos ni crea ingresos. `aplicado: false` se mantiene. Tesorería no publica propuestas.

## Persistencia y reglas — garantías

- **Evento durable:** colección `eventos_conciliacion_bancaria` con doc ID `${propietarioId}_${idEvento}`, append-only (`allow update, delete: if false`).
- **Actor autenticado:** regla exige `incoming().actorUid == request.auth.uid` y `actorEnAmbito(propietarioId)` (master o propietario con `myPropId() == pid`).
- **Motivo obligatorio:** `motivo is string && size >=5 && <=500`.
- **Propietario y ámbito:** todas las colecciones filtran por `propietarioId`; `conciliacionEsMia`, `movimientoEsMio`, `importacionEsMia` usan `myPropId()`.
- **Transiciones autorizadas:** `estadoEventoCoherente()` y `transicionConciliacionPermitida()` validan `estadoAnterior == existing().estado`, `estadoNuevo == incoming().estado`, `revision == existing().revision+1`, `historial.size() == existing+1`, último historial `id == ev.id`, `actorUid == auth.uid`, `motivo == ev.motivo`.
- **Protección replay/manipulación:** `!exists(eventoDocId)` y `eventSnap.exists()` en transacción; `historial` solo crece en 1 y último item debe coincidir con evento; `candidato` solo puede cambiar vía evento.
- **Inmutabilidad eventos:** `allow update, delete: if false`.
- **Evidencia import:** evento requiere `evidenciaImportacionId` y `evidenciaHashFichero` (64 hex), y que `importaciones_bancarias/{propId}_{evidenciaImportacionId}` exista con `hashFichero == evidenciaHashFichero` y `idsMovimientosNuevos.hasAny([movimientoId])`. Además `movimientos_bancarios/{movimientoDocId}` debe existir con `propietarioId`, `idMovimiento`, `idImportacion` coherentes.
- **Atomicidad:** `registrarDecisionConciliacion` usa `runTransaction` que lee propuesta, movimiento (query por `idMovimiento`), importación y evento, valida ámbito, hash, y escribe evento + propuesta en mismo commit. Si falla, no hay cambio local.
- **Cliente vs servidor vs reglas:** cliente valida UX (motivo, candidato visible, operacionId), servidor (transacción) valida existencia, ámbito, hash, replay, y reglas imponen actor, motivo, transición, evidencia y append-only. No se confía solo en cliente.

## Tesorería y aislamiento

- Se eliminó `suscribirMovimientosSesion`, estado `tesoreriaSesionConciliacion` y props `movimientosBancarios`/`propuestasConciliacion` de `App.tsx` y `TesoreriaSection.tsx`.
- `TesoreriaSection.tsx` ya no ofrece selector de evidencia bancaria opcional que usaba `movimientosBancariosParaLiquidacion`; el pago se registra manualmente con referencia bancaria introducida por humano.
- `conciliacionAdapter.ts` conserva `movimientosBancariosParaLiquidacion` con filtro `propietarioId` y estado `CONCILIADO`, pero ya no se llama desde UI.
- `conciliacionSession.ts` queda como módulo legacy no conectado; su comentario se actualizará para indicar deprecación.
- **Verificaciones:** evidencia seleccionable solo si `propietarioId` coincide y estado `CONCILIADO`; pendientes/rechazados no son liquidaciones; propuesta no genera pago/cobro/gasto/saldo; datos de titular no se exponen a otro por props/adaptadores/consultas/persistencia; componentes legacy no eluden controles P3.
- **SEPA conservado:** `sepaPain001.ts`, `sepaPain008.ts`, validación IBAN, generación XML y UI de órdenes/ficheros/mandatos siguen presentes.

## Archivos recuperados selectivamente

- **Recuperados coherentes:**
  - `docs/P2-JUSTIFICANTES-COBRO-VALIDACION-LOCAL.md` (histórico, con nota de reparación)
  - `docs/P3-CONCILIACION-VALIDACION-LOCAL.md` (histórico, con nota)
  - `docs/P4-ACTUALIZACION-RENTA-VALIDACION-LOCAL.md` (histórico, con nota)
  - `scripts/validar-inventario-capacidades.mjs` (script de validación inventario, coherente)
- **No recuperados por incoherencia:**
  - `src/components/sections/TesoreriaSection.scope.test.tsx` — espera SEPA eliminado y nota DESCARTADOS, contradice decisión de conservar SEPA (E-06 inventario).
  - `tests/conciliacion-p3-rules.test.ts` — espera creación de importaciones/movimientos/propuestas y colección `reservas_candidato_conciliacion` inexistente; contradice alcance conservador actual. Se creó `tests/conciliacion-p3-rules-reparacion.test.ts` adaptado a nuevas reglas.

## Validación final — resultados exactos

Comandos ejecutados en esta Arena (con `node_modules` instalado localmente):

1. **TypeScript:** `./node_modules/.bin/tsc --noEmit --skipLibCheck` → **exit 0, sin errores** (tras correcciones de `TipoAvisoOperacion` y `setPagoEvidenciaId` y cast de `QuerySnapshot`).
2. **Tests P3 reparación:** `./node_modules/.bin/vitest run tests/conciliacion-p3-reparacion.test.ts` → **13 passed**.
3. **Tests reglas reparación:** `./node_modules/.bin/vitest run tests/conciliacion-p3-rules-reparacion.test.ts` → **6 passed** (tras fix de harness `lex` para espacios dentro de `$(...)` y soporte `.hasAny` tras lista).
4. **Tests conciliación existentes:** `./node_modules/.bin/vitest run tests/conciliacion*.test.ts` → **6 files, 109 passed** (incluye `conciliacion-p3.test.ts` 90/90, `conciliacion-legacy.test.ts`, `conciliacion-persistencia.test.ts` 27/27 tras adaptación).
5. **Suite completa:** `./node_modules/.bin/vitest run --reporter=dot` → **251 files, 250 passed, 1 failed, 4522 passed, 2 failed, 7 todo**. Los 2 fallos son `guardia-a04-rama-sesion.test.ts` que espera rama limpia y `A-04: OK`; fallan correctamente porque el worktree tiene modificaciones de esta reparación y de main. No se modificó la guarda.
6. **Build producción:** `npm run build` → **exit 0**, 2420 módulos, chunk principal 5.357 MB, warnings de imports mixtos no bloqueantes.
7. **Emuladores Firestore/Storage:** no ejecutados — **no hay Java** en sandbox (`java -version` no encontrado) y `firebase-tools` requiere JRE. Se documenta como validación pendiente. Se usaron harness estáticos `firestoreRulesEval` con fix para interpolaciones complejas y `hasAny` tras lista.

**Diferenciación:**

- **Ejecutados y superados:** 13 + 6 + 109 + 4522 = 4650 tests en total (con solapamiento, suite global incluye los anteriores).
- **Ejecutados y fallidos:** 2 tests de A-04 (guardia de custodia), esperados por estado sucio.
- **No ejecutados:** emuladores oficiales con `firebase-tools@15.33.0 emulators:exec`.
- **Históricos CI:** PR #45 run 39127282423 con 67/67 emulador y 4501/4508 suite (7 sin clasificar) — corresponden a SHA de PR, no a main ni a esta reparación.
- **Pendientes en GitHub Actions:** push a main no tiene ejecuciones recientes (`gh run list --branch main` vacío en auditoría); esta reparación no se ha pusheado a main.

## Riesgos pendientes

- Emulador oficial no ejecutado: falta validar reglas con `firebase emulators:exec` para dos propietarios, admin, profesional, token ausente, lecturas/escrituras cruzadas, replay, CAS, reversión, límites transacción, durabilidad tras reinicio.
- `registrarDecisionConciliacion` usa `query` dentro de `runTransaction` con cast `as any`; funciona en SDK pero TypeScript requiere cast. Revisar si `transaction.get(query)` está soportado en versión usada o migrar a `getDocs` previo + verificación en transacción con `doc` directo por hash.
- `movimientos_bancarios` y `importaciones_bancarias` bloqueados impiden nuevas importaciones, pero también impiden que datos históricos se creen en tests sin inserción directa. Futuro desbloqueo requiere reglas que exijan hash SHA-256, `idsMovimientosNuevos`, `cuentaRef`, divisa única, y validación de `idImportacion`.
- `conciliacionSession.ts` sigue existiendo como módulo legacy; aunque desconectado, podría reintroducirse. Considerar deprecarlo explícitamente o eliminar tras confirmar que ningún consumidor lo usa.
- `TesoreriaSection` aún tiene botones `Pagar` que llaman a `setPagoLiq`; se eliminó `setPagoEvidenciaId` pero queda `pagoRef` y `pagoFecha` manuales. Verificar que no se reintroduzca evidencia automática.
- Documentos P2/P3/P4 históricos recuperados contienen SHAs y métricas antiguas; aunque con nota de reparación, podrían inducir a error si se leen sin contexto.

## Estado Git

- **Rama de trabajo:** `arena/8bcf394a-gestor-de-inmuebles-vercel`
- **HEAD:** `ed33382a8b4fef62c9fe7f53c024e03bfe349abf` (grafted, commit respaldo parche)
- **main remoto:** `c7b86380aced4e000a45e50ff23b5393ebeaa49f` (verificado vía `git ls-remote`)
- **Árbol de trabajo:** modificado (M) con cambios de main + reparaciones P3; no staged, sin commit nuevo en esta fase (se documenta estado antes de commit).
- **No se hizo:** merge a main, push a main, deploy, publicación reglas, migraciones, escrituras/borrados en Firebase real.

## Declaración de integridad

- No se hizo merge a `main`, no se desplegó nada, no se alteraron datos reales de Firebase.
- No se introdujeron credenciales, secretos, datos personales reales ni extractos bancarios auténticos en tests o logs.
- Cambios limitados a conciliación P3, sus reglas, pruebas y documentos directamente relacionados.
- Se respetó custodia de Arena: trabajo en rama `arena/8bcf394a...` sin reset destructivo ni alteración de rama protegida.
