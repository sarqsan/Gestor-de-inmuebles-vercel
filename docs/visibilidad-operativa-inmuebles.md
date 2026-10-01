# Visibilidad tras la baja patrimonial

Base verificada con `git fetch origin`: `origin/main` = `6d7e56ba8203a9fb3a0436bd4a532f41780aa412` (merge PR #15). Rama de sesión reseteada a esa base antes de editar.

## Diagnóstico y recorrido auditado

- Firestore (`subscribeInmuebles` / `procesarSnapshotInmuebles`) y la baja confirmada (`aplicarBajaAlEstado`) actualizan el mismo array en App. No había fallo de persistencia.
- `scopedInmuebles` aplica autorización, no ciclo patrimonial. Sidebar y Header contaban su longitud íntegra. Dashboard e Inicio también recibían ese array.
- `InmueblesSection` aplicaba su propio filtro de baja: resultado vacío tras navegar desde una tarjeta todavía visible en el portal. No hay una ruta URL individual desde ese botón: cambia de sección. Una ficha ya seleccionada conserva su ID local y ahora se protege al actualizarse por snapshot.
- Portal propietario repetía el ámbito de titularidad; App omitía el índice `titularesIds` que la suscripción Firestore y el portal ya reconocían. Se añade su reconocimiento en App, sin cambiar permisos, porcentajes o escrituras de titularidad.

## Única regla

`inmueblesOperativos` y `inmueblesDadosDeBaja`, en `bajaPatrimonialInmueble.ts`, delegan en el motor existente `inmuebleDadoDeBaja`. `VENDIDO` y `BAJA` son los estados reales del modelo. No se inventan estados `TRANSMITIDO`/`HISTORICO`. `SIN_EXPLOTACION` no implica baja. Tampoco la existencia de bajas anteriores tras una reactivación.

## Consumidores

- App deriva `inmueblesCarteraOperativa` con useMemo desde la cartera autorizada: cabeceras/contador, dashboard, inicio, tarjetas de propietarios y profesional, preselección, recomercialización y altas de candidato, agenda, seguro y profesional.
- Dashboard e Inicio defienden también su entrada mediante la misma utilidad. El dashboard no vuelve a aceptar todas las incidencias cuando la cartera queda vacía; sus listeners dependen de los IDs y no sólo del tamaño.
- Portal propietario separa tarjetas operativas de referencias completas de contratos y suscripción N-TITULARES.
- InmueblesSection conserva el array completo para histórico, pero el listado normal y su contador derivan de la misma proyección. Histórico muestra sólo históricos. Hay mensaje de cartera vacía y aviso con acceso explícito al histórico ante una ficha abierta que recibe una baja.
- Administración: indicadores de cartera operativa y filtro explícito de histórico en inspección global. Configuración y Operaciones: contadores operativos; los datos exportables y los registros históricos no se filtran.
- Administración · Propietarios: «Inmuebles en Gestión» (tabla y ficha) cuenta `carteraOperativa`, igual que «Ver Inmuebles» (2026-10-01; antes sumaba las bajas). Test: `tests/admin-propietarios-contador-baja.test.tsx`.
- Portal propietario: cabecera, pestaña, título, lista y perfil salen de `inmueblesOperativos`; cubierto con render real en `tests/portal-contador-viviendas-baja.test.tsx` (2 activas + 1 histórica → 2; 0 + 1 → 0; `SIN_EXPLOTACION` activa → 1).
- Selectores de alta: gastos, gastos recurrentes, préstamos, pólizas, garantías, mantenimiento, incidencias, trabajos, reformas, recomercialización, suministros, facturación, tesorería, actas y asignación a profesionales usan la utilidad común.
- `inmueblesParaSeleccion` permite conservar la referencia histórica de un registro **ya existente** al editarlo. No la ofrece en un alta normal ni reasigna el registro histórico. Los modales invalidan selecciones antiguas que dejan de pertenecer al conjunto seleccionable.

## Fuentes que intencionadamente conservan histórico

No se aplica un filtro destructivo a `scopedInmuebles`, ni a sus colecciones relacionadas. Los filtros de consulta de cobros, gastos, financiación, fiscalidad, facturas existentes, pólizas, incidencias, suministros, contratos, documentos, candidatos históricos, informes y exportación necesitan resolver también inmuebles históricos. Son consultas de registros/histórico, no selectores de cartera para un alta. Administración de permisos y titularidades tampoco pierde referencias históricas.

Se revisaron además los `inmuebles.length`, `filter`, estados, bajas e identificadores de titularidad de App, secciones, modales, utilidades y módulos patrimoniales. Las longitudes en migración/importación, exportación, pruebas y demo patrimonial no representan cartera operativa y no deben cambiarse. No hay un segundo contexto global de inmuebles que sincronizar.

No se cambian reglas de Firestore, ciclo de baja, publicación, motores económicos, porcentajes ni distribución. No se introduce borrado físico.

## Validación

Suite específica ampliada en `tests/baja-patrimonial-inmuebles.test.tsx`: 10 tests nuevos (35 en total), incluidos render real de listado, Inicio y dashboard, snapshot con ficha abierta, cambio de contador sin recarga, N titulares, selectores, estados y cableado de cabeceras.

`npm run lint` en este repositorio equivale a `tsc --noEmit`; no existe una configuración/comando ESLint independiente. El build puede advertir del tamaño del bundle, sin fallar.
