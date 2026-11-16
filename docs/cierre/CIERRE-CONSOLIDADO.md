# Cierre consolidado — PR #87 · AG-05 + AG-07 + AG-06

**Rama:** `arena/e0e96073-gestor-de-inmuebles-vercel` → `main`
**Base:** `main` @ `09c71d6`
**Alcance:** los tres bloques de coherencia posteriores a P1. **Una sola PR, sin ramas paralelas.**

| Bloque | Prioridad | Qué corrige |
|---|---|---|
| **AG-05** | 4 | El justificante del gasto tenía dos vías y cada módulo miraba una |
| **AG-07** | 5 | El titular no podía dar de alta profesionales privados |
| **AG-06** | 4 | La actualización de renta no llegaba a los recibos ya materializados |

---

## 1. Contenido de la PR

**15 ficheros · +1946 / −24.** Verificado que **no hay nada fuera** de AG-05, AG-07, AG-06,
sus pruebas y su documentación.

### AG-05 · Justificante del gasto (dos vías, un selector)

Un gasto puede llevar su factura en `documento(s)` (custodia P3) o en
`justificanteUrl`/`justificantePath` (alta manual/OCR). Fiscalidad solo miraba la primera:

1. Un gasto con factura adjuntada a mano se contaba como **«sin justificante»**.
2. **No entraba en el paquete del asesor**, y nadie lo decía.
3. `recopilarDocumentacionFiscal` usaba `gasto.fecha`, **campo inexistente** → `Invalid Date`.

Selector canónico único en `gastosEngine` (`justificanteDeGasto`, `gastoTieneJustificante`,
`fechaCanonicaGasto`), con precedencia custodia > manual para no contar dos veces. Conectado
en fiscalidad y en el paquete del asesor, que ahora **declara** los justificantes no
custodiados en lugar de omitirlos.

### AG-07 · Alta de profesional privado

La regla exige `creadoPorPropietarioId == myPropId()` (**titularidad**); el modal enviaba
`currentUser.id` (**id de usuario**). Nunca coinciden → `permission-denied` sistemático.
Corregido a `currentUser.propietarioId`, conservando el ámbito previo al editar.

### AG-06 · Renta → recibos futuros

`generarPeriodosParaContrato` conservaba intactos los periodos ya materializados y el
servicio de renta **no mencionaba `registroCobros`**. Como se materializa hasta el mes
actual + 2, los recibos de los próximos meses seguían con el importe anterior.

Un recibo se actualiza **solo** si es `PENDIENTE`, con `importeRecibido = 0`, de periodo
**no iniciado** y del contrato actualizado. Nunca se toca un recibo cobrado, parcial,
retrasado, reclamado, anulado o histórico: **un `RETRASADO` es una deuda ya reclamada**.

Los recibos viven **dentro del documento del contrato**, así que la escritura entra en el
mismo commit atómico con la precondición de versión existente: **o se aplican renta y
recibos, o no se aplica nada**. Traza por recibo en `historialCambios` y una entrada en
`audit_logs` con el esquema `AuditLog` ya existente — sin auditoría paralela. Idempotencia
por clave: un reintento no duplica ni cambios ni auditoría.

---

## 2. Validación

| Comprobación | Resultado |
|---|---|
| Pruebas AG-05 + AG-07 (`src/features/coherencia/`) | **28/28** |
| Pruebas AG-06 (motor 24 + integración 10) | **34/34** |
| Regresión completa | **329 archivos / 5.472 pruebas / 0 fallos** |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** |
| `test:operaciones` / `test:patrimonial` | 300/0 · 88/0 |

### Fallos históricos de P0

Exactamente **los cuatro**, con nombre y número idénticos:

```
1. P0-A · enlaces_registro (10 supuestos) 6. el propietario A no lee el documento del propietario B
2. P0-A · enlaces_registro (10 supuestos) 8. un profesional no lee lo que no está en su ámbito
3. P0-A · enlaces_registro (10 supuestos) 9. un inquilino no lee lo que le corresponde
4. P0-A · audit_logs (10 supuestos) 7. el propietario A no puede escribir en nombre de B
```

**Ninguno nuevo.** Es un hecho conocido y aceptado desde P0; no se oculta ni se modifica.

### Dos regresiones propias, detectadas y corregidas

1. **`fiscalEngine.test.ts`** afirmaba un orden que dependía de `fecha`, campo que el modelo
   no tiene; pasaba por casualidad. Corregido a `fechaDevengo`, la fecha real.
2. **`tests/ia-fase1-integracion-server.test.ts`** compila una **lista explícita** de módulos
   y los arranca como ESM nativo, como Vercel. Mi módulo de AG-06 no estaba y el arranque
   falló. Añadido. **Esta prueba es la que garantiza que el import nuevo no rompe el
   arranque en producción**; ni `tsc` ni el `build` de Vite lo detectan.

---

## 3. Límites respetados

- **Sin cambios** en `firestore.rules`, `storage.rules`, `src/types.ts`, migraciones ni datos.
- Sin escrituras en producción durante las pruebas (Firestore en memoria).
- No se altera la generación de recibos históricos.
- Bloques cerrados (P0, P1) intactos; la regresión lo confirma.
- **Una sola PR**, sin rama paralela para AG-06.

## 4. Incidencias heredadas (no bloquean)

- **AG-08** (`passwordHash` SHA-256 sin sal): exige limpieza de datos con autorización.
- **AG-09**: pendiente de verificación específica.

---

## 5. Fusión y despliegue

| Dato | Valor |
|---|---|
| **PR** | #87 — **MERGED** |
| **SHA del merge** | `7784414754a692e4ae22f944240daed51d4d3bd6` |
| **Padres del merge** | `09c71d6` (main previo) + `8879e61` (rama) — merge normal, historial conservado |
| **Despliegue** | `7818229062` · Production · **success** |
| **URL del despliegue** | `https://gestor-de-inmuebles-vercel-7x2tbx9l4-sarqsan2-4111s-projects.vercel.app` |
| **Producción** | `https://Gestor-de-inmuebles-vercel.vercel.app` |
| **Verificación de producción** | Run `43825212531` sobre `7784414` — **success** |

Comprobaciones de producción (solo lectura): `HTTP 200` (esquema 1 y capacidades
legibles), `HTTP 413` (rechazado antes de parsear), `HTTP 401` (no se generó ningún OTP),
`HTTP 410` (ruta retirada como debe).

**Los tres bloques están integrados en producción.**
