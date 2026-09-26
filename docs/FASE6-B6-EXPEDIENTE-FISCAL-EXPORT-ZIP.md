# FASE 6 · B6 — MOTOR DE EXPEDIENTE FISCAL + EXPORTACIÓN ZIP

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **Alcance:** SOLO lectura + generación. **CERO escrituras Firestore/Storage · 0 datos modificados · reglas intactas · B4 NO ejecutado · importador NO ejecutado.**
**Nota de estado:** reset 8 detectado al inicio; commits FASE 2–5B restaurados como `b8b8b55`/`02fe9d3`/`4babf75`/`8082129`/`70995d7`.

> **El ZIP producido es una "Exportación fiscal INTERNA / expediente reconstruible del ERP". NO es ni afirma ser compatible con ningún formato oficial de presentación ante la AEAT** (`procedencia.formatoOficialAEAT: false` viaja en cada expediente).

---

## 1. Arquitectura
Módulo nuevo **`src/lib/expedienteFiscal/`** (4 ficheros + tests), 100% puro:
- `tipos.ts` — contrato versionado `rentasync-fiscal-export-v1`, clasificación de datos, incidencias.
- `ambito.ts` — resolución determinista de ámbitos (nunca usa la fecha del navegador).
- `zip.ts` — escritor ZIP mínimo determinista (STORE + CRC32, timestamps fijados a 1980-01-01) — **sin dependencias nuevas**.
- `motor.ts` — `generarExpedienteFiscal()` + `empaquetarExpediente()`. **Reutiliza `generarResumenFiscalAnual` de `src/utils/fiscalEngine.ts`** (no duplica el motor fiscal) y `sha256Hex` de `src/lib/importacion/hash.ts` (extendido en esta fase para aceptar bytes; comportamiento con strings idéntico).
Los datos (`inmuebles/contratos/gastos`) se reciben **por parámetro**: el motor no lee ni escribe Firestore/Storage. Contexto de autorización (actor/propietario/gestor/cartera/permisos) se **registra** en el manifest pero aún no se aplica (FASE 5B, pendiente de aprobación).

## 2. Contrato `rentasync-fiscal-export-v1`
`ExpedienteFiscal = { manifest, resumenFiscal[], movimientos[], documentos[], incidencias[], agregadosOrigen, datosNoDisponibles[], procedencia }`.
Cada movimiento conserva (cuando existe): inmueble, ejercicio, fecha, concepto, importe, categoría, tipo (`INGRESO|GASTO|AMORTIZACION|INTERES`), `origen` (del gasto ERP: MANUAL/RECURRENTE/SEGURO/…), `origenId`, referencia documental, hash del documento, `clasificacion` y `fuente` (cadena de trazabilidad). **Nada se inventa:** si el dato no existe, no aparece; si falta, va a `incidencias` o `datosNoDisponibles`.

## 3. Clasificación del dato (B6.4)
`ALMACENADO` (gastos tal cual) · `DERIVADO` (cobro→ingreso, sin recalcular importes) · `CALCULADO` (desgloses `intereses`/`capitalAmortizado`, marcados **`noAcumulable: true`**: no duplican el importe del gasto del que proceden) · `DOCUMENTAL` (referencias/hashes) · `PENDIENTE` (nunca inventado).
**Agregados:** los agregados históricos del origen externo (`expenses.*`, `yearlyFinancials` de Rentasync) NO son campos del `Inmueble` ERP (verificado) y **nunca se convierten en movimientos** (regla 14; test 16).

## 4. Ámbitos soportados (B6.3) — los 6
A) inmueble+año · B) inmueble+rango · C) todos+año · D) todos+rango · E) inmueble+últimos 5 años · F) todos+últimos 5 años.
"Últimos 5 años" = `[anioReferencia-4 .. anioReferencia]` con **año de referencia explícito del llamante** → exportaciones históricas reproducibles byte a byte.

## 5. Estructura del ZIP (B6.7)
```
/manifest.json              ← exportId, hashes por entrada, ámbito, actor, incidencias
/resumen-fiscal.json        ← ResumenFiscalAnual[] del motor fiscal existente
/movimientos.json  /movimientos.csv
/documentos.json            ← índice documental (documentoId, movimientoId, inmuebleId,
                              tipo, nombre, hash, rutaLógica, storagePath, estado)
/documentos/{inmuebleId}/{ejercicio}/{tipo}/{nombre}   ← solo binarios DISPONIBLES
/incidencias.json
/auditoria/procedencia.json ← modo LECTURA, 0 escrituras, agregados, datos no disponibles
```
**PII/seguridad:** por defecto `incluirPII=false` → conceptos saneados (sin nombres de inquilinos); el ZIP no incluye DNI, IBAN ni cuentas. Riesgo residual documentado: `storagePath` revela estructura de rutas interna y el concepto con PII activada incluiría nombres — **no se inventa solución criptográfica en esta fase**; el ZIP debe tratarse como documento interno confidencial.

## 6. Manifest y determinismo (B6.6)
`exportId = sha256(contenido canónico)` (ámbito+ejercicios+inmuebles+movimientos+documentos+incidencias, JSON con claves ordenadas). `generatedAt` lo aporta el llamante (el motor nunca llama a `Date.now()`). Hashes por entrada en `manifest.hashes`. Mismo input + mismo `generatedAt` ⇒ **mismo binario ZIP** (tests 13/14).

## 7. Documentos (B6.5)
Índice desde la documentación recopilada por el motor fiscal (justificantes de cobros + documentos de gastos). Binarios vía `resolverBinarios` inyectable: si está → `DISPONIBLE` + sha256 real + incluido sin alterar; si no → **`PENDIENTE` + incidencia `DOC_FALTANTE`** (nunca se inventa).

## 8. Trazabilidad (B6.8)
Cadena conservada: inmueble → movimiento → fecha → concepto → importe → categoría → documento → origen, materializada en `fuente` (p.ej. `contratos_formalizacion/c1/registroCobros → cobros/cob1`, `gastos/g1.intereses`). Permite responder "¿qué gastos/ingresos/documentos pertenecían a este inmueble en este periodo y de dónde salió cada dato?".

## 9. Incidencias detectadas (B6.9) — no se corrige nada automáticamente
`MOV_SIN_INMUEBLE` · `MOV_SIN_FECHA` · `IMPORTE_INVALIDO` · `CATEGORIA_DESCONOCIDA` (contra lista runtime paritaria con `CategoriaGasto`) · `DOC_FALTANTE` · `REF_ROTA` · `DUP_ORIGEN` (se conservan ambos registros) · `INCIDENCIA_FISCAL` (cobros IMPAGADO) · `RELACION_INCOMPLETA` (cobro sin contratoId) · `DERIVADO_SIN_FUENTE` (reservado).

## 10. Tests (B6.10) — 19 tests, todos verdes
Los 17 obligatorios (ámbitos 1-5, sin movimientos, documento existente/pendiente, con/sin origen, duplicado conservado, incidencia fiscal, determinismo manifest/movimientos, hash documental, agregados no generan movimientos, ausencia de Firebase por análisis estático) + 2 extra (validaciones completas; ZIP válido con magic `PK`).

## 11. Límites actuales
- Motor Node-only (`node:crypto` vía hash.ts): un adaptador WebCrypto queda para cuando la UI (B7) lo necesite.
- Sin binarios reales (los ficheros externos se perdieron; B5 pendiente) → en la práctica los documentos saldrán `PENDIENTE`.
- Autorización: el contexto se registra pero no se aplica (FASE 5B D1-D6 pendientes).
- Solo datos YA presentes en el ERP: la migración Rentasync sigue bloqueada (INC-06 y resto).

## 12. Diferencias respecto a un formato oficial AEAT
Este ZIP no implementa el esquema oficial de presentación de libros/declaraciones (no hay validación de NIF contra censo, ni estructura de registros oficial, ni firma/sello). Es un expediente interno de revisión con procedencia y hashes, insumo para preparar una presentación oficial por otros medios.

## 13. Ejemplo de reconstrucción
`generarExpedienteFiscal({inmuebles,contratos,gastos}, {seleccion:'UN_INMUEBLE', inmuebleId:'i1', periodo:{tipo:'RANGO',desde:2024,hasta:2025}}, {actor:'uid'}, {generatedAt:'…'})` → expediente con 2 resúmenes anuales, movimientos ordenados por (inmueble, fecha, id), documentos indexados y manifest con hashes → `empaquetarExpediente(exp, resolver)` → ZIP determinista reconstruible.

## Verificación
Tests nuevos 19/19 · B0–B3 17/17 · Bloque B 92/92 · Bloque C 82/82 (+vitest 79/79) · Bloque E 64/64 · `tsc --noEmit` EXIT 0 · build EXIT 0 · `git diff` de reglas/índices/código existente revisado (única modificación a código preexistente: `hash.ts` acepta bytes, no cambia comportamiento con strings). **Firestore 0 escrituras · Storage 0 escrituras · datos 0 modificaciones · reglas intactas · importador NO ejecutado · B4 NO ejecutado.**
