# BLOQUE 1 — SEGURIDAD Y PERMISOS · FASE 1: DIAGNÓSTICO Y VERIFICACIÓN DEL RIESGO

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel`
**SHA de auditoría:** `2563831df9b026dec8276c45db40977f72883f9d` (merge de PR #61, «P5.5»)
**Rama de trabajo:** `arena/99f27608-gestor-de-inmuebles-vercel` (HEAD al iniciar la fase: `58e7216`, que solo añade 6 documentos de auditoría)
**Fecha:** 2026-10-21
**Carácter:** diagnóstico de solo lectura. **No se ha corregido nada.** No hay merge, despliegue, publicación de reglas, cambio de credenciales, variables, permisos ni datos.

> **Continuación:** `docs/BLOQUE-1-FASE-1B-VERIFICACIONES-2026-10-21.md` (fase 1B) resuelve las tres verificaciones pendientes que se dejaron abiertas aquí y corrige **una afirmación de este documento**: la cuenta PROFESIONAL activa con ficha **no** es «el estado normal del portal profesional»; ninguna pantalla actual escribe `profesionalId` y el auto-registro de profesional lo rechazan las reglas (véase 1B §3.1). Añade además los hallazgos A-26, A-27 y A-28.

---

## 0. Congelación del alcance

### 0.1 Estado verificado al inicio

| Comprobación | Resultado |
|---|---|
| `git rev-parse HEAD` | `58e7216dca482cce453c8554823ae954fa02dc5a` (docs de la auditoría integral) |
| Base de código frente a `2563831` | `git diff 2563831 HEAD -- . ':!docs'` → **vacío** (0 ficheros, 0 líneas) |
| Ficheros sin seguimiento | ninguno |
| `firestore.rules` | 4.069 líneas, 84 bloques `match` (77 de primer nivel + subcolecciones) |
| `storage.rules` | 66 líneas, 2 bloques |
| Proyecto / base de datos | `gestor-inmuebles-produccion` / base **con nombre** `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` (`firebase.json`, `.firebaserc`) |
| `node_modules` | presente (`npm ci` de la fase anterior) |
| Java / `firebase-tools` | **ausentes** → emulador oficial no ejecutable en este entorno |

### 0.2 Qué se ha hecho y qué no

**Permitido y ejecutado:** lectura de `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc`, `server.ts`, `server/**`, `src/**`; ejecución de las suites de seguridad existentes; escritura de **tres ficheros de prueba temporales** que se han **eliminado** al terminar (`git status` limpio); ejecución del harness de reglas del repositorio y del servicio de portales públicos con puerto falso en memoria.

**No ejecutado:** ninguna escritura en Firestore/Storage real o emulado, ningún despliegue, ninguna llamada a Firebase/Vercel/GCP (sin credenciales y sin acceso de red a esos hosts), ningún envío de correo, ninguna generación de enlaces reales, ninguna prueba destructiva, ningún acceso a datos personales reales.

### 0.3 Vocabulario de evidencia

- **E1** — inspección de código/configuración.
- **E2** — prueba automatizada local (harness de reglas o unitaria; **no** es el motor de Google).
- **E3** — emulador/integración oficial (aquí solo por CI del mismo árbol, run `39500652329`).
- **E4** — aceptación funcional real. **No existe ninguna en esta fase.**

Clasificación de conclusiones exigida por la orden: **CONFIRMADA EN CÓDIGO** (E1) · **REPRODUCIDA EN PRUEBAS** (E2) · **CONFIRMADA EN ENTORNO DESPLEGADO** (requiere acceso; **ninguna**) · **PENDIENTE DE VERIFICACIÓN** (PV).

---

## 1. Resumen ejecutivo

1. **A-20 se confirma y se amplía.** `isStaff()` (`firestore.rules:546-553`) trata como «personal interno» a **cualquier PROFESIONAL con una ficha existente en `profesionales/{id}`**. Reproducido con el harness del propio repositorio: un profesional con ficha obtiene **lectura, listado, creación, modificación y borrado** sobre `candidatos`, `solicitudes`, `invitaciones`, `slots_visita` y `solicitudes_documentacion` de **otra cartera**, `list` sobre toda la bandeja `notificaciones`, lectura global del catálogo `profesionales` con **escritura sobre fichas ajenas**, y escritura/borrado en `especialidades`. **Estado: REPRODUCIDA EN PRUEBAS.**
2. **El impacto en la interfaz es mayor de lo estimado:** `App.tsx:1318/1340` suscribe `candidatos` y `solicitudes` **sin ámbito** para todos los perfiles autenticados; al ser «staff», el profesional recibe **la colección completa en el navegador** y además se copia a `localStorage` (`App.tsx:1319-1322`). No hace falta usar el SDK a mano.
3. **La exposición real depende de un dato que no se puede verificar aquí:** que exista al menos una cuenta PROFESIONAL **ACTIVA** con espejo veraz y ficha. El portal profesional está preparado para ese perfil (`App.tsx:4604-4607`), pero **ninguna pantalla actual escribe `profesionalId` y el auto-registro de profesional lo rechazan las reglas**: la vía realista es el master o datos heredados (análisis completo y corrección de esta afirmación en 1B §3.1). **Estado: PENDIENTE DE VERIFICACIÓN.**
4. **No hay autoelevación a PROFESIONAL:** `usuarios_auth` exige `indexIsTruthful()` (`:402-421`) y `usuarios` no permite cambiar `tipoPerfil`/`profesionalId`/`estado` (`:2300-2385`). El registro autónomo de profesional con `estado: 'ACTIVO'` (`src/lib/authService.ts:1119-1133`) **es rechazado por las reglas** (exige `PENDIENTE` + invitación nominal, `:2248-2262`). La activación es administrativa. Esto **acota** el riesgo, no lo elimina.
5. **A-04 se confirma y empeora en dos puntos concretos:** los tokens de `/visita`, `/cuestionario` y `/documentacion` **no caducan, no se revocan y no miran el estado del documento** (`server/portalPublico/servicioPortalPublico.ts`). Reproducido (8/8): una invitación **CANCELADA** acepta reserva; un candidato **descartado** puede reenviar el cuestionario y el servicio **reescribe su estado a `analizado` y su solvencia declarada**; una solicitud de documentación **ARCHIVADA** sigue sirviendo datos y admitiendo aportaciones. **Estado: REPRODUCIDA EN PRUEBAS.**
6. **Lo que está bien y conviene preservar:** aislamiento de inquilinos (contratos, mensajes, suministros) y aislamiento entre carteras en 60+ colecciones; `Storage` cerrado por completo salvo la foto pública de catálogo; alta anónima directa sin posibilidad de fijar `propietarioId`. **487 pruebas de seguridad existentes en verde** (25 ficheros) — y aun así **ninguna cubre A-20 ni A-04**, lo que explica que pasaran desapercibidos.

**Conclusión de fase:** hay que corregir, y se sabe exactamente dónde y cómo comprobarlo (§8–§9). **No se corrige nada en esta fase.**

---

## 2. Matriz de permisos por colección y operación

### 2.1 Colecciones afectadas por `isStaff()` (11 bloques)

Evaluación con el harness sobre el texto real de `firestore.rules`. Escenario: documento de la cartera **A** (`prop_A`, inmueble `inm_A`); el profesional `uid_prof_ficha` tiene espejo veraz `PROFESIONAL` **y** ficha `profesionales/prof_p1`; el control `uid_prof_sin` tiene perfil PROFESIONAL **sin** ficha.

| Colección | PROFESIONAL **con** ficha | PROFESIONAL **sin** ficha | Regla |
|---|---|---|---|
| `candidatos` | get **SÍ** · list **SÍ** · create **SÍ** · update **SÍ** · delete **SÍ** | todo no | `:2052,2054,2058,2068,2073` |
| `solicitudes` | get **SÍ** · list **SÍ** · update **SÍ** · delete **SÍ** (create público) | todo no | `:2084,2085,2090,2091` |
| `invitaciones` | get **SÍ** · list **SÍ** · update **SÍ** · delete **SÍ** | todo no | `:2105,2107,2109,2111,2114` |
| `slots_visita` | get **SÍ** · list **SÍ** · update **SÍ** · delete **SÍ** | todo no | `:2126,2128,2130,2132,2135` |
| `solicitudes_documentacion` | get **SÍ** · list **SÍ** · update **SÍ** · delete **SÍ** | todo no | `:2162,2166,2168,2172,2177` |
| `notificaciones` | get no · **list SÍ** · update no · delete no | todo no | `:2619` |
| `profesionales` | get **SÍ** · list **SÍ** · update **SÍ** (ficha ajena) · delete no | todo no | `:2401,2403,2417,2418` |
| `especialidades` | create **SÍ** · update **SÍ** · delete **SÍ** | no (solo lectura pública) | `:2585,2586,2588` |
| `configuracion_aseguradoras` | get/list **SÍ** (catálogo, sin PII) | no | `:2188` |
| `enlaces_registro` | get **SÍ** · list **SÍ** · update no · create no concluyente | get SÍ (rama `isSignedIn`), list no | `:2529,2532,2565` |
| `system` (`modulos_config`) | get **SÍ** | get SÍ (rama `docId`) | `:2223` |

Notas de método:
- El harness evalúa **un documento** por petición; una regla `list` se evalúa como «consulta demostrable sobre `resource.data`». Es fiel al texto, pero **no sustituye al emulador**.
- El caso `enlaces_registro.create` no es concluyente: con carga sintética y auditoría vinculada devolvió denegado **también para ADMINISTRADOR**, señal de que la carga no satisface `auditoriaVinculada()` (`:41-50`). **No se afirma nada** sobre esa operación (PV).
- `profesionales.delete` es `isMasterAdmin()`: un profesional **no** puede borrar fichas.

### 2.2 Matriz del funnel para el resto de perfiles (cartera A, documento de A)

| Colección | PROPIETARIO A | GESTOR con cartera E de A | INQUILINO | Anónimo |
|---|---|---|---|---|
| `candidatos` | get/list/update/delete **SÍ** | get/list/update/delete **SÍ** | no | no |
| `solicitudes` | get SÍ · update SÍ · delete SÍ · **list no** | get SÍ · update SÍ · delete SÍ · **list no** | no | no |
| `invitaciones` | get/list/update/delete **SÍ** | get/list/update/delete **SÍ** | no | no |
| `slots_visita` | get/list/update/delete **SÍ** | get/list/update/delete **SÍ** | no | no |
| `solicitudes_documentacion` | get/list/update/delete **SÍ** | get/list/update/delete **SÍ** | no | no |
| `notificaciones` | get/list/update SÍ · delete no | **todo no** | no | no |

Dos observaciones funcionales (no de seguridad) que salen de esta matriz y ya estaban en la auditoría integral: `solicitudes.list` **no tiene rama de titular ni de cartera** (A-08: el módulo queda vacío para propietario/gestor) y el gestor de cartera **no ve** las notificaciones del titular porque `notificaciones` se resuelve por `usuarios/{uid}.propietarioId`/`inmuebleIds`, no por cartera.

### 2.3 Controles de aislamiento que **se mantienen** (verificados)

| Comprobación | Resultado |
|---|---|
| Titular B sobre candidato/solicitud de A | denegado (get/list/delete) |
| Inquilino 2 sobre contrato de inquilino 1 | denegado |
| Inquilino 2 sobre `mensajes_portal` de otro contrato | denegado |
| Inquilino 2 sobre `suministros` de otro inmueble | denegado |
| Inquilino: `list` de contratos | denegado |
| Inquilino 1 sobre su contrato y su mensaje | permitido |
| Anónimo sobre el funnel completo | denegado (get/list/update/delete) |
| Anónimo fijando `propietarioId` al crear candidato | denegado |

---

## 3. A-20 — Autorización de profesionales

### 3.1 Definición exacta

```
:536-545  // PERSONAL INTERNO ... PROFESIONAL solo cuenta como personal con ficha EXISTENTE
:546-550  function personalDesdeEspejo(m) {
            return m.tipoPerfil == 'ADMINISTRADOR'
              || (m.tipoPerfil == 'PROFESIONAL' && 'profesionalId' in m && isValidId(m.profesionalId)
                  && exists(/databases/$(database)/documents/profesionales/$(m.profesionalId)));
          }
:551-553  function isStaff() { return isMasterAdmin() || (perfilActualVeraz() && personalDesdeEspejo(me())); }
```

`profesionales` **no es una colección interna**: contiene contratistas creados por los propietarios (`esPrivado`, `creadoPorPropietarioId`; `CrearProfesionalModal.tsx:147-148`) y también el catálogo público. El predicado no distingue «interno» de «contratista» ni comprueba cartera, inmueble, contrato ni relación alguna.

**Origen:** según el comentario `:492`, antes `isStaff()` era «cualquier usuario autenticado que no sea INQUILINO». El «cierre de seguridad IA» **estrechó** la función (quitó PROPIETARIO, exigió espejo veraz) pero **dejó dentro a PROFESIONAL** sin aplicar el patrón D3 (`ambitoPorInmueble*`) que sí se aplicó a `suministros`, `lecturas_suministro`, `mensajes_portal` o `solicitudes_seguro_impago`. Es un **residual**, no una decisión documentada.

### 3.2 Qué datos quedan expuestos

| Dato | Dónde | Sensibilidad |
|---|---|---|
| Nombre, email, teléfono, nº de personas, situación laboral, antigüedad, ingresos netos, otros ingresos, avalista, observaciones, cotitular | `candidatos` (`Candidato`, `src/types.ts:375-408`) | datos personales + solvencia |
| Notas privadas del propietario, documentos analizados, informes | `candidatos.notasPrivadas`, `documentos`, `ultimoInforme` | interna |
| Agenda de visitas: fecha, hora, `reserva.direccionCompleta` | `slots_visita`, `invitaciones.reserva` | dirección de inmuebles |
| Solicitudes de documentación y su estado | `solicitudes_documentacion` | personal |
| Bandeja de avisos con destinatarios y cuerpo | `notificaciones` (`list`) | propietarios e inquilinos |
| Catálogo completo de profesionales (contacto, CIF, zonas, valoraciones) | `profesionales` | datos de terceros |

El borrado (`candidatos.delete`, `solicitudes.delete`, `invitaciones.delete`, `slots_visita.delete`, `solicitudes_documentacion.delete`) permite **destruir el histórico comercial de otra cartera** sin auditoría: esas colecciones no generan `audit_logs` desde el cliente.

### 3.3 Camino de exposición real (por qué la UI basta)

1. Se crea la ficha del profesional (privada del propietario o por administración).
2. La cuenta PROFESIONAL se activa (única vía: administración — §1.4).
3. Al iniciar sesión, `syncAuthIndex` (`src/lib/authService.ts:88-119`) escribe el espejo con `profesionalId`; la regla exige que coincida con `usuarios/{id}` (`indexIsTruthful`), así que el espejo es **veraz** y `isStaff()` pasa a `true`.
4. `App.tsx:1318` y `:1340` abren `onSnapshot` **sin filtro** sobre `candidatos` y `solicitudes` (`src/lib/firebase.ts:1017-1045` y `1049+`). Con `isStaff()`, la consulta se autoriza y el navegador del contratista recibe **toda la colección**.
5. `App.tsx:1319-1322` guarda el resultado en `localStorage.rentselect_candidatos`, donde **persiste** tras cerrar sesión.

No hace falta un atacante: la propia aplicación descarga los datos en el equipo del contratista.

### 3.4 Qué falta para afirmar exposición en producción (PV)

| # | Cuestión | Cómo se verifica (solo lectura) |
|---|---|---|
| V1 | Reglas **publicadas** = `firestore.rules` de este SHA | Consola Firebase → Firestore → Rules (historial) o `gcloud firestore operations list` + `rulesets` con rol de lectura. **No ejecutado.** |
| V2 | ¿Existen cuentas PROFESIONAL `ACTIVO` con espejo y `profesionalId` válido? | Consulta de solo lectura sobre `usuarios_auth` (o export anonimizado) contando por `tipoPerfil`. **No ejecutado.** |
| V3 | ¿Hay `profesionales/*` creados por propietarios en producción? | Recuento por `creadoPorPropietarioId != null`. **No ejecutado.** |
| V4 | ¿Hay logs de accesos anómalos (lecturas masivas por parte de cuentas PROFESIONAL)? | `audit_logs` no registra lecturas; requeriría Cloud Logging/Firestore audit logs (si están activados). **No ejecutado.** |

### 3.5 Por qué no lo detectaron las pruebas (verificado en el repositorio)

- `tests/seguridad-firestore-d2.test.ts:90` define el espejo del profesional con `profesionalId: 'prof_1'` **pero el fixture no crea `profesionales/prof_1`**, de modo que `personalDesdeEspejo()` es `false` y toda la batería D2 evalúa a un profesional **no staff**. La afirmación «profesional operativo: cero economía» (`:448-463`) se cumple **por la razón equivocada**.
- El bloque D2 cubre `contratos`, `gastos`, `gastos_recurrentes`, `financiaciones`, `incidencias` e inventario; **ninguna** comprobación toca `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `notificaciones`, `especialidades` ni las fichas de `profesionales` con perfil PROFESIONAL.
- La única suite que sí crea profesional **con ficha** es el emulador P3 (`tests/emulador/documentos-p3.emulador.test.ts:216`), y solo comprueba documentación y que no reasigne `creadoPorPropietarioId` (`:378`).
- `tests/carteras-lectura-matriz-reglas.test.ts` prueba carteras L/E, no captación.

---

## 4. A-04 — Enlaces públicos: vigencia, revocación y autorización

### 4.1 Superficies y tokens

| Superficie | Token guardado en | Generación | Servidor que lo valida |
|---|---|---|---|
| `/visita/:token` · `POST /api/visita/:token/reservar` · `POST …/cancelar` | `invitaciones.token` | `generarTokenCapacidad('vst')` (128 bits; `src/lib/tokensPublicos.ts:110-128`) | `server/portalPublico/servicioPortalPublico.ts` |
| `/cuestionario/:token` (GET/POST) | `candidatos.cuestionarioToken` | `generarTokenCapacidad('q')` (`App.tsx:2512`, `EnviarCuestionarioModal.tsx:49,66`) | idem |
| `/documentacion/:token` (GET/POST) | `solicitudes_documentacion.token` | `generarTokenCapacidad('doc')` (`src/utils/documentTemplates.ts:271`) | idem |
| Enlaces de registro (genéricos) | `enlaces_registro.token` | semilla / administración | reglas + cliente |
| Invitaciones nominales | `enlaces_registro.fechaCaducidadMs` | `src/lib/accesoPropietarios.ts:191` | **reglas** (`:779-780`, `:2539`) y cliente |

### 4.2 Hallazgos reproducidos (servicio real + puerto falso en memoria, 8/8)

| # | Esperado | Observado | Resultado | Evidencia |
|---|---|---|---|---|
| A-04-a | Un enlace con fecha de caducidad vencida no debe servir datos | Sirve la visita con normalidad | **FAIL** | `obtenerVisita` no consulta ninguna fecha; `grep fechaCaducidad` en el servicio = **0 coincidencias** |
| A-04-b | Una invitación `CANCELADA`/anulada no debe poder reservar | **Reserva aceptada** | **FAIL** | `servicioPortalPublico.ts:494-513`: solo bloquea `status === 'HORARIO RESERVADO'` |
| A-04-c | Un candidato `descartado` no debe poder reenviar el cuestionario | Aceptado; `estado` pasa a **`analizado`** e `ingresosNetos` se reescribe (99999) | **FAIL** | `guardarCuestionario` `:726-770` escribe sin comprobar estado |
| A-04-d | El token no debe ser reutilizable indefinidamente tras consumirse | El enlace sigue sirviendo datos después de reservar | **FAIL** | no hay consumo ni ventana temporal |
| A-04-e | Una solicitud de documentación `ARCHIVADA` no debe servir ni admitir aportaciones | Sirve | **FAIL** | `obtenerDocumentacion` `:776-823` |
| A-04-f | Sin token emitido, el `id` del documento **no** debe ser capacidad | Sirve (fallback heredado) | **FAIL (legado)** | `localizarPorToken` `:393-419` |
| A-04-g | Con token emitido, el `id` no sirve | No sirve | **PASS** (control positivo del diseño) | idem |
| A-04-h | Reglas: anónimo sin acceso al funnel | Denegado | **PASS** | `firestore.rules:2052-2073`, `:2100-2115`, `:2125-2136`, `:2161-2178` |

### 4.3 Ciclo de vida: qué existe y qué no

- **Caducidad:** existe **solo** para `enlaces_registro` nominales (`fechaCaducidadMs`, `firestore.rules:662-667`, `:779-780`, `:2539`) y se evalúa contra `request.time` en el commit. **No existe** para los tres tokens de captación: ni campo, ni comprobación de servidor, ni de reglas.
- **Revocación:** solo implícita. `deleteInvitacionFirestore` (`src/lib/firebase.ts:1349-1355`, llamado al borrar el candidato, `App.tsx:2018-2020`) elimina el documento y con él la capacidad. El token del cuestionario se puede **rotar** reemitiéndolo (`EnviarCuestionarioModal.tsx:66`): el anterior deja de resolver. **No hay** operación «revocar enlace» para `solicitudes_documentacion`, ni para una invitación sin borrar el registro, ni botón de revocación en la UI.
- **Autorización por operación:** única y correcta en su forma (token → documento), pero **sin comprobar estado** del documento ni relación con el momento del ciclo de vida.
- **Previsibilidad:** los tokens nuevos son de 128 bits (correcto). Los **heredados** se generaron con `Math.random()` y, en el cuestionario, con el propio id (`src/lib/tokensPublicos.ts:99-108` documenta el cambio AG-02 y añade que **los ya emitidos siguen siendo válidos**). El fallback `id`-como-token sigue activo para documentos sin token.
- **Fugas por registro/referrer:** el token viaja en la **ruta** de la URL. No hay `Referrer-Policy` ni cabeceras de seguridad en `vercel.json` (solo `rewrites`) ni `helmet` en `server.ts`. Riesgo bajo pero real si la página pública carga recursos de terceros o si el enlace se pega en un chat; se documenta como A-25.

### 4.4 Documentos privados por enlace directo — **sin hallazgo**

- `storage.rules:46-51` permite **solo** `get` de `inmuebles/{inmuebleId}/{fileName}` (foto de catálogo) y niega `list` y toda escritura.
- `storage.rules:62-64` niega `read, write` para **todo** lo demás, incluidas `documentos_solicitados/`, `cobros_justificantes/`, `profesionales/`, `incidencias_fotos/`, `actas_pdfs/`.
- El navegador **no usa el SDK de Storage** para documentos: sube a una sesión reanudable abierta por el servidor y descarga por URL con token emitida tras autorizar (`server/documentos/*`).
- **Control reproducible:** un titular no puede leer metadatos ni binarios de otra cartera (cubierto por `tests/emulador/documentos-p3.emulador.test.ts:388-390` y `tests/seguridad-storage-documentos.test.ts`, 38 pruebas en verde).

### 4.5 Efecto combinado A-20 + A-04 (importante)

Como un profesional con ficha puede **listar `candidatos` completos**, obtiene también `cuestionarioToken` de cada candidato: puede abrir el enlace público de **cualquier** candidato de la instalación y enviar respuestas en su nombre, incluido reescribir su solvencia y su estado (§4.2-c). Es decir, el token deja de ser una capacidad en manos del candidato y pasa a serlo de cualquiera que pueda leer la colección. Cerrar A-20 reduce este vector; cerrar A-04 lo elimina.

---

## 5. Código frente a configuración desplegada

**No se ha podido verificar** (sin credenciales ni acceso de red a Google). Y hay un **precedente documentado** de divergencia: `tests/reglas-despliegue-produccion.test.ts:1-12` existe porque el repositorio llegó a publicar `firestore.rules` en el proyecto equivocado (`startup-sanctuary-sln7n`) mientras la app usaba `gestor-inmuebles-produccion`. Con ese antecedente **no se puede asumir** que lo publicado sea este fichero.

Además: **no hay ningún workflow que publique reglas** (`.github/workflows/` solo contiene `emulador-reglas.yml`), luego la publicación es manual y no queda constancia en el repositorio.

Procedimiento de verificación **de solo lectura** que hay que autorizar antes de la fase de corrección:

1. Consola Firebase → Firestore Database → **Rules** → pestaña *Historial*: comparar el ruleset activo (y su fecha) con `firestore.rules@2563831`. Alternativa API: `GET https://firebaserules.googleapis.com/v1/projects/gestor-inmuebles-produccion/releases` y `…/rulesets/{name}` con una cuenta de **solo lectura** (`roles/firebaserules.viewer`).
2. Repetir para Storage (`storage.rules`).
3. Consulta de solo lectura de `usuarios_auth` agrupando por `tipoPerfil` + `estado` (V2).
4. Ninguna de las tres escribe nada; las tres necesitan una cuenta con permiso de lectura que hoy no tenemos.

---

## 6. Pruebas ejecutadas

### 6.1 Suites de seguridad existentes (todas en verde)

| Grupo | Ficheros | Pruebas | Resultado |
|---|---|---|---|
| Reglas Firestore/Storage (harness estático) | 25 | **487 pasan**, 2 omitidas, 7 `todo` | **PASS** |
| Detalle de los 10 primeros ficheros | 10 | 161 | PASS |
| Detalle de los 15 restantes | 15 | 326 | PASS |

Ficheros ejecutados: `seguridad-firestore-d2`, `-carteras`, `-d3`, `-deltas-c`, `-inmuebles`, `-patrimonial`, `-polizas`, `-tenant-contrato`, `-valoraciones`, `seguridad-expediente`, `seguridad-storage-d3`, `seguridad-storage-documentos`, `carteras-lectura-matriz-reglas`, `copropiedad-politica-reglas`, `auditoria-reglas-list`, `observabilidad-lectura-inmuebles-reglas`, `justificantes-cobro-reglas`, `reglas-despliegue-produccion`, `acceso-carteras-d2`, `titulares-ambito-reglas`, `sindicacion-reglas-firestore`, `promocion-creacion-inmueble-reglas`, `roadmap01-seguridad`, `ia-fase2-aislamiento-usuarios`, `p3-trazabilidad-documental`.

**Lectura honesta:** 487 pruebas en verde **no** significan que el funnel esté protegido: no existe ninguna prueba de `candidatos`/`solicitudes`/`notificaciones` para el perfil PROFESIONAL *con ficha*, ni ninguna de caducidad/revocación de tokens.

### 6.2 Pruebas temporales de esta fase (no incorporadas)

Se crearon y **se eliminaron** dos ficheros: `tests/__auditoria-bloque1.tmp.test.ts` (12 pruebas) y `server/portalPublico/__auditoria-a04.tmp.test.ts` (8 pruebas). Ambas pasaron; su valor es que **fijan el comportamiento observado**, no que la aplicación esté bien. `git status` queda limpio.

| Prueba | Esperado | Observado | Resultado | Tipo |
|---|---|---|---|---|
| Matriz A-20 (11 colecciones × operaciones × con/sin ficha) | ver §2.1 | ver §2.1 | **FAIL** en captación | E2 (harness sobre reglas reales) |
| Control sin ficha | denegado | denegado | **PASS** | E2 |
| Control titular legítimo | permitido | permitido | **PASS** | E2 |
| Control titular ajeno / anónimo | denegado | denegado | **PASS** | E2 |
| Aislamiento inquilinos (6 comprobaciones) | denegado lo ajeno, permitido lo propio | idéntico | **PASS** | E2 |
| Alta anónima con campos arbitrarios (estado, solvencia, `cuestionarioToken` elegido, `documentos` con URL externa) | debería estar acotada | **permitida** | **FAIL** (A-13) | E2 |
| A-04-a … A-04-f | ver §4.2 | ver §4.2 | **FAIL** | E2 (servicio real, puerto falso) |
| A-04-g (id no sirve si hay token) | denegado | denegado | **PASS** | E2 |

### 6.3 Lo que **no** se ha podido ejecutar

| Prueba | Motivo | Qué haría falta |
|---|---|---|
| `npm run test:emulador:reglas` (motor real de Google) | sin Java ni `firebase-tools`; sin red a Google | máquina autorizada con JDK 17+ y `firebase-tools` |
| Verificación de reglas publicadas | sin credenciales | cuenta con `roles/firebaserules.viewer` (§5) |
| Comprobación con una cuenta PROFESIONAL real | sin entorno de aceptación ni datos reales | entorno de aceptación con datos sintéticos |
| Acceso real a Storage con la cuenta de servicio | sin credenciales | entorno de aceptación |

---

## 7. Riesgos adicionales detectados en el bloque

Además de A-20 y A-04 (ya existentes), se documentan cuatro hallazgos nuevos y se **confirman con evidencia** dos de la auditoría integral.

### A-21 · P1 · Escritura cruzada sobre fichas de profesionales (misma causa que A-20)
`firestore.rules:2417` permite a `isStaff()` actualizar **cualquier** ficha si no cambia `creadoPorPropietarioId`, **sin lista blanca de campos**. Un contratista puede reescribir `email`, `telefono`, `cifNif`, `activo`, `esPrivado`, `valoracionMedia`, `usuarioId`… de otro contratista. Consecuencias: desvío de comunicaciones, baja de un competidor (`activo: false`), publicación de una ficha privada (`esPrivado: false`) y manipulación de valoraciones.
**Estado:** REPRODUCIDA EN PRUEBAS (`update` sobre la ficha privada `prof_p2` de otra cartera = permitido). **No** hay campos bancarios en el modelo `Profesional` (`src/types.ts:2058-2091`), lo que acota el daño económico directo.

### A-22 · P2 · Catálogo de especialidades escribible por cualquier profesional
`firestore.rules:2585-2588`: `create/update/delete` con `isStaff()`. Catálogo **compartido** por toda la instalación; un contratista puede renombrar o borrar especialidades usadas por otros.
**Estado:** REPRODUCIDA EN PRUEBAS (create/update/delete = permitido).

### A-23 · P3 · Configuración de módulos legible por cualquier autenticado
`firestore.rules:2223`: `system/{doc}` legible si `docId == 'modulos_config'` **o** `isStaff()`. No contiene PII; sí revela la configuración funcional.
**Estado:** CONFIRMADA EN CÓDIGO (y reproducida: lectura con y sin ficha).

### A-24 · P2 · Tokens heredados predecibles e `id` como capacidad
Los enlaces emitidos antes de AG-02 se generaron con `Math.random()` (4 caracteres base36) y el cuestionario usaba el id del documento (`src/lib/tokensPublicos.ts:99-108`). Siguen aceptándose, y `localizarPorToken` (`server/portalPublico/servicioPortalPublico.ts:393-419`) mantiene el `id` como token cuando el documento no tiene token emitido.
**Estado:** REPRODUCIDA EN PRUEBAS (fallback del `id` = sirve). La **prevalencia en producción es PV** (requiere contar documentos sin token).

### A-25 · P3 · Tokens de capacidad en la URL sin política de referrer
Tokens en la ruta (`/visita/<token>`), sin `Referrer-Policy` ni cabeceras de seguridad (`vercel.json` solo tiene `rewrites`; no hay `helmet` en `server.ts`).
**Estado:** CONFIRMADA EN CÓDIGO. Impacto condicionado a recursos de terceros en esas páginas.

### Confirmaciones de hallazgos previos
- **A-13 (P2)** — además de lo ya descrito: el alta anónima de `candidatos` acepta **campos arbitrarios** (estado `contratado`, solvencia, `cuestionarioToken` elegido, `documentos[]` con URL externa, `observaciones`). Reproducido. Sin límite de tasa: `crearLimitadorVentana` solo se usa en `/api/asistente/interpretar` (`server.ts:871`) y en la prueba SMTP (`server/notificaciones/rutaPruebaSmtp.ts:261`). App Check no está inicializado (A-18).
- **A-08 (P2)** — confirmado en reglas: `solicitudes.list` no tiene rama para titular ni cartera (`firestore.rules:2085`), por lo que el listado del propietario **no puede autorizarse nunca** aunque filtre.

### Sin hallazgo (verificado y correcto)
Aislamiento de inquilinos (contrato/mensajes/suministros), aislamiento entre titulares en el funnel, `Storage` cerrado salvo foto de catálogo, imposibilidad de autoelevarse a PROFESIONAL o a staff, y denegación por defecto (`match /{document=**}` al final de `firestore.rules:4065`).

---

## 8. Corrección mínima propuesta (no implementada)

Ordenada por causa común. **Ninguna se ha aplicado.**

### C1 · Desacoplar «profesional» de «personal interno» (A-20, A-21, A-22, A-23)

**Fichero:** `firestore.rules` (única corrección de este bloque; no toca datos ni requiere migración).

1. **Retirar la rama PROFESIONAL de `personalDesdeEspejo()`** (`:546-550`) y dejar `isStaff()` = master **o** ADMINISTRADOR verificado (`:551-553`). Efecto inmediato: `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `notificaciones`, `profesionales`, `especialidades` y `enlaces_registro` dejan de ser accesibles a un contratista, sin tocar el acceso de administración.
2. **Añadir en cada bloque del funnel la rama explícita de ámbito que ya usan las colecciones D3**, en lugar del comodín:
   `allow get: if esAdminInmuebles() || ('inmuebleId' in resource.data && ambitoPorInmuebleLectura(resource.data.inmuebleId))`
   y equivalentes para `list` (`inmuebleEnCarteraGestionada` + `where('propietarioId','==',myPropId())`), `create/update/delete` con `ambitoPorInmuebleEscritura` y `propietarioCoherenteConInmueble`.
   Bloques: `:2049-2078` (`candidatos`), `:2081-2092` (`solicitudes`), `:2100-2115` (`invitaciones`), `:2125-2136` (`slots_visita`), `:2161-2178` (`solicitudes_documentacion`).
3. **`notificaciones`** (`:2619`): `list` pasa a `esAdminInmuebles() || (isPropietarioRole() && propietarioId == myPropId())`.
4. **`profesionales`** (`:2401-2418`): lectura y edición `isStaff()` → `esAdminInmuebles()`, conservando las ramas de propietario (`esPrivado == false` / `creadoPorPropietarioId == myPropId()`) y añadiendo una **lista blanca de campos** en `update` (mismo patrón que `documentos_profesionales`).
5. **`especialidades`** (`:2585-2588`): `isStaff()` → `esAdminInmuebles()`.
6. **`system`** (`:2223`): `isStaff()` → `esAdminInmuebles()`.
7. Si el producto quiere un profesional «interno», debe existir un campo explícito en la ficha (p. ej. `ambito: 'INTERNO' | 'CONTRATISTA'`) escrito **solo** por el master, y `isStaff()` leerlo de ahí. Eso es una decisión de producto: **no se propone implementarla en este bloque**.

**Dependencia de cliente (importante):** al cerrar A-20, la suscripción sin filtro de `App.tsx:1318/1340` empezará a ser **denegada** para PROFESIONAL (y seguirá denegada para propietario/gestor, A-08). Hay que **no suscribir** `candidatos`/`solicitudes` cuando el perfil no tiene ámbito comercial (`gestionarSuscripcionesSegunPerfil` o equivalente en `iniciarLecturas`), o el portal profesional mostrará errores de permisos en consola. **Sin este ajuste, la corrección de reglas degrada la UX del portal profesional.**

### C4 · Ciclo de vida de enlaces públicos (A-04, A-24, A-25)

**Fichero:** `server/portalPublico/servicioPortalPublico.ts` (+ un campo nuevo en tres colecciones, escrito por el cliente al emitir el enlace).

1. Añadir `expiraEn` (ISO) a `invitaciones`, `candidatos` (junto a `cuestionarioToken`) y `solicitudes_documentacion`; emitirlo en `CrearAgendaVisitasModal.tsx:353`, `EnviarCuestionarioModal.tsx:49/66`, `PresencialesSection`/`documentTemplates.ts:271`.
2. En `exigirToken`/`localizarPorToken`: rechazar (`ENLACE_NO_VALIDO`, 410) si `expiraEn < ahora`, si `revocadoEn` existe o si el estado del documento es terminal (`invitaciones.status in ['CANCELADA','CANCELADO','ANULADA']`, `candidatos.estado in ['descartado','contratado','rechazado']`, `solicitudes_documentacion.estado in ['ARCHIVADA','CERRADA']`).
3. `guardarCuestionario`: no reescribir `estado` si el candidato está en estado terminal; no permitir cambiar `ingresosNetos` ya validados sin reapertura explícita del propietario.
4. Añadir operación de **revocación** (campo `revocadoEn` + botón en `PreseleccionadosSection`/`CandidatosSection`) sin borrar el registro.
5. Retirar el fallback `id`-como-token cuando el documento tenga token (`:407-418`) y planificar la **reemisión** de los enlaces heredados (script de solo lectura previo para contarlos).
6. Cabecera `Referrer-Policy: no-referrer` en las rutas públicas.

### C8 · Higiene relacionada (A-13, A-18)
Lista blanca de campos en el `create` anónimo de `candidatos`/`solicitudes` (`:2058-2067`, `:2086-2088`), límite de tasa por IP en `/api/visita/*`, `/api/cuestionario/*`, `/api/documentacion/*` (reutilizando `crearLimitadorVentana`) y App Check en el proyecto. Esto **no** forma parte del cierre mínimo de A-20/A-04.

---

## 9. Pruebas de regresión necesarias (para no romper los demás portales)

### 9.1 Para A-20 / A-21 / A-22
1. **Emulador oficial** (`tests/emulador/`), perfil PROFESIONAL **con ficha**: `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `notificaciones`, `especialidades` → `permission-denied` en `get/list/create/update/delete` sobre documentos de otra cartera.
2. **Control positivo**: el mismo profesional sigue leyendo sus `trabajos_profesionales`, `presupuestos_profesionales`, `incidencias` con `profesionalAsignadoId == myProfId()` y sus `documentos_profesionales` (que hoy ya están bien acotados en `:2425-2520`).
3. **Control de administración**: master y ADMINISTRADOR conservan todo en las cinco colecciones (no regresión de la operativa interna).
4. **Control de titular y cartera**: propietario A y gestor L/E de A siguen operando su funnel; B sigue denegado.
5. **Aislamiento de inquilinos**: los 6 controles de §2.3 ampliados a `mensajes_portal` y `suministros` (ya existen y pasan; deben seguir pasando).
6. **Ficha de profesional**: un profesional no puede modificar campos de otra ficha, y solo puede editar la suya si el producto lo permite (hoy no está definido: decisión previa).
7. **Repositorio**: añadir el caso «profesional con ficha» al fixture de `tests/seguridad-firestore-d2.test.ts` (crear `profesionales/prof_1` en la mini-base) — es el cambio de fixture que habría detectado A-20.

### 9.2 Para A-04
1. `expiraEn` vencido → 410 en las tres superficies.
2. Invitación `CANCELADA` → `reservar` 409 y `obtener` 410.
3. Candidato `descartado`/`contratado` → `guardarCuestionario` 409 sin escritura (verificar que el documento **no** cambia).
4. `solicitudes_documentacion` `ARCHIVADA` → 410.
5. Revocación explícita (`revocadoEn`) → 410 inmediato en la siguiente petición.
6. Token inexistente, token ambiguo (2 documentos) y token con formato inválido → 404/409 sin filtrar datos.
7. Fallback `id`-como-token: denegado en cuanto existe token; y **solo** para documentos heredados mientras dure la migración.
8. Regresión de las 8 pruebas actuales de `server/portalPublico/servicioPortalPublico.test.ts` y de `rutasPortalPublico.test.ts` (hoy en verde).

### 9.3 Antes de publicar reglas
Ejecutar `npm run test:emulador:reglas` completo (hay un workflow que ya lo hace en PR: `.github/workflows/emulador-reglas.yml`), más la comparación de reglas publicadas (§5). **No publicar** sin ambos.

---

## 10. Dependencias y riesgos de cada corrección

| Corrección | Depende de | Riesgo de aplicarla | Mitigación |
|---|---|---|---|
| Retirar PROFESIONAL de `isStaff()` | nada (solo reglas) | El portal profesional deja de recibir `candidatos`/`solicitudes`; si el cliente los suscribe igual, **errores de permisos en consola** y posible estado vacío | Ajustar `iniciarLecturas` (`App.tsx:1276-1345`) en el mismo cambio |
| Añadir ramas de ámbito al funnel | idem | `list` del titular exige `where('propietarioId','==',myPropId())`; si el cliente no filtra, se deniega (**A-08** se haría visible) | Incluir A-08 en el mismo cambio o aceptar la regresión conocida y documentarla |
| Lista blanca de campos en `profesionales.update` | saber qué escribe cada pantalla | `saveProfesional` escribe el objeto completo; una lista blanca demasiado estrecha rompe la edición | Cubrir con prueba de los campos reales que envía `handleSaveProfesional` |
| `expiraEn` en tres colecciones | escribir el campo **antes** de exigirlo en servidor | Si se exige antes de emitirlo, todos los enlaces nuevos fallan | Despliegue en dos pasos: (1) emitir, (2) exigir; y periodo de gracia para heredados |
| Retirar fallback `id`-como-token | contar documentos heredados (PV) | Rompe enlaces antiguos ya enviados | Reemisión previa + ventana de gracia |
| Límite de tasa / App Check | configuración del proyecto (no solo código) | Falsos positivos con IP compartida | Umbrales altos y observabilidad primero |
| Publicar reglas | **autorización explícita** y ventana | Un error de sintaxis deja **toda** la aplicación denegada (deny-by-default) | Emulador + revisión del ruleset + plan de reversión con el ruleset anterior identificado |

**Riesgo transversal:** mientras las reglas publicadas no se verifiquen (§5), cualquier afirmación sobre producción es especulativa, y una corrección en el repositorio **no cambia nada en producción** hasta que se publique.

---

## 11. Cuestiones que requieren acceso o autorización adicional

| # | Para poder… | Se necesita | Sin ello |
|---|---|---|---|
| 1 | Confirmar si A-20 está vivo | Comparar reglas publicadas con el repo (`roles/firebaserules.viewer`) | PV |
| 2 | Saber cuántas cuentas están afectadas | Consulta de solo lectura a `usuarios_auth` (recuento por perfil/estado) | PV |
| 3 | Saber cuántos enlaces heredados son predecibles | Recuento de `candidatos` sin `cuestionarioToken`, `invitaciones` antiguas, `solicitudes_documentacion` sin token | PV |
| 4 | Validar en el motor real | Máquina con JDK 17+ y `firebase-tools` (o el workflow de CI) | E3 solo por CI del árbol |
| 5 | Validar el flujo del portal profesional | Entorno de aceptación con una cuenta PROFESIONAL sintética | E4 imposible |
| 6 | Confirmar entrega real de avisos | SMTP/Vercel con autorización | Fuera de este bloque |
| 7 | Autorizar la corrección | Visto bueno expreso del propietario del proyecto | **No se corrige** |

Ninguna de estas acciones se ha ejecutado. Ninguna requiere escribir en producción.

---

## 12. Cierre de la fase

**Qué hay que corregir, dónde y cómo se comprobará**

| Prioridad | Hallazgo | Dónde (una sola pieza) | Cómo se comprobará |
|---|---|---|---|
| **P0** | A-20 — acceso global de un contratista a captación y avisos | `firestore.rules:546-553` + bloques `:2049-2178`, `:2619` | Emulador oficial: profesional con ficha → denegado en las 6 colecciones; administración intacta; titular/cartera intactos (§9.1) |
| **P1** | A-21 — escritura cruzada de fichas de profesionales | `firestore.rules:2401-2418` | Emulador: update ajeno → denegado; edición legítima → permitida |
| **P1** | A-04 — enlaces sin caducidad, sin revocación y sin estado | `server/portalPublico/servicioPortalPublico.ts` + emisión del campo | Las 8 pruebas de §9.2 |
| **P2** | A-22, A-24 | `firestore.rules:2585-2588`; fallback de token | Emulador y pruebas de servicio |
| **P2** | A-13 (confirmado, ya existente) | `firestore.rules:2058-2067`, `:2086-2088` + límite de tasa | Prueba de alta anónima con campos fuera de lista blanca |
| **P3** | A-23, A-25 | `:2223`; cabeceras | Inspección y prueba de cabeceras |

**Estado del bloque:** diagnóstico **completo** para lo que el repositorio permite afirmar; **incompleto** en lo que exige producción. No se declara la aplicación segura: A-20 está **reproducida en pruebas** y su impacto real **pendiente de verificación**; A-04 está **reproducida** y su explotación depende de token filtrado o heredado.

**No se ha corregido, no se ha fusionado y no se ha desplegado nada.** Se espera autorización expresa antes de la fase de corrección.

---

### Anexo — Evidencia por conclusión

| Conclusión | Clasificación | Evidencia |
|---|---|---|
| `isStaff()` incluye a PROFESIONAL con ficha | **REPRODUCIDA EN PRUEBAS** | §2.1; harness sobre `firestore.rules` real; 12/12 pruebas temporales |
| La UI entrega la colección completa de candidatos al profesional | CONFIRMADA EN CÓDIGO | `App.tsx:1318-1322`, `src/lib/firebase.ts:1017-1045` |
| No existe camino de autoelevación a PROFESIONAL | CONFIRMADA EN CÓDIGO | `firestore.rules:402-421`, `:2300-2385`, `:2248-2262`; `authService.ts:1119-1133` |
| Hay cuentas profesional activas en producción | **PENDIENTE DE VERIFICACIÓN** | §3.4 (V1–V4) |
| Reglas publicadas = repositorio | **PENDIENTE DE VERIFICACIÓN** | §5; precedente en `tests/reglas-despliegue-produccion.test.ts:1-12` |
| Tokens de captación sin caducidad/revocación/estado | **REPRODUCIDA EN PRUEBAS** | §4.2 (8/8) |
| Storage no expone documentos privados | CONFIRMADA EN CÓDIGO + E2 | `storage.rules:46-64`; suites de Storage en verde |
| Aislamiento de inquilinos y entre carteras correcto | REPRODUCIDA EN PRUEBAS | 6 controles §2.3 + 487 pruebas existentes |
| Fuga de `err.message` en `/api/notificaciones/enviar` | CONFIRMADA EN CÓDIGO | `server.ts:2827-2830` (A-14) |
