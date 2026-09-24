# INTEGRACIÓN BLOQUE B → ERP CANÓNICO — INFORME INTERNO DE COMPARACIÓN

Fecha: 2026-09-20 · Orden: integración selectiva del BLOQUE B (Tesorería/Liquidaciones/SEPA).
Rama B: `arena/01a0bfd3-gestor-de-inmuebles-vercel` @ `87aed9a` (único commit sobre `4d420bd`).
Rama A (integración): `arena/01a0bfbe-gestor-de-inmuebles-vercel` @ `385be31` (canónica `91da820` + continuidad).

> **Verificación clave:** B trabajó desde `main` (`4d420bd`), que NO contiene la canónica
> (`91da820`), GAP 1–8 ni los documentos canónicos (documentado por B en su propia
> `docs/BLOQUE-B-FASE0-VERIFICACION.md`). Por tanto **no se hace merge** de la rama B:
> se reimplementa/integra selectivamente sobre la base canónica, preservando el 100 %
> de la funcionalidad canónica.

## 1. Código nuevo de B que se integra

| Fichero (B) | Líneas | Tratamiento |
|---|---|---|
| `src/tesoreria/tipos.ts` | 278 | **Tal cual** — dominio autocontenido (`LiquidacionPropietario`, `GastoInmueble`, `OrdenPago`, `FicheroSEPA`, `MandatoSEPA`, `MovimientoTesoreria`, eventos) |
| `src/tesoreria/sepaUtils.ts` | 188 | **Tal cual** — puro: IBAN mod-97 (ISO 13616), BIC (ISO 9362), Creditor ID (EPC262-08/ISO 7064), charset EPC217-08, hash FNV-1a, MsgId/EndToEndId deterministas |
| `src/tesoreria/liquidacionEngine.ts` | 591 | **Tal cual** — motor determinista; cumple los principios obligatorios de la orden (solo cobrado liquida; pendiente informativo; céntimos; descuadre>0,01 bloquea; honorarios/IVA/gastos/retención con fuente; idempotencia `liq_{prop}_{YYYY-MM}`+hash; BORRADOR→APROBADA→PAGADA→ANULADA/REVERSADA; trazabilidad). Importa `CobroPeriodo`/`ContratoFormalizacion`/`Propietario` del canónico (compatibles, verificado campo a campo) |
| `src/tesoreria/sepaPain008.ts` | 245 | **Tal cual** — CORE/B2B, MndtId, Creditor ID, secuencia, EndToEndId por cobro origen, NbOfTxs/CtrlSum, idempotencia por hash, validación estructural. Sin ejecución bancaria |
| `src/tesoreria/sepaPain001.ts` | 246 | **Tal cual** — SCT, origen trazable obligatorio (rechaza importe libre), solo órdenes APROBADA, `crearOrdenPagoLiquidacion` idempotente `op_liq_{id}`. Sin envío bancario |
| `src/tesoreria/gastosEngine.ts` | 152 | **Adaptado** — (a) `trabajo.facturaNumero` no existe en el `TrabajoProfesional` canónico → acceso opcional por cast; (b) guard en `gastoDesdeTrabajo`: si el trabajo ya tiene `gastoId` (puente canónico trabajo→`Gasto` oficial) se rechaza y se remite al importador canónico (evita doble puente); (c) nuevo `gastoDesdeGastoCanonico(Gasto)` → `GastoInmueble` idempotente `gas_gasto_{id}` (importación unidireccional del modelo oficial) |
| `src/tesoreria/conciliacionAdapter.ts` | 256 | **Adaptado (extendido)** — B lo escribió asumiendo que GAP6 no existía (solo lectura sobre cobros + interfaz `sugerirConciliacion` documentada para camt futuro). Se conserva íntegro y se **añade el conector GAP6**: `evidenciaPagoDesdeMovimientoBancario()` y `movimientosBancariosParaLiquidacion()` sobre `MovimientoBancario` canónico (`src/types/conciliacion.ts`) → completa la cadena propietario→liquidación→orden→PAIN.001→**evidencia (movimiento conciliado GAP6)**→conciliación, sin modificar GAP6 |
| `src/tesoreria/notificaciones.ts` | 151 | **Adaptado (extendido)** — B lo escribió asumiendo que GAP1 no existía (factory de eventos + `audit_logs`). Se conserva (auditoría) y se **añade el puente GAP1** (FASE 4): `crearEventoNotificacionTesoreria()` — fábrica pura de `EventoNotificacion` canónico con origen `TESORERIA`, `idempotenciaDeEvento()` y destinatario por propietario (precedente: `notificacionesB2B.ts` de GAP8) + 7 plantillas `tesoreria.*` en el registro canónico `src/notificaciones/plantillas.ts` |
| `src/tesoreria/liquidacionPdf.ts` | 102 | **Tal cual** — patrón `window.print` (mismo patrón que el PDF de contrato del canónico); `generarTextoLiquidacion` incluye clave idempotencia y hash |
| `src/lib/tesoreriaFirestore.ts` | 145 | **Tal cual** — 6 colecciones aditivas (`liquidaciones_propietarios`, `gastos_inmuebles`, `ordenes_pago`, `ficheros_sepa`, `mandatos_sepa`, `config_liquidacion`); reutiliza `db` y `sanitizeObjectForFirestore` canónicos (verificado que existen) |
| `src/components/sections/TesoreriaSection.tsx` | 910 | **Adaptado** — 5 tabs (Liquidaciones/Gastos/SEPA 008/SEPA 001/Movimientos) tal cual B + (a) props opcionales `movimientosBancarios` (GAP6) y `gastosCanonicos`; (b) en el pago de liquidación, selector de **evidencia desde movimiento bancario conciliado (GAP6)** que rellena referencia/fecha; (c) importación de gastos del modelo oficial `gastos` |
| `scripts/test-bloque-b.ts` | 395 | **Tal cual + ampliación** — 79 pruebas de B + bloque de pruebas nuevas del conector GAP6, el puente GAP1 y el importador de gastos canónicos (mismo estilo de asserts) |
| `docs/BLOQUE-B-FASE0-VERIFICACION.md` | 55 | **Conservado** (archivo del bloque B) |
| `docs/BLOQUE-B-IMPLEMENTACION.md` | 61 | **Conservado** |
| `docs/BLOQUE-B-NORMATIVA-Y-AUDITORIA.md` | 105 | **Conservado** (decisiones fiscales parametrizadas y fuentes) |

## 2. Código equivalente ya existente en A (NO se duplica)

| Tema en B | Equivalente canónico | Decisión |
|---|---|---|
| `publicarEventoTesoreria` (eventos → audit) | GAP1: `src/notificaciones/` (dispatcher, plantillas, `idempotenciaDeEvento`) | B pasa a ser **fábrica de eventos** + plantillas en el registro GAP1 (patrón GAP8). No se crea segundo dispatcher. El envío real sigue `DEPENDENCIA_EXTERNA` (sin repositorio Firestore del dispatcher, igual que el resto de GAP1) |
| `conciliacionAdapter` (asume "no existe GAP6") | GAP6 completo: `src/utils/conciliacion/*`, `movimientos_bancarios`, matching, idempotencia (23 tests) | El adaptador de B se conserva como **proyección de lectura** (cobro→liquidación, movimientos de tesorería) y se añade el **conector** de evidencia sobre `MovimientoBancario`. No hay segunda conciliación |
| `GastoInmueble`/`gastos_inmuebles` (gastos propios) | `gastos` + `gastosEngine.ts` canónico (modelo oficial de P&L del inmueble) | `gastos_inmuebles` se documenta como **proyección de liquidación** (imputableA/pagadoPor/liquidacionId: conceptos que no existen en `Gasto`), con importación unidireccional desde `gastos` canónicos. El motor oficial de gastos no se toca |
| `liquidacionPdf` (window.print) | `pdfExportEngine.ts` (jsPDF) existe, pero el canónico también usa `window.print` para contratos | Se conserva el patrón de B (coherente con el canónico); sin nuevo motor de PDF |
| Suscripción de trabajos (base main) | `subscribeTrabajosProfesionales` (firebase.ts:2443) | Se reutiliza la suscripción canónica en App para el prop `trabajos` |

## 3. Código incompatible (no se copia)

| Tema | Motivo | Resolución |
|---|---|---|
| Bloques 22–27 de `firestore.rules` de B | **Choque de numeración** con la canónica (§22 = NOTIFICACIONES GAP1, §23 = FINANCIACIÓN GAP4, §24 = CONCILIACIÓN GAP6, §25 = FACTURACIÓN GAP7) y **aislamiento más débil** que el estándar canónico: `list`/`read` abiertos a cualquier autenticado (fuga cruzada de propietarios), sin invariante de `propietarioId` en create/update, sin `sinSecretos()` | Se **reescriben** los 6 bloques en estilo canónico con numeración 26–31: aislamiento por `myPropId()` (patrón `notifDelUsuario`), inmutables (propietarioId, id, historial append-only), sin borrado ordinario, `sinSecretos()`, ordenes/ficheros/mandatos solo master-admin (contienen IBAN) |
| `package.json` `test:all` de B | Referencia `scripts/test-candidate-circuit.ts` (línea main, inexistente en la canónica) | Se descarta; solo se añade `test:bloque-b` |
| `docs/MAPA-MAESTRO-ERP-ACTUAL.md` de B (42 l.) | Sustituiría el MAPA MAESTRO canónico (prohibido por la orden) | Se descarta; se actualiza el canónico (FASE 8) |

## 4. Código que requiere adaptación a la base canónica (ficheros compartidos)

| Fichero | Adaptación |
|---|---|
| `src/types.ts` | `SectionType += 'tesoreria'`; `PermisoDefinicion.categoria += 'tesoreria'`; 4 permisos `tesoreria.*` en `PERMISOS_SISTEMA`; `ModulosConfig.tesoreria` + default (aditivo) |
| `src/types/notificaciones.ts` | `OrigenNotificacion += 'TESORERIA'` (aditivo; necesario para el puente GAP1) |
| `src/notificaciones/plantillas.ts` | +7 plantillas `tesoreria.*` (aditivo, fin del registro) |
| `src/App.tsx` | Imports; estados tesorería (+`trabajosProfesionales` vía suscripción canónica); `scopedLiquidaciones` (aislamiento por `propietarioId`); efecto auth: `configurarAuditWriter(registrarAuditoriaFirestore)` + 5 suscripciones + suscripción trabajos; 6 handlers + `handleSaveContratosBatch`; `'tesoreria'` en `allowedSections` de PROPIETARIO; render `TesoreriaSection` (admin) / portal con subtab (propietario) en `activeSection==='tesoreria'`; prop `liquidaciones` en los 2 renders existentes de `PropietarioPortalSection` |
| `src/components/Sidebar.tsx` / `MobileNav.tsx` | +1 ítem admin («Tesorería & SEPA») y +1 ítem propietario («Mis Liquidaciones»), anclados tras «cobros» |
| `src/components/sections/PropietarioPortalSection.tsx` | Prop `liquidaciones` + subtab «Mis Liquidaciones» (lista, detalle de líneas, PDF) — aislamiento por `propietarioId` + exclusiones ANULADA/REVERSADA |
| `firestore.rules` | Bloques 26–31 nuevos (estilo canónico) |
| `package.json` | +`test:bloque-b` |

## 5. Documentación conservada / no conservada

- **Conservada:** los 3 informes de B (FASE0/IMPLEMENTACIÓN/NORMATIVA) — archivo del bloque.
- **No conservada:** el MAPA MAESTRO de B (sustituiría al canónico).
- **Nota:** el dato de B «npm test → 16/22 (6 fallos preexistentes)» se refiere al
  `test-candidate-circuit` de la línea `main` (circuito de candidatos). En la base
  canónica **no existe** ese circuito ni ese script; los 6 fallos citados por B no son
  aplicables a la canónica y no se «importan» como deuda.

## 6. Riesgos y verificaciones pendientes

1. Fijas de tests de B contra tipos canónicos (`mkPropietario`/`mkCobro`/`mkContrato`):
   verificado que todos los campos existen en los tipos canónicos (el contrato usa cast).
2. Reglas reescritas: validar sintaxis (no hay `firebase` CLI en sandbox; se revisa a
   mano contra el estilo de los bloques 22–26 existentes).
3. No regresión GAP1–8: suite completa 330/330 + tsc + build tras la integración.
