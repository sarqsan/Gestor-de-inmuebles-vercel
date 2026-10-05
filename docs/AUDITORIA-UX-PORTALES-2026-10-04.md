# Auditoría UX + Diseño objetivo · Portal Propietario y Portal Inquilino

Fecha: 2026-10-04 · Rama de auditoría: `arena/01a10613-gestor-de-inmuebles-vercel`
Base verificada: `HEAD` = `4b7fdd9f4a001ca4c714576fbf6c98d8e21c04cc` (clean, salvo los dos ficheros de F4b ya entregados).
Tipo de informe: **READ-ONLY**. No se ha modificado código, reglas, modelos, suscripciones, navegación, sidebars, ni se ha ejecutado migración, commit, merge ni deploy alguno.

> Principio rector: *«si mañana entra por primera vez un propietario o un inquilino, ¿qué queremos exactamente que vea y pueda hacer desde el primer minuto?»*
> Reglas inamovibles: las Rules siguen siendo la autoridad; no se ha tocado `firestore.rules`, `storage.rules`, `legadoTitulares.ts`, `permisosTitulares.ts`, `titularesModelo.ts`, `titularidadInmueble.ts`, `gestionesCartera*.ts`, `accesoGestores.ts`, `accesoPropietarios.ts`, `navegacion.ts`, `App.tsx`, `Sidebar.tsx`, `Header.tsx`. La funcionalidad se oculta, no se borra. Los flujos MASTER_ADMIN y ADMINISTRADOR no se ven afectados.

---

## A. Estado inicial (cómo se entra hoy)

| Punto de entrada | Hoy | Comentario |
|---|---|---|
| Propietario (login normal) | Entra al ERP con el `Sidebar` global; la sección por defecto es `propietarios` (Mi Portal Propietario), con Header + MobileNav del ERP. Las demás secciones visibles dependen del `route guard` (`SECCIONES_PROPIETARIO` = 21 secciones permitidas). | Comparte chrome con el ERP. El propietario nunca ve una pantalla "sólo mía": está dentro del ERP. |
| Inquilino (login normal) | El guard de `App.tsx` (`currentUser.tipoPerfil === 'INQUILINO'`) renderiza **directamente** `<InquilinoPortalShell usuario={currentUser} onLogout={handleLogout} />`. No hay Sidebar, no hay Header global, no hay MobileNav: el inquilino nunca ve el ERP. | Es un portal **aislado**, no una sección del ERP. |
| Propietario por invitación (sin cuenta) | Ruta `?registro=` → flujo de `PropietarioPortal` (público) para crear cuenta y ficha fiscal. | Auditoría previa (F4b) lo dejó alineado. |
| Inquilino por invitación (sin cuenta) | Ruta `?registroInq=` → `<RegistroInquilinoView>` (público, 248 líneas) → crea cuenta, valida `EnlaceRegistro` y entra al `InquilinoPortalShell`. | Es el único camino de onboarding del inquilino. |

**Implicación para la auditoría**: Propietario e Inquilino viven en **dos arquitecturas de entrada distintas** (sección-ERP vs. ruta dedicada). Cualquier rediseño que olvide esto provoca que el propietario siga compartiendo chrome con admin, y que el inquilino se quede sin centro de ayuda, sin tutoriales y sin onboarding.

---

## B. Inventario del Portal Propietario (como está hoy)

**Fichero**: `src/components/sections/PropietarioPortalSection.tsx` (2 048 líneas).
Renderizado en `App.tsx:4037`, `4196`, `4512` — siempre dentro de la sección `propietarios` del ERP, **con Sidebar/Header global visibles**.

### B.1 Chrome y sub-tabs
- **Cabecera** (`PropietarioPortalSection.tsx:642-666`): tarjeta blanca con `Home` azul, título "Portal del Propietario", badge `PROPIETARIO`, saludo y contador "Viviendas en cartera". Sin menú hamburguesa, sin logout (lo gestiona el `Header` global).
- **Panel de estado (F4b)** (`:686-714`, `data-testid="portal-estado-patrimonial"`): derivado, sin tecnicismos. `ShieldCheck` emerald cuando hay cartera; `Home` slate + CTA `Vincular mi primera vivienda` (`data-testid="portal-estado-vacio-cta"`) cuando no.
- **Sub-tabs** (F4b): strip horizontal scrollable, `border-b-2` azul para activa, badge con contador por tab.

| Sub-tab | Disponible cuando | Etiqueta | Icono | Contador | Notas |
|---|---|---|---|---|---|
| `viviendas` | **Siempre** | Mis Viviendas | `Home` | nº viviendas | Empty state con CTA `Dar de alta mi primera vivienda` (también `onCrearInmueble`). |
| `profesionales` | **Siempre** | Mis Profesionales | `Wrench` | nº privados | Catálogo público (siempre visible) + pestaña `privados` (los del propietario). |
| `titularidades` | `misViviendas.length > 0` | Titulares / Titularidades | `Users` | — | Solo si hay al menos una vivienda. Muestra `TitularidadesPanel`. |
| `contratos` | cartera patrimonial | Mis Contratos | `FileCheck` | nº contratos | Lista + detalle (botón "Ver PDF"). |
| `liquidaciones` | cartera patrimonial | Mis Liquidaciones | `Wallet` | nº liquidaciones | Lista + detalle (`liqDetalleId`) + `imprimirLiquidacionPDF`. |
| `morosidad` | cartera patrimonial | Morosidad | `AlertTriangle` | nº con saldo > 0 | Lee `morosidadResumenPropietario` (espejo BLOQUE C, sin datos del inquilino). |
| `gastos` | cartera patrimonial | Gastos | `TrendingDown` | nº gastos | Mismos filtros que `GastosSection`: inmueble, categoría, estado, búsqueda. |
| `cobros` | cartera patrimonial | Cobros | `DollarSign` | nº atención | Mismo motor puro que `CobrosSection`; `cobrosAtencion` (pendientes+retrasados+incidencias). |
| `incidencias` | cartera patrimonial | Incidencias | `AlertTriangle` | nº abiertas | `canAccessIncidencia` (puerta de permisos) + `filtrarIncidencias`. |
| `perfil` | **Siempre** | Mi Perfil | `User` | — | Edición de ficha fiscal (`onSavePropietario`). |

**F4b invariants**:
- `tieneCarteraPatrimonial = misViviendas.length > 0 || misContratos.length > 0 || misProfesionalesPrivados.length > 0`.
- `useEffect` de fallback que resetea `activeSubTab` al primero disponible si el activo desaparece.
- Aislamiento defensivo en profundidad: cada lista (`misViviendas`, `misCobros`, `misGastos`, `misIncidencias`, `miMorosidad`, `misLiquidaciones`) se filtra además por `currentUser.propietarioId` / `misViviendasIds` aunque el prop ya venga acotado desde `App`.

### B.2 Sub-vista "Mis Viviendas" (post-F4b)
- Cabecera con título + botón `Añadir vivienda` (`data-tour="portal-anyadir-vivienda"`).
- Empty state específico con icono + texto explicativo + CTA.
- Grid responsive de tarjetas (1/2/3 col) por vivienda con: tipo, renta (`inm.precio ?? inm.rentaMensual`), dirección+CP, **titular visible** (`datosFiscales.propietarioPrincipal.nombre`, +1 cotitular), hab/baños/m², nº técnicos asignados.
- CTA `Ver detalles de vivienda` → `onNavigateToInmueble(inm.id)` (salta a la sección `inmuebles`).

### B.3 Sub-vista "Titularidades" (N TITULARES, `TitularidadesPanel`)
- Selector de vivienda + alta/cierre de titular.
- Suscripción a `subscribeTitularidadesEscopo` por las **claves deterministas** (no por `list`, no por `or()`).
- Cierre NUNCA borra: pasa a histórico (`cerrarTitularidad`).
- `puedeGestionarTitularidades` exige ser titular canónico (no basta con ser cotitular).

### B.4 Sub-vista "Mis Profesionales" (`profesionalTab`)
- **Catálogo público** (`profesionalTab='catalogo'`): lista del `Profesional[]` global con `activo && !esPrivado`. Filtros: búsqueda, especialidad. Acciones: `Asignar a mis viviendas` (toggle en `inmuebleIdsAsignados`), `Copiar enlace de invitación` del portal público.
- **Privados** (`profesionalTab='privados'`): profesionales `creadoPorPropietarioId === currentUser.id` o `===propietarioId`. Alta vía `onOpenCrearProfesionalModal` (modal global del ERP).

### B.5 Sub-vista "Mis Contratos"
- Lista de contratos de las viviendas en cartera, con `inmuebleDireccion` + inquilino + estado.
- Detalle: `inmuebleDireccion`, fechas, renta mensual, fianzas, fianza legal depositada, generación de borrador de liquidación, IRPF/prorrateos.

### B.6 Sub-vista "Mis Liquidaciones" (BLOQUE B)
- Lista filtrada por `propietarioId`, excluye `ANULADA` y `REVERSADA`, ordenada por periodo desc.
- Detalle: líneas agrupadas (cobros/gastos) + impresión PDF (`imprimirLiquidacionPDF`).

### B.7 Sub-vista "Morosidad" (BLOQUE C)
- Resumen espejo: nº expedientes con saldo, importe total pendiente, lista por contrato.
- `data-testid="morosidad-*"` ya existentes en la sección interna.

### B.8 Sub-vista "Gastos"
- Mismo motor y mismas constantes que `GastosSection` (`resumenGastos`, `ESTADO_GASTO_LABEL`, `CATEGORIAS_GASTO`, `categoriaDef`, `etiquetaMesAnio`).
- Filtros: inmueble, categoría, estado, búsqueda libre.
- Detalle: concepto, proveedor, fecha, notas, importes.

### B.9 Sub-vista "Cobros"
- `actualizarEstadosVencimiento` + `obtenerTodosCobros` + `calcularResumenCobros` (idéntico a `CobrosSection`).
- Filtros: inmueble, estado, búsqueda.
- `cobrosAtencion` se muestra como contador de la sub-tab.

### B.10 Sub-vista "Incidencias"
- `canAccessIncidencia` como puerta de permisos (igual que la sección interna).
- `filtrarIncidencias` con los mismos filtros: búsqueda, inmueble, categoría, prioridad, estado.
- Detalle: notas internas, comunicación con profesional, evidencia.

### B.11 Sub-vista "Mi Perfil"
- Formulario fiscal con `nombre`, `nifCif`, `telefono`, `email`, `direccion`, `ciudad`, `codigoPostal`.
- `handleGuardarFicha` → `onSavePropietario` (pasa por el App, no escribe directo).
- `puedeEditarFicha` exige `onSavePropietario` y `currentUser.propietarioId`.

### B.12 Lo que **NO** tiene el portal del propietario
- **Sin `ContextualHelp`**: el botón `?` por pantalla no se renderiza en este componente. La ayuda del ERP sólo aparece en sus secciones internas.
- **Sin `AsistentePanel`**: el asistente IA transversal no se monta aquí.
- **Sin `TutorialPlayer`**: el recorrido `RECORRIDO_PROPIETARIO_PRIMEROS_PASOS` existe en `src/experiencia/tutoriales.ts:182` pero nadie lo invoca desde el portal.
- **Sin selector de "primera vez" / onboarding dedicado**: el estado vacío existe (F4b) pero no hay un tutorial obligatorio ni un Tour de 3 pasos de "te enseñamos tu portal".
- **Sin badge/centro de notificaciones**: la cabecera no tiene campana; las notificaciones viven dentro de cada sub-vista.

---

## C. Inventario del Portal Inquilino (como está hoy)

**Ficheros**:
- `src/components/portal-inquilino/InquilinoPortalShell.tsx` (370 líneas, leído completo).
- `PortalInicio.tsx` (126), `PortalRecibos.tsx` (118), `PortalIncidencias.tsx` (375), `PortalSuministros.tsx` (549), `PortalMensajes.tsx` (132), `PortalDocumentos.tsx` (134), `PortalHistorial.tsx` (76), `PortalContrato.tsx` (166), `PortalCuenta.tsx` (58), `MiniaturaEvidencia.tsx`, `RegistroInquilinoView.tsx` (248), `usePortalInquilino.ts` (158).
- Motores: `src/inquilino/portalEngine.ts` (430), `suministrosEngine.ts` (217), `actasAdapter.ts` (87), `scope.ts` (83).

**Renderizado**: en `App.tsx:3656`, el guard `tipoPerfil === 'INQUILINO'` devuelve **únicamente** `<InquilinoPortalShell usuario={currentUser} onLogout={handleLogout} />`. No hay Sidebar, no hay Header, no hay MobileNav. App entera = portal.

### C.1 Chrome y navegación
- **Contenedor**: `max-w-md mx-auto` (mobile-first), fondo `bg-gradient-to-b from-indigo-50 to-white`.
- **Header sticky** (`InquilinoPortalShell.tsx:114-…`): gradiente `indigo-700 → violet-700`, `Address` (dirección del contrato activo, selector pills si hay varios contratos), botones `Refresh` y `Logout`. Sin breadcrumb, sin avatar.
- **Bottom-nav 5 tabs**:
  | Tab key | Etiqueta | Icono | Sub-vista |
  |---|---|---|---|
  | `inicio` | Mi hogar | `Home` | `PortalInicio` |
  | `recibos` | Recibos y pagos | `Receipt` | `PortalRecibos` |
  | `incidencias` | Incidencias | `Wrench` | `PortalIncidencias` |
  | `suministros` | Suministros | `Zap` | `PortalSuministros` |
  | `mas` | Más opciones | `Menu` (badge rojo mensajes) | sub-vista `mas` con 5 enlaces secundarios |
  - Sub-tabs de "Más": `contrato` (Mi contrato), `mensajes` (Mensajes), `documentos` (Documentos), `historial` (Historial), `cuenta` (Mi cuenta).

### C.2 Estados de carga del Shell
1. **Cargando** (`loading && !error`): "Cargando tu portal…" + spinner.
2. **Error** (`error`): texto + botón "Reintentar" (`onRetry`).
3. **Sin contrato activo** (`datos.contratos.length === 0` y carga completa): **renderiza `null` en `<main>`**. No hay empty state. Sólo se ve el header.
4. **Con contrato activo**: header + bottom-nav + sub-vista activa. Si el contrato está en estado no "activo", se acepta igualmente la carga, pero el contrato se considera.

### C.3 Sub-vistas
- **PortalInicio** (`PortalInicio.tsx`): tarjeta blanca con foto del inmueble, dirección, ciudad, habitación (si aplica), renta mensual, estado del cobro del mes (Pagado/Pendiente/Retrasado/Sin recibo generado), CTA "Ver recibos y cómo pagar". Avisos (averías abiertas, mensajes no leídos) si los hay. 4 accesos rápidos: `Notificar avería`, `Dar lectura`, `Mensajes`, `Mi contrato`.
- **PortalRecibos** (`PortalRecibos.tsx`): total pendiente (rojo si >0), IBAN del propietario + día límite, lista de cobros ordenada desc por `periodoMesAnio`, badge de estado (`PENDIENTE/RECIBIDO/VERIFICADO/RETRASADO/INCIDENCIA`), botón "Justificante" si hay `c.justificante.url` o `storagePath`. Empty state: "Aún no hay recibos generados para este contrato."
- **PortalIncidencias** (`PortalIncidencias.tsx`): lista saneada (`sanearIncidenciaParaInquilino`) con expandable por avería; en expandido: descripción, resolución, profesional asignado (`vm.trabajo`), seguimiento (`vm.seguimiento` con timeline), evidencias (`MiniaturaEvidencia`). Modal de **nueva avería**: título, descripción, categoría (`FONTANERIA/ELECTRICIDAD/…/OTROS`), prioridad, fotos (subida a Storage), y al guardar `saveIncidenciaFirestore` + `vincularIncidenciaAContrato` + `auditarAccionPortal`. Validación con `validarIncidenciaInquilino` y `mensajeDeErrorUsuario`. Empty state con icono `Wrench` slate: "No tienes averías registradas."
- **PortalSuministros** (`PortalSuministros.tsx`): por suministro (LUZ/AGUA/GAS/INTERNET/OTRO) lista de lecturas inmutables (ordenadas desc), botón "Dar lectura" (modal: valor, fecha, foto del contador con `subirFotoLectura`), botón "Solicitar cambio de titular" (modal con `validarCambioTitular` + `solicitarCambioTitular`). `unidadSugerida` por tipo. Empty state si `suministros.length === 0`. Compatible con `miHabitacion` (si el usuario tiene `habitacionIdentificador`).
- **PortalMensajes** (`PortalMensajes.tsx`): hilo de chat entre `INQUILINO` y `GESTION`, con `marcarMensajeLeidoPorInquilino` automático al abrir (acuse de recibo). Burbujas diferenciadas, scroll al final al actualizar. Textarea + botón circular `Send`. `validarMensajePortal` (4000 chars). `auditarAccionPortal` con `INQUILINO_MENSAJE_ENVIADO`. Empty state: "Aún no hay mensajes. Escríbenos lo que necesites."
- **PortalDocumentos** (`PortalDocumentos.tsx`): 4 secciones: (1) Contrato y acta (`imprimirContratoPDF` + `actaEntregaLlaves`); (2) Actas de entrada/salida vía `actasAdapter.getActasByContrato` (vía reconciliación BLOQUE D); (3) Justificantes de cobros; (4) Evidencias de averías (miniaturas); (5) Fotos de lecturas (miniaturas). Cada uno con su `MiniaturaEvidencia`.
- **PortalHistorial** (`PortalHistorial.tsx`): timeline derivada de `construirHistorialInquilino` con categorías `CONTRATO/RECIBO/INCIDENCIA/SUMINISTRO/MENSAJE/DOCUMENTO`. Iconos + fecha + detalle. Empty state: "Aún no hay actividad registrada."
- **PortalContrato** (`PortalContrato.tsx`): vista saneada con `sanearContratoParaInquilino`; 5 secciones (Renta y pago, Vigencia, Arrendador, Firmas, Cláusulas adicionales) + **Acta de entrega de llaves** colapsable (con contadores iniciales, pintura, limpieza, observaciones) + `imprimirContratoPDF`. Botón "Copiar IBAN" (con `navigator.clipboard` + estado "IBAN copiado" 2s).
- **PortalCuenta** (`PortalCuenta.tsx`): avatar de iniciales, nombre+apellidos, email, teléfono, nº contratos vinculados, habitación, último acceso. Mensaje: "Si necesitas cambiar tu email, tu teléfono o desvincular un contrato, contacta con gestión desde la sección de mensajes." Botón "Cerrar sesión".

### C.4 Hook `usePortalInquilino` (158 líneas, leído)
- 1 `onSnapshot` por cada `contratoId` (`doc(db, 'contratos', id)`).
- Para cada contrato: `getContratoById`, `getInmuebleById`, `getIncidenciasByIds` (índices), `getMensajesByIds`, `getSuministrosByIds` (desde `inmueble.suministroIds`), `getLecturasByIds`, `getCambiosByIds`, `getActasByContrato` (query BLOQUE D, Reconciliación).
- Si `contratoIds` está vacío: estado `error = "Tu cuenta no tiene contratos vinculados. Contacta con gestión."`.
- Si `getContratoById` devuelve `[]`: `error = "No se han podido cargar tus contratos. Revisa tu conexión e inténtalo de nuevo."`.
- Recarga manual: `recargar()`. Ref counter para evitar condiciones de carrera.

### C.5 Lo que **NO** tiene el portal del inquilino
- **Sin panel de "estado de mi cuenta" tipo F4b**: si no hay contratos, el `<main>` se queda en blanco (render `null`).
- **Sin onboarding dedicado al primer acceso**: tras `RegistroInquilinoView.onComplete` se entra directo al portal, no hay tour de "estos son tus 5 botones".
- **Sin selector de "primer mes a pagar / bienvenida"**: el usuario debe descubrir `PortalRecibos` por su cuenta.
- **Sin badge/CTA "tienes 1 recibo pendiente de revisar"** en la home que sea persistente (sí aparece en `PortalInicio` cuando `mensajesNoLeidos > 0` o `abiertas > 0`, pero no para recibos).
- **Sin `ContextualHelp` por pantalla interna**: el Shell lo importa pero no lo instancia por sub-vista. Existe `ayudaVisibleEn(...)` con `host: 'PORTAL_INQUILINO'` en el registro, pero **no hay registro de ayuda específico** para las pantallas `recibos/incidencias/suministros/...` (lo confirmo: `MODULO_POR_VISTA_PORTAL` existe pero las entradas en `ayuda.ts` referencian módulos, no pantallas, y los registros `host: 'PORTAL_INQUILINO'` son escasos o nulos para las pantallas internas).
- **Sin `AsistentePanel` montado en el Shell**: está disponible en el motor (`capabilitiesDisponibles(ctx)` funciona con `host:'PORTAL_INQUILINO'`) pero el Shell no lo incluye. Las capacidades de IA para inquilino no están activadas.
- **Sin `TutorialPlayer` auto-arrancado**: el recorrido `RECORRIDO_PORTAL_INQUILINO` existe y tiene 5 pasos (`inicio`/`recibos`/`averias`/`lecturas`/`mensajes`), pero el Shell no lo dispara.
- **Sin progreso persistido del tutorial por usuario**: `servicioProgresoTutoriales` existe (`src/lib/progresoTutorialesFirestore.ts`) pero la primera visita no lo activa.
- **No permite cambiar de contrato sin logout**: el selector pills del header es la única vía, y si falla la suscripción, no hay forma de forzar recarga desde la sub-vista (sí hay botón Refresh global).
- **El estado "sin contrato activo"** es confuso: header visible + main vacío. No dice "Espera, no tienes contrato todavía" ni "Contacta con gestión".

---

## D. Comparación estructural (Portal Propietario vs. Portal Inquilino)

| Dimensión | Portal Propietario | Portal Inquilino |
|---|---|---|
| Punto de montaje | `App.tsx` como `SectionType` `propietarios` | `App.tsx` corta el render y devuelve solo el Shell |
| Chrome global (Sidebar/Header) | **Sí, completo** (con todos los modulos permitidos) | **No** (portal aislado) |
| Identidad visual | Tarjetas blancas 2xl, paleta slate/blue/indigo | Bottom-nav indigo/violet, `max-w-md`, mobile-first |
| Navegación primaria | Sub-tabs horizontales (10) | Bottom-nav (5 + 5 en "Más") |
| Primer acceso / onboarding | Empty state en sub-tab `viviendas` con CTA + `data-tour` | `RegistroInquilinoView` (creación de cuenta); sin tour al entrar |
| Estado de carga | Sin spinner dedicado (sólo un `useEffect` interno) | "Cargando tu portal…" + spinner |
| Estado vacío (sin cartera/contratos) | Panel `data-testid="portal-estado-patrimonial"` con CTA | `null` en `<main>` (sólo header) |
| Centro de ayuda contextual | **Ausente** | **Ausente** (existe la infra) |
| Asistente IA | **Ausente** | **Ausente** (existe la infra) |
| Tutoriales | `RECORRIDO_PROPIETARIO_PRIMEROS_PASOS` existe (6 pasos), no se dispara | `RECORRIDO_PORTAL_INQUILINO` existe (5 pasos), no se dispara |
| Progreso de tutorial persistido | No se monta | No se monta |
| Selector de contrato / cartera | Implícito (la cartera del propietario es 1) | Explícito (pills en header si hay varios) |
| Acciones de escritura | Añadir vivienda, alta/cierre de titular, alta de profesional privado, edición ficha fiscal | Notificar avería, dar lectura, solicitar cambio de titular, enviar mensaje, descargar contrato |
| Acciones de lectura | Viviendas, profesionales, contratos, liquidaciones, gastos, cobros, incidencias, morosidad, titularidades | Inicio, recibos, contrato, mensajes, documentos, historial, suministros, cuenta |
| Datos a los que accede | Todo lo del ERP filtrado por cartera (reglas + `currentUser.propietarioId` + `misViviendasIds`) | Sólo lo del inquilino (reglas deny-list + recorrido por índices) |
| Auditoría del usuario | `auditarAccionPortal` + `INQUILINO_MENSAJE_ENVIADO` y similares | `auditarAccionPortal` desde varios sub-componentes |
| Multi-idioma / i18n | No | No |
| Accesibilidad | Básica (button roles, aria-expanded en incidencias, useDialogoAccesible) | Básica (aria-label en send, useDialogoAccesible, escape cierra paneles) |
| Responsive | Desktop-first con grid responsive | Mobile-first `max-w-md` |

**Conclusión**: ambos portales son **visualmente coherentes** dentro de su estilo (slate/indigo/violet), pero **operan en arquitecturas de entrada distintas** y **ninguno aprovecha la capa transversal de experiencia** (§6) que ya existe (`ContextualHelp`, `AsistentePanel`, `TutorialPlayer`, `servicioProgresoTutoriales`).

---

## E. Centro de Ayuda / Tutoriales / IA (capa transversal §6)

**Ficheros**: `src/experiencia/*` (5 737 líneas), `src/components/experiencia/*` (3 componentes + 4 tests).
Exportado por `src/experiencia/index.ts`.

### E.1 Piezas disponibles
- **`ContextualHelp`** (`ContextualHelp.tsx`, 182 líneas): botón `?` que abre panel con entradas `ayudaParaContexto(ctx)`. Filtra por `contextoCumpleRoles` + `contextoTienePermiso`. Si no hay entradas, **no renderiza nada** (no rompe pantallas vacías). Variantes `icono|texto`, temas `claro|oscuro`. Ya integrado en el ERP.
- **`AsistentePanel`** (`AsistentePanel.tsx`, 302 líneas): botón `Sparkles` + panel con `resolverPeticion` (Gemini remoto via `crearProveedorGeminiRemoto`, fallback local). Acciones del host: `NAVEGAR`/`EXPLICAR`/`TUTORIAL`/`CONSULTAR`. Validación IA + `validarResolucionIA` + `ejecutarResolucion`. Etiqueta cambia: "Asistente del portal" vs. "Asistente del ERP". Si `capacidadesDisponibles(ctx).length === 0` **no renderiza**.
- **`TutorialPlayer`** (`TutorialPlayer.tsx`, 305 líneas): overlay con `selectorTour`, `localizarTarget`, scroll-to, `ATRIBUTO_TOUR`, `ID_OVERLAY_RESALTADO`. Pasos consumen `TUTORIALES_REGISTRO` + `evaluarPaso` + `avanzar/retroceder/finalizar`.
- **Tutoriales existentes** (`tutoriales.ts`, 359 líneas):
  | ID | Módulo | Host | Roles | Pasos |
  |---|---|---|---|---|
  | `tutorial.liquidacion` | `tesoreria` | ERP | (admin) | 5 |
  | `recorrido.inquilinos.invitar` | `inquilinos` | ERP | (admin) | (varios) |
  | `recorrido.portal.primeros-pasos` | `inquilinos` | `PORTAL_INQUILINO` | `['INQUILINO']` | 5 (inicio/recibos/averias/lecturas/mensajes) |
  | `recorrido.propietario.primeros-pasos` | `propietarios` | `ERP` | `['PROPIETARIO']` | 6 (portal/viviendas/titularidad/dinero/datos/ayuda) |
- **Persistencia de progreso** (`progreso.ts` 161 + `progresoTutorialesFirestore.ts` 280 + tests): `rutaProgreso(host, userId, tutorialId)`, `MAX_PASOS_PROGRESO`, `sesionDesdeProgreso` ↔ `progresoDesdeSesion`, `esProgresoValido`.
- **Mapeo portal**: `MODULO_POR_VISTA_PORTAL` (inicio, contrato, recibos, incidencias, mensajes, documentos, suministros, historial, cuenta, mas) + `PANTALLAS_PORTAL` whitelist.

### E.2 Lo que NO está cableado en los portales
- **En el Portal Propietario**: ni `ContextualHelp` ni `AsistentePanel` ni `TutorialPlayer` se importan. El recorrido `recorrido.propietario.primeros-pasos` no se auto-dispara (sus targets como `nav-propietarios`/`nav-inmuebles`/`nav-cobros`/`nav-datos`/`nav-ayuda` viven en el Sidebar del ERP, no en el portal).
- **En el Portal Inquilino**: el Shell importa `ContextualHelp` y `AsistentePanel` pero **no los instancia en las sub-vistas internas**. El `RECORRIDO_PORTAL_INQUILINO` tiene `selectorTour('portal-tab-inicio')` etc., pero el Shell no dispara el `TutorialPlayer` y no monta los `data-tour` en los botones del bottom-nav.
- En ambos casos, el **Centro de Ayuda global** (la sección `ayuda` del ERP) no es alcanzable desde los portales (el inquilino no ve el ERP; el propietario lo ve pero como una más de las 21 secciones, sin entrada directa desde el portal).

### E.3 Capacidades de IA
- `CAPACIDADES_ERP` y `capacidadesDisponibles(ctx)` controlan qué puede resolver la IA. El motor existe, pero **no se ha hecho una pasada para definir `CAPACIDADES_PORTAL_INQUILINO`** (navegar entre pantallas + explicar + tutorial + quizá consultar mis recibos/lecturas/averías). En el portal del propietario lo propio: `CAPACIDADES_PORTAL_PROPIETARIO` (navegar entre sub-tabs + explicar + consultar mi cartera).

---

## F. Problemas UX por criticidad

### F.1 Críticos (bloquean el primer minuto)

| # | Severidad | Portal | Problema | Hoy |
|---|---|---|---|---|
| F-1 | 🔴 | Inquilino | "Sin contrato activo" muestra **header pero `<main>` vacío** (`null`). | El usuario nuevo o recién invitado no entiende qué pasa. |
| F-2 | 🔴 | Inquilino | Si falla la carga de `getContratoById` se muestra error técnico plano, sin CTA a "hablar con gestión". | Bloqueante. |
| F-3 | 🔴 | Propietario | Si el propietario nunca abre la sección `propietarios` (porque su sección por defecto puede no ser esa, o porque su `route guard` le muestra primero `dashboard` o `inmuebles`), no descubre que existe el portal propio. | El portal existe pero está enterrado. |
| F-4 | 🔴 | Inquilino | Onboarding post-registro: tras `onComplete` se entra directo al portal sin ningún "tutorial de 30 segundos". | Pérdida de valor inmediato. |
| F-5 | 🔴 | Ambos | No hay **tutorial auto-disparado** ni **centro de ayuda contextual** ni **asistente IA** en ninguna pantalla de los portales. | La capa §6 está sin cablear. |

### F.2 Altos (visibilidad/confianza)

| # | Severidad | Portal | Problema |
|---|---|---|---|
| F-6 | 🟠 | Inquilino | El header sólo muestra dirección. No hay nombre del propietario ni un avatar del inquilino. Falta sensación de "persona real". |
| F-7 | 🟠 | Inquilino | "Más" tiene badge rojo de mensajes pero el resto de pestañas no refleja contadores (recibos pendientes, averías abiertas). La home sí los lista, pero no son persistentes al cambiar de tab. |
| F-8 | 🟠 | Propietario | El badge `PROPIETARIO` y el header del ERP conviven. Si el usuario es propietario y entra al ERP ve el logo del ERP; al pasar a `propietarios` ve "Portal del Propietario" pero sin una cabecera propia. Sensación de "sección más", no de portal. |
| F-9 | 🟠 | Propietario | Sub-tab `titularidades` está en 3ª posición sin un icono dominante y sin un mensaje "¿qué es una titularidad?" para un propietario nuevo. |
| F-10 | 🟠 | Inquilino | La unidad del recibo (`€`) sale sin espacio (`1234.56 €` en algunos casos por concatenación directa). Revisar. |
| F-11 | 🟠 | Inquilino | `PortalSuministros` no avisa de "tienes una lectura pendiente de este mes" si se acerca el cierre. |
| F-12 | 🟠 | Propietario | No hay forma de **exportar mis datos** (CSV/JSON) desde el portal. Está en `datos` (Importar/Exportar) del ERP, pero no es visible desde aquí. |

### F.3 Medios (detalles que restan)

| # | Severidad | Portal | Problema |
|---|---|---|---|
| F-13 | 🟡 | Inquilino | `PortalInicio` muestra "Sin recibo generado" pero no distingue entre "aún no es día de generar" y "gestión no lo ha emitido". |
| F-14 | 🟡 | Inquilino | `PortalIncidencias` al crear no muestra "te confirmamos que la hemos recibido" en pantalla (sólo cierra modal). |
| F-15 | 🟡 | Inquilino | `PortalDocumentos` no diferencia claramente "acta firmada" vs. "acta pendiente de firma" más allá de un `· Firmada` textual. |
| F-16 | 🟡 | Propietario | En `Mis Viviendas`, el nº de técnicos asignados es correcto pero no hay CTA "asignar técnico" desde la tarjeta. Hay que ir a `profesionales`. |
| F-17 | 🟡 | Propietario | `Mi Perfil` sólo edita datos fiscales. No hay foto, no hay datos de contacto de emergencia, no hay cambio de contraseña (lo gestiona el ERP, pero sin enlace). |
| F-18 | 🟡 | Ambos | No hay rastro de "última sincronización" visible. El inquilino tiene botón `Refresh` global, el propietario no. |
| F-19 | 🟡 | Inquilino | La pill de "habitación" (en alquiler por habitaciones) sólo aparece en `PortalInicio` y en el sub-formulario de creación de incidencia. El contrato lo muestra, pero la vivienda activa no. |
| F-20 | 🟡 | Propietario | El F4b añadió "Vincular mi primera vivienda" al panel de estado, pero el `onCrearInmueble` salta a la sección `inmuebles` del ERP, donde el alta general NO preselecciona la titularidad del propietario. Esto contradice el paso 2 del tutorial `recorrido.propietario.primeros-pasos`. |

---

## G. Diseño objetivo · Portal Propietario (qué queremos que vea y haga un propietario el día 1)

### G.1 Identidad y arquitectura
- **Mantenerlo dentro del ERP** (no se va a hacer un portal separado). Razones: reuso del Sidebar/Header, reuso del route guard, reuso de suscripciones ya en marcha, reuso del F4b. **No se renombra la sección**: sigue siendo `propietarios` y sigue siendo "Mi Portal Propietario".
- **Cabecera propia del portal**: añadir una **sub-cabecera** (no Header global) que diga "Tu espacio patrimonial" y muestre el nombre del titular canónico + nº de viviendas + nº de cotitulares. El header global del ERP se mantiene por encima (no se toca, según restricciones).
- **Mantener F4b**: panel `portal-estado-patrimonial` + sub-tabs condicionales + fallback `useEffect`.

### G.2 Lo que debe ver un propietario nuevo (cartera vacía)
- Cabecera del ERP + "Portal del Propietario" + panel F4b (estado `vacio`) con:
  - Mensaje: *"Bienvenido, [nombre]. Este es tu espacio patrimonial. Aquí verás tus viviendas, contratos, cobros, gastos e incidencias."*
  - CTA principal: **"Añadir mi primera vivienda"** (que abre el alta con la **titularidad del propietario preseleccionada** — esta es la pieza que falta; hay que reutilizar `propietarioContextoAltaId`).
  - CTA secundario: **"Ver el recorrido de 1 minuto"** (dispara `RECORRIDO_PROPIETARIO_PRIMEROS_PASOS`).
- Sub-tabs visibles: `viviendas`, `profesionales`, `perfil`. Las demás **ocultas** (F4b ya lo hace).

### G.3 Lo que debe ver un propietario con cartera
- Cabecera del ERP + "Portal del Propietario" + panel F4b (estado `ok`) con resumen verde.
- 10 sub-tabs (todas las que F4b ya muestra). Diferenciación visual en los contadores:
  - `incidencias` badge rojo si `incAbiertas > 0`.
  - `cobros` badge ámbar si `cobrosAtencion > 0`.
  - `morosidad` badge rojo si `morosidadTotalPendiente > 0`.
- **Botón flotante de ayuda** (`?`) abajo a la derecha (sólo en el portal, no en el resto del ERP) que abra un `AsistentePanel` con `host: 'ERP'`, `section: 'propietarios'`, y un set de capacidades `CAPACIDADES_PORTAL_PROPIETARIO` (a definir): navegar entre sub-tabs, explicar "¿qué es una titularidad?", consultar "dame el total de cobros pendientes de mi cartera", iniciar el tutorial.

### G.4 Reglas de UX que se mantienen
- El modal de "Añadir vivienda" debe preseleccionar al titular canónico (sin esto el F4b no cierra el ciclo del día 1).
- Los filtros y resúmenes de Gastos/Cobros/Incidencias son **idénticos** a las secciones internas (mismo motor, misma etiqueta, mismo permiso).
- El alta de titular nunca crea cuenta de acceso; el cierre nunca borra.
- El botón de "Sincronizar / Refrescar" se añade a la cabecera del portal (no al header global).

### G.5 Cableado de la capa §6
- `RECORRIDO_PROPIETARIO_PRIMEROS_PASOS` se auto-dispara en el **primer acceso** (detección: `progreso.esProgresoValido(...)` o `sesionDesdeProgreso` → no existe para `tutorialId`). Botón "Repetir recorrido" en la cabecera.
- `ContextualHelp` por sub-vista: reutilizar el registro existente de `ayuda.ts` (los IDs ya son por módulo+sección, basta con pasar `section: 'propietarios'`) y reusar los textos que ya están escritos. Se monta en la cabecera de la sub-vista.
- `AsistentePanel` flotante con `host:'ERP'`, `section: 'propietarios'`, con `accessibleSections: SECCIONES_PROPIETARIO` para que pueda navegar al resto del ERP.

---

## H. Diseño objetivo · Portal Inquilino (qué queremos que vea y haga un inquilino el día 1)

### H.1 Identidad y arquitectura
- **Mantener el portal aislado** (no se mete en el ERP). Razones: reglas deny-list, contratos personales, sin acceso a cartera de gestión, sin sidebar. El inquilino **no es** un usuario del ERP.
- **Mantener el Shell** `InquilinoPortalShell.tsx` como única raíz. **No se renombran** las 5 tabs ni las 5 sub-tabs de "Más".
- **Mantener** el header con dirección + pills de contrato + `Refresh` + `Logout`, y el bottom-nav con badge rojo de mensajes.

### H.2 Lo que debe ver un inquilino nuevo (sin contratos)
- **Cambio principal**: cuando `datos.contratos.length === 0` y la carga terminó, en lugar de `null` en `<main>` se renderiza una **tarjeta de bienvenida** con:
  - Icono `Home` slate.
  - Texto: *"Hola, [nombre]. Tu cuenta está activa pero todavía no tienes un contrato vinculado. Cuando gestión te vincule a tu vivienda aparecerá aquí."*
  - CTA: **"Hablar con gestión"** → cambia a `mas → mensajes` con un `?nuevo=1` o abre directamente un hilo pre-armado ("Hola, soy [nombre] y acabo de registrarme…").
  - Enlace secundario: **"Ver el recorrido de 1 minuto"** (dispara `RECORRIDO_PORTAL_INQUILINO` adaptado al estado sin contratos: salta los pasos de `averias`/`lecturas` o los marca como "cuando tengas una avería…").
- El header se mantiene (no es un error).

### H.3 Lo que debe ver un inquilino con contrato
- Home (`PortalInicio`) tal como está, con **un único ajuste**: si `periodoActual` aún no tiene recibo, mostrar "Tu recibo de [mes] se publica el día [diaLimitePagoMes]" en vez de "Sin recibo generado". Esto elimina F-13.
- **Indicador global de "pendientes de tu atención"** en la barra de tabs:
  - `Recibos` badge rojo si hay `PENDIENTE/RETRASADO`.
  - `Incidencias` badge rojo si `abiertas > 0`.
  - `Más` ya tiene badge de mensajes.
- **Botón flotante de ayuda** (`?`) abajo a la derecha: `AsistentePanel` con `host: 'PORTAL_INQUILINO'`, `section: activa`, y `CAPACIDADES_PORTAL_INQUILINO` (a definir): navegar a `recibos/incidencias/suministros/mensajes/...`, explicar "¿qué es la fianza?", "¿qué incluye mi renta?", consultar "dame el importe pendiente de mis recibos", iniciar tutorial.
- **`ContextualHelp` por sub-vista**: botón `?` en la cabecera de cada sub-vista. Hay que **registrar entradas de ayuda** en `ayuda.ts` con `host: 'PORTAL_INQUILINO'` y `section: <pantalla>` (módulos ya mapeados en `MODULO_POR_VISTA_PORTAL`).
- **`TutorialPlayer` auto-disparado** en el primer acceso: `RECORRIDO_PORTAL_INQUILINO` con persistencia via `servicioProgresoTutoriales`. Botón "Repetir recorrido" en el header.

### H.4 Reglas de UX que se mantienen
- El recibo del mes se obtiene del contrato (no se consulta nada fuera del scope del inquilino).
- La fianza, el acta de entrega y el contrato PDF se siguen descargando via `imprimirContratoPDF` (que abre ventana de impresión).
- El cambio de titular de suministro requiere foto del contador (ya lo pide el modal).
- El envío de mensajes es **gratis** (sin tope visible al usuario), pero la auditoría se registra.

### H.5 Cableado de la capa §6
- Crear las entradas de ayuda en `ayuda.ts` con `host: 'PORTAL_INQUILINO'` y `section` ∈ `PANTALLAS_PORTAL` (módulos ya están en `MODULO_POR_VISTA_PORTAL`). Reutilizar los textos que ya existen donde aplique.
- Definir `CAPACIDADES_PORTAL_INQUILINO` (puente entre `intenciones.ts` y la whitelist del portal) y exponerlo en `asistente.ts` (sin tocar el ERP).
- Persistir el progreso de `RECORRIDO_PORTAL_INQUILINO` con `servicioProgresoTutoriales` + `rutaProgreso('PORTAL_INQUILINO', userId, 'recorrido.portal.primeros-pasos')`.

---

## I. Componentes reutilizables propuestos (capa transversal)

| Componente | Dónde existe | Reuso propuesto | Notas |
|---|---|---|---|
| `ContextualHelp` | `src/components/experiencia/ContextualHelp.tsx` | Botón `?` por sub-vista del **Portal Propietario** y del **Portal Inquilino**. | Cero coste: ya filtra por rol/permiso/contexto. Sólo hay que **registrar entradas de ayuda** con `host` correcto. |
| `AsistentePanel` | `src/components/experiencia/AsistentePanel.tsx` | Botón flotante en ambos portales. | Hay que definir `CAPACIDADES_PORTAL_*` y un proveedor Gemini remoto por defecto (ya existe `crearProveedorGeminiRemoto`). |
| `TutorialPlayer` | `src/components/experiencia/TutorialPlayer.tsx` | Auto-disparo en el primer acceso + botón "Repetir recorrido". | Los tutoriales ya están escritos y tienen `target: selectorTour(...)` que esperan `data-tour` en los botones del Shell. |
| `servicioProgresoTutoriales` | `src/lib/progresoTutorialesFirestore.ts` | Persistencia del progreso de tutoriales. | Ya está implementado. |
| `MiniaturaEvidencia` | `src/components/portal-inquilino/MiniaturaEvidencia.tsx` | Reusar en Portal Propietario para la pestaña `Incidencias` (ya hay grid en `PortalIncidencias` con el mismo patrón). | Promover a `src/components/portal/`. |
| Panel "estado patrimonial" (F4b) | `PropietarioPortalSection.tsx` | Adaptar a "estado de mi cuenta" para el inquilino (panel de bienvenida cuando no hay contratos). | Mismo patrón visual (icono + título + detalle + CTA). |
| Cabecera con pills de contratos | `InquilinoPortalShell.tsx` | Reusar como patrón si en el futuro un propietario gestiona varias carteras. | Por ahora no aplica. |
| Tarjeta-resumen "Mi hogar" | `PortalInicio.tsx` | Reusar la idea de "tarjeta-resumen al inicio" como cabecera de cualquier portal (F4b ya lo hace para propietario). | Reutilizar estilos. |
| `useDialogoAccesible` | `src/accesibilidad/dialogo.ts` | Usar en los nuevos modales de ayuda/asistente si se montan en el portal. | Ya se usa en `PortalSuministros`/`PortalIncidencias`. |

---

## J. Propuesta de implementación por bloques pequeños (NO se ejecuta en esta auditoría)

Orden propuesto. Cada bloque es entregable, verificable con tests existentes, y respeta FUERA DE ALCANCE.

### J.1 Cableado de Centro de Ayuda en los portales (sin tocar motores)
- **J.1.1** Añadir entradas en `src/experiencia/ayuda.ts` con `host:'PORTAL_INQUILINO'` y `section: PANTALLAS_PORTAL`. Reusar textos donde existan; donde no, escribir resúmenes de 5-8 líneas por pantalla (inicio, recibos, contrato, mensajes, documentos, historial, cuenta, suministros, incidencias, mas). Tests: ampliar `experiencia.f2.ui.test.tsx` y `experiencia.f3.ui.test.tsx`.
- **J.1.2** Montar `<ContextualHelp usuario={...} section={...} host='PORTAL_INQUILINO' />` en la cabecera de cada `PortalXxx.tsx`. Sin tocar `ContextualHelp.tsx`. Tests: añadir 1 test por sub-vista verificando que el `?` aparece cuando hay ayuda registrada y NO aparece cuando no la hay.
- **J.1.3** Idem para Portal Propietario (10 sub-vistas; `host:'ERP'`, `section:'propietarios'` para la sub-vista actual, `section:'inmuebles'` para titularidades, etc.). Las entradas de ayuda para `inmuebles`/`cobros`/`gastos`/`incidencias` ya existen; revisar su visibilidad para `PROPIETARIO` (algunas tienen `roles: [...]` que excluirían al propietario). Si no existen, escribirlas con el mismo motor.

### J.2 Tutoriales auto-disparados
- **J.2.1** En `InquilinoPortalShell`, al montar por primera vez (detección: `progreso.esProgresoValido(sesionDesdeProgreso(null))` o `localStorage` last-step):
  - Si no hay progreso → abrir `TutorialPlayer` con `RECORRIDO_PORTAL_INQUILINO`.
  - Si hay progreso y no está finalizado → reanudar.
  - Si está finalizado → no abrir (mostrar el botón "Repetir recorrido" en el header).
- **J.2.2** En `PropietarioPortalSection`, hacer lo mismo con `RECORRIDO_PROPIETARIO_PRIMEROS_PASOS`. **Cambio de targets**: los pasos originales apuntan a `nav-propietarios`/`nav-inmuebles`/etc. del Sidebar; como aquí NO hay Sidebar, hay que **duplicar/reescribir** un tutorial con targets `data-tour` que vivan en el portal (cabecera, sub-tab pills, tarjetas de vivienda). Mantener el tutorial del ERP para el caso "propietario quiere ver el resto del ERP".
- **J.2.3** Persistir con `servicioProgresoTutoriales.guardarPaso(...)` al avanzar/retroceder/finalizar.

### J.3 Asistente IA en los portales
- **J.3.1** Definir `CAPACIDADES_PORTAL_INQUILINO` y `CAPACIDADES_PORTAL_PROPIETARIO` (mismo patrón que `CAPACIDADES_ERP` en `intenciones.ts`). Capacidades mínimas: `NAVEGAR` (entre tabs/sub-tabs del propio portal), `EXPLICAR` (lee `obtenerAyuda`), `TUTORIAL` (lanza `TutorialPlayer`), `CONSULTAR` (sólo lecturas, con `ejecutarConsultaERP` ya existente, acotado por `host`).
- **J.3.2** En `InquilinoPortalShell`, añadir `<AsistentePanel usuario={usuario} section={activa} host='PORTAL_INQUILINO' accessibleSections={PANTALLAS_PORTAL} proveedor={crearProveedorGeminiRemoto()} onAccion={...} onConsultar={...} />` flotante.
- **J.3.3** En `PropietarioPortalSection`, idem con `host='ERP'`, `section: activeSubTab`, `accessibleSections: SECCIONES_PROPIETARIO`.

### J.4 Onboarding del primer acceso
- **J.4.1** Inquilino: en `InquilinoPortalShell`, si `datos.contratos.length === 0` y `!loading && !error`, renderizar la **tarjeta de bienvenida** (§H.2) en lugar de `null`.
- **J.4.2** Inquilino: el botón "Hablar con gestión" cambia a `mas → mensajes` y pre-rellena un mensaje tipo "Hola, soy [nombre] y acabo de registrarme. ¿Me puedes confirmar el contrato?".
- **J.4.3** Propietario: el panel F4b ya cubre el estado vacío. Refuerzo: añadir el **CTA secundario "Ver el recorrido"** junto a "Vincular mi primera vivienda" cuando `onCrearInmueble` esté disponible.

### J.5 Preselección de titularidad al dar de alta vivienda desde el portal (cierra F-20)
- **J.5.1** En el flujo `onCrearInmueble` de `PropietarioPortalSection`, el host (`App.tsx`) ya tiene `propietarioContextoAltaId` (F4b lo confirmó). Reusar la misma ruta contextual al saltar a `inmuebles`.
- **J.5.2** Verificar con un test que, dado un `currentUser.propietarioId` y `onCrearInmueble`, el alta de inmueble resultante tiene la `Titularidad` del propietario en el índice `titularesIds` desde el primer guardado. Tests: `propietarioPortal.test.tsx` (ya existe; añadir 1 caso).

### J.6 Cabecera propia del Portal Propietario (refuerzo)
- **J.6.1** Sin tocar `Header.tsx` global, añadir una **sub-cabecera** dentro de `PropietarioPortalSection` con: avatar de iniciales + nombre + "Tu espacio patrimonial" + contador de viviendas + botón "?" (ContextualHelp) + botón "Sincronizar" + indicador de última sincronización.
- **J.6.2** El Header global del ERP se queda arriba sin cambios. Las dos cabeceras conviven sin tocarse.

### J.7 Cabecera propia del Portal Inquilino (refuerzo)
- **J.7.1** En `InquilinoPortalShell` header, añadir **botón "?"** que abra un `AsistentePanel` flotante.
- **J.7.2** Sustituir el texto "Cargando tu portal…" por un skeleton suave (no es un cambio de motor, sólo CSS).
- **J.7.3** Asegurar que el `Refresh` global también está en el footer (no sólo en la cabecera) para que en móvil sea alcanzable con una mano.

### J.8 Indicadores por tab
- **J.8.1** Inquilino: badges en bottom-nav para `recibos` (si hay PENDIENTE/RETRASADO) y `incidencias` (si abiertas > 0).
- **J.8.2** Propietario: badges de color en los contadores de sub-tab según estado (`incidencias` rojo si abiertas, `cobros` ámbar si atención, `morosidad` rojo si total > 0).

### J.9 Pulido de copy y micro-UX (no funcionales)
- "Sin recibo generado" → "Tu recibo de [mes] se publica el día [N]" (PortalInicio, F-13).
- "No tienes averías registradas" → "Sin averías abiertas. Si tienes una, pulsa el botón «+»" (PortalIncidencias, F-14).
- "Aún no hay mensajes" → "Escríbenos cuando lo necesites" (PortalMensajes, copy-only).
- Diferenciar visualmente acta firmada vs pendiente (F-15).
- Quitar `data-testid` que no se usen en producción (limpieza) — **NO** en este bloque (es ruído sin valor).

### J.10 Verificación final
- `npm run lint` (tsc) — 0 errores.
- `npx vitest run` — los 3 469 + nuevos tests.
- `npm run test:bloque-b` — 92 + nuevos.
- `npm run test:bloque-c` — 82 + nuevos.
- `npm run test:bloque-e` — 63/1 (E-62 pre-existente, **no se toca**).
- Comprobación de FUERA DE ALCANCE: `git diff HEAD -- firestore.rules storage.rules .firebaserc firebase.json src/lib/legadoTitulares.ts src/utils/permisosTitulares.ts src/lib/titularesModelo.ts src/lib/titularidadInmueble.ts src/lib/gestionesCartera*.ts src/lib/accesoGestores.ts src/lib/accesoPropietarios.ts src/navegacion/navegacion.ts src/components/Sidebar.tsx src/components/Header.tsx src/App.tsx` debe estar **vacío** después de cada bloque J.x.

---

## K. Riesgos y notas

| # | Riesgo | Mitigación |
|---|---|---|
| K-1 | Cambiar el render del `InquilinoPortalShell` cuando no hay contratos puede sorprender a algún integrador externo (¿hay webhooks? ¿hay tests de snapshot?). | Mantener la firma `null` como comportamiento por defecto, y añadir un nuevo prop `emptyState` opcional. Si no se pasa, `null`. Si se pasa, se renderiza la nueva tarjeta. **Default-compatible**. |
| K-2 | El tutorial auto-disparado en el primer acceso del inquilino puede ser intrusivo. | (a) Sólo se dispara si no hay progreso previo; (b) se puede saltar con "Cerrar" sin penalización; (c) la persistencia del progreso se respeta. |
| K-3 | Definir `CAPACIDADES_PORTAL_*` requiere tocar `intenciones.ts`, que está en `src/experiencia/` (NO en FUERA DE ALCANCE). Hay que verificar que el ERP no se rompe al introducir dos nuevos sets. | Tests de `intenciones.test.ts` ya cubren la resolución; añadir casos `host:'PORTAL_INQUILINO'`. |
| K-4 | El recorrido `recorrido.propietario.primeros-pasos` apunta a targets del Sidebar global (`nav-propietarios`, etc.). Si lo invocamos desde dentro del portal no encontrará los targets. | Crear un **nuevo tutorial** `recorrido.propietario.portal.primeros-pasos` con targets en el portal, o duplicar el existente con `host:'ERP'` y mantener el original. NO se modifica el original. |
| K-5 | El F4b añadió el `data-testid="portal-estado-vacio-cta"` y el texto "Vincular mi primera vivienda". Cualquier copy en J.4.3 debe ser compatible con ese test. | Mantener el texto del CTA; añadir sólo un segundo botón "Ver el recorrido". |
| K-6 | El **pre-existente fallo de Bloque E test E-62** está documentado y confirmado con `git stash`. **No se aborda en esta auditoría**. | Documentar en el log de cada bloque J.x que se ha vuelto a pasar `npm run test:bloque-e` y el resultado es el mismo. |
| K-7 | Si un propietario entra al ERP por una sección que no es `propietarios` (p. ej. `dashboard`), su "primer minuto" no es el portal. | Sin tocar el Sidebar/Header (FUERA DE ALCANCE), el cambio depende de F-3: que la sección por defecto del route guard para PROPIETARIO sea `propietarios`. Verificar el route guard antes de J.6. |
| K-8 | El inquilino no ve el Centro de Ayuda global del ERP (porque no ve el ERP). Hay que decidir si la sección `ayuda` se expone también dentro del portal o si el `ContextualHelp` basta. | Propuesta: por ahora `ContextualHelp` (in-panel) + recorrido auto-disparado. El Centro de Ayuda global del ERP queda para uso del ADMINISTRADOR. **No se añade una pantalla `ayuda` dentro del portal** (sería duplicar; se documenta). |
| K-9 | Algunas entradas de `ayuda.ts` referencian `SectionType` que no aplica al portal (p. ej. `inmuebles`). El `ContextualHelp` ya las filtraría por `host`, pero hay que verificar que los `keywords` no devuelvan falsos positivos. | Revisar `ayudaParaContexto` con tests de doble host. |
| K-10 | El portal del propietario usa un `route guard` distinto al del ERP completo. Si la sub-tab `titularidades` se abre sin que `misViviendas.length > 0`, F4b ya la oculta. **Pero** `puedeGestionarTitularidades` exige ser titular canónico, y el botón "Editar" del `TitularidadesPanel` puede no aparecer. Es comportamiento correcto (Rules), pero la UX debe **explicar** por qué un cotitular no ve "Editar". | En J.1.3, registrar una entrada de ayuda para `section:'propietarios'` que explique "qué puede hacer un cotitular". |
| K-11 | El usuario puede tener **varios contratos** como inquilino. El selector pills del header ya existe, pero la sub-vista activa (`inicio/recibos/...`) NO se persiste al cambiar de contrato. | Decisión de diseño: J.7.4 (no listado arriba por brevedad): persistir la sub-vista activa por contrato en `useState` indexado por `contratoId`. |
| K-12 | Si se cablea `AsistentePanel` con un proveedor Gemini remoto, hay que verificar que el `RUTA_API_ASISTENTE` y las claves de entorno están disponibles para ambos portales (no sólo el ERP). | Revisar `.env.example` y el `server.ts` (no se modifica) antes de J.3.2. |

---

## L. Conclusión (qué entregamos)

1. **Inventario completo** de los dos portales (§B, §C) y de la capa transversal §6 (§E).
2. **Comparación estructural** (§D) que evidencia la asimetría actual (Portal Propietario es sección-ERP; Portal Inquilino es ruta dedicada) y la oportunidad de **reutilizar** `ContextualHelp`/`AsistentePanel`/`TutorialPlayer` ya existentes.
3. **20 problemas UX priorizados** (§F).
4. **Diseño objetivo** para ambos portales (§G, §H) respondiendo literalmente a *"si mañana entra por primera vez un propietario o un inquilino, ¿qué queremos exactamente que vea y pueda hacer desde el primer minuto?"*.
5. **Lista de componentes reutilizables** (§I) sin duplicar la capa §6.
6. **Hoja de ruta por bloques pequeños** (§J) — **no se ejecuta en esta auditoría**.
7. **Riesgos y mitigaciones** (§K) que respetan el FUERA DE ALCANCE.

**No se ha modificado nada**. La rama `arena/01a10613-gestor-de-inmuebles-vercel` sigue en `4b7fdd9` y los únicos ficheros tocados son los de F4b ya entregados. `legadoTitulares.ts`, `firestore.rules`, `storage.rules`, `permisosTitulares.ts`, `titularesModelo.ts`, `titularidadInmueble.ts`, `gestionesCartera*.ts`, `accesoGestores.ts`, `accesoPropietarios.ts`, `navegacion.ts`, `App.tsx`, `Sidebar.tsx`, `Header.tsx` están **intactos**. No hay commits, ni merges, ni deploys. La implementación de §J espera la aprobación del usuario.
