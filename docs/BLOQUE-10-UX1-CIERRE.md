# BLOQUE 10 · UX-1 — NAVEGACIÓN Y ARQUITECTURA DE INFORMACIÓN · CIERRE

> **Estado: CERRADO.** Un único commit en la rama `arena/01a0e939-gestor-de-inmuebles-vercel`
> (el que introduce este documento). Base de partida: `main @ c0c82245d1adccf752903765ea554cb3544f1072`.
> Este documento es el registro acumulativo del subbloque: SHA, pruebas, incidencias y alcance preservado.
> Documentos de referencia: [mapa UX completo](BLOQUE-10-UX-MAPA-ACTUAL.md) ·
> [inspección real de navegación](BLOQUE-10-UX1-INSPECCION-NAVEGACION.md).

---

## 1. QUÉ SE HA HECHO

| # | Cambio | Resultado |
|---|---|---|
| 1 | **Fuente única de navegación** `src/navegacion/navegacion.ts`: catálogo puro y determinista (sección, grupo, icono, etiqueta por perfil, descripción, perfiles, contador de badge, `data-tour`) | No existe ninguna otra lista de navegación en el ERP |
| 2 | **`Sidebar`** (escritorio) consume el catálogo: grupos con encabezado, `aria-current="page"`, `data-tour` conservado, badges conservados | Sin listas locales |
| 3 | **`MobileNav`** (móvil) consume **el mismo** catálogo: mismas secciones y mismo orden que escritorio, grupos, `aria-expanded`/`aria-controls`, `aria-current` | Sin listas locales |
| 4 | **Corrección de paridad N4**: `incidencias` ya está disponible en móvil para ADMINISTRADOR y PROPIETARIO (antes sólo en escritorio) | Hecha **sin tocar el guard** |
| 5 | **D-4 nomenclatura**: `dashboard` → «Centro de Control»; `administracion` (admin) → «Administración y Seguridad» | Sólo navegación; nombres internos de sección intactos |
| 6 | **D-5 agrupación**: seis grupos en orden fijo — Inicio y control · Cartera y propiedad · Económico · Comercial y alquiler · Operaciones y seguros · Sistema | Encabezados no interactivos (`h3`), sin submenús colapsables |

### Ficheros

| Fichero | Tipo |
|---|---|
| `src/navegacion/navegacion.ts` | **creado** (catálogo + derivaciones puras) |
| `src/navegacion/navegacion.test.ts` | **creado** (27 tests, sin DOM) |
| `src/navegacion/navegacion.ui.test.tsx` | **creado** (24 tests jsdom sobre los componentes reales) |
| `src/components/Sidebar.tsx` | modificado (listas eliminadas → catálogo + grupos + `aria-current`) |
| `src/components/MobileNav.tsx` | modificado (listas eliminadas → catálogo + grupos + paridad + a11y del desplegable) |
| `src/utils/dashboardCentroControl.test.ts` | modificado (T2: de texto literal a comportamiento real de catálogo + render) |
| `docs/BLOQUE-10-UX-MAPA-ACTUAL.md`, `docs/BLOQUE-10-UX1-INSPECCION-NAVEGACION.md`, este documento | documentación |

### Cobertura de navegación resultante

| Perfil | Escritorio | Móvil | Grupos pintados |
|---|---|---|---|
| ADMINISTRADOR | 28 | **28** (antes 27) | 6 |
| PROPIETARIO | 21 | **21** (antes 20) | 6 |
| PROFESIONAL con `GESTOR_PATRIMONIAL` | 6 | 6 | 5 |
| PROFESIONAL sin el rol | 4 | 4 | 3 |

En escritorio y móvil la secuencia de secciones es **idéntica** (verificado por render en
`navegacion.ui.test.tsx`).

---

## 2. PRUEBAS EJECUTADAS (tras el cambio, no heredadas)

| Prueba | Resultado |
|---|---|
| `src/navegacion/navegacion.test.ts` (nuevo) | **27/27 PASS** |
| `src/navegacion/navegacion.ui.test.tsx` (nuevo) | **24/24 PASS** |
| `src/utils/dashboardCentroControl.test.ts` (actualizado) | **22/22 PASS** |
| Regresión de navegación y capa §6 (`src/test/e/`, `src/components/experiencia/`, `src/experiencia/`) | **211/211 PASS (15 ficheros)** |
| Batería BLOQUE B | **92/92 PASS** |
| Batería BLOQUE C | **82/82 PASS** |
| Batería BLOQUE E | **64/64 PASS** |
| Batería BLOQUE 5 | **186/186 PASS** |
| Batería BLOQUE 7 | **435/435 PASS** |
| Batería BLOQUE 8 (inventario/dry-run) | **211/211 PASS (4 ficheros)** |
| Batería BLOQUE 9 | **119/119 PASS (12 ficheros)** |
| **Vitest global** | **133 ficheros · 2610 PASS · 2 skip · 0 FAIL** (base: 131 · 2557 · 2 · 0) |
| `tsc --noEmit` | **0 errores** |
| `npm run build` (vite + esbuild server) | **OK** (aviso de tamaño de chunk: preexistente, no relacionado) |
| `git diff --check` | sin problemas |

---

## 3. ALCANCE PRESERVADO (verificado por diff)

Intactos: `src/App.tsx` (guard y render), `src/types.ts`, `server.ts`, `src/lib/*`
(`firebase.ts`, `authService.ts`), `src/utils/*` (sólo su test), `src/tesoreria/`,
`src/notificaciones/`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`,
`package.json`, `package-lock.json`. Sin dependencias nuevas, sin cambios de datos,
sin escrituras, sin modificar permisos.

Fuera de alcance de UX-1 por decisión confirmada: `inicio` (D-1), `solicitudes` y
`cuestionario` (D-3), secciones legadas `mis_*`/`mi_perfil` (§11), cabeceras duplicadas
de sección (UX-7) y reflexión de la sección en la URL (UX-8).

**Fail-closed:** `inversion` sigue permitida por el guard al PROFESIONAL y **no** se le
ofrece en el menú (probado en catálogo y en render).

---

## 4. INCIDENCIAS REGISTRADAS

| Tipo | Incidencia | Estado |
|---|---|---|
| No bloqueante (funcional-documental) | **N10 residual**: los títulos de pantalla (`Header` y `<h2>` de cada sección) siguen usando la nomenclatura interna — p. ej. el menú dice «Centro de Control» y la pantalla «Centro de Control Ejecutivo»; «Administración y Seguridad» vs «Administración Global & Seguridad». D-4 limitó el cambio a la navegación y prohibió tocar nombres internos | Documentada; se resolverá en **UX-7** (coherencia visual) |
| No bloqueante | `incidenciasAbiertasCount` no lo envía `App.tsx` a ningún menú: el badge de incidencias nunca se pinta (comportamiento **previo** conservado, idéntico en ambas plataformas) | Documentada; pertenece a **UX-2/UX-3** (estados y feedback) |
| No bloqueante | Sin desplazamiento al inicio al cambiar de sección en móvil (heredado de la posición del desplegable) | Documentada; **UX-7** |
| Infraestructura | **INFRA-01 — Firebase Emulator** sigue bloqueado (sin JDK/JAR descargables). **No se ha reintentado su instalación** en este subbloque | Documentada, sin efecto en UX-1 |
| Infraestructura | Clon *shallow* (1 commit): la historia detallada no es auditable localmente | Documentada |

---

## 5. SIGUIENTE PASO

**UX-2 — estados de datos** (carga real, error de lectura visible y reintento, distinción
«cargando» vs «vacío», `loadingMain` del Centro de Control), sin tocar motores, reglas ni permisos.
No se inicia dentro de este cierre.
