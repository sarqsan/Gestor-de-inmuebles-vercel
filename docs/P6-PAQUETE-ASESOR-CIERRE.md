# P6 — Paquete del asesor (informativo y documental)

Fecha: 2026-10-20

SHA inicial verificado de `main` y de la rama de trabajo: `b4306547fa50109162328c525b0b7bc0a5f0d2e2`

Rama: `arena/adef1be7-gestor-de-inmuebles-vercel`

## Qué es y qué no es

Es un **expediente informativo y documental** para el asesor: un ZIP con el libro de
ingresos y gastos, las proyecciones de las fuentes canónicas, los totales, las
incidencias, los avisos/limitaciones, el índice de documentos originales custodiados
y, cuando se solicitan, los binarios verificados.

No es una declaración tributaria, no presenta modelos, no se conecta a la AEAT ni a
bancos, no inicia pagos (PSD2), no crea criterios de deducibilidad y no convierte un
justificante de pago en un movimiento contable.

## Inspección de partida

El núcleo de la Fase F (`src/lib/paqueteAsesor/{tipos,motor,verificador}.ts`) ya estaba
integrado en `main` (PR #53). Se reutiliza sin reescribirlo:

- `crearZip`/`utf8Bytes` de `expedienteFiscal` (STORE, CRC-32, rutas ASCII, orden
  determinista, fecha DOS fija) y el patrón de binarios de `empaquetarExpediente`.
- Custodia documental P2/P3: `inmuebles/{id}/documentos_patrimoniales`, SHA-256
  registrado, `estado` de custodia y `storagePath`; las Rules siguen siendo la
  autorización efectiva.
- Lectores acotados existentes: `cargarFuentesCatalogo` (propietarios, inmuebles,
  contratos/cobros, gastos), `subscribePolizas`, `subscribeLiquidaciones`,
  `subscribeTitularidadesEscopo` y `subscribeDocumentosPatrimoniales`.
- `ambitoAutorizadoDesdeUsuario` (master / carteras / titular propio) y
  `analizarDeducibilidad` como única fuente del criterio de deducibilidad.
- Verificador independiente (no importa el motor): estructura ZIP/CRC, manifiesto,
  hashes, cuadre, ámbito, banderas de honestidad e informe.

No existían: selección por intervalo de fechas, índice documental ni binarios en el
paquete, titularidades registradas, resumen estructurado, cobertura fiscal
informativa, adaptador de lectura ni flujo de interfaz. Eso es lo que añade P6.

## Implementación

### Núcleo puro (`src/lib/paqueteAsesor/`)

- **`tipos.ts`** — contrato aditivo y retrocompatible: `RangoFechasPaquete`,
  `solicitud.rangoFechas`, `incluirDocumentos`, `tiposDocumento`,
  `incluirResumenEstructurado`, índice documental (`DocumentoIndicePaquete` con
  estados `PENDIENTE_BINARIO | INCLUIDO | NO_DISPONIBLE | SIN_HASH | NO_ACCESIBLE |
  INTEGRIDAD_DUDOSA`), fallos de binario, fichas de inmueble, cobertura fiscal y
  `resumen.json`.
- **`documentos.ts`** — selección e índice: aislamiento por inmueble/propietario,
  filtro temporal (fecha documental o vínculo con un registro incluido), filtro de
  tipos, deduplicación por id, detección de conflictos, rutas ZIP seguras y
  deterministas (`documentos/<inmueble>/<tipo>/<sha8>_<nombre>`), estados honestos y
  resolución de binarios con lector inyectado (20 MB/documento y 100 MB totales).
- **`motor.ts`** — validación del rango (formato real, `desde <= hasta`, sin
  contradicción con ejercicios/meses), filtros por fecha en contratos, cobros, gastos,
  facturas, liquidaciones y pólizas; índice documental; titularidades registradas
  (porcentaje tal cual, `null` = PENDIENTE, nunca 50/50); cobertura fiscal
  informativa; fichas de inmueble; `resumen.json`; `conteos.titularidades/documentos`;
  `informe.txt` con rango y sección de documentos; `paqueteId` ampliado **solo cuando
  hay contenido nuevo** (los paquetes anteriores conservan su identidad).
- **`verificador.ts`** — acepta y valida las entradas opcionales (`resumen.json`,
  `documentos.json`, `documentos/...`), contrasta cada binario con la huella
  registrada y con `manifest.hashes`, verifica conteos, rutas seguras, coherencia del
  índice con el ZIP (sin binarios huérfanos ni declarados ausentes), ámbito de los
  documentos y de las titularidades, porcentajes 0..100/PENDIENTE, y el ámbito
  temporal del rango (libro, facturas, gastos, cobros, liquidaciones, contratos,
  pólizas y documentos con fecha). El conjunto de entradas sigue siendo cerrado:
  cualquier entrada no declarada es un error.
- **`adaptador.ts`** — orquestación pura: carga de fuentes con puerto inyectable,
  vista previa sin leer binarios, resolución + empaquetado con lector inyectado. Una
  fuente o un documento no legible se **declara** y no bloquea el paquete.

### Adaptador Firebase (`src/lib/paqueteAsesorFirebase.ts`)

Única pieza con I/O y **de solo lectura**:

- Consultas con `DataAccessScope`; facturas y liquidaciones solo se piden cuando el
  perfil puede listarlas (titular o master); para el resto se declara la limitación.
- Metadatos P3 por inmueble (lotes de 5, tope de 120 inmuebles declarado).
- Binarios con `getBytes` y la sesión del usuario: sin URLs públicas, sin Base64, sin
  data-URLs y sin escrituras (no se usa `descargarDocumentoPatrimonial`, que muta
  estados y audita al fallar).
- Carga diferida desde la interfaz: el chunk del adaptador no entra en el arranque.

### Interfaz (Datos → Importación / Exportación canónica)

Tercera pestaña **«Paquete del asesor»**, en la ubicación existente (no hay sección
paralela):

1. Ámbito: toda la cartera autorizada o un inmueble concreto; periodo por ejercicio,
   rango de fechas o sin filtro; incluir documentos originales.
2. **Revisar alcance**: genera el paquete tipado sin leer binarios y muestra
   inmuebles/propietarios/periodo, conteos, incidencias, avisos de disponibilidad y
   limitaciones.
3. **Generar y descargar**: resuelve los originales autorizados, empaqueta, se
   autoverifica con el verificador independiente y solo entonces descarga el ZIP.
   Distingue «Paquete completo para el alcance solicitado» de «Paquete CON
   advertencias» y lista los documentos no incluidos.

### Formato del ZIP

Entradas base (12): `manifest.json`, `informe.txt`, `libro-ingresos-gastos.csv`,
`totales.json`, `incidencias.json` y `datos/{inmuebles,contratos,cobros,gastos,
facturas,liquidaciones,polizas}.csv`.

Aditivas, solo cuando aplican:

- `resumen.json` — ámbito, conteos, totales, cobertura fiscal, fichas de inmueble,
  titularidades registradas, índice documental y limitaciones.
- `documentos.json` — índice de documentos con estado, motivo, relaciones y rutas.
- `documentos/...` — binarios originales **solo** si Storage los autoriza y su
  SHA-256 coincide con el registrado.

`manifest.json` declara `hashes` de todas las entradas (salvo de sí mismo),
`incluyeBinariosDocumentales` (calculado, no fijo), `numDocumentosIncluidos`,
`numDocumentosNoIncluidos`, `rangoFechasEfectivo`, `formatoOficialAEAT: false` y
`escrituras: 0`. El ZIP se escribe sin compresión y de forma determinista.

## Seguridad y trazabilidad

- La autorización efectiva son las Rules; la interfaz solo acota y el motor vuelve a
  validar el ámbito (no se confía en el filtro de UI).
- No se modifican `firestore.rules` ni `storage.rules`; no se añaden servicios,
  credenciales ni dependencias.
- Sin IBAN, DNI de inquilino, teléfonos ni correos; los NIF de factura se conservan por
  ser el dato fiscal que el asesor necesita.
- Cada fila del libro referencia `fuenteTipo`/`fuenteId`; cada documento declara sus
  relaciones y su huella; `sha256Zip` identifica el artefacto entregado.
- `paqueteId` identifica el contenido tipado (no los resultados de acceso a Storage);
  los estados definitivos de los binarios quedan en el manifiesto y en
  `documentos.json`, y el ZIP se verifica antes de descargarse.
- La generación no escribe en Firestore ni Storage (no hay auditoría nueva); la
  trazabilidad se apoya en hashes y en el manifiesto descargado.

## Verificaciones ejecutadas

- `npm run lint` (`tsc --noEmit`): correcto.
- Focal P6: `npx vitest run src/lib/paqueteAsesor tests/paquete-asesor-panel.test.tsx`
  → **6 archivos / 89 pruebas aprobadas** (núcleo 62 heredadas + 17 P6 + 7 adaptador +
  3 interfaz).
- Suite completa: `npx vitest run` → **261 archivos aprobados de 261 y 4.665 pruebas
  aprobadas, 2 omitidas y 7 todo; 0 fallidas**. En el primer intento, antes del
  commit/push, falló `tests/guardia-a04-rama-sesion.test.ts` porque la guardia A-04
  exige HEAD distinto de `main` y la rama ya publicada; tras commit y push pasa
  (4/4) y la suite completa queda en verde.
- `npm run build`: correcto; el adaptador Firebase queda en un chunk de carga
  diferida.
- `git diff --check`: correcto.
- No se ejecutaron pruebas contra Firebase/Storage reales, emuladores, servicios
  externos ni producción; no se hicieron escrituras, exportaciones ni despliegues.

## Límites y pruebas pendientes

- No hay endpoint de exportación en servidor: este repositorio genera el paquete en el
  cliente con lecturas autorizadas y valida en el núcleo compartido; las Rules son la
  barrera de servidor. Añadir un endpoint sería un cambio de arquitectura y no se ha
  hecho.
- No se ha probado con una cartera real en Firebase (solo fixtures deterministas y el
  panel con el adaptador simulado). Queda pendiente una prueba manual autenticada en
  entorno de staging, sin datos de producción.
- Los metadatos documentales se consultan como máximo para 120 inmuebles por paquete;
  por encima se declara la limitación.
- `paqueteId` no se re-deriva desde el ZIP (limitación declarada por el verificador);
  se contrasta el formato, el informe y, si se aporta, el id esperado.
- Se mantienen los fallos históricos no relacionados con P6; el único observado en la
  suite es la guardia A-04 en estado previo al commit/push.
