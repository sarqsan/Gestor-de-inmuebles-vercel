# BLOQUE 10 · UX-1 — NAVEGACIÓN Y ARQUITECTURA DE INFORMACIÓN

## FASE 1 — INSPECCIÓN REAL (sin cambios de código)

> Este documento **no implementa nada**. Es la fotografía verificable del subsistema de
> navegación sobre `main` = `c0c82245d1adccf752903765ea554cb3544f1072`, más el mapa de UX-1
> y la propuesta del primer cambio aislado.
>
> Amplía —no sustituye— `docs/BLOQUE-10-UX-MAPA-ACTUAL.md` (mapa UX completo del bloque).

---

## 1. ESTADO REAL DE LA RAMA Y HEAD

| Comprobación | Comando | Resultado |
|---|---|---|
| Rama actual | `git branch -vv` | `arena/01a0e939-gestor-de-inmuebles-vercel` |
| HEAD | `git rev-parse HEAD` | `c0c82245d1adccf752903765ea554cb3544f1072` = **SHA de referencia** ✔ |
| `main` local / remota | `git branch -vv` | `main c0c8224 [origin/main]` → `main == origin/main == HEAD de la rama de trabajo` ✔ |
| Commits disponibles | `git log --oneline` | 1 (clon **shallow**); historia detallada no auditable localmente |
| Operaciones destructivas | — | ninguna (`reset --hard`, `clean -fd`, checkout destructivo, force push: no usados) |

## 2. ESTADO DEL ÁRBOL

`git status --porcelain`:

```
?? docs/BLOQUE-10-UX-MAPA-ACTUAL.md
```

- **Código de aplicación: intacto.** No se ha modificado ni un fichero de `src/`, `server.ts`,
  `firestore.rules`, `storage.rules` ni `package.json`.
- Lo único presente es el documento del mapa UX de la entrega anterior (sin trackear, sin commit).
- **No había trabajo local previo** que preservar al iniciar (el árbol estaba limpio).
- Dependencias: `node_modules` no existía → `npm ci` (397 paquetes, versiones fijadas por el lock).
  **Ninguna dependencia añadida, quitada ni actualizada.**

**Baseline ejecutado sobre este árbol (evidencia real, no heredada):**

| Comprobación | Resultado |
|---|---|
| `npx vitest run` | 131 archivos · **2557 pass · 2 skip · 0 fail** (74 s) |
| `npm run lint` (`tsc --noEmit`) | **0 errores** |

**SHA-256 de los ficheros implicados en UX-1 (para comparar después de implementar):**

```
c9262f2eff6661ca1f60434805c519a9b5817edcd265138d85a716138b671921  src/components/Sidebar.tsx        (277 líneas)
54cfa3b47e98d1d71394831e74bb2674dacd014c67eb25cf4aaedc51e07db01a  src/components/MobileNav.tsx      (305 líneas)
616b3f34bb095fa51c2667cd75c96063ae5884fb740379cb768845fb36b4c5af  src/App.tsx                       (4557 líneas)
9fdd8a87d73d287c2c1a36c5bfcaca6d7548aa30a6c58042a61d68b35e540a9f  src/types.ts                      (4105 líneas)
f644b2f760cf1e1e774f4776b4ae2d99c8cd80b43850eeb507bbfc9f34fb259f  src/utils/dashboardCentroControl.test.ts
ccdaafe0ff025f0d3f043d18424261f98d082d68558f0e9a8d0724969ebb8415  src/test/e/bloqueE.navegacion.test.tsx
```

---

## 3. INVENTARIO DE NAVEGACIÓN, LAYOUT Y MENÚS

### 3.1 Layout (shell)

| Elemento | Fichero | Visibilidad | Función |
|---|---|---|---|
| `Sidebar` | `src/components/Sidebar.tsx` (277 l.) | `hidden md:flex` (escritorio, `sticky top-0`) | menú lateral + badges + resumen admin + usuario/sesión + pie «Firestore & Auth Conectado» |
| `Header` | `src/components/Header.tsx` (10,9 KB) | `hidden md:flex` (escritorio, `sticky top-0 z-20`) | *breadcrumb* «RentSelect / <sección>», título + subtítulo por sección, `ContextualHelp` (§6), `AsistentePanel` (§6), acciones (enlace de registro, Gmail, «Nuevo Candidato», usuario/logout) |
| `MobileNav` | `src/components/MobileNav.tsx` (305 l.) | `md:hidden` (móvil, `sticky top-0 z-50`) | barra superior: **desplegable único** con todas las secciones + asistente (§6) + usuario + «+» candidato |
| `<main>` | `src/App.tsx:3701` | ambos | `p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto`, render por `{activeSection === 'x' && …}` |
| `CarterasOnboardingPanel` | `App.tsx:3657` | si `roles.includes('GESTOR_PATRIMONIAL')` | banda de onboarding sobre el contenido |
| `TutorialPlayer` | `App.tsx:4401` | si hay sesión de tutorial (§6) | reproductor no bloqueante con overlay `data-tour` |
| `InquilinoPortalShell` | `App.tsx` (antes del shell ERP) | perfil `INQUILINO` | portal móvil propio; **no** usa `Sidebar`/`MobileNav` |

- **No hay router** (`react-router` no está en `package.json`). `history.pushState/replaceState`
  se usa sólo para limpiar tokens públicos de la URL. La sección activa vive en `useState`
  (`App.tsx:349`, valor inicial `'inicio'`).
- **No hay breadcrumb** en móvil ni título de pantalla más allá de la etiqueta del ítem activo
  en el desplegable (`MobileNav` `currentSectionItem`).

### 3.2 Secciones declaradas, renderizadas y ofrecidas

| Conjunto | Nº | Detalle |
|---|---|---|
| `SectionType` declaradas (`src/types.ts:1-45`) | **38** | incluye 6 legadas del portal profesional PWA (`mis_profesionales`, `mis_contratos`, `mis_servicios`, `mis_zonas`, `mis_asignaciones`, `mi_perfil`) |
| Ramas de render en `App.tsx` | **32** | incluye `inicio`, `solicitudes`, `nuevo_candidato`, `cuestionario` |
| Secciones presentes en algún menú | **28** | la unión de los tres perfiles coincide con el conjunto de ADMINISTRADOR |
| Declaradas **sin** menú | **10** | renderizadas: `inicio`, `solicitudes`, `nuevo_candidato`, `cuestionario`; **no renderizadas**: las 6 legadas |
| En menú **sin** render | **0** | ✔ |
| Ramas de render **sin** declarar | **0** | ✔ |

---

## 4. NAVEGACIÓN MÓVIL Y ESCRITORIO

### 4.1 Nº de entradas por perfil y plataforma (medido del código)

| Perfil | Escritorio (`Sidebar`) | Móvil (`MobileNav`) | Diferencia |
|---|---|---|---|
| ADMINISTRADOR | **28** | **27** | móvil **no ofrece `incidencias`** |
| PROPIETARIO | **21** | **20** | móvil **no ofrece `incidencias`** |
| PROFESIONAL (con `GESTOR_PATRIMONIAL`) | **6** | **6** | — |
| PROFESIONAL (sin el rol) | **4** | **4** | — |

### 4.2 Comparación con el route guard (`App.tsx`)

| Perfil | Guard permite y menú no ofrece | Menú ofrece sin guard |
|---|---|---|
| PROPIETARIO | móvil: `incidencias` | — |
| PROFESIONAL | **`inversion`** (ni escritorio ni móvil lo ofrecen) | `formalizacion`, `cobros` (sólo con rol `GESTOR_PATRIMONIAL`, que el guard sí añade → coherente) |
| ADMINISTRADOR | no hay guard por secciones | — |

Guard real (intacto, se considera **protegido**): `SECCIONES_PROPIETARIO` / `SECCIONES_PROFESIONAL`
en `App.tsx:319-347`, `seccionesAccesibles` en `App.tsx:865-872`, y el efecto de redirección en
`App.tsx:583-604`. Importante: **`Sidebar` no recibe `seccionesAccesibles`**; `MobileNav` lo recibe
pero **sólo lo usa para el asistente**, no para filtrar el menú. Es decir, hoy el menú **no se
deriva** de la fuente de acceso.

### 4.3 Estructura del menú móvil

Un único `<header>` con un botón que abre un panel `absolute … w-72 max-h-[60vh] overflow-y-auto`:

- Cabecera del panel: «Navegación» + contador «N módulos».
- Ítems: icono + etiqueta + **descripción** (ayuda a elegir) + badge + check del activo, con `data-tour`.
- Cierre: clic fuera (`mousedown` en `document`) o al seleccionar.
- El botón desplegable **no expone `aria-expanded` ni `aria-controls`**; el panel no tiene `aria-label`.
- Al seleccionar se hace `onSelectSection` + `setIsOpen(false)`, **sin** restaurar el scroll de la página.

---

## 5. FUENTES ACTUALES DEL MENÚ

Existen **cinco** fuentes que describen la misma navegación, sin relación entre ellas:

| # | Fuente | Ubicación | Contenido | Consumidor |
|---|---|---|---|---|
| 1 | Lista PROPIETARIO | `Sidebar.tsx:89-112` | 21 ítems: id + **etiqueta** + icono + badge | `Sidebar` |
| 2 | Lista PROFESIONAL | `Sidebar.tsx:113-123` | 4-6 ítems (condicional por `roles`) | `Sidebar` |
| 3 | Lista ADMINISTRADOR | `Sidebar.tsx:124-157` | 28 ítems | `Sidebar` |
| 4 | Lista por perfil MÓVIL | `MobileNav.tsx:94-166` | **las mismas tres listas reescritas**, con descripciones y otras etiquetas | `MobileNav` |
| 5 | Route guard | `App.tsx:320-347` | `SECCIONES_PROPIETARIO` (23 ids), `SECCIONES_PROFESIONAL` (5 ids) | redirección + §6 (ayuda/asistente/tutoriales) |

Evidencia de duplicación literal: `Sidebar.tsx` contiene 28 entradas `icon:` y `MobileNav.tsx`
54 coincidencias de `id:`/`icon:` — las listas se mantienen a mano en dos sitios.

`types.ts` (`SectionType`) actúa como vocabulario compartido, pero **no** describe orden, etiqueta,
icono, grupo ni perfil: cada componente lo redeclara.

---

## 6. AGRUPACIÓN ACTUAL POR ÁREAS

**No existe agrupación funcional.** Lo único presente:

| Mecanismo | Ubicación | Alcance |
|---|---|---|
| Encabezado fijo «Menú Principal» | `Sidebar.tsx:176-178` | único, estático, **no depende del perfil**, no agrupa |
| Encabezado «Navegación · N módulos» | `MobileNav.tsx:217-219` | cabecera del desplegable, no agrupa |
| Línea en blanco tras `cobros` | `Sidebar.tsx:133`, `MobileNav.tsx:118` | separación **visual implícita** (sin etiqueta) que insinúa un corte «antes/después de economía» |

Consecuencia: 28 destinos en una lista plana de ~2 pantallas en escritorio y ~1,5 pantallas de scroll
en el desplegable móvil, sin ninguna ayuda de agrupación ni búsqueda.

---

## 7. DUPLICIDADES E INCONSISTENCIAS DETECTADAS

### 7.1 Estructurales

| ID | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| **N1** | **Duplicación de las listas de menú** (escritorio vs móvil): mismas secciones mantenidas dos veces a mano | `Sidebar.tsx:89-157` vs `MobileNav.tsx:94-166` | UX-IMPORTANTE (raíz de N3, N4, N6) |
| **N2** | **El menú no se deriva de la fuente de acceso**: `Sidebar` no conoce `seccionesAccesibles`; `MobileNav` la recibe y no la usa para el menú | `App.tsx:3640,3661`; `MobileNav.tsx:67-88,94` | UX-IMPORTANTE (permite divergir del guard) |
| **N3** | **Divergencia menú↔guard (fail-closed)**: `inversion` está permitida al PROFESIONAL pero **no se ofrece** en ninguna plataforma | `App.tsx:344` vs listas | UX-MEJORA (segura, pero es una capacidad muerta) |
| **N4** | **Divergencia móvil↔escritorio**: `incidencias` falta en el menú móvil de ADMIN y PROPIETARIO, aunque el guard la permite y el escritorio la ofrece | medición §4.1 | **UX-CRÍTICO** (función accesible en escritorio, **inalcanzable en móvil**) |

### 7.2 Arquitectura de información

| ID | Hallazgo | Evidencia |
|---|---|---|
| **N5** | **Colisión de nombres**: `dashboard` = «Centro Control Ejecutivo» (escritorio admin) / «Centro de Control Ejecutivo» (móvil) / «Centro de Control» (propietario); `administracion` (admin) = «Centro de Control» → **dos destinos distintos llamados «Centro de Control»** | `Sidebar.tsx:90,127-128`; `MobileNav.tsx:102,141` |
| **N6** | **13 secciones con etiqueta distinta** entre perfiles/plataformas (`dashboard`, `administracion`, `cobros`, `configuracion`, `facturacion`, `financiacion`, `formalizacion`, `gastos`, `informes`, `inmuebles`, `propietarios`, `recomercializacion`, `tesoreria`). Parte es legítima por rol («Mis Viviendas» vs «Inmuebles»); el problema real es la **ambigüedad** (N5) y la falta de criterio documentado | medición automatizada |
| **N7** | **`inicio` (InicioSection) inalcanzable**: renderizada, con título en el `Header`, pero **fuera de los tres menús** y convertida en estado transitorio por la redirección del guard | `App.tsx:539,3717`; ausencia de `'inicio'` en ambos menús |
| **N8** | **`solicitudes` y `cuestionario` renderizadas sin ninguna entrada**: comparten componente con `candidatos` y tienen título propio en el `Header`, pero nada navega a ellas | `App.tsx:4092-4102`; `Header.tsx:65-72` |
| **N9** | **6 secciones legadas sin render ni menú** (`mis_profesionales`, `mis_contratos`, `mis_servicios`, `mis_zonas`, `mis_asignaciones`, `mi_perfil`) contaminan `SectionType`, `MODULO_POR_SECCION` (§6) y el mapa de ayuda | `types.ts:39-45`; `experiencia/contexto.ts:15-53` |
| **N10** | **Cabecera duplicada**: 28 secciones repiten título/subtítulo propios (`<h2>`) además del título del `Header`, con textos distintos entre sí; el nombre del panel también difiere del registrado en el Centro de Ayuda («Panel de inicio» para `dashboard`) | `Header.tsx:53-96`; `experiencia/ayuda.ts:14` |
| **N11** | **Sin estado activo anunciado**: el ítem activo se marca sólo por color; **no** hay `aria-current="page"`, ni `aria-expanded`/`aria-controls` en el desplegable móvil | `Sidebar.tsx:180-211`; `MobileNav.tsx:206-232` |

### 7.3 Invariantes que la implementación debe respetar (tests existentes)

| # | Test | Invariante que protege |
|---|---|---|
| T1 | `src/test/e/bloqueE.navegacion.test.tsx` | Etiquetas de ADMINISTRADOR sin duplicados y con «Portal Inquilinos»/«Suministros» **una sola vez**; PROPIETARIO ve «Suministros» y **no** «Portal Inquilinos» y conserva `Mis Viviendas`, `Mis Contratos`, `Mis Cobros`, `Mis Liquidaciones`, `Actas Entrada/Salida`, `Incidencias`; móvil con `startsWith` para «Portal Inquilinos»/«Suministros»; `SECCIONES_PROPIETARIO` como const con `];`, con `'suministros'` y sin `'inquilinos'`; `activeSection === 'tesoreria'` **una vez**; `<InquilinoPortalShell` **una vez** |
| T2 | `src/utils/dashboardCentroControl.test.ts:124-129` | Verificación **estática del texto** de `Sidebar.tsx`/`MobileNav.tsx`: contienen `'dashboard'` y (Sidebar) `LayoutDashboard` |
| T3 | `src/components/experiencia/experiencia.ui.test.tsx:214-232` | Exactamente **1** botón «Ayuda» por perfil en `Sidebar` (texto exacto) y **1** con `startsWith('Ayuda')` en `MobileNav`; y que navega a `ayuda` |
| T4 | `src/components/experiencia/experiencia.f2.ui.test.tsx:270-283` | El `Sidebar` real debe contener el target `data-tour="nav-inquilinos"` para el tutorial §6 |
| T5 | `src/components/experiencia/experiencia.f4.ui.test.tsx:60` | `MobileNav` monta con `activeSection="inicio"` (fallback a `allSections[0]`) y el asistente funciona |

**Conclusión de impacto:** T1, T3, T4 y T5 se mantienen **intactos** con la propuesta. **T2 es el único
que exige actualización**, y sólo porque afirma sobre el *texto literal* de dos componentes que
dejarán de contener las listas (ver justificación en §9.4).

---

## 8. MAPA UX-1

### 8.1 Objetivo

Que el usuario encuentre y entienda las **38 pantallas** del ERP con un único criterio de
navegación, idéntico en móvil y escritorio, derivado de una sola fuente mantenible, **sin exponer
nada que el RBAC no permita**.

### 8.2 Cambios previstos (aislados)

| # | Cambio | Tipo |
|---|---|---|
| A | **Catálogo único de presentación del menú**: secciones + etiqueta + icono + descripción + grupo + perfiles que la ven | fichero nuevo |
| B | `Sidebar` consume el catálogo; pinta **encabezados de grupo**; `aria-current="page"`; conserva badges y `data-tour` | 1 fichero |
| C | `MobileNav` consume el catálogo: **mismas secciones que escritorio** (se corrige N4), con grupos; `aria-expanded`/`aria-controls`/`aria-label`; posición de scroll al inicio al elegir; conserva descripciones, badges y `data-tour` | 1 fichero |
| D | Desambiguación de nombres (N5) y criterio de etiquetas por rol documentado | catálogo + doc |
| E | Pruebas nuevas (pureza del catálogo, paridad, cobertura de grupos, menú ⊆ guard, `data-tour`, ausencia de duplicados) | ficheros nuevos |
| F | Actualización mínima de T2 al nuevo dueño de los datos | 1 test existente |

### 8.3 Fuera de alcance de UX-1 (por orden expresa)

| Fuera | Motivo |
|---|---|
| C1–C4: carga / error / vacío, `loadingMain`, errores de lectura y de guardado | **UX-2** |
| Feedback de operaciones, avisos de éxito/error, `window.confirm`/`alert` | **UX-3** |
| `role="dialog"`, focus-trap, `Escape`, retorno de foco en los 103 modales | **UX-4** |
| `htmlFor`/etiquetas de formulario, `grid-cols-3/4/6` sin breakpoint | **UX-5** |
| Motores (`*Engine.ts`), `firestore.rules`, `storage.rules`, índices, colecciones, `lib/firebase.ts` | **NO TOCAR** (protegidos) |
| `SECCIONES_PROPIETARIO` / `SECCIONES_PROFESIONAL` / `seccionesAccesibles` / efecto de redirección | **NO TOCAR** (guard protegido; T1 además lo afirma) |
| Capa §6 (ayuda, tutoriales, asistente, progreso) | **NO TOCAR**; sólo se conserva su anclaje `nav-<seccion>` |
| Portal del Inquilino | fuera del bloque |
| Reflexión de la sección en la URL (deep-link) | **UX-8** |
| Leyenda de grupos, tokens de estilo, cabeceras duplicadas (N10), 6 secciones legadas (N9) | **UX-7** |

### 8.4 Invariantes de la implementación

1. **Ningún destino nuevo ni eliminado** respecto a la unión actual de menús (28 secciones), salvo la
   corrección de paridad **N4** (`incidencias` pasa a existir también en móvil).
2. **Ningún cambio de permisos**: el catálogo es presentación; el guard sigue siendo la autoridad y
   **no se modifica**.
3. `data-tour={`nav-${id}`}` presente en **todos** los ítems, en ambas plataformas (T4 y tutoriales §6).
4. Etiquetas exigidas por T1 conservadas **literalmente** para PROPIETARIO y móvil.
5. Sin `window.confirm`, sin `alert`, sin cambios de datos, sin escrituras.
6. Sin dependencias nuevas.

### 8.5 Riesgos y mitigación

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Romper T2 (texto literal) | **Cierta** | Actualización mínima justificada (§9.4) + nuevo test equivalente por render |
| Duplicar etiquetas en el DOM y romper T1 («sin duplicidades») | Media | Encabezados de grupo como elementos **no interactivos** (`<h3>`/`<p>`), nunca `<button>` |
| Menú más alto en escritorio | Baja | El `<nav>` ya es `flex-1 … overflow-y-auto`; móvil ya es `max-h-[60vh] overflow-y-auto` |
| Divergencia futura menú↔guard | Media | Test nuevo: menú ⊆ guard, leído estáticamente de `App.tsx` (mismo método que T1) |
| Que la propuesta de nombres rompa expectativas de producto | Media | Decisiones D-1…D-5 explícitas antes de implementar |

---

## 9. PROPUESTA CONCRETA DEL PRIMER CAMBIO AISLADO

### 9.1 Contenido del catálogo único (fichero nuevo `src/navegacion/navegacion.ts`)

- **6 grupos** (los que hoy sólo se insinúan con líneas en blanco):

| Grupo | Admin (28) | Propietario (21) | Profesional (4-6) |
|---|---|---|---|
| **Inicio y control** | `dashboard`, `administracion` | `dashboard` | — |
| **Cartera y propiedad** | `inmuebles`, `propietarios`, `inversion`, `inquilinos`, `suministros` | `propietarios`, `inmuebles`, `inversion`, `suministros` | `inmuebles` |
| **Económico** | `cobros`, `tesoreria`, `gastos`, `financiacion`, `conciliacion`, `facturacion`, `fiscal`, `informes`, `morosidad` | `cobros`, `tesoreria`, `gastos`, `financiacion`, `conciliacion`, `facturacion`, `fiscal`, `informes` | `cobros`\* |
| **Comercial y alquiler** | `candidatos`, `preseleccionados`, `seguro_impago`, `formalizacion`, `recomercializacion`, `analisis` | `formalizacion`, `recomercializacion` | `formalizacion`\* |
| **Operaciones y seguros** | `incidencias`, `operaciones`, `polizas`, `actas` | `incidencias`, `operaciones`, `polizas`, `actas` | — |
| **Sistema** | `configuracion`, `ayuda` | `configuracion`, `ayuda` | `configuracion`, `ayuda` |
| **Mi portal** | — | — | `administracion` |

\* Sólo con rol `GESTOR_PATRIMONIAL` (se conserva el condicional actual).
Los grupos sin ítems para un perfil **no se renderizan**.

### 9.2 API del catálogo (sin lógica de permisos, sin React)

```ts
// presentación pura y determinista
export type GrupoNavId = 'CONTROL' | 'CARTERA' | 'ECONOMICO' | 'COMERCIAL' | 'OPERACIONES' | 'SISTEMA';
export interface ItemNav { id: SectionType; grupo: GrupoNavId; icono: ...; descripcion: string;
                           etiqueta: Partial<Record<TipoPerfil, string>> & { porDefecto: string } }
export function gruposDePerfil(perfil: TipoPerfil, opts?: { gestorPatrimonial?: boolean }): GrupoNav[];
```

### 9.3 Secuencia de implementación (paso a paso, verificable)

1. Crear `src/navegacion/navegacion.ts` (catálogo + `gruposDePerfil`).
2. `src/navegacion/navegacion.test.ts`: pureza, unicidad de ids y de etiquetas, todo ítem en un
   grupo existente, **paridad de conjuntos con el guard** leído de `App.tsx`, ausencia de
   `inversion` para PROFESIONAL (fail-closed) y de `inquilinos`/`morosidad` para PROPIETARIO.
3. Refactorizar `Sidebar.tsx` para consumir el catálogo (conservando clases, badges, `data-tour` y
   el bloque de usuario/pie) → verificar T1 y T3.
4. Refactorizar `MobileNav.tsx` igual (conservando descripciones, badges, `data-tour`, asistente y
   acciones) + paridad N4 + `aria-expanded`/`aria-controls` → verificar T1 y T5.
5. `src/navegacion/navegacion.ui.test.tsx`: paridad escritorio↔móvil por perfil, presencia de
   encabezados de grupo, `data-tour` en ambas, ausencia de etiquetas duplicadas, `aria-current`.
6. Actualizar T2 (§9.4).
7. Ejecutar: tests del bloque, baterías de Bloques 2–9 afectadas (`test:bloque-e` incluida T1),
   `npx vitest run` global, `npm run lint`, `npm run build`, `git diff --check`.
8. Commit único (`feat(ux): unified role-aware navigation with grouped menu`), push a la rama de
   sesión, sin PR y sin merge.

### 9.4 Justificación de la única actualización de un test de bloque anterior

`src/utils/dashboardCentroControl.test.ts:124-129` afirma sobre el **texto fuente** de
`Sidebar.tsx`/`MobileNav.tsx` (`toContain("'dashboard'")`, `toContain('LayoutDashboard')`). Al mover
las listas al catálogo, esos literales dejan de existir en los componentes: es una consecuencia
**de localización del código**, no de comportamiento. Se propone:

- mantener **las mismas dos afirmaciones** apuntando al catálogo (`'dashboard'` presente, con
  `LayoutDashboard`), y
- **añadir** el invariante que el test original pretendía proteger de verdad: que `dashboard` se
  renderiza para PROPIETARIO y ADMINISTRADOR (verificado por render en el test nuevo), y que
  `Sidebar.tsx`/`MobileNav.tsx` **no** contienen listas locales de secciones (importan el catálogo).

Alternativa sin tocar T2: dejar las listas dentro de los componentes (mantiene N1 sin resolver) —
**descartada**: perpetúa la causa raíz de N4 y N5.

### 9.5 Decisiones que requieren confirmación antes de implementar

| ID | Decisión | Recomendación |
|---|---|---|
| **D-1** | `inicio` (InicioSection) inalcanzable (N7) | **No tocarla en UX-1.** Documentar; decidir junto con los tres paneles «de control» en UX-7 (renombrar/enlazar o consolidar) |
| **D-2** | `inversion` permitida al PROFESIONAL y no ofrecida (N3) | **Mantener fail-closed** (no ofrecer) y blindarlo con test. Si producto quiere ofrecerla, es cambio de catálogo + ampliación de guard, no de UX |
| **D-3** | `solicitudes` / `cuestionario` renderizadas sin entrada (N8) | **Fuera de UX-1** (toca render + `Header`): registrar como subbloque posterior |
| **D-4** | Nombres: `dashboard` → **«Centro de Control»** en todos los perfiles; `administracion` (admin) → **«Administración y Seguridad»** (alineado con su título real) | Aplicar; elimina la colisión N5 sin romper T1. Alineación fina del `Header` (N10) en UX-7 |
| **D-5** | Los 6 grupos de §9.1 y su asignación de secciones | Aplicar tal cual; ajustable sin coste (sólo catálogo + tests) |

---

## 10. SIGUIENTE PASO

Con las decisiones D-1…D-5 confirmadas (o con la recomendación por defecto aceptada),
implementar los pasos 1–8 de §9.3 como **primer cambio aislado de UX-1**, en un único commit
descriptivo, con pruebas nuevas, sin fusionar en `main` y sin tocar motores, datos, reglas ni permisos.
