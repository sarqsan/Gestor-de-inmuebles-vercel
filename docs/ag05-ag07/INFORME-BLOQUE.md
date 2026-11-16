# Bloque AG-05 + AG-07 — Coherencia entre módulos

**Rama:** `arena/e0e96073-gestor-de-inmuebles-vercel`
**Base:** `main` @ `09c71d6` (P1 fusionado y desplegado)
**Commit:** `63837e9`
**Estado:** PR abierta. **No fusionada, no desplegada.**

---

## 1. Bloque seleccionado y por qué

La orden fija este orden de prioridad: AG-03/AG-04 → AG-01/AG-02 → **coherencia entre
módulos** → seguridad. Antes de elegir, **contrasté el estado real en `main`** en lugar de
fiarme de la lista de octubre:

| Omisión | Estado real en `main` | Evidencia |
|---|---|---|
| **AG-03** | ✅ **Resuelto** | `storage.rules` ya no consulta Firestore (0 referencias a `/databases/`); la custodia es mediada por servidor (AG-03.2/AG-03.3) |
| **AG-04** | ✅ **Resuelto** | `/api/upload-document` devuelve **410**; almacén temporal retirado |
| **AG-01** | ✅ **Resuelto** | El alta pública la escribe el servidor por token (`crearSolicitudPublicaPorToken`); ya no hay alta anónima en reglas |
| **AG-02** | ✅ **Resuelto** | Portales por token de capacidad; las suscripciones anónimas se retiraron |

`docs/AUDITORIA-FUNCIONAL-PORTALES-2026-10-27.md` ya lo declaraba: *«AG-01/AG-02/AG-03/AG-04
cerrados en código»*. **No he reabierto nada de eso.**

Siguiendo el orden, el siguiente elemento **realmente pendiente** era la coherencia entre
módulos: **AG-05** y **AG-07**, ambos verificados como defectos vivos.

---

## 2. Funcionalidades implementadas

### AG-05 · El justificante del gasto tenía dos vías y cada módulo miraba una

Un gasto puede llevar su factura en **dos sitios** según cómo se dio de alta:

- `documento` / `documentos[]` — custodia documental P3.
- `justificanteUrl` / `justificantePath` — alta manual y flujo OCR.

**Fiscalidad solo miraba la primera.** Consecuencias reales:

1. Un gasto con factura adjuntada a mano se contaba como **«sin justificante»**.
2. Ese gasto **no entraba en el paquete del asesor** (sí su fila CSV, pero no el documento) y nadie lo decía.
3. `recopilarDocumentacionFiscal` usaba `gasto.fecha`, **un campo que no existe en el modelo** → `Invalid Date` y orden arbitrario.

**Solución:** un **selector canónico único** en `gastosEngine`, sin duplicar el modelo:

- `justificanteDeGasto(g)` — vista normalizada; precedencia custodia > manual, de modo que un gasto con ambas vías **no se cuenta dos veces**.
- `gastoTieneJustificante(g)` — predicado para contadores.
- `fechaCanonicaGasto(g)` — `fechaDevengo` → `fechaPago` → primer día de `periodoMesAnio`.

Consumidores conectados:

- `fiscalEngine`: contadores (`gastosConJustificante`) y documentación fiscal.
- Orden de la documentación a prueba de fechas no parseables (ya no propaga `NaN`).
- `paqueteAsesor`: los justificantes **no custodiados** se **declaran** en `avisos` con recuento e ids, en lugar de desaparecer en silencio.

### AG-07 · El titular no podía dar de alta profesionales privados

La regla exige `creadoPorPropietarioId == myPropId()` (**titularidad**). El modal enviaba
`currentUser.id` (**id de usuario de la colección `usuarios`**). Nunca coinciden →
`permission-denied` sistemático y función inoperativa para el titular.

**Solución:** se envía `currentUser.propietarioId`, conservando el valor previo al editar
para no reasignar el ámbito por accidente.

---

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/utils/gastosEngine.ts` | **+ selector canónico** (`justificanteDeGasto`, `gastoTieneJustificante`, `fechaCanonicaGasto`). |
| `src/utils/fiscalEngine.ts` | Contadores y documentación usan el selector; fecha real; orden robusto. |
| `src/lib/paqueteAsesor/documentos.ts` | Campo opcional `gastos` + aviso de justificantes no custodiados. |
| `src/components/modals/CrearProfesionalModal.tsx` | `currentUser.propietarioId` en lugar de `.id`. |
| `src/utils/fiscalEngine.test.ts` | Corregido: usaba `fecha` (campo inexistente). |
| `src/features/coherencia/ag05JustificanteGasto.test.ts` | **nuevo** — 21 pruebas. |
| `src/features/coherencia/ag07ProfesionalPrivado.test.ts` | **nuevo** — 7 pruebas. |

**Sin cambios en:** `firestore.rules`, `storage.rules`, `src/types.ts`, migraciones o datos.

---

## 4. Pruebas y resultados

| Suite | Resultado |
|---|---|
| Nuevas (`src/features/coherencia/`) | **28/28** |
| Suite completa | **327 archivos / 5.438 pruebas / 0 fallos** |
| `test:operaciones` | 300 / 0 |
| `test:patrimonial` | 88 / 0 |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** (28 s) |

### Dos regresiones propias, detectadas y corregidas

1. **`fiscalEngine.test.ts`** afirmaba un orden que dependía de `fecha`, un campo que el
   modelo no tiene. El helper lo ignoraba y la prueba pasaba por casualidad. Corregida a
   `fechaDevengo`, que es la fecha real.
2. **`operacionGastoEngine.test.ts`**: mi primera versión del selector exigía `url` o
   `storagePath` para dar por válido un documento. Hay flujos que referencian el documento
   sin URL resoluble, así que eso **endurecía** el criterio anterior y reintroducía el mismo
   error de AG-05 en sentido contrario. Corregido: la **presencia** del documento basta.

Ninguna de las dos se resolvió tocando el producto para contentar a la prueba; en el primer
caso la prueba estaba mal, en el segundo el producto.

---

## 5. Incidencias y dependencias pendientes

| # | Pendiente | Detalle |
|---|---|---|
| 1 | **AG-06** (renta → cobros) | Verificado: `servicioActualizacionRenta` **no toca** `importePrevisto`. Los recibos futuros ya materializados conservan el importe anterior. Requiere decisión de alcance sobre periodos PENDIENTE. |
| 2 | **AG-08** (`passwordHash`) | `authService` sigue escribiendo `passwordHash` (5 referencias) con SHA-256 sin sal. Exige limpieza de datos con autorización → **fuera de alcance**. |
| 3 | **AG-09** (candidatos en caché) | Pendiente de verificación específica; no abordado en este bloque. |
| 4 | Verificación en emulador de las reglas de `profesionales` | Mi prueba de AG-07 replica el criterio de la regla en el núcleo puro; **no** se ha ejecutado contra el emulador. El job de emuladores ya corre en CI y no toca `profesionales` más de lo que ya cubre. |

---

## 6. Commits

```
63837e9  AG-05 y AG-07: coherencia del justificante del gasto y alta de profesional privado
```

**No fusionar ni desplegar:** esta rama no tiene autorización de despliegue.
