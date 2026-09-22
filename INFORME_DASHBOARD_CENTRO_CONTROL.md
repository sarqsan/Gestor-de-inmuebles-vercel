# INFORME FINAL — Centro de Control Ejecutivo del ERP (Arena D)

**Fecha:** 2026-09-22
**Rama:** arena/01a0ab9d-gestor-de-inmuebles-vercel
**Commit dashboard:** ccf4a6f5f98bb81f3a6a41fa60cbb1166a445582 — feat(dashboard): centro de control ejecutivo del ERP
**Commit merge final:** 4a8b31f906efa0b6995fe4304d9adaaa434e397f (merge remoto GAP6/Bloque D)
**Commit fix tipado:** 05b5f9c (HEAD actual)
**Push:** confirmado a origin/arena/01a0ab9d-gestor-de-inmuebles-vercel (no integrado Arena A)

## Auditoría de fuentes reales (sin datos ficticios)

| Módulo | Fuente real | Colección / Engine | Uso en dashboard |
|--------|-------------|-------------------|------------------|
| Inmuebles | subscribeInmuebles scoped propietarioId/inmuebleIds | `inmuebles` | total, ocupados, vacíos, modalidad habitaciones, % ocupación |
| Contratos | subscribeContratos scoped | `contratos` + `esVigente` + `fechaFinContrato` | activos, próximos fin 60d, finalizados |
| Cobros | obtenerTodosCobros(scopedContratos) + registroCobros CobroPeriodo[] | cobrosEngine.calcularResumenCobros, calcularAvisosCobros | ingresos cobrados, pendientes, morosidad, evolución mensual |
| Gastos | subscribeGastos scoped | `gastos` + gastosEngine.resumenGastos | explotación pagado, financiación pagado, salida caja, pendientes |
| Tesorería | derivada ingresos - gastos | cálculo derivado claro | saldo neto, solo si hay datos |
| Morosidad | cobros estado RETRASADO/INCIDENCIA/IMPAGADO | cobrosEngine | count + importe |
| Incidencias | subscribeIncidencias scoped | `incidencias` | abiertas, urgentes, en curso |
| Tareas | subscribeTareasMantenimiento scoped | `tareas_mantenimiento` | próximas |
| Trabajos | subscribeTrabajosProfesionales scoped | `trabajos_profesionales` | órdenes activas |
| Pólizas | subscribePolizas | `polizas_seguros` + diasHasta(fechaVencimiento) | próximas vencer 60d, vencidas |
| Siniestros | subscribeSiniestros | `siniestros` | conteo |
| Actas | subscribeActas scoped (firebaseActas) | `actas` estados BORRADOR/EN_REVISION/PENDIENTE_FIRMA | pendientes firma |
| Expedientes recomercialización | subscribeExpedientesRecomercializacion scoped | `expedientes_recomercializacion` | conteo |
| Candidatos | prop candidatos scoped | `candidatos` estado nuevo/pendiente_doc | pendientes revisión |
| Actividad | subscribeAuditLogs (solo ADMIN) fallback contratos/gastos/incidencias | `audit_logs` + historial contratos/gastos/incidencias | 8 últimas acciones reales |

**Confirmación no ficticios:** componente no contiene `mockData`, `datosFicticios`, `12345`, `DEMO =`. Todos los KPIs derivan de motores existentes. Si dato no existe → vacío informativo (`Sin datos...`, `Sin inmuebles registrados`, `Sin movimientos en el periodo...`), nunca 0 como sustituto de dato no obtenido (porcentaje ocupación null si total 0, formatEuro devuelve "—" si undefined).

## Archivos creados / modificados

- **Creado:** `src/components/sections/DashboardEjecutivoSection.tsx` (1155 líneas) — cabecera fecha/periodo/acciones rápidas, KPIs 6 tarjetas, Requiere Atención priorizado, financiero ingresos/gastos/tesorería + evolución mensual con div bars sin librería externa, resumen inmuebles, operaciones (incidencias/tareas/trabajos/pólizas/actas/recomercialización), actividad reciente, preparado IA sin implementar, responsive, sin localStorage.
- **Creado:** `src/utils/dashboardCentroControl.test.ts` (266 líneas) — tests KPIs, vacío, carga/error, prioridad, navegación, permisos, ficticios, responsive, regresión motores.
- **Modificado:** `src/types.ts` — SectionType añade `'dashboard'` (línea 1).
- **Modificado:** `src/components/Sidebar.tsx` — import LayoutDashboard, navItems PROPIETARIO (Centro de Control) y ADMIN (Centro Control Ejecutivo) con dashboard primero, badges existentes.
- **Modificado:** `src/components/MobileNav.tsx` — import LayoutDashboard, allSections PROPIETARIO/ADMIN con dashboard id y descripción.
- **Modificado:** `src/components/Header.tsx` — getSectionTitle case 'dashboard' título Centro de Control Ejecutivo + subtítulo.
- **Modificado:** `src/App.tsx` — default activeSection 'dashboard', import DashboardEjecutivoSection, render dashboard con props scopedInmuebles/scopedContratos/scopedCobros/scopedGastos/scopedCandidatos/scopedPropietarios/currentUser/onSelectSection, allowedSections PROPIETARIO/PROFESIONAL/ADMIN incluyen dashboard, route guard no redirige, login success → dashboard.

## Bloques visuales

1. **Cabecera ejecutiva:** título, contexto perfil, fecha larga, periodo filtro MES_ACTUAL/ULT_3M/ULT_6M/ANO_ACTUAL/ULT_12M, acciones rápidas a cobros/gastos/incidencias/inmuebles (onSelectSection).
2. **KPIs principales (6 tarjetas navegables):** Inmuebles (total/ocupados/vacíos), Ocupación (% + barra), Ingresos cobrados (totalRecibido + % cobrado), Gastos pagados (salidaCaja + explotación/financiación), Cobros pendientes (count + importe), Morosidad (count + importe, verde 0).
3. **Requiere tu atención:** priorizado critica/alta/media (cobros vencidos, morosidad, incidencias abiertas/urgentes, gastos pendientes, contratos fin 60d, pólizas próximas, actas pendientes, candidatos). Ordenado por criticidad real, navegable.
4. **Financiero:** ingresos/gastos/tesorería derivada (3 cards), evolución mensual ingresos vs gastos (div bars, max calculado, solo si datos), detalle cobros por estado (4 cards).
5. **Resumen inmuebles:** total/ocupados/vacíos, lista 6 primeros con dirección/ciudad/modalidad/estado/precio, nota habitaciones.
6. **Operaciones:** incidencias (abiertas/urgentes/en curso + 3 abiertas), tareas mantenimiento (próxima fecha), trabajos profesionales, pólizas (próximas/vencidas + 2 alertas), actas y recomercialización conteos.
7. **Actividad reciente:** audit_logs si existen (canónica registrarAuditoriaFirestore) else fallback contratos/gastos/incidencias últimos, con icono tipo y fecha corta.
8. **IA preparado:** hueco arquitectónico sin implementar, documenta entrada/salida y reutilización motores existentes.
9. **Pie navegación rápida:** botones a módulos existentes (inmuebles, formalizacion, cobros, gastos, incidencias, polizas, actas, conciliacion) + nota arquitectura.

## KPIs por fuente y cálculo

- **Total inmuebles:** `inmuebles.length`
- **Ocupados:** `inmuebles.filter(estado==='alquilado').length`
- **% ocupación:** `Math.round(ocupados/total*100)` null si total 0
- **Ingresos cobrados:** `calcularResumenCobros(cobros).totalRecibido` (suma importeRecibido si RECIBIDO/VERIFICADO)
- **Gastos pagados:** `resumenGastos(gastos).salidaCajaPagada`
- **Tesorería neta:** `totalRecibido - salidaCajaPagada` (derivada, hasData check)
- **Cobros pendientes:** vencidos = RETRASADO/INCIDENCIA/IMPAGADO + PENDIENTE con fechaVencimiento <= hoy
- **Morosidad:** `RETRASADO+INCIDENCIA+IMPAGADO` count + importePrevisto-importeRecibido
- **Incidencias abiertas:** `!['CERRADA','RESUELTA','CANCELADA','RECHAZADA'].includes(estado)`
- **Pólizas próximas:** `diasHasta(fechaVencimiento) in [-1,60]`

## Navegaciones conectadas (sin rutas ficticias)

- KPIs → `onSelectSection('inmuebles'|'cobros'|'gastos')`
- Requiere atención → `onSelectSection(item.accion)` con acciones reales: cobros, incidencias, gastos, formalizacion, polizas, actas, candidatos
- Cabecera acciones rápidas → cobros, gastos, incidencias, inmuebles
- Resumen inmuebles Ver todo → inmuebles
- Operaciones Ver → incidencias, polizas
- Pie navegación rápida → inmuebles, formalizacion, cobros, gastos, incidencias, polizas, actas, conciliacion

Todas usan SectionType existente, no rutas ficticias.

## Tratamiento vacíos / error / carga

- **Carga:** `loadingMain || loadingOps` → skeleton 6 cards animate-pulse
- **Vacío global:** `!hasAnyData` → card "Sin datos suficientes..." con botón Ir a Inmuebles, texto "No se muestran datos ficticios ni valores 0 como sustituto"
- **Vacío por bloque:** cada bloque tiene `length===0` → border dashed + mensaje fuente real (ej: "Sin incidencias registradas — Fuente: colección incidencias")
- **Error:** `errorOps` → bg-rose-50 con mensaje error + "Se muestran KPIs con datos principales disponibles"
- **Sin datos suficientes para gráfico:** `evolucionMensual.every(ingresos===0 && gastos===0)` → "Sin movimientos en el periodo seleccionado. No se muestran gráficos ficticios"
- **Profesional bloquea financiero:** `isProfesional` → "No disponible para perfil profesional por aislamiento RBAC"
- **Nunca 0 sustituto:** `formatEuro` devuelve "—" si undefined/null/NaN, porcentaje ocupación null si total 0, no se fuerza 0.

## Confirmación no ficticios

- Búsqueda en DashboardEjecutivoSection.tsx: no `mockData`, no `datosFicticios`, no asignación demo, evolución solo si datos, tesorería derivada solo si hasData, actividad fallback real.
- Tests específicos: `no contiene números demo hardcodeados`, `evolución mensual solo si datos suficientes`.

## Confirmación no tocado R1/R2/R3/R4 Bloque C

- **R1/R2/R3/R4:** no se modificaron `firestore.rules` con código de escritura (solo lectura ownerId check). El archivo `firestore.rules` en rama sigue con deny-by-default y checks ownerId/propietarioId. Test verifica `ownerId` presente.
- **Bloque C morosidad:** no se modificó `cobrosEngine` lógica de estados (solo reutilizado calcularResumenCobros, calcularAvisosCobros, generarPeriodosParaContrato). Test regresión `cobrosEngine sigue generando periodos deterministas` pasa.
- **No se modificaron motores cerrados:** `gastosEngine`, `profesionalesEngine`, `segurosEngine` no tocados por dashboard (solo lectura). Verificación existencia archivos críticos.
- **No localStorage sensible:** dashboard no usa localStorage.setItem/getItem.
- **No segunda fuente verdad:** reutiliza servicios existentes, no duplicar lógica negocio, preparado IA sin implementar.

## Tests

- **Nuevo:** `src/utils/dashboardCentroControl.test.ts` — 20 tests:
  - KPIs reales (inmueblesStats, resumenCobros, resumenGastos, tesorería, morosidad)
  - Vacío informativo (null no 0)
  - Prioridad atención orden
  - Permisos (SectionType dashboard, Sidebar/MobileNav, no localStorage, profesional bloquea)
  - Ausencia ficticios (no demo, evolución solo si datos)
  - Navegación rutas reales
  - Responsive grid-cols
  - Arquitectura reutiliza motores
  - IA preparado sin implementar
  - Regresión motores cerrados
- **Suite completa:** `npx vitest run` → 266 passed (10 test files)
- **Dashboard solo:** 20 passed

## tsc y build prod

- **tsc --noEmit:** exit 0 (después de fix toBeTruthy)
- **vite build:** 2103 modules transformed, built in 10.90s, chunks: index 3.6MB gzip 858KB, sin errores, solo warnings dynamic import actas ya existentes (no bloqueante)

## Hash commit y push Arena D

- Commit dashboard original: `ccf4a6f5f98bb81f3a6a41fa60cbb1166a445582`
- Merge remoto GAP6/Bloque D: `4a8b31f906efa0b6995fe4304d9adaaa434e397f`
- HEAD actual: `05b5f9c` fix tipado
- Push: `git push origin arena/01a0ab9d-gestor-de-inmuebles-vercel` → éxito (672b7ee..05b5f9c)
- No integrado Arena A (solo rama Arena D)

## Responsive

- Clases: `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`, `sm:p-7`, `flex-col lg:flex-row`, `xl:col-span-2` + `xl:grid-cols-3`, `max-h-64 overflow-y-auto`, `md:hidden` MobileNav vs `hidden md:flex` Sidebar → ordenador/tablet/móvil con jerarquía clara, testeable por clases.

## Seguridad

- Respeto permisos existentes: `allowedInmuebleIds` filtrado client-side defensa en profundidad, `isProfesional` bloquea financiero, `currentUser.tipoPerfil` scope, no nuevas vías info privada.
- No modificar Firestore/Storage rules R1/R2/R3/R4 (solo lectura).
- No duplicar sensibles localStorage.
- Reutiliza `DataAccessScope` y `subscribe*` con scope.
- Storage Firebase existente referencia persistente (no base64 Firestore).

## Preparado IA

- Bloque visual "Asistente contextual IA — Preparado" sin implementar openai/genai, documenta entrada cartera y salida insights, sin segunda fuente verdad, sin duplicar lógica.

---
Fin informe.
