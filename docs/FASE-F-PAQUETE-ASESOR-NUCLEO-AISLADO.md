# FASE F — PAQUETE CONTABLE DEL ASESOR · NÚCLEO AISLADO (arena paralela, sin merge)

> **Origen:** orden de abrir una segunda arena independiente mientras la arena
> principal integra P1–P4. **Base verificada:** `main` =
> `f782e53ed3beefa4cdcae4e839457480f9cfd995` (2026-10-17, merge PR #43).
> **Rama de esta arena:** `arena/7c4060e7-gestor-de-inmuebles-vercel` (parte de
> ese mismo SHA; árbol limpio al arrancar). **Arena principal detectada:**
> `arena/d2bfa306-gestor-de-inmuebles-vercel` @ `13c0159…` (6 commits por
> delante de `main`, 107 ficheros). Este trabajo **no modifica ningún fichero
> preexistente de `main`** (solo los creados por esta propia fase) y por
> tanto ningún fichero de esos 107.
>
> **Qué es este documento:** trazabilidad requisito → código → prueba →
> resultado de lo implementado, qué queda pendiente y cómo integrarlo.
> **Qué NO es:** ni cierre de la Fase F completa (falta la UI de descarga y
> los binarios documentales, §5), ni una orden de merge.

## 1. Selección y correspondencia «P» (sin inventar)

- En `main` **no existe** ningún documento que nombre fases «P5–P7». Lo que
  sí existe es el plan `PLAN-CAPACIDADES-DECISIONES-2026-10-16.md` (§5) con
  Fases **A–H**. Los commits de la arena principal etiquetan P1 (avisos
  fail-closed), P2 (justificantes), P3 (conciliación) y P4 (renta), que
  coinciden funcionalmente con las Fases **A–D**.
- Por esa correspondencia funcional (declarada, **no** nombre canónico),
  E≈«P5», F≈«P6», G≈«P7». El código se nombra sin «P» (`paqueteAsesor`).
- Evaluación de independencia (evidencia: `git diff main..arena/d2bfa306`):
  - **E (escáner IA): RECHAZADA.** La arena principal reescribe `server/ia/*`,
    `src/ia/*` y `PanelGobiernoIA`; el consumo IA sigue bloqueado por política.
  - **G (solvencia/seguros): RECHAZADA.** Toca candidatos/morosidad/
    notificaciones que la principal está modificando (incl. borrado del
    modal WhatsApp y `DEC-01`); depende además de los avisos de P1 (no en `main`).
  - **F (paquete del asesor): SELECCIONADA.** Dif principal sobre
    `importExport|expedienteFiscal|expedienteDocumental|ImportExportPanel`:
    **ningún fichero**. Es puro, sin servicios externos, con puerta de salida
    objetivable (ZIP cuadrable) y sin PSD2/banco (importación manual intacta).

## 2. Alcance implementado (solo ficheros nuevos)

| Fichero | Contenido |
|---|---|
| `src/lib/paqueteAsesor/tipos.ts` | Contrato v1 (`erp-paquete-asesor-v1`), ámbito, libro, totales, manifest. Límites declarados en cabecera |
| `src/lib/paqueteAsesor/motor.ts` | Motor puro: ámbito fail-closed, filtros (ejercicio y mensual), libro, cuadre, CSV, ZIP con hashes |
| `src/lib/paqueteAsesor/verificador.ts` | Verificador INDEPENDIENTE del ZIP (CRC/SHA-256, conteos, totales y cuadre recalculados; no importa el motor) |
| `src/lib/paqueteAsesor/paqueteAsesor.test.ts` | 30 pruebas (fixtures sintéticas) |
| `src/lib/paqueteAsesor/verificador.test.ts` | 12 pruebas (manipulación de bytes/manifiesto y cuadre) |
| `src/lib/paqueteAsesor/auditoriaAdversarial.test.ts` | 20 pruebas adversariales (ZIP a nivel de bytes, paquetes refirmados, cruces de propietario, duplicados, fechas/importes y minimización) |
| `docs/FASE-F-PAQUETE-ASESOR-NUCLEO-AISLADO.md` | Este informe |

Reutilización sin tocar lo existente: `analizarDeducibilidad`
(`src/utils/deducibilidadEngine.ts`, fuente única), `COLUMNAS_CSV`
(exportador canónico, para GASTO/COBRO), `crearZip` (expediente B6),
`sha256Hex` isomórfico y `jsonEstable` (migración). API:

- `validarAmbitoPaquete(solicitud, autorizado, catalogoInmuebles)`
- `generarPaqueteAsesor(entrada, solicitud, autorizado, { generatedAt, generatedBy? })`
- `empaquetarPaqueteAsesor(paquete)` → `{ zip, sha256Zip, entradas[] }`
- `contratoVigenteEnEjercicios(contrato, ejercicios)` ·
  `contratoVigenteEnMeses(contrato, meses)` · `esMesValido` · `ultimoDiaDeMes`
  · `libroACsv` · `filasACsv`
- `verificarPaqueteAsesorZip(zip, { paqueteIdEsperado? })` →
  `{ ok, paqueteId, schema, numEntradasZip, problemas[] }` (nunca muta)
- `leerEntradasZipPaqueteAsesor(zip)` (lector ZIP STORE exportado)

Contrato de entrada/salida (continuación 2026-10-18):

- **Entrada:** `EntradaPaqueteAsesor` (registros ya leídos por el llamante
  con sus Rules) + `SolicitudPaqueteAsesor` (propietarios obligatorios según
  ámbito, ejercicios y/o meses opcionales) + `AmbitoAutorizado` +
  `generatedAt` explícito. El núcleo no lee, no pide red ni consulta reloj.
- **Filtro mensual:** `meses: ['2024-01']` (`YYYY-MM` estricto, sin
  duplicados; intersección con `ejercicios`: un mes fuera de los ejercicios
  solicitados deniega, no vacía en silencio). Mes contable: cobro =
  `periodoMesAnio` válido (si contradice `anio`+`mes` se excluye e
  identifica) o derivado de `anio`+`mes`; gasto = `periodoMesAnio` válido o
  mes de su fecha; factura = de `fechaExpedicion` (nunca del solo ejercicio);
  liquidación = `periodo` o `anio`+`mes`; contratos/pólizas = solape del
  intervalo [primer día, último día] del mes. Sin mes acreditable con filtro
  activo ⇒ excluido con incidencia identificadora.
- **Salida:** `PaqueteAsesorGenerado` (manifiesto con ámbito efectivo incl.
  `mesesEfectivos`, totales globales/por ejercicio/por mes, verificaciones,
  libro, filas proyectadas e incidencias) y ZIP determinista de 12 entradas
  con SHA-256 por entrada. Paquetes anteriores sin `mesesEfectivos`:
  el verificador los trata como `null` con advertencia heredada.
- **Verificación:** `verificarPaqueteAsesorZip` parsea el ZIP (EOCD y sus
  discos/contadores, banderas, directorio central y cabeceras locales con
  ambos tamaños, nombres relativos seguros, CRC-32 y cobertura sin huecos),
  contrasta los SHA-256 del manifiesto y RECÁLCULA en céntimos desde los CSV:
  cabeceras/aridad, conteos, totales (global/porEjercicio/porMes), ámbito
  manifiesto↔informe↔CSV y correspondencia línea↔fuente (fecha real, importe
  e inmueble), no solo la suma. Los JSON manipulados producen errores
  nombrados, nunca excepciones. Exige incidencia identificadora para cada
  discrepancia detectable: duplicados, desglose de factura que no suma el
  total y referencias documentales. Un importe con subcéntimo se declara no
  verificable desde un CSV de céntimos. No repara ni reconstruye: reporta
  errores y advertencias.

## 3. Trazabilidad PLAN §5-F → código → prueba

| Entregable del plan | Implementación | Prueba (nombre) |
|---|---|---|
| Multi-entidad en un solo ZIP | `empaquetarPaqueteAsesor` (12 entradas) | «entradas esperadas…» |
| Entidades FACTURA / LIQUIDACIÓN (+PÓLIZA) | `COLUMNAS_FACTURA/LIQUIDACION/POLIZA_PAQUETE` + filtros | «solo incluye el ámbito p1/2024», «factura sin ejercicio deriva…» |
| Filtro temporal en contratos | `contratoVigenteEnEjercicios` (solape, bordes, sin fecha ⇒ fuera) | «vigencia por solape», «solo incluye…» (c2 fuera) |
| Selección por meses concretos (continuación) | `meses` `YYYY-MM` + `contratoVigenteEnMeses` + mes contable por entidad | «valida formato…», «filtro 2024-01…», «solo mensual 2025-01…», «periodo contradictorio…» |
| Libro de ingresos y gastos (fecha, concepto, inmueble, contraparte, base, IVA, total, categoría, deducibilidad) | `LineaLibroAsesor` + `libroACsv` | «incluye cobro recibido…», «deducibilidad…», «base/IVA solo…», «ordenado por fecha» |
| Índice con hashes + informe | `manifest.json` (hash por entrada, excluyéndose) + `informe.txt` | «índice declara el hash de cada entrada» |
| Puerta: «ZIP que el asesor pueda cuadrar» | `verificaciones[]` (5 cuadres) + `totales.json` | «cuadre: verificaciones en verde…» |
| Verificación por tercero (continuación) | `verificarPaqueteAsesorZip` (sin importar `motor.ts`) | `verificador.test.ts`: 12 casos incl. byte manipulado, manifiesto inflado, línea eliminada, entradas ausentes, ZIP truncado |
| Discrepancias identificadas (continuación) | duplicados exactos/conflictivos, desglose que no suma, vínculos cruzados, documentos sin binario | «duplicados: exacto computa una vez…», «factura cuyo desglose no suma…», «toda referencia documental…» |
| Auditoría adversarial (2026-10-18) | ZIP/manifiesto/CSV refirmados, cuadre línea↔fuente, aislamiento propietario↔inmueble, ids/duplicados, importes extremos y determinismo con duplicados | `auditoriaAdversarial.test.ts`: 20 casos; antes de corregir, la batería original de 19 dio 18 fallidos/1 superado (solo vectores CRC/SHA) |

Reglas honradas (con su prueba):

- **Sin doble conteo:** facturas y liquidaciones viajan en `datos/*.csv`,
  nunca como línea adicional del libro («sin doble contabilidad»).
- **Sin inventar IVA:** base/IVA/retención solo si `gasto.facturaId` resuelve
  a una factura del paquete; resto `SIN_DESGLOSE_EN_ORIGEN`. Discrepancia
  gasto↔factura ⇒ incidencia, sin corregir («base/IVA solo…»).
- **Impagado/anulado no es ingreso** (criterio B6); sin fecha ⇒ incidencia
  `CRITICA` y fuera del cuadre («incluye cobro recibido…»).
- **Minimización:** sin IBAN (ni el del arrendador ni el de abono de la
  liquidación), sin DNI/teléfono/email; NIF solo en factura
  («minimización: el ZIP no contiene…»). También en el paquete
  estructurado: `filas.cobros` se proyecta a las columnas del CSV y no
  retiene el registro completo del cobro.
- **Determinismo:** entrada barajada + mismo `generatedAt` ⇒ mismo ZIP y
  mismo `paqueteId`; `generatedAt` distinto ⇒ mismo contenido, ZIP distinto
  («ZIP reproducible»).
- **Fail-closed:** fuera de ámbito / master sin explicitar / sin
  `generatedAt` ⇒ denegado («ámbito fail-closed», 4 pruebas). La auditoría
  añadió: ids de propietario vacíos denegados, master no puede pedir un
  inmueble cuyos titulares acreditados no intersectan los propietarios, y
  toda referencia propietario↔inmueble incompatible (contrato, gasto,
  factura, liquidación o póliza) se excluye e identifica sin arrastrar
  direcciones de otro propietario.
- **Ids y duplicados no movimiento:** una entidad sin id no entra como fila
  referenciable; los duplicados de inmueble/contrato/factura/liquidación/
  póliza quedan identificados. La réplica «exacta» de cobro/gasto solo lo es
  si coinciden también contraparte, deducibilidad, proveedor y documento
  (campos que alimentan CSV/libro); si no, el id es conflictivo.
- **Fechas e importes extremos:** un devengo imposible no bloquea una
  `fechaPago` válida; los importes deben ser finitos, no negativos y seguros
  en céntimos. El subcéntimo no se redondea en origen, pero se identifica y
  el verificador no presenta ese cuadre como acreditado.
- **Duplicados de movimientos:** `datos/*.csv` conserva todas las filas; en
  el libro, la réplica exacta del mismo id computa una vez y el id con datos
  distintos no computa ninguna copia. Posibles duplicados de negocio (mismo
  contrato+periodo, mismo origen+concepto+importe) se conservan señalados.
- **Discrepancias fiscales:** la factura cuyo `base+IVA−retención` no iguala
  su total (fórmula del propio ERP) queda identificada y su desglose no
  alimenta el libro; igual con factura ajena al propietario/inmueble del
  gasto, vínculo cruzado, duplicada, ANULADA o BORRADOR. Sin corregir importes.
- **Referencia ≠ disponibilidad:** cada línea con `documentoNombre` lleva su
  incidencia `DOCUMENTO_SIN_BINARIO_VERIFICABLE`; el paquete no incluye ni
  verifica binarios y la referencia no prueba que el original exista.
- **Frontera:** sin Firebase/red/reloj/aleatorio (guardia sobre el código).
  El verificador no importa el motor (guardia específica en su test).

## 4. Criterios de aceptación

**Cumplidos (con prueba ejecutada):** paquete multi-entidad en un ZIP;
FACTURA/LIQUIDACIÓN/PÓLIZA exportables dentro del paquete; contratos por
vigencia; libro por fecha con base/IVA honesto y deducibilidad de la fuente
única; índice SHA-256; cuadre libro==fuentes computables; aislamiento entre
propietarios (p2 nunca aparece con ámbito p1); determinismo byte a byte;
**filtro mensual `YYYY-MM`** con intersección fail-closed y totales por mes;
**verificador independiente** que recalcula conteos/totales/cuadre desde los
bytes del ZIP y exige incidencia para duplicados, desgloses incoherentes y
referencias documentales; **auditoría adversarial** con paquetes refirmados
y manipulaciones a nivel de bytes (la batería se ejecutó antes de corregir:
18 fallos reproducibles sobre 19 casos).

**Pendientes (no parte de esta entrega; no se finge su cierre):**

1. **UI de descarga** en `ImportExportPanel` (botón «Paquete del asesor» que
   lea las fuentes ya cargadas + facturas/liquidaciones/pólizas y llame a
   `generarPaqueteAsesor`+`empaquetarPaqueteAsesor`+`descargarBytes`).
   Deliberadamente fuera: tocar UI compartida en paralelo es justo el riesgo
   que esta arena evita.
2. **Binarios documentales** (PDF de justificantes/facturas) dentro del ZIP:
   exige resolver de Storage autorizado (patrón `resolverBinarios` de B6).
   Hoy viajan referencias por nombre y la advertencia correspondiente.
3. **Promoción a exportador v2** (que `ejecutarExportacion` admita
   FACTURA/LIQUIDACIÓN como entidades sueltas): decisión de contrato para la
   integración; este núcleo no modifica v1. Incluye revisar el desajuste
   preexistente `COLUMNAS_CSV.CONTRATO` (`fechaInicio`/`fechaFin` ≠ modelo
   `fechaInicioContrato`/`fechaFinContrato`), que aquí se evita pero no se toca.
4. **Mapeo a programa contable** (A3/Holded/Odoo) y formato Excel del libro:
   decisión §7.5 del plan, sin respuesta registrada; no se inventa.
5. ~~**Meses concretos** (`YYYY-MM`)~~ **RESUELTO en la continuación
   2026-10-18** (filtro mensual + totales por mes + verificador; ver §2).
   Quedan fuera: rangos «de mes X a mes Y» como azúcar sintáctico (salen
   solos de enumerar la lista) y la selección por parte de mes.
6. **Alias `fecha` de gasto no serializado en `datos/gastos.csv`**
   (contrato CSV v1): si la línea del libro de un gasto solo depende de ese
   alias, el verificador SÍ contrasta su importe e inmueble contra la fuente,
   pero no puede re-derivar la fecha; solo esa fecha se declara como
   advertencia (`GASTO_ALIAS_FECHA_NO_SERIALIZADO`). Resolverlo toca el
   contrato v1: trabajo de integración, no de este núcleo.
7. **`paqueteId` no recomputable desde el ZIP** (huella del contenido
   tipado): el verificador lo contrasta por formato/informe/esperado y lo
   declara como advertencia; nunca finge re-derivarlo.

## 5. Integración posterior (cuando la principal cierre P1–P4)

1. Leer este fichero y `tipos.ts` (límites). Actualizar la rama de integración
   y ejecutar: `npx vitest run src/lib/paqueteAsesor/`,
   `npx tsc --noEmit` y la suite completa. Conflicto textual esperado con
   P1–P4: **ninguno** (siete ficheros de esta fase, cero preexistentes
   editados). Conflicto semántico a revisar: si P3 (conciliación) cambia
   tipos de `CobroPeriodo`/`Gasto`, recompilarán estos tests y lo dirán.
2. Cablear la UI (punto 1 de pendientes) reutilizando las `fuentes` del panel
   y un lector de facturas/liquidaciones/pólizas acotado por ámbito; registrar
   el `sha256Zip` devuelto como evidencia de la exportación. Tras descargar,
   la propia app puede ejecutar `verificarPaqueteAsesorZip(zip)` como
   auto-check (es puro y sin motor) y mostrar sus problemas; el asesor
   puede ejecutarlo fuera para auditar el paquete recibido.
3. Decidir binarios (resolver Storage) y exportador v2 **antes** de anunciar
   «paquete completo con documentos» a ningún asesor.
4. No mergear este núcleo sobre un `main` distinto de `f782e53…` sin
   re-verificar el punto 1.

## 6. Resultados de pruebas de esta entrega

Registrados en el informe de cierre de esta arena, con órdenes exactas:
suite focal del paquete, suites relacionadas (exportador canónico,
expediente fiscal, deducibilidad, auditoría import/export, xlsx), `tsc`,
suite completa y build sobre el SHA final de la rama. Ninguna escritura en
Firestore/Storage/producción; ninguna llamada externa; fixtures sintéticas.

Auditoría adversarial 2026-10-18 (desde `78bb9f6…`): línea base focal
42/42; batería adversarial original antes de corregir 18 fallidos/1 superado
(solo los vectores conocidos CRC-32/SHA-256); tras las correcciones, la
batería —ampliada con una regresión de periodo contable frente a fecha de
pago— y el foco completo quedan registrados en el informe de cierre con sus
totales exactos. Riesgo residual declarado, sin corregir por contrato: la
inyección de fórmulas al abrir un CSV en una hoja de cálculo depende del
consumidor; este núcleo no altera valores de origen con prefijos.
