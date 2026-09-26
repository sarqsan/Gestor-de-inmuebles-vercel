# FASE 3 — ESTRATEGIA DE MIGRACIÓN + ARQUITECTURA DE IMPORTACIÓN/EXPORTACIÓN FISCAL

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **Punto de partida:** FASE 2 (commit restaurado `9bdc25f` ≡ `c944d00`, perdido por reset 4 del sandbox; contenido idéntico verificado: 830 líneas, anexo 51 registros, INC-01…INC-15).

**Naturaleza:** SOLO DISEÑO. No se ha importado nada, no se ha escrito en Firestore, no se ha modificado código funcional. La importación/exportación se diseña como **requisito arquitectural de primer nivel** (igual que auth y perfiles), no como accesorio.

**Ciclo que este diseño resuelve:**

```
APLICACIÓN DE ORIGEN → IMPORTAR (preview→confirmar) → ERP (trabajar/auditar)
→ CONSERVAR ≥5 AÑOS + DOCUMENTOS → EXPORTAR (inmueble X / año Y / últimos 5 años)
→ ZIP → EXPEDIENTE FISCAL RECONSTRUIBLE SIN DEPENDER DEL ORIGEN
```

---

## 0. Arquitectura actual verificada (este turno, sobre el código real)

| Pieza | Realidad verificada | Evidencia |
|---|---|---|
| Hub Firestore | `src/lib/firebase.ts` (`saveInmuebleFirestore` L352); colecciones con nombre: `propietarios`, `inmuebles`, `candidatos`, `contratos_formalizacion`, `gastos`, `gastos_recurrentes`, `prestamos`, `facturas`, `registros_facturacion`, `envios_verifactu`, `audit_logs`… | grep L100-138, L2889-2891 |
| Auditoría | **Existe** `AUDIT_LOGS_COL = collection(db,'audit_logs')` con helpers de escritura/lectura | `firebase.ts` L138, L2107-2129, L2331 |
| Cobros | **Embebidos en el contrato**: `ContratoFormalizacion.registroCobros?: CobroPeriodo[]`; NO hay colección `cobros` propia; justificantes en Storage `cobros_justificantes/{propietarioId}/{cobroPeriodoId}/…` | `types.ts` L1051+, `firebase.ts` L1881, `storage.rules` L151/165 |
| Gastos | Colección `gastos`; `Gasto.origen` es string abierto + `origenId` (anclaje de trazabilidad ya existente) | `types.ts` L1334+ |
| Storage | `storage.rules` con rutas por dominio: `gastos_facturas/{propietarioId}/{gastoId}/{fileName}`, `cobros_justificantes/…`, `contratos/{contratoId}/…`, `recibos/…`, `inmuebles/…` (20 rutas) | `storage.rules` L151-423 |
| Motor fiscal | `src/utils/fiscalEngine.ts`: `esGastoDeducible`, `clasificarGastosDeducibilidad`, `calcularIngresosEjercicio`, `calcularGastosEjercicio`, `recopilarDocumentacionFiscal`, `generarResumenFiscalAnual`, `generarHistoricoFiscalInmueble`, `validarConsistenciaFiscal`… (con `fiscalEngine.test.ts`) | grep exports |
| Exportación hoy | `ExportacionFiscalEstructurada`/`Item` (tipos L3697-3740) construidos en `reportingEngine.ts` y `pdfExportEngine.ts`; `FormatoExportacion = 'CSV'|'JSON'|'PDF'`; **no existe generación de ZIP en todo el código** | grep `JSZip|archiver` = vacío |
| Importación hoy | Solo `handleImportData` (inmuebles/candidatos, sin validación, añade por id) — **no es canal de migración** (ya clasificado D en FASE 2) | `App.tsx` L1923-1942 |
| Índices | `firestore.indexes.json`: 6 índices compuestos | parse JSON |
| Servidor | Express (`server.ts`) con endpoints `/api/upload-document`, `/api/documents/:fileId`, etc.; patrón de scripts CLI con `tsx` (`scripts/test-bloque-*.ts`) | grep endpoints |
| Dependencias | `firebase ^12.17.1` (cliente). **NO** hay `jszip`, **NO** hay `archiver`, **NO** hay `firebase-admin` | package.json |

Consecuencias de diseño: (1) la trazabilidad puede apoyarse en `Gasto.origen/origenId` y `audit_logs` ya existentes; (2) los cobros importados **exigen contrato previo** (van embebidos en él); (3) el ZIP fiscal es capacidad nueva (dependencia nueva); (4) el importador debe ser script/CLI + panel, no `handleImportData`.

---

## A) Arquitectura de importación

**Principio:** importación = pipeline determinista, auditable, idempotente y reversible, con preview obligatorio antes de escribir.

```
FICHERO ORIGEN (Rentasync JSON)
 1. LOAD      sha256 del contenido → loteId; detección de esquema (v1 Rentasync)
 2. PARSE     type-guards TS; separación inmuebles[] / gastos_e_ingresos[]
 3. NORMALIZE mapa FASE 2 (reglas A/B): fechas (D/M/YYYY→ISO explícito), redondeo 2 dec.,
              enums por tabla (§E), trim, split multi-inquilino
 4. VALIDATE  obligatorios, enums destino, propertyId sin huérfanos, fechas coherentes
 5. CLASSIFY  A/B → IMPORTABLE · C → PENDIENTE_VALIDACION · campos desconocidos →
              se conservan en rawSnapshot (nunca se descartan en silencio)
 6. DEDUP     claves naturales (§E) + detección de duplicados de origen (se enlazan, NO se fusionan)
 7. PREVIEW   informe dry-run: contables/bloqueados/pendientes/duplicados/colisiones + incidencias FASE 2
 8. CONFIRM   escritura por lotes en orden de dependencia:
              Propietario → Inmueble → Contrato → Gasto → CobroPeriodo(embebido) → Prestamo
              Documentos: base64 → Storage ANTES de la referencia Firestore
 9. AUDIT     documento de lote + eventos en audit_logs + procedencia por registro
```

- **Ejecución:** script CLI `scripts/importar-rentasync.ts` (patrón `tsx` existente) con flags `--dry-run` (defecto), `--confirmar`, `--refrescar`, `--revertir-lote`; más adelante panel UI (bloque B7). Se propone `firebase-admin` para el CLI (dependencia nueva, §K); alternativa: ejecución autenticada en la app.
- **Errores parciales:** aislamiento por registro (try/catch), el lote continúa, informe final lista fallos; estado de lote `PARCIAL`; sin rollback automático de lo confirmado — existe `--revertir-lote` (§F).
- **Registros incompletos / datos desconocidos:** obligatorios ausentes → `BLOQUEADO` con motivo; campos no soportados por el destino → se guardan en `rawSnapshot` del registro (o subcolección `origen_crudo` del lote) y se listan como `REQUIERE_MAPEO` (regla FASE 0/2 vigente).
- **Simulación:** `--dry-run` produce el MISMO informe que la ejecución real sin escribir nada (requisito explícito).

## B) Arquitectura de exportación fiscal (prioritaria)

**Nuevo módulo puro:** `src/utils/expedienteFiscalEngine.ts` (sin I/O, testeable como `fiscalEngine.test.ts`) + ensamblador ZIP. Reutiliza `generarResumenFiscalAnual` / `recopilarDocumentacionFiscal` / `validarConsistenciaFiscal` (nombres verificados) y extiende `ExportacionFiscalEstructurada` (sus `tipo: 'INGRESO'|'GASTO'|'AMORTIZACION'|'INTERES'` ya cubren el desglose hipotecario).

**API de diseño:**

```ts
generarExpedienteFiscal({
  ambito: { tipo: 'TODOS' } | { tipo: 'INMUEBLES', inmuebleIds: string[] },
  periodo: { tipo: 'EJERCICIOS', desde: number, hasta: number }   // p.ej. últimos 5 años
         | { tipo: 'LISTA', ejercicios: number[] },
  incluirDocumentos: boolean,          // adjuntos originales en el ZIP
  incluirPendientesValidacion: true    // SIEMPRE true por diseño: se exportan MARCADOS, no se omiten
}): Promise<ExpedienteFiscal>
```

- Operaciones soportadas por diseño: **"Todos los inmuebles + últimos 5 años"** (ámbito TODOS + desde=añoActual−4) y **"Inmueble X + año Y"**.
- **Tres capas, claramente separadas:**
  1. **Formato interno ERP** (JSON versionado + CSV legible): es el esquema del expediente; `versionEsquema` en manifest; compatible hacia delante con `ExportacionFiscalEstructurada`.
  2. **Documentos adjuntos**: binarios originales tal cual, con índice y hashes.
  3. **Formato oficial AEAT**: **NO confirmado, NO asumido**. El ZIP interno NO es un formato de presentación ante AEAT (el ERP ya declara exportación "no formato oficial"). Si Hacienda exigiera un formato concreto, se añadiría un exportador específico sobre el mismo expediente interno — el diseño interno no depende de ello.
- **ZIP:** cliente (JSZip, dependencia nueva §K) para MVP; si el volumen de documentos lo exige, generación servidor con streaming (`archiver`) — decisión diferida (§L).

## C) Modelo de trazabilidad

Cadena exigida: **inmueble → movimiento → categoría → periodo → documento → origen → id interno**. Garantías:

1. **Procedencia por registro** (nuevo tipo `ProcedenciaRegistro`, §K):
   `{ sistema: 'RENTASYNC'|'ERP'|…, origenId, fuente, loteId, importadoEn, estadoEvidencia: 'VERIFICADO'|'PENDIENTE'|'REQUIERE_VALIDACION', evidenciaNota? }`
   Se apoya en lo ya existente: `Gasto.origen='IMPORTACION'` + `Gasto.origenId=exp_*`; `CobroPeriodo.observaciones`+`historialCambios`; `Inmueble.notasInternas`.
2. **Categoría y periodo**: `Gasto.categoria`/`ejercicioFiscal`/`periodoMesAnio`; `CobroPeriodo.mes`/`anio`/`periodoMesAnio` (todo ya existe en el modelo).
3. **Documento**: `Gasto.documento{storagePath,sha256,…}` / `CobroPeriodo.justificante{storagePath,…}` (§D).
4. **Modificaciones posteriores:** los registros importados NO se sobrescriben en silencio: toda edición añade entrada de historial (`CobroPeriodo.historialCambios` ya existe; para `Gasto` se propone `historialCambios` equivalente — §K) + evento en `audit_logs` con valor anterior/nuevo. El `rawSnapshot` original permanece inmutable.
5. **Lotes**: colección nueva `importaciones_lotes` (ver §F) permite responder "¿qué entró, cuándo, desde qué fichero, con qué sha256?".

## D) Documentos y Storage

- **Regla:** NUNCA base64/PDF dentro de documentos Firestore (convención ya vigente en la BASE: justificantes "por referencia, sin base64 en BD"). Los PDFs importados se suben a Storage y el registro guarda la referencia.
- **Rutas (sin cambiar `storage.rules`):** se reutilizan las existentes —
  gastos: `gastos_facturas/{propietarioId}/{gastoId}/{ts}_{nombreSeguro}` (regla L178) ·
  cobros: `cobros_justificantes/{propietarioId}/{cobroPeriodoId}/{ts}_{nombreSeguro}` (L151) ·
  contratos: `contratos/{contratoId}/…` (L390).
- **Metadatos documentales** (extensión propuesta de `Gasto.documento`, alineada con `JustificanteCobro` que YA tiene `tipoMime`/`tamanoBytes`):
  `{ id, nombre (original), url, storagePath, tipoMime, tamanoBytes, sha256, fechaSubida, origenSistema, origenId }`.
- **sha256:** sí — integridad a 5 años, deduplicación de binarios y verificación en la exportación (el manifest del ZIP lleva el hash de cada archivo).
- **Exportación:** el ensamblador descarga por `storagePath` (auth del usuario), verifica sha256 y coloca el archivo en `documentos/{inmuebleId}/{anio}/{movimientoId}/{nombreOriginal}` + `documentos/indice.json`.

## E) Estrategia anti-duplicados

| Nivel | Clave | Comportamiento |
|---|---|---|
| Lote | `sha256(contenido normalizado del fichero)` | Si ya existe lote `CONFIRMADO` con ese hash → **se bloquea la reimportación** y se muestra el lote anterior |
| Registro importado | `sistema + origenId` (único) | ids deterministas: gasto → `gas_{inmuebleId}_{origenId}`; cobro → `cobro_{contratoId}_{anio}_{mes}` (formato natural YA existente) ⇒ reescribir el mismo fichero es idempotente |
| Inmueble | `id` externo; secundario: `referenciaCatastral` | Colisión de id → bloquear; catastral coincidente con inmueble existente de id distinto → colisión → decisión humana en preview (INC-10: la catastral NO es fiable: duplicada y vacías) |
| Duplicado de ORIGEN | hash(inmuebleId, importe, categoria, fecha, concepto normalizado) | **NO se fusiona ni se elimina**: se importan ambos enlazados por `vinculoDuplicadoIds` y marcados; caso real preservado: 354,78 € ×2 (INC-05) |

## F) Estrategia de reimportación

- **Modos:** `--dry-run` (defecto) · `--confirmar` · `--refrescar` (actualiza SOLO registros cuyo contenido cambió respecto al lote anterior, con historial; nunca borra en silencio) · `--revertir-lote {id}` (anula los registros del lote marcándolos `estado='ANULADO'`/baja lógica; los binarios de Storage se conservan y se marcan huérfanos en el lote — nada se destruye).
- **Colección `importaciones_lotes`** (nueva, §K): `{ id(=sha256), sistema, ficheroNombre, fecha, estado: 'PREVIEW'|'CONFIRMADO'|'PARCIAL'|'REVERTIDO', contadores{importados,bloqueados,pendientes,duplicados}, documentosSubidos[], incidenciasVinculadas[], registrosFallidos[] }`.
- **Contrato de idempotencia (testeable):** importar el mismo fichero 2 veces ⇒ 0 registros nuevos, 0 documentos duplicados, informe "ya importado (lote X)".

## G) Estructura propuesta del ZIP fiscal

```
expediente_fiscal_{ambito}_{desde}-{hasta}_{yyyyMMdd-HHmm}/
├── manifest.json            ← versión de esquema, parámetros de generación, contadores,
│                               sha256 de cada archivo, avisos (pendientes de validación),
│                               aviso explícito: "Formato interno ERP. NO es formato oficial AEAT"
├── README.txt               ← qué es, cómo se generó, cómo verificar hashes
├── resumen/
│   ├── resumen_fiscal.csv   ← inmueble × ejercicio: ingresos, gastos por categoría fiscal,
│   │                           desglose (amortización/intereses), resultado (motor fiscal existente)
│   └── resumen_fiscal.json
├── inmuebles.json           ← inventario de inmuebles incluidos + titularidades + datos fiscales
├── propietarios.json        ← titulares relevantes (con NIF; ZIP = documento sensible)
├── contratos/{contratoId}.json   ← contratos relevantes del periodo (incluye finalizados)
├── movimientos/
│   ├── ingresos.json        ← CobroPeriodo → ExportacionFiscalItem(tipo INGRESO) + procedencia
│   └── gastos.json          ← Gasto → items (GASTO / AMORTIZACION / INTERES) + procedencia
├── documentos/
│   ├── indice.json          ← archivo ↔ movimiento ↔ inmueble, nombreOriginal, mime, tamaño, sha256
│   └── {inmuebleId}/{anio}/{movimientoId}/{nombreOriginal}
└── auditoria/
    ├── lotes.json           ← lotes de importación que aportaron movimientos al expediente
    └── incidencias.json     ← INC-* abiertas que afectan a registros incluidos (marcados, NO resueltos)
```

Todo movimiento del ZIP lleva: `inmuebleId`, `referenciaId` (id interno), `origen` (`COBRO`/`GASTO`/…), `procedencia` (sistema+origenId cuando aplica), `ejercicio`, `categoria`, `importe`, y enlace a su documento vía `indice.json`.

## H) Flujo de usuario

**Importar:** Configuración (o sección "Migración") → pegar/subir JSON → el sistema calcula lote y muestra **PREVIEW**: contadores, bloqueados con motivo, pendientes de validación (checklist con cada incidencia FASE 2), duplicados detectados, colisiones → el usuario resuelve o difiere cada punto C (diferido = se conserva en el lote, NO entra en productivo) → **CONFIRMAR** → progreso → informe final + eventos de auditoría.
**Exportar:** pestaña Fiscal → "Generar expediente fiscal" → selector de ámbito (Todos / uno o varios inmuebles) → selector de periodo (año / rango / botón "últimos 5 años") → opción incluir documentos → generar → descarga ZIP + resumen en pantalla (n registros, n documentos, avisos).

## I) Conservación ≥ 5 años (requisito funcional)

- **Retención:** sin TTL ni purga automática sobre `gastos`, contratos (`registroCobros` embebido), `prestamos`, `importaciones_lotes`, `audit_logs` ni sobre las rutas documentales de Storage. Lo que no se muestra en vistas cotidianas NO se borra.
- **Búsqueda/filtrado:** consultas por `inmuebleId + ejercicioFiscal` y por `periodoMesAnio` (rango). Índices compuestos nuevos necesarios (diseño; hoy hay 6): `gastos(inmuebleId ASC, ejercicioFiscal ASC)`, `gastos(ejercicioFiscal ASC, categoria ASC)`, `gastos(propietarioId ASC, fechaDevengo ASC)` — se declararán en `firestore.indexes.json` en el bloque B1 (§M).
- **Integridad:** sha256 por documento (importación) y por archivo (manifest de exportación); `validarConsistenciaFiscal` (ya existe) como chequeo previo a exportar.
- **Relaciones históricas:** cadenas de contrato (`contratoOrigenId`/`contratoDerivadoId`, ya en el modelo) y lotes de importación permiten reconstruir el expediente de cualquier año sin la app de origen.
- **Límite técnico a vigilar:** contratos con `registroCobros` embebido y el límite de 1 MB por documento Firestore → a ~12 cobros/año/contrato hay margen, pero el exportador debe paginar/leer por contrato y el diseño deja abierta la extracción a subcolección `cobros` si creciera (decisión pendiente §L).

## J) Dependencias con el modelo actual

Se apoyan en lo existente (verificado §0): colecciones `gastos`/`contratos_formalizacion`/`propietarios`/`inmuebles`/`prestamos`/`audit_logs` · `Gasto.origen/origenId/documento` · `CobroPeriodo` embebido + `JustificanteCobro` · rutas de `storage.rules` · `fiscalEngine` (resumen anual, deducibilidad, recopilación documental, validación) · `ExportacionFiscalItem/Estructurada` · `firestore.indexes.json` · patrón CLI `scripts/*.ts` con `tsx`.
**Bloqueo funcional conocido:** los cobros exigen contrato (van embebidos). Las rentas importadas (G-03/G-14 de FASE 2) quedan en `PENDIENTE_VALIDACION` hasta que exista el contrato destino — el diseño NO inventa contratos.

## K) Cambios de código necesarios (DISEÑO — no implementados en FASE 3)

**Nuevos (bloques §M):** tipos `ProcedenciaRegistro`, `LoteImportacion`, extensión `Gasto.documento` (mime/tamaño/sha256) y `Gasto.historialCambios` · módulo `src/lib/importacion/*` (parser, mapper, validator, dedup, loteStore) · `src/utils/expedienteFiscalEngine.ts` + tests · `scripts/importar-rentasync.ts` · índices nuevos en `firestore.indexes.json` · reglas de `importaciones_lotes`/`registros_pendientes` en `firestore.rules` · dependencias `jszip` (+ `firebase-admin` para CLI) · panel UI (importar + exportar).
**NO se tocan todavía:** `fiscalEngine.ts`, `firebase.ts` existente, `storage.rules` (las rutas actuales bastan), `handleImportData` (se deprecará, no se borra), datos productivos, índices desplegados.

## L) Riesgos y decisiones pendientes

1. **Contradicción A/B de FASE 2 sin resolver** → el importador exige UN fichero canónico: **la importación real queda bloqueada hasta que el usuario confirme cuál es** (no se decide por suposición).
2. **Resets del sandbox** (4 confirmados): la evidencia externa vive fuera de Git y se pierde → recomendación: custodiar el fichero original en una rama/repo privado del usuario.
3. **PII en el ZIP** (NIF, nombres, contratos): el ZIP es un documento sensible; acceso solo al propietario autenticado; valorar cifrado/contraseña (decisión pendiente).
4. **Volumen en exportaciones de 5 años**: coste de lecturas y memoria en cliente → paginación; si supera lo razonable, ZIP en servidor (decisión diferida).
5. **AEAT**: formato oficial no confirmado → capa 3 sin diseñar a propósito.
6. **Cobros embebidos vs subcolección**: decisión abierta (§I).
7. **Incidencias C de FASE 2 — registro completo INC-01…INC-15** (doc FASE 2 §5): desfase IBI 58,73 (INC-01) · desfase comunidad 688,16 (INC-02) · derrama 521,70 community-vs-repairs (INC-03) · 237,60 insurance (INC-04) · duplicado 354,78 (INC-05) · ambigüedad de rentas A/B (INC-06) · 8.400 vs 8.760 (INC-07) · registro 27 truncado (INC-08) · posibles registros posteriores (INC-09) · catastral no única (INC-10) · tenantHistory invertido (INC-11) · "José Gregorio" (INC-12) · multi-inquilino (INC-13) · float 1933.6999999999998 (INC-14) · ZIP AEAT (INC-15) → **ninguna se resuelve automáticamente**; todas viajan como `estadoEvidencia='REQUIERE_VALIDACION'` y aparecen en `auditoria/incidencias.json` de cada exportación.

## M) Plan de implementación posterior (bloques pequeños y auditables)

| Bloque | Contenido | Salida verificable | Escribe en productivo |
|---|---|---|---|
| B0 | Fichero canónico confirmado por el usuario + custodia en Git | sha256 registrado | No |
| B1 | Tipos (`ProcedenciaRegistro`, `LoteImportacion`, extensiones) + índices declarados | `npm run lint` + tests de tipos | No |
| B2 | Parser + validator + mapper (mapa FASE 2) con `--dry-run` sobre el anexo de FASE 2 | informe dry-run reproducible = conciliación FASE 2 | No |
| B3 | Dedup + preview + checklist de incidencias C | test de idempotencia (mismo fichero 2×) | No |
| B4 | Escritura `--confirmar` + lotes + `audit_logs` + `--revertir-lote` | test de reversibilidad (FASE 5) | **Sí (con aprobación explícita)** |
| B5 | Pipeline documental: base64 → Storage + sha256 + metadatos | documentos verificables por hash | Sí (Storage) |
| B6 | `expedienteFiscalEngine` + ZIP (ámbito/periodo, 5 años) | ZIP de prueba + verificación manifest | No |
| B7 | UI importar/exportar | flujo H completo | No |
| B8 | Prueba round-trip: export→reimport→export ⇒ expedientes equivalentes | informe de equivalencia | No |

---

## Validación del diseño (regla 11) — autochequeo

- [x] Cada campo del expediente tiene origen y destino: §G (manifest/resumen/inmuebles/propietarios/contratos/movimientos/documentos/auditoría) mapeado a colecciones reales verificadas en §0.
- [x] Ningún dato crítico de FASE 2 sin estrategia: INC-01…INC-15 → §L.7 + `estadoEvidencia` + `auditoria/incidencias.json` + `rawSnapshot` (campos desconocidos nunca se descartan).
- [x] Documentos relacionables con movimientos: `indice.json` (archivo↔movimiento↔inmueble) + `Gasto.documento`/`justificante` con sha256 (§D).
- [x] Inmueble + periodo reconstruye expediente: API §B (`INMUEBLES` + `EJERCICIOS`) e índices §I.
- [x] "Todos + últimos 5 años" soportado por diseño: ámbito `TODOS` + rango desde=año−4 (§B).
- [x] Reimportación sin duplicados: claves naturales + lote sha256 + contrato de idempotencia testeable (§E/§F).
- [x] Incidencias C no se convierten en definitivas: checklist en preview, diferidos fuera de productivo, exportación las marca (§A.5, §H, §L.7).
- [x] No implementado solo para el ejemplo actual: claves, lotes y API son genéricos (sistema, origenId, ámbito, periodo parametrizados).
