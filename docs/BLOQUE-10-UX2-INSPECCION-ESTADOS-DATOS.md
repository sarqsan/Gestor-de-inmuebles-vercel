# BLOQUE 10 · UX-2 — ESTADOS DE DATOS · INSPECCIÓN REAL (FASE 1) Y MAPA C1–C4

> Artefacto de la Fase 1 de UX-2. **Ninguna línea de código se modificó para producirlo.**
> Base: rama `arena/01a0e939-gestor-de-inmuebles-vercel`, HEAD `ab107b2` (UX-1), árbol limpio.
> Método: lectura del código real (`src/App.tsx`, `src/lib/firebase.ts`, `src/components/**`) con conteos verificables.

---

## 1. TABLA DE HALLAZGOS

| # | Hallazgo | Archivo(s) | Causa real | Efecto UX | Solución UX-2 |
|---|---|---|---|---|---|
| **C1** | **Falso vacío**: los listados muestran «No hay datos» mientras la lectura sigue pendiente | `App.tsx:413-425,494-518` (25 estados arrancan en `[]`), 125 mensajes «No hay…» en 23 secciones | El estado del host no distingue «sin primer snapshot» de «cero documentos»: un contador de suscripción no existe | El usuario concluye que **no tiene datos** | Estado explícito por lectura en el host (`CARGANDO`/`LISTO`/`ERROR`) + puerta de pantalla: mientras haya lecturas pendientes se muestra carga, **no** la sección |
| **C1.b** | 9 colecciones arrancan desde **caché localStorage** (`propietarios`, `candidatos`, `inmuebles`, `solicitudes`, `invitaciones`, `slots`, `solicitudes_doc`, `contratos`, `solicitudes_seguro`) | `App.tsx:356-432` | Caché de lectura previa | Se muestra dato **no verificado** como si fuera actual | Se aplica la misma puerta de pantalla (estado `CARGANDO` hasta el primer snapshot) |
| **C2** | **Errores de lectura invisibles**: 38 callbacks de error de `onSnapshot` sólo hacen `console.error` | `src/lib/firebase.ts:220,237,306,335,356,424,455,474,671,690,860,904,1196,1218,1288,1308,1354,1374,1431,1480,1508,1587,1982,2025,2068,2479,2525,2564,2595,2628,2678,2880,2957,3022,3061,3231,3287,3338,3404…` | La capa de datos no tiene canal de error hacia la UI | Una denegación de reglas o una caída de red se ven como «no hay datos» | Canal de incidencias + reporte desde cada callback (conservando el log técnico) + error visible con **Reintentar** |
| **C2.b** | **Sin reintento**: ninguna lectura puede repetirse desde la UI (no hay router recargable ni botón) | `App.tsx:1111-1362` (efecto de suscripciones) | El efecto se re-ejecuta sólo al cambiar usuario/ámbito | El usuario queda atrapado en un estado fallido | Contador `intentoLecturas` en las dependencias del efecto → «Reintentar» **re-crea las suscripciones** (lectura real, sin recargar la página) |
| **C3** | **Errores de guardado invisibles**: 86 funciones de escritura en la capa de datos; 83 `catch` que registran y devuelven `false`/nada; **99** llamadas de persistencia en `App.tsx`, la mayoría *fire-and-forget* sobre estado optimista | `src/lib/firebase.ts` (44 `setDoc`, 30 `deleteDoc`, 5 `writeBatch`, 3 `runTransaction`), `App.tsx` (99 llamadas) | La UI actualiza primero y nadie lee el resultado de la escritura | El ERP **afirma implícitamente** que guardó cuando no lo hizo (divergencia UI↔Firestore) | Reporte de fallo desde los `catch` de escritura (una línea por `catch`, **sin** cambiar el control de flujo ni el patrón optimista) + aviso visible no bloqueante; el éxito **no** se cambia aquí (feedback de éxito = UX-3) |
| **C3.b** | `persistirMejorEsfuerzo` **devuelve** los errores y sus 2 usos los descartan (`void`) | `App.tsx:1627,1696`; `src/lib/invitacionesCandidatos.ts:138-153` | El contrato best-effort se documentó pero nadie consume el resultado | Alta de candidato / invitación puede fallar en silencio | Leer `{errores}` y reportarlos al canal |
| **C3.c** | 23 `catch (e) {}` vacíos + `.then((ok) => { if (!ok) return; })` que descartan el fallo | `App.tsx:1850-1851`, `1904` y siguientes | Patrón optimista heredado | Igual que C3 | Se reportan los dos sitios que **ya** consultan el resultado; el resto de *fire-and-forget* queda **documentado** (ver §4: exige cambiar el patrón B5, fuera de UX-2) |
| **C4** | **`loadingMain` nunca se activa**: se declara y se consume en el Centro de Control, pero el host **nunca** lo pasa | `DashboardEjecutivoSection.tsx:98,138,590`; `App.tsx:3703-3716` | Falta el cableado host → sección | El panel ejecutivo renderiza ceros/vacíos sin explicar que los datos no han llegado | `loadingMain` pasa a ser **derivado** del estado real de lecturas de la pantalla |

**Verificación de que no hay más hallazgos inventados:** no se han incluido problemas de navegación (UX-1, cerrado), de feedback global ni `window.confirm` (UX-3), de nomenclatura/cabeceras (UX-7) ni de formularios/tablas (UX-5/UX-6).

---

## 2. LECTURAS: ESTADO ACTUAL Y ESTADO OBJETIVO

| Lectura (host) | Estado inicial hoy | Primer snapshot | Error hoy | Estado objetivo |
|---|---|---|---|---|
| `inmuebles`, `candidatos`, `propietarios`, `solicitudes`, `contratos`, `invitaciones`, `slots`, `solicitudes_doc`, `solicitudes_seguro` | caché localStorage (dato no verificado) | `LISTO` | invisible | `CARGANDO` → `LISTO` / `ERROR` + reintento |
| `gastos`, `gastos_recurrentes`, `prestamos`, `incidencias`, `expedientes_recomercializacion`, `inmobiliarias`, `propuestas`, `leads`, `liquidaciones`, `gastos_inmuebles`, `ordenes_pago`, `ficheros_sepa`, `mandatos_sepa`, `trabajos`, `morosidad_*`, `usuarios`, `profesionales`, `enlaces_registro`, `especialidades`, `audit_logs`, `modulos_config` | `[]` (falso vacío) | `LISTO` | invisible | ídem |
| `auth` (sesión) | — | — | ya visible (mensaje de bloqueo + alerta) | No se toca |

---

## 3. GUARDADO: ESTADO ACTUAL Y OBJETIVO

| Flujo | Hoy | Objetivo UX-2 |
|---|---|---|
| Escrituras de la capa de datos (86 funciones, 83 `catch`) | log técnico y retorno `false`/`void`; **nada** llega a la UI | cada `catch` informa al canal → aviso visible; se conserva el `console.error` |
| `persistirMejorEsfuerzo` (2 usos) | `void` → errores descartados | `{errores}` leído y reportado |
| Cierres de modal tras guardar (13 puntos) | se cierran igual | **no se modifican** en UX-2 (el patrón optimista pertenece a B5; ver §4) |
| Éxito de guardado | sin feedback | **UX-3** (feedback y acciones) — no se implementa aquí |

---

## 4. LÍMITES DECLARADOS DE UX-2 (y por qué)

1. **No se elimina el patrón optimista** (la UI sigue actualizándose antes de la confirmación de Firestore): hacerlo cambia la arquitectura de persistencia de B5, prohibido en esta orden (§8). UX-2 garantiza que **el fallo se vea**.
2. **No se instrumentan los `catch` internos de mejor esfuerzo** (`console.warn('No se pudo actualizar la ficha pública…')`, espejos de lectura, auditoría auxiliar): son *best-effort* por diseño y ya están documentados como tales.
3. **`writeBatch`/`runTransaction`**: sus fallos se reportan desde los `catch` que los envuelven (misma vía que el resto), sin interceptar el SDK.
4. **No se introduce dependencia, store ni segunda fuente de verdad**: el estado de lectura se deriva de las **mismas** suscripciones; los datos siguen viviendo donde vivían.
5. Los 3 puntos métricos (badge de incidencias sin alimentar, scroll móvil, cabeceras) siguen fuera: pertenecen a UX-2/UX-3/UX-7 según lo ya documentado — el badge queda **expresamente fuera** al no ser un estado de datos de pantalla.

---

## 5. CONTRATO DE ESTADO (implementado)

```
EstadoLectura = 'CARGANDO' | 'LISTO' | 'ERROR'
```

- `CARGANDO` → la pantalla muestra carga (nunca «sin datos»).
- `LISTO` + cero elementos → la sección muestra su **estado vacío real** (el existente; no se reescribe).
- `ERROR` → mensaje accionable + **Reintentar** (re-crea la lectura real).

Ninguna ruta convierte `ERROR` en `[]`.

---

## 6. FASE 2 — IMPLEMENTACIÓN (estado final)

### 6.1 Archivos creados

| Archivo | Papel |
|---|---|
| `src/estadoDatos/canalIncidencias.ts` | Fuente única del estado de datos: `EstadoLectura`, agregación por pantalla (`calcularEstadoDatosPantalla`), canal de incidencias (`reportarErrorLectura`, `reportarErrorGuardado`, `reportarResultadoGuardado`), etiquetas legibles y mensajes sin detalles técnicos. Declara también las **lecturas activas por perfil** y las **lecturas primarias de cada pantalla**. |
| `src/estadoDatos/useEstadoLecturas.ts` | Hook local (sin store global) que mantiene `CARGANDO` / `LISTO` / `ERROR` por origen a partir de las **mismas** suscripciones, escucha el canal y expone `intento` + `reintentar()` (contador que rehace las suscripciones). |
| `src/components/estado-datos/EstadoDatosPantalla.tsx` | `CargandoDatosPantalla` (reutiliza el lenguaje visual/spinner existente), `ErrorDatosPantalla` («No se han podido cargar los datos» + **Reintentar**) y `PuertaEstadoDatos`, que sólo deja pasar la sección cuando su lectura terminó. |
| `src/components/estado-datos/AvisoIncidenciasDatos.tsx` | Aviso no bloqueante en el shell: fallos de **lectura** y de **guardado** antes invisibles (sólo consola), descartables, con «Reintentar lectura». |

### 6.2 Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/App.tsx` | Estado de lectura del host (`useEstadoLecturas` + `conDatos`); **27 callbacks de suscripción** marcados; puerta de pantalla en el shell; `loadingMain` alimentado con el estado real del Centro de Control; contador `intentoLecturas` en las dependencias del efecto de suscripciones (Reintentar real, sin recargar); 6 puntos de guardado que descartaban el resultado (alta/edición/borrado de inmueble, alta de candidato, invitaciones, importación masiva, asignación de profesional) ahora informan del fallo. |
| `src/lib/firebase.ts` | **44** manejadores de error de suscripción pasan por el canal conservando la misma traza técnica; ningún `console.error(... snapshot error)` queda fuera del canal. |
| `src/lib/tesoreriaFirestore.ts`, `src/lib/morosidadFirestore.ts`, `src/lib/firebaseActas.ts`, `src/lib/firebaseInversion.ts`, `src/lib/sindicacionFirestore.ts` | Ídem (lecturas de tesorería, morosidad, actas, inversión y sindicación). |
| `src/lib/suministrosFirestore.ts` | **Corregido el caso literal de la regla fundamental**: el error de una suscripción hacía `cb([])` (ERROR → lista vacía). Ahora informa al canal y no emite datos falsos. |

### 6.3 Invariantes verificadas por test (`src/estadoDatos/integracionHost.test.ts`)

1. Toda lectura activa de cada perfil tiene camino a `ERROR` (instrumentada) → ninguna pantalla puede quedarse cargando para siempre.
2. Toda lectura que el host marca tiene camino a `LISTO`, y todas las activas están envueltas.
3. Puerta + `intentoLecturas` + `loadingMain` + aviso están alimentados por el estado real (una sola fuente de verdad); el reintento no recarga la página.
4. El resultado de las escrituras con contrato booleano (B5) ya no se descarta; no quedan `void persistirMejorEsfuerzo(tareas)`.
5. Ninguna suscripción emite `[]` desde su manejador de error; los mensajes de usuario no contienen detalles del SDK.

### 6.4 Límites mantenidos (declarados, no son regresiones)

- **Patrón optimista intacto** (B5): la UI sigue sin revertir automáticamente; UX-2 hace visible el fallo. La reversión/undo es UX-3.
- El éxito de guardado **no** emite feedback todavía (UX-3 lo define con el sistema de avisos).
- `window.confirm` (25) intactos: UX-3.
- Las secciones con suscripción propia (p. ej. `SuministrosSection`) conservan su propio indicador; sus fallos de lectura ya son visibles por el aviso y no declaran orígenes bloqueantes en el host.
