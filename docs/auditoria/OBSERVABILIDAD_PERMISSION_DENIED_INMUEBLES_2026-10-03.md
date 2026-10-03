# OBSERVABILIDAD PERSISTENTE — `permission-denied` de Inmuebles

Orden de observabilidad · 2026-10-03 · rama `arena/01a102b7-gestor-de-inmuebles-vercel`
Entorno: **exclusivamente AI Studio/Arena** (sin Vercel, sin GitHub, sin Firebase Console, sin Cloud Shell,
sin terminal externa, sin DevTools, sin credenciales reales, sin secretos, sin despliegues).

**Alcance:** esta orden **no corrige** el `permission-denied`. Construye lo previo: que la próxima vez que ocurra
en una sesión real **quede identificado qué lectura falló, con qué código y bajo qué contexto**, sin reproducción
manual y sin abrir ningún permiso.

> Clasificación de cada afirmación: **CONFIRMADO POR CÓDIGO** (CC) · **CONFIRMADO POR TEST** (CT) ·
> **NO CONFIRMADO** (NC) · **BLOQUEADO POR ENTORNO** (BE).

---

## 1. PROBLEMA ORIGINAL

`subscribeInmuebles` (`firebase.ts:907`) abre hasta **cinco** lecturas distintas de la colección `inmuebles`
(INM-OWN, INM-COT, INM-GEST, INM-ID, INM-ADMIN) y **las cuatro rutas de error** desembocan en el mismo origen del
canal (`reportarErrorLectura('inmuebles', …)`; CC: `firebase.ts:415/448/490/1005`). El canal guarda **una sola**
incidencia por origen+tipo (`canalIncidencias.ts:322`), así que el usuario ve siempre el mismo texto:

> «No se han podido leer algunos datos — Falló la lectura de: Inmuebles. — Lectura · Inmuebles: No tienes permisos
> para consultar estos datos.» (CC: `AvisoIncidenciasDatos.tsx:66-86,187` + `canalIncidencias.ts:247-251`)

El aviso **no dice cuál de las cinco lecturas falló** y persiste aunque las otras cuatro carguen (CC: `conDatos`
marca LISTO pero no limpia el canal; solo `reintentar()`/descartar lo retiran). Conclusión del diagnóstico
anterior: sin datos de producción, la causa no era determinable desde Arena.

## 2. LIMITACIÓN DE ARENA (lo que esta orden NO intenta)

- **No hay sesión Firebase real** ni cuenta de prueba utilizable en el sandbox (CC: sin variables de Firebase, sin
  `.env` con credenciales, sin sesión de CLI, sin navegador con sesión, sin identidad inyectada por la plataforma).
- **No hay salida de red a Google** desde el sandbox (CC: `identitytoolkit.googleapis.com`, `firestore.googleapis.com`,
  `firebaseapp.com` y `googleapis.com` → HTTP 000 / `curl (35) SSL_ERROR_SYSCALL`, IPv4 e IPv6; `registry.npmjs.org`
  y `github.com` → HTTP 200 como control). Aunque existiera sesión, el SDK no podría alcanzar Firestore desde aquí.
- **No hay emulador** posible (sin `firebase-tools`, sin JRE; `firebase.json` no declara `emulators`).
- **No se pide al usuario** ninguna operación: ni DevTools, ni reproducción manual, ni credenciales, ni copiar logs.

Por eso la estrategia es la contraria: **instrumentar la aplicación para que el dato se capture solo**, en la sesión
real, y quede consultable después.

## 3. ARQUITECTURA ELEGIDA

```
                    (sesión REAL del usuario, en su navegador)
   subscribeInmuebles ──► callback de error de una de las 5 lecturas
        │                          │
        │                          ├─► reportarErrorLectura('inmuebles')   [INTACTO: aviso y UX iguales]
        │                          └─► diagnosticarErrorLecturaInmuebles(…)  [instrumentación previa]
        │                                     ├─► [DIAG-INMUEBLES] en consola + panel de preview
        │                                     └─► registrarIncidenciaLecturaInmuebles(informe)   ◄── NUEVO
        │                                                │
        │                          ┌─────────────────────┴──────────────────────┐
        │                          ▼                                             ▼
        │              búfer LOCAL (localStorage)                    transporte remoto (best-effort)
        │              · 20 últimas, con contador                    · audit_logs (libro EXISTENTE)
        │              · fallback siempre escrito                    · allow create: if isSignedIn()
        │                                                                        │
        ▼                                                                        ▼
   UX normal, sin cambios                            AdminControlCenter → «Registro de Auditoría»
                                                     → panel «Diagnóstico de lecturas de Inmuebles»
```

**Módulos nuevos (CC):**

| Fichero | Papel |
|---|---|
| `src/lib/observabilidadLecturaInmuebles.ts` (600 líneas) | Módulo **puro**: construcción del registro minimizado, deduplicación, búfer local, sobre documental del libro, decodificación de lo leído. **Cero imports de Firebase.** |
| `src/lib/entornoEjecucion.ts` (32 líneas) | `ENTORNO_EJECUCION: 'development' \| 'production'`. Conservador: solo declara `production` si el bundler lo afirma (`PROD`/`MODE==='production'`); en caso de duda, `development`. |
| `src/components/admin/DiagnosticoLecturasInmueblesPanel.tsx` (283 líneas) | Pantalla de administración (FASE 7) con separación de entornos, filtros y detalle. |

**Modificaciones (mínimas y aditivas):**

| Fichero | Cambio |
|---|---|
| `src/lib/firebase.ts` | `+` transporte `enviarIncidenciaLecturaInmueblesAAuditoria(registro)` y **una** llamada `void registrarIncidenciaLecturaInmuebles(informe, { entorno, enviarRemoto })` dentro de `diagnosticarErrorLecturaInmuebles`. **Ninguna consulta, ningún `where`, ningún reporte nuevo.** |
| `src/components/admin/AdminControlCenter.tsx` | `+10` líneas: import y montaje del panel dentro de la sección «Registro de Auditoría». |

> Nota de honestidad (CC): `src/components/sections/AdministracionSection.tsx` es **código muerto** (se importa en
> `App.tsx:295` pero nunca se renderiza). Un primer montaje ahí no aparecía en el bundle de producción; se revirtió
> y el panel se montó en `AdminControlCenter`, que es el área de administración **real** (`App.tsx:4476`). Lo fija
> un test (`el panel está montado en el área de administración REAL`).

`firestore.rules`: **SIN CAMBIOS** (ver §12). Cero colecciones nuevas, cero índices nuevos, cero permisos nuevos.

## 4. DÓNDE SE REGISTRAN LAS INCIDENCIAS

En el **libro de auditoría ya existente** `audit_logs` (CC), cuyas reglas ya estaban escritas y en uso por la
aplicación (`authService.ts:538`, `onboardingCarterasFirebase.ts:62/119/203`, `personasServicioFirebase.ts:29`,
`gestionesCarteraServicioFirebase.ts:233`):

```
match /audit_logs/{auditId} {
  allow read: if isMasterAdmin();     // solo el administrador principal consulta
  allow create: if isSignedIn();      // cualquier sesión registra
  allow update, delete: if false;     // inmutable: la evidencia no se puede alterar
}
```

Motivos (frente a las otras opciones de la FASE 3):

1. **Es el mecanismo que la aplicación ya usa para auditoría técnica** → la orden pide priorizarlo.
2. **No exige ninguna infraestructura ni despliegue nuevos**: es la única opción que no depende de publicar reglas.
3. **El aislamiento ya es el exigido**: registrar sí, consultar solo el master (§7).
4. Las alternativas se descartaron explícitamente: colección nueva (`NC`: exigiría publicar reglas desde fuera de
   Arena y no aporta nada que `audit_logs` no tenga), y solo-local (`NC`: un administrador no podría ver la
   incidencia de la sesión afectada, que es justo el criterio de éxito de la orden).

## 5. DATOS ALMACENADOS (solo lo mínimo)

Registro (`IncidenciaLecturaInmuebles`, CC/CT) — campos obligatorios de la orden marcados con ✔:

| Campo | Contenido |
|---|---|
| ✔ `fechaHora` / `primerFechaHora` | ISO de la última y de la **primera** observación del contexto (la evidencia original nunca se pierde) |
| ✔ `origen` | `INM-OWN` \| `INM-COT` \| `INM-GEST` \| `INM-ID` \| `INM-ADMIN` |
| ✔ `errorCode` | p. ej. `permission-denied` |
| ✔ `errorMessage` | mensaje del SDK **saneado** y recortado a 300 caracteres |
| ✔ `query` | consulta literal que falló (texto de la consulta, sin ids) |
| ✔ `scope` | **tamaños** del ámbito: `inmuebleIds`, `parciales`, `carteras` (+ procedencia del id en INM-ID) |
| ✔ `rol` | `tipoPerfil` del perfil |
| ✔ `propietarioId` (+ `propietarioIdCliente`) | minimizado |
| ✔ `uid` (+ `usuario`) | minimizado |
| ✔ `proyecto` / `baseDeDatos` | `gestor-inmuebles-produccion` / id de la base |
| ✔ `mirrorPropietarioId` / `profilePropietarioId` | minimizados (comparación espejo↔ficha) |
| ✔ `failingTerm` | término de la regla que falla (`ID → observado`), con los ids de la sesión ocultos |
| `causa` | veredicto del diagnóstico (`ESTADO_CUMPLE_LA_REGLA`, `PID_DISTINTO_DEL_ESPEJO`, …) |
| `environment` | `production` \| `development` (ver §8 abajo, FASE 8) |
| `contador` / `clave` | repeticiones agregadas y clave de contexto (deduplicación) |

**Minimización (CC/CT):** cada identificador se guarda como `prefijo (6 caracteres) + huella FNV-1a de 32 bits`.
La huella permite **correlacionar** dos incidencias del mismo usuario/cartera sin poder reconstruir el valor, y los
tests comprueban que el UID, el `usuarioId` y el `propietarioId` completos **no aparecen** en el registro
serializado.

## 6. DATOS EXCLUIDOS (privacidad)

Por diseño, y verificado por test (`camposSensiblesEnIncidencia` → `[]`):

- **correos** — no se guardan en ningún campo; en el libro, `usuarioEmail` va **vacío** a propósito (CC: el sobre
  documental lo fija con `''`). Los correos que aparezcan en un mensaje de error se sustituyen por `[omitido]`.
- **contraseñas, tokens, cookies, credenciales** — nunca se leen ni se escriben; los patrones
  `bearer/basic`, `"password"`, `"apiKey"`, `"refreshToken"`, `"idToken"`, `"accessToken"` y cadenas ≥32 caracteres
  se sanean del texto libre.
- **teléfonos** — patrón de 9+ dígitos saneado.
- **documentos personales, contenido documental, datos fiscales y patrimoniales** — no forman parte del registro:
  solo se copian los campos que las reglas consultan (identidad, ámbito en tamaños, estados) y el texto de la consulta.
- **identificadores completos** — sustituidos por `prefijo + huella` (§5).
- **lista de ids** (`inmuebleIds`, `carterasL/E`, índice de gestiones) — **nunca** se guarda; solo su **número**.

## 7. AISLAMIENTO

| Quién | Registrar | Consultar | Cómo se garantiza |
|---|---|---|---|
| Sistema / cualquier sesión autenticada | **Sí** | **No** | Regla `allow create: if isSignedIn()` (CT: probado para master, administrador no master, propietario, gestor, profesional; y **denegado sin sesión**) |
| Propietario (usuario normal) | Sí | **No** — ni las incidencias de otro **ni las suyas** | `allow read: if isMasterAdmin()` (CT: `get` y `list` denegados) |
| Gestor / profesional | Sí | **No** | ídem (CT) |
| Administrador que no sea el principal | Sí | **No** | ídem (CT) |
| Administrador autorizado (master) | Sí | **Sí** | `isMasterAdmin()` = email del master en la sesión (CT: `get`/`list` permitidos) |
| Nadie | — | — | `allow update, delete: if false` → el libro es **inmutable** (CT) |

El panel añade un espejo de esa condición en el cliente (`puedeConsultarDiagnosticoLecturas`), que **no autoriza
nada**: solo evita mostrar una tabla vacía. Si el cliente se equivocara, las Rules seguirían denegando (CT).

## 8. DEDUPLICACIÓN (control de ruido)

- **Clave de contexto**: `origen | código | causa | consulta | huella(uid) | huella(pid) | huella(inmuebleId)` (CC).
- **La primera incidencia de cada contexto se conserva SIEMPRE** (CC/CT). Nunca se descarta la primera.
- **Repeticiones dentro de una ventana de 5 minutos** (`VENTANA_DEDUPLICACION_MS`): **no** generan registro nuevo;
  incrementan `contador` y actualizan `fechaHora`, conservando `primerFechaHora` (CT: 3 errores seguidos →
  1 escritura remota, 1 entrada local con `contador=3`).
- **Fuera de la ventana** vuelve a registrarse el mismo contexto (CT).
- **Cambio de contexto** (otro origen, otra consulta, otro código, otro usuario) → registro nuevo (CT).
- **Tope por sesión**: 20 escrituras remotas (`MAXIMO_ENVIOS_REMOTOS_POR_SESION`); a partir de ahí solo búfer local
  (CT: 6 contextos distintos con tope 3 → 3 envíos y 6 registros locales). El error diario no puede generar ruido
  ilimitado ni facturación desmedida.

## 9. FALLBACK (y por qué no hay bucle)

- **Búfer local siempre**: cada incidencia se escribe primero en `localStorage`
  (`rentselect_diagnosticos_lectura_inmuebles`, tope 20, más recientes) con upsert por clave. Si el almacenamiento
  falla (cuota, bloqueo) se degrada a memoria del proceso; nunca lanza (CT con un almacén que lanza en `leer`/`escribir`).
- **Si la escritura remota falla** (reglas publicadas distintas, sin red, cuota, offline): se anota
  `motivo: 'envio-fallido'` y **la evidencia queda igualmente en el dispositivo** (CT).
- **Anti-bucle (FASE 5)**: el módulo **no llama al canal de incidencias** — un test lo verifica sobre el código real
  (`no contiene reportarErrorLectura(`, ni ningún import de `firebase`); el transporte **no reporta el error del
  transporte**; la llamada es `void` (no bloquea el callback de error) y hay una guarda de escritura en curso por
  clave (CC/CT). El resultado: fallar al registrar **no** puede producir otro aviso, ni otro banner de Inmuebles,
  ni reintentos infinitos.
- **La UX no cambia**: ninguna línea del canal de incidencias, del aviso, del estado de lecturas ni de la sección
  Inmuebles ha sido modificada (CC: `git diff`).

## 10. PANTALLA DE ADMINISTRACIÓN

**Ubicación**: `AdminControlCenter` → sección **«Registro de Auditoría»** (área de administración real, `App.tsx:4476`).
**Visibilidad**: solo el administrador principal; a cualquier otro perfil se le explica la condición (sin datos).

Qué muestra, sin pantallas intermedias:

- **Filtros**: por **origen** (los cinco) y por **código**; orden por fecha con el **más reciente primero**.
- **Tres bloques separados** (nunca mezclados):
  1. **Errores reales (producción)** — sesiones reales de la app desplegada (`environment: 'production'`).
  2. **Errores de desarrollo (vista previa/Arena)** — `environment: 'development'`; nunca cuentan como incidencia real.
  3. **Pendiente en este dispositivo (sin confirmar)** — lo que solo está en el búfer local, es decir, evidencia
     capturada cuyo envío remoto aún no ha llegado.
- **Una línea por incidencia**: fecha/hora · `INM-XXX` · código · causa · consulta · rol · propietario minimizado · estado
  (`registrado` / `xN` / `local`).
- **Detalle desplegable**: primera vez, repeticiones, uid/usuario/pid cliente↔espejo↔ficha (minimizados), ámbito,
  entorno, proyecto, base, mensaje y término de regla que falla.
- **«Limpiar vista local»**: vacía **solo la copia de este dispositivo** (el libro remoto es inmutable por diseño, CC/CT).

Coste: **cero consultas nuevas**. El panel consume los `auditLogs` que `App` ya suscribe para administración
(`App.tsx:1464`) y filtra por `accion === 'DIAGNOSTICO_LECTURA_INMUEBLES'`; **ningún índice nuevo** (CC).

## 11. PRUEBAS

| Fichero | Casos | Cubre (FASE 10) |
|---|---|---|
| `tests/observabilidad-lectura-inmuebles.test.ts` | **22** | Registro completo con todos los campos mínimos · **los cinco orígenes** etiquetados y enviados · deduplicación (primera conservada, repeticiones agregadas, contexto distinto, ventana) · tope de envíos · **fallo de persistencia** (no lanza, no rompe, guarda local) · búfer acotado y limpiable · **datos sensibles** (sin uid/pid completos, saneo de correo/token, no envío si hay violación) · entorno por defecto `development` · decodificación del libro · cableado real en `firebase.ts` (una sola llamada, sobre único, **4 puntos de reporte intactos**, consultas intactas) |
| `tests/observabilidad-lectura-inmuebles-reglas.test.ts` | **8** | **Aislamiento** sobre el texto real de `firestore.rules`: registrar sí (cualquier sesión) / no (sin sesión) · **leer: propietario, gestor, profesional y administrador no master → NO** · master → sí · **inmutabilidad** (`allow update, delete: if false`) · **ninguna colección nueva** |
| `tests/diagnostico-lecturas-inmuebles-panel.test.tsx` | **11** | Autorización (propietario y admin no master no ven datos; master sí) · lectura inmediata (origen, código, fecha, causa, consulta) · detalle con contexto minimizado · **ningún correo visible** · **producción y desarrollo separados** · filtros por origen y código · copia local y «limpiar» · **escenario de éxito completo** (error → incidencia persistida → el administrador identifica `INM-COT`/`permission-denied`) · **montaje en el área de administración real** |

Total: **41 casos nuevos**, todos en verde.

## 12. RESULTADO DE VALIDACIÓN (FASE 11)

| Comprobación | Resultado |
|---|---|
| `npm run lint` (**typecheck real**: `tsc --noEmit`) | **PASS** (exit 0) |
| Tests nuevos | **41/41 PASS** |
| Suites afectadas (diagnóstico de inmuebles, matriz de orígenes, reglas de inmuebles, login admin, auditoría y su coexistencia, roadmap01 seguridad/auditoría, panel previo) | **PASS** |
| **Suite completa** `npx vitest run` | **189 ficheros · 3 454 pasados · 2 omitidos · 0 fallos** (~3,7 min) |
| `npm run build` | **PASS**; el panel de administración **sí** aparece en el bundle de producción (es una función de producción) y el panel temporal de desarrollo **no** (`DIAGNÓSTICO TEMPORAL` → 0 apariciones); `dist/` eliminado |
| **`firestore.rules`** | **SIN CAMBIOS** — `git status --porcelain firestore.rules` vacío y `git diff --stat` vacío. **Ninguna** modificación de reglas, ni siquiera para que el diagnóstico funcione: la escritura se apoya en el `allow create: if isSignedIn()` que ya existía |
| Consultas de inmuebles (`propietarioId`, `titularesIds`, `array-contains`, `get` por id) | **SIN CAMBIOS** (literales verificados; 4 puntos de reporte intactos) |
| Modelo de datos, permisos, roles, titularidades, índices | **SIN CAMBIOS** (no hay diff en ningún fichero de modelo, permisos o índice; `firestore.indexes.json` sin tocar) |
| Instrumentación previa (módulo, panel dev-only, tests) | **CONSERVADA E INTACTA** (FASE 12 de la orden anterior) |

**Ficheros de esta orden:** nuevos `src/lib/observabilidadLecturaInmuebles.ts`, `src/lib/entornoEjecucion.ts`,
`src/components/admin/DiagnosticoLecturasInmueblesPanel.tsx`, 3 test files y este informe; modificados
`src/lib/firebase.ts` (transporte + 1 llamada) y `src/components/admin/AdminControlCenter.tsx` (+10 líneas de montaje).

## 13. INSTRUCCIONES MÍNIMAS PARA INTERPRETAR EL PRIMER ERROR REAL

1. **Dónde mirar**: aplicación desplegada → **Administración → Registro de Auditoría → «Diagnóstico de lecturas de
   Inmuebles»** (solo el administrador principal).
2. **Qué bloque leer**: **«Errores reales (producción)»**. Si algo aparece en «Errores de desarrollo (vista previa/Arena)»
   o en «Pendiente en este dispositivo», **no** es una incidencia de usuario y no debe interpretarse como tal.
3. **Cómo leer la línea** (el criterio de éxito de la orden, ya satisfecho por test):

   ```
   ERROR · Origen: INM-COT · Código: permission-denied · Fecha: 03/10/2026 20:xx
   Consulta: inmuebles where('titularesIds','array-contains', pid) [cotitularidad]
   Rol: PROPIETARIO · Propietario: prop-1…[0f1e2d3c] · Estado: registrado / xN
   ```

   El campo **`Origen`** es la respuesta a la pregunta que llevamos semanas sin poder contestar; `xN` indica que el
   mismo contexto se repitió N veces (no son N incidencias).
4. **Qué significa cada origen** (matriz ya construida en `docs/auditoria/DIAGNOSTICO_DEFINITIVO_…md` §3):
   `INM-OWN` consulta del propietario principal · `INM-COT` consulta de cotitularidad (`titularesIds`) ·
   `INM-GEST` cartera gestionada · `INM-ID` lectura documental por id (`get`) · `INM-ADMIN` colección completa.
5. **Cómo se decide la corrección** (orden posterior, nunca automática): con `Origen` + `Causa` se aplica la tabla
   del §12 del informe definitivo (p. ej. `INM-COT` + `ESTADO_CUMPLE_LA_REGLA` ⇒ reglas publicadas o planificador;
   `PID_DISTINTO_DEL_ESPEJO` ⇒ identidad/espejo). **Esta orden no toca `INM-COT`, `titularesIds`, `propietarioId`,
   Rules, permisos ni datos.**
6. **Si no aparece nada en producción**: significa que, con las reglas desplegadas actuales, la escritura en
   `audit_logs` no llegó (el libro remoto pudo denegarla o no había sesión al fallar). En ese caso la evidencia está
   en **«Pendiente en este dispositivo»** del navegador donde ocurrió.

---

### Estado final de la orden

- **Implementado y validado** (typecheck, 41 pruebas nuevas, suite completa, build): la próxima vez que cualquier
  cuenta real sufra el `permission-denied` de Inmuebles, **quedará registrado el origen, el código y el contexto**,
  la aplicación seguirá funcionando con su UX normal y el administrador autorizado podrá verlo.
- **No se ha corregido el error** (por diseño de esta orden) y **no se ha abierto ningún permiso**: `firestore.rules`,
  consultas, modelo, permisos, roles, titularidades e índices quedan exactamente como estaban.
- **Cautela honesta (NC)**: si las reglas **desplegadas** no coincidieran con las del repositorio, el `create` en
  `audit_logs` podría denegarse; el diseño lo absorbe sin ruido (búfer local + bloque «pendiente»), y ese escenario
  sería a su vez evidencia útil. Las reglas desplegadas no son verificables desde Arena (**BE**, ya documentado).
