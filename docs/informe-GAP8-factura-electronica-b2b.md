# INFORME GAP 8 — Factura Electrónica Obligatoria B2B (RD 238/2026)

Fecha: 2026-09-20 · Rama: `arena/01a0ab97-gestor-de-inmuebles-vercel` · Cuenta: harqiba@gmail.com

## 1. Marco normativo aplicado (documentado en código)

- **RD 238/2026, de 25 de marzo** (BOE-A-2026-7295): requisitos técnicos de la factura
  electrónica B2B, plataformas de intercambio y obligaciones de información de estados.
- Desarrolla el art. 2 bis de la Ley 56/2007 (añadido por Ley 18/2022 «Crea y Crece»).
- Sintaxis admitidas **EN 16931**: CII (UN/CEFACT), UBL 2.1, Facturae 3.2.x, EDIFACT.
- Plataformas: solución pública (SPFE, AEAT, vía FACeB2B) y plataformas privadas
  certificadas e interoperables. La copia fiel a la SPFE se remite en UBL.
- **Separación de regímenes documentada** en `src/types/facturaElectronicaB2B.ts`:
  factura ordinaria/PDF, B2B (este bloque), RRSIF, VERI*FACTU, NO VERI*FACTU y B2G/FACe.

## 2. Separación real de bloques (FASES 1-2)

| Bloque | Situación |
|---|---|
| Factura ordinaria / PDF (GAP 7) | Intacta; GAP 8 la consume sin modificarla |
| RRSIF (GAP 7) | Intacto; no se toca |
| VERI*FACTU (GAP 7) | Intacto; máquina de estados B2B es independiente |
| Conciliación bancaria (GAP 6) | Intacta; solo se consulta el cobro conciliado |
| B2G / FACe | FUERA DE ALCANCE explícito |
| **Factura electrónica B2B (GAP 8)** | Modelo, motor, formatos, estados y reglas propios |

## 3. Modelo `FacturaElectronicaB2B` (FASE 3)

- `src/types/facturaElectronicaB2B.ts`: representación/intercambio separada de `Factura`.
- Los importes se **copian** de la factura GAP 7 validada; nunca se recalculan.
- ID determinista `feb_sha256(facturaId|formato|version)`; `idempotencyKey` estable.

## 4. Generación de formatos oficiales (FASE 4)

- **CII** (`generadores/ciiB2BGenerator.ts`): CrossIndustryInvoice EN 16931 con
  espacios de nombres oficiales UN/CEFACT; determinista byte a byte.
- **UBL 2.1** (`generadores/ublB2BGenerator.ts`): Invoice OASIS EN 16931.
- **Facturae 3.2.2** (`generadores/facturaeB2BGenerator.ts`): sintaxis oficial española.
- **EDIFACT**: PENDIENTE-ESPECIFICACIÓN (no se genera contenido inventado).
- Sin XSD inventados; escape XML determinista; agrupación de impuestos por tipo de IVA.

## 5. Validador (FASE 5)

- `validarFacturaParaB2B` / `validarParaIntercambioB2B`: emisor/receptor incompletos,
  NIF mal formados, numeración, fechas (incl. vencimiento < expedición), coherencia de
  bases/IVA/retenciones/total, duplicidad de representación.
- **BLOQUEANTE impide generación/envío**; ADVERTENCIA no bloquea (efectivo >1.000 €,
  direcciones ausentes…).

## 6. Máquina de estados B2B (FASE 6)

- `TRANSICIONES_B2B`: BORRADOR→GENERADA→VALIDADA→DISPUESTA_PARA_ENVIO→ENVIADA→
  RECIBIDA→ACEPTADA/RECHAZADA→PAGADA/PARCIALMENTE_PAGADA y terminales ANULADA/RECTIFICADA.
- Toda transición genera evento trazado en `historial` (append-only).
- `modificacionSilenciosaProhibida`: una factura enviada solo avanza a recepción, pago,
  anulación o rectificación. Separada por completo de la máquina VERI*FACTU.

## 7. Arquitectura de intercambio desacoplada (FASES 7-8)

- `intercambioB2B/adaptadoresB2B.ts`: interfaz `AdaptadorIntercambioB2B` + registro.
  - **AdaptadorPreparacionB2B** (modo PREPARACION, `simulado: true`): prepara sin
    transmitir; nunca se presenta como envío real.
  - **AdaptadorSpfeB2B** (SPFE AEAT/FACeB2B): PENDIENTE NORMATIVO/TÉCNICO; `enviar()`
    devuelve PENDIENTE explícito (nunca falso envío).
  - **AdaptadorPlataformaPrivadaPendiente**: PENDIENTE SERVICIO; sin proveedor inventado.
- Ningún endpoint, API key, certificado ni credencial en el código o Firestore.

## 8. Información de pago (FASE 9)

- `informacionPagoDesdeCobros`: refleja SOLO el estado económico existente
  (cobroPeriodoId/movimientoBancario de conciliación GAP 6). Sin segundo sistema de cobros.

## 9. Idempotencia e historial (FASE 10)

- `idempotencyKey` estable por factura+formato: regenerar no duplica.
- Eventos de historial con ID determinista: el replay no duplica entradas.
- Reintento (`reintentarEnvioB2B`) conserva la misma clave y solo traza.

## 10. Firestore (FASE 11)

- Colección propia `facturas_electronicas_b2b` (`src/lib/firebase.ts`).
- `firestore.rules`: bloque nuevo deny-by-default con propietario inmutable, id inmutable,
  `facturaId`/`idempotencyKey` inmutables, representación económica inmovilizada tras el
  intercambio, historial append-only y rechazo de secretos (certificados/credenciales).
- No se han tocado los bloques existentes (facturas/registros/envios/series).

## 11. Notificaciones (FASE 12)

- 8 plantillas `facturacion.b2b_*` en el registro GAP 1 (`notificaciones/plantillas.ts`):
  preparada, enviada, recibida, aceptada, rechazada, error, pago, incidencia.
- Fábrica pura `crearEventoNotificacionB2B` (origen `FACTURACION`, idempotencia estable).
  No se crea un segundo dispatcher.

## 12. UI (FASE 13)

- `FacturaElectronicaB2BPanel.tsx` integrado en el detalle de factura existente:
  validar, generar (CII/UBL/Facturae), descargar documento, preparar envío, registrar
  avances notificados por plataforma, historial completo, errores, pago y reintentar.
- Banner permanente cuando procede: «No enviada — PENDIENTE plataforma habilitada».

## 13. B2G/FACe (FASE 14)

Fuera de alcance. El generador Facturae existe SOLO como sintaxis B2B admitida; no hay
envío ni integración FACe.

## 14. Pruebas (FASE 16)

- `tests/facturaElectronicaB2B.test.ts`: **40/40** pruebas nuevas (identidad determinista,
  validación bloqueante/advertencia, máquina de estados, formatos, escape XML, EDIFACT
  pendiente, adaptadores sin envío fingido, orquestador, pago vía GAP 6, notificaciones).
- Regresión global: **330/330** (290 previas + 40 nuevas), 16 ficheros, 0 fallos.
- `npx tsc --noEmit`: **0 errores**. `npm run build`: OK (~10 s).

## 15. Clasificación de capacidades (FASE 18)

| Capacidad | Estado |
|---|---|
| Modelo B2B separado y determinista | IMPLEMENTADO |
| Validador bloqueante/advertencia | IMPLEMENTADO |
| Generación CII / UBL 2.1 / Facturae 3.2.2 | IMPLEMENTADO |
| Máquina de estados + historial + idempotencia | IMPLEMENTADO |
| Panel UI completo | IMPLEMENTADO |
| Reglas Firestore aislamiento B2B | IMPLEMENTADO |
| Notificaciones GAP 1 (8 plantillas) | IMPLEMENTADO |
| EDIFACT | PENDIENTE-ESPECIFICACIÓN (adaptador previsto, sin esquema) |
| Envío efectivo a SPFE (AEAT/FACeB2B) | PENDIENTE NORMATIVO/TÉCNICO |
| Envío efectivo vía plataforma privada | PENDIENTE SERVICIO (requiere proveedor real) |
| Calendario de obligatoriedad | PENDIENTE de orden ministerial (no codificado) |
| B2G / FACe | FUERA DE ALCANCE |

**Distinción clave: GENERACIÓN = implementada y verificada; ENVÍO REAL = pendiente de
plataformas/especificaciones oficiales. Nada se simula como producción.**

## 16. Cambios en archivos existentes (documentados)

- `firestore.rules`: añadido bloque `facturas_electronicas_b2b` (aditivo).
- `src/lib/firebase.ts`: añadida suscripción + guardado B2B (aditivo).
- `src/notificaciones/plantillas.ts`: añadidas 8 plantillas (aditivo).
- `src/components/sections/FacturacionSection.tsx`: integración del panel en el detalle
  (import + prop `currentUser` + render del panel). Ninguna lógica GAP 7 alterada.
- NO se ha modificado ningún motor de GAP 1-7.

## 17. Confirmaciones

- NO se ha integrado nada en Arena A (rama `arena/01a0a413-…` intacta en `8d72c01`).
- Sin merges históricos; commit exclusivo GAP 8 sobre la rama de sesión reanclada al
  consolidado `8d72c01`.
- Sin APIs, endpoints, certificados, credenciales ni esquemas inventados.
