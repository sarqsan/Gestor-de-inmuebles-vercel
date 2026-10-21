# AUDITORÍA INTEGRAL — HALLAZGOS

**SHA:** `2563831df9b026dec8276c45db40977f72883f9d`
**Criterio:** un hallazgo exige evidencia en el código o en una prueba ejecutada. Las sospechas no verificables figuran en el informe principal §8.2 y **no** se cuentan como defectos.

**Severidades:** P0 crítica · P1 alta · P2 media · P3 baja.
**Estado de producción:** salvo indicación, no se ha podido determinar si el defecto está activo en producción (V-1).

| ID | Sev. | Módulo | Título |
|---|---|---|---|
| A-20 | **P0** | Reglas / captación / notificaciones | `isStaff()` incluye a todo PROFESIONAL: acceso a candidatos, solicitudes y avisos de toda la instalación |
| A-01 | P1 | Contratos/cobros/gastos | Histórico económico mutable y borrable desde el cliente, sin auditoría ni versión |
| A-02 | P1 | P4 → cobros | La subida de renta no actualiza las mensualidades ya generadas |
| A-03 | P1 | Candidatos | Un snapshot vacío reescribe los candidatos borrados (resurrección) |
| A-04 | P1 | Portales públicos | Enlaces de capacidad sin caducidad ni revocación; estado de invitación no validado |
| A-05 | P2 | Profesionales | El titular no puede crear profesionales privados (`currentUser.id` vs `propietarioId`) |
| A-06 | P2 | Gastos → fiscalidad/P6 | La factura manual (`justificanteUrl`) no cuenta como documentación |
| A-07 | P2 | Identidad | `passwordHash` sin sal persistido y rama de login directo |
| A-08 | P2 | Captación | Suscripciones sin ámbito: comercial y contadores vacíos para propietario/gestor |
| A-09 | P2 | Arranque | Siembra de usuarios y catálogos demo en el primer arranque |
| A-10 | P2 | CI | `test:integracion` con 3 fallos; el workflow no se dispara en `push` a `main` |
| A-11 | P2 | Dependencias | 8 vulnerabilidades (7 altas) |
| A-12 | P2 | Contratos/gastos | Guardado sin control de concurrencia (last-write-wins) |
| A-13 | P2 | Captación pública | Altas anónimas sin campos cerrados y sin límite de tasa |
| A-14 | P3 | Avisos | Mensajes de error internos devueltos al cliente |
| A-15 | P3 | Rendimiento | Chunk principal de 5,5 MB |
| A-16 | P3 | Gobernanza | 94 documentos con estados contradictorios |
| A-17 | P3 | Datos | Caché `localStorage` como estado inicial sin aviso |
| A-18 | P3 | Configuración | App Check/reCAPTCHA no configurado |
| A-19 | P3 | Documentación | No hay `README` de puesta en marcha |

---

## A-20 · P0 · `isStaff()` incluye a cualquier PROFESIONAL y abre captación y avisos de toda la instalación

**Perfil afectado:** PROFESIONAL (contratista externo) y, con el mismo predicado, gestor de cartera (que además sale de su cartera).
**Recorridos:** D2, D3, D11 (y acceso a datos personales de candidatos).

**Resultado esperado.** Un profesional contratista (p. ej. el fontanero de un propietario) debe ver **solo** sus encargos, sus incidencias asignadas y su ficha. Un gestor de cartera debe ver la captación **de su cartera**.

**Resultado observado.** `isStaff()` (`firestore.rules:546-553`) se define como *master* **o** (espejo veraz **y** (`ADMINISTRADOR` **o** `PROFESIONAL` con `profesionales/{profesionalId}` existente)). No distingue profesional interno de contratista externo, ni comprueba cartera. Ese predicado se usa como **única** condición de acceso en:

| Colección | Operaciones concedidas a cualquier PROFESIONAL | Línea |
|---|---|---|
| `candidatos` | `get`, `list`, `create`, `update`, **`delete`** — de toda la instalación | 2049-2078 |
| `solicitudes` | `get`, `list`, `create`, `update`, **`delete`** | 2081-2092 |
| `invitaciones` | `get`, `list`, `create`, `update`, `delete` | 2100-2115 |
| `slots_visita` | `get`, `list`, `create`, `update`, `delete` | 2125-2136 |
| `solicitudes_documentacion` | `get`, `list`, `create`, `update`, `delete` | 2161-2178 |
| `profesionales` | `get`, `list`, `create` (catálogo completo), `update` | 2401-2418 |
| `notificaciones` | `list` (bandeja de todos los propietarios) | 2619 |
| `enlaces_registro` | `list`, `create`, `update` de enlaces **genéricos** (sin vinculación nominal, con `auditoriaVinculada`) | 2529-2535, 2565 |
| `especialidades` | CRUD | 2585-2588 |
| `configuracion_aseguradoras` | lectura | 2188 |

**Evidencia reproducida (E2, sin tocar producción).** Se evaluaron las reglas reales con el harness del repositorio (`tests/harness/firestoreRulesEval.ts`), perfil sintético `{ tipoPerfil: 'PROFESIONAL', profesionalId: 'prof_1', estado: 'ACTIVO' }` con espejo veraz y ficha `profesionales/prof_1` existente, y documentos de la cartera `prop_A` (ajena a ese profesional):

```
candidatos.list      (doc de prop_A) → PERMITIDO  ✅ confirmado
candidatos.get       (doc de prop_A) → PERMITIDO  ✅ confirmado
candidatos.delete    (doc de prop_A) → PERMITIDO  ✅ confirmado
solicitudes.list     (doc de prop_A) → PERMITIDO  ✅ confirmado
solicitudes.delete   (doc de prop_A) → PERMITIDO  ✅ confirmado
notificaciones.list  (aviso de prop_A) → PERMITIDO ✅ confirmado
```

Resultado de la ejecución: **5 de 5 comprobaciones afirmativas** (más un control del propietario sobre su propio candidato). El fichero de prueba fue temporal y **no se ha incorporado al repositorio**.

**Por qué no lo detectó nadie antes:** las pruebas de reglas con perfil PROFESIONAL (`tests/emulador/documentos-p3.emulador.test.ts:90-93`, `tests/carteras-lectura-matriz-reglas.test.ts:163`) cubren documentos y carteras, **no** captación; y el fixture de `tests/seguridad-firestore-d2.test.ts:87-99` crea el espejo del profesional **sin ficha** (`profesionales/prof_1` no existe), precisamente para demostrar que «ser un Auth sin ficha NO concede isStaff». Con ficha, nunca se probó.

**Por qué es P0 y no un diseño aceptado.** El propio código llama «personal interno» a `isStaff()` (`firestore.rules:536-545`), pero el predicado solo exige que exista una ficha en `profesionales`, colección que contiene **contratistas externos creados por los propietarios** (`esPrivado`, `creadoPorPropietarioId`, `CrearProfesionalModal`). Es decir: la categoría «interno» se otorga a cualquiera con ficha. Los datos expuestos (nombre, email, teléfono, dirección de visita, situación laboral, ingresos y solvencia declarada de candidatos, y la bandeja de avisos con datos de propietarios e inquilinos) son datos personales de terceros sin relación con el encargo del profesional.

**Impacto:** acceso indebido a datos personales (RGPD), borrado de candidatos/solicitudes ajenos (integridad y disponibilidad), emisión de enlaces de registro genéricos (entrada de nuevas cuentas). Económico indirecto (pérdida de captación).

**¿Afecta a producción?** No determinado. Depende de que existan cuentas PROFESIONAL activas con ficha (el escenario está previsto y sembrado por el propio sistema, A-09).

**Dependencias:** A-09 (crea fichas demo), A-08 (el cliente ni siquiera muestra la captación al gestor, lo que oculta el exceso). Se corrige junto con A-13 (modelo de permisos de captación).

**Corrección recomendada (no implementada):** sustituir `isStaff()` por predicados explícitos y de mínimo privilegio en cada colección:
- `esAdminInmuebles()` para administración;
- `esGestorDeCartera(propietarioId)` (carteras L/E) para captación;
- `esProfesionalAsignado()` para trabajos, incidencias y sus documentos.

Nunca un `isStaff()` genérico sobre datos personales. Si el producto quiere un profesional «interno», debe existir un campo explícito en la ficha (p. ej. `ambito: 'INTERNO' | 'CONTRATISTA'`) escrito solo por el master.

**Prueba de regresión exigida:**
1. PROFESIONAL con ficha **no** puede `list`/`get`/`delete` `candidatos` ni `solicitudes` de otro ámbito (emulador oficial).
2. GESTOR de cartera A **no** puede leer candidatos de la cartera B.
3. ADMINISTRADOR y master conservan el acceso actual.
4. PROFESIONAL sí conserva `trabajos_profesionales`, `presupuestos_profesionales`, `incidencias` asignadas y `profesionales/{suId}`.

---

## A-01 · P1 · Histórico económico mutable y borrable desde el cliente

**Módulos:** formalización, cobros, gastos · **Perfiles:** propietario, gestor de cartera, master.

**Esperado.** El registro de pagos de un alquiler (importe recibido, fecha, método, justificante) y los gastos deben ser un histórico auditable: una vez registrado un cobro, no debe poder reescribirse ni desaparecer sin traza y sin una operación explícita (anulación/rectificación).

**Observado.**
1. Los cobros **no son documentos**: viven en `contratos_formalizacion.registroCobros[]` (`src/types.ts`, `src/utils/cobrosEngine.ts`).
2. El cliente guarda el contrato completo con `getDoc` + `setDoc(..., { merge: true })` (`src/lib/firebase.ts:1576-1591`); `registrarPagoPeriodo` devuelve un contrato nuevo que se persiste entero (`CobrosSection.tsx:290-303`).
3. Las reglas permiten al titular de la cartera actualizar **cualquier** campo del contrato salvo `inmuebleId`/`propietarioId` (`firestore.rules:1497-1515`), y **borrar** el contrato (`:1516-1519`). Para el gestor con cartera E, igual (`:1500-1506`).
4. `gastos` se actualiza con la misma laxitud (`:1545-1554`) y se puede borrar (`:1555-1557`).
5. `audit_logs` solo es obligatorio en las ramas del master (`auditoriaVinculada`); las escrituras económicas de propietario/gestor **no dejan traza**.

**Evidencia.** Lectura de las reglas y del código citado. No hay ninguna prueba que verifique inmutabilidad de `registroCobros` (búsqueda en `tests/` de `registroCobros` → solo pruebas de UI y de motor).

**Impacto.** Un error de cliente, una importación, un doble clic o un usuario con prisa puede reescribir meses de cobros (importes, fechas, estados) o eliminarlos con el contrato. Afecta a recibos, morosidad, fiscalidad y al paquete del asesor del ejercicio. No hay forma de reconstruir el estado anterior.

**Producción:** no determinado; el defecto es de diseño y está presente en el árbol auditado.

**Corrección recomendada.** Elegir **una** de estas dos (no ambas):
- **(a) Histórico append-only**: extraer los cobros a una colección `cobros_periodos` con `allow create` (una sola vez por periodo) y `allow update` limitado a campos de revisión, más `audit_logs` obligatorio; o
- **(b) Inmutabilidad por versión**: mantener el array pero exigir en la regla que un periodo con `estado` pagado no cambie (`incoming().registroCobros` no puede modificar importes/fechas ya fijados) y exigir `auditoriaVinculada` en cada escritura económica.

Además: impedir el borrado de contratos con cobros (o convertirlo en baja lógica con estado `ARCHIVADO`).

**Pruebas de regresión:** (1) `update` que altera `importeRecibido` de un periodo `RECIBIDO` → denegado; (2) `delete` de contrato con `registroCobros` no vacío → denegado sin master; (3) toda escritura económica genera `audit_logs` verificable.

---

## A-02 · P1 · La actualización de renta no corrige las mensualidades ya generadas

**Módulos:** P4, cobros, avisos día 5, morosidad.

**Esperado.** Tras confirmar una actualización con fecha de efectividad `2026-11-01`, las mensualidades **pendientes** desde esa fecha deben reclamar el nuevo importe; las ya cobradas conservan su histórico.

**Observado.** `generarPeriodosParaContrato` conserva intacto el periodo existente (`src/utils/cobrosEngine.ts:320-331`: `result.push({ ...existing, habitacionId: ... })`) y solo usa `rentaMensual` al **crear** periodos nuevos (`:346-360`). `server/actualizacionRenta/servicioActualizacionRenta.ts` escribe el anexo y el contrato pero **no menciona `registroCobros`** en ningún punto (verificado por `grep`).

Como el motor materializa periodos hasta hoy + 2 meses (`src/App.tsx:1516-1536`), siempre existen periodos futuros ya generados con el importe antiguo en el momento de confirmar.

**Evidencia.** Código citado; la prueba `servicioActualizacionRenta.test.ts` (467 L) verifica el anexo, la idempotencia y la efectividad, pero **no** los periodos de cobro.

**Impacto.** 1–3 meses con importe desactualizado por cada actualización: recibos al inquilino, avisos automáticos y saldos de morosidad incorrectos. Económico directo.

**Producción:** no determinado.

**Corrección recomendada.** En la misma transacción de confirmación de P4, actualizar `importePrevisto` de los periodos `PENDIENTE` con `periodoMesAnio >= fechaEfectiva`, registrando la entrada en `historialCambios`. **No** tocar periodos `RECIBIDO`/`PARCIAL` (decisión P4-B vigente).

**Prueba de regresión:** confirmar P4 con dos periodos pregenerados (uno anterior y uno posterior a la efectividad) → solo cambia el posterior; el anterior conserva importe y estado; existe entrada de historial.

---

## A-03 · P1 · Un snapshot vacío reescribe los candidatos borrados

**Módulo:** candidatos / captación.

**Esperado.** Si un candidato se borra (o si no hay candidatos), la interfaz debe mostrar la lista vacía y no escribir nada.

**Observado.** `src/App.tsx:1318-1328`:

```ts
const unsubscribeCand = subscribeCandidatos(conDatos<Candidato[]>('candidatos', (data) => {
  if (data && data.length > 0) { setCandidatos(data); /* cache */ }
  else {
    setCandidatos((current) => {
      if (current.length > 0) {
        current.forEach((c) => saveCandidatoFirestore(c));   // ← reescritura
        return current;
      }
      return [];
    });
  }
}));
```

`subscribeCandidatos` invoca el callback con `[]` en un snapshot legítimamente vacío (`src/lib/firebase.ts:1017-1046`). El `current` es el estado anterior (los candidatos que había en pantalla). Resultado: **se vuelven a crear** en Firestore los candidatos que se acaban de borrar.

**Evidencia.** Código citado. No hay prueba que cubra el caso «snapshot vacío».

**Impacto.** Integridad y privacidad: un borrado (por ejemplo, una solicitud de supresión de datos) se deshace solo; el dato personal reaparece. Además genera escrituras no solicitadas y posible denegación en bucle para perfiles sin permiso.

**Producción:** no determinado; el comportamiento solo se dispara cuando el snapshot llega vacío (borrar el último candidato o vaciar la colección).

**Corrección recomendada.** Eliminar la rama de reescritura: un snapshot vacío debe ser un estado válido. Si se quería recuperar de un fallo de lectura, usar el canal de diagnóstico (`reportarErrorLectura`), nunca escribir.

**Prueba de regresión:** con snapshot `[]`, `saveCandidatoFirestore` **no** se llama (espía) y la lista queda vacía.

---

## A-04 · P1 · Enlaces públicos sin caducidad ni revocación

**Módulos:** portales de candidatos (visita, cuestionario, documentación).

**Esperado.** El enlace debe caducar, poder revocarse y dejar de servir cuando la invitación se cancela o se rechaza.

**Observado.**
- `exigirToken` solo valida el patrón `^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$` (`server/portalPublico/servicioPortalPublico.ts:100-121`).
- `localizarPorToken` busca por igualdad y devuelve el documento; **no** consulta `expiraEn`, `fechaCaducidad`, `activo` ni `status`.
- `obtenerVisita` no comprueba el estado de la invitación: expone `candidateNombre`, `candidateTelefono`, `candidateEmail`, `inmuebleNombre/precio/ciudad`, `status` y `reserva.direccionCompleta` (`CAMPOS_INVITACION`/`CAMPOS_RESERVA`, `:213-238`).
- `reservarVisita` solo rechaza si `status === 'HORARIO RESERVADO'` o ya hay `reserva` (`:504-513`): una invitación `CANCELADO`, `RECHAZADO`, `CERRADO` o `NO ASISTIO` **puede reservar**.
- No existe endpoint ni acción de revocación de token; la única forma es regenerar el documento.

**Evidencia.** Código citado; `tests/ag02-portales-publicos.test.ts` y `server/portalPublico/servicioPortalPublico.test.ts` cubren token inválido, reserva y conflicto, **no** caducidad ni estado.

**Impacto.** Un enlace reenviado (WhatsApp, correo) mantiene el acceso indefinidamente y expone datos personales del candidato y la dirección completa de la visita. Permite reservas sobre procesos cerrados (confusión operativa y doble reserva comercial).

**Producción:** no determinado (requiere que existan enlaces antiguos vivos, muy probable).

**Corrección recomendada.** Añadir `expiraEn` (ISO) y `revocadoEn` a `invitaciones`, `candidatos.cuestionario*` y `solicitudes_documentacion`; validarlos en el servicio (404/410) y en la emisión de enlaces; comprobar `status` contra una lista de estados vivos al reservar; endpoint de revocación para el gestor.

**Pruebas de regresión:** token caducado → 404 en las 4 superficies; token de invitación `CANCELADO` → reserva 409; revocación inmediata tras `POST /revocar`.

---

## A-05 · P2 · El titular no puede crear profesionales privados

**Módulo:** profesionales, portal del propietario. **Persistencia de AG-07.**

**Observado.** `CrearProfesionalModal.tsx:147` envía `creadoPorPropietarioId: currentUser.id` (id del documento de **usuario**), mientras `firestore.rules:2412` exige `incoming().creadoPorPropietarioId == myPropId()` (id de **propietario**, `usuarios_auth.propietarioId`). En el modelo real son identificadores distintos (`authService.ts:766-767`).

**Impacto.** El alta de un profesional privado por el titular se deniega; la función está inoperativa (sin pérdida de datos). Bloquea total o parcialmente D4.

**Corrección recomendada.** Usar `currentUser.propietarioId` (con `undefined` cuando el perfil no sea titular).

**Prueba de regresión:** harness/emulador con `creadoPorPropietarioId == myPropId()` → permitido; con `usuario.id` → denegado; alta desde la UI como propietario → aparece en su catálogo.

**Nota:** el mismo desajuste aparece en el filtro de UI `ProfesionalesSection.tsx:189` y en `PropietarioPortalSection.tsx:219` (compara contra `currentUser.id` **o** `propietarioId`, este último correcto).

---

## A-06 · P2 · La factura manual no cuenta como documentación fiscal ni entra en el paquete del asesor

**Módulos:** gastos, fiscalidad, P6. **Persistencia de AG-05.**

**Observado.**
- `calcularGastosEjercicio` (`src/utils/fiscalEngine.ts:390`) cuenta «con justificante» solo si existe `g.documento` o `g.documentos[]`. Un gasto con `justificanteUrl`/`justificantePath` (flujo manual) cae en «sin justificante».
- `recopilarDocumentacionFiscal` (`:449`) usa exclusivamente `gasto.documento || gasto.documentos[0]`, y fechas `gasto.fecha` (a menudo ausente en gastos importados, que usan `fechaDevengo`).
- `src/lib/expedienteDocumental/indice.ts:150` **sí** reconoce `justificanteUrl`, lo que demuestra que el dato existe y que hay dos criterios distintos en el mismo producto.

**Impacto.** Contadores fiscales incorrectos (gastos documentados aparecen como no documentados), ZIP del asesor sin esas facturas, y decisiones de deducibilidad tomadas sobre información incompleta. No se ha observado que la deducibilidad se infiera del documento (el campo `deducible` se decide por categoría/regla en `gastosEngine`).

**Corrección recomendada.** Un selector canónico único del documento del gasto (usado por fiscalidad, índice documental y P6) que reconozca `documento`, `documentos[]`, `justificanteUrl` y `justificantePath`, y que declare en el ZIP si la referencia está custodiada o no.

**Prueba de regresión:** gasto manual con `justificanteUrl` → cuenta como documentado en fiscalidad y aparece en el índice del paquete como «referencia no custodiada».

---

## A-07 · P2 · `passwordHash` sin sal persistido y rama de login directo

**Módulo:** identidad. **Persistencia de AG-08.**

**Observado.** `hashPassword` (`authService.ts:125-140`) es SHA-256 sin sal, con *fallback* a un hash de 32 bits si `crypto.subtle` no está disponible. Se persiste en `usuarios/{id}` en tres rutas (`:362`, `:483`, `:774`). Además, si Firebase Auth responde `operation-not-allowed`, `loginWithEmail` (`:303-336`) lee `usuarios` **sin sesión** y compara el hash en el cliente.

**Estado real de esa rama:** con las reglas actuales, una lectura sin sesión de `usuarios` se deniega (la propia función lo reconoce y traduce a `MENSAJE_LOGIN_SIN_PERMISOS`). Es decir, la rama es **código muerto en la práctica**, pero el material sensible sigue en reposo y el riesgo latente permanece si alguien habilita una lectura.

**Impacto.** Duplicación innecesaria de un secreto derivado de la contraseña del usuario (minimización de datos, art. 5 RGPD), superficie de *offline cracking* si se filtra la colección, y confusión sobre cuál es la fuente de autenticación.

**Corrección recomendada.** Dejar de escribir `passwordHash`, eliminar la rama de login directo y purgar el campo de los documentos existentes (script de migración con auditoría, fuera del alcance de esta auditoría).

**Prueba de regresión:** `grep passwordHash` en `src/` sin resultados; login solo por Firebase Auth; documento `usuarios` sin el campo.

---

## A-08 · P2 · Suscripciones de captación sin ámbito

**Módulos:** captación, portal del propietario, dashboard.

**Observado.** `src/App.tsx:1318` (`subscribeCandidatos`) y `:1340` (`subscribeSolicitudes`) se invocan **sin** `DataAccessScope`, a diferencia de inmuebles, propietarios, contratos y gastos. Las reglas exigen consulta demostrable: `solicitudes.list` solo `isStaff()` (`firestore.rules:2085`) y `candidatos.list` con `where('propietarioId','==', myPropId())` para el titular (`:2054-2056`). Una consulta sin filtro **no es demostrable** → denegada.

**Impacto.** Para propietario y gestor la captación llega vacía y el panel muestra 0 candidatos (`DashboardEjecutivoSection.tsx:329-331`), aunque su cartera tenga candidatos. No hay mensaje de error visible: `reportarErrorLectura` solo deja traza. (Para el ADMIN funciona, y A-20 hace que el profesional vea de más: los dos defectos conviven.)

**Corrección recomendada.** Usar `subscribeColeccionPorAmbito` con `dataScope` (o suscripción por propietarioId) y mostrar el estado de error cuando la consulta se deniega.

**Prueba de regresión:** propietario con candidatos en su cartera ve exactamente los suyos; gestor ve los de sus carteras; la consulta incluye el filtro de igualdad.

---

## A-09 · P2 · Siembra de datos demo en el arranque

**Observado.** `App.tsx:1277-1279` llama `seedInitialDataIfEmpty()` solo cuando el perfil autenticado es `ADMINISTRADOR`. Si `usuarios` está vacía, crea tres usuarios (`user_admin_principal`, `user_propietario_demo` con `propietarioId: prop_demo_1`, `user_profesional_demo`) y siembra aseguradoras, especialidades y profesionales demo (`src/lib/firebase.ts:197-222, 3421-3520`).

**Impacto.** En un proyecto nuevo (o tras un borrado) aparecen fichas «ACTIVO» ficticias en el censo, métricas y catálogos. No permiten iniciar sesión (no tienen cuenta de Auth), pero contaminan datos y pueden confundir la asignación de profesionales.

**Corrección recomendada.** Sembrar solo catálogos (aseguradoras, especialidades) y nunca usuarios; o exigir `NODE_ENV !== 'production'` (hoy el único guardián es el perfil ADMINISTRADOR).

**Prueba de regresión:** con `usuarios` vacía y entorno de producción, no se crea ningún usuario.

---

## A-10 · P2 · Guardas obsoletas y CI incompleto

**Observado.**
- `npm run test:integracion` → **302 pruebas, 299 correctas, 3 fallidas**: `servicios/modelos heredados y entrypoints conservan el checkout f782` (113), `custodia byte a byte de la base patrimonial de B` (119), `diff local desde el checkout f782 permite solo la superficie documentada` (120). Son guardas que fijan el estado de un checkout antiguo.
- `.github/workflows/emulador-reglas.yml:5-13` se dispara en `pull_request`, en dos ramas `arena/b18a36de…` y `arena/8ed3381d…` (sesiones ya cerradas) y por `workflow_dispatch`; **no** en `push` a `main`.

**Impacto.** La señal de CI no cubre `main`; la suite de integración falla de forma permanente, lo que normaliza el rojo y oculta regresiones nuevas.

**Corrección recomendada.** Retirar o re-basar las tres guardas; disparar el workflow en `push: branches: [main]`; eliminar las ramas caducadas.

**Prueba de regresión:** `test:integracion` 302/302 en verde; workflow ejecutado en el merge a `main`.

---

## A-11 · P2 · Dependencias vulnerables

**Observado.** `npm audit --omit=dev` → **8 vulnerabilidades (7 altas, 1 baja)**:
- `nodemailer` (5 avisos, entre ellos *«Process-global DNS cache reuses TLS servername … cross-tenant SMTP credential disclosure»* y *«Quadratic backtracking … DoS»*);
- `source-map-js` (DoS por *offsets* de secciones);
- `vite` (3 avisos de `launch-editor`, afectan a desarrollo/Windows).

**Impacto.** El canal de correo es crítico para los avisos a inquilinos y propietarios; una divulgación de credenciales SMTP entre transportes afectaría a la identidad del despacho.

**Corrección recomendada:** actualizar `nodemailer` (la corrección disponible es un cambio mayor: 10.1.7) y `source-map-js`/`vite` en una ventana controlada. **No se ha modificado ninguna dependencia** (prohibido en esta fase).

**Prueba de regresión:** `npm audit --omit=dev` sin vulnerabilidades altas + suite completa en verde + prueba SMTP aislada.

---

## A-12 · P2 · Guardado sin control de concurrencia

**Observado.** Contratos y gastos se guardan con `getDoc` seguido de `setDoc(..., {merge:true})` sin transacción ni precondición de versión (`src/lib/firebase.ts:1576-1591, 1879-1895`). Existen transacciones correctas en otros flujos (`persistirTransicionAlquilerFirestore`, `bookSlotTransaction`), lo que demuestra que el patrón está disponible y no se usa aquí.

**Impacto.** Dos pestañas —o dos usuarios de la misma cartera— que editen el mismo contrato producen *last-write-wins*: se pierde la edición anterior sin aviso. En `registroCobros` esto puede borrar un pago recién registrado.

**Corrección recomendada.** `runTransaction` con `updateTime` esperado (o `mergeFields` acotados) para escrituras económicas, y aviso de conflicto al usuario.

**Prueba de regresión:** dos actualizaciones concurrentes sobre el mismo contrato → la segunda recibe conflicto y no sobrescribe.

---

## A-13 · P2 · Altas anónimas sin campos cerrados y sin límite de tasa

**Observado.**
- `solicitudes.create` exige `hasAll(['nombre','email','telefono','inmuebleId','estado'])` pero **no** `hasOnly` (`firestore.rules:2085-2088`); `candidatos.create` igual (`:2057-2064`). Cualquiera puede añadir campos arbitrarios (`propietarioId`, `estado` avanzado, `cuestionarioToken`, importes, `solvencia*`).
- Las rutas públicas `/api/visita|cuestionario|documentacion` no tienen limitador; el único limitador del servidor está en la prueba SMTP (`server/notificaciones/rutaPruebaSmtp.ts:261`).

**Impacto.** Contaminación de datos (un candidato puede autoasignarse estados o campos que el gestor interpretará como decisiones), y abuso (creación masiva de solicitudes/candidatos, coste de escritura y ruido operativo).

**Corrección recomendada.** `hasOnly` con la lista blanca del formulario público; forzar `estado` a un valor inicial en la regla; limitador por IP/token en las rutas públicas.

**Prueba de regresión:** alta anónima con campo extra → denegada; 30 peticiones/minuto al portal → 429.

---

## A-14 · P3 · Mensajes de error internos al cliente

`server.ts:2827-2830` devuelve `motivoDenegacion: err.message` en el 500 de `/api/notificaciones/enviar`. Puede filtrar detalles de implementación. **Corrección:** mensaje genérico + identificador de correlación. **Prueba:** inyectar un error y comprobar que la respuesta no contiene el texto interno.

## A-15 · P3 · Chunk principal de 5,5 MB

`npm run build` → `dist/assets/index-H4qN41CQ.js` 5.545 kB (1.380 kB gzip); solo OCR y PDF se separan (`vite.config.ts:11-16`). Impacto en el arranque en móvil. **Corrección:** *lazy* por sección. **Prueba:** medición de LCP en aceptación.

## A-16 · P3 · Gobernanza documental contradictoria

94 documentos en `docs/`, con informes de cierre que declaran «completo» funciones hoy parciales (p. ej. el informe del 20-10 da por correctas P2/P3 con una topología de Storage que ya cambió en AG-03.2). Riesgo de que una auditoría futura tome una decisión antigua como estado actual. **Corrección:** índice de documentos vigentes y marca de «histórico» en los superados.

## A-17 · P3 · Caché local como estado inicial

`App.tsx:392-450` inicializa propietarios, inmuebles, contratos y candidatos desde `localStorage` y los muestra antes del snapshot, sin indicación de antigüedad. Si el snapshot falla, la pantalla miente por omisión. **Corrección:** marcar datos «en caché» y fecha.

## A-18 · P3 · App Check/reCAPTCHA no configurado

`firebase-applet-config.json` tiene `recaptchaSiteKey: ""` y `measurementId: ""`. La `apiKey` es pública por diseño (Firebase web) y no es un secreto, pero sin App Check las APIs de Firebase quedan expuestas a abuso desde fuera de la app.

## A-19 · P3 · Sin `README`

No existe `README.md` en la raíz. La puesta en marcha depende de `.env.example` (correcto y muy detallado) y de 94 documentos. **Corrección:** README con arranque, variables y enlaces a la documentación vigente.
