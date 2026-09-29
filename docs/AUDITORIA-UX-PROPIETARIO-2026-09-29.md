# Auditoría integral de la experiencia PROPIETARIO (post PR #12)

Fecha: 2026-09-29 · Rama de auditoría: `arena/01a0ee4f-gestor-de-inmuebles-vercel`
Base verificada: `origin/main` = `c2b76cf364007528a97ba46fc88180072d73f577` (merge de PR #12, MERGED 2026-09-29T17:21:54Z).

## 0. Conexión y merge anteriores (FASES 1–4)

| Comprobación | Resultado |
|---|---|
| Branch de trabajo | `arena/01a0ee4f-gestor-de-inmuebles-vercel` |
| HEAD | `c2b76cf` (idéntico a `origin/main`; 0 commits por delante/detrás) |
| Working tree | limpio |
| PR #12 | **MERGED** (merge commit `c2b76cf`) |
| `fbb6d8e` (scope owner data subscriptions) | PRESENTE en `origin/main` |
| `d7239d3` (only master opens global owner-data reads) | PRESENTE |
| `d5ab149` (blank-screen fix) | PRESENTE (vía PR #11, antecesor de main) |
| `firestore.rules` tocado por PR #12 | **NO** (última modificación: `f10a45e`, BLOQUE 6) |

Nota técnica: el checkout inicial era *shallow* (depth 1); se ejecutó `git fetch --unshallow`
(solo lectura) para poder demostrar la ascendencia real de los tres commits.

## 1. Mapa real de la experiencia del propietario (FASE 7)

El route guard (`App.tsx` · `SECCIONES_PROPIETARIO`) autoriza **21 secciones**; la entrada
por defecto tras login es `propietarios` (Mi Portal Propietario). La navegación visible es la
fuente única (`src/navegacion/navegacion.ts`), consumida por `Sidebar` y `MobileNav`.

| Área | Existe | ¿PROPIETARIO puede usarla? | Dónde está | Problema UX |
|---|---|---|---|---|
| Inicio | Sí (`dashboard` → `DashboardEjecutivoSection`) | Sí (datos acotados) | Centro de Control | El alta de inmueble no es alcanzable desde aquí ni desde el portal (solo desde `PropietariosSection` de admin o `Nuevo Inmueble` en Mis Viviendas) |
| Mis inmuebles | Sí (`inmuebles` → `InmueblesSection`) | Sí | Menú «Mis Viviendas» | El alta general no preselecciona el titular del propietario (ver §3) |
| Titulares | Sí (`propietarios` → portal + `PantallaPatrimonial`; admin → `PropietariosSection`) | Parcial | «Mi Portal Propietario» | El alta patrimonial de **otro** titular termina en `permission-denied` para el propietario (por diseño de Rules) y no se le explica |
| Titularidad | Sí (ficha inmueble → «Apartado Fiscal»; modales alta/edición) | Sí | Ficha del inmueble (a mitad de página) | No hay resumen visible de titularidad sin bajar al apartado fiscal |
| Segundo propietario | Sí (`datosFiscales.segundoPropietario`, `propietarioSecundarioId`) | Sí (fiscal embebido) | Alta/edición de inmueble, pestaña fiscal | Correcto para fiscal; no crea identidad patrimonial (ver §4) |
| Crear titular | `PantallaPatrimonial` vista «alta» | **NO** (solo master/admin; Rules) | Debajo del portal | Flujo visible para propietario que **fracasa al confirmar** (defecto) |
| Contratos | Sí (`formalizacion`, «Mis Contratos») | Sí | Económico/Comercial | — |
| Cobros | Sí (`cobros` + subpestaña en portal) | Sí | «Mis Cobros» | Duplicado funcional portal/sección (mismo motor; se conserva) |
| Gastos | Sí (`gastos` + subpestaña en portal) | Sí | «Mis Gastos» | — |
| Documentos | Sí (`expediente` en Centro Operativo del inmueble · BLOQUE 6) | Sí | Ficha inmueble → Centro operativo → Expediente | No hay acceso global; aceptable, se documenta |
| Seguros | Sí (`polizas` → `PolizasSegurosSection`) | Sí | Operaciones | — |
| Importar | Sí (motor canónico B4/B7) | Sí (ámbito propio) | **Solo** Configuración → panel inferior | **Descubribilidad nula** (FASE 16) |
| Exportar | Sí (exportador canónico + Informes) | Sí | Configuración (panel) + «Informes & Export» | El motor canónico no aparece en la navegación |
| Fiscalidad | Sí (`fiscal` → `FiscalidadSection`; exportación fiscal en `informes`) | Sí | Económico | — |
| Ayuda | Sí (`ayuda` → Centro de Ayuda + `ContextualHelp` por sección) | Sí | Grupo Sistema | Sin entradas sobre titularidad ni import/export; sin tutorial del propietario |
| Tutoriales | Sí (registro §6: 3 tutoriales) | Parcial (ninguno para PROPIETARIO) | Centro de Ayuda | El propietario no tiene ningún recorrido propio |
| Mantenimiento | Sí (`incidencias`, `operaciones`) | Sí | Operaciones | — |
| Suministros | Sí (`suministros`) | Sí | Cartera | — |
| Móvil | Sí (`MobileNav`, dropdown con 21 módulos) | Sí | Cabecera móvil | Lista larga pero funcional y agrupada |

## 2. Titularidad: significado real de cada campo (FASE 8)

- `Inmueble.propietarioId` — **titular económico canónico**. Es el que autoriza lectura/escritura
  en Rules (`inmuebleEsMio`), el que liga cobros/gastos/liquidaciones y el que `allow create` exige
  (`incoming().propietarioId == myPropId()` o `propietarioPrincipalId == myPropId()`).
  Inmutable para cualquier no-master (`propietarioCanonicoInalterado`).
- `Inmueble.propietarioPrincipalId` — titular fiscal principal (referencia a `propietarios/{id}`).
  También autoriza like `soyTitularActual`. El titular puede cambiarlo solo si sigue siendo titular.
- `Inmueble.propietarioSecundarioId` — referencia al co-titular; **no autoriza nada** (comentado en Rules).
- `datosFiscales.propietarioPrincipal` / `segundoPropietario` (`PropietarioFiscal`) — **snapshot
  fiscal embebido** para contratos LAU y pólizas. `propietarioFiscal.propietarioId` es la referencia
  opcional a la entidad registrada.
- Rule `titularidadInalterada()` congela los tres ids en updates no-master; el titular solo puede
  tocarlos si `sigoSiendoTitular()`. El editor valida `validarCoherenciaTitularidad` (D2 §6).

## 3. Alta de inmueble por el propietario (FASE 11) — defecto confirmado

- Firestore: `allow create` exige que el inmueble llegue con `propietarioId`/`propietarioPrincipalId`
  del propietario autenticado.
- Flujo contextual `propietarioContextoAltaId` existe y funciona (admin lo invoca desde
  `PropietariosSection` → «crear inmueble»). **El propietario no tiene ese botón en su portal.**
- El alta general (`abrirAltaGeneral`, botón «Nuevo Inmueble») deja el titular **sin seleccionar**;
  el selector solo contiene su propia ficha (`scopedPropietarios`), pero el valor inicial es
  «Asignación manual». Si envía así: `propietarioId: undefined` → **denegación en Firestore**
  (el alta optimista lo muestra localmente y desaparecerá al recargar; se reporta en el canal de
  estado de datos). **Defecto UX prioritario confirmado.**

## 4. Segundo titular y copropiedad (FASES 9–10)

- «Añadir segundo propietario» en el alta/edición **no crea `propietarios/{id}`**: guarda un
  `PropietarioFiscal` embebido (correcto para contratos/pólizas) y, si se elige uno existente,
  rellena `propietarioSecundarioId`. La separación TITULAR PATRIMONIAL ≠ CUENTA DE ACCESO está
  bien resuelta (la cuenta de acceso es otra dimensión: usuarios/invitaciones).
- Crear **otra** entidad titular patrimonial no está al alcance del propietario (Rules:
  `allow create` en `propietarios` exige `propietarioId == myPropId()` o master). El owner sí puede
  completar su propia ficha patrimonial e importar hacia ella (`registros_patrimoniales` permite
  al titular). **GAP DE PERMISOS documentado; NO se abre Rules (FASE 24).**
- Copropiedad (50/50, cuotas, participaciones, liquidaciones por porcentaje): **no existe** en el
  modelo (búsqueda exhaustiva de porcentajes/cuotas en titularidad, tesorería y tipos). La
  liquidación es total por propietario-inmueble. **GAP funcional documentado; no se inventa.**

## 5. Importación y exportación (FASES 14–19)

Motor canónico real (`src/lib/importExport`, versión `erp-import-export-v1`), montado solo en
`ConfiguracionSection` → `<ImportExportPanel>`:

- **Importar**: archivo → formato (JSON/CSV/XLSX) → entidad → *Analizar* (dry-run puro, 0
  escrituras) → resumen (totales por estado) → problemas → promoción solo de autorizados con
  decisión humana y barrera O7. Duplicados clasificados: `NUEVO | EXACTO | POSIBLE_DUPLICADO | CONFLICTO`.
  Entidades con soporte COMPLETO: PROPIETARIO, INMUEBLE, CONTRATO, GASTO, COBRO, DOCUMENTO
  (+LEGACY_STORAGE referenciado). PENDIENTE honesto: incidencias, inventarios, préstamos, etc.
  Ámbito: `ambitoAutorizadoDesdeUsuario` — el propietario importa/exporta dentro de su
  `propietarioId` (legible/escribible); admón/master global; gestor por carteras. Aislamiento
  revalidado server-side por Rules en cada escritura.
- **Exportar**: entidad/ámbito/formato (JSON canónico estable, CSV, XLSX) → vista previa →
  descarga (`ejecutarExportacion`). Ámbito (propietarios/inmuebles) filtrado y validado contra el
  autorizado (`validarAmbitoExportacion`, defensa en profundidad).
- **Exportación fiscal**: sistema separado (Informes → `generarExportacionFiscal` CSV/JSON +
  `expedienteFiscal` en el Centro Operativo del inmueble). Es preparación/revisión interna, no
  presentación oficial. Se conserva separada (FASE 19).
- **Defecto UX**: la navegación no ofrece acceso alguno a este motor (FASE 16).

## 6. Ficha del inmueble (FASE 12)

Estructura real: cabecera con acciones → descripción → specs → **Apartado Fiscal y Datos del
Arrendador** (titularidad) → Historial de contratos → Centro Operativo (pestañas: resumen,
seguros, averías, expediente [documentos], histórico, operaciones) → Control mensual de cobros →
Candidatos. La titularidad existe pero no es visible sin scroll. Reorganización conceptual
propuesta sin eliminar funciones: resumen/titularidad arriba (ver implementación).

## 7. Ayuda, tutoriales, móvil (FASES 20–21)

- `ContextualHelp` (botón «?» en Header) + Centro de Ayuda consumen el mismo registro
  (`AYUDA_REGISTRO`), filtrado por RBAC. No crear nada paralelo: se **añaden entradas**.
- Registro de tutoriales: tesorería (admin), invitar inquilino (admin), portal inquilino.
  Falta recorrido del propietario: se añade uno reutilizando `TUTORIALES_REGISTRO`.
- Móvil: `MobileNav` agrupa por los 6 grupos, muestra contador de módulos; funcional con 21
  ítems. Las fichas y modales son responsive (clases `sm:`/`md:` ya presentes). Ningún cambio
  estructural necesario; las nuevas secciones heredan el mismo comportamiento.

## 8. Hallazgo transversal — la puerta de lint no tipa los componentes React

`@types/react` no está instalado y `tsconfig` no usa `strict`; con React 19 (sin tipos
empaquetados) `React.FC<Props>` resuelve a `any`, así que `tsc --noEmit` **no detecta** campos
inexistentes en componentes (p. ej. `inmueble.precioRentaMensual` en el portal, que pinta
`undefined €/mes` y `0 m²` por `superficieConstruida`). Verificado con sondas TS2339.
**GAP de tooling documentado** (corregirlo globalmente exige instalar tipos y endurecer el
proyecto completo: fuera del alcance de esta orden). Se reparan los campos concretos afectados.

## 9. Decisiones de implementación (FASES 22–24)

1. Nueva sección `datos` («Importar / Exportar») reutilizando `ImportExportPanel` (sin duplicar
   motor; el panel sigue también en Configuración). Añadida al guard del propietario y al catálogo
   de navegación para ADMINISTRADOR y PROPIETARIO.
2. Alta de inmueble: preselección automática del titular cuando el usuario es PROPIETARIO +
   validación de cliente que impide enviar el alta con otro titular (espejo de Rules, sin tocarlas).
   Botón «Añadir vivienda» en el portal del propietario (misma ruta contextual existente).
3. Titularidad visible: resumen compacto en la ficha del inmueble (principal/cotitular + CTA de
   edición fiscal) y línea de titular en las tarjetas del portal.
4. `PantallaPatrimonial`: para no-administradores la vista «Nuevo propietario» se sustituye por
   una explicación honesta (quién puede crear titulares patrimoniales); la importación hacia la
   ficha propia se conserva.
5. Ayuda: entradas nuevas (titularidad, importar/exportar) en `AYUDA_REGISTRO` y recorrido del
   propietario en `TUTORIALES_REGISTRO`.
6. Corrección del bug visible del portal (`precio`/`rentaMensual`, `superficie`).
7. Seguridad: **cero cambios en `firestore.rules` ni en permisos**; todo lo implementado opera con
   el ámbito ya autorizado.
