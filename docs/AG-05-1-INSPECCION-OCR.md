# AG-05.1 — Inspección y verificación del OCR documental

**Orden:** AG-05.1 · **Fecha:** 2026-10-20 · **Tipo:** inspección y verificación (sin implementación)

> Esta orden no autoriza una implementación amplia ni una integración. En esta
> entrega **no se ha modificado código, reglas, credenciales, variables de
> entorno ni datos**; el único archivo añadido es este informe. **No se ha
> creado PR ni se ha hecho merge.** AG-05 **no** se declara terminado ni listo
> para producción.

---

## 1. SHA de base, rama de trabajo y estado Git

| Elemento | Valor verificado |
|---|---|
| Repositorio | `sarqsan/Gestor-de-inmuebles-vercel` |
| SHA esperado por la orden | `963ed4124a97d56513bdc4255ad9037f3748543c` (merge del PR #59) |
| `HEAD` real al iniciar | `963ed4124a97d56513bdc4255ad9037f3748543c` — **coincide** |
| `main` local | `963ed4124a97d56513bdc4255ad9037f3748543c` — **coincide** |
| `origin/main` tras `git fetch origin` | `963ed4124a97d56513bdc4255ad9037f3748543c` — **coincide** |
| Rama de trabajo | `arena/bf3714d5-gestor-de-inmuebles-vercel` (rama de sesión Arena; reutilizada, sin tocar `main`) |
| Árbol de trabajo al iniciar | Limpio (`nothing to commit, working tree clean`); sin commits sobre `origin/main` |
| Clon | Superficial (`git rev-parse --is-shallow-repository` → `true`); el historial completo y el commit histórico `f782e53…` no están disponibles localmente (afecta a 6 guardas ajenas al OCR, §6) |
| PR #59 (evidencia externa, solo lectura vía `gh`) | `MERGED` el 2026-10-20T18:11:15Z («AG-01 + AG-02…»); último workflow «Emulador de reglas y verificación» sobre su rama: **success** |
| Cambios de esta inspección | Solo `docs/AG-05-1-INSPECCION-OCR.md` (este archivo). Los scripts de reproducción se ejecutaron fuera del repositorio (`/tmp`) y no se han versionado; sus resultados se transcriben en §5–§6 |

La guardia A-04 del repositorio devuelve `BLOCKED` en esta sesión
(`head-en-main` + `origin/<rama-sesión>` ausente, porque la rama parte
exactamente de `main` y aún no se ha publicado). Es el comportamiento esperado
de la guardia en este estado y la causa de los únicos 2 fallos de la suite
completa (§6); no se ha ejecutado ninguna operación destructiva.

---

## 2. Alcance documentado de AG-05 y dependencias con otros bloques

### 2.1 Advertencia de numeración: dos «AG-05» distintos en la documentación

La comprobación del alcance documentado obliga a distinguir dos cosas que
**no son lo mismo**:

1. **El OCR documental ya implementado se llama «P5» en todo el
   repositorio**: plan de capacidades (`docs/PLAN-CAPACIDADES-DECISIONES-2026-10-16.md`
   §4.1 «Escáner IA de facturas → gasto», punto 3), implementación con PR #53 e
   informe `docs/P5-OCR-FACTURAS-CIERRE.md` (2026-10-20). La auditoría global
   lo cataloga como área «9 · OCR de facturas P5 — Completa».
2. **«AG-05» en `docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md:184` es un defecto
   concreto (S2), no el OCR**: «Las facturas adjuntadas por el flujo manual
   (`justificanteUrl`) no cuentan como “con justificante” ni entran en la
   documentación fiscal ni en el índice documental del paquete del asesor»,
   con corrección mínima ya propuesta allí (selector canónico del documento
   del gasto + declarar referencias no custodiadas en P6).

Esta inspección cubre el **OCR documental (P5)** según el objeto de la orden
AG-05.1, y verifica además el defecto documentado como AG-05 porque intersecta
directamente (visibilidad fiscal de los documentos de gasto, incluidos los
creados por OCR). Conclusión previa: **ambos siguen abiertos en lo que les
falta** — el OCR existe pero tiene defectos reproducibles (§5), y el defecto
AG-05 de la auditoría **persiste íntegro** en el SHA inspeccionado (D-06).

Si la numeración «AG-05 = OCR» responde a una renumeración posterior no
reflejada aún en `docs/`, conviene fijarla por escrito en la orden de
implementación para no mezclar los dos alcances.

### 2.2 Alcance que el propio P5 se dio (y lo que dejó fuera)

Según `docs/P5-OCR-FACTURAS-CIERRE.md` y el plan §4.1, el alcance aprobado fue
**únicamente**: foto/PDF de **factura de gasto** → OCR local en navegador →
extracción conservadora por patrones → revisión y corrección manual → alta de
`Gasto` canónico `PENDIENTE` + custodia del original en el expediente P3 del
inmueble. Decisiones expresas de ese alcance:

- Motor **Tesseract.js en el navegador** (sin proveedor, cuenta, clave ni coste
  por documento) en lugar del «escáner IA» del plan, cuyo consumo de IA seguía
  **bloqueado por política**; el flujo **no llama** a `/api/analizar-documento`.
- Sin entidad canónica de proveedor en el flujo de gastos: el proveedor se
  guarda como **texto libre** (no se inventa `proveedorId`).
- Deducibilidad **`false`** y estado **`PENDIENTE`** hasta decisión posterior;
  sin fecha ni movimiento de pago.
- Texto OCR completo **no persistido** (solo vive en el modal).
- Límites: PDF/JPEG/PNG/WEBP, **20 MB**, **5 páginas**; primera ejecución
  descarga motor/modelo `spa` desde CDN pública.

Por tanto **no forman parte del alcance documentado de P5** (aunque la orden
AG-05.1 pide comprobarlos): OCR de recibos de suministros, OCR de
justificantes de cobro (P2), extracción de escrituras/contratos/otros
documentos patrimoniales (P3 custodia sin OCR) y sugerencia automática de
inmueble/categoría (el plan la esbozaba; la implementación exige selección
manual, opción más segura). La extracción sobre **pólizas** y **documentos de
candidatos** existe por una vía distinta (IA Gemini vía
`POST /api/analizar-documento`, `server.ts:289`, con `generateFallbackAnalysis`
de respaldo en `server.ts:473-485`); es un flujo **adyacente, no AG-05/P5**, y
no se audita aquí más allá de constatar la frontera: el OCR P5 nunca lo invoca
ni hereda sus fallbacks.

### 2.3 Dependencias

| Bloque | Relación con el OCR | Estado en este SHA |
|---|---|---|
| **P3 / AG-03.2** (custodia documental) | El binario confirmado se custodia como `documentos_patrimoniales` tipo `FACTURA_GASTO` (Firestore) + objeto en Storage autorizado por el servidor contra la base **con nombre** (`server/documentos/*`) | Integrado: `gestorFirebase.ts` ya usa `custodiaDocumental/almacenServidor`; `storage.rules` deniega todo acceso directo de cliente |
| **AG-04** (respaldo efímero fail-closed) | El flujo OCR nunca usó el almacén efímero; el flujo manual paralelo (`uploadFacturaGasto`) ya es fail-closed | Integrado (`src/lib/firebase.ts:2695-2723`) |
| **Gastos canónicos** (`Gasto`, `normalizarGasto`) | Destino de la confirmación; adaptadores `onSave/onDelete` de `App.tsx` | Presente; **defecto de integración D-01** en la propagación de errores |
| **Fiscalidad (13) y Paquete asesor P6 (12)** | Consumo posterior del gasto + documento | Parcial: **AG-05 de la auditoría sigue abierto (D-06)** |
| **AG-14** (duplicidad de campos `Gasto`) | Origen estructural de AG-05 (`documento` vs `justificanteUrl` vs `fecha` alias) | Sin cambios en este SHA |
| Permisos/carteras (D2/D3) | Autorización del gasto (Firestore) y del binario (servidor) | Reglas presentes (§3.3); sin verificación en producción (V, §6) |

---

## 3. Mapa de archivos, rutas, servicios y flujos OCR

### 3.1 Inventario

| Pieza | Archivo | Función |
|---|---|---|
| Motor OCR local | `src/lib/ocrFactura.ts` | `reconocerDocumentoLocal()` (Tesseract.js `spa` + rasterización PDF con pdf.js), validación `esArchivoOcrAdmitido()`, firma real `detectarMime()`, huella `huellaFacturaOcr()`, parser `extraerCamposFactura()`, clave `claveFacturaOcr()` |
| Flujo de confirmación | `src/lib/flujoFacturaOcr.ts` | `construirGastoOcr()`, `confirmarGastoConFactura()` (gasto → custodia P3 → enlace), `duplicadoFacturaOcr()`, `idGastoOcr()`, `importeDesdeTexto()` |
| UI escáner | `src/components/modals/EscanerFacturaModal.tsx` | Único punto de entrada OCR; selección/captura, progreso, revisión de 10 campos, imputación manual, confirmación |
| Integración en Gastos | `src/components/sections/GastosSection.tsx:382,905` | Botón «Escanear factura»; pasa `scopedGastos/scopedInmuebles` y `handleSaveGasto/handleDeleteGasto` de `src/App.tsx:2973,2988` |
| Tipo persistido | `src/types.ts:1646-1662` | `Gasto.facturaOcr` v1: `sha256Documento`, `claveDeduplicacion`, `procesadoEl`, `confianzaOcr`, `camposReconocidos`, `camposConfirmados`, `documentoId`, desglose fiscal opcional |
| Custodia del original | `src/lib/expedienteDocumental/gestorFirebase.ts:145` `subirDocumentoPatrimonial()` + `gestor.ts` (validación, ID estable, `FACTURA_GASTO`) | Metadatos Firestore `inmuebles/{id}/documentos_patrimoniales/{docId}` + binario vía servidor |
| Binario autorizado en servidor | `src/lib/custodiaDocumental/almacenServidor.ts` → `server/documentos/rutasDocumentos.ts` (`POST /api/documentos/subidas`, `/confirmar`, `/acceso`, `/borrar`) + `server/documentos/autorizacionDocumental.ts` (destino `INMUEBLE_DOCUMENTO_PATRIMONIAL`, estados P3/P5) | Sesión reanudable con nombre/tipo fijados por el servidor; confirmación con tamaño/tipo reales; sin confirmación no hay éxito |
| Recuperación | `DocumentosPatrimonialesPanel.tsx:113`, `FiscalidadSection.tsx:94` (`descargarDocumentoPatrimonial`, verifica SHA-256 antes de entregar) | El gasto guarda `documento.url: ''`; nunca una URL pública |
| Reglas | `firestore.rules:1093` (`documentos_patrimoniales`: forma cerrada, relaciones en el mismo inmueble/titular, estados), `firestore.rules:1533` (`gastos` D2), `storage.rules` (deny-all a credenciales de usuario) | Ver §3.3 |
| Dependencias | `package.json`: `tesseract.js ^7.0.0`, `pdfjs-dist ^6.4.299` (instaladas: 7.0.0 / 6.4.299); `vite.config.ts` emite chunks `ocr-engine` y `pdf-renderer` bajo demanda | Sin variables de entorno ni credenciales OCR (§3.4) |
| Pruebas OCR | `tests/p5-ocr-facturas.test.ts` (11), `src/components/modals/EscanerFacturaModal.test.tsx` (2) | §6 |
| Documentación | `docs/P5-OCR-FACTURAS-CIERRE.md`, `docs/PLAN-CAPACIDADES-DECISIONES-2026-10-16.md` §4.1 | §2 |

**Rutas API OCR: ninguna.** El reconocimiento es 100 % en el navegador; el
servidor solo interviene, ya en la confirmación, autorizando el binario P3
(`/api/documentos/*`, infraestructura AG-03.2 compartida, no específica de OCR).

### 3.2 Flujo verificado (paso a paso)

```
GastosSection [Escanear factura]
  └ EscanerFacturaModal.analizarArchivo()
      ├ esArchivoOcrAdmitido()        → extensión/MIME declarado coherentes, 1 B–20 MB
      ├ reconocerDocumentoLocal()     → firma real (magic bytes) obligatoria
      │     ├ PDF: pdf.js rasteriza (máx. 5 págs., isEvalSupported:false)
      │     └ Tesseract.js 'spa'      → texto + confianza media por página
      │           (worker/core/modelo desde CDN en 1ª ejecución; ver D-07)
      ├ extraerCamposFactura()        → 10 campos con estado RECONOCIDO/DUDOSO/AUSENTE
      │                                 (confianza global <65 ⇒ todo RECONOCIDO pasa a DUDOSO)
      └ huellaFacturaOcr()            → SHA-256 del archivo (WebCrypto)
  REVISIÓN MANUAL (sin persistencia; cancelar no escribe nada)
      ├ campos editables + texto OCR completo consultable (sin vista del original, §4)
      ├ imputación manual obligatoria: inmueble, categoría, aCargoDe
      └ aviso/bloqueo de duplicado sobre los gastos en ámbito (D-05)
  confirmar() → confirmarGastoConFactura()
      1 guardarGasto(Gasto PENDIENTE, deducible:false, origen:'FACTURA', id estable)
      2 subirDocumentoPatrimonial(FACTURA_GASTO, relaciones:{gastoId})   [P3 + AG-03.2]
      3 guardarGasto(gasto + documento/documentos + facturaOcr.documentoId)
      (fallo en 2 ⇒ intenta revertir el gasto; fallo en 3 ⇒ reutilizable por reintento)
```

Garantías que **sí** se verifican en código: el resultado OCR nunca crea por sí
solo un gasto (solo la acción explícita de confirmar escribe); el gasto nace
`PENDIENTE`, sin `fechaPago`, con `deducible:false` y `periodoMesAnio` derivado
de la fecha de emisión confirmada; reconocidos y confirmados se conservan
**por separado**; no hay conversión a Base64/data-URL ni URL pública del
binario; los límites del OCR (formatos/MIME/20 MB) coinciden con los de P3
(`gestor.ts:4-10`) y con la forma exigida por `firestore.rules`.

### 3.3 Seguridad y custodia (verificación del apartado 3B de la orden)

- **Custodia AG-03/AG-04:** el original sigue la vía P3 completa (metadato
  `PENDIENTE_STORAGE` → subida autorizada por el servidor → `DISPONIBLE`;
  errores como incidencia auditada, sin éxito aparente **en esa capa**).
  `storage.rules` ya no consulta Firestore `(default)`: deniega todo a
  credenciales de usuario y la autorización vive en
  `server/documentos/autorizacionDocumental.ts` contra la base con nombre.
- **Permisos/aislamiento:** `actorActual()` exige sesión Firebase;
  `cargarContexto()` exige inmueble existente con titular canónico y que el
  gasto relacionado exista y pertenezca a **ese inmueble y titular**
  (`validarRelacionesDocumento`), replicado en `firestore.rules`
  (`relacionesDocumentoValidas`, `docEscritura()` por cartera/titular).
  La selección en UI usa `scopedInmuebles/scopedGastos` (`App.tsx:717,876`).
  - Matiz: `gastos.create` en reglas no ata `inmuebleId`↔`propietarioId` por sí
    solo; en el flujo OCR lo compensa el paso 2 (P3 rechaza y se revierte),
    pero ver D-01 sobre la fiabilidad de esa reversión.
  - Matiz: `gastos.delete` **no tiene rama de cartera** (solo master o
    propietario titular): un gestor con cartera de escritura puede crear el
    gasto OCR pero **no puede ejecutar la reversión** (D-01).
- **Sin automatismos contables:** confirmado en §3.2; `normalizarGasto`
  además limpia `fechaPago` si el estado es `PENDIENTE`.
- **Relación verificable documento↔datos:** SHA-256 idéntico en
  `facturaOcr.sha256Documento` y en el metadato P3; `storagePath` determinista;
  descarga solo tras verificar integridad (`descargarDocumentoPatrimonial`).
  El acceso desde el propio gasto es, en cambio, incompleto (D-08).
- **Sin sobrescritura silenciosa de definitivos:** el reintento de enlace
  reutiliza el ID estable; pero la protección frente a reprocesar una factura
  ya completa descansa solo en el botón deshabilitado (D-10).

### 3.4 Proveedor/motor OCR real (apartado 3C)

- **Motor:** Tesseract.js 7.0.0 en el navegador, idioma `spa`; pdf.js
  (`pdfjs-dist` 6.4.299) solo rasteriza. No hay OCR de servidor, ni Cloud
  Vision/Document AI, ni llamada a Gemini en este flujo.
- **Configuración:** ninguna variable de entorno ni credencial (verificado en
  `.env.example`, `vercel.json`, `vite.config.ts`). URLs fijadas en código:
  `workerPath`/`corePath` en `cdn.jsdelivr.net/npm/tesseract.js@7.0.0…` y
  `langPath` en `tessdata.projectnaptha.com/4.0.0` (`ocrFactura.ts:106-108`).
  De la CDN solo bajan **código y modelo lingüístico**; el documento y el texto
  se procesan en local **si ese código es íntegro** (riesgo §7).
- **Si el motor no está disponible** (red bloqueada/CDN caída en 1ª ejecución,
  WASM no soportado): `createWorker()` rechaza y el modal muestra el error sin
  persistir nada; pero **no hay tiempo de espera ni cancelación** (D-07).
- En esta inspección **no se ha enviado ningún documento a servicios externos**
  (las reproducciones usan cadenas de texto sintéticas, §5).

---

## 4. Tabla de requisitos

Estados: `IMPLEMENTADO` · `PARCIAL` · `AUSENTE` · `DEFECTUOSO` · `NO VERIFICABLE`.

| # | Requisito (orden §3) | Estado | Evidencia / nota |
|---|---|---|---|
| 1 | OCR de facturas de gasto (PDF/JPEG/PNG/WEBP, captura móvil) | IMPLEMENTADO | §3.2; único documento en alcance P5 |
| 2 | OCR de recibos de suministros | AUSENTE | Fuera del alcance documentado; sin punto de entrada |
| 3 | OCR de justificantes (cobro/pago P2) | AUSENTE | Fuera del alcance documentado |
| 4 | Extracción de otros documentos patrimoniales (escrituras, contratos…) | AUSENTE | P3 custodia sin OCR; pólizas/candidatos van por IA Gemini adyacente (§2.2) |
| 5 | Extracción de campos de la factura (proveedor, NIF, nº, fecha, base, IVA, retenciones, total, concepto) sin calcular unos de otros | DEFECTUOSO | Parser conservador en diseño, pero R1–R6 producen valores erróneos marcados `RECONOCIDO` o pierden el total (D-02…D-04, D-09) |
| 6 | Previsualización para contrastar | PARCIAL | Se muestra el texto OCR completo y los estados por campo; **no** se muestra la imagen/PDF original junto a los campos |
| 7 | Corrección y confirmación manual previas a persistir | IMPLEMENTADO | Cancelar tras el OCR no escribe (probado); reconocidos≠confirmados conservados |
| 8 | Asociación con inmueble | IMPLEMENTADO | Selección manual obligatoria; validada en P3 y reglas |
| 9 | Asociación con titular | IMPLEMENTADO | Derivado del inmueble (`propietarioId` canónico), exigido por P3/reglas |
| 10 | Asociación con proveedor | PARCIAL | Solo nombre fiscal en texto libre; sin `proveedorId` ni catálogo (decisión documentada P5) |
| 11 | Asociación con gasto | IMPLEMENTADO | Crea el `Gasto` canónico `PENDIENTE` (no engancha sobre un gasto previo) |
| 12 | Asociación con expediente | IMPLEMENTADO | Documento P3 `FACTURA_GASTO` con `gastoId`; referencias cruzadas en el gasto |
| 13 | Documentos ilegibles | PARCIAL | Error visible si <8 caracteres útiles; baja confianza degrada estados; pero un texto «legible y mal parseado» puede pasar como `RECONOCIDO` (D-02) |
| 14 | Formatos no admitidos | IMPLEMENTADO | Extensión+MIME declarados y **firma real**; error visible sin leer de más. HEIC/TIFF no admitidos (límite a decidir) |
| 15 | Errores y tiempos de espera | PARCIAL | Errores visibles y fail-closed en custodia; **sin timeout ni cancelación** del OCR/CDN (D-07) |
| 16 | Procedencia y trazabilidad | PARCIAL | `facturaOcr` (versión, SHA, clave, confianza, reconocidos/confirmados), `creadoPor/Id`, auditoría P3 del documento. Se pierde `textoOrigen` por campo al persistir; el texto completo no se persiste (por diseño) |
| 17 | Duplicados | DEFECTUOSO | Solo detecta duplicados **entre gastos OCR** y con clave/ID **global sin inmueble** (D-05) |
| 18 | Custodia vía arquitectura AG-03/AG-04, sin efímeros ni URLs ficticias | IMPLEMENTADO | §3.3 (en la capa documental) |
| 19 | Sin éxitos aparentes | DEFECTUOSO | Los adaptadores reales de guardado/borrado no propagan errores: 2ª escritura y reversión pueden fallar en silencio (D-01) |
| 20 | Permisos, aislamiento de carteras, autorización por documento | IMPLEMENTADO | Reglas Firestore + autorización en servidor por ruta/estado (§3.3), con matices D-01 |
| 21 | El OCR no crea gasto/cobro/pago/movimiento confirmado por sí solo | IMPLEMENTADO | Requiere confirmación; nace `PENDIENTE`, `deducible:false`, sin `fechaPago` |
| 22 | No sobrescribir datos definitivos sin confirmación autorizada | PARCIAL | Edición posterior es el flujo manual autorizado y preserva `facturaOcr`; pero el reproceso de una factura completa solo lo impide el botón (D-10) |
| 23 | Relación verificable documento↔datos extraídos | PARCIAL | SHA-256 y `documentoId` verificables y descarga con integridad; acceso desde listado/detalle del gasto incompleto (D-08) |
| 24 | Motor OCR identificado, configurable sin credenciales nuevas | IMPLEMENTADO | Tesseract.js local, sin env vars; dependencia CDN en 1ª ejecución (D-07) |
| 25 | Visibilidad posterior en fiscalidad y paquete del asesor | PARCIAL | El gasto OCR cuenta «con justificante» y su original entra en P6 vía P3; la rejilla fiscal no ofrece «Ver» y usa fecha inválida; los manuales siguen invisibles (**AG-05 auditoría = D-06**) |
| 26 | Comportamiento en Firebase/producción real (reglas publicadas, cuentas no-master, facturas reales) | NO VERIFICABLE | Sin autorización ni credenciales en esta inspección; emulador solo vía CI (§6) |

---

## 5. Defectos reproducibles

Las reproducciones R1–R13 se ejecutaron con `npx tsx` sobre las funciones
reales del repositorio con textos sintéticos (sin documentos reales). Severidad
orientativa entre paréntesis.

### D-01 (alta) · Éxito aparente parcial y reversión no garantizada: los adaptadores reales tragan los errores

- **Archivo/función:** `src/lib/flujoFacturaOcr.ts:71-98`
  (`confirmarGastoConFactura`, diseñada y **probada solo con dobles que
  lanzan**) frente a sus adaptadores reales:
  `src/App.tsx` `handleSaveGasto/handleDeleteGasto` →
  `src/lib/firebase.ts:1879-1902` (`saveGastoFirestore` devuelve `void` e
  ignora el `{ok:false}` de `saveGastoFirestoreWithResult`;
  `deleteGastoFirestore` captura y solo registra). Agravante en
  `firestore.rules:1533` `gastos.delete`: **sin rama de cartera**, la reversión
  de un gestor es denegada por reglas.
- **Evidencia:** R12 — con un `guardarGasto` de semántica real (resuelve sin
  persistir), `confirmarGastoConFactura` resuelve **éxito** con
  `documentoId` sin que exista escritura. R13 — si la custodia falla y el
  borrado es denegado/tragado, el error mostrado es solo el de Storage; el
  aviso «ni revertir el gasto» de la rama probada en unitario **nunca puede
  saltar** en producción. Además `handleSaveGasto` actualiza el estado local
  antes de persistir: la UI muestra el gasto enlazado hasta la recarga.
- **Consecuencias:** (a) si falla la **segunda** escritura (enlace), el modal
  anuncia «Factura incorporada…» pero en Firestore el gasto queda **sin
  `documento/documentoId`** persistido (el documento P3 sí existe con su
  `gastoId`: recuperable por el reintento, pero el éxito mostrado fue falso);
  (b) si falla la custodia y también la reversión, queda un **gasto huérfano**
  sin documento que reaparece al recargar, sin aviso. La primera escritura sí
  está indirectamente protegida: P3 exige que el gasto exista
  (`cargarContexto`), así que ese caso termina en error visible.
- Incumple en integración la garantía P5 «nunca presenta éxito falso» y el
  requisito 19. **Es el defecto prioritario.**

### D-02 (media) · «Subtotal» se extrae como importe total `RECONOCIDO`

- **Archivo/función:** `src/lib/ocrFactura.ts` `extraerCamposFactura()`,
  patrón `importeTotal` (`…|total` sin frontera de palabra ni exclusión de
  subtotal).
- **Evidencia R1:** `Subtotal: 100,00 € … Total factura: 121,00 €` →
  `importeTotal = "100,00" / RECONOCIDO` (la coincidencia es el `total` de
  «Sub**total**»).
- **Consecuencias:** el campo crítico puede venir **mal y además marcado como
  fiable**; solo lo salva la revisión humana, a la que el estado
  `RECONOCIDO` induce a no mirar. Si pasa, se crea un gasto por importe
  erróneo con `camposConfirmados` coherentes con el error.

### D-03 (media) · La captura de importes atraviesa líneas y casa sin dígitos

- **Archivo/función:** `src/lib/ocrFactura.ts:21-23` `buscarImporte()` /
  patrones `([\d.,\s]+\s*€?)` (`\s` incluye `\n`; no exige ningún dígito).
- **Evidencia R4:** `Base imponible: 100,00\n21% IVA` →
  `baseImponible = "100,0021"` (se traga el `21` de la línea siguiente).
  **R6:** `Total líneas: 80,00 € … Total a pagar: 90,75 €` → la primera
  coincidencia es `"Total "` con grupo `" "` ⇒ `importeTotal = "" / DUDOSO` y
  **nunca se alcanza** el total real (la confirmación queda bloqueada hasta
  teclearlo: fallo seguro, pero extracción inútil en un formato común).
- **Consecuencias:** desglose fiscal corrupto si no se detecta (R4); pérdida
  del total en facturas con «Total líneas/Total parcial» previos (R6).

### D-04 (media) · NIF del proveedor: captura codiciosa y posible NIF del cliente

- **Archivo/función:** `src/lib/ocrFactura.ts` patrón `nifProveedor`
  (`[A-Z0-9][A-Z0-9 .-]{5,18}` tras la primera etiqueta NIF/CIF del texto),
  sin validación de formato ni dígito de control en ningún punto del flujo.
- **Evidencia R2:** `CIF: B12345678 Calle Mayor 3` →
  `nifProveedor = "B12345678CALLEMAY" / RECONOCIDO`. **R5:** con el NIF del
  cliente antes que el del emisor, extrae el **del cliente**
  (`12345678Z`) atribuyéndolo al proveedor.
- **Consecuencias:** corrompe la `claveDeduplicacion` (falsos negativos/
  positivos de duplicado), persiste un dato fiscal erróneo —en R5, el NIF de
  un tercero como si fuera del proveedor— y contamina cualquier explotación
  posterior por emisor.

### D-05 (media) · Deduplicación: ciega ante gastos manuales y global sin inmueble

- **Archivo/función:** `src/lib/flujoFacturaOcr.ts:50-71`
  (`duplicadoFacturaOcr`, `idGastoOcr`); `src/lib/ocrFactura.ts`
  `claveFacturaOcr()` (clave = `factura:{nif}:{número}` normalizados o
  `documento:{sha256}`, **sin inmueble ni titular**); la búsqueda se limita a
  los `scopedGastos` cargados en memoria.
- **Evidencia R9:** un gasto **manual** previo de la misma factura (con
  `justificanteUrl`, sin `facturaOcr`) ⇒ `duplicadoFacturaOcr` devuelve
  `undefined`: el escáner crea un **segundo gasto** por la misma factura.
  **R10:** el mismo NIF+número ya registrado en **otro inmueble** ⇒ se trata
  como duplicado y **bloquea** un alta legítima distinta (y compartiría ID
  `gas_ocr_…`). **R8:** `F-2026/031` y `F2026031` producen la misma clave
  (normalización que borra separadores: colisión entre series distintas).
- **Consecuencias:** duplicidades reales no detectadas entre vías manual/OCR
  (doble gasto deducible potencial) y bloqueos/colisiones entre inmuebles o
  series; la estabilidad del ID evita el segundo documento Firestore en el
  caso ya-OCR, a cambio de poder **sobrescribir** campos del existente vía
  `setDoc(merge)` si el duplicado no estaba en ámbito/cargado (ver D-10).

### D-06 (media) · AG-05 de la auditoría sigue abierto: fiscalidad no ve `justificanteUrl`; el documento OCR entra sin enlace ni fecha

- **Archivo/función:** `src/utils/fiscalEngine.ts:390` (contador «con
  justificante»: solo `documento/documentos`) y `:449 ss.`
  (`recopilarDocumentacionFiscal`: usa `gasto.documento` y `gasto.fecha`
  —alias casi siempre indefinido—, `downloadURL = doc.url`);
  `src/lib/paqueteAsesor/documentos.ts` (solo custodia P3); frente a
  `src/lib/expedienteDocumental/indice.ts:150`, que sí reconoce
  `justificanteUrl`. En UI: `FiscalidadSection.tsx:653` (rejilla) vs `:94`
  (descarga segura P3 por gasto, que sí existe).
- **Evidencia R11:** gasto manual con `justificanteUrl` + gasto OCR con
  `documento{url:''}` ⇒ `gastosConJustificante=1` (solo el OCR),
  `gastosSinJustificante=1` (el manual, **falso**); la documentación fiscal
  contiene solo el OCR con `downloadURL:""`, `url:""` y **sin fecha**
  (ordenación por `Invalid Date`). Es literalmente el defecto AG-05 descrito
  en `docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md:184`, sin cambios en este SHA.
- **Consecuencias:** contadores y expediente informativo incorrectos; el
  asesor no recibe en el ZIP las facturas del flujo manual (sí las filas CSV);
  el binario OCR no es alcanzable desde la rejilla de documentación fiscal
  (solo desde el botón por gasto y desde el expediente del inmueble).

### D-07 (baja-media) · Sin tiempo de espera ni cancelación; motor dependiente de CDN en tiempo de ejecución

- **Archivo/función:** `src/lib/ocrFactura.ts:93-127`
  (`reconocerDocumentoLocal`): `createWorker()` y `worker.recognize()` sin
  plazo ni `AbortSignal`; `worker.terminate()` solo tras completar. En el
  modal no hay limpieza al desmontar: cerrar durante el reconocimiento deja el
  worker trabajando y resolviendo sobre un componente desmontado.
- **Evidencia:** lectura de código (sin `setTimeout`/`AbortController` en el
  flujo; único `setTimeout` es el cierre tras éxito, `EscanerFacturaModal.tsx:154`).
- **Consecuencias:** con CDN lenta/colgada o documento pesado, espera
  indefinida con spinner (el usuario puede cerrar el modal, pero el proceso
  sigue consumiendo); disponibilidad e integridad del OCR dependen de
  `cdn.jsdelivr.net` y `tessdata.projectnaptha.com` en la primera ejecución
  (§7). Los chunks locales `ocr-engine`/`pdf-renderer` no eliminan esa
  dependencia porque worker, core WASM y modelo se piden remotos.

### D-08 (baja) · Acceso al binario OCR desde el gasto y ciclo de vida al borrar

- **Archivo/función:** `src/components/sections/GastosSection.tsx:830` (el
  clip «Factura» solo aparece con `justificanteUrl`); `GastoModal.tsx`
  (sección de factura solo conoce `justificanteUrl/Path`, máx. 12 MB del
  prefijo manual: un gasto OCR se ve **«sin factura»** al editarlo y nada
  impide adjuntarle otra por la vía manual, quedando con dos referencias);
  `src/App.tsx` `handleDeleteGasto` (borrar el gasto no trata el documento
  P3: queda en el expediente con `gastoId` colgante, sin aviso;
  `eliminarDocumentoPatrimonial` solo se invoca desde el panel del inmueble).
- **Consecuencias:** trazabilidad operativa pobre (hay que ir al expediente
  del inmueble o a Fiscalidad para recuperar el original) y retención no
  gobernada del binario tras borrar el gasto (puede ser deseable conservar el
  expediente, pero hoy es **invisible e involuntario**).

### D-09 (baja) · Cobertura de patrones y facturas de abono

- **Archivo/función:** `src/lib/ocrFactura.ts` (patrones `tipoIva`,
  `fechaEmision`) y `EscanerFacturaModal.tsx` `confirmar()` (exige
  `total > 0`); `flujoFacturaOcr.ts` `importeDesdeTexto()`.
- **Evidencia:** R3 — «IVA incluido» antes que «IVA 21%» ⇒ `tipoIva`
  **AUSENTE** (primera coincidencia sin grupo). R4 — formato «21% IVA» no
  reconocido. «F. emisión 01/04/2026» ⇒ fecha AUSENTE. R7 —
  `importeDesdeTexto('-121,00') = -121` ⇒ la confirmación rechaza **abonos/
  rectificativas** (error visible, pero sin vía); `'(121,00)' = 121` ignora
  el signo contable entre paréntesis.
- **Consecuencias:** más corrección manual en formatos habituales; las
  rectificativas quedan fuera del escáner (decisión de producto si deben
  entrar y cómo se modela un gasto negativo).

### D-10 (baja, robustez) · La barrera anti-reproceso vive solo en el botón

- **Archivo/función:** `EscanerFacturaModal.tsx` — el botón se deshabilita
  con `duplicado && !puedeReintentarVinculo`, pero `confirmar()` solo rechaza
  si `repetido.id !== idGastoOcr(clave)`. Para el duplicado **completo** con
  el mismo ID estable, `confirmar()` reconstruiría el gasto (`PENDIENTE`,
  importes del nuevo escaneo, `createdAt` nuevo) y `setDoc(merge)` lo
  **sobrescribiría** (p. ej. un gasto ya `PAGADO` volvería a `PENDIENTE`).
- **Consecuencias:** hoy inalcanzable desde la UI normal (botón), pero la
  invariant no está defendida en la función que escribe; cualquier futuro
  llamante o cambio de UI puede reabrirlo. Corrección barata: revalidar en
  `confirmar()`/`confirmarGastoConFactura`.

Notas positivas verificadas (no defectos): la fecha **no** se contamina con
«Fecha vencimiento:» previa (extrae la de emisión etiquetada); los importes
españoles/anglosajones habituales y la clave estable funcionan (tests P5);
editar un gasto OCR en `GastoModal` **preserva** `facturaOcr/documento`
(spread sobre `gastoParaEditar` + `normalizarGasto`).

---

## 6. Resultados exactos de pruebas y limitaciones del entorno

Entorno: Node 22.22.3, npm 10.9.8, `npm ci` correcto. Sin Java ni
`firebase-tools` locales. Clon superficial (sin `f782e53…`).

### Ejecutadas y aprobadas

| Comprobación | Comando | Resultado |
|---|---|---|
| Focal OCR P5 | `npx vitest run tests/p5-ocr-facturas.test.ts src/components/modals/EscanerFacturaModal.test.tsx` | **13/13** (11 + 2) en 2 archivos |
| Custodia/gasto adyacentes | `npx vitest run tests/gestor-documental-patrimonial-firebase.test.ts tests/custodia-documental-fail-closed.test.ts tests/custodia-topologia-firestore-storage.test.ts tests/integracion-custodia-documental-extremo-a-extremo.test.ts src/components/modals/GastoModal.test.tsx` | **85/85** en 5 archivos |
| TypeScript | `npm run lint` (`tsc --noEmit`) | **0 errores** |
| Build | `npm run build` | **Correcto**; chunks `ocr-engine` y `pdf-renderer` separados y bajo demanda (aviso preexistente de chunk principal ≈5,53 MB) |
| Reproducciones ad hoc R1–R13 | `npx tsx` sobre funciones reales (scripts fuera del repo) | Resultados en §5 (son evidencia de defecto, no tests del repo) |

### Ejecutadas con fallos (preexistentes/ambientales, ajenos al OCR)

| Comprobación | Resultado exacto | Causa |
|---|---|---|
| Suite Vitest completa `npx vitest run` | 273 archivos, **4.895 tests: 4.884 aprobados, 2 fallidos, 2 omitidos, 7 todo** (266,7 s) | Los 2 fallos son `tests/guardia-a04-rama-sesion.test.ts`: la guardia devuelve `BLOCKED` (HEAD==`main` en rama de sesión sin publicar + `origin/<rama>` ausente). Es el mismo archivo que CI y el cierre P5 **excluyen expresamente** |
| `npm run test:operaciones` | **299/302** (3 fallos) | Guardas de custodia frente al checkout histórico `f782e53…`, **ausente en el clon superficial** (documentado ya en el cierre P5) |
| `npm run test:patrimonial` | **85/88** (3 fallos) | Ídem (mismas guardas `f782e53…`) |
| `npm audit --omit=dev` | **7 vulnerabilidades (1 baja, 6 altas)** | Preexistentes (p. ej. `nodemailer`, `source-map-js`); la salida no atribuye hallazgos a `tesseract.js`/`pdfjs-dist`. No se ha ejecutado `audit fix` |

### No ejecutadas / no verificables en esta inspección

- **Emulador de reglas** (`npm run test:emulador:reglas`, incl.
  `tests/emulador/documentos-p3*.ts`): no ejecutado localmente (sin Java).
  Existe workflow de CI (`emulador-reglas.yml`: `tsc` + suite sin la guardia
  + build + emulador) y su última ejecución sobre la rama del PR #59 fue
  **success** (evidencia de GitHub en solo lectura); no sustituye una
  ejecución sobre cambios futuros.
- **OCR real en navegador** (WASM de Tesseract, canvas de pdf.js, descarga
  CDN, captura móvil): los tests **simulan** `reconocerDocumentoLocal`;
  `reconocerDocumentoLocal/detectarMime/renderizarPaginasPdf` carecen de
  tests propios. Sin facturas reales (esta orden lo prohíbe) su precisión
  real es `NO VERIFICABLE`.
- **Firebase real / producción / despliegue / reglas publicadas / cuentas
  no-master / Vercel con cuenta de servicio:** no tocados (prohibidos por la
  orden). Toda la autorización se ha verificado por **lectura de código y
  reglas del repositorio**, no contra el proyecto real.
- **Huecos de cobertura detectados:** timeout/CDN caída, firma inválida y
  >5 páginas de extremo a extremo, WEBP real, duplicado manual↔OCR y entre
  inmuebles, semántica de adaptadores que no lanzan (D-01), visibilidad
  fiscal del gasto OCR y del manual (D-06), preservación de `facturaOcr` al
  editar (verificada por lectura, sin test), abonos (D-09).

---

## 7. Riesgos de seguridad, custodia, privacidad y persistencia

| Riesgo | Valoración |
|---|---|
| **Cadena de suministro CDN** (worker/core/modelo desde `jsdelivr`/`projectnaptha` en tiempo de ejecución, sin SRI ni autoalojamiento) | El argumento de privacidad «el documento no sale del navegador» depende de la **integridad del código descargado**: un worker comprometido vería las imágenes de las facturas. Versiones fijadas en URL (7.0.0 / tessdata 4.0.0) reducen deriva, no el riesgo de origen. Mitigación natural: autoalojar worker/core/lang o servir desde el propio despliegue (decisión §8) |
| **Persistencia** (D-01) | El riesgo principal: escrituras/borrados del gasto con error tragado ⇒ estado fantasma en UI, enlaces no persistidos y huérfanos. La capa P3, en cambio, es fail-closed y auditada |
| **Privacidad de datos extraídos** | Favorable por diseño: procesado local, texto completo no persistido, binario sin URL pública. Residual: `camposReconocidos` persisten y pueden contener un NIF de tercero mal atribuido (D-04/R5); nombre de archivo original conservado en metadatos P3 |
| **Aislamiento de carteras** | Reglas + servidor autorizan por inmueble/titular en cada operación documental. Residual: `gastos.create` sin atar inmueble↔titular (compensado en el flujo OCR por P3) y deduplicación solo sobre lo cargado en ámbito (D-05) |
| **Retención/ciclo de vida** | Borrar el gasto no borra ni marca el original P3 (D-08): retención indefinida no visible; a la inversa, eliminar el documento desde el panel deja el gasto apuntando a un `documentoId` eliminado (la descarga lo trata como no disponible de forma segura) |
| **Disponibilidad operativa** | Primera ejecución exige red hacia dos CDN de terceros; 5 páginas y 20 MB por documento; HEIC (formato habitual de fotos iPhone) rechazado; PDFs digitales se rasterizan y se OCR-izan ignorando su capa de texto (peor precisión/coste que extraerla) |
| **Integridad probatoria** | SHA-256 detecta alteraciones del binario custodiado; **no** es firma ni prueba de procedencia externa de la factura, y el parser no certifica importe ni deducibilidad (declarado en P5 y en la UI) |
| **Superficie adyacente (no AG-05)** | `/api/analizar-documento` (candidatos/pólizas) mantiene un **fallback sintético** ante saturación de Gemini (`server.ts:473-485`). No afecta al OCR P5 ni se corrige aquí; se anota solo como frontera para que nadie lo confunda con la vía OCR |

No se han encontrado en el flujo OCR: respaldos efímeros, URLs ficticias,
Base64 de custodia, envío del documento al servidor de la aplicación ni a
proveedores de IA, ni creación automática de pagos/cobros/movimientos.
Quedan **excluidas** como manda la orden la integración bancaria automática,
PSD2 y los pagos iniciados desde la aplicación (no se han inspeccionado).

---

## 8. Propuesta de corrección mínima (para una orden posterior)

Sin ejecutar en esta inspección. Ordenada por prioridad; cada punto con su
verificación esperable.

### Corrección mínima (sin decisiones de producto)

1. **D-01 — Errores reales en el flujo OCR.** Hacer que la confirmación use
   adaptadores que **lancen o devuelvan resultado comprobado** (existe
   `saveGastoFirestoreWithResult`): `confirmarGastoConFactura` debe comprobar
   `ok` en ambas escrituras; la reversión debe verificar el borrado y, si no
   es posible (p. ej. gestor sin `gastos.delete`), **marcar/avisarse** de
   forma explícita en vez de asumirla. Añadir tests con la **semántica real**
   de los adaptadores. *(Si se decide dar `delete` de cartera en reglas, es
   cambio de reglas + despliegue: requiere orden y autorización separadas.)*
   Incluir D-10 (revalidar duplicado completo dentro de `confirmar()`).
2. **D-02/D-03/D-04/D-09 — Endurecer el parser** con las reproducciones
   R1–R6 como tests de regresión: frontera de palabra y exclusión de
   «subtotal»; importes en la **misma línea** exigiendo al menos un dígito;
   NIF con patrón estricto español (letra + 7 dígitos + control / DNI) y
   preferencia por la etiqueta de **emisor** cuando haya varios; buscar
   `tipoIva` en todas las ocurrencias y en formato «21% IVA». Mantener la
   filosofía conservadora: ante duda, `DUDOSO`, nunca `RECONOCIDO`.
3. **D-06 (= AG-05 documentado) — Selector canónico del documento del
   gasto**, tal como ya propuso la auditoría: que `calcularGastosEjercicio`
   y `recopilarDocumentacionFiscal` reconozcan `documento/documentos` **y**
   `justificanteUrl/Path`, fecha desde `fechaDevengo||fechaPago||fecha`, y
   que la rejilla fiscal recupere el binario P3 por `documento.id` (ya existe
   `descargarJustificanteGasto`) en lugar de un `href` vacío; en P6 declarar
   las referencias fuera de P3 como «no custodiadas» en el índice. Tests
   unitarios con gasto manual y con gasto OCR (R11 como regresión).
4. **D-05 — Acotar la deduplicación por inmueble.** Incluir `inmuebleId` (y
   por derivación el titular) en la clave/ID o, como mínimo, en la
   comparación; y cruzar aviso (no necesariamente bloqueo) con gastos
   manuales del mismo inmueble e importe/concepto cuando no haya huella
   comparable. Tests R8–R10.
5. **D-07 (parte local) — Plazo y cancelación del OCR:** timeout configurable
   para `createWorker/recognize`, `terminate()` al cancelar/cerrar, y mensaje
   específico de «motor no disponible» diferenciable del error de lectura.
6. **D-08 (parte local) — Alcanzabilidad del original:** indicador y descarga
   P3 desde el listado/detalle del gasto cuando exista `documento?.id`
   (patrón ya presente en Fiscalidad), y aviso en `GastoModal` de que el
   gasto ya tiene factura custodiada en el expediente.

### Requieren decisión de producto (separados; no incluidos arriba)

- Facturas **rectificativas/abonos** (importes negativos) en el escáner y su
  modelo en `Gasto`/fiscalidad.
- **HEIC/TIFF**, más de 5 páginas, multi-idioma OCR y lectura de la **capa de
  texto** de PDFs digitales antes de rasterizar.
- **Autoalojar** worker/core/modelo de Tesseract vs seguir en CDN (coste de
  despliegue/caché frente a integridad/disponibilidad).
- **Proveedor canónico** y correspondencia con catálogo/profesionales;
  sugerencia automática de inmueble/categoría; **aviso** (no cálculo) de
  incoherencia base+IVA≠total.
- Extender OCR a **recibos, justificantes u otros documentos**; mostrar la
  **vista del original** junto a los campos en el modal.
- **Ciclo de vida** al borrar un gasto con documento P3 (conservar en
  expediente con aviso, desvincular o eliminar con el gasto) y política de
  retención.
- Cualquier motor **IA/externo** de pago o con envío de documentos (coste,
  credenciales, privacidad): expresamente fuera de esta inspección.

---

## 9. Dictamen final

## `LISTO PARA IMPLEMENTACIÓN`

Entendido **exclusivamente** como: la inspección está completa y existe una
corrección mínima acotada (§8.1), priorizada y verificable localmente, que puede
encargarse en una **orden posterior** sin bloqueos externos previos.

Precisiones inseparables del dictamen:

- El OCR de facturas (P5) **existe y su arquitectura es sólida** (local,
  revisión manual obligatoria, custodia P3/AG-03.2 fail-closed, sin
  automatismos de pago), pero **no está terminado**: arrastra el defecto
  prioritario D-01, defectos de extracción/deduplicación D-02…D-05 y el
  AG-05 documentado en la auditoría (D-06).
- **No** se declara AG-05/OCR listo para producción. La validación con
  Firebase real, cuentas no-master, facturas reales en navegador/móvil y el
  emulador de reglas sobre los cambios futuros siguen pendientes y requerirán
  la autorización que esta orden no concede.
- En esta entrega no hay cambios de código, ni PR, ni merge, ni despliegue:
  solo este informe en la rama `arena/bf3714d5-gestor-de-inmuebles-vercel`
  sobre la base `963ed4124a97d56513bdc4255ad9037f3748543c`, a la espera de la
  orden de implementación.
