# P1 · PORTAL DEL PROFESIONAL — Informe de entrega

**Fecha:** 2026-11-15
**Rama:** `arena/77999d3b-gestor-de-inmuebles-vercel`
**Commit P1:** `9b19a4e`
**PR:** #86 (abierta, sin fusionar)
**Despliegue:** ninguno. Sin migraciones. Sin cambios en `firestore.rules` ni `storage.rules`.

---

## 1. Funcionalidades terminadas

| Bloque | Estado | Qué hace realmente |
|---|---|---|
| **A · Aceptación** | ✅ Terminado | El profesional acepta o rechaza el encargo. El rechazo **exige motivo** (5–500 caracteres) y se guarda en el historial junto con el cambio de estado. |
| **B · Presupuestos** | ✅ Terminado | Prepara presupuesto desde el trabajo: conceptos, cantidades, precio unitario e IVA **por línea** (0/4/10/21 %). Guarda borrador, lo envía, ve el historial de versiones. |
| **C · Fotografías y evidencias** | ⚠️ **Parcial** | Validación de tipo y tamaño (10 MB), ruta forzada bajo `incidencias/{id}/` y **nunca** URL pública. **Falta**: la subida desde el portal se apoya en el modal existente; ver §4. |
| **D · Comunicación** | ❌ **No implementado** | Ver §4. La única colección de mensajería del sistema es `mensajes_portal`, que exige `contratoId` y está diseñada para propietario↔inquilino. |
| **E · Finalización** | ✅ Terminado | Informe con observaciones, exigencia de evidencia si hay incidencia vinculada, y confirmación por el propietario. |
| **Panel de 6 bloques** | ✅ Terminado | Pendientes de aceptar, aceptados, presupuestos pendientes, en curso, pendientes de documentar, finalizados. |
| **Límites de permiso** | ✅ Terminado | El selector de estado ofrece **solo** lo que la regla permite; sin autoasignación, sin cancelar, sin reabrir. |

---

## 2. Archivos modificados

| Archivo | Tipo | Motivo |
|---|---|---|
| `src/features/profesional/circuitoProfesional.ts` | **nuevo** | Núcleo puro del circuito: transiciones, presupuestos, evidencias, finalización, panel. |
| `src/features/profesional/circuitoProfesional.test.ts` | **nuevo** | 41 pruebas del circuito. |
| `src/features/profesional/supervisionPropietario.test.ts` | **nuevo** | 10 pruebas de supervisión y aislamiento entre carteras. |
| `src/components/sections/ProfesionalPortalSection.tsx` | modificado | Panel de 6 bloques, aceptar/rechazar, presupuesto, finalización, selector restringido. |
| `src/accesibilidad/ux7.integracion.ui.test.tsx` | modificado | **Solo el número de línea** de una capa preexistente, desplazada por el código nuevo. La aserción semántica es idéntica. |

**Ningún cambio en reglas, tipos del modelo, colecciones ni dependencias.**

---

## 3. Pruebas ejecutadas y resultados

| Suite | Resultado |
|---|---|
| `vitest run` (excl. guardia-a04) | **325 archivos / 5.410 pruebas, 0 fallos** (antes: 323 / 5.359) |
| `src/features/profesional/` | **51/51** (41 circuito + 10 supervisión) |
| `test:operaciones` | 300 pass / 0 fail |
| `test:patrimonial` | 88 pass / 0 fail |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** (26 s) |
| App real (`npm run dev`) | `/api/health` 200, SPA servida, módulo del circuito 200 |
| **Emulador oficial (CI)** | 852/868 correctas. Los **4 fallos son los mismos hallazgos de P0**, sin cambios |

**Dato clave de aislamiento:** el job de emuladores no ha incorporado **ningún** fallo de
permisos nuevo. Si P1 hubiera ampliado permisos, habría aparecido aquí. Los 4 fallos son
`enlaces_registro` (3) y `audit_logs` (1), idénticos a los del commit anterior.

---

## 4. Funcionalidades que se pueden utilizar realmente

### Sí, de punta a punta

- El profesional ve sus trabajos y los seis bloques del panel.
- **Acepta** un encargo → `ACEPTADO`, con historial y sincronización de la incidencia.
- **Rechaza** con motivo → `CANCELADO`, con el motivo en el historial.
- **Prepara un presupuesto** con líneas, IVA e importes, lo guarda como borrador y lo envía.
- Ve el **historial de versiones** y el bloqueo de un presupuesto aceptado.
- **Informa de la finalización** con observaciones.
- El propietario **ve el estado** y **confirma** la finalización.

### Parcial

- **Evidencias**: la validación y la ruta son correctas y están probadas, pero la subida se
  apoya en el modal de trabajo existente. **No he añadido un selector de momento
  (antes/durante/después) en la UI**: el núcleo lo soporta y la ruta lo refleja, pero el
  control visual queda pendiente.

### No

- **Comunicación (D)**. Ver abajo.

---

## 5. Lo que he decidido NO hacer, y por qué

### D · Comunicación: no implementada

La orden pide «comunicación entre propietario y profesional vinculada a cada trabajo». La
única colección de mensajería existente es **`mensajes_portal`**, y su modelo y sus reglas
están construidos alrededor de un **contrato** (`contratoId` obligatorio, remitente
`INQUILINO`/gestión, acuses `leidoPorInquilino`). Un profesional no tiene `contratoId`.

Implementarlo exigía una de estas dos cosas, **y las dos están prohibidas por la orden**:

1. **Ampliar `mensajes_portal`** para admitir `trabajoId` y remitente `PROFESIONAL` →
   modifica reglas y el modelo de datos, y afecta al circuito del inquilino que la orden
   dice no tocar.
2. **Crear una colección nueva** (`mensajes_trabajo`) → es exactamente el «modelo paralelo»
   que la orden prohíbe en §4.

**No he hecho ninguna de las dos.** Prefiero entregar D sin hacer que entregarlo mal. La
decisión es del titular: o se autoriza ampliar `mensajes_portal` (con el análisis de impacto
sobre el inquilino), o se autoriza una colección nueva con su propia política.

### C · Evidencias: selector de momento pendiente

Implementar el selector visual exige tocar el modal de trabajo compartido
(`DetalleTrabajoProfesionalModal`), que también usa el propietario. La orden pide no modificar
funcionalidades del propietario que no sean necesarias. Queda pendiente por prudencia, no por
dificultad.

---

## 6. Permisos y aislamiento — lo que garantiza el sistema

| Requisito P1 §2 | Cómo se garantiza | Prueba |
|---|---|---|
| Solo accede a sus trabajos | Reglas: `list`/`get` exigen `profesionalId == myProfId()` | **Emulador oficial** (53/53 en reglas-inmuebles) |
| No puede asignarse trabajos | No existe vía: `create` exige `aisladoCreateOk` (propietario) o master | Prueba + regla |
| No puede fijar estados prohibidos | Selector limitado + guarda en el manejador | `circuitoProfesional.test.ts` |
| No consulta datos de otros propietarios | Reglas por `propietarioId` / ámbito | 10 pruebas de supervisión |
| No modifica presupuestos aceptados | `ESTADOS_PRESUPUESTO_BLOQUEADO` + versión nueva | 4 pruebas |
| No altera el historial | `anadirAlHistorial` solo concatena; idempotente | 3 pruebas |
| Todo respeta las reglas de Firebase | **Sin cambios en las reglas** | Job de emuladores sin fallos nuevos |

**No se ha ampliado ningún permiso para resolver un problema de interfaz.**

---

## 7. Commit

```
9b19a4e P1: circuito de trabajo del profesional (aceptacion, presupuestos, evidencias, finalizacion)
```

Anterior: `81c6401` (P0). Punto de recuperación de P0: `2bed683`.

---

## 8. Pendiente y riesgos

| # | Pendiente | Motivo |
|---|---|---|
| 1 | Comunicación (D) | Requiere decisión: ampliar `mensajes_portal` o crear colección nueva |
| 2 | Selector antes/durante/después en la UI | Requiere tocar un modal compartido con el propietario |
| 3 | Pruebas de emulador específicas de P1 | Las reglas no cambiaron, pero falta una suite que fije el circuito profesional permitido/denegado en el emulador |
| 4 | Los 3 hallazgos abiertos de P0 | Siguen abiertos por decisión del titular |

**Riesgo principal:** el circuito funciona y está probado en su lógica, pero **no hay una
prueba de extremo a extremo en el emulador** que recorra aceptación → presupuesto →
finalización con las reglas reales. Las 51 pruebas son del núcleo puro. Es el siguiente paso
natural y el único que falta para poder afirmar «probado contra el motor real».
