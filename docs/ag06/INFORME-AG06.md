# AG-06 — Sincronización de la actualización de renta con los recibos futuros

**Rama:** `arena/e0e96073-gestor-de-inmuebles-vercel`
**Base:** `main` @ `09c71d6`
**Estado:** PR abierta. **No fusionada, no desplegada.**

---

## 1. El defecto, verificado

`generarPeriodosParaContrato` (`cobrosEngine.ts`) hace dos cosas distintas:

- Si el periodo **ya existe → lo conserva intacto**.
- Si no existe → lo crea con `importePrevisto = contrato.rentaMensual`.

Y `servicioActualizacionRenta` **no mencionaba `registroCobros` ni una sola vez**.
Como el motor materializa hasta el mes actual + 2, al confirmar una subida los recibos
de los próximos meses seguían con el importe anterior: el propietario veía recibos de
900 € para meses en los que el contrato ya decía 950 €, y esos importes alimentan
avisos de impago y saldos de morosidad.

---

## 2. Funcionamiento implementado

### Regla económica

Un recibo se actualiza **solo** si cumple las cuatro condiciones:

| Condición | Por qué |
|---|---|
| `estado === 'PENDIENTE'` | Cualquier otro estado significa que ya ha habido un hecho económico |
| `importeRecibido === 0` | Si algo se cobró, el recibo ya no es una previsión |
| Periodo **no iniciado** (inicio del mes > fecha efectiva) | Un periodo ya empezado no se reabre, aunque siga pendiente |
| Pertenece al contrato actualizado | Los recibos viven en `contrato.registroCobros` |

**Nunca se toca:** `RECIBIDO`, `PAGADO`, `PAGADO_PARCIAL` (parciales), `RETRASADO`,
`RECLAMADO`, `ANULADO`, `IMPAGADO`, `INCIDENCIA`, `VERIFICADO`, `DEVUELTO`, ni ningún
recibo anterior a la fecha efectiva.

La decisión sobre `RETRASADO` y periodos iniciados es deliberada: **es una deuda ya
reclamada al inquilino**. Cambiarle el importe automáticamente alteraría lo que se le
está pidiendo. Si hay que ajustarla, se hace a mano y con su propia traza.

### Fecha efectiva

`fechaEfectividadDesdeComunicacion` fija la efectividad al **día 1 del mes siguiente**
a la comunicación. La subida aplica al **primer periodo mensual pendiente cuya fecha de
inicio sea posterior a esa fecha efectiva**. El mes de la propia fecha efectiva queda
fuera: su periodo ya está iniciado.

### Trazabilidad

Por cada recibo modificado, una entrada en su propio `historialCambios` con:
contrato (vía el recibo), recibo y periodo, importe anterior, importe nuevo, fecha
efectiva, fecha de modificación, motivo (`ACTUALIZACION_RENTA_IMPORTE_PREVISTO`) y
usuario que confirma.

Además, **una entrada en `audit_logs`** con el esquema `AuditLog` que ya usa el
repositorio: acción `ACTUALIZACION_RENTA_IMPORTES_PREVISTOS`, entidad `contrato`, y en
`detalles` el anexo, la fecha efectiva, las rentas y la lista de recibos actualizados
**y omitidos con su motivo**. No se ha creado ninguna colección ni esquema de auditoría
paralelo.

### Integridad

- **Atomicidad sin trabajo extra:** los recibos viven **dentro del documento del
  contrato**, así que la escritura entra en el **mismo commit** que ya existía,
  protegida por la misma precondición de versión (`VERSION: updateTime`). O se aplican
  renta y recibos, o no se aplica nada. No hay ventana intermedia.
- **Idempotencia:** el id de auditoría y el de cada entrada de historial derivan de la
  clave de idempotencia. Un reintento devuelve `REPETIDA` sin escribir nada.
- **Sin efectos colaterales:** si no hay recibos que actualizar, **no se escribe**
  `registroCobros` (la actualización se comporta exactamente como antes).
- **Sin tocar reglas ni permisos:** el servicio escribe con cuenta de servicio.

---

## 3. Archivos

| Archivo | Cambio |
|---|---|
| `src/utils/sincronizacionRentaCobros.ts` | **nuevo** — motor puro: criterio, sincronización y documento de auditoría |
| `src/utils/sincronizacionRentaCobros.test.ts` | **nuevo** — 24 pruebas |
| `server/actualizacionRenta/servicioActualizacionRenta.ts` | sincronización dentro del commit atómico + `registroCobros` + `audit_logs` |
| `server/actualizacionRenta/servicioActualizacionRenta.ag06.test.ts` | **nuevo** — 10 pruebas de integración |
| `tests/ia-fase1-integracion-server.test.ts` | añadido el módulo nuevo a la lista de compilación del arranque ESM |

**Sin cambios en:** `firestore.rules`, `storage.rules`, `src/types.ts` (el historial ya
tenía `importeAnterior`/`importeNuevo`), migraciones ni datos.

---

## 4. Pruebas

| Suite | Resultado |
|---|---|
| Motor (`sincronizacionRentaCobros.test.ts`) | **24/24** |
| Integración del commit (`...ag06.test.ts`) | **10/10** |
| Suite completa | **329 archivos / 5.472 pruebas / 0 fallos** |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** (23,7 s) |
| `test:operaciones` / `test:patrimonial` | 300/0 · 88/0 |

### Cobertura de los diez escenarios exigidos

| # | Escenario | Dónde |
|---|---|---|
| 1 | Actualización de recibos futuros pendientes | motor + integración |
| 2 | Conservación de cobrados | motor + integración |
| 3 | Conservación de parciales | motor + integración |
| 4 | Conservación de retrasados | motor + integración |
| 5 | Conservación de históricos | motor |
| 6 | Fecha efectiva correcta | motor + integración |
| 7 | Varios periodos futuros | motor + integración |
| 8 | Reintento sin duplicar cambios ni auditorías | motor + integración |
| 9 | Aislamiento entre contratos | motor + integración |
| 10 | Conservación del historial económico | motor + integración |

Extra: la precondición de versión se prueba forzando una escritura concurrente entre
`previsualizar` y `confirmar` — **no se escribe ni la renta ni los recibos**.

### Una regresión que provoqué y corregí

`tests/ia-fase1-integracion-server.test.ts` compila una **lista explícita** de módulos y
los arranca como ESM nativo, igual que Vercel. Mi módulo nuevo no estaba en la lista y el
arranque falló con `Cannot find module`. Lo añadí.

Merece la pena señalarlo: **esta prueba es la que garantiza que el import nuevo no
rompe el arranque en producción**, no el `tsc` ni el `build` de Vite. Si hubiera ignorado
el fallo por ser «solo un test», el despliegue habría fallado.

---

## 5. Límites respetados

- **No fusionada, no desplegada.**
- Sin cambios en reglas de Firebase, permisos, migraciones ni datos.
- Sin escrituras reales: todas las pruebas usan Firestore en memoria.
- No se altera la generación de recibos históricos.
- Los bloques cerrados (P0, P1, AG-05, AG-07) quedan intactos: la regresión lo confirma.

## 6. Pendiente heredado

- **AG-08** (`passwordHash` con SHA-256 sin sal): exige limpieza de datos con autorización.
- **AG-09**: pendiente de verificación específica.
- El **despliegue** de la PR #87 y de esta requieren autorización expresa.
