# BLOQUE 7 — Importación / Exportación + XLSX

Estado: **cerrado** sobre `main` `967ea936c70c4402a3f325667c566f04fb88b415`, rama de trabajo
`arena/01a0e87c-gestor-de-inmuebles-vercel`. Alcance EXCLUSIVO de importación/exportación:
no incluye Documentos/Storage (Bloque 6, Arena B), ni los bloques 8–11.

Este documento fija las **decisiones** del bloque y su superficie exacta. Las cifras de la
batería y el detalle de la validación van en el informe de cierre.

---

## 1. Qué existía y qué se ha hecho (inspección → integración, sin sistema paralelo)

| Pieza existente | Estado previo | Bloque 7 |
| --- | --- | --- |
| `src/lib/importExport/contrato.ts` | contrato `erp-import-export-v1` con `FormatoEntrada` JSON/CSV | se añade `XLSX` (aditivo) y `ExportRun.bytes?: Uint8Array` (solo XLSX) |
| `src/lib/importExport/csvParser.ts` / `jsonParser.ts` | reales | intactos (regresión) |
| `src/lib/importExport/normalizar.ts` | normalización de espacios/alias/fechas/importes | `aFecha` acepta ISO con hora (`YYYY-MM-DDTHH:MM(:SS)`) → devuelve el día civil **con aviso** «hora descartada» |
| `src/lib/importExport/mappingRegistry.ts` | orden canónico → alias → `conocido_sin_destino` → null | intacto |
| `src/lib/importExport/pipeline.ts` + `ejecucion.ts` + `promocion.ts` | dry-run B4 + barreras O7 + promoción por puerto | intactos; el XLSX entra por el MISMO pipeline (`formato: 'XLSX'`) |
| `src/lib/importExport/exportador.ts` | 5 entidades exportables, CSV/JSON, `filtrarPorAmbito` | rama XLSX con las MISMAS columnas y orden que CSV (`columnasXlsxDeEntidad`) |
| `src/lib/importExport/xlsxStub.ts` | hueco honesto: «XLSX no soportado» | **reexportación** del adaptador real (`./xlsx`): la API y el nombre públicos no cambian; `XLSX_MOTIVO_NO_SOPORTADO` queda como constante histórica informativa |
| `src/components/sections/ImportExportPanel.tsx` | importación JSON/CSV; exportación JSON/CSV | XLSX cableado (selector de hoja, avisos del parser, descarga binaria del libro) |
| `src/lib/importExportFirebase.ts` | única capa de I/O (timeout 25 s; solo `gastos` escribible; verificación post-escritura) | intacta |

Nuevo (implementación **propia y pura**, sin dependencias):

- `src/lib/importExport/inflate.ts` — DEFLATE (RFC 1951) completo: bloques almacenados,
  Huffman fijo y dinámico; cota de salida (`max`), errores explícitos.
- `src/lib/importExport/zip.ts` — contenedor ZIP: lector (CRC32 verificado antes de devolver
  datos, rechazo explícito de ZIP64/cifrado/métodos no soportados) y escritor determinista
  (fecha fija 1980-01-01, orden estable de partes).
- `src/lib/importExport/fechasExcel.ts` — seriales de Excel 1900/1904 en ambos sentidos,
  con la regla del 29/02/1900 ficticio y clasificación de formatos numéricos.
- `src/lib/importExport/xlsx.ts` — adaptador real: `parseXlsx`, `previsualizarXlsx`,
  `generarXlsx`, `sanearNombreHoja`, `ADAPTADOR_XLSX_REAL`.

## 2. Decisiones (y por qué)

1. **Sin librería externa.** No existe ninguna dependencia Excel/CSV/ZIP en el proyecto y no
   se añade: el ZIP/DEFLATE/XLSX se implementa en el repo (≈3 ficheros puros, testeables sin
   red). SheetJS 0.18.5 se usa **solo como herramienta de verificación cruzada fuera del
   repositorio** (`/tmp`, no se versiona) para generar fixtures y releer lo que escribe el
   bloque.
2. **Lectura honesta, nunca evaluadora.** Las fórmulas se importan por su valor cacheado
   (`<v>`); una fórmula sin valor calculado se lee como vacío **con aviso** y jamás se evalúa.
   Una celda con error de Excel (`#DIV/0!`…) es vacío + aviso. Nada de `eval`/`Function`/`fetch`.
3. **Inyección de fórmulas.** Todo valor procedente de datos viaja como **texto** (`inlineStr`):
   un concepto `=SUM(A1:A9)`, `+34 600 000 000` o `@usuario` se escribe como texto y nunca como
   fórmula (`<f>` no existe en los libros generados; hay test que lo verifica sobre el XML).
4. **Fechas civiles sin desplazamiento.** Seriales Excel 1900/1904 ↔ `YYYY-MM-DD` con aritmética
   UTC y reglas explícitas: `1900-01-01 → 1`, `1900-02-28 → 59`, `1900-03-01 → 61`,
   serial 60 (29/02/1900 ficticio) → `1900-02-28` **+ aviso**, `1899-12-31 → null` (no
   representable en 1900; sí en 1904 como serial 0). Nunca se usa `toISOString()` sobre fechas
   locales al importar/exportar. Una celda fecha+hora produce `YYYY-MM-DDTHH:MM:SS` y, al
   normalizar a campo de fecha, el día civil con aviso de hora descartada.
5. **Ámbito antes de generar.** La exportación filtra por `filtrarPorAmbito` (mismo camino que
   CSV/JSON): propietario, inmueble y ejercicio salen de la solicitud validada contra el ámbito
   autorizado real, nunca de un filtro de UI. Un hueco en un campo de ámbito **no es un valor**:
   antes, un campo de ejercicios vacío producía `Number('') === 0` → `[0]` y la exportación
   salía vacía en silencio; ahora los huecos se descartan y un ejercicio no numérico se rechaza
   con mensaje explícito.
6. **El archivo nunca manda.** La importación resuelve titular/cartera/inmueble contra los
   catálogos autorizados (`catalogosDesdeFuentes` + `propietariosPermitidosIds`) y aplica las
   barreras O7 antes de escribir; el aislamiento por titular/cartera/inmueble se prueba con
   libros reales que apuntan a carteras no autorizadas (0 escrituras, 0 AUTO).
7. **Idempotencia.** La clave de identidad la fija el contrato (`importRunId`, sha256 del
   archivo, clave real del modelo y `existentes` del dry-run); no se usa `Date.now()`,
   `Math.random()` ni UUID como mecanismo de identidad. Reimportar el mismo libro reproduce el
   mismo run (test de idempotencia con fixture real).
8. **`.xls` heredado (BIFF/OLE2): no soportado y dicho en claro.** El panel lo acepta en el
   selector y el lector responde «libro .xls antiguo (BIFF/OLE2) no soportado: ábrelo en Excel y
   guárdalo como .xlsx (o expórtalo a CSV)». Un `.xls` que se colara por otro camino tampoco
   cuela: la firma OLE2 se detecta antes de intentar descomprimir.
9. **El libro no se guarda.** El XLSX exportado se genera en memoria y se descarga; **no** se
   sube a Storage ni se persiste en Firestore. De él solo se registra lo que ya registra el
   contrato de exportación (ámbito, recuento, `sha256`); `ExportRun.bytes` nunca se serializa a
   Firestore. No se guarda el original importado en ningún sitio.
10. **Auditoría: sistema existente, sin duplicar.** La importación usa `IMPORTACION_*` por el
    camino ya existente (`importExportFirebase.ts`, best-effort); la coexistencia con
    `registrarAuditoriaFirestore` está documentada en `src/lib/auditoria.ts` y cubierta por
    `tests/auditoria-coexistencia.test.ts`. Las **exportaciones no se auditan**: se inspeccionó
    el patrón del ERP y no existe evento de exportación previo; inventarlo sería crear un
    sistema de auditoría paralelo. Decisión: se documenta aquí y se mantiene el comportamiento
    (trazabilidad por `exportRunId` + `sha256` devueltos al usuario).
11. **Mismo contrato para los tres formatos.** JSON/CSV/XLSX entran por el mismo pipeline
    (detección → lectura → normalización → validación estructural → negocio → previsualización →
    confirmación → persistencia por puerto) y salen por el mismo exportador (datos → ámbito →
    normalización → columnas → generación → descarga). No hay lógica divergente por pantalla.

## 3. Superficie exacta del bloque

Productivo: `src/lib/importExport/{xlsx,inflate,zip,fechasExcel}.ts` (nuevos),
`src/lib/importExport/{contrato,exportador,normalizar,xlsxStub}.ts`,
`src/components/sections/ImportExportPanel.tsx`.

Tests y fixtures: `src/lib/importExport/xlsx.test.ts`, `tests/import-export-xlsx.test.ts`,
`tests/import-export-canonico.test.ts`, `tests/import-export-panel.test.tsx`,
`tests/fixtures/xlsx/` (12 libros reales).

Cierre: `scripts/test-bloque-7.ts` (+ script `test:bloque-7` en `package.json`, una línea
añadida: `package.json` solo admite adiciones) y este documento.

## 4. Verificación cruzada fuera del repositorio (evidencia, no dependencia)

- **Lectura**: 8 variantes del mismo libro (`movimientos-rentasync.xlsx`) generadas con SheetJS
  y recomprimidas con 7 estrategias DEFLATE distintas (nivel 0/1/6/9, Huffman fijo, Huffman-only
  y RLE) mediante el `zlib` de Python; el lector devuelve registros idénticos en las 8.
- **Escritura**: el libro que produce `generarXlsx` se releyó con SheetJS 0.18.5 (valores, tipos,
  fechas y textos con `=`, `+`, `@`, comillas, `&` y acentos) y se validó contenedor a contenedor
  con el `zlib` de Node (método almacenado y CRC32 correctos).
- **Fechas**: los seriales se contrastaron con la aritmética de fechas de Python (`datetime`),
  independiente del código del bloque.

## 5. Incidencia de datos conocida (no funcional, no se silencia)

Los gastos históricos con ids `gasto_mant_*` sin `origenId` no se fusionan automáticamente con
las operaciones del circuito de mantenimiento. El bloque garantiza que **a partir de ahora** no
se generan duplicados (clave determinista `gas_{inmuebleId}_{origenId}` + verificación de
existencia), pero no reescribe el histórico: hacerlo exige una decisión de datos que no
corresponde a este bloque.

## 6. Fuera de alcance (identificado, NO tocado)

1. `src/utils/mantenimientoEngine.ts::calcularFechaFinGarantia` calcula el fin con
   `setMonth`/`toISOString()` sobre hora **local**: en Europe/Madrid devuelve un día menos cuando
   el inicio cae en horario de invierno y el fin en horario de verano (repro: `2026-03-02` + 6
   meses → `2026-09-01`). Consumidores: `GarantiaModal`, `RegistrarActuacionModal`,
   `registrarGarantiaDesdeTrabajo`. Es un defecto de fechas civiles en un módulo cerrado
   (mantenimiento), fuera de la superficie autorizada del Bloque 7: queda registrado como
   pendiente funcional para su bloque correspondiente.
2. `src/components/modals/RegistrarActuacionModal.tsx` calcula la fecha por defecto con
   `new Date().toISOString().split('T')[0]` (entre las 00:00 y las 02:00 locales propone el día
   anterior) y no recibe `gastosExistentes`, por lo que reutiliza el mismo id reescribiéndolo en
   lugar de saltarse la escritura. Mismo motivo: se registra, no se toca.
3. Superficies ajenas inspeccionadas y **no modificadas**: `src/lib/importacion/` (importador
   histórico B1), `src/utils/conciliacion/` (CSV de conciliación), `src/features/patrimonial/`
   (previsualización de importación), `src/lib/migracion/` (B4), `src/utils/pdfExportEngine.ts`
   (exportación a PDF, otro formato) y `src/lib/importExportFirebase.ts` (I/O).
