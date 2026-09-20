# BLOQUE B — Implementación: Tesorería, Liquidaciones de Propietarios y SEPA

Fecha: 2026-09-20 · Rama: `arena/01a0bfd3-gestor-de-inmuebles-vercel`

## Qué se ha construido (nuevo, aditivo)

| Fichero | Contenido |
|---|---|
| `src/tesoreria/tipos.ts` | Dominio: `LiquidacionPropietario`, `GastoInmueble`, `OrdenPago`, `FicheroSEPA`, `MandatoSEPA`, `MovimientoTesoreria`, eventos |
| `src/tesoreria/liquidacionEngine.ts` | Motor determinista: borrador→aprobar→pagar→anular/reversar, cuadre céntimos, idempotencia `liq_{prop}_{YYYY-MM}` + hash |
| `src/tesoreria/sepaUtils.ts` | IBAN (ISO 13616 mod-97), BIC (ISO 9362), Creditor ID (EPC262-08), charset EPC217-08, hash, MsgId/EndToEndId |
| `src/tesoreria/sepaPain008.ts` | Generador/validador `pain.008.001.02` CORE/B2B con mandatos y trazabilidad cobro→Tx |
| `src/tesoreria/sepaPain001.ts` | Generador/validador `pain.001.001.03` SCT + órdenes con origen obligatorio |
| `src/tesoreria/gastosEngine.ts` | Alta manual con IVA + importador `gas_{trabajoId}` desde trabajos finalizados |
| `src/tesoreria/conciliacionAdapter.ts` | Solo lectura sobre cobros: clasificables, marcas cobro→liquidación, movimientos, `sugerirConciliacion` (interfaz camt futura) |
| `src/tesoreria/notificaciones.ts` | 7 eventos tipados → `audit_logs` (callback inyectable); sin envío real |
| `src/tesoreria/liquidacionPdf.ts` | Impresión/PDF de liquidación (patrón existente `window.print`) |
| `src/lib/tesoreriaFirestore.ts` | Subscripciones/saves de las 6 colecciones nuevas |
| `src/components/sections/TesoreriaSection.tsx` | UI admin: 5 tabs (Liquidaciones/Gastos/SEPA 008/SEPA 001/Movimientos) |
| `scripts/test-bloque-b.ts` | 79 pruebas (`npm run test:bloque-b`) |

## Qué se ha reutilizado (sin modificar motores)

- `cobrosEngine` (periodos, pagos, historial), `contratoEngine` (patrón PDF), `firebase.ts`
  (`sanitizeObjectForFirestore`, `registrarAuditoriaFirestore`), RBAC + `audit_logs`,
  `Propietario.cuentasBancarias`, `TrabajoProfesional.importeFinal/facturaNumero`.

## Qué se ha extendido (mínimo, aditivo)

- `src/types.ts`: `SectionType += 'tesoreria'`, 4 permisos `tesoreria.*`, `ModulosConfig.tesoreria`.
- `Sidebar`/`MobileNav`: entrada Tesorería (admin) / Mis Liquidaciones (propietario).
- `PropietarioPortalSection`: subtab "Mis Liquidaciones" con detalle + PDF (aislamiento por `propietarioId`).
- `App.tsx`: estado + suscripciones + handlers + render (solo adiciones).
- `firestore.rules`: reglas 22–27 (aislamiento propietario en `get`, historial inmutable, sin borrado de liquidaciones salvo master-admin).

## Decisiones fiscales (parametrizadas, nunca fijas)

- Vivienda: sin IVA en renta; honorarios administración con IVA parametrizable (def. 21%).
- Retención: por defecto NO; si se activa, exige % + motivo + fuente (p. ej. 19%, "Art. 75.3.g RIRPF", local urbano con arrendatario empresa).
- Solo se liquida cobrado (`RECIBIDO`/`VERIFICADO`, `importeRecibido>0`); pendiente = informativo.
- Sin copropiedad inventada: reparto solo si se configura explícitamente.

## Seguridad

- Mínimo privilegio: propietario solo lee sus liquidaciones (reglas + `scopedLiquidaciones`); profesional ve cero.
- Sin secretos bancarios: solo IBAN/BIC/titular operativos ya existentes; sin credenciales.
- Idempotencia: liquidación por periodo, gasto por trabajo, orden por liquidación, fichero por hash de contenido.
- Historiales inmutables verificados en reglas (liquidaciones) y en app (cobros).

## Limitaciones explícitas (dependencias externas)

1. **Sin ejecución bancaria real**: los XML pain.008/001 se descargan para banca electrónica; el cargo/abono lo ejecuta el banco del cliente. Sin conector EBICS/API bancaria.
2. **Sin conciliación automática con extractos**: `sugerirConciliacion` es una interfaz documentada; requiere importar camt.053/extractos (futuro).
3. **Sin validación XSD oficial**: validación estructural + controles EPC (no sustituye la validación del banco; probar en entorno del banco antes de producción).
4. **Sin dispatcher de notificaciones**: eventos registrados en auditoría; envío real pendiente de GAP1.
5. **Fiscalidad parametrizable**: el sistema no asesora; la configuración (retención/IVA/fuente) la define administración con su asesoría.
6. Cambio de direcciones SEPA estructuradas (15-nov-2026): el XML actual no incluye `PstlAdr`; añadir si el banco lo exige.

## Comandos

- `npm run test:bloque-b` → 79/79 · `npm test` → 16/22 (6 fallos preexistentes en base, verificados con stash) · `npx tsc --noEmit` → 0 errores · `npm run build` → OK.
