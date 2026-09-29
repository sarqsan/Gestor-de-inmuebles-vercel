# BLOQUE 10 · UX-5 (responsive/móvil) + UX-6 (accesibilidad/coherencia) — INSPECCIÓN REAL

> Fase 1, ejecutada **antes** de modificar código, sobre el commit `08d5e16`
> (UX-3 + UX-4) de la rama `arena/01a0e939-gestor-de-inmuebles-vercel`.
> Los recuentos son de una auditoría propia sobre el árbol actual; no se reutilizan
> cifras de informes anteriores.

Formato: **Hallazgo | Archivo | Causa | Efecto UX | Solución | Riesgo**.

---

## 0. Método

Auditoría con tres barridos sobre `src` (excluyendo tests):

1. **Estructural**: contenedores de scroll, techos de altura, rejillas, `pb-*` del shell,
   punto de ruptura `md` del sidebar/menú móvil.
2. **Semántica interactiva**: elementos con `onClick` que no son controles nativos,
   botones sólo-icono, capas `fixed inset-0`, atributos ARIA presentes/ausentes.
3. **Formularios**: tamaño de fuente de los controles (auto-zoom iOS), `inputMode`,
   asociación de errores (`aria-describedby`/`aria-invalid`).

Cifras base del árbol: 42 `<table>`, 104 capas `fixed inset-0`, 1 333 `<button>`,
82 elementos no interactivos con `onClick`, 19 `role="alert"`, 10 `aria-expanded`,
5 `aria-current`, 4 `aria-modal`, 5 `aria-live`, 2 ficheros con `aria-describedby`,
1 uso de `inputMode`.

---

## 1. UX-5 · RESPONSIVE Y EXPERIENCIA MÓVIL

| Hallazgo | Archivo | Causa | Efecto UX | Solución | Riesgo |
| --- | --- | --- | --- | --- | --- |
| R1 · 6 de 42 tablas sin contenedor de scroll horizontal | `modals/DetallePresupuestoProfesionalModal.tsx:1026`, `modals/PresupuestoProfesionalModal.tsx:591`, `sections/FacturaElectronicaB2BPanel.tsx:412`, `sections/MorosidadSection.tsx:335,420,643` | `<table>` dentro de un contenedor `overflow-hidden` sin `overflow-x-auto` | En móvil la tabla se comprime o provoca scroll horizontal de toda la página: se pierden columnas y contexto | Envolver en un contenedor `overflow-x-auto` con `min-w` en la tabla (mismos datos, mismas columnas) | Bajo: sólo contenedor; no altera contenido ni acciones |
| R2 · 48 capas de modal sin control de desbordamiento (scroll + techo) | `modals/DetalleTrabajoProfesionalModal.tsx:1379,1495,1555`, `modals/DetalleProyectoReformaModal.tsx:1025,1115,1150,1192`, `HabitacionesInmueblePanel.tsx:323`, `FichaTecnicaInventarioPanel.tsx:659`, `sections/CobrosSection.tsx:847,1066`, `sections/InmueblesSection.tsx:3490,3632`, `sections/PropietariosSection.tsx:1256,1364`, `sections/SuministrosSection.tsx:728,820`, `sections/TesoreriaSection.tsx:775,804,832,875`, `admin/AdminControlCenter.tsx:127,1451,1509`, `feedback/DialogoConfirmacion.tsx:46` (+ los de una sola acción sin contenido largo, que se dejan) | El modal no tiene `max-h` ni scroll interno; en pantallas pequeñas o con teclado abierto las acciones quedan fuera de la vista | Añadir techo (`max-h-[90vh]`) + scroll interno y mantener la cabecera/pie visibles | Medio-bajo: sólo contenedores; se verifica por modal |
| R3 · 49 rejillas de 3-9 columnas sin variante responsive | 29 ficheros (`InmueblesSection` 5, `DetalleExpedienteModal` 3, `PrestamoModal` 3, `DashboardEjecutivoSection` 3, `InversionSection` 3, `GastoModal` 2, `GastoRecurrenteModal` 2, `PropietariosSection` 2, …) | `grid-cols-N` fijo sin `sm:`/`md:` | En móvil estrecho los campos quedan de ~60-90 px: etiquetas cortadas y texto ilegible | Añadir variante responsive **sólo donde son campos de formulario o acciones**; las rejillas de KPIs/estadísticas se dejan | Bajo si se limita a campos; riesgo de salto visual si se aplica a todo |
| R4 · `MobileNav` sin cierre con teclado ni retorno de foco | `components/MobileNav.tsx` | Sólo cierre por clic fuera o al elegir sección; sin `Escape`; sin devolver el foco al botón que abrió | Usuarios de teclado no pueden cerrar el menú; el foco queda perdido | `Escape` cierra y devuelve el foco al disparador; el panel recibe el foco al abrirse | Bajo |
| R5 · Desplegable móvil con ancho fijo `w-72` | `components/MobileNav.tsx` | Ancho fijo de 288 px sin `min()` | En pantallas de 320 px queda pegado al borde y puede recortar texto largo | `w-[min(88vw,20rem)]` | Bajo |
| R6 · Shell de la app con `pb-16` sin barra inferior | `src/App.tsx:3735` | Resto de una barra inferior que no existe en el shell principal | Espacio muerto al final de cada pantalla en móvil | Ajustar el relleno inferior a la altura real de los elementos fijos (avisos UX-3) | Muy bajo |
| R7 · Controles con `text-xs`/`text-sm` (<16 px) | Formularios y modales (uso general de Tailwind en inputs) | iOS/Android hacen **auto-zoom** al enfocar un campo con fuente <16 px | Al escribir, la pantalla se amplía y descoloca el formulario: hay que hacer zoom manual para volver | Regla CSS contenida sólo en móvil (`max-width: 640px`) que sube el tamaño de fuente de `input/select/textarea` a 16 px | Bajo: sólo móvil; los tests no aplican CSS |
| R8 · Al cambiar de sección, el scroll no se restablece | `src/App.tsx` (render de secciones) | No existe ningún `scrollTo` al cambiar `activeSection` (sí existe en el portal del inquilino y en vistas públicas) | Al entrar en una sección desde el menú móvil, el contenido aparece a mitad de página: «la pantalla se abre por la mitad» | Restablecer el scroll al cambiar de sección (arriba y foco al contenido) | Bajo: cambio transversal justificado en `App.tsx` (§3.7 de la orden) |
| R9 · Navegación móvil y sidebar | `MobileNav.tsx`, `Sidebar.tsx`, `navegacion/navegacion.ts` | Ya centralizados en UX-1 (`md:` a 768 px, catálogo único, `max-h-[60vh]`, badges) | Ninguno detectado: secciones accesibles, sin recortes y sin scroll horizontal | **No se toca el catálogo**; sólo R4/R5 | Ninguno |

---

## 2. UX-6 · ACCESIBILIDAD Y COHERENCIA

| Hallazgo | Archivo | Causa | Efecto UX | Solución | Riesgo |
| --- | --- | --- | --- | --- | --- |
| A1 · **36 contenedores clicables sin semántica ni teclado** (de 82 con `onClick`, 46 son cierres de fondo) | `sections/InicioSection.tsx` (6), `sections/SuministrosSection.tsx` (3), `sections/CandidatosSection.tsx` (2), `sections/InmueblesSection.tsx` (2), `sections/FinanciacionSection.tsx` (2), `sections/FacturacionSection.tsx`, `sections/FormalizacionSection.tsx`, `sections/ProfesionalesSection.tsx`, `sections/RentabilidadPanel.tsx`, `sections/SeguroImpagoSection.tsx`, `modals/DetalleIncidenciaModal.tsx` (2), `modals/DetalleProfesionalModal.tsx`, `modals/DetalleProyectoReformaModal.tsx`, `modals/HistorialTrabajosInmuebleModal.tsx`, `modals/IncidenciaModal.tsx`, `modals/InspeccionFotograficaModal.tsx`, `modals/CrearAgendaVisitasModal.tsx`, `CrearSolicitudSeguroModal.tsx`, `HabitacionesInmueblePanel.tsx`, `PublicPropertyGallery.tsx`, `reformas/ReformasInmueblePanel.tsx`, `portal-inquilino/PortalIncidencias.tsx`, `portal-inquilino/PortalSuministros.tsx` | Tarjetas/filas con `onClick` en `<div>` sin `role`, `tabIndex` ni `onKeyDown` | Abrir un detalle, seleccionar o alternar sólo funciona con ratón: **inaccesible por teclado** (§10) | Helper único de interacción accesible (`role="button"` + `tabIndex=0` + `Enter`/`Espacio` + `aria-label` cuando el contenido no es texto claro) aplicado a los 36 | Medio: son muchos puntos; se aplica con patrón único y se verifica con tests |
| A2 · **61 botones sólo-icono sin nombre accesible** (de 1 333 botones) | Cierres `X` de 40+ modales (`ConfiguracionAseguradorasModal`, `ConfirmDeleteModal`, `ConfirmWhatsappSentModal`, `CrearAgendaVisitasModal`, `CrearEnlaceSolicitudModal`, `CrearSolicitudDocModal`, `CrearSolicitudSeguroModal`, `DetalleSolicitudDocModal`, `DetalleSolicitudSeguroModal`, `DocumentAnalysisModal`, `DocumentUploadModal`, `EnviarCuestionarioModal`, `FormalizarContratoModal`, `GestionImagenesModal`, `SmartReportModal`, `SolicitudDetailModal`, `modals/AuthModal`, `modals/BolsaInmobiliariasModal`, …), flechas de `PublicPropertyGallery`, botones de `DocumentosPatrimonialesPanel`, `PortalDocumentacionPublicaView`, etc. | `<button><X /></button>` sin `aria-label` ni texto oculto (algunos con `title`, que no es nombre accesible fiable) | Un lector de pantalla anuncia «botón» sin decir qué hace | `aria-label` descriptivo en la acción (mismo patrón en todos los cierres) | Bajo |
| A3 · **Sólo 2 de 104 capas de modal** tienen `role="dialog"`; 4 con `aria-modal`; 1 fichero gestiona `Escape` | Todos los modales (`modals/*`, `sections/*`, `admin/AdminControlCenter`, `feedback/DialogoConfirmacion` ✅) | No hay un patrón común de diálogo: cada modal se monta como capa visual | Lectores de pantalla no anuncian diálogo ni su título; el foco no entra en el modal ni vuelve al cerrar; `Escape` no cierra | Hook único (`useDialogoAccesible`): `role="dialog"` + `aria-modal` + `aria-labelledby`, foco inicial dentro, trampa de `Tab`, `Escape` y devolución de foco. Se aplica a los modales de formulario/detalle principales | Medio: muchos ficheros; se aplica por fases y se corre la suite completa |
| A4 · Errores de campo no asociados por `aria-describedby` | `components/formularios/CampoFormulario.tsx` (UX-4) y formularios que lo usan | El `ErrorCampo` es un `role="alert"` contiguo pero no hay `id`/`aria-describedby` que lo ligue al control | El lector de pantalla lee el error de forma aislada; al volver al campo no se repite el motivo | `ErrorCampo` acepta `id` y los formularios pasan `aria-describedby` + `aria-invalid` | Bajo |
| A5 · Teclado móvil no optimizado: `inputMode` en 1 solo punto | Formularios (importes, IBAN, teléfono, código postal, superficies) | Falta `inputMode`/`type` adecuados en campos numéricos y de texto especializado | En móvil aparece el teclado alfabético en campos numéricos: más pulsaciones y más errores | `inputMode="decimal"`/`"numeric"` en importes/cantidades, `type="email"`/`tel` donde falte | Bajo |
| A6 · `aria-current` sólo en navegación (5 usos), ausente en pestañas internas | Pestañas de `DetalleExpedienteModal`, `DetalleSolicitudSeguroModal`, `InmueblesSection` (tabs alta/edición) | Botones de pestaña sin `aria-current`/`aria-selected` | No se anuncia qué pestaña está activa | Añadir `aria-current="true"` a la pestaña activa en los conjuntos principales | Bajo |
| A7 · Estados por punto de color | `Sidebar.tsx:139,146`, `ConfiguracionSection.tsx:316`, `admin/AdminControlCenter.tsx:547`, `DetalleSolicitudSeguroModal.tsx:460,475`, `DetalleIncidenciaModal.tsx:569,584,586,601`, `DocumentAnalysisModal.tsx:167` | Punto de color como indicador | Riesgo de depender sólo del color | Verificado: **todos** llevan texto o `title` adyacente. Sólo se añade `aria-hidden` al punto decorativo para no leer ruido | Muy bajo |
| A8 · `role="alert"` en 19 puntos | Errores de campo (UX-4), estados de error UX-2, avisos UX-3 | Uso correcto (mensajes que aparecen tras una acción) | Ninguno | Se mantiene; no se añade `role="alert"` a nada nuevo | Ninguno |
| A9 · Coherencia de diálogos de confirmación | `feedback/DialogoConfirmacion.tsx` ✅ (único con `role`, `aria-modal`, `Escape`, foco) | Es el patrón nuevo de UX-3 | El resto de modales es incoherente con él | Extender el patrón (A3) con el mismo hook: «mismo problema → mismo patrón» | Bajo |
| A10 · Contraste y legibilidad | Paleta Tailwind ya existente (`slate-*`, `rose-*`, `emerald-*`, `amber-*` sobre blancos/grises) | — | No se detecta dependencia exclusiva del color para error/éxito/selección (siempre hay texto: «… es obligatorio», «No se ha podido…», ✓/icono) | **Sin reestilización**: sólo se conserva la combinación icono + texto + color | Ninguno |

---

## 3. LÍMITES (lo que NO entra)

- Rules Firestore/Storage, permisos, roles, guards, aislamiento, motores (fiscalidad,
  alquiler, morosidad, operaciones), contratos de datos, estructura patrimonial, IA.
- Comportamiento empresarial de UX-1…UX-4: la presentación y la accesibilidad cambian;
  la lógica de navegación, estados, feedback/confirmaciones y validación **no**.
- Catálogo de navegación de UX-1 (`src/navegacion/navegacion.ts`): intacto.
- Librerías nuevas: no se introduce ninguna (ni UI, ni focus-trap, ni router).
- Reestilización global: no se cambia el sistema visual ni Tailwind.

Si algún punto exigiera lógica de negocio, se documentaría como
**INCIDENCIA / DEPENDENCIA FUERA DE UX** y se dejaría fuera.

---

## 4. ESTADO FINAL (lo que se cambió y lo que queda documentado)

Cifras verificadas con scripts sobre el árbol final (30 ficheros usan el hook de diálogos —40 diálogos—
y 17 el helper de interacción —23 contenedores—; recuentos de atributos medidos sobre `src`):

| Punto | Antes | Después |
| --- | --- | --- |
| Capas de modal con comportamiento de diálogo (`role="dialog"` + `aria-modal` + nombre + foco + `Escape`) | 2 capas, 1 con `Escape`, 0 con foco gestionado | **40 diálogos en 30 ficheros** con `useDialogoAccesible` |
| Botones sólo-icono sin nombre accesible | 61 de 1 333 | **0** (187 `aria-label` en 97 ficheros, 68 añadidos en esta fase: cierres, eliminar, editar, filtrar, descargar, anterior/siguiente) |
| `fixed inset-0` sin control de desbordamiento (scroll/techo) | 48 capas | 28 contenedores con techo de altura o scroll interno (≈20 modales), 11 con centrado `my-auto` y 10 cabeceras fijas; el resto no tiene contenido largo |
| Tablas sin scroll horizontal controlado | 6 de 42 | **0 de 43** (`.scroll-x-controlado` + `min-w-*`; nunca se eliminan columnas) |
| Rejillas de campos/opciones sin variante responsive | 49 rejillas 3-9 columnas | 27 corregidas (`grid-cols-2 sm:grid-cols-N` en formularios; `grid-cols-1 sm:grid-cols-N` en selectores de opción) |
| Contenedores clicables sin teclado | 36 tarjetas/filas | 23 contenedores con `propsInteraccion` (foco + `Enter`/`Espacio`). En 5 se prefirió **botón real** dentro de la fila/tarjeta («Ver ficha», «Ver factura», nombre de la habitación) para no anidar controles; los demás son fondos decorativos o ya tenían botón equivalente |
| Campos con error asociado (`aria-describedby` + `aria-invalid`) | 1 fichero | 4 ficheros / 10 campos en formularios UX-4 (+ foco al primer campo con error) |
| Etiquetas asociadas (`htmlFor` + `id`) | 30 | 440 en 62 ficheros |
| `inputMode` | 1 | 160 (teclado numérico en los campos de importe/cantidad) |
| `aria-current` en pestañas internas | 0 | 21 pestañas |
| `aria-expanded` en desplegables propios | 3 | 7 |
| Scroll al cambiar de sección | no existía | `App.tsx` vuelve arriba y lleva el foco a `<main>`, sólo tras la primera carga |
| Auto-zoom móvil (campos < 16 px) | afectaba a todos los formularios | regla móvil (`max-width: 640px`) en `index.css` |
| Barra inferior del portal del inquilino | sin zona segura | `pb-safe` (`env(safe-area-inset-bottom)`) |

### 4.1 Lo que queda como base conocida (documentado, no silenciado)

- **46 capas de modal de detalle/zoom** conservan su montaje anterior (visor de imágenes a
  pantalla completa, fichas de detalle largas, panel de administración y los 4 modales de
  `CobrosSection`). Tienen botón de cierre con nombre accesible y su contenido es alcanzable
  por teclado, pero **no** anuncian `role="dialog"` ni atrapan el foco. Convertirlas exige
  decidir en cada caso cuál es el diálogo «de encima» en pantallas que muestran dos capas a
  la vez: se deja para UX-7 con la lista exacta de ficheros y el mismo hook ya probado.
- **Contraste**: no se detectó dependencia exclusiva del color en errores/éxito/selección
  (siempre hay texto). No se reestiliza paleta.
- **`aria-describedby` más allá de UX-4**: los formularios antiguos que aún no usan
  `ErrorCampo` mantienen su mensaje general; se documentan como deuda de coherencia.
- **`role="alert"` en 19 puntos**: se revisaron y todos corresponden a mensajes que aparecen
  tras una acción (error de campo, error de lectura, aviso de operación). No se añadió
  ninguno nuevo de más.

### 4.2 Pruebas nuevas (§16)

- `src/accesibilidad/dialogo.ui.test.tsx` (8): semántica y nombre del diálogo, foco de
  entrada, `Escape` (y su bloqueo en operación en curso), trampa de `Tab`/`Shift+Tab`,
  devolución de foco al origen y comportamiento con **dos diálogos apilados**.
- `src/accesibilidad/interaccion.ui.test.tsx` (5): rol, foco, activación con ratón, `Enter`
  y `Espacio` (sin desplazar la página) y teclas que no activan.
- `src/accesibilidad/ux56.integracion.ui.test.tsx` (9): `GastoModal` real (diálogo, `Escape`,
  foco en el campo con error y `aria-describedby` apuntando al mensaje), `MobileNav` real
  (`Escape` cierra y devuelve el foco, el foco entra en el menú, destinos de UX-1 intactos) y
  guardas del árbol (ninguna tabla sin scroll controlado, ningún botón sólo-icono sin nombre,
  ningún hook de diálogo tras un `return null`, CSS móvil presente).

### 4.3 Límites respetados

Sin librerías nuevas, sin cambios en reglas Firestore/Storage, permisos, roles, guards,
motores, fiscalidad, alquiler, morosidad, operaciones ni contratos de datos. El catálogo de
navegación de UX-1 (`src/navegacion/navegacion.ts`) no se modificó: el menú móvil sólo ganó
cierre con `Escape`, devolución de foco y ancho adaptable.
