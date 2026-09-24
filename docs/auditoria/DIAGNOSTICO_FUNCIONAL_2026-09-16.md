# Diagnóstico funcional comparado — app original vs main vs rama Arena

**Fecha:** 2026-09-16 · **Modo:** solo lectura, sin commits/push/deploy/cambios de modelo.
**Objetivo:** inventario real de funcionalidades (visibles, desconectadas, perdidas, duplicadas, en conflicto) antes de cualquier reconstrucción del bloque 4.

---

## 1. Repositorios y referencias analizizadas

| Ref | Repositorio / rama | Commit | Contenido |
|---|---|---|---|
| **A — Original** | `Gestor-alquileres-vercel.git` | `e7798d3` (4 commits) | App funcional de captación/selección: inmuebles, propietarios, candidatos, solicitudes, agenda, contratos LAU, seguro de impago, análisis IA. **Sin auth, sin cobros, sin gastos, sin incidencias, sin profesionales.** |
| **B — Main actual** | `Gestor-de-inmuebles-vercel.git` → `main` | **`9cb01a4`** «feat: add maintenance and professional management» (AI Studio) | Base `4c646bb` (app original reempaquetada + autenticación/roles + cobros/profesionales/portales) **+ bloque de incidencias, pólizas, siniestros, trabajos, presupuestos, valoraciones**. |
| **C — Arena** | rama `arena/01a0a413-…` (remoto) | **`1f400d5`** (fases 1.0–3.6) | Base `4c646bb` + cobros conectados, seguridad/aislamiento, gastos/recurrentes/préstamos/rentabilidad y recomercialización 3.0–3.6. |

**Relación entre ramas:** `main` y `arena` **divergen ambas desde `4c646bb`** y no comparten ninguno de sus commits funcionales. Hay que **fusionar dos líneas de desarrollo independientes**, no elegir una.

- Árbol de trabajo local actual = contenido de Arena `1f400d5` + **WIP no commiteado de la Fase 4 (4.0 completa + 4.1 a medias)**. El HEAD/índice local aparece en `4c646bb` por un reseteo del sandbox; el WIP existe solo como archivos. La rama Arena remota está en `1f400d5`.
- Clon de referencia original conservado en `/home/user/ref-original` (fuera del proyecto).

**Verificación técnica:**

| Comprobación | Original | Main `9cb01a4` | Arena `1f400d5` | Árbol local (WIP 4) |
|---|---|---|---|---|
| `tsc --noEmit` | — (no exigido) | **13 errores** | **0 errores** | 0 errores |
| `npm run build` | ok | **FALLA** (`"calcularTotalesPresupuesto" is not exported by profesionalesEngine.ts`) | ok | sin probar (WIP a medias) |
| Vercel Functions/rewrites | no | **no** (`server.ts` sin `api/` ni `vercel.json`) | **sí** (`api/index.ts` + `vercel.json`) | sí |

---

## 2. Inventario de la app ORIGINAL (referencia funcional)

Aprox. **45 capacidades funcionales** en 10 módulos, 57 archivos `src`, ~32 k LOC.

1. **Inicio/dashboard** (`InicioSection`): KPIs y métricas; era elemento de menú admin.
2. **Inmuebles**: alta/edición/**borrado** (persistente), pestañas General/Fiscal, galería de imágenes con Storage (`GestionImagenesModal`), portada generada por IA, `tokenSolicitud`, galería pública (`PublicPropertyGallery`), datos fiscales (ref. catastral, certificado energético, registro, IBAN, 2 propietarios/copropiedad con porcentaje en documentos fiscales), modalidad por habitaciones.
3. **Propietarios**: CRUD fiscal + múltiples cuentas bancarias.
4. **Funnel de captación pública**: `PortalSolicitudPublicaView`, `PortalVisitaPublicaView` (reserva de visita por token), `PortalDocumentacionPublicaView`, `CuestionarioPublicoView`, enlaces de solicitud (`CrearEnlaceSolicitudModal`).
5. **Solicitudes/candidatos**: `SolicitudesSection`, alta de candidato, `CandidateModal`, detalle de solicitud, envío de cuestionario (WhatsApp), incidencias declaradas por el inquilino dentro del cuestionario (`AnalisisIncidencias`/`RespuestaIncidencia`).
6. **Documentación de candidatos**: solicitud documental por ítems, subida (server `/api/upload-document` con fallback Storage), `DocumentUploadModal`, `DocumentAnalysisModal`, `DocumentosListSection`, análisis IA de documentos + coherencias (`ResumenDocumentalCard`).
7. **Scoring/solvencia**: `solvenciaEngine`, `SolvenciaCard`, `ComparadorCandidatos`, análisis IA de cuestionario (`/api/analizar-cuestionario`), `SmartReportModal` (informe), `AnalisisSection`.
8. **Agenda/visitas**: slots, disponibilidad masiva (`CrearAgendaVisitasModal`), invitaciones, reserva pública transaccional (`bookSlotTransaction`), cancelación/liberación, `VerAgendaInmuebleModal`, preseleccionados.
9. **Contratos LAU** (`FormalizacionSection` + `FormalizarContratoModal`): titular/cotitular/avalista, cláusula personalizada redactada por IA (`/api/redactar-clausula`), evaluación de asegurabilidad, **acta de entrega de llaves** (juegos de llaves, garaje/trastero, inventario), histórico.
10. **Seguro de impago**: `SeguroImpagoSection`, configuración de aseguradoras, solicitud, análisis IA de la respuesta de la aseguradora, generación de correo IA, integración Gmail (`gmailClient`/`googleAuth`).
11. **Backend IA** (`server.ts`, Express): upload/descarga de documentos, análisis de documentos/cuestionario, correos, cláusula, salud.
12. **Persistencia original**: colecciones `propietarios, inmuebles, candidatos, solicitudes, invitaciones, slots_visita, solicitudes_documentacion, contratos_formalizacion, configuracion_aseguradoras, solicitudes_seguro_impago, system`; Storage `inmuebles/` y `documentos_solicitados/`.

**Lo que NO existía en el original** (confirmado en código): autenticación/roles, gestión de cobros, gastos/IBI/comunidad, préstamos, rentabilidad, incidencias/mantenimiento como módulo, profesionales/directorio, recomercialización. Los campos que se listaban en la orden (planta, ascensor, garaje, trastero como características del inmueble) **tampoco existían** como modelo (solo hay "juegos de llaves de garaje/trastero" en el acta).

---

## 3. Qué añadió la base `4c646bb` (presente en main y Arena)

- **Autenticación** (`authService`, `LoginView`, `AuthModal`, `PortalRegistroView`, `usuarios`, `enlaces_registro`, espejo anti-elevación `usuarios_auth`, `audit_logs`).
- **Roles** ADMINISTRADOR / PROPIETARIO / PROFESIONAL, guard de navegación, scoping en cliente, `AdminControlCenter` + gestión de usuarios.
- **Portales** Propietario y Profesional; **profesionales** (`profesionales`, `especialidades`, `CrearProfesionalModal`, zonas, asignación a inmuebles).
- **`CobrosSection` y `cobrosEngine` presentes pero DESCONECTADOS** (la sección no se montaba en App; el menú enlazaba a ella y el guard de rol la bloqueaba).
- Archivos: ningún componente original quedó huérfano por nombre (se verificaron los 31); tipos: los 45 interfaces del original siguen presentes (base pasó de 45 a 57 interfaces, solo aditivo).
- La sección **Inicio dejó de estar en el menú** (sigue montada y es la pantalla inicial) en los tres estados nuevos.

---

## 4. Qué añade AI STUDIO en `main` (`9cb01a4`) — ~10.930 líneas

- **`IncidenciasSection`** (911 líneas) con sub-pestañas *Incidencias / Pólizas / Siniestros*; `IncidenciaModal` (alta), `DetalleIncidenciaModal` (1.176 líneas, gestión completa).
- **Incidencias**: 11 categorías, 4 prioridades, **10 estados** (ABIERTA…CANCELADA), responsabilidad LAU (posible propietario/inquilino/comunidad/tercero), estado de seguro, vía de actuación, adjuntos imagen/**vídeo**/documento en Storage, historial de cambios, análisis IA pericial (`/api/analizar-incidencia-ia`, con fallback) que estima urgencia, causas probables, información faltante, especialidad, posible cobertura y aviso legal.
- **Pólizas de seguro** (`polizas_seguros`): hogar, arrendador, impago, RC, comunidad; documentos, vencimientos, contacto 24 h; **Siniestros** (`siniestros`): comunicación, estados, comunicaciones, indemnización/franquicia, documentos, vinculados a incidencia y póliza; `PolizaModal`, `SiniestroModal`; `segurosEngine.evaluarCoberturaPolizas`.
- **Trabajos de profesionales** (`trabajos_profesionales`, `TrabajoProfesionalModal`/`DetalleTrabajo…`): 13 estados, historial, documentos, fechas, importes, tipos (reparación, **mantenimiento preventivo**, reforma, inspección, mejora), **valoraciones** de 5 dimensiones (`valoraciones_profesionales`), historial por inmueble.
- **Presupuestos** (`presupuestos_profesionales`): partidas, IVA, totales, validez, decisiones con historial; modales de crear/detalle.
- **`ProfesionalesSection`** (1.229 líneas): directorio/tablero de obras, profesionales, métricas; extiende el tipo `Profesional` (servicios, estado, documentos, valoración media) de forma **aditiva y compatible**.
- Colecciones nuevas: `incidencias, polizas_seguros, siniestros, trabajos_profesionales, presupuestos_profesionales, valoraciones_profesionales`. Rutas Storage: `incidencias/`, `profesionales/`, `presupuestos/`, `trabajos/`.
- También **monta `CobrosSection`** en App (arreglando a medias la desconexión de la base).

### Defectos verificados del commit de AI Studio

1. **BUILD ROTO (P0 de despliegue):** falta `calcularTotalesPresupuesto` en `profesionalesEngine`; nombres de métricas que no devuelve el motor (`trabajosEnEjecucion`, `presupuestosAceptados`, `mediaPuntuacionGlobal`, …); estados que no existen en el tipo (`EN_NEGOCIACION`); campos que no existen en sus tipos (`tamano`, `evaluador`, faltan `creadoPor/actualizadoPor`); `DatosFiscalesInmueble.provincia`. **13 errores tsc y `vite build` abortado.** Vercel no puede desplegar main tal cual.
2. **RBAC de navegación roto (P1):** el guard de App solo permite al PROPIETARIO `['propietarios','inmuebles','formalizacion','configuracion']` y al PROFESIONAL `['administracion','inmuebles','configuracion']`, pero los menús muestran *Mis Cobros, Profesionales & Obras, Mis Incidencias* (propietario) y *Órdenes de Trabajo* (profesional): al entrar **rebotan al portal**. Solo el ADMINISTRADOR puede usarlas.
3. **Sin aislamiento multi-propietario (P0 seguridad/datos):** las 6 colecciones nuevas usan `allow read: if isSignedIn()` y las suscripciones cargan la colección completa; `IncidenciasSection` no filtra por propietario ni por inmuebles propios (solo filtros de UI). `canAccessIncidencia` es cliente. Además las reglas heredadas de la base dejan `propietarios`, `contratos_formalizacion`, `solicitudes_seguro_impago`, `audit_logs` legibles por cualquier autenticado (Arena ya corrigió esas en su rama).
4. **Sin `storage.rules`** en el repo y las rutas Storage nuevas no están declaradas en ningún sitio; no hay `vercel.json` ni carpeta `api/`, por lo que el endpoint `/api/analizar-incidencia-ia` **no se despliega como función** (igual que el resto de `server.ts` en esa rama).
5. Duplicación de gestión de profesionales: el alta/baja/edición de profesionales ya existía en `AdministracionSection` (base) y ahora existe también en `ProfesionalesSection`, sobre la misma colección.

---

## 5. Qué añade ARENA (`1f400d5`, fases 1.0–3.6) — ~14.850 inserciones

- **1.1–1.3 Cobros**: calendario materializado y persistente en el contrato, justificantes en Storage (`cobros_justificantes/{propietarioId}/…`), verificación, retrasos/incidencias automáticas, avisos; sección conectada y habilitada por rol.
- **1.4 Seguridad**: `firestore.rules` reescrita con aislamiento por `propietarioId` (consultas `where`), `storage.rules`, claims/usuarios_auth; `api/index.ts` + `vercel.json` (Express desplegado).
- **2.0–2.4 Gastos y financiación**: `gastos` (explotación/financiación, cargo arrendador/arrendatario, deducible IRPF, facturas en Storage), `gastos_recurrentes`, `prestamos` con cuadro de amortización, carencia/tipo variable/amortizaciones anticipadas; rentabilidad por inmueble/global con export CSV; motores dedicados.
- **3.0–3.6 Recomercialización**: máquina de estados, salida/llaves, inspección por estancias con fotos en Storage, diagnóstico IA por foto, mejoras/ROI con presupuestos a profesionales, pricing con escenarios e IPC/comparables, **datos catastrales + validación OVC** (`3.5.1`), estrategia propia/inmobiliaria/híbrida, kit de publicación IA, directorio de inmobiliarias con RFPs/leads/propuestas, cierre que finaliza el contrato anterior y libera el inmueble (mismo `inmuebleId`); colecciones `expedientes_recomercializacion`, `inmobiliarias_directorio`, `propuestas_inmobiliaria`, `leads_inmobiliario`.
- Compila y construye limpio; conserva el 100 % de los componentes e interfaces originales y de la base; tipos solo aditivos; sin pérdida de funcionalidad original detectada.
- Deficiencias heredadas que Arena no corrige: `inmuebles` sigue con `allow read: if true` (expone IBAN/datos fiscales en listado público); `solicitudes_documentacion` con `read/create/update: if true` (embudo público; las nóminas/DNI suben por token anónimo); `documentsStore` en memoria en `server.ts`; `storage.rules`/`firestore.rules` requieren despliegue manual por el usuario.

---

## 6. Persistencia real (fuente de verdad)

| Módulo | Original | Main | Arena |
|---|---|---|---|
| Inmuebles/propietarios/candidatos/contratos/seguro/agenda | Firestore + Storage | Firestore + Storage | igual, con reglas aisladas |
| Cobros | no existía | en contrato (`registroCobros`) + sección conectada por AI Studio (solo admin efectivo) | en contrato + justificantes Storage, aislado por rol |
| Gastos/recurrentes/préstamos | no | no | **Firestore** (colecciones propias) + facturas Storage |
| Recomercialización | no | no | Firestore (4 colecciones) + Storage privado |
| Incidencias/pólizas/siniestros | no | **Firestore + Storage reales** (sin aislamiento en reglas) | solo **WIP local no subido** (modelo distinto, ver §7) |
| Trabajos/presupuestos/valoraciones profesionales | no | Firestore + Storage (rotos en build) | no |
| Documentos subidos vía `/api/upload-document` | Map en memoria **+ fallback Storage** | igual | igual (pendiente eliminar el Map) |
| Cachés | localStorage como respaldo de candidatos/solicitudes/seguro | patrón heredado | idéntico en lo heredado |

Ningún módulo nuevo de AI Studio usa solo React/localStorage: **todas las guardas pasan por Firestore** (el problema no es la persistencia, sino el aislamiento y el build).

---

## 7. Conflictos entre implementaciones (a resolver al fusionar)

1. **Modelo y colección `incidencias` (EN CONFLICTO DIRECTO):** AI Studio (`Incidencia` con 10 estados, responsabilidad, seguro, adjuntos, trabajo embebido, análisis IA) vs WIP Arena local 4.0 (`Incidencia` con 8 estados distintos, presupuestos embebidos, orden de trabajo, eventos; colección `incidencias`, mismo nombre; mismo archivo `src/utils/incidenciasEngine.ts`). **Decisión recomendada: adoptar el modelo AI Studio** (es mucho más rico y ya tiene UI completa) y aportarle del WIP Arena: numeración legible INC-/OT-, matching de profesionales por categoría/zona, puente hacia la colección `gastos` al resolver (con cargo arrendador/arrendatario y deducible IRPF), y el plan de mantenimiento preventivo periódico (`tareas_mantenimiento`, que AI Studio no tiene como recurrencia).
2. **`firestore.rules`**: Arena reescribió el archivo completo (aislado); AI Studio añadió 6 bloques abiertos. Reescribir esos 6 bloques al estilo Arena (inclusión del profesional asignado vía `where('profesionalAsignadoId')`).
3. **`storage.rules`**: solo existe en Arena; añadir rutas `incidencias/`, `profesionales/`, `presupuestos/`, `trabajos/` aisladas por propietario (si no, el catch-all deniega las subidas de AI Studio).
4. **`server.ts`**: ramas con divergencia mecánica (helpers Gemini idénticos). Unir endpoints: los 6 de Arena + `/api/analizar-incidencia-ia`; desplegar vía `api/index.ts`/`vercel.json` de Arena.
5. **`src/lib/firebase.ts`**: funciones con el mismo nombre para `incidencias` en ambos (la de AI Studio sin parámetro de ámbito). Conservar la firma con `DataAccessScope` de Arena; añadir CRUD de pólizas/siniestros/trabajos/presupuestos/valoraciones con scope y las subidas Storage.
6. **`App.tsx`/Sidebar/MobileNav/SectionType/types.ts**: ambos añadieron entradas y secciones; unión simple, pero corrigiendo el guard de roles y los contadores.
7. **`Profesional`**: extensión aditiva de AI Studio, compatible. Unir la doble gestión (Administración vs nueva sección) sin duplicar alta/baja.
8. **WIP Arena local**: `src/utils/incidenciasEngine.ts` (versión propia), tipos bloque 4, reglas y funciones firebase y el ítem de menú de escritorio «Incidencias» **sin sección montada ni entrada en MobileNav** (estado incoherente: hoy mismo el ítem no lleva a ningún sitio). No debe mezclarse tal cual: tomar AI Studio como base del bloque 4.

---

## 8. Seguridad — hallazgos (solo documentados, no se tocan reglas)

| Colección / recurso | main (desplegado) | Arena | Riesgo |
|---|---|---|---|
| `incidencias`, `polizas_seguros`, `siniestros`, `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales` | read/create/update cualquier autenticado | no existen | **P0**: fuga cruzada entre propietarios (datos personales, pólizas, siniestros, precios) |
| `propietarios` (fiscal/IBAN), `contratos_formalizacion`, `solicitudes_seguro_impago`, `audit_logs` | cualquier autenticado lee | endurecido (dueño/admin; logs solo admin) | P0 en main; resuelto en Arena |
| `inmuebles` | lectura pública | lectura pública (heredado) | P1: el listado público expone IBAN/ref. catastral; separar datos públicos y fiscales |
| `solicitudes_documentacion` y Storage `documentos_solicitados/` | lectura/creación sin auth (embudo por token) | igual | P1: el documento no se valida por token; revisar alcance |
| Storage nuevas rutas AI Studio | **sin `storage.rules` en repo** | no aplican | P0/P1: estado desplegado desconocido; verificar en consola |
| `/api/*` | anónimas, sin rate-limit (heredado) | igual | P2 (auditoría previa) |
| `documentsStore` en memoria serverless | sí | sí | P2: documentos efímeros en frío |

---

## 9. MATRIZ DE FUNCIONALIDADES

Leyenda estado: **CONSERVADA / NUEVA / MEJORADA / REEMPLAZADA / OCULTA / DESCONECTADA / PARCIAL / PERDIDA / DUPLICADA / EN CONFLICTO**.
Columnas: **O**=original, **M**=main 9cb01a4, **A**=Arena 1f400d5.

| Función | O | M | A | Estado global | Acción |
|---|:-:|:-:|:-:|---|---|
| Dashboard Inicio (KPIs) | ✓ | ✓ | ✓ | **OCULTA** (sin ítem de menú en las nuevas) | Reañadir ítem «Inicio» (P3) |
| Inmuebles: alta/edición/borrado y persistencia | ✓ | ✓ | ✓ | CONSERVADA | Verificar borrado tras unir ramas |
| Galería de imágenes + portada IA + galería pública | ✓ | ✓ | ✓ | CONSERVADA | — |
| Datos fiscales inmueble (catastro, registro, CE, IBAN, 2 propietarios) | ✓ | ✓ | ✓ | CONSERVADA/MEJORADA en A | A añade datos catastrales (3.5.1) |
| Modalidad alquiler por habitaciones | ✓* | ✓ | ✓ | CONSERVADA | *en base/A/M |
| Características planta/ascensor/garaje/trastero | — | — | — | NUNCA EXISTIÓ | Si se quiere, es funcionalidad **nueva**, no recuperación |
| Propietarios CRUD + cuentas bancarias | ✓ | ✓ | ✓ | MEJORADA (A: reglas estrictas) | Conservar reglas Arena |
| Captación pública (solicitud/visita/documentación/cuestionario) | ✓ | ✓ | ✓ | CONSERVADA | Revisar token real en documentos (P1) |
| Candidatos: alta, modal, comparador, scoring IA | ✓ | ✓ | ✓ | CONSERVADA | — |
| Incidencias declaradas en cuestionario de inquilino | ✓ | ✓ | ✓ | CONSERVADA | No confundir con el nuevo módulo de incidencias |
| Documentos de candidato + análisis IA + coherencias | ✓ | ✓ | ✓ | CONSERVADA | Sustituir `documentsStore` en memoria por Storage (P2) |
| Agenda: slots, reserva pública, cancelación, liberación | ✓ | ✓ | ✓ | CONSERVADA | Probar no romper reservas al unir `App.tsx` |
| Contratos LAU, cláusula IA, asegurabilidad, acta de llaves | ✓ | ✓ | ✓ | CONSERVADA | — |
| Seguro de impago (solicitud, IA respuestas, correo/Gmail) | ✓ | ✓ | ✓ | CONSERVADA | — |
| Informes inteligentes / solvencia | ✓ | ✓ | ✓ | CONSERVADA | — |
| Configuración (aseguradoras, Gmail) | ✓ | ✓ | ✓ | CONSERVADA | — |
| **Autenticación/roles/portales/usuarios/auditoría** | — | ✓ | ✓ | NUEVA (base común) | Conservar versión Arena (reglas) + igualdad de pantallas |
| **Cobros / calendario de pagos** | — | archivos base | sección | **DESCONECTADA en base → reconectada en M y A** | Quedarse con la versión Arena (completa, aislada); la de M es redundante |
| Justificantes de cobro en Storage, avisos/retrasos | — | — | ✓ | NUEVA (Arena) | Conservar |
| **Gastos, recurrentes, facturas Storage** | — | — | ✓ | NUEVA (Arena) | Conservar |
| **Préstamos/hipotecas y amortización** | — | — | ✓ | NUEVA (Arena) | Conservar |
| **Rentabilidad por inmueble/global/export** | — | — | ✓ | NUEVA (Arena) | Conservar |
| **Recomercialización 3.0–3.6 completa** | — | — | ✓ | NUEVA (Arena) | Conservar; **no está en main** |
| Datos/validación catastral en pricing (3.5.1) | — | — | ✓ | NUEVA (Arena, local+remoto) | Conservar |
| **Incidencias/mantenimiento (modelo rico, IA, adjuntos, historial)** | — | ✓ | WIP local | **EN CONFLICTO / PARCIAL en M** | Adoptar modelo+UI AI Studio; arreglar build, reglas, roles, Storage, serverless; integrar lo bueno del WIP |
| **Pólizas multirramo + documentos** | — | ✓ | — | NUEVA AI Studio, **PARCIAL** (solo admin; sin reglas/storage) | Integrar en Arena con aislamiento |
| **Siniestros (comunicaciones, indemnización)** | — | ✓ | — | NUEVA AI Studio, PARCIAL | Idem |
| **Trabajos/órdenes de profesional (13 estados, docs, histórico inmueble)** | — | ✓* | — | NUEVA AI Studio, **PARCIAL/ROTA** (*build) | Reparar motor/presupuestos; aislar por propietario |
| **Presupuestos con partidas/IVA/decisiones** | — | ✓* | — | NUEVA AI Studio, **ROTA** (build) | Implementar `calcularTotalesPresupuesto`, tipar estados/campos |
| **Valoraciones de profesionales (5 ejes)** | — | ✓* | — | NUEVA AI Studio, errores tsc | Reparar `evaluador`/tipos; conectar |
| **Plan de mantenimiento preventivo periódico** | — | parcial (tipo de trabajo, sin recurrencia) | WIP (`tareas_mantenimiento`) | PARCIAL en ambos | Aportar la recurrencia/plantillas del WIP Arena sobre los trabajos AI Studio |
| Profesionales: catálogo, zonas, portal, invitación | — | ✓ | ✓ | NUEVA base; **DUPLICADA en M** (Administración + Sección nueva) | Una sola gestión; conservar `ProfesionalesSection` como pantalla y mover alta/baja compartida |
| Presupuestos a profesionales desde mejoras ROI | — | — | ✓ (intención en mejora, sin orden) | PARCIAL | Cerrar el círculo con los trabajos AI Studio |
| Puente resolución incidencia → gasto contable (cargo/IRPF) | — | coste en trabajo, sin contabilidad | WIP Arena | PARCIAL / EN CONFLICTO | Integrar creación de `Gasto` (Arena) al cerrar trabajos |
| Menú navegación móvil/escritorio coherente | ✓ | ✗ roles vs menús | ✗ falta bloque 4 (sin fusionar) | EN CONFLICTO | Unificar menús, contadores y `allowedSections` |
| Despliegue de la API en Vercel | — | ✗ | ✓ | RESUELTO solo en A | Conservar `api/index.ts`+`vercel.json` |
| Reglas Firestore aisladas por propietario | — | ✗ nuevas abiertas | ✓ endurecidas | EN CONFLICTO | Partir de Arena y añadir las 6 colecciones AI Studio endurecidas |
| Reglas Storage declaradas en repo | — | ✗ ausentes | ✓ | PARCIAL | Ampliar con rutas AI Studio |

No hay funciones originales en estado **PERDIDA** puro: todas las originales siguen compiladas e importadas en main y Arena. Los problemas son **desconexión por rol (main)**, **build roto (main)** y **ramas que aún no se han fusionado**.

---

## 10. Prioridades de intervención (solo identificadas, no ejecutadas)

### P0 — Seguridad / build / datos
1. **`main` no compila ni despliega** (build roto por presupuestos/profesionales): corregir `profesionalesEngine`, estados y tipos para que `tsc` y `vite build` pasen.
2. Endurecer las **6 colecciones nuevas** (aislamiento por `propietarioId`, lectura del profesional solo a sus asignaciones) y desplegar reglas.
3. Declarear/desplegar **Storage rules** para `incidencias/`, `profesionales/`, `presupuestos/`, `trabajos/`; verificar el estado real en consola Firebase.
4. Unificar la estrategia de despliegue API (`api/index.ts`+`vercel.json` de Arena) para que el endpoint de incidencias exista en producción.
5. Cerrar fugas heredadas que Arena ya tiene resueltas en su rama (propietarios, contratos, auditoría) como parte de la fusión.

### P1 — Funciones importantes que no llegan al usuario
6. Arreglar el **guard de navegación** (propietario: cobros/incidencias/profesionales; profesional: sus órdenes) y la vista de profesional (solo sus incidencias/trabajos asignados).
7. Fusiones de las dos líneas: traer **gastos/préstamos/rentabilidad/recomercialización (Arena)** y **incidencias/pólizas/siniestros/trabajos/presupuestos/valoraciones (AI Studio)** a una sola aplicación.
8. Decidir y aplicar el **modelo canónico de incidencias** (recomendado: AI Studio) y resolver el WIP Arena local (descartar lo duplicado, conservar numeración, matching, preventivo, puente a gastos).
9. Unificar la gestión de profesionales en una sola pantalla.
10. Revisar `solicitudes_documentacion`/Storage público del embudo y la exposición de datos fiscales en `inmuebles` de lectura pública.

### P2 — Parcialidades e integraciones
11. Puente resolución de incidencia/trabajo → `gastos` (cargo arrendador/arrendatario, deducible IRPF, factura).
12. Plan de mantenimiento preventivo recurrente (`tareas_mantenimiento`/plantillas) sobre los trabajos AI Studio.
13. Presupuestos AI Studio: completar motor (totales/IVA/validez), vistas y estados.
14. Eliminar el `documentsStore` en memoria (fuente única en Storage).
15. Pólizas/siniestros accesibles para el propietario con sub-pestañas y filtros por sus inmuebles.

### P3 — Mejoras no críticas
16. Recuperar el ítem de menú **Inicio** para admin.
17. Características nuevas deseadas (planta/ascensor/garaje/trastero del inmueble) si se quieren: son alta nueva, no recuperación.
18. Rate-limit de `/api/*` y demás ítems de la auditoría previa (informes A–F).

---

## 11. Plan de integración propuesto (para la siguiente orden)

1. **Base de integración: rama Arena `1f400d5`** (compila, despliega, tiene auth endurecida, cobros, gastos, recomerc). Nunca desde main directamente.
2. Traer de `9cb01a4` **solo los activos del bloque de AI Studio**: tipos (incidencias/pólizas/siniestros/trabajos/presupuestos/valoraciones + extensión de `Profesional`), `segurosEngine`, el `incidenciasEngine` AI Studio (renombrando/resolviendo colisión con el WIP), modales y secciones, endpoint `/api/analizar-incidencia-ia`, adaptándolos durante la importación:
   - suscripciones/CRUD con `DataAccessScope` y consultas `where('propietarioId')` (patrón Arena); lectura del profesional por `profesionalAsignadoId`;
   - reglas Firestore endurecidas y Storage rules nuevas;
   - guard de roles corregido y menús unificados (escritorio + móvil);
   - rutas AI Studio bajo `api/index.ts`/`vercel.json`;
   - corrección de los 13 errores tsc/rollup antes de considerar el módulo.
3. Aportar del WIP Arena local solo lo que AI Studio no tiene: numeración INC-/OT-, matching por especialidad/zona, plantillas/recurrencia preventiva, y cierre contable hacia `gastos`; **descartar el modelo de incidencia y el engine propios** para no duplicar.
4. Una sola gestión de profesionales (la sección AI Studio como vista principal, reutilizando el alta existente de Administración).
5. Verificación por fases (como acordado): tsc + build + recorrido funcional por rol (admin/propietario/profesional) antes de push; después despliegue Preview y, con visto bueno, fusión a producción.
6. Despliegues manuales pendientes del usuario en cada corte: `firestore.rules`, `storage.rules` (no se pueden desplegar desde el sandbox).

---

## 12. Notas de entorno

- El sandbox resetea `node_modules` y el estado git (el HEAD local volvió a `4c646bb`); el WIP de la Fase 4 sobrevive solo en el árbol de trabajo. **No se ha hecho commit, push, merge, deploy, borrado ni migración alguna durante este diagnóstico.** Solo se creó este informe y clones/worktrees temporales de lectura (worktrees eliminados al finalizar; el clon original permanece en `/home/user/ref-original`).
- La rama `arena/…` remonta a `1f400d5`; `main` remonta a `9cb01a4`; ambas cuelgan de `4c646bb`.
