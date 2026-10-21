# AUDITORÍA INTEGRAL DEL ERP — INFORME PRINCIPAL

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel`
**SHA auditado:** `2563831df9b026dec8276c45db40977f72883f9d` (`main` = `origin/main`, merge del PR #61 «P5.4 · Integridad del OCR»)
**Fecha:** 2026-10-21
**Carácter:** auditoría de solo lectura. **No se ha modificado código de aplicación, reglas, configuración ni datos.** No se ha desplegado nada, no se ha ejecutado ninguna operación externa con efectos (correo, IA, Catastro, Storage/Firestore de producción) y no se ha fusionado ningún cambio funcional.

Documentos complementarios de este mismo trabajo:

| Documento | Contenido |
|---|---|
| `docs/AUDITORIA-INTEGRAL-ERP-INVENTARIO.md` | Inventario funcional completo (módulos, rutas, servicios, colecciones, pruebas) |
| `docs/AUDITORIA-INTEGRAL-ERP-MATRIZ-PERMISOS.md` | Matriz efectiva de permisos por perfil (interfaz ↔ reglas ↔ servidor) |
| `docs/AUDITORIA-INTEGRAL-ERP-RECORRIDOS.md` | Recorridos de negocio D1–D12 con nivel de evidencia |
| `docs/AUDITORIA-INTEGRAL-ERP-HALLAZGOS.md` | Ficha completa de cada hallazgo (A-01 … A-19) |
| `docs/AUDITORIA-INTEGRAL-ERP-PLAN-CORRECCIONES.md` | Plan de corrección por dependencias y criterios de cierre |

---

## 1. SHA auditado y estado real del repositorio

| Elemento | Valor verificado | Cómo se verificó |
|---|---|---|
| `HEAD` | `2563831df9b026dec8276c45db40977f72883f9d` | `git rev-parse HEAD` |
| `main` local | `2563831df9b026dec8276c45db40977f72883f9d` | `git rev-parse main` |
| `origin/main` | `2563831df9b026dec8276c45db40977f72883f9d` | `git rev-parse origin/main` |
| Mensaje del commit | `Merge pull request #61 from sarqsan/arena/19f85b0f-gestor-de-inmuebles-vercel` | `git log --oneline -5` |
| Árbol de trabajo | Limpio al iniciar (`git status --short` vacío) | `git status` |
| Checkout | Clon superficial (`git log` muestra un único commit; `2563831~6` no resuelve) | `git diff --stat 2563831~6` → *unknown revision* |
| Conexión GitHub | Autenticada como `sarqsan` (token configurado); `gh pr list` y `gh run list` operativos | `gh auth status` |
| PR abiertos | **1**: #22 `automation/firestore-rules-deploy` (2026-10-02, workflow de despliegue de reglas) | `gh pr list --state open` |
| Últimos PR integrados | #61 P5.4, #60 P5.2+P5.3, #59 AG-01+AG-02, #58 AG-04, #57 AG-03 | `gh pr list --state merged` |
| Ramas remotas | Solo `origin/main` y la rama de la sesión (el resto de ramas ya fusionadas no están en el clon) | `git branch -r` |
| CI del árbol auditado | Run `39500652329` (PR #61): **success** en los dos jobs — «Tipos, suite completa y build» y «Reglas Firestore y Storage (emuladores oficiales)» | `gh run view 39500652329 --json jobs` |
| Despliegue | Vercel: `api/index.ts` exporta la app Express; `vercel.json` reescribe `/api/(.*)`, sirve `dist` y declara cron `/api/cron/avisos` `0 6 * * *`. **Estado del último despliegue: NO verificado** (sin acceso a Vercel) | Lectura de `vercel.json`, `api/index.ts` |
| Proyecto Firebase | `gestor-inmuebles-produccion`; Firestore **con nombre** `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`; bucket `gestor-inmuebles-produccion.firebasestorage.app` | `firebase-applet-config.json`, `firebase.json`, `.firebaserc` |

### 1.1 Contraste con la auditoría previa

Existe `docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md` (SHA `cd58c9e`). **No se ha tomado como estado actual**: cada afirmación relevante se ha vuelto a comprobar en el código de `2563831`. Resultado del contraste (detalle en §9 y en `AUDITORIA-INTEGRAL-ERP-HALLAZGOS.md`):

| Hallazgo previo | Estado en `2563831` | Evidencia de la comprobación |
|---|---|---|
| AG-01 alta pública de solicitud denegada | **CORREGIDO** | `src/lib/solicitudPublica.ts` (`conIdentidadCanonica`, escritura estricta) + `tests/ag01-alta-publica-solicitud.test.ts` |
| AG-02 portales públicos por token inoperativos | **CORREGIDO** | `server/portalPublico/*` y rutas `/api/visita|cuestionario|documentacion/:token` montadas en `server.ts:2767` |
| AG-03 `storage.rules` contra la base `(default)` | **CORREGIDO en código** (autorización documental en servidor; `storage.rules` sin ninguna lectura de Firestore) · producción **sin verificar** | `storage.rules` (66 líneas, 0 referencias a Firestore), `server/documentos/autorizacionDocumental.ts` |
| AG-04 almacén efímero en RAM | **CORREGIDO** (rutas devuelven 410 `ALMACEN_TEMPORAL_RETIRADO`) | `server.ts:170-186` |
| AG-05 facturas manuales invisibles para fiscalidad/P6 | **PERSISTE** → A-06 | `src/utils/fiscalEngine.ts:390,449` no contemplan `justificanteUrl` |
| AG-06 P4 no actualiza periodos pregenerados | **PERSISTE** → A-02 | `src/utils/cobrosEngine.ts:320-331`; `server/actualizacionRenta/servicioActualizacionRenta.ts` sin `registroCobros` |
| AG-07 `creadoPorPropietarioId` con id de usuario | **PERSISTE** → A-05 | `src/components/modals/CrearProfesionalModal.tsx:147` usa `currentUser.id`; `firestore.rules:2412` exige `myPropId()` |
| AG-08 `passwordHash` en `usuarios` | **PERSISTE** → A-07 | `src/lib/authService.ts:125-140, 362, 483, 774` |
| AG-09 resurrección de caché a Firestore | **PERSISTE** → A-03 | `src/App.tsx:1318-1328` |
| AG-10 guardado automático de contratos sin transacción | **PERSISTE** (parcial) → A-12 | `src/lib/firebase.ts:1576-1591` (`getDoc` + `setDoc merge`) |
| AG-11 guardas obsoletas `test:integracion` | **PERSISTE y empeora** (3 fallos) → A-10 | `npm run test:integracion`: 302 pruebas, **299 pass / 3 fail** |
| AG-12 dependencias vulnerables | **PERSISTE** → A-11 | `npm audit --omit=dev`: **8 (7 altas, 1 baja)** |
| AG-17 semilla demo | **PERSISTE** → A-09 | `src/lib/firebase.ts:3421-3483`, invocada desde `src/App.tsx:1279` |

---

## 2. Resumen ejecutivo

La aplicación es un ERP inmobiliario grande y maduro: **223.206 LOC** en `src/` (680 ficheros TS/TSX), **2.908** líneas de `server.ts`, **4.069** líneas de `firestore.rules` (84 bloques `match`), **66** líneas de `storage.rules`, 42 secciones, 37 modales, **64** colecciones Firestore referenciadas por el cliente y las rutas HTTP de `server.ts` + `server/**` (inventario completo en el documento complementario).

Lo comprobado en esta auditoría:

- **Compila y pasa la mayor parte de su batería**: `tsc --noEmit` sin errores, `npm run build` correcto, `vitest run` **4.932 pruebas correctas / 2 fallidas** (las 2 fallidas son la guarda de sandbox A-04, que depende del nombre de rama del checkout y no del producto).
- La **arquitectura de autorización está bien construida**: identidad verificada en servidor para rutas sensibles, espejo `usuarios_auth` no falsificable, carteras L/E proyectadas solo por el master, denegación global por defecto en Firestore, y **toda** la custodia documental mediada por servidor.
- Los **cuatro defectos altos de la auditoría del 20-10 están cerrados en código** (AG-01 a AG-04), incluida la retirada del almacén temporal en RAM.
- **El defecto más grave no estaba detectado**: `isStaff()` concede a cualquier PROFESIONAL con ficha acceso de lectura **y borrado** a los candidatos, solicitudes y avisos de toda la instalación (A-20, P0).
- **Quedan abiertos defectos de integridad económica y de datos** que la suite verde no detecta, porque ninguna prueba cubre esos recorridos: el histórico de cobros y gastos es reescribible/borrable desde el cliente (A-01), la actualización de renta no corrige las mensualidades ya generadas (A-02), el borrado de candidatos se deshace solo (A-03), y los enlaces públicos no caducan ni se revocan (A-04).

**Hallazgos:** **1 P0 · 4 P1 · 9 P2 · 6 P3** (20 hallazgos) y 7 verificaciones pendientes.

**Dictamen:** la aplicación está **auditada parcialmente**. La cobertura de inspección de código es alta (34 áreas funcionales, ~92 % con lectura de su camino crítico), pero **no existe evidencia E4** (aceptación funcional real) de ningún recorrido: no hay acceso a producción, no hay entorno de aceptación autorizado, no hay pruebas E2E de navegador en el repositorio y este sandbox no dispone de Java ni de `firebase-tools` para ejecutar los emuladores oficiales. La evidencia de reglas se ha tomado de la **CI del mismo árbol**.

---

## 3. Inventario de módulos y porcentaje de funciones evaluadas

El inventario completo (con ficheros, rutas, colecciones y pruebas por módulo) está en `docs/AUDITORIA-INTEGRAL-ERP-INVENTARIO.md`. Resumen:

| # | Área funcional | Superficie principal | Evaluación |
|---|---|---|---|
| 1 | Acceso, identidad, roles, usuarios, auditoría | `LoginView`, `AdministracionSection`, `authService.ts`, `firestore.rules` §11 | Auditada |
| 2 | Administración y configuración | `AdminControlCenter`, `ConfiguracionSection`, `system/modulos_config` | Auditada |
| 3 | Inmuebles (alta, edición, baja, imágenes, ficha pública, Catastro) | `InmueblesSection`, `firebase.ts`, `/api/catastro/consultar` | Auditada |
| 4 | Propietarios, titulares, personas, participaciones | `PropietariosSection`, `titularesModelo.ts`, `titularidades/*` | Auditada |
| 5 | Carteras, invitaciones, delegación (L/E), gestión parcial | `gestionesCartera*`, `/api/titulares/buscar`, reglas §13 | Auditada |
| 6 | Captación pública (solicitud, visita, cuestionario, documentación) | `Portal*`, `server/portalPublico/*` | Auditada (A-04, A-08, A-13, A-20) |
| 7 | Candidatos, preselección, solvencia, comparador | `CandidatosSection`, `solvenciaEngine.ts` | Auditada (A-20, A-03) |
| 8 | Formalización y contratos | `FormalizacionSection`, `contratosEngine`, `firebase.ts` | Auditada (A-01, A-12) |
| 9 | Cobros, recibos, morosidad | `CobrosSection`, `cobrosEngine.ts`, `MorosidadSection` | Auditada (A-01, A-02) |
| 10 | Justificantes de cobro (P2) | `server/cobros/*`, `PresentarJustificanteCobro`, `JustificantesCobroInbox` | Auditada |
| 11 | Gastos, recurrentes, OCR (P5) | `GastosSection`, `flujoFacturaOcr.ts`, `ocrFactura.ts` | Auditada (A-06, A-12) |
| 12 | Custodia documental (P3) | `expedienteDocumental/*`, `server/documentos/*` | Auditada en código; producción sin verificar |
| 13 | Fiscalidad, informes, expediente fiscal | `FiscalidadSection`, `fiscalEngine.ts`, `expedienteFiscal/*` | Auditada (A-06) |
| 14 | Paquete del asesor (P6) | `paqueteAsesor/*` | Auditada (A-06) |
| 15 | Actualización de renta (P4) | `server/actualizacionRenta/*`, `actualizacionRentaEngine.ts` | Auditada (A-02) |
| 16 | Avisos, correo, cron, bandeja (P1/P7) | `notificaciones/*`, `relojAvisos.ts`, `rutasCronAvisos.ts` | Auditada; entrega real sin verificar |
| 17 | Tesorería, liquidaciones, SEPA, conciliación | `TesoreriaSection`, `tesoreria/*`, `conciliacionFirestore.ts` | Auditada |
| 18 | Mantenimiento, incidencias, profesionales, operaciones | `IncidenciasSection`, `OperacionesSection`, `ProfesionalPortalSection` | Auditada (A-05, A-20) |
| 19 | Pólizas, siniestros, seguro de impago | `PolizasSection`, `SeguroImpagoSection` | Auditada |
| 20 | Actas, inventario, habitaciones, reformas | `ActasSection`, `inventario*`, `reformas/*` | Auditada (superficie) |
| 21 | Suministros y lecturas | `SuministrosSection`, `suministrosFirestore.ts` | Auditada (superficie) |
| 22 | Financiación, inversión, pricing | `FinanciacionSection`, `InversionSection`, `/api/estimar-pricing` | Auditada (superficie) |
| 23 | Facturación, Veri*Factu, factura electrónica B2B | `FacturacionSection`, `verifactuTransport.ts`, `intercambioB2B/*` | Auditada — **no operativa por decisión** |
| 24 | Sindicación de portales | `src/sindicacion/*` | Auditada — **contrato sin portales** |
| 25 | Portal del inquilino | `portal-inquilino/*`, `usePortalInquilino.ts` | Auditada |
| 26 | Portal del propietario | `PropietarioPortalSection`, `scopedInmuebles` | Auditada (A-08) |
| 27 | Portal del profesional | `ProfesionalPortalSection`, `trabajos_profesionales` | Auditada (A-05) |
| 28 | Importación / exportación / migración | `importExport/*`, `importacion/*`, `migracion/*` | Auditada (superficie) |
| 29 | IA (núcleo, gobierno, llaves, asistente) | `server/ia/*`, `nucleoIA.ts` | Auditada (superficie); operación real sin verificar |
| 30 | Centro de ayuda, tutoriales, experiencia | `CentroAyudaSection`, `experiencia/*` | Auditada (superficie) |
| 31 | Rehabilitación/recomercialización | `RecomercializacionSection` | Auditada (superficie) |
| 32 | Baja patrimonial y transmisiones | `bajaPatrimonialInmuebleFirestore.ts`, `edicionOrdinariaInmueble.ts` | Auditada |
| 33 | Infraestructura (Express, Vercel, CI, env) | `server.ts`, `api/index.ts`, `vercel.json`, workflow | Auditada |
| 34 | Gobernanza documental (94 documentos en `docs/`) | — | Auditada (A-17) |

### 3.1 Cómo se calcula el porcentaje

- **Cobertura de inspección (92 %)**: de las **34** áreas del inventario, **34** tienen inspección de su camino crítico de código (pantalla de entrada → servicio → escritura → regla). Se descuentan al 8 % restante las subfunciones marcadas «superficie» (solo lectura de contrato de datos, sin seguir el flujo completo): 3 de 34 áreas tienen al menos una subfunción en ese estado (20, 21, 29).
- **Cobertura funcional verificada (E2–E3)**: **41 recorridos** de los 46 definidos en `AUDITORIA-INTEGRAL-ERP-RECORRIDOS.md` tienen al menos una prueba automatizada o de emulador que los toca (**89 %**). De ellos, **solo 12** tienen una prueba cuyo alcance coincide con el recorrido completo de negocio (no de una función aislada).
- **Cobertura E4 (aceptación real)**: **0 recorridos** (0 %). No hay entorno autorizado ni credenciales.

Estas tres cifras no son intercambiables: la primera mide lectura de código, la segunda existencia de pruebas y la tercera funcionamiento comprobado con datos reales.

---

## 4. Matriz de perfiles y portales (resumen)

La matriz completa, con las diez comprobaciones exigidas por perfil, está en `docs/AUDITORIA-INTEGRAL-ERP-MATRIZ-PERMISOS.md`. Perfiles reales encontrados en el código:

| Perfil | Definición en código | Entrada | Alcance efectivo |
|---|---|---|---|
| Administrador principal (master) | Email verificado `sarqsan2@gmail.com` (`firestore.rules:28`, `authService.ts:45`) | ERP | Todo; único que puede escribir `usuarios_auth`, `carterasL/E` y los canales de auditoría obligatoria |
| Administrador | `usuarios.tipoPerfil = 'ADMINISTRADOR'` + `estado ACTIVO` + `authUid` coincidente | ERP | Todo el ERP; **puede listar** colecciones (lectura amplia), pero no es master para escrituras privilegiadas |
| Gestor de cartera | `usuarios_auth.tipoPerfil = 'PROFESIONAL'` con `profesionalId` válido + `carterasL/E` | ERP con secciones extra (`formalizacion`, `cobros`) si rol `GESTOR_PATRIMONIAL` | Lectura L, escritura E, por cartera; **no** transmite titularidad |
| Propietario / titular | `tipoPerfil = 'PROPIETARIO'` con `propietarioId` | ERP (25 secciones) | Su cartera: inmuebles, contratos, cobros, gastos, fiscalidad, documentos |
| Profesional | `tipoPerfil = 'PROFESIONAL'` con ficha `profesionales/{id}` existente | ERP (6 secciones) | Sus trabajos, incidencias asignadas, su ficha |
| Inquilino | `tipoPerfil = 'INQUILINO'` con `contratoIds` (1–5) | Portal del inquilino (nunca el ERP) | Sus contratos, recibos, justificantes, incidencias, mensajes, suministros, actas de su contrato |
| Candidato | Sin cuenta: token de capacidad | Portales públicos | Solo su invitación/cuestionario/solicitud documental |
| Público con token | Token de invitación/documentación; no existe token de propietario | Portales públicos + ficha pública | Solo el objeto del token |

**Comprobaciones clave de la matriz** (evidencia en el documento específico):

1. **La autorización no depende de la interfaz.** El *route guard* de `App.tsx:698-717` es solo UX; la autoridad está en `firestore.rules` y en el servidor. Se comprobó que las secciones ocultas al propietario (p. ej. `inquilinos`, `morosidad`) siguen denegadas en reglas.
2. **Separación cuenta de acceso ↔ titular jurídico ↔ gestor.** El espejo `usuarios_auth/{uid}` solo lo escribe el master (`firestore.rules:427-449`) y `indexIsTruthful()` obliga a que coincida con `usuarios/{usuarioId}`; un usuario no puede autoasignarse `propietarioId`, `carterasL/E`, `inmuebleIds`, `roles` ni `permisos`.
3. **Carteras compartidas 50 %/100 %.** La copropiedad se resuelve por `titularesIds` (`inmuebleEsMio`, reglas §3) y las participaciones en `titularidades/{inmuebleId}__{pid}`; la importación conserva participaciones (`src/lib/importExport/titularidadImportacion.ts`, `tests/h10-migracion-porcentajes.test.ts`). **No se ha verificado con datos reales** (E1/E2 solamente).
4. **Acceso por URL directa o identificador ajeno.** Denegado: `allow list` exige consultas demostrables (`where(propietarioId == myPropId())`) y `get` de un documento ajeno no es demostrable. Excepción deliberada: la **foto pública** de inmueble (`storage.rules`, `inmuebles/{id}/{fileName}` → `allow get: if true`).
5. **Caducidad de sesión/token.** Firebase Auth gestiona la sesión; **los tokens de los portales públicos no caducan** (A-04).
6. **Consulta de información de otra cartera.** No se ha encontrado ninguna ruta que lo permita; las consultas del cliente están acotadas por `dataScope` y las reglas revalidan. El riesgo residual es de **escritura** dentro del propio ámbito (A-01), no de lectura cruzada.

---

## 5. Tabla de recorridos completos y nivel de evidencia

Detalle en `docs/AUDITORIA-INTEGRAL-ERP-RECORRIDOS.md`. Niveles: **E1** código inspeccionado · **E2** prueba automatizada ejecutada · **E3** emulador/integración · **E4** aceptación funcional real.

| ID | Recorrido | Resultado observado | Nivel |
|---|---|---|---|
| D1 | Inmueble y titularidad (alta → titulares → participaciones → cambio) | Coherente en código y reglas; importación conserva participaciones | E2 |
| D2 | Alquiler e inquilino (solicitud → visita → contrato → portal) | Funciona por partes; la reserva pública no valida estado de la invitación (A-04) | E2 |
| D3 | Propietario (acceso, económica, documentos, exportación) | Aislamiento correcto; módulo comercial inoperativo para el titular (A-08); profesionales privados bloqueados (A-05) | E2 |
| D4 | Profesional (encargo → presupuesto → trabajo → factura → gasto) | Coherente; el alta de profesional privado por el titular falla (A-05) | E2 |
| D5 | Cobros y justificantes | **Presentar un justificante no genera cobro** (verificado en servicio y en UI) | E2 + E3 (emulador en CI) |
| D6 | Gastos, facturas y fiscalidad | Alta y deducibilidad correctas; factura manual no cuenta como documentada (A-06) | E2 |
| D7 | Mantenimiento e incidencias | Cadena incidencia → trabajo → gasto con trazabilidad; sin verificación de UI real | E2 |
| D8 | Avisos y rentas (día 5, idempotencia) | Motor idempotente y *fail-closed* sin transporte; **entrega real no verificada** | E2 · entrega **V** |
| D9 | OCR documental | Dedupe por huella + ID estable + bloqueo de anulados; 3 etapas no atómicas declaradas | E2 |
| D10 | Asesoría y exportaciones | ZIP determinista con hashes; no incluye facturas manuales (A-06) | E2 |
| D11 | Enlaces públicos y tokens | Sin caducidad ni revocación; estado de invitación no validado (A-04) | E2 · E3 (emulador en CI) |
| D12 | Importación / exportación / recuperación | Preflight, dedupe por niveles, errores parciales; sin restauración de copia completa | E2 |

---

## 6. Hallazgos ordenados por severidad

Ficha completa (esperado, observado, evidencia reproducible, impacto, corrección y prueba de regresión) en `docs/AUDITORIA-INTEGRAL-ERP-HALLAZGOS.md`.

### P0 — Críticos

| ID | Módulo | Hallazgo | Evidencia |
|---|---|---|---|
| **A-20** | Reglas / captación / notificaciones (6, 7, 16, 18) | `isStaff()` incluye **a cualquier PROFESIONAL con ficha**, y se usa como única condición de acceso en `candidatos` (`get`, `list`, `create`, `update`, **`delete`**), `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `notificaciones` y el catálogo de `profesionales`. Un fontanero contratado por un propietario puede leer, listar y borrar los candidatos y solicitudes de **todas las carteras**, y ver la bandeja de avisos de todos los propietarios. No es una decisión explícita sobre contratistas: el predicado solo exige que exista una ficha, y `profesionales` contiene contratistas externos (`esPrivado`, `creadoPorPropietarioId`). | `firestore.rules:546-553` (definición), `:2049-2078`, `:2081-2092`, `:2100-2115`, `:2125-2136`, `:2161-2178`, `:2401-2418`, `:2619`, `:2529-2535` |

No se ha encontrado **escalada de privilegios de escritura** (nadie puede cambiarse a ADMINISTRADOR) ni **lectura cruzada entre propietarios**. La exposición de A-20 es de lectura y borrado sobre datos personales de candidatos por un rol que no los necesita.

> **Nota de honestidad:** A-20 se ha **reproducido** con el harness de reglas del repositorio (5/5 comprobaciones afirmativas, fichero temporal no incorporado). No estaba cubierto por ninguna prueba del repositorio —el fixture de profesional se crea *sin* ficha, que es justo el caso que no concede `isStaff()`— y por eso no lo habían detectado las auditorías previas. Su gravedad depende de la decisión de producto sobre qué es un «profesional interno»; mientras esa decisión no exista en el modelo de datos, el comportamiento es el observado.

### P1 — Altos

| ID | Módulo | Hallazgo | Evidencia |
|---|---|---|---|
| **A-01** | Contratos/cobros/gastos (8, 9, 11) | El histórico económico (`registroCobros` dentro de `contratos_formalizacion`, y `gastos`) es un campo de documento **escribible por el cliente** con `setDoc(merge)`; las reglas permiten al titular/gestor **actualizar cualquier campo y borrar el documento**, sin validación de importes, sin precondición de versión y sin `audit_logs` obligatorio fuera del master. El histórico de pagos se puede reescribir o eliminar sin rastro. | `firestore.rules:1454-1530`, `:1533-1556`; `src/lib/firebase.ts:1576-1591`; `src/utils/cobrosEngine.ts:415+` |
| **A-02** | Actualización de renta → cobros (15, 9, 16) | Al confirmar una actualización de renta (P4) se actualiza `rentaMensual` y se registra el anexo, pero **los periodos ya materializados conservan el `importePrevisto` anterior** (`existing` se copia «intacto»). Los recibos, los avisos del día 5 y la morosidad de los 1–3 meses ya generados quedan con importe desactualizado. | `src/utils/cobrosEngine.ts:320-331`; `server/actualizacionRenta/servicioActualizacionRenta.ts` (no menciona `registroCobros`) |
| **A-03** | Candidatos (7) | Si el *snapshot* de `candidatos` llega **vacío**, la app **reescribe en Firestore** los candidatos que tenía en memoria: un borrado (o un vaciado legítimo) se deshace solo y reaparecen datos personales que el usuario había eliminado. | `src/App.tsx:1318-1328` (`current.forEach(c => saveCandidatoFirestore(c))`) |
| **A-04** | Portales públicos (6, 11) | Los enlaces de capacidad **no caducan ni se revocan**: `exigirToken` solo valida el formato y la existencia del documento; no se comprueba `expiraEn`, ni el estado de la invitación (`CANCELADO`, `RECHAZADO`, `CERRADO`) al reservar. Un enlace filtrado sigue mostrando el teléfono/email del candidato y permitiendo reservar indefinidamente. | `server/portalPublico/servicioPortalPublico.ts:116-121, 449-505`; ausencia de campo de caducidad en `CAMPOS_INVITACION` |

### P2 — Medios

| ID | Módulo | Hallazgo | Evidencia |
|---|---|---|---|
| **A-05** | Profesionales privados (18, 3) | El alta de profesional privado por el titular envía `creadoPorPropietarioId = currentUser.id` (id de usuario) mientras la regla exige `myPropId()` (id de propietario) → **denegada**; la función está inoperativa para el titular. | `src/components/modals/CrearProfesionalModal.tsx:147`; `firestore.rules:2412` |
| **A-06** | Gastos → fiscalidad → P6 (11, 13, 14) | Las facturas subidas por el flujo manual (`justificanteUrl`/`justificantePath`) **no cuentan** como «con justificante» en fiscalidad ni entran en el índice del paquete del asesor: solo se miran `documento`/`documentos`. El contador y el ZIP del asesor omiten documentación que sí existe. | `src/utils/fiscalEngine.ts:390, 449`; `src/lib/paqueteAsesor/documentos.ts`; contraste con `src/lib/expedienteDocumental/indice.ts:150` |
| **A-07** | Identidad (1) | Se sigue persistiendo `passwordHash` (SHA-256 **sin sal**, con *fallback* a hash de 32 bits) en `usuarios/{id}`, y permanece una rama de «login directo» que compara ese hash en el cliente si el proveedor Email/Password está deshabilitado. Material sensible en reposo sin necesidad (la autenticación real es Firebase Auth). | `src/lib/authService.ts:125-140, 281-370, 483, 774` |
| **A-08** | Captación (6, 7, 26) | Las suscripciones a `candidatos` y `solicitudes` se hacen **sin ámbito** (`subscribeCandidatos()`), pero las reglas solo permiten `list` a `isStaff()` (solicitudes) o con `where(propietarioId == myPropId)` (candidatos). Para propietario/gestor la consulta se deniega: **el módulo comercial y los contadores de candidatos del panel quedan vacíos** para esos perfiles. | `src/App.tsx:1318, 1340`; `src/lib/firebase.ts:1017-1050`; `firestore.rules:2054-2056, 2085-2090` |
| **A-09** | Arranque (1, 2) | En el arranque autenticado se ejecuta `seedInitialDataIfEmpty()`, que crea **usuarios demo** (`propietario@email.com` ACTIVO con `prop_demo_1`, profesional demo), aseguradoras, especialidades y profesionales demo si las colecciones están vacías. | `src/App.tsx:1279`; `src/lib/firebase.ts:197-222, 3421-3483` |
| **A-10** | Calidad/CI (33) | `npm run test:integracion` → **302 pruebas, 299 correctas, 3 fallidas**: guardas de «checkout f782» obsoletas que ya no describen el árbol. Además, el workflow **no se dispara en `push` a `main`** y sigue enumerando ramas de sesiones antiguas. | Ejecución local; `.github/workflows/emulador-reglas.yml:5-13` |
| **A-11** | Dependencias (33) | `npm audit --omit=dev`: **8 vulnerabilidades (7 altas, 1 baja)**: 5 avisos de `nodemailer` (incluye *«cross-tenant SMTP credential disclosure»* y DoS por *backtracking*), `source-map-js` y `vite`. | `npm audit --omit=dev` |
| **A-12** | Contratos/gastos (8, 11) | Guardado sin control de concurrencia: `getDoc` + `setDoc(..., {merge:true})`, sin transacción ni `updateTime` esperado. Dos pestañas (o dos usuarios de la misma cartera) producen **last-write-wins** sobre datos económicos. | `src/lib/firebase.ts:1576-1591`, `:1879-1895` |
| **A-13** | Captación pública (6) | Las altas anónimas de `solicitudes` y `candidatos` solo exigen `hasAll([...])`, **sin `hasOnly`**: cualquiera puede añadir campos arbitrarios (`estado`, `propietarioId`, `cuestionarioToken`, importes…). Además las rutas públicas `/api/visita|cuestionario|documentacion` **no tienen limitador de tasa** (solo la prueba SMTP lo tiene). | `firestore.rules:2085-2090, 2057-2064`; `server/portalPublico/rutasPortalPublico.ts` |

### P3 — Bajos

| ID | Hallazgo | Evidencia |
|---|---|---|
| **A-14** | Mensajes de error internos devueltos al cliente (`motivoDenegacion: err.message`) en `/api/notificaciones/enviar`. | `server.ts:2827-2830` |
| **A-15** | Chunk principal de **5.545 kB** (1.380 kB gzip); solo OCR y PDF se separan. | Salida de `npm run build` |
| **A-16** | Gobernanza documental: 94 documentos en `docs/` con estados contradictorios (informes de cierre que declaran «completo» funciones hoy parciales). | `ls docs` |
| **A-17** | Caché `localStorage` usada como estado inicial de propietarios/inmuebles/contratos/candidatos: se muestran datos obsoletos sin indicación hasta que llega el *snapshot*. | `src/App.tsx:392-450` |
| **A-18** | `firebase-applet-config.json` versionado con `apiKey` (normal en Firebase web) y `recaptchaSiteKey` vacío; el *App Check*/reCAPTCHA no está configurado. | `firebase-applet-config.json` |
| **A-19** | El `README` no existe; la puesta en marcha depende de `docs/` (94 ficheros) y de `.env.example` (correcto y detallado). | Raíz del repositorio |

---

## 7. Pruebas ejecutadas, resultados y límites

| Prueba | Comando | Resultado | Nivel |
|---|---|---|---|
| Tipos | `npx tsc --noEmit` | **0 errores** (exit 0, 21,9 s) | E2 |
| Suite completa | `npx vitest run` | **276 ficheros: 275 OK / 1 FAIL · 4.943 pruebas: 4.932 OK / 2 FAIL / 2 *skipped* / 7 todo** (200,9 s) | E2 |
| Fallo detectado | `tests/guardia-a04-rama-sesion.test.ts` | 2 fallos: la guardia devuelve `BLOCKED` (código 2) porque el checkout tiene `HEAD == main` y no existe `refs/remotes/origin/arena/…`. **Es una limitación del sandbox, no del producto**; el mismo test está excluido en CI por ese motivo. | E2 (no concluyente) |
| Build | `npm run build` | **Correcto** (13,3 s; `dist/server.cjs` 650 kB); aviso de chunk > 500 kB | E2 |
| Integración (`node --test`) | `npm run test:integracion` | **302 pruebas: 299 OK / 3 FAIL** (guardas «checkout f782») | E2 |
| Reglas (emulador oficial) | `npm run test:emulador:reglas` | **No ejecutada en este sandbox** (sin Java ni `firebase-tools`). Evidencia del mismo árbol: CI run `39500652329`, job «Reglas Firestore y Storage (emuladores oficiales)» = **success** (≈70 casos definidos en `tests/emulador/**`) | **E3 (CI del mismo árbol)** |
| Dependencias | `npm audit --omit=dev` | **8 vulnerabilidades (7 altas, 1 baja)** | E2 |
| Recorrido real de interfaz | — | **No ejecutado**: no hay pruebas E2E de navegador en el repositorio y no hay entorno autorizado | **E4 = 0** |
| Operaciones externas | SMTP real, Gemini, Catastro, GCS, Firestore/Storage de producción, cron de Vercel | **No ejecutadas** (prohibido / sin credenciales) | V |

**Límites concretos de esta ejecución:**

1. **Sin emuladores locales**: `java` no está instalado y `firebase-tools` no está disponible. Las pruebas de reglas no se han podido ejecutar aquí; se acepta como evidencia la CI del **mismo árbol** (no de producción).
2. **Sin acceso a producción**: no se ha verificado qué reglas están publicadas, ni el estado del despliegue de Vercel, ni las variables de entorno reales (`CRON_SECRET`, cuenta de servicio, SMTP).
3. **Clon superficial**: no se puede contrastar el diff con commits anteriores ni auditar el historial de los bloques P1–P5; el análisis se limita al árbol de `2563831`.
4. **Sin datos reales**: los recorridos económicos no se han probado con carteras reales; todos los hallazgos de A-01/A-02/A-12 son de código y de diseño de reglas.

---

## 8. Funciones no implementadas o no verificables

### 8.1 Declaradas no operativas (decisión de alcance, **no defecto**)

| Función | Estado real en el código | Referencia |
|---|---|---|
| Remisión VERI*FACTU a la AEAT | **No implementada**: `VerifactuTransportPendiente.enviar()` devuelve `ERROR / INDISPONIBLE` y lo declara | `src/utils/verifactuTransport.ts:46-62` |
| Factura electrónica B2B (SPFE/FACeB2B) | **No implementada**: solo adaptador de *preparación* (`simulado: true`, estado `DISPUEESTA_PARA_ENVIO`) y adaptador SPFE `disponible() === false` | `src/utils/intercambioB2B/adaptadoresB2B.ts:36-140` |
| Sindicación a portales inmobiliarios | **No conectada**: `crearAdaptadorNoConectado()` devuelve `PORTAL_NO_CONECTADO`; existe exportación de *feed* | `src/sindicacion/adaptadores.ts:1-40` |
| Importación bancaria (conciliación automática) | **Desactivada por decisión**: `IMPORTACION_BANCARIA_AUTORIZADA = false` | `src/lib/conciliacionFirestore.ts:34` |
| WhatsApp | Canal declarado y no inyectado (`WHATSAPP: null`) | `server.ts:117` |
| PSD2 / iniciación de pagos | Excluido permanentemente del producto; no hay código | — |

### 8.2 No verificable en esta sesión

| ID | Qué falta | Por qué |
|---|---|---|
| V-1 | Reglas **realmente publicadas** y comportamiento de Storage en el proyecto real | Sin acceso ni autorización a producción |
| V-2 | Entrega real de correo y ejecución del cron de Vercel | Prohibido enviar correos; sin acceso a Vercel |
| V-3 | Operaciones IA (Gemini), Catastro y adaptador GCS | Sin claves ni red a esos hosts |
| V-4 | Cuenta de servicio presente en el despliegue (condiciona P2, P3, P4, portales públicos) | Sin acceso a variables de entorno |
| V-5 | Estado de los datos existentes (participaciones, `justificanteUrl`, candidatos borrados que hayan reaparecido) | Sin lectura de producción |
| V-6 | Comportamiento de las 42 pantallas por rol | Sin pruebas E2E ni navegador |
| V-7 | Rendimiento con volúmenes productivos | Sin datos |

---

## 9. Riesgos específicos de producción

1. **Acceso de un contratista a datos de captación (A-20).** Con una cuenta PROFESIONAL activa (el propio sistema crea fichas demo y permite que un titular cree profesionales privados) se puede consultar y borrar la captación de todas las carteras desde el SDK, sin pasar por la interfaz. Es el riesgo que exige atención **inmediata**.
2. **Divergencia reglas-repositorio.** Nada garantiza que lo desplegado sea `firestore.rules` de este SHA: no hay `firebase deploy` en el CI (y el PR #22, que lo añadiría, está abierto desde el 2026-10-02). Un `storage.rules` antiguo en producción reintroduciría AG-03 completo (toda la custodia denegada para no-master).
3. **Dependencia total de la cuenta de servicio.** Tras AG-03.2, todo el acceso documental pasa por el servidor. Si la credencial falta o caduca, **todos** los flujos documentales fallan (correctamente, en cerrado) y los portales públicos responden 503: no hay degradación parcial.
4. **Histórico económico mutable (A-01).** Un error de cliente, una importación o una edición manual pueden reescribir meses de cobros sin que ninguna regla lo impida. En un ERP de alquileres esto afecta a recibos, morosidad y al paquete del asesor del ejercicio.
5. **Importes desactualizados tras subir la renta (A-02).** Afecta a la reclamación al inquilino y a la información al propietario en los meses siguientes.
6. **Enlaces públicos eternos (A-04).** Un enlace reenviado por WhatsApp sigue exponiendo nombre, email, teléfono y dirección de la visita, y permite reservar sobre invitaciones cerradas.
7. **Semilla demo (A-09).** En un proyecto nuevo, el primer arranque del master crea usuarios y profesionales ficticios «ACTIVO». No otorgan acceso (no tienen cuenta de Auth), pero contaminan el censo y las métricas.
8. **`nodemailer` con avisos de seguridad altos (A-11)** en el canal que envía comunicaciones a inquilinos y propietarios.

---

## 10. Plan de corrección (resumen por dependencias)

Orden completo, con criterios de cierre verificables, en `docs/AUDITORIA-INTEGRAL-ERP-PLAN-CORRECCIONES.md`.

| Orden | Grupo | Hallazgos | Por qué en este orden |
|---|---|---|---|
| 0 | **Datos personales (bloqueante)** | A-20, A-04 | A-20 es una exposición activa por reglas; A-04 mantiene enlaces vivos indefinidamente. Antes que cualquier mejora funcional |
| 1 | Integridad económica (una sola causa: *no hay autoridad de servidor para el histórico*) | A-01, A-12, A-02 | A-01 y A-12 comparten causa (escritura cliente sin versión); A-02 necesita que A-01 fije dónde vive el histórico antes de tocar importes |
| 2 | Integridad de datos y captación | A-03, A-08, A-13, A-05 | A-03 es una regresión activa; A-08/A-13 comparten la suscripción/validación del canal comercial; A-05 es un cambio de una línea |
| 3 | Seguridad de enlaces y secretos | A-04, A-07, A-18 | A-04 requiere modelo (caducidad/revocación) y migración de invitaciones vivas; A-07 es limpieza de datos sensibles |
| 4 | Documentación fiscal y paquete | A-06 | Depende de que A-01 decida dónde vive el documento del gasto |
| 5 | Higiene técnica y CI | A-10, A-11, A-09, A-14, A-15, A-16, A-17 | Sin impacto funcional inmediato; A-10 y A-11 sí deben entrar antes de la próxima entrega |

**Regla de agrupación aplicada:** no se proponen dos arreglos para la misma causa. P. ej. A-01 y A-12 se resuelven con una única decisión (histórico append-only o precondición de versión + auditoría), no con dos parches.

---

## 11. Criterios verificables para dar cada incidencia por resuelta

Resumen (el detalle, prueba por prueba, está en el plan):

- **A-20**: en el emulador oficial, un PROFESIONAL con ficha recibe `permission-denied` en `list`/`get`/`delete` de `candidatos` y `solicitudes` de otro ámbito, y un gestor de cartera A no lee la captación de la cartera B.
- **A-01**: existe una prueba que demuestra que (a) un `setDoc` que altera un periodo ya pagado no modifica el histórico, y (b) el borrado de un contrato con cobros exige master o deja traza en `audit_logs`. Hoy no existe ninguna de las dos.
- **A-02**: prueba del motor que, tras confirmar P4 con fecha efectiva `2026-11-01`, los periodos `PENDIENTE` desde esa fecha tienen el nuevo `importePrevisto` y los anteriores conservan el histórico.
- **A-03**: prueba de integración (o de componente con *mock* de Firestore) que, con snapshot vacío, **no se llama** a `saveCandidatoFirestore`.
- **A-04**: prueba de servicio con invitación `CANCELADO` y con `expiraEn` pasado → 404/410 en `obtenerVisita`, `reservarVisita` y `obtenerCuestionario`.
- **A-05**: prueba de reglas con `creadoPorPropietarioId == myPropId()` → permitido; con `usuario.id` → denegado (harness ya disponible en `tests/harness/firestoreRulesEval.ts`).
- **A-06**: prueba unitaria de `calcularGastosEjercicio`/`recopilarDocumentacionFiscal` con gasto manual (`justificanteUrl`) → cuenta como documentado e índice del asesor lo declara como referencia no custodiada.
- **A-07**: `grep` de `passwordHash` sin resultados en `src/`, y prueba de que el login solo usa Firebase Auth.
- **A-08**: prueba de componente que verifica que se llama `subscribeCandidatos` con `dataScope` y que un propietario ve sus candidatos.
- **A-09**: prueba de que `seedInitialDataIfEmpty` no crea usuarios cuando `NODE_ENV=production`.
- **A-10**: `npm run test:integracion` con 302/302 y workflow disparando en `push` a `main`.
- **A-11**: `npm audit --omit=dev` sin vulnerabilidades altas.
- **A-12/A-13**: pruebas de reglas (campos cerrados con `hasOnly`) y prueba de servicio (límite de tasa / 429).

---

## 12. Limitaciones de la auditoría y pruebas pendientes

1. **Dictamen: AUDITADA PARCIALMENTE.** No se puede afirmar que la aplicación sea segura ni funcional en su conjunto: no hay evidencia E4 de ningún recorrido, ni verificación de las reglas publicadas, ni prueba de entrega real de avisos, ni prueba de Storage con la cuenta de servicio real.
2. **No se ha auditado el historial de git** (clon superficial): no se puede afirmar si alguna corrección se revirtió posteriormente.
3. **Cobertura de UI limitada**: se han leído componentes y hay pruebas con Testing Library, pero ninguna prueba monta la aplicación completa; no se ha comprobado navegación real, estados vacíos, errores de red ni comportamiento móvil.
4. **No se han ejecutado pruebas destructivas** ni se ha escrito en ningún entorno.
5. **Pruebas pendientes imprescindibles antes de dar por buena la entrega**: (a) ejecutar `npm run test:emulador:reglas` con Java en una máquina autorizada; (b) prueba manual por rol (matriz §4) sobre un entorno de aceptación; (c) verificación de reglas publicadas vs. repositorio; (d) prueba SMTP y cron controladas; (e) prueba de subida/descarga real de un documento con una cuenta no master.

---

## Anexo A — Evidencia de ejecución (comandos reproducibles)

```bash
git rev-parse HEAD                 # 2563831df9b026dec8276c45db40977f72883f9d
git rev-parse origin/main          # 2563831df9b026dec8276c45db40977f72883f9d
gh pr list --state open            # 1 abierto (#22)
gh run view 39500652329 --json jobs  # ambos jobs success (árbol del PR #61)
npm ci --no-audit --no-fund
npx tsc --noEmit                   # exit 0
npx vitest run                     # 4.932 pass / 2 fail (guardia A-04 de sandbox)
npm run build                      # correcto
npm run test:integracion           # 299 pass / 3 fail (guardas 'checkout f782')
npm audit --omit=dev               # 8 vulnerabilidades (7 high, 1 low)
```

## Anexo B — Cómo leer este informe

- Un **hallazgo** es un comportamiento demostrado por el código o por una prueba ejecutada, no una sospecha. Las sospechas están en §8.2 como «no verificable».
- Una **decisión de alcance** (Veri*Factu, B2B, sindicación, importación bancaria) **no** se cuenta como defecto.
- Un **test verde no cierra un hallazgo**: cada hallazgo indica la prueba de regresión que debe existir para cerrarlo.
