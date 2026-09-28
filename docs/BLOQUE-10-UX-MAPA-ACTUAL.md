# BLOQUE 10 — UX DEL ERP · FASE 1–3: CUSTODIA, INSPECCIÓN REAL Y MAPA UX

> **Estado del documento:** fotografía de la UX **antes de tocar código** (Fase 1),
> mapa clasificado (Fase 2) y priorización con el primer subbloque propuesto (Fase 3).
> **No se ha modificado ni una línea de código de aplicación en esta entrega.**
>
> Base inspeccionada: `main` = `c0c82245d1adccf752903765ea554cb3544f1072` (merge del PR #10).
> Rama de trabajo: `arena/01a0e939-gestor-de-inmuebles-vercel`.
> Los motores de los Bloques 0–9 se consideran **protegidos** (§5, NO TOCAR).

---

## 0. CUSTODIA (Fase 1, pasos 1–6)

| Comprobación | Resultado |
|---|---|
| Rama actual | `arena/01a0e939-gestor-de-inmuebles-vercel` (creada desde `c0c8224`) |
| HEAD | `c0c82245d1adccf752903765ea554cb3544f1072` = SHA esperado ✔ |
| `main` | `c0c8224 [origin/main]` — idéntico al HEAD de referencia ✔ |
| Árbol de trabajo | **limpio** (`git status --porcelain` vacío); **sin trabajo local previo** que preservar |
| Operaciones destructivas | ninguna (`reset --hard`, `clean -fd`, checkout destructivo, force push: no usados) |
| Repositorio | clon shallow (`git log` = 1 commit); historia detallada no disponible localmente |
| Dependencias | `node_modules` no existía → `npm ci` (397 paquetes). No se añadió ni cambió ninguna dependencia |

**Baseline de partida ejecutado sobre el árbol limpio (evidencia real, no heredada):**

| Comprobación | Resultado |
|---|---|
| `npx vitest run` (global) | **131 archivos · 2557 pass · 2 skip · 0 fail** (74 s) |
| `npm run lint` (`tsc --noEmit`) | **0 errores** |
| `git diff --check` | limpio (sin cambios) |

---

## 1. INVENTARIO UX REAL (Fase 1, paso 7)

### 1.1 Volumen del subsistema UI

| Métrica | Valor |
|---|---|
| Ficheros `.ts`/`.tsx` en `src/` | 449 (169 `.tsx`) |
| Secciones del ERP (`SectionType`) | **38** |
| Componentes de sección | 38 ficheros en `src/components/sections` (~1.1 MB) |
| Modales (`src/components/modals` + raíz) | 55+ ficheros, 103 contenedores `fixed inset-0` |
| Paneles de inmueble / portal inquilino | `CentroOperativoInmueblePanel`, `FichaTecnicaInventarioPanel`, `HabitacionesInmueblePanel`, `PublicacionInmueblesPanel`, `DocumentosPatrimonialesPanel`; portal inquilino con shell móvil propio (13 ficheros) |
| Portales públicos (sin sesión) | `PortalRegistroView`, `RegistroAutonomoView`, `CuestionarioPublicoView`, `PortalSolicitudPublicaView`, `PortalVisitaPublicaView`, `PortalDocumentacionPublicaView`, `InvitacionCarteraView`, `PublicPropertyGallery`, `LoginView` |

### 1.2 Shell de aplicación

- **Layout:** `App.tsx` (4557 líneas) contiene shell + route guard + 60+ handlers + los 103 modales. `Sidebar` (desktop, `hidden md:flex`), `MobileNav` (móvil, `md:hidden`), `Header` (desktop, `hidden md:flex`), `<main className="… max-w-7xl …">` con render por `{activeSection === 'x' && …}`.
- **Navegación:** 3 fuentes de verdad **duplicadas**: listas por perfil dentro de `Sidebar.tsx`, otras tres dentro de `MobileNav.tsx`, y los arrays `SECCIONES_PROPIETARIO` / `SECCIONES_PROFESIONAL` en `App.tsx`. No existe módulo de metadatos de navegación.
- **Menú:** escritorio = 27 ítems **planos** (admin), 21 (propietario), 6–8 (profesional), sin agrupar ni buscar. Móvil = un único desplegable con los mismos 27 ítems, sin agrupar ni buscar.
- **Dashboards:** coexisten tres entradas con nombres solapados: `dashboard` → «Centro Control Ejecutivo», `administracion` → «Centro de Control», `inicio` → «Inicio y Resumen General».
- **Router:** **no hay** (`react-router` ausente; `pushState` sólo para limpiar la URL de tokens públicos). La sección activa vive sólo en `useState` → recargar siempre vuelve al panel inicial, no se puede compartir/enlazar una pantalla ni usar atrás/adelante del navegador.
- **Sección `inicio` (InicioSection, 12 KB):** no está en **ninguna** lista de navegación de ningún perfil; sólo aparece como estado inicial transitorio antes del redirect. En la práctica es inalcanzable para el usuario.
- **Divergencia ya real (no hipotética):** `SECCIONES_PROFESIONAL` permite `'inversion'`, pero ni `Sidebar` ni `MobileNav` ofrecen esa sección al profesional.

### 1.3 Patrones transversales medidos

| Patrón | Medición | Evidencia |
|---|---|---|
| Estados vacíos | 125 mensajes «No hay…» en secciones; **10+ variantes** de contenedor (`rounded-xl`/`rounded-2xl`, con/sin icono, con/sin CTA). El patrón bueno (icono + título + explicación + siguiente paso) existe pero es local a `InmueblesSection` | `grep "No hay\|Sin resultados"` |
| Estados de carga | Sólo 4–5 sitios (`authLoading` global, `DashboardEjecutivoSection`, `ConciliacionBancariaSection`, `ImportExportPanel`, subida de justificante en `CobrosSection`). No existe estado «datos cargando» por colección | `grep loading/cargando` |
| Estados de error de datos | **38** callbacks de error de `onSnapshot` que sólo hacen `console.error` en `src/lib/firebase.ts`; **ningún** error de lectura llega a la UI; no hay reintento | `firebase.ts:237,356,424,455,474…` |
| Feedback de éxito | **4** mensajes de éxito explícitos en todo el ERP; 2 paneles con aviso propio (`FacturaElectronicaB2BPanel`, `MorosidadSection`) vía `setMensaje` + `setTimeout(…9000)` | `grep` |
| Confirmaciones | **25** `window.confirm` en 16 ficheros (nativas, bloqueantes, fuera del diseño); existe `ConfirmDeleteModal` usado sólo en 2 secciones | `IncidenciasSection`, `GastosSection`, `SuministrosSection`, … |
| Alertas nativas | 3 `window.alert` (p. ej. cuenta bloqueada, `App.tsx:533`) | `grep` |
| Persistencia silenciosa | `persistirMejorEsfuerzo` **captura y devuelve** errores, pero los 2 puntos de uso hacen `void persistirMejorEsfuerzo(tareas)` sin leer el resultado; el resto de handlers guardan sin `await`/`catch` | `App.tsx:1627,1696`; `invitacionesCandidatos.ts:138` |
| Modales | 103 contenedores; **4** `role="dialog"`, **3** `aria-modal`, **0** focus-trap, `Escape` sólo en `AsistentePanel`/`ContextualHelp` (ningún modal de negocio) | `grep` |
| Formularios | **707** inputs + 269 selects + 59 textareas frente a **27** `htmlFor` (431 placeholders como sustituto funcional de etiqueta) | `grep` |
| Iconografía/botones | 1333 `<button>`, 197 `title=`, 57 `aria-label` | `grep` |
| Anuncio a lector de pantalla | 2 `aria-live`, 29 `role="alert"|"status"` | `grep` |
| Responsive | 748 `sm:` / 261 `md:` / 77 `lg:`; **116** usos de `grid-cols-3/4/6` **sin** breakpoint (≈25 en modales/formularios densos); 42 `<table>` con 60 `overflow-x-auto` | `grep` |
| Scroll al navegar | **sin** `scrollTo`/`scrollIntoView` al cambiar de sección (móvil conserva la posición del listado del menú) | `grep` |
| Jerga interna visible | Subtítulo del Header «Actas de Entrada y Salida — **BLOQUE D**» y textos de usuario con «plantilla **GAP 1**», «conciliado (**GAP 6**)», «idempotencia **GAP 1**» | `Header.tsx:82`; `MorosidadDetalleModal.tsx:294,340,399,482,726` |
| Ayuda / tutoriales / IA | `ContextualHelp` montado **sólo** en `Header` (desktop) y en el portal del inquilino; en móvil hay `AsistentePanel` pero **no** el icono «?» de ayuda de la pantalla activa. Sección `ayuda` (Centro de Ayuda) sí está en todos los menús. Tutoriales dependen de `data-tour="nav-<seccion>"` en Sidebar/MobileNav | `Header.tsx:119`, `MobileNav.tsx:277` |
| UX por rol | Guard correcto por perfil (`App.tsx:319-347,584-604`) + scoping `propietarioId`; el guard **no** restringe el render de todas las secciones (algunas tienen guard propio: `morosidad`, `inquilinos`) | `App.tsx:3841,4009` |

---

## 2. MAPA DE FLUJOS PRINCIPALES (Fase 1, paso 7)

| Flujo | Entrada | Pantalla(s) | Puntos de fricción UX detectados |
|---|---|---|---|
| Captación → preselección | Menú `Candidatos` / `Preseleccionados` | `CandidatosSection`, `PreseleccionadosSection`, `CrearAgendaVisitasModal` | listas sin búsqueda global; confirmaciones nativas |
| Formalización de contrato | `Formalización & LAU` | `FormalizacionSection`, `FormalizarContratoModal` (1360 l.) | modal enorme sin pasos/secciones colapsables; sin resumen final de confirmación |
| Cobros | `Gestión de Cobros` | `CobrosSection` | sin estado de carga; guardado sin confirmación |
| Tesorería / liquidaciones | `Tesorería & SEPA` | `TesoreriaSection` (tabs internos) | 5 tablas propias; navegación interna no enlazable |
| Operaciones / incidencias | `Operaciones`, `Incidencias` | `OperacionesSection`, `IncidenciasSection`, `DetalleIncidenciaModal` (2159 l.) | modal gigante; sin Escape ni foco gestionado |
| Morosidad | `Morosidad y Recobro` | `MorosidadSection`, `MorosidadDetalleModal` | jerga GAP visible; aviso local propio |
| Inmueble 360º | `Inmuebles` → ficha | `InmueblesSection`, `CentroOperativoInmueblePanel` + 5 paneles | patrón de vacío bueno (a estandarizar); resto de paneles no lo replican |
| Portal propietario | Login propietario | `PropietarioPortalSection` (1667 l.) + 20 secciones reutilizadas | menú de 21 ítems planos sin agrupar |
| Portal profesional | Login profesional | `ProfesionalPortalSection`, `ProfesionalesSection` | `inversion` permitida pero no ofrecida |
| Centro de Ayuda | Menú `Ayuda` | `CentroAyudaSection`, `TutorialPlayer` | en escritorio falta coherencia títulos Header vs pantalla; en móvil el botón «?» contextual no existe |
| Admin / seguridad | `Centro de Control` | `AdminControlCenter` (1612 l.) | nombre que colisiona con «Centro Control Ejecutivo» |

---

## 3. HALLAZGOS CLASIFICADOS (Fase 2)

### 3.1 UX-CRÍTICO — impiden o falsean el uso correcto de una función

| ID | Hallazgo | Evidencia | Por qué es crítico |
|---|---|---|---|
| **C1** | **Falso vacío**: los listados no distinguen «cargando» de «vacío». Las listas arrancan vacías y se rellenan al llegar el primer snapshot; hasta entonces (y para siempre si la lectura falla) el usuario ve «No hay X registrados» | `App.tsx:357+` (estados iniciales); ausencia de flags de carga; 125 vacíos en secciones | El usuario concluye que **no tiene datos** cuando aún no han llegado → decisiones erróneas y desconfianza |
| **C2** | **Error de datos invisible**: 38 callbacks de error de lectura sólo escriben en consola; no hay aviso, ni estado de error, ni reintento | `firebase.ts:237,356,424,455,474…` | Una denegación de reglas o un fallo de red se ve como «no hay datos» |
| **C3** | **Fallo de guardado silencioso**: la UI actualiza de forma optimista; si Firestore falla no hay aviso, y `persistirMejorEsfuerzo` devuelve los errores que nadie lee | `App.tsx:1627,1696` (`void`); `invitacionesCandidatos.ts:138` | El ERP afirma implícitamente que guardó y no lo hizo |
| **C4** | **El estado de carga/vacío del Centro de Control nunca se activa**: `loadingMain` no se pasa nunca desde el host (0 usos fuera del componente) | `DashboardEjecutivoSection.tsx:98,138,590`; `App.tsx:3703` | El dashboard «sin datos ficticios» muestra ceros/vacíos sin explicar que los datos no han llegado |

### 3.2 UX-IMPORTANTE — navegación, comprensión, feedback y consistencia

| ID | Hallazgo | Evidencia |
|---|---|---|
| **I1** | **Menú plano de 27 ítems** sin agrupar/buscar en escritorio y móvil; coste alto de encontrar una función | `Sidebar.tsx:126-156`, `MobileNav.tsx:141-172` |
| **I2** | **Nombres que colisionan**: «Centro Control Ejecutivo» (`dashboard`), «Centro de Control» (`administracion`), «Inicio y Resumen General» (`inicio`) | `Sidebar.tsx:127-128`, `Header.tsx:56-58` |
| **I3** | **Sección `inicio` inalcanzable** en todas las listas de navegación de todos los perfiles | `grep` en Sidebar/MobileNav: sin `'inicio'` |
| **I4** | **Navegación no representada en la URL** (sin router): recargar pierde la pantalla; no hay enlaces compartibles ni atrás/adelante | ausencia de router; `pushState` sólo limpia tokens |
| **I5** | **3 fuentes duplicadas de navegación y guardas** y **divergencia ya existente** (`inversion` permitida y no ofrecida al profesional) | `Sidebar.tsx`, `MobileNav.tsx`, `App.tsx:319-347` |
| **I6** | **Sin feedback de éxito de operaciones** (4 mensajes en todo el ERP) y dos implementaciones ad-hoc distintas | `FacturaElectronicaB2BPanel.tsx:92-114`, `MorosidadSection.tsx:111-167` |
| **I7** | **25 `window.confirm` + 3 `window.alert`** nativas, bloqueantes y fuera del diseño, pese a existir `ConfirmDeleteModal` | 16 ficheros |
| **I8** | **Modales sin semántica ni teclado**: 4 `role="dialog"`, 3 `aria-modal`, 0 focus-trap, sin `Escape`, sin restauración de foco | 103 contenedores `fixed inset-0` |
| **I9** | **Ayuda contextual ausente en móvil** (`ContextualHelp` sólo en el Header de escritorio y en el portal inquilino) | `Header.tsx:119`; `MobileNav.tsx` sin `ContextualHelp` |
| **I10** | **Sin scroll al inicio al cambiar de sección**; en móvil se hereda la posición del desplegable | ausencia de `scrollTo` |
| **I11** | **Jerga interna de desarrollo visible** («BLOQUE D», «GAP 1/6») | `Header.tsx:82`, `MorosidadDetalleModal.tsx` |
| **I12** | **Formularios sin etiqueta asociada**: 1035 controles vs 27 `htmlFor` (el placeholder hace de etiqueta y desaparece al escribir) | `grep` |
| **I13** | **Grids fijos no responsive** (`grid-cols-3/4/6` sin breakpoint) en ~25 bloques de formulario → campos comprimidos en móvil | `GastoModal:373,416`, `PrestamoModal:339+`, `ValoracionProfesionalModal:236`… |

### 3.3 UX-MEJORA — refinamiento sin bloqueo

| ID | Hallazgo |
|---|---|
| M1 | 10+ variantes de contenedor de estado vacío; el patrón bueno (icono + título + explicación + siguiente paso) es local, no compartido |
| M2 | 28 secciones repiten su propio `<h2>`/subtítulo además del `Header` global (título duplicado en escritorio) |
| M3 | Inconsistencia de tarjetas KPI/tablas entre secciones del mismo dominio (p. ej. tesorería vs cobros) |
| M4 | Botones de acción de tabla con sólo icono (197 `title=` + 57 `aria-label` para 1333 botones): etiquetado desigual |
| M5 | 2 `aria-live` en todo el ERP: los avisos no se anuncian a lectores de pantalla |
| M6 | Los avisos ad-hoc usan `setTimeout(9000)` sin componente común (desaparecen o se quedan) |

### 3.4 NO TOCAR — funcionan y su modificación tendría riesgo innecesario

1. **Motores puros** de Bloques 2–9 (`*Engine.ts`, `src/tesoreria/*`, `src/utils/morosidad/*`, `src/utils/actas/*`, `src/utils/conciliacion/*`, `src/sindicacion/*`, `src/notificaciones/*`).
2. **`firestore.rules` / `storage.rules` / `firestore.indexes.json`**: ninguna necesidad UX demostrada las justifica.
3. **Contratos de datos y colecciones**: sin cambios.
4. **RBAC y scoping por propietarioId/tenant** (`authService.ts`, guard de `App.tsx`): se reutilizan tal cual; cualquier cambio de menú **no** altera qué secciones son accesibles.
5. **Capa transversal §6** (ayuda, tutoriales, asistente, progreso): funciona y está testeada (`experiencia*.test.ts*`, `centro-ayuda.b9.ui.test.tsx`); sólo se ampliará su anclaje en móvil sin tocar motores.
6. **Portal del Inquilino** (shell móvil propio, aislado, validado E): fuera del alcance de este bloque.
7. **`DashboardEjecutivoSection`** en su interior: es el patrón correcto del ERP; se reutilizará su enfoque, no se rediseñará.

---

## 4. PRIORIZACIÓN (Fase 3)

Secuencia propuesta, alineada con el orden exigido:

| # | Subbloque UX | Cubre | Riesgo | Impacto |
|---|---|---|---|---|
| **UX-1** | **Navegación y arquitectura de información**: una única fuente de verdad del menú, agrupación por áreas, desambiguación de nombres de paneles, paridad móvil/escritorio, conservación de `data-tour` | I1, I2, I3, I5, parte de I4 | **Bajo** (2 componentes + 1 módulo nuevo; sin datos, sin reglas, sin permisos) | **Alto** |
| UX-2 | Estados de datos: carga / error / vacío reales (activar `loadingMain`, distinguir «cargando» de «vacío», error de lectura con reintento) | C1, C2, C4, M1 | Medio (toca host y props de secciones) | Alto |
| UX-3 | Feedback de operaciones: avisos no bloqueantes de éxito/error, confirmaciones propias, aviso de guardado fallido | C3, I6, I7, M6 | Medio (toca handlers) | Alto |
| UX-4 | Accesibilidad de diálogos: `role="dialog"`, `aria-modal`, foco, `Escape`, retorno de foco | I8, M5 | Medio | Medio-alto |
| UX-5 | Formularios: etiquetas asociadas, grids responsive, ayudas de campo | I12, I13 | Medio | Medio |
| UX-6 | Listados/tablas: cabecera, acciones etiquetadas, paginación/scroll, densidad | M3, M4 | Medio | Medio |
| UX-7 | Coherencia visual: cabeceras de sección sin duplicar el Header, tokens de estilo, estados vacíos unificados | M1, M2 | Bajo | Medio |
| UX-8 | Navegación reflejada en URL (deep-link de secciones) | I4 | Medio-alto | Medio |
| UX-9 | Ayuda contextual en móvil + coherencia del Centro de Ayuda | I9 | Bajo | Medio |
| UX-10 | Refinamientos visuales y jerga interna en textos de usuario | I11, M3 | Bajo | Bajo-medio |

### Primer subbloque seleccionado: **UX-1 — Navegación y arquitectura de información**

Motivo: es el punto 1 de la priorización exigida, es **aislable** (no toca motores, datos, reglas ni permisos), su impacto funcional es inmediato (encontrar y entender las 38 pantallas), y **elimina de raíz** la duplicación que ya ha producido una divergencia real (I5). Deja preparado el terreno para UX-8 (enlaces por sección) sin comprometerse con ella.

**Alcance previsto de UX-1 (aún no implementado):**
1. Módulo único de navegación (secciones, etiquetas, iconos, descripciones, grupo funcional, perfiles) sin lógica de permisos nueva: los arrays de acceso se **derivan** de la fuente única conservando exactamente los mismos valores actuales.
2. `Sidebar` y `MobileNav` pasan a consumir esa fuente; agrupación visual por áreas con encabezado y navegación por teclado; sin cambiar ningún destino.
3. Desambiguación de etiquetas («Centro de Control Ejecutivo» vs «Centro de Control» vs «Inicio») **sin** eliminar pantallas ni funcionalidad.
4. Paridad móvil/escritorio: el menú móvil ofrece exactamente los mismos destinos agrupados.
5. Preservación estricta de `data-tour="nav-<seccion>"` (tutoriales §6) y de los badges actuales.
6. Pruebas UI nuevas: mismo conjunto de destinos por perfil, agrupación, `data-tour` intactos, y que el menú no ofrece destinos fuera del guard de perfil.

---

## 5. INCIDENCIAS (Fase 9 de la orden)

| Tipo | Incidencia | Estado |
|---|---|---|
| Infraestructura | **INFRA-01 — Firebase Emulator**: sigue bloqueado (sin JDK/JAR descargables). **No se reintenta instalación en este bloque**, según la orden | Documentada; no afecta a UX-1 |
| Infraestructura | Clon **shallow** (1 commit): impide auditar historia detallada localmente; no afecta al trabajo ni a la validación | Documentada |
| No bloqueante | `docs/…` referencian ramas/SHA históricos de otras arenas; el mapa maestro ya lo advierte | Documentada; fuera de alcance |
| Transversal | Repositorio sin script de test global (`npm test`) ni de build-check documentado: cada batería se invoca por nombre | Documentada; se usa `npx vitest run` |

---

## 6. SIGUIENTE PASO

Implementar **UX-1 — Navegación y arquitectura de información** conforme al alcance de §4, con pruebas nuevas, en un único commit descriptivo, **sin fusionar en `main`** y sin tocar motores, datos, reglas ni permisos.
