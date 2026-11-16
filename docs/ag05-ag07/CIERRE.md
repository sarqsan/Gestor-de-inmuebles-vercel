# Cierre del bloque AG-05 / AG-07 — PR #87

**PR:** #87 · `arena/e0e96073-gestor-de-inmuebles-vercel` → `main`
**Commits:** `63837e9` (código y pruebas) · `23a5d7b` (documentación)
**Estado:** **ABIERTA · MERGEABLE · no fusionada · no desplegada**

---

## 1. Revisión final

| Comprobación | Resultado |
|---|---|
| PR #87 abierta | ✅ `OPEN`, sin borrador, base `main` |
| Commits `63837e9` y `23a5d7b` | ✅ Ambos incluidos; la PR tiene exactamente esos dos |
| Alcance del diff | ✅ **8 ficheros, +681 / −23**: solo AG-05, AG-07, sus pruebas y documentación |
| Ficheros fuera de alcance | ✅ **Ninguno** |
| CI del último commit (`23a5d7b`) | ✅ Ejecución `43815523930` con `head_sha = 23a5d7b…` (no una anterior) |
| Fallos de P0 | ✅ **Los mismos 4**, con idéntico nombre ynúmero |
| Regresiones nuevas | ✅ **Ninguna** |

### Las 23 líneas eliminadas, una a una

No hay nada oculto: son **siete reemplazos exactos** de código que AG-05/AG-07 sustituyen.

| Línea eliminada | Sustituida por |
|---|---|
| `creadoPorPropietarioId: … currentUser.id` | `currentUser.propietarioId` (AG-07) |
| 3 × `gasto({ …, fecha: … })` en una prueba | `fechaDevengo` (campo real del modelo) |
| `import … from './gastosEngine'` | Import ampliado con el selector canónico |
| `if (g.documento \|\| (g.documentos && …))` | `if (justificanteDeGasto(g))` |
| Bloque `const doc = …; if (doc) { docs.push({…}) }` | Bloque con selector + `fechaCanonicaGasto` |
| `sort((a,b) => new Date(b.fecha)… )` | Orden a prueba de fechas no parseables |

### CI: los cuatro históricos, sin cambios

```
1. P0-A · enlaces_registro (10 supuestos) 6. el propietario A no lee el documento del propietario B
2. P0-A · enlaces_registro (10 supuestos) 8. un profesional no lee lo que no está en su ámbito
3. P0-A · enlaces_registro (10 supuestos) 9. un inquilino no lee lo que no le corresponde
4. P0-A · audit_logs (10 supuestos) 7. el propietario A no puede escribir en nombre de B
```

**Ni uno más, ni uno menos.** Las 12 «no correctas» de `documentos-p3` son las omisiones
explícitas ya documentadas (P3 supersedia), no fallos.

---

## 2. Criterios de aceptación

| Criterio | Verificación | Estado |
|---|---|---|
| Justificantes manuales y custodiados reconocidos | `justificanteDeGasto` cubre ambas vías, con precedencia custodia > manual (un gasto con las dos **no se cuenta dos veces**) | ✅ |
| Fechas canónicas, sin `Invalid Date` | Ya **no se lee `gasto.fecha`** (campo inexistente). Se usa `fechaCanonicaGasto`: `fechaDevengo` → `fechaPago` → `periodoMesAnio-01` | ✅ |
| Paquete del asesor sin omisiones silenciosas | Los justificantes no custodiados se **declaran** en `avisos` con recuento e ids, en lugar de desaparecer | ✅ |
| Alta y edición de profesionales coherentes con `propietarioId` | Se envía `currentUser.propietarioId`; al editar se conserva el ámbito previo | ✅ |
| Regresión completa satisfactoria | **327 archivos / 5.438 pruebas / 0 fallos** · `tsc` 0 · `build` OK · operaciones 300/0 · patrimonial 88/0 | ✅ |

**Nota de honestidad sobre la verificación:** dos de mis comprobaciones por `grep` dieron
cuenta distinta de cero (`gasto.fecha`, `currentUser.id`). Verifiqué una por una: **las dos
son comentarios que documentan el defecto**, no código activo. Lo digo porque una
comprobación que se lee mal es exactamente cómo se cuela un falso verde.

---

## 3. Estado de la PR

**Preparada para fusión.** `MERGEABLE`, sin conflictos, CI de tipos/suite/build en verde.

**No fusionada y no desplegada**, según el límite de esta orden. El despliegue de Vercel que
existe para esta rama es un **Preview** de PR, no producción: la rama no es `main`.

---

## 4. AG-06 — comportamiento propuesto (NO implementado)

### El defecto, verificado en el código

`generarPeriodosParaContrato` (`cobrosEngine.ts`) hace esto:

- **Si el periodo ya existe → lo conserva intacto.**
- **Si no existe → lo crea con `importePrevisto = contrato.rentaMensual`.**

Y el servicio de actualización de renta (`servicioActualizacionRenta.ts`) **no menciona
`registroCobros` ni `importePrevisto` ni una sola vez** (0 referencias, verificado).

**Consecuencia:** al confirmar una subida de renta, los recibos **ya materializados** —y el
motor materializa hasta **mes actual + 2**— conservan el importe antiguo. El propietario ve
recibos a 900 € para meses en los que el contrato ya dice 950 €. Afecta a recibos,
recordatorios y saldos de morosidad.

### Comportamiento propuesto

Al confirmar la actualización de renta, **recalcular `importePrevisto`** de los periodos que
cumplan **las tres condiciones**:

1. `estado` es **`PENDIENTE`** (no `RETRASADO`, no `PARCIAL`, no `RECIBIDO`, no `INCIDENCIA`).
2. `periodoMesAnio` **≥** el mes de la fecha efectiva de la subida.
3. `importeRecibido` es **0** (no se ha cobrado nada).

Cada recálculo **añade una entrada en `historialCambios`** del periodo con el importe
anterior, el nuevo, la fecha, el usuario y el motivo (`ACTUALIZACION_RENTA`). El historial no
se sobrescribe: se amplía.

### Consecuencias, explícitas

| Situación | Qué pasa | Por qué |
|---|---|---|
| Recibo **futuro PENDIENTE** del mes efectivo o posterior | **Sí** se actualiza | Es el caso que la orden describe |
| Recibo **ya cobrado** (`RECIBIDO`, cualquier importe) | **No** se toca | Recalcular un cobro real falsearía la contabilidad |
| Recibo **cobrado a medias** (`PARCIAL`) | **No** se toca | Se ha emitido un cobro contra él; hay que decidirlo a mano |
| Recibo **RETRASADO** (vencido e impagado) | **No** se toca | Reclamar hoy un importe distinto del que se reclamó ayer es una decisión de negocio, no un automatismo |
| Recibo **anterior** a la fecha efectiva | **No** se toca | No se reabre la decisión P4-B de no recalcular el histórico |
| Contrato **sin periodos materializados** | **No se crea nada nuevo** | El motor los creará al día siguiente con la renta nueva; duplicar aquí sería el modelo paralelo que la orden prohíbe |

### Tres decisiones que necesito de ti antes de implementar

1. **¿Qué hago con los `RETRASADO`?** Mi propuesta es **no tocarlos**. La alternativa —actualizarlos también— reescribe una deuda ya reclamada, y eso cambia lo que se le pide al inquilino.
2. **¿La subida entra en vigor el mes de la fecha efectiva o el siguiente?** Depende de si la fecha efectiva se interpreta como «desde este mes» o «desde que empieza el mes siguiente». Lo dejo configurable, pero necesito criterio.
3. **¿Recalcular el `importePrevisto` debe registrar auditoría en `audit_logs`,** además del `historialCambios` del periodo? Mi propuesta: **sí**, porque cambia una cifra económica y la norma del repositorio es que todo cambio económico sea trazable.

### Riesgos

- **Ninguno sobre datos existentes** si la regla se limita a los tres criterios: no toca nada cobrado ni histórico.
- El código vive en un **servicio de servidor**; su prueba natural es unitaria del motor más una de integración. **No requiere cambios en `firestore.rules`**, porque el servidor escribe con cuenta de servicio.
- **No lo implemento** hasta que confirmes los tres puntos de arriba.
