# BLOQUE 10 · UX-7 — INSPECCIÓN Y CIERRE FINAL DE UX

**Fase:** UX-7 «Limpieza, coherencia y cierre final» (última fase UX antes de la Auditoría Integral).
**Rama:** `arena/01a0e939-gestor-de-inmuebles-vercel` · **Base:** UX-1 `ab107b2` · UX-2 `0186173` · UX-3+4 `08d5e16` · UX-5+6 `e0c3cfa` · `main c0c8224`.
**Regla de la fase:** no es una ronda de desarrollo. No se añade funcionalidad, no se cambian reglas, permisos, motores, formularios ni navegación. Lo que no era UX se documenta y se deja para su fase.

---

## 1. Custodia previa (no destructiva)

| Comprobación | Resultado |
| --- | --- |
| Rama / HEAD locales | `arena/01a0e939-gestor-de-inmuebles-vercel` → `e0c3cfa` (UX-5+6) |
| Padre | `08d5e16` (UX-3+4) |
| `origin/<rama>` | `e0c3cfa` (idéntico al local) |
| `main` | `c0c8224` (no tocado; sin merge ni PR en esta fase) |
| Árbol de trabajo | limpio antes de empezar; `sha256` del árbol idéntico antes/después de recuperar refs |
| Incidencia de snapshot | el snapshot volvió a perder las referencias; se recuperaron sin operación destructiva: `ls-remote` → `fetch` → comparación `hash-object` (709/709 ficheros idénticos al commit) → `update-ref` de la rama y de `refs/remotes/origin/*` → `symbolic-ref HEAD` → `git reset -q HEAD`. Nunca `reset --hard` ni `clean -fd` |

---

## 2. Método de la inspección

1. **Inventario de capas de modal** medida sobre el árbol real: todas las etiquetas `className="fixed inset-0…"` y, para cada una, si su contenedor interior ya usa `useDialogoAccesible` (UX-6).
2. **Clasificación por capa** (no por fichero) en cuatro grupos: A diálogo real, B visor/pantalla completa, C capa especial (host propio), D capa menor o anidada.
3. **Búsqueda de restos conocidos** de UX-1…UX-6 (nombres, contador, feedback, mensajes, estados, código muerto).
4. Sólo después se aplicaron correcciones, una por hallazgo, con `tsc` y tests tras cada bloque.

> **Nota de trazabilidad:** el inventario previo del doc UX-5+6 hablaba de «46 capas pendientes», calculado con una heurística de ventana de texto que no distinguía bien la capa de su contenedor. La medición fiable de UX-7 se hace capa por capa sobre el árbol real: **104 capas `fixed inset-0` en total, 36 ya cubiertas al empezar la fase**. La revisión manual capa por capa posterior determinó que 62 de esas 68 actuaban como diálogo real (y se convirtieron) y que las 6 restantes son 5 visores a pantalla completa y el host propio del diálogo de confirmación.

---

## 3. Tabla de hallazgos

| Hallazgo | Archivo | UX afectado | Estado | Acción | Riesgo |
| --- | --- | --- | --- | --- | --- |
| Botones con icono `Filter` etiquetados «Filtrar» que en realidad **cierran** el detalle / el asistente | `src/components/sections/ActasSection.tsx:517, 639` | UX-6 (regresión) · §13 | Corregido | `aria-label` «Cerrar» (el `onClick` no se toca) | Bajo: sólo nombre accesible |
| Botón de quitar valor con `aria-label="Cerrar"` | `src/components/modals/KitPublicacionModal.tsx:52` | UX-6 · §13 | Corregido | `aria-label="Quitar"` | Bajo |
| Botones de «volver al listado» anunciados como «Anterior» | `src/components/sections/InversionSection.tsx:671, 873` | UX-6 · §13 | Corregido | `aria-label="Volver al listado"` | Bajo |
| 68 capas de modal sin comportamiento de diálogo (foco/Escape/retorno) | 45 ficheros (ver §6) | UX-6 | Corregido en grupo A | 62 capas de diálogo real pasan a `useDialogoAccesible` (medición capa por capa: 36 de 104 cubiertas al empezar, 98 al terminar) | Medio: es el mismo patrón ya probado en las 36 anteriores; sin cambios de lógica, sólo atributos de semántica y comportamiento de foco |
| Visores a pantalla completa (fotos, XML, PDF) sin semántica de diálogo | `PublicPropertyGallery`, `DetalleSolicitudDocModal:920`, `DetalleIncidenciaModal:2099`, `InspeccionFotograficaModal:601`, `ProfesionalPortalSection:1088` | UX-6 §6 grupo B | Documentado (sin cambio) | Se dejan como están: no tienen título/cierre propios y su control vive sobre la imagen; envolverlos exigiría rediseñar el visor | Bajo: comportamiento actual intacto |
| Host del diálogo de confirmación con `role="dialog"` ya propio | `src/components/feedback/DialogoConfirmacion.tsx:46` | UX-3 §6 grupo C | Documentado (sin cambio) | Mantiene su gestión propia de foco/Escape/entrada de texto; no se re-instrumenta | Bajo |
| Único `window.prompt` del árbol (motivo de versionado de acta) | `src/components/sections/ActasSection.tsx:354` | UX-3/§8 | Corregido | `confirmar({ entradaTexto })` con el mismo texto, motivo obligatorio y mismo flujo posterior | Medio: se revisa que confirmar ejecute exactamente la operación anterior |
| `window.alert` / `window.confirm` / `window.prompt` en producción | todo `src` | UX-3 · §8 | Verificado | 0 apariciones fuera del fallback documentado de `feedback/confirmacion.ts` | — |
| Fallbacks de error visibles que nombran «Firestore» | `CrearProfesionalModal:170`, `CrearUsuarioModal:209`, `PresupuestoProfesionalModal:407`, `TrabajoProfesionalModal:345` | §9 | Corregido | «No se ha podido guardar … Inténtalo de nuevo.» | Bajo: sólo texto |
| Títulos de página con códigos internos («— BLOQUE D», «(INC-06)») | `Header.tsx:82`, `ActasSection.tsx:449/636`, `patrimonial/PantallaPatrimonial.tsx:258` | UX-1 (N10) · §9 | Corregido | Fuera el código de bloque; se conserva el nombre funcional de cada pantalla | Bajo |
| Badge de incidencias nunca alimentado (`contador: 'incidenciasAbiertas'` sin valor) | `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/MobileNav.tsx` | UX-1 (§4) | Corregido | `App` calcula `incidenciasNoCerradas(scopedIncidencias).length` con el helper canónico y lo pasa a los dos menús; `MobileNav` añade el contador que le faltaba | Bajo: sólo lectura; no se toca el motor de incidencias |
| Nombres menú vs título de página en otras secciones | `navegacion.ts` / `Header.tsx` | UX-1 (N10) | Documentado | Se unificó lo que era incoherencia real (actas). Las diferencias restantes son forma corta (menú) frente a forma larga (título con subtítulo) del **mismo** nombre: no se tocan | — |
| Sección `inicio` fuera del catálogo (28 ítems) pero usada como estado inicial y renderizada | `src/App.tsx`, `src/navegacion/navegacion.ts` | UX-1 (D-1) | Documentado (sin cambio) | No hay evidencia de que sea inalcanzable o duplicada; eliminarla sería una decisión funcional, no de UX. Queda para la Auditoría Integral | — |
| Scroll y foco al cambiar de sección | `src/App.tsx:926-937` | UX-5 §5 | Verificado (sin cambio) | Un único `scrollTo` + `focus` al contenido, sin ejecutarse en la primera carga; el otro efecto con dependencia `[activeSection]` limpia el contexto de IA (responsabilidad distinta, no duplicada) | — |
| Diálogos superpuestos (uno sobre otro) | `src/accesibilidad/dialogo.ts` (pila) | UX-6 §7 | Verificado | Ya resuelto en UX-6: sólo el diálogo superior responde a `Escape`/`Tab`, y al cerrarse no cierra el de debajo | — |
| Mensajes con `undefined`, `[object Object]` o trazas | todo `src` | §9 | Verificado | 0 apariciones en texto visible | — |
| Restos de UX-2 (falsos vacíos, `catch(() => cb([]))`, errores invisibles) | `src/estadoDatos/**`, secciones | UX-2 §10 | Verificado | Sin restos evidentes; los `catch` vacíos restantes son guards deliberados de `localStorage` y código de `src/lib/**` (documentado y fuera de alcance UX) | — |
| Código muerto UX sin ningún consumidor (incluidos tests) | `accesibilidad/interaccion.ts`, `feedback/canalFeedback.ts`, `feedback/confirmacion.ts`, `formularios/CampoFormulario.tsx` | §15 | Corregido | Eliminados `esControlNativo`, `descartarAvisosOperacion`, `confirmarYEjecutar` y `EtiquetaCampo` (0 usos demostrados) | Bajo |
| Exportaciones sólo usadas por tests (`esMensajeTecnico`, `estadoDeLectura`, `incidenciasPendientes`, `normalizarCodigo`, `hayHostConfirmacion`, `ORIGENES_CONOCIDOS`, `validarCampo`, `esIbanValido`, `esNifValido`, `itemDisponible`, `definicionesDePerfil`) | varios | §15 | Documentado (sin cambio) | Son contrato de pruebas de bloques anteriores; retirarlas rompería suites que no son de esta fase | — |
| Formularios (obligatorios, errores por campo, doble envío) | `src/components/formularios/**` | UX-4 §11 | Verificado | Sin cambios: el patrón `CampoFormulario` + `validacion.ts` sigue en uso y coherente | — |
| Responsive móvil (navegación, modales, tablas, botones, Centro de Control) | varias | UX-5 §12 | Verificado | Sin defectos nuevos: los contenedores de techo, el scroll horizontal de tablas y la barra segura siguen aplicados; los diálogos convertidos conservan `overflow-y-auto` y `my-auto` | — |
| `propsInteraccion(() => () => accion)` (no-op con teclado) | 16 ficheros | UX-6 | Verificado | Ya normalizado en UX-5+6 y protegido por test guarda | — |
| `App.tsx`: estados/efectos/listeners duplicados | `src/App.tsx` | §16 | Verificado | Sin duplicados reales; no se reestructura por estética | — |

---

## 4. Contador de incidencias (§4)

- El catálogo marca `contador: 'incidenciasAbiertas'` en el ítem `incidencias` (`navegacion.ts:349`).
- `Sidebar` ya declaraba la prop, pero **App no la pasaba**; `MobileNav` ni la tenía.
- Corrección: `incidenciasAbiertasCount = incidenciasNoCerradas(scopedIncidencias).length`, usando el helper existente de `src/utils/operacionesEngine.ts` (`ESTADOS_INCIDENCIA_CERRADA = RESUELTA, CERRADA, CANCELADA, RECHAZADA`) sobre la misma lista acotada por perfil que ve la sección. **No se modifica ninguna regla del motor de incidencias.**

## 5. Nombres de sección (UX-1 · N10)

- Unificado lo incoherente: `actas` se llamaba «Actas Entrada/Salida» (menú) y «Actas de Entrada y Salida — BLOQUE D» (título y `h2`). Queda «Actas de Entrada y Salida» en título y `h2`, y la forma corta en el menú.
- Se mantiene la diferencia forma corta / forma larga con subtítulo en el resto de secciones (mismo nombre funcional, sin contradicción).
- `dashboard` sigue siendo «Centro de Control» en el menú (D-4) y «Centro de Control Ejecutivo» como título de página: se conserva.
- `inicio`: fuera del catálogo, estado inicial del shell y render propio. Sin evidencia de duplicidad o inaccesibilidad → **no se elimina** (decisión funcional, no UX).

## 6. Clasificación final de las 104 capas de modal

| Grupo | Definición | Capas | Tratamiento |
| --- | --- | --- | --- |
| **A** | Diálogo real: título propio y botón de cierre/cancelación | **98** (36 venían de UX-6 + **62 convertidas en UX-7**) | `useDialogoAccesible` (foco dentro, `Escape` cancela, foco devuelto, `Tab` contenido, pila para superpuestos) |
| **B** | Visor / pantalla completa no convencional (foto, XML, PDF) | **5** | Sin cambio, documentado |
| **C** | Capa con gestión de diálogo propia | **1** (`feedback/DialogoConfirmacion.tsx`, el host de confirmación de UX-3) | Sin cambio, documentado |
| **D** | Capa anidada o decorativa dentro de otro diálogo | 0 pendientes | — |

Medición final: **104 capas · 98 en grupo A · 6 pendientes (5 visores + 1 host propio) · 102 hooks en 71 ficheros**.

Pendientes exactos (grupo B + C), fijados por test guarda en `src/accesibilidad/ux7.integracion.ui.test.tsx`:

```
components/DetalleSolicitudDocModal.tsx:920        (visor de fichero)
components/PublicPropertyGallery.tsx:150           (galería a pantalla completa)
components/feedback/DialogoConfirmacion.tsx:46     (host propio del diálogo de confirmación)
components/modals/DetalleIncidenciaModal.tsx:2099  (visor de foto)
components/modals/InspeccionFotograficaModal.tsx:601 (zoom de foto)
components/sections/ProfesionalPortalSection.tsx:1088 (visor a pantalla completa)
```

Cuando el diálogo bloquea el cierre (operación en curso), el hook recibe `cerrableConEscape: !guardando` para no abortar un guardado a medias.

## 7. Feedback y mensajes (§8, §9)

- Un solo mecanismo de confirmación (host de UX-3); 0 diálogos nativos en producción.
- Resultado de operación por el canal común (`avisarOperacion`); se conservan los avisos locales ya existentes, que no son mecanismos distintos sino presentación junto al dato.
- Textos: sin códigos de bloque, sin nombres de servicio («Firestore»), sin `undefined`/`[object Object]`.

## 8. Tests añadidos (§18)

`src/accesibilidad/ux7.integracion.ui.test.tsx`:

1. **Diálogo real convertido** (`ConfirmDeleteModal`): se anuncia como diálogo, el foco entra, `Escape` cancela y no ejecuta, el foco vuelve al origen.
2. **Contador de incidencias** en menú móvil (valor y ausencia con 0) y en menú lateral.
3. **Guarda de feedback**: no queda ningún `window.prompt(` fuera del fallback documentado.
4. **Guarda de cobertura**: los diálogos convertidos conservan su hook.
5. **Guarda de inventario**: 104 capas, y las 6 pendientes son exactamente las clasificadas arriba (si aparece una capa nueva sin revisar, el test falla).

No se creó ningún test artificial para subir cobertura.

## 9. Incidencias no bloqueantes / deuda documentada

- **Visores a pantalla completa (grupo B)**: no responden a `Escape` porque no tienen estructura de diálogo (título + cierre). Mejorarlos implicaría rediseñar el visor: fuera del alcance de una fase de cierre. *(Candidato para el Bloque 11 si se decide abordarlo.)*
- **`inicio`**: sección fuera del catálogo; decisión funcional pendiente de evidencia.
- **Exportaciones sólo usadas por tests**: se conservan como contrato de pruebas.
- **INFRA-01** (Firebase Emulator): sigue documentado y no se reintenta en esta fase.
- **`catch` vacíos** de `src/lib/**` y guards de `localStorage`: preexistentes y deliberados; fuera del alcance UX.

## 10. Archivos no tocados (declaración expresa, §17)

`firestore.rules`, `storage.rules`, `src/lib/**` (salvo el texto de mensajes indicado arriba, que es de componentes), permisos, roles, guards de ruta, aislamiento por propietario, motores de negocio (operaciones, fiscalidad, alquiler, morosidad, contratos, IA), `src/utils/**` (salvo el uso del helper existente) y la navegación (`navegacion.ts` sin cambios).

## 10.bis. Correcciones aplicadas durante la revisión manual de capas

La revisión capa por capa añadió, además de las 21 capas identificadas en el primer barrido, 27 más que sí eran diálogos reales y no estaban contadas por la heurística previa: `CandidateModal`, `ConfirmWhatsappSentModal`, `CrearAgendaVisitasModal`, `FichaTecnicaInventarioPanel`, `HabitacionesInmueblePanel`, `PortalSolicitudPublicaView` (política de privacidad), `VerAgendaInmuebleModal`, `BolsaInmobiliariasModal`, `DetalleRentabilidadModal`, `GastoRecurrenteModal`, `PricingModal`, `PrestamoModal`, `RecomercializarModal`, `TablaAmortizacionModal`, `MejorasROIModal`, `KitPublicacionModal`, `InspeccionFotograficaModal` (diálogo principal), `PortalIncidencias`, `PortalSuministros` (2), `FacturacionSection` (2), `FinanciacionSection`, `FormalizacionSection`, `GestionImagenesModal` (galería), `FormalizarContratoModal`, `AuthModal` y `DetalleExpedienteModal`.

En los diálogos con operación en curso se añadió `cerrableConEscape: !guardando` (o el flag equivalente: `!enviando`, `!isSaving`) para que `Escape` no aborte un guardado a medias.

## 11. Resultado de la Fase 1

La inspección no encontró funcionalidad que faltara: encontró **restos de coherencia** (nombres accesibles invertidos, capas de modal sin comportamiento de diálogo, un `prompt` nativo, un contador sin alimentar, tres textos con códigos internos) y **código muerto con uso cero demostrado**. Todo lo corregido pertenece a presentación, accesibilidad, textos y coherencia; ninguna corrección ha tocado reglas, permisos, motores ni contratos de datos.
