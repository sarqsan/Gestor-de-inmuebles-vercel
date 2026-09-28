# BLOQUE 10 · UX-3 + UX-4 — INSPECCIÓN DE FEEDBACK, ACCIONES Y FORMULARIOS

> Fase 1 de la orden UX-3 + UX-4. Escrito **antes** de modificar código, sobre el árbol
> `0186173` (UX-2 cerrado). Los recuentos están tomados del árbol real, no de informes previos.

Custodia previa: rama `arena/01a0e939-gestor-de-inmuebles-vercel`, HEAD `0186173`, padre
`ab107b2` (UX-1), `main` en `c0c8224`, árbol limpio. Verificado hash a hash (687/687 ficheros
idénticos al remoto) tras restaurar las referencias perdidas por el snapshot.

---

## 1. UX-3 — FEEDBACK Y ACCIONES

| # | Hallazgo | Archivo | Causa | Efecto UX | Solución propuesta | Riesgo de regresión |
|---|---|---|---|---|---|---|
| **F1** | 25 `window.confirm` nativos en 17 ficheros | `IncidenciasSection` (3), `GastosSection` (3), `DetalleExpedienteModal` (3), `SuministrosSection` (2), `InquilinosSection` (2), `DetallePolizaModal` (2), `TesoreriaSection`, `PolizasSegurosSection`, `InmueblesSection`, `MejorasROIModal`, `InspeccionFotograficaModal`, `MantenimientoPreventivoPanel`, `GarantiasReparacionPanel`, `DocumentosPatrimonialesPanel`, `DetalleSolicitudDocModal`, `PortalDocumentacionPublicaView` | Diálogo del navegador: sin estilo, sin contexto, sin estado de ejecución | Bloqueante, incoherente con el ERP, no se puede bloquear el doble envío ni mostrar el resultado | Diálogo de confirmación propio (`confirmar` / `confirmarYEjecutar`) con título, qué va a ocurrir, etiquetas distinguibles, peligro visual, estado «ejecutando» y resultado | Medio: cada sustituto debe ejecutar **exactamente** la misma operación que había tras el `confirm` |
| **F2** | Éxito mostrado **sin confirmar la persistencia** | `GarantiasReparacionPanel:97`, `MantenimientoPreventivoPanel:129`, `DetallePolizaModal:193`, `DetalleExpedienteModal:180/210`, `MejorasROIModal:166`, `InspeccionFotograficaModal:163` | El `catch` de las funciones de escritura sólo hace `console.error` y no devuelve señal; la UI asume éxito | El usuario cree que se guardó algo que puede no haberse guardado | Instrumentar los `catch` de **escritura** en el canal (UX-2 ya instrumentó las lecturas) y que `ejecutarOperacion` no muestre éxito si durante la operación se registró un fallo de guardado | Medio: instrumentar `catch` no cambia el flujo (mismo retorno, mismos errores) |
| **F3** | Sistema de avisos inexistente: 4 mecanismos locales distintos | `SuministrosSection` (`aviso` + `setTimeout` 4 s, icono verde para todo), `GarantiasReparacionPanel`/`MantenimientoPreventivoPanel` (`notificacion` + 4 s), `MorosidadDetalleModal` (aviso tipado), `DocumentosPatrimonialesPanel` (`mensaje`/`error`) | Cada componente improvisó su aviso | Lenguaje y duración incoherentes; los **errores desaparecen solos a los 4 s** | Canal de avisos de operación + host único (`AvisosOperacion`) con éxito/error/info; el éxito se autodescarta, el **error permanece** hasta descartarlo | Bajo: el canal es aditivo; los avisos locales existentes se sustituyen sólo donde se toca la acción |
| **F4** | Acciones destructivas sin bloqueo de doble ejecución | Todos los sitios de F1; `DetallePolizaModal:569`, `TesoreriaSection:646`, `IncidenciasSection:186/199/209` | `onClick` síncrono sin estado de ejecución | Doble pulsación = doble borrado / doble escritura | `idle → ejecutando → resultado` con `useOperacionEnCurso` + botón deshabilitado y diálogo en estado «Eliminando…» | Bajo: sólo deshabilita mientras dura la operación |
| **F5** | `window.alert` (3) y `window.prompt` (1) nativos | `InmueblesSection:2`, `DetalleExpedienteModal:1`, `PropietariosSection`, `SuministrosSection` (`prompt` de motivo de rechazo) | Diálogo nativo del navegador | Mismo problema que F1 y además corta el flujo | Sustituir los `alert` por error de campo/aviso; el `prompt` por la confirmación con entrada de texto obligatoria | Bajo |
| **F6** | Handlers del host sin confirmación de resultado | `App.tsx`: alta/edición/borrado de inmueble, alta de candidato, invitaciones, importación | Los `void persistir…` se resolvieron en UX-2 sólo para **avisar del fallo**; no hay aviso de éxito | El usuario no sabe si su acción prosperó | Feedback de éxito/error con el resultado real (B5: `Promise<boolean>`) | Bajo: aditivo sobre contratos ya existentes |
| **F7** | Sin infraestructura de avisos reutilizable | — | No existe | — | `src/feedback/` (canal observable, sin dependencias, mismo patrón que el canal de UX-2) | Bajo |

## 2. UX-4 — FORMULARIOS Y VALIDACIÓN

| # | Hallazgo | Archivo | Causa | Efecto UX | Solución propuesta | Riesgo de regresión |
|---|---|---|---|---|---|---|
| **V1** | Envío silencioso cuando faltan datos | `InmueblesSection:504` (alta) y `:781` (edición) | `if (!newDireccion \|\| !newCiudad \|\| !onAddInmueble) return;` | El usuario pulsa Guardar y **no ocurre nada**: no sabe qué falta | Validación explícita por campo + mensaje junto al campo + resumen | Bajo |
| **V2** | Validación sólo del navegador | `InmueblesSection` (`required` nativo en Dirección, Ciudad y Precio; `PropietariosSection`) | Se delega en `required` del HTML, sin mensaje propio ni resumen | Mensaje nativo del navegador (idioma del navegador, sin contexto); no hay estado de error por campo | Validación propia con mensajes «La dirección es obligatoria.» junto al campo | Bajo |
| **V3** | Valores con espacios pasan la validación | `InmueblesSection:504` con `\|\|` sobre `string` | No se aplica `trim()` antes de validar | Se pueden crear inmuebles con dirección «   » | Regla `obligatorio` con `trim` | Bajo |
| **V4** | Mensaje genérico lejos del campo | `GastoModal:124-131` (`errorMsg` único al principio del formulario) | Un solo estado de error para todo el formulario | El usuario no ve a qué campo se refiere, sobre todo en móvil | Errores por campo + `aria-invalid` + resumen; el error de persistencia se mantiene diferenciado | Bajo |
| **V5** | Errores de servidor mezclados con errores de formulario | `GastoModal` (mismo `errorMsg`), `DocumentosPatrimonialesPanel`, `MorosidadDetalleModal`, `FacturacionSection`, `KitPublicacionModal`, `PricingModal` | Un único estado para todo | El usuario no distingue «te falta un dato» de «no se ha podido guardar» | Separar `erroresCampo` de `errorPersistencia`; el segundo va al canal de feedback | Bajo |
| **V6** | Mensajes técnicos mostrados al usuario | **29 puntos** con `setError(e instanceof Error ? e.message : …)` (p. ej. `DocumentosPatrimonialesPanel` ×4, `FacturacionSection` ×3, `PortalSuministros` ×2, `MorosidadDetalleModal` ×2, `RegistroInquilinoView`, `InvitacionCarteraView`, `AdminControlCenter`, `OnboardingCarterasAdmin`, `KitPublicacionModal`, `PricingModal`, `PortalIncidencias`, `PortalMensajes`, `DryRunFichasPublicasPanel`) | Se muestra el `message` crudo de la excepción | Puede aparecer `FirebaseError: permission-denied`, `Cannot read properties of undefined`, etc. | Traductor `mensajeDeErrorUsuario(error, contexto)`: filtra patrones técnicos, deja el detalle en consola y devuelve un mensaje claro | Bajo: los mensajes de negocio (motores) se conservan tal cual |
| **V7** | Retornos silenciosos en formularios secundarios | `CandidateModal:172` (nota), `CrearSolicitudDocModal:109`, `PropietariosSection:286` (cuenta rápida), `DetalleSolicitudDocModal:235/274` | `if (!valor.trim()) return;` | Igual que V1 en formularios pequeños: Guardar no responde | Mensaje de campo obligatorio junto al campo | Bajo |
| **V8** | Formularios sin indicación de obligatoriedad coherente | `InmueblesSection` (usa `*` en la etiqueta), formularios del ERP (mezcla `*`, `(Opcional)`, ninguna) | No hay convención | El usuario no sabe qué es obligatorio antes de enviar | Marcar obligatorio en la etiqueta + `aria-required` en los campos que se validan | Bajo |
| **V9** | Datos preservados al fallar la validación (verificado) | Formularios con `useState` por campo | El estado local no se limpia al fallar la validación ni la persistencia | **No hay regresión**: el usuario conserva lo introducido | Se mantiene; se evita cualquier limpieza de estado en las ramas de error | Ninguno |
| **V10** | Persistencia optimista: el modal se cierra antes de confirmar | `InmueblesSection` (alta/edición), `PropietariosSection`, `GastoModal` | Patrón B5 (la UI se actualiza antes de la confirmación) | Si la persistencia falla, el modal ya está cerrado (los datos sí están en la lista y en el canal) | **No se cambia** (arquitectura B5). El fallo se ve por aviso. Reversión: fuera de UX-3 (documentado) | Ninguno si no se toca |

## 3. LÍMITES DECLARADOS DE UX-3 + UX-4

1. **No se toca el patrón optimista de B5** ni la estrategia de persistencia.
2. **No se cambian contratos de datos ni firmas de la capa de datos**: el resultado real se
   obtiene por (a) `await` de las operaciones que ya devuelven promesa y (b) los fallos de
   escritura registrados en el canal durante la operación.
3. **No se instrumentan los `catch` de mejor esfuerzo** (`console.warn`: fallbacks de Storage,
   fichas públicas, espejos): siguen siendo degradaciones declaradas, no fallos.
4. **No se reescriben formularios completos**: se añade validación con mensajes por campo en los
   formularios de uso intensivo (inmueble alta/edición, propietario, gasto) y se traduce el
   lenguaje de error en el resto.
5. Los avisos locales que ya existían en componentes no tocados por esta orden se conservan.
6. `window.confirm`/`alert`/`prompt` se sustituyen en los 29 puntos localizados; no queda ninguno
   en rutas de usuario (sólo la degradación documentada dentro del módulo de confirmación, usada
   cuando el host no está montado — por ejemplo, en tests de componente aislados).

---

## 4. SOLUCIÓN TÉCNICA (resumen)

- `src/feedback/canalFeedback.ts` — avisos de operación (éxito/error/info) observables.
- `src/feedback/confirmacion.ts` — `confirmar()` / `confirmarYEjecutar()` con estado de ejecución.
- `src/feedback/operaciones.ts` — `ejecutarOperacion()`: `idle → ejecutando → resultado`, sin éxito
  si la acción lanza o si la persistencia registró un fallo, y `useOperacionEnCurso()` para el
  bloqueo de doble envío.
- `src/feedback/mensajes.ts` — `mensajeDeErrorUsuario()` (sin detalles técnicos).
- `src/components/feedback/*` — hosts visuales (avisos + diálogo de confirmación).
- `src/formularios/validacion.ts` — reglas (`obligatorio`, `importe`, `iban`, `email`, …) y
  agregador de errores por campo; `CampoFormulario`/`ErrorCampo` para mostrarlos junto al campo.

---

## 7. Estado final de la ejecución (UX-3 + UX-4)

### 7.1 Sistema de feedback (UX-3)

- **Un único canal de avisos** (`src/feedback/canalFeedback.ts`) + host visual montado siempre
  (`src/main.tsx`, también en vistas públicas y anónimas): éxito (se autocierra a los 6 s),
  error (permanece hasta descartarlo) e informativo. Máximo 4 avisos y deduplicación por
  tipo+mensaje para que un reintento no llene la pantalla.
- **Ningún mensaje técnico en la interfaz**: `mensajeDeErrorUsuario(error, contexto)` sustituye
  los `err.message` que llegaban a pantalla (FirebaseError, `permission-denied`, `[object Object]`,
  stack…) por el texto de la operación; el detalle se conserva en consola.

### 7.2 Confirmaciones de acciones destructivas

Convertidos **todos** los diálogos nativos del navegador:

| Origen | Antes | Ahora |
| --- | --- | --- |
| `window.confirm` | 25 llamadas en 17 ficheros | 0 |
| `confirm(...)` sin prefijo | 13 llamadas en 9 ficheros | 0 |
| `window.alert` / `alert(...)` | 3 + 41 llamadas en 13 ficheros | 0 |
| `window.prompt` | 4 llamadas | 0 (campo de texto del diálogo) |

Nota de honestidad sobre el recuento: la inspección inicial (§F1/F5) contó sólo la forma explícita
`window.confirm`/`window.alert` (25 + 3). La auditoría exhaustiva durante la conversión encontró
además 13 `confirm(...)` y 39 `alert(...)` sin prefijo, todas sustituidas por el sistema de la
aplicación. Los textos genéricos tipo «Error versionando» se reescribieron en lenguaje de usuario.

La confirmación de la aplicación (`src/feedback/confirmacion.ts` + `DialogoConfirmacion`):
dice **qué va a ocurrir**, distingue cancelar/confirmar, pasa a estado «ejecutando» (bloqueada,
sin doble ejecución), ejecuta **exactamente la operación que ya existía** tras confirmar y, si
falla, permanece abierta con el motivo. Degradación documentada: sin host montado usa
`window.confirm`/`window.prompt` **y ejecuta la misma operación** (equivalente al comportamiento previo).

### 7.3 Resultado real de las operaciones

`src/feedback/operaciones.ts` es el único camino por el que una acción anuncia su resultado:

1. la acción lanza → fallo;
2. la acción devuelve `false` (contrato booleano **B5**) → fallo (se registra la incidencia);
3. la persistencia registra un fallo de guardado durante la operación (canal UX-2) → fallo;
4. en cualquier otro caso → éxito.

`useOperacionEnCurso()` da el estado `idle → ejecutando → resultado` local a cada pantalla y
descarta la segunda pulsación mientras la operación corre (probado). El patrón optimista de B5 se
respeta: **no se cambió ninguna estrategia de persistencia**; el fallo detectado se muestra en vez
de revertirse a ciegas.

### 7.4 Formularios (UX-4)

- `src/formularios/validacion.ts`: reglas reales del ERP (obligatorio, importe>0, entero, IBAN
  ISO 13616, email, NIF/NIE/CIF, fecha con existencia real, longitudes y reglas propias del
  formulario). No se inventan reglas de negocio.
- Piezas de campo (`ErrorCampo`, `ResumenErrores`, `EtiquetaCampo`, `claseEntrada`): el error
  aparece **junto al campo** (`role="alert"`, `aria-invalid`), con resumen opcional en formularios largos.
- Formularios intervenidos en esta entrega: alta y edición de inmueble (`InmueblesSection`,
  incluidos los avisos de coherencia de titularidad que eran `alert`), propietarios
  (`PropietariosSection`: alta y cuenta bancaria rápida) y gasto (`GastoModal`).
- Se eliminaron los envíos silenciosos (`if (!x) return;` sin respuesta) de los formularios
  intervenidos y se explica por qué un control está deshabilitado (p. ej. «Tomar decisión de
  estrategia» en `DetalleExpedienteModal`).
- **Error de formulario ≠ error de persistencia**: el primero va al campo; el segundo al canal de
  avisos (y al bloque de error del modal cuando existe), nunca mezclados. Al fallar no se borra
  nada de lo introducido ni se cierra el formulario.

### 7.5 Pruebas nuevas (comportamiento, no texto)

7 ficheros, **51 pruebas** (verificadas en la suite global):

| Fichero | Qué prueba |
| --- | --- |
| `src/feedback/canalFeedback.test.tsx` | 7 · éxito visible, error persistente, descarte, no apilar repetidos, sin detalles técnicos |
| `src/feedback/confirmacion.test.tsx` | 8 · qué va a ocurrir, cancelar, confirmar, doble clic, fallo con diálogo abierto, `false` B5, motivo obligatorio, degradación |
| `src/feedback/operaciones.test.tsx` | 8 · éxito, excepción, `false` B5, incidencia de guardado nueva vs previa, silencio de éxito, doble envío y recuperación del control |
| `src/feedback/mensajes.test.ts` | 5 · detección de mensajes técnicos y traducción sin perder el detalle en consola |
| `src/feedback/accionDestructivaUI.test.tsx` | 4 · acción destructiva real (`ConfiguracionAseguradorasModal`): confirmar/cancelar/ejecutar una vez/fallo visible |
| `src/formularios/validacion.test.ts` | 13 · obligatorio, formato, valor no permitido, formulario válido, resumen y ausencia de textos técnicos |
| `src/components/modals/GastoModal.test.tsx` | 6 · formulario real: válido, importe inválido, obligatorio, datos preservados, error de persistencia diferenciado, doble clic |

Ajuste documentado en pruebas existentes (invariante conservado, sin relajarlo):
`RegistrarActuacionModal.test.tsx` (B5) y `estadoDatos/integracionHost.test.ts` (UX-2 §6). En el
primero el fallo de persistencia sigue llegando al modal y sigue sin haber cierre/éxito, pero la
aserción ya no exige ver el texto técnico en pantalla (se comprueba, además, que **no** se muestra
y que el detalle queda en consola). En el segundo se cuentan los dos mecanismos que consumen el
resultado de la persistencia (`reportarResultadoGuardado` + `ejecutarOperacion`), porque UX-3
delegó parte de esa responsabilidad sin perder el invariante.
