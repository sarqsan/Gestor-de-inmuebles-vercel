# FASE 1 — VALIDACIÓN DE HALLAZGOS Y PLAN DE RECUPERACIÓN

**Proyecto:** Gestión de Inmuebles / ERP Patrimonial
**Rama:** `arena/77999d3b-gestor-de-inmuebles-vercel` · commit base `2bed683`
**Fecha:** 15-11-2026
**Documento base:** `docs/auditoria/AUDITORIA-360-2026-11-15.md`
**Modo:** SOLO PLANIFICACIÓN. **No se ha modificado ningún archivo de código, regla, configuración ni dato.** El único artefacto es este documento.

---

## 0. Advertencia previa: dos hallazgos de la Fase 0 deben corregirse

Al re-verificar el código para este plan, **dos conclusiones de mi propia auditoría no se sostienen**. Las corrijo aquí antes de planificar, porque construir el plan sobre ellas habría producido trabajo inútil y una decisión de seguridad equivocada.

| Hallazgo Fase 0 | Estado real tras re-verificación | Impacto |
|---|---|---|
| **A-02** “El profesional puede auto-crear órdenes de trabajo” (ALTO, ERROR) | **REFUTADO como vulnerabilidad.** La UI ofrece el botón, pero **las reglas lo bloquean**. Es un defecto de interfaz, no de seguridad | Baja de **ALTO → MEDIO**. No requiere cambio de reglas; requiere retirar el botón |
| **A-01** “El portal del profesional no puede aportar presupuestos, facturas ni fotos” | **CONFIRMADO**, pero **sobredimensionado**: la colección `presupuestos_profesionales` ya admite escritura del profesional, y el servidor documental **ya autoriza al profesional asignado** a subir evidencias | El coste de corrección es **menor** de lo estimado. Se recalibra abajo |

**Por qué ocurrió:** en la Fase 0 clasifiqué A-02 por inspección de la UI (existencia del botón) sin completar la traza hasta el predicado de la regla. Es exactamente el error que el §O de la Fase 0 advierte (“no marcar funcionando solo porque exista el componente”), aplicado al revés. Queda registrado como lección de método: **para una incidencia de seguridad no basta la UI; hay que resolver el predicado completo.**

---

## 1. VALIDACIÓN INDIVIDUAL DE INCIDENCIAS

### 1.1 A-02 — Auto-creación de órdenes de trabajo · **REFUTADA (como riesgo de seguridad)**

**Traza completa del predicado:**

```
Regla  firestore.rules:1765
       match /trabajos_profesionales/{trabajoId}
         allow create: if isMasterAdmin() || aisladoCreateOk();

Def.   firestore.rules:386-390
       function aisladoCreateOk() {
         return isPropietarioRole()                    ← condición de rol
           && 'propietarioId' in incoming()
           && incoming().propietarioId == myPropId()
           && 'inmuebleId' in incoming() && incoming().inmuebleId is string;
       }

Def.   firestore.rules:170-172
       function isPropietarioRole() {
         return activeUser() && me().tipoPerfil == 'PROPIETARIO';
       }
```

- `isProfesionalRole()` exige `tipoPerfil == 'PROFESIONAL'` (línea 174-176); `isPropietarioRole()` exige `'PROPIETARIO'`. **Son mutuamente excluyentes**: un usuario PROFESIONAL **no** satisface `aisladoCreateOk()`.
- No existe ninguna otra rama `create` para esta colección (verificado: una sola aparición de `allow create` en el bloque 1759-1785).
- Para PROFESIONAL la única operación de escritura admitida es **`update` sobre un trabajo ya existente con `profesionalId == myProfId()`**, y solo si **no altera** `propietarioId` ni `inmuebleId`.

**Conclusión:** la escritura **falla y se propaga**. `saveTrabajoProfesionalFirestore` (`src/lib/firebase.ts:3765-3769`) captura, reporta y **`throw err`**; `TrabajoProfesionalModal.tsx:350` captura y muestra `mensajeDeErrorUsuario`. **No hay falso éxito.**

| Campo | Valor |
|---|---|
| ¿Confirmada? | **NO.** Refutada como vulnerabilidad |
| Clasificación corregida | **MEDIO** — defecto de UI (botón que promete una acción imposible) |
| Afecta a | PROFESIONAL (frustración funcional) · seguridad **no afectada** |
| Archivos implicados | `src/components/sections/ProfesionalPortalSection.tsx:1054-1065` (botón + texto de pantalla vacía) |
| Consecuencias reales | El profesional pulsa, rellena un formulario completo y recibe un error de permisos. Confusión y pérdida de tiempo |
| Solución | **No tocar reglas.** Ocultar el botón y el texto “Crea una orden de trabajo” para `tipoPerfil === 'PROFESIONAL'`; sustituir el mensaje de vacío por “Aún no tienes encargos asignados” |
| Dependencias | Ninguna |
| Cómo se comprueba | Prueba de componente: el botón no se renderiza con perfil PROFESIONAL. Prueba de motor de reglas: `assertFails(profesional.setDoc(trabajo))` |

> **No debe figurar en el plan como corrección de seguridad.** Entra como ajuste de UX de bajo coste.

---

### 1.2 A-01 — Limitaciones del portal del profesional · **CONFIRMADA (recalibrada)**

**Qué existe realmente (verificado uno a uno):**

| Capacidad | Estado real | Evidencia |
|---|---|---|
| Ver encargos/incidencias asignadas | **SÍ** | `subscribeTrabajosProfesionales` con `scope.profesionalId` |
| Cambiar estado del trabajo | **SÍ** | `handleCambiarEstadoTrabajo` + propagación a incidencia + historial |
| **Crear presupuesto** | **SÍ en datos, NO en UI** | Regla `firestore.rules:1795`: `allow create … \|\| (isProfesionalRole() && 'profesionalId' in incoming() && incoming().profesionalId == myProfId())`. El modelo `PresupuestoProfesional` existe completo (partidas, IVA, versiones, ajustes). **Falta la pantalla** |
| **Subir fotos de la intervención** | **SÍ en servidor, NO en UI** | `autorizacionDocumental.ts:739,746`: destino `INCIDENCIA_EVIDENCIA` ya admite `profesionalAsignadoA(incidenciaId)`. **Falta el control de subida** |
| Adjuntar factura del trabajo | **PARCIAL** | No hay destino documental para “factura de trabajo” (`trabajos/` está explícitamente denegado, línea 196). Las facturas se registran como `gastos` con `gastos_facturas/…`, que exige `propietarioId` |
| Comunicación con el propietario | **NO** | No hay hilo; `mensajes_portal` es inquilino↔gestión |
| Aceptar / rechazar encargo explícitamente | **PARCIAL** | Existe `PENDIENTE_ACEPTACION` en el modelo; el portal solo transita estados del trabajo, sin un acto explícito de aceptación/rechazo con motivo |

**Recalibración del coste:** lo que falta es mayoritariamente **UI sobre estructuras ya autorizadas**. Eso reduce el riesgo (no hay que abrir permisos) y el plazo.

| Campo | Valor |
|---|---|
| ¿Confirmada? | **SÍ** (confirmada y precisada) |
| Clasificación | **ALTO** (se mantiene: rompe un requisito central del §3.C) |
| Afecta a | PROFESIONAL (primario), PROPIETARIO (no recibe presupuesto desde el portal) |
| Archivos | `ProfesionalPortalSection.tsx` (1.126 líneas), `PresupuestoProfesionalModal.tsx`, `DetalleTrabajoProfesionalModal.tsx`, `src/lib/firebase.ts`, `src/lib/expedienteDocumental/*`, reutilizable: `ProfesionalesSection.tsx` (huérfano, 1.240 líneas) |
| Servicios | `server/documentos/*` (ya autoriza), `subscribePresupuestos`, `savePresupuestoProfesionalFirestore` |
| Colecciones | `presupuestos_profesionales`, `trabajos_profesionales`, `incidencias`, `mensajes_portal` (nueva variante) |
| Dependencia crítica | **A-03** (hay que poder certificar las reglas antes de ampliar superficies) |
| Cómo se comprueba | E2E por rol + pruebas de motor de reglas con profesional asignado y **con profesional no asignado (debe fallar)** |

---

### 1.3 A-03 — Reglas no verificadas ejecutablemente · **CONFIRMADA y AGRAVADA**

La Fase 0 decía “no re-verificadas”. Al medirlo, el problema es mayor: **la cobertura del motor de reglas es mínima**.

| Medición | Valor |
|---|---|
| Colecciones con bloque de regla propio | **80** |
| Colecciones ejercitadas por los tests de emulador | **4** (`inmuebles`, `usuarios`, `usuarios_auth`, `candidatos`) |
| Cobertura de la superficie de reglas | **≈ 5 %** |
| Archivos de test de emulador | 11, de los que 5 son de reglas de Firestore y 1 de Storage |
| ¿Se ha ejecutado alguna vez en esta rama? | **Sin evidencia.** El propio test de Storage declara “pendiente de ejecución” |
| Requisito de ejecución | JRE 21 + `firebase-tools` (no disponible en el entorno de auditoría) |

**Consecuencias:** 76 colecciones —incluidas las económicas (`gastos`, `cobros`, `liquidaciones_propietarios`, `mandatos_sepa`, `facturas`), las de morosidad y las de actas— **no tienen prueba de motor**. La garantía actual es de inspección humana, que es respetable pero no certificable.

| Campo | Valor |
|---|---|
| ¿Confirmada? | **SÍ**, y agravada por la medición de cobertura |
| Clasificación | **ALTO** (proceso), **CRÍTICO potencial** por impacto (ver CP-01) |
| Afecta a | Todos los portales |
| Solución | Matriz de reglas por colección y por rol; job **obligatorio** en CI; ejecución previa a cualquier publicación de reglas |
| Dependencias | Entorno con JRE; actualmente `push.branches` del workflow excluye `main` |
| Cómo se comprueba | `npm run test:emulador:reglas` en verde y **cobertura declarada ≥ 80 colecciones con casos positivos y negativos por rol** |

---

### 1.4 A-04 — Ausencia de backup y restauración · **CONFIRMADA**

Búsqueda exhaustiva: no existe ningún script, comando ni documentación de backup/restore en `scripts/`, `server/` ni `package.json`. Los scripts de exportación encontrados (`importExport/`, `datos`) exportan **entidades de negocio a JSON/CSV**, no el estado transaccional de Firestore + Storage.

Complicación técnica específica de este proyecto: Firestore usa una **base de datos con nombre** (`ai-studio-gestordeinmueble-…`), no `(default)`. Cualquier export/import gestionado exige `--database=<id>` explícito; omitirlo respaldaría **una base vacía** y daría un falso verde. Además, **Storage no está cubierto** por el backup gestionado de Firestore y requiere copia aparte.

| Campo | Valor |
|---|---|
| ¿Confirmada? | **SÍ** |
| Clasificación | **ALTO** (riesgo operativo) → **tratada como prioridad 0** junto a A-03 |
| Afecta a | Todos |
| Cómo se comprueba | Restauración real en proyecto aislado con verificación de integridad documento↔archivo (§E) |

---

### 1.5 A-05 — Ausencia de notificaciones al inquilino · **CONFIRMADA**

| Comprobación | Resultado |
|---|---|
| ¿Bandeja de avisos en el portal del inquilino? | **No.** Las 9 pantallas son inicio, contrato, recibos, incidencias, suministros, mensajes, documentos, historial, cuenta |
| ¿Puede el inquilino listar `notificaciones`? | **No**, por diseño explícito: `allow list: if isStaff() \|\| (isPropietarioRole() && …)` (`firestore.rules:2630`) |
| ¿Existe el canal para soportarlo? | **Sí.** `CanalInApp` ya persiste en el repositorio y devuelve `ok` |
| ¿Se entrega el aviso por correo? | **No.** `modoEmail: MODO_SEGURO` (verificado en vivo en `/api/health`) |

**Consecuencia neta:** el inquilino **no recibe aviso por ningún canal**. El dato se propaga en Firestore, la persona no se entera.

| Campo | Valor |
|---|---|
| ¿Confirmada? | **SÍ** |
| Clasificación | **ALTO** |
| Archivos | `InquilinoPortalShell.tsx`, nuevo componente de bandeja, `firestore.rules:2614-2640`, `server/notificaciones/*` |
| Colecciones | `notificaciones` (+ posible `notificaciones_inquilino` si se opta por separar) |
| Solución | Añadir pestaña de avisos al inquilino + ampliar `allow list` a `isTenant()` acotado a sus contratos + configurar proveedor de correo real |
| Dependencias | **A-03** (toda ampliación de reglas exige motor de pruebas) |
| Cómo se comprueba | Motor de reglas: inquilino A no ve avisos de B. E2E: incidencia se abre → aviso visible en portal del inquilino |

---

### 1.6 CP-01 — Reglas sin verificación ejecutable · **CONFIRMADA como hueco de proceso**

No es una vulnerabilidad demostrada; es **la imposibilidad de demostrar que no la hay**. Se sostiene en A-03. **No se declara crítica** porque no hay evidencia de fallo: se declara **riesgo crítico no acotado**.

### 1.7 CP-02 — Poder absoluto del master · **RECLASIFICADA: no es un defecto, es el ancla de confianza**

La Fase 0 la presentó como “riesgo crítico potencial”. Al revisar los predicados:

- El master accede por **email verificado por Firebase** (`isMasterAdmin()`), no por un claim manipulable.
- Sus escrituras en `usuarios_auth` exigen `auditoriaVinculada`: **un evento nuevo de `audit_logs` en el mismo commit**, con `usuarioEmail`, `actorUid` y `rutas` coincidentes. No puede escribir en silencio.
- `allow delete: if false` — **ni el master puede borrar un binding**.

Es decir: el diseño **ya mitiga** el abuso y deja rastro inmutable. Lo que **no** existe es protección de **la cuenta en sí**. El riesgo real es “compromiso de credenciales del master”, no “regla laxa”.

| Campo | Valor |
|---|---|
| ¿Vulnerabilidad? | **NO** |
| Clasificación | **RIESGO OPERATIVO ALTO** (no incidencia de código) |
| Mitigación | MFA en Firebase Auth para la cuenta master; alertas sobre `audit_logs` de acciones master; documento de *break-glass* |
| No requiere | Cambios en `firestore.rules` |

---

## 2. REVISIÓN DE SEGURIDAD — qué pruebas certifican cada ámbito

Estado por inspección de cada ámbito del §2 del encargo, con la prueba que lo certificaría.

| Ámbito | Diseño actual | ¿Certificado hoy? | Prueba necesaria |
|---|---|---|---|
| **Propietario ↔ propietario** | `inmuebleEsMio`, `aisladoEsMio`, `myPropId()`, consultas por igualdad demostrable | **Parcial** (1 de sus colecciones probada) | Motor: A no lee `get`/`list` de B en inmuebles, contratos, gastos, cobros, incidencias, pólizas, actas |
| **Inquilino ↔ inquilino** | `contratoIds` acotado 1–5, `get` por documento, `list` denegado | **No** | Motor: inquilino A no accede a contrato/inmueble/recibo/mensaje de B; `list` denegado siempre |
| **Inquilino → datos internos** | Whitelist de campos en vistas saneadas | **No** | Motor: inquilino no lee `gastos`, `morosidad`, `presupuestos`, `usuarios` ajenos |
| **Profesional ↔ profesional** | `profesionalId == myProfId()` en trabajos/presupuestos; `profesionalAsignadoId` en incidencias | **No** | Motor: profesional B no lee trabajo/presupuesto/evidencia de A |
| **Profesional → inmuebles/contratos ajenos** | `inmuebleAutorizadoExplicito`, `inmuebleIdsAsignados` | **No** | Motor: profesional no lee `contratos_formalizacion`, `propietarios`, `usuarios` del inquilino |
| **Profesional → escritura de trabajo ajeno** | `update` con triple igualdad + `profesionalId == myProfId()` | **No** | Motor: `update` sobre trabajo de otro → `assertFails` |
| **Profesional → crear trabajo** | `aisladoCreateOk()` exige PROPIETARIO | **No ejecutado**, pero **resuelto por inspección** (§1.1) | Motor: `assertFails` (ratificación) |
| **Entre aplicaciones** | **No existe el concepto** | n/a | No aplicable: una sola aplicación. Ver §D.6 |
| **Documentos privados** | Storage denegado al cliente; autorización en servidor por destino | **Sí, por inspección** + pruebas de servidor | Motor Storage: todo prefijo privado `assertFails` desde SDK; servidor: matriz destino×rol |
| **Autenticación** | RS256 + `aud`/`iss`/`exp` + fallo cerrado | Verificado en vivo (rechazos 503/403) | Prueba de token manipulado, expirado, `alg:none`, `aud` ajeno |
| **Autorización servidor** | `resolverAutorizacion` derivando perfil de Firestore, nunca del cliente | Verificado en vivo | Prueba: `propietarioId` en body **ignorado**; se usa el del token |
| **Anti-autoasignación de carteras** | `carterasNoAutoasignadasEnCreacion`, `carterasSinCambiarPorUsuario` | **No** | Motor: usuario intenta escribir `carterasL/E` propias → `assertFails` |
| **Auditoría obligatoria** | `auditoriaVinculada` en escrituras master | **No** | Motor: escritura privilegiada sin evento → `assertFails`; evento de otro actor → `assertFails` |

**Regla de trabajo para este plan:** *ninguna ampliación de permisos se autoriza hasta que la colección afectada tenga su caso negativo en el motor de reglas.* No se debilita ninguna regla para facilitar pruebas: las pruebas se ejecutan en emulador aislado (`demo-gestor-reglas`) y, para datos reales, **jamás** contra producción.

**Nota sobre separación entre aplicaciones (§2 y §F.6 de la Fase 0):** no es una regresión ni una omisión de implementación pendiente: es una funcionalidad **no prevista por el producto actual**. Introducirla es una decisión de arquitectura con coste alto (§D.6), no una corrección. Se aísla en una fase propia y **no bloquea** el resto del plan.

---

## 3. DISEÑO DEL CIRCUITO DE PROFESIONALES

Los estados ya existen en `types.ts` (`EstadoTrabajoProfesional`, 18 valores; `EstadoIncidencia`, 12; `EstadoPresupuestoProfesional`). **No hay que inventar el modelo: hay que cablear el flujo.** Se propone normalizar los alias (`ASIGNADA`/`ASIGNADO`, `EN_CURSO`/`EN_EJECUCION`, `FINALIZADA`/`FINALIZADO`) como deuda menor.

| # | Paso del encargo | ¿Existe? | Componente / regla | Qué falta |
|---|---|---|---|---|
| 1 | Inquilino comunica incidencia | **SÍ** | `PortalIncidencias` → `incidencias.create` (tenant) | — |
| 2 | Propietario recibe la incidencia | **SÍ (dato)** / **NO (aviso)** | `IncidenciasSection` + dispatcher | Aviso real (A-05) |
| 3 | Propietario revisa y **autoriza** el trabajo | **PARCIAL** | Estado `EN_VALORACION`→`ASIGNADA` | Acto explícito de autorización registrado (actor + fecha) |
| 4 | Asigna profesional | **SÍ** | `profesionalAsignadoId` | — |
| 5 | Profesional recibe el encargo | **SÍ (dato)** / **NO (aviso)** | Suscripción por `profesionalId` | Aviso al profesional |
| 6 | Profesional **acepta o rechaza** | **NO explícito** | `PENDIENTE_ACEPTACION` existe sin UI de acto | Botones Aceptar/Rechazar **con motivo obligatorio** al rechazar |
| 7 | Aporta presupuesto | **NO en UI** (regla SÍ) | `presupuestos_profesionales` | Pantalla de alta (reutilizar `PresupuestoProfesionalModal`) |
| 8 | Propietario aprueba/rechaza presupuesto | **SÍ** | `DetallePresupuestoProfesionalModal` (en gestión) | Visible también en portal del propietario |
| 9 | Documenta con fotografías | **NO en UI** (servidor SÍ) | `INCIDENCIA_EVIDENCIA` ya autoriza al asignado | Control de subida (`<input type=file>` + cliente de custodia) |
| 10 | Registra su intervención | **SÍ** | `crearItemHistorialTrabajo` | — |
| 11 | Adjunta factura | **PARCIAL** | Solo vía `gastos` | Destino documental propio para factura de trabajo, o vincular a gasto con `gastosId` |
| 12 | Propietario revisa y **cierra** | **SÍ** | Estado `FINALIZADO` + valoración | Cierre con conformidad explícita |
| 13 | Inquilino consulta estado autorizado | **SÍ** | `EvolucionIncidenciaPortal` con vistas saneadas | Verificar que no expone importes internos ni presupuestos |

**Resumen:** existen **6 de 13** pasos; **4 son parciales**; **3 no existen** (6, 7, 9). El circuito se cierra con **UI + avisos**, no reescribiendo el modelo.

**Principio de diseño que debe respetarse:** el profesional **nunca** ve importes de otros presupuestos, ni la ficha del inquilino, ni el expediente documental del inmueble. Solo: datos del trabajo, del inmueble necesarios para ejecutarlo, y sus propias evidencias y presupuestos.

---

## 4. SISTEMA DE BACKUP Y RESTAURACIÓN

### 4.1 Activos a proteger y su criticidad

| Activo | Colección / ruta | Criticidad | Reemplazable |
|---|---|---|---|
| Inmuebles y titularidades | `inmuebles`, `titularidades`, `personas`, `propietarios` | **Máxima** | No |
| Contratos y documentación contractual | `contratos_formalizacion`, `contratos/{id}/…` | **Máxima** | No |
| Económico | `gastos`, `cobros` (en contrato), `liquidaciones_propietarios`, `facturas`, `mandatos_sepa`, `ordenes_pago` | **Alta** | No |
| Justificantes y facturas (binarios) | `gastos_facturas/`, `cobros_justificantes/`, `recibos/` | **Alta** | **Irrecuperable** (documento original) |
| Incidencias y evidencias | `incidencias`, `incidencias/`, `incidencias_fotos/` | Alta | **Irrecuperable** (prueba del estado del inmueble) |
| Actas | `actas`, `actas_*/**` | Alta (valor probatorio) | No |
| Configuración e identidad | `usuarios`, `usuarios_auth`, `gestiones_cartera`, `enlaces_registro` | **Máxima** (sin ella no hay acceso) | No |
| Auditoría | `audit_logs` | Alta | No (inmutable) |
| **Relaciones registro ↔ archivo** | metadatos P3/P5 + rutas de Storage | **Máxima** | **Solo si ambos lados son coherentes** |

> **El riesgo real no es “perder los datos”, es perder la coherencia.** Un Firestore restaurado con Storage desfasado (o al revés) deja documentos sin binario o binarios huérfanos: el expediente deja de ser válido. El plan trata ambos lados como **una sola unidad de recuperación**.

### 4.2 Diseño propuesto

| Dimensión | Decisión propuesta |
|---|---|
| **Mecanismo Firestore** | Export/import gestionado de Firestore (`firestore export` a bucket), **con `--database=<id>` obligatorio** por ser base con nombre |
| **Mecanismo Storage** | Copia de objetos a bucket de respaldo (`storage copy`/`rsync`), conservando rutas exactas |
| **Coherencia** | Ambos respaldos etiquetados con el **mismo `snapshotId`** (timestamp + versión de esquema). Un restore exige el par completo |
| **Frecuencia** | **Diaria** incremental-completa Firestore + diaria Storage; **semanal** retención larga |
| **Retención** | 7 diarios · 4 semanales · 12 mensuales · 1 anual (objetivo: cubrir ≥ 5 años de histórico patrimonial) |
| **RPO** | 24 h (a mejorar a 1 h si se encarece la operación) |
| **RTO** | ≤ 4 h para Firestore + ≤ 8 h para Storage |
| **Integridad** | Manifiesto por snapshot: nº de documentos por colección + hash SHA-256 de cada objeto + **verificación de que todo `storagePath` referenciado existe** y viceversa |
| **Cifrado** | Cifrado nativo del bucket + *Object Versioning* (protege ante borrado accidental) |
| **Quién ejecuta** | Cuenta de servicio **solo-backup**, distinta de la de la aplicación (mínimo privilegio) |
| **Verificación periódica** | **Restore real mensual en proyecto aislado** (`gestor-inmuebles-restore-test`), con checklist automática. Un backup no verificado **no cuenta como backup** |

### 4.3 Prueba de restauración sin riesgo para datos reales

```
1. Nuevo proyecto Firebase aislado (o base nueva en el de pruebas). NUNCA producción.
2. Importar snapshot N de Firestore con --database=<id>.
3. Copiar snapshot N de Storage al bucket del proyecto de prueba.
4. Verificación automática:
   a. recuento de documentos por colección == manifiesto del snapshot
   b. todo storagePath referenciado existe en el bucket
   c. todo objeto del bucket tiene referencia en Firestore (o se justifica)
   d. login de un usuario de prueba y apertura de un expediente documental
5. Registrar resultado (fecha, snapshot, OK/KO, incidencias) en un registro append-only.
6. Destruir el proyecto de prueba.
```

**Criterio de aceptación:** **dos restauraciones consecutivas exitosas** con verificación a/b/c/d al 100 %, y restore cronometrado por debajo del RTO.

### 4.4 Riesgos del propio plan de backup

| Riesgo | Mitigación |
|---|---|
| Exportar `(default)` por error y creer que hay backup | El script **falla** si no recibe el id de base; prueba que verifica que el export contiene colecciones conocidas |
| Storage desfasado respecto a Firestore | `snapshotId` compartido y restore en pareja obligatoria |
| Coste de almacenamiento | Retención escalonada + bucket de clase fría a partir de 90 días |
| Credencial de backup con demasiado poder | Cuenta de servicio dedicada, solo lectura de producción y escritura en bucket de backup |

---

## 5. MAPA DE DEPENDENCIAS

```
                        ┌─────────────────────────────────┐
                        │ P0 · A-03 Cobertura de reglas   │  ← BLOQUEANTE GLOBAL
                        │ (JRE + matriz 80 colecciones)   │
                        └───────────────┬─────────────────┘
                                        │ habilita publicar/cambiar reglas con garantía
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
┌───────────────┐             ┌──────────────────┐            ┌──────────────────┐
│ P0 · A-04     │             │ P1 · A-01        │            │ P2 · A-05        │
│ Backup+restore│             │ Portal profesional│            │ Avisos inquilino │
│ (independiente│             │ presupuesto/fotos │            │ (regla list +    │
│  de reglas)   │             │ /factura/acepta   │            │  bandeja + email)│
└───────┬───────┘             └────────┬─────────┘            └────────┬─────────┘
        │                              │                               │
        │ protege TODO                 │ depende de:                   │ depende de:
        │ (previo a cualquier cambio   │ · presupuestos_profesionales  │ · A-03
        │  en producción)              │ · INCIDENCIA_EVIDENCIA (ya ok)│ · proveedor correo
        │                              │ · mensajería (nueva)          │
        ▼                              ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ P3 · Deuda estructural: router URL · división App.tsx · code-splitting        │
│      consolidación de suscripciones · cobertura · limpieza huérfanos          │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ P4 · Modelo patrimonial completo: tributos municipales · migración histórica  │
│      reconciliación PII contrato↔ficha · campo titularidad canónico           │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ P5 · Producción con terceros: staging · App Check · sesión/MFA · deps         │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        └── P6 (opcional, decisión de producto): separación entre aplicaciones
```

### 5.1 Reglas de secuenciación (para no desarrollar sobre estructuras sin definir)

| # | Regla |
|---|---|
| R1 | **Nada se publica en producción sin backup verificado (P0-A-04) y su caso de regla en verde (P0-A-03).** |
| R2 | **A-05 (avisos) no empieza antes de A-03**, porque exige modificar `notificaciones.list`. |
| R3 | **A-01 empieza después de A-03**, por la misma razón (ampliar superficies al profesional). |
| R4 | **La mensajería profesional↔propietario se diseña junto con A-01**, pero sobre un modelo de hilo **decidido antes** de escribir código (¿reutilizar `mensajes_portal` con `participantes[]` o colección nueva?). Decidir primero; si no, se rehace. |
| R5 | **La migración histórica (P4) exige backup verificado** y modelo de inmueble/contrato congelado: va después de P3. |
| R6 | **La separación entre aplicaciones (P6) exige el campo de aplicación en el modelo de datos**; no puede empezar hasta que P4 cierre, porque tocaría todas las colecciones. |
| R7 | **P3 (deuda estructural) puede solaparse con P1/P2** si hay dos carriles, pero **no** con P4 (refactor + migración simultáneos = riesgo alto). |

### 5.2 Decisiones que deben tomarse ANTES de codificar (evitan rehacer)

| Decisión | Opciones | Por qué bloquea |
|---|---|---|
| **D1 · Modelo de mensajería profesional** | (a) reutilizar `mensajes_portal` con `participantes[]`; (b) colección `mensajes_trabajo` | Cambia reglas, índices y UI |
| **D2 · Ubicación de factura de trabajo** | (a) nuevo destino Storage `trabajos/{id}/`; (b) vincular a `gastos` existente | Afecta a `autorizacionDocumental.ts` y al modelo económico |
| **D3 · Bandeja del inquilino** | (a) ampliar `notificaciones` con `isTenant()`; (b) colección `notificaciones_inquilino` | Afecta a reglas, al dispatcher y a la migración de avisos previos |
| **D4 · Nomenclatura de estados** | ¿se normalizan los alias o se mantienen? | Tocar 18 estados afecta a toda la UI |
| **D5 · Aplicación única o multi-app** | Mantener una app (recomendado a corto) vs introducir `appId` | Cambia **todas** las colecciones y reglas |

---

## 6. ARQUITECTURA OBJETIVO DE LOS PORTALES

### 6.1 Principios

1. **El servidor es la autoridad.** Ninguna decisión de acceso depende de ocultar botones. Las reglas de Firestore son la última línea; el servidor documental, la de los binarios.
2. **Un portal = un perfil = un ámbito derivado en servidor.** El cliente nunca envía su propio ámbito.
3. **Default-deny.** Toda colección nueva nace sin permiso y se abre con caso de prueba.
4. **Trazabilidad obligatoria** en toda escritura privilegiada (patrón `auditoriaVinculada` ya existente).
5. **Nada automático en lo económico.** Sin PSD2, sin pagos iniciados desde la aplicación, sin conexión bancaria. Registro manual + documento aportado.

### 6.2 Portal del Propietario (objetivo)

```
Inicio (KPIs) ─ Cartera ─ Titulares ─ Contratos ─ Económico ─ Incidencias ─ Profesionales ─ Avisos
                                  │
                                  ├── Mis presupuestos recibidos  ← NUEVO (A-01)
                                  └── Aprobar/rechazar presupuesto ← ya existe en gestión, falta aquí
```
- **Sin cambios de permisos.** El propietario ya tiene ámbito de escritura sobre sus inmuebles.
- **Nuevo:** bandeja de presupuestos pendientes y de avisos entregados.

### 6.3 Portal del Profesional (objetivo)

```
Mis encargos ─ Encargo (detalle) ─ Mis presupuestos ─ Mis evidencias ─ Mis facturas ─ Mensajes ─ Mi perfil
                                                   │
   Encargo: ┌ Aceptar / Rechazar (motivo)          │
            ├ Solicitar/adjuntar presupuesto       │
            ├ Subir fotografías de intervención ───┘ (servidor YA autoriza)
            ├ Registrar actuación (historial)
            ├ Adjuntar factura  ← D2
            └ Marcar finalizado (conforme)
```
**Límite duro:** nunca ve la ficha del inquilino, ni importes de otros presupuestos, ni el expediente documental del inmueble, ni inmuebles distintos de los asignados.

### 6.4 Portal del Inquilino (objetivo)

```
Inicio ─ Recibos ─ Averías ─ Suministros ─ Avisos ← NUEVO ─ Más (contrato, mensajes, documentos, historial, cuenta)
```
- **Nuevo:** pestaña de avisos, alimentada por `CanalInApp` (ya operativo) y acotada a sus contratos.
- **Se mantiene:** `list` denegado en el resto de colecciones; todo por `get` de documento.
- **Vistas saneadas:** el inquilino no ve importes internos, presupuestos ni notas del propietario.

### 6.5 Administración (objetivo)
- Se mantiene `AdminControlCenter` como vista única.
- Se añade: estado de backups, estado de reglas (última ejecución de la matriz) y alertas de acciones master.
- **No** se reactivan los *toggles* de módulos (correctamente inertes).

### 6.6 Separación entre aplicaciones — decisión explícita

**No se recomienda implementarla ahora.** Razones:

- No hay hoy un segundo producto en el mismo backend.
- Exigiría un campo `appId` en **todas** las colecciones, migración de datos y reescritura de reglas: coste alto, riesgo alto, beneficio nulo actual.
- El aislamiento **entre usuarios y entre carteras** —lo que de verdad protege los datos— ya está implementado y probado.

**Si el producto lo exige** (p. ej. “Gestión de Inmuebles” + otra aplicación sobre el mismo Firestore), se hace en **P6**, con este orden: definir `appId` en el modelo → backfill con valor único → añadir `appActual() == 'GESTION_INMUEBLES'` a cada regla → ampliar matriz de reglas → sólo entonces abrir la segunda aplicación.

---

## 7. HOJA DE RUTA DE IMPLEMENTACIÓN

> Cada fase termina con criterio de aceptación verificable. **Ninguna fase se solapa con otra que dependa de ella.** Estimaciones en días-persona, con supuestos declarados en §9.

### FASE P0 — Cimientos: reglas certificadas + backup verificado

**Objetivo:** poder cambiar con seguridad y poder recuperar de un desastre.

| | |
|---|---|
| **Incluye** | Matriz de reglas 80 colecciones · job CI obligatorio · MFA master · backup+restore con prueba mensual · reparar `validar-inventario-capacidades.mjs` |
| **Archivos** | `firestore.rules` (sin cambios de política, solo pruebas), `tests/emulador/*`, `.github/workflows/*.yml`, `scripts/backup-*.mjs`, `scripts/restore-verificar.mjs`, `scripts/validar-inventario-capacidades.mjs` |
| **Servicios** | Emuladores Firestore/Storage, `firebase-tools`, bucket de backup |
| **Colecciones** | Todas (lectura); ninguna modificada |
| **Reglas afectadas** | **Ninguna se relaja.** Se añaden únicamente casos de prueba |
| **Dependencias** | JRE 21 en agente CI; credencial de backup |
| **Riesgos de regresión** | **Bajo** en código (no se toca). Medio en operación (publicar reglas exige ahora verde en CI) |
| **Pruebas** | Matriz 80/80 con casos positivos y negativos por rol; dos restauraciones consecutivas OK |
| **Criterio de aceptación** | (a) `test:emulador:reglas` verde y **obligatorio** en PR a `main`; (b) cobertura declarada ≥ 80 colecciones; (c) restore cronometrado < RTO con verificación a/b/c/d; (d) `doctor` + validar-inventario en verde en CI |

---

### FASE P1 — Circuito del profesional completo

**Objetivo:** que un profesional externo cierre un encargo sin intervención del despacho.

| | |
|---|---|
| **Incluye** | Aceptar/Rechazar · alta de presupuesto · subida de fotos de intervención · adjuntar factura · mensajería profesional↔propietario · bandeja de presupuestos en portal del propietario · retirada del botón de creación de OT (A-02/UX) |
| **Archivos** | `ProfesionalPortalSection.tsx`, `PresupuestoProfesionalModal.tsx`, nuevo `PortalEncargoProfesional.tsx`, nuevo `PortalMensajesProfesional.tsx`, `PropietarioPortalSection.tsx`, `src/lib/firebase.ts`, `src/lib/expedienteDocumental/*`, `server/documentos/autorizacionDocumental.ts` (solo si D2 = opción a) |
| **Servicios** | `server/documentos/*`, `subscribePresupuestos`, `savePresupuestoProfesionalFirestore`, dispatcher de notificaciones |
| **Colecciones** | `presupuestos_profesionales`, `trabajos_profesionales`, `incidencias`, `mensajes_*` (según D1) |
| **Reglas afectadas** | Ninguna ampliación nueva salvo D1/D2. **Ya permiten** crear presupuesto y subir evidencias |
| **Dependencias** | **P0** (A-03). Decisiones **D1** y **D2** cerradas antes de empezar |
| **Riesgos de regresión** | **Medio-alto**: se toca el flujo más sensible (dinero + estados). Riesgo de doble gasto si factura y gasto no se vinculan bien |
| **Pruebas** | Motor: profesional no asignado no crea presupuesto ni sube foto · E2E de los 13 pasos · idempotencia de factura→gasto |
| **Criterio de aceptación** | Un profesional de prueba recorre 1→13 completo; el propietario aprueba desde su portal; **cero** accesos a datos no autorizados en la matriz de reglas |

---

### FASE P2 — Avisos reales a inquilino, propietario y profesional

| | |
|---|---|
| **Incluye** | Bandeja de avisos del inquilino · proveedor de correo real + acuse · `CRON_SECRET` y reloj del día 5 · aviso al profesional al recibir encargo |
| **Archivos** | `InquilinoPortalShell.tsx`, nueva `PortalAvisos.tsx`, `firestore.rules` (bloque `notificaciones`), `server/notificaciones/*`, `server.ts`, `.env.example` |
| **Colecciones** | `notificaciones` (+ `notificaciones_inquilino` si D3=b) |
| **Reglas afectadas** | **Se amplía** `notificaciones.allow list` para `isTenant()` acotado a contratos del inquilino. **Requiere P0** |
| **Dependencias** | P0 (obligatorio). Proveedor de correo contratado |
| **Riesgos de regresión** | **Alto en reglas**: es la primera ampliación de permiso. Riesgo de fuga entre inquilinos si el predicado no acota por contrato |
| **Pruebas** | Motor: inquilino A no lista avisos de B · inquilino no lista avisos de otros propietarios · E2E entrega + visibilidad |
| **Criterio de aceptación** | Aviso generado por incidencia **visible en portal** y **entregado por correo con acuse**; matriz de reglas muestra caso negativo verde |

---

### FASE P3 — Deuda estructural

| | |
|---|---|
| **Incluye** | Router por URL · división de `App.tsx` · code-splitting · consolidación de suscripciones · cobertura con umbrales · suites `.mjs` en CI · retirada de huérfanos y `SectionType` muertos |
| **Archivos** | `src/App.tsx` (4.988 líneas), `vite.config.ts`, `package.json`, `src/navegacion/*`, `src/types.ts` |
| **Colecciones** | Ninguna |
| **Reglas afectadas** | Ninguna |
| **Dependencias** | Ninguna técnica; puede ir en paralelo a P1/P2 con carril separado |
| **Riesgos de regresión** | **Alto**: refactor de la raíz de la aplicación. Mitigación: refactor sin cambio de comportamiento + la suite de 5.288 pruebas como red |
| **Pruebas** | Suite completa verde en cada paso · medición de bundle antes/después · smoke de navegación por URL |
| **Criterio de aceptación** | Bundle principal < 1,5 MB gzip · rutas URL navegables y recargables · `App.tsx` < 800 líneas · cobertura reportada con umbral |

---

### FASE P4 — Modelo patrimonial completo

| | |
|---|---|
| **Incluye** | Tributos municipales (IBI/tasas) con calendario · migración histórica con dry-run y verificación · reconciliación PII contrato↔ficha · campo de titularidad canónico |
| **Archivos** | `src/utils/gastosEngine.ts`, nueva `TributosSection`, `src/lib/migracion/*`, `src/types.ts`, `docs/` |
| **Colecciones** | `gastos`, `gastos_recurrentes`, `inmuebles`, `contratos_formalizacion`, `titularidades` |
| **Reglas afectadas** | Posible acotación de campos de titularidad (endurecimiento, no apertura) |
| **Dependencias** | **P0** (backup verificado obligatorio antes de migrar) y **P3** (modelo estable) |
| **Riesgos de regresión** | **Muy alto**: migración de datos reales. Mitigación: dry-run, backup previo, carga en staging, verificación post-carga, reversibilidad |
| **Pruebas** | Dry-run sin escrituras · recuento y muestreo post-carga · reconciliación PII con informe de diferencias |
| **Criterio de aceptación** | Histórico cargado con 0 diferencias no justificadas · informe de reconciliación aprobado · restore probado tras la migración |

---

### FASE P5 — Producción con terceros

| | |
|---|---|
| **Incluye** | Staging real · App Check · política de sesión/MFA · plan de actualización de dependencias · auditoría a11y/responsive en dispositivos |
| **Archivos** | `firebase-applet-config.json` (App Check), `src/lib/authService.ts`, `package.json`, `.github/workflows/*` |
| **Dependencias** | P0–P4 |
| **Riesgos de regresión** | Medio (App Check puede bloquear clientes legítimos si se activa en modo estricto de golpe) |
| **Criterio de aceptación** | Staging replica producción · App Check en modo monitor antes de bloqueo · 0 regresiones en suite |

---

### FASE P6 (opcional) — Separación entre aplicaciones
Solo si el producto la exige. §D.6. **No recomendada a corto plazo.**

---

## 8. PRUEBAS DE ACEPTACIÓN POR PORTAL

### 8.1 Portal del Propietario

| # | Prueba | Criterio |
|---|---|---|
| PR-1 | Alta/edición de inmueble y aparición en todas las vistas | Consistente en ficha, dashboard e informes |
| PR-2 | Contrato → cobros → gasto → fiscal | Cifras cuadran entre pantallas |
| PR-3 | Aislamiento: propietario A no ve nada de B | Motor: `assertFails` en get y list |
| PR-4 | **Nuevo:** recibe presupuesto del profesional y lo aprueba | Estado pasa a `ACEPTADO` y se refleja en el trabajo |
| PR-5 | Rentabilidad por inmueble y global | Coincide con cálculo del motor |
| PR-6 | Bajas lógicas no rompen históricos | Dependientes conservan referencia |

### 8.2 Portal del Inquilino

| # | Prueba | Criterio |
|---|---|---|
| PI-1 | Sin contrato vinculado → aviso, no pantalla vacía silenciosa | Mensaje explícito |
| PI-2 | Solo ve SU contrato, recibos, incidencias y mensajes | Motor: A no accede a B |
| PI-3 | `list` denegado en todas las colecciones sensibles | `assertFails` |
| PI-4 | Subida de justificante de pago | Documento visible para gestión |
| PI-5 | **Nuevo:** recibe y ve avisos | Bandeja con el aviso de su incidencia |
| PI-6 | No ve importes internos ni presupuestos en el seguimiento | Vistas saneadas |

### 8.3 Portal del Profesional

| # | Prueba | Criterio |
|---|---|---|
| PP-1 | Ve solo encargos con `profesionalId` propio | Motor: A no lee B |
| PP-2 | No ve ficha del inquilino, contratos, ni otros inmuebles | `assertFails` |
| PP-3 | No puede crear orden de trabajo | `assertFails` **y** sin botón en UI |
| PP-4 | Aceptar / rechazar con motivo | Estado + historial con actor y fecha |
| PP-5 | **Nuevo:** crea presupuesto con partidas e IVA | Visible para el propietario |
| PP-6 | **Nuevo:** sube fotos de intervención | Autorizado solo si asignado; no asignado → `assertFails` |
| PP-7 | **Nuevo:** adjunta factura y se vincula a un único gasto | Sin duplicar el gasto |
| PP-8 | **Nuevo:** mensajea con el propietario | Hilo visible en ambos lados |
| PP-9 | No ve presupuestos de otros profesionales del mismo trabajo | `assertFails` |

### 8.4 Administración y seguridad

| # | Prueba | Criterio |
|---|---|---|
| PA-1 | Alta/baja de usuario y reflejo en reglas | Usuario revocado pierde acceso en la siguiente petición |
| PA-2 | Escritura privilegiada sin evento de auditoría | `assertFails` |
| PA-3 | Usuario intenta escribir `carterasL/E` propias | `assertFails` |
| PA-4 | Token manipulado / expirado / `alg:none` | 401 en todas las rutas autenticadas |
| PA-5 | `propietarioId` falso en body de notificación | **Ignorado**; se usa el del token |
| PA-6 | Matriz de reglas completa | 80/80 verde, obligatoria en CI |
| PA-7 | Restauración en proyecto aislado | Verificación a/b/c/d al 100 % |

---

## 9. ESTIMACIÓN DE COMPLEJIDAD Y RIESGOS

### 9.1 Estimación (días-persona, un desarrollador senior; supuestos abajo)

| Fase | Alcance | Estimación | Confianza |
|---|---|---:|---|
| **P0** | Matriz reglas + CI + backup + MFA + script roto | **12–18 d** | Alta |
| **P1** | Circuito profesional (5 piezas + mensajería) | **20–30 d** | Media |
| **P2** | Avisos + correo real + cron | **8–12 d** | Media |
| **P3** | Router + división + splitting + suscripciones + cobertura | **18–26 d** | Media-baja (refactor raíz) |
| **P4** | Tributos + migración + reconciliación PII | **20–30 d** | Baja (datos reales) |
| **P5** | Staging + App Check + sesión + deps + a11y | **10–15 d** | Media |
| **P6** | Multi-aplicación (opcional) | **25–40 d** | Baja |
| | **Total sin P6** | **88–131 d** | |
| | **Total con P6** | **113–171 d** | |

**Supuestos:** (1) una persona senior a jornada completa; (2) las decisiones D1–D5 se toman en P0; (3) no hay reescritura del modelo de datos en P1/P2; (4) la suite de 5.288 pruebas sirve de red y no hay que repararla; (5) entorno CI con JRE disponible; (6) el negocio valida criterios de aceptación en cada fase. **Si falla (3) o (4), P3 y P4 pueden duplicarse.**

### 9.2 Riesgos del plan

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| RP-1 | La matriz de 80 colecciones revela más fallos de los previstos y **bloquea** P1/P2 | Media | Alto | Es precisamente su función. Reservar colchón en P0; los hallazgos entran como P0-bis antes de P2 |
| RP-2 | Ampliar `notificaciones.list` (P2) abre fuga entre inquilinos | Media | **Muy alto** | No publicar sin caso negativo verde; revisión de predicado por segunda persona |
| RP-3 | Refactor de `App.tsx` (P3) rompe comportamiento | Media | Alto | Refactor en pasos con suite verde; sin cambios funcionales mezclados |
| RP-4 | Migración (P4) corrompe datos reales | Baja | **Muy alto** | Backup verificado + dry-run + staging + reversibilidad |
| RP-5 | Decisión D1/D2 tomada tarde obliga a rehacer mensajería/facturas | **Alta** | Medio | Cerrar D1–D5 al final de P0, por escrito |
| RP-6 | Dependencia de una sola persona (bus factor) | Alta | Alto | Documentar decisiones; P3 reduce el monolito |
| RP-7 | El backup da falso verde (base equivocada) | Media | **Muy alto** | Script falla sin `--database`; verificación de contenido conocido |
| RP-8 | Actualizaciones mayores (firebase 13, express 5) rompen algo | Media | Medio | P5, por lotes, con suite como red |

### 9.3 Lo que este plan NO hace (por restricción)

- No introduce conexiones bancarias, PSD2 ni pagos iniciados desde la aplicación.
- No reactiva los *toggles* de módulos (correctamente inertes).
- No relaja ninguna regla para facilitar pruebas.
- No reescribe el modelo económico: sigue siendo **manual + documento aportado**.

### 9.4 Conservación de lo existente (compromiso explícito)

| Activo | Garantía |
|---|---|
| Datos actuales | Ninguna fase de P0–P3 escribe en producción. P4 (migración) solo tras backup verificado y dry-run |
| Arquitectura que funciona | Se **extiende**, no se reemplaza: servidor Express, custodia servidor-side, dispatcher, emuladores |
| Separación entre usuarios/carteras | Se mantiene intacta; solo se **añaden** casos de prueba |
| Permisos correctos | Ninguna regla se relaja en P0–P3. En P2 solo se añade una rama acotada a `isTenant()` |
| Funcionalidades operativas | Ninguna se retira; los huérfanos se **reutilizan** (ProfesionalesSection para A-01) |
| Documentación y contratos | Se conserva; se marca fecha de corte en los documentos obsoletos (M-08/B-02) |

---

## 10. ORDEN RECOMENDADO DE EJECUCIÓN

```
1. P0-a  Matriz de reglas (A-03/CP-01) ──────┐
2. P0-b  Backup + restore verificado (A-04) ─┤  ambas en paralelo, ANTES de tocar nada
3. P0-c  MFA master (CP-02) · script roto (M-08) ┘
4. ◄ GATE ► Cerrar decisiones D1–D5 por escrito
5. P1    Circuito profesional (A-01)   ◄── mayor valor funcional del encargo
6. P2    Avisos reales (A-05)          ◄── depende del gate de reglas
7. P3    Deuda estructural (M-01…M-05)
8. P4    Modelo patrimonial (M-14, M-15, M-06, M-07)
9. P5    Producción con terceros (M-11, M-12, M-10)
10. P6   Multi-aplicación — solo por decisión expresa de producto
```

**Justificación del orden:** primero se asegura la capacidad de **detectar** (reglas) y de **recuperar** (backup); después se construye lo que el encargo pone en el centro (**profesional**), luego lo que cierra la comunicación (**avisos**), y solo entonces se paga la deuda estructural y se amplía el modelo. Nunca al revés: ampliar funcionalidad sobre una base no verificable es cómo se pierden los datos.

---

## 11. RESUMEN DE LA VALIDACIÓN

| Incidencia | Fase 0 | Fase 1 | Cambio |
|---|---|---|---|
| **A-01** Portal profesional incompleto | ALTO | **ALTO confirmado, coste menor** | Se precisa: presupuestos y evidencias **ya autorizados** en datos y servidor; falta UI |
| **A-02** Auto-creación de OT | ALTO / ERROR | **REFUTADA como seguridad · MEDIO (UX)** | Las reglas la bloquean; es un botón que promete lo imposible |
| **A-03** Reglas no verificadas | ALTO | **ALTO confirmado y agravado** | Cobertura medida: **4 de 80 colecciones (≈5 %)** |
| **A-04** Sin backup/restore | ALTO | **ALTO confirmado** | Complicación: base con nombre exige `--database`; Storage no cubierto por backup gestionado |
| **A-05** Sin avisos al inquilino | ALTO | **ALTO confirmado** | Canal INAPP ya existe; falta bandeja + rama de regla + correo real |
| **CP-01** Reglas sin motor | Crítico potencial | **Riesgo crítico no acotado** (no vulnerabilidad demostrada) | Se sostiene en A-03 |
| **CP-02** Poder del master | Crítico potencial | **NO es defecto: es ancla de confianza auditada** | Reclasificada a riesgo operativo (MFA) |

**Incidencias que desaparecen del plan de corrección:** A-02 como problema de seguridad, CP-02 como defecto de reglas.
**Incidencias que suben de prioridad:** A-03 (por cobertura medida) y A-04 (por irreversibilidad).

---

## 12. RESTRICCIÓN CUMPLIDA

- **No se ha modificado ni corregido nada.** El único cambio en el repositorio es este documento.
- **No se ha desplegado nada.** No se ha publicado ninguna regla ni índice.
- **No se ha alterado ningún acceso** ni se ha debilitado ninguna regla para facilitar pruebas.

**Quedo a la espera de autorización expresa para iniciar la implementación**, indicando por qué fase se empieza (recomendado: **P0**, con P0-a y P0-b en paralelo).

---

### Anexo — Evidencia de la re-verificación de esta fase

| Comprobación | Comando / archivo | Resultado |
|---|---|---|
| Predicado de A-02 | `firestore.rules:1765`, `386-390`, `170-176` | `aisladoCreateOk()` exige `isPropietarioRole()` → PROFESIONAL bloqueado |
| Única rama `create` en trabajos | `sed -n '1759,1785p' firestore.rules` | 1 sola aparición |
| Propagación del error al usuario | `src/lib/firebase.ts:3765-3769`, `TrabajoProfesionalModal.tsx:350` | `throw err` + mensaje visible |
| Presupuesto: `create` por profesional | `firestore.rules:1795` | **Permitido** con `profesionalId == myProfId()` |
| Evidencias: autorización de servidor | `autorizacionDocumental.ts:739,746` + `profesionalAsignadoA` (`:439`) | **Permitido** al asignado |
| Prefijo `trabajos/` denegado | `autorizacionDocumental.ts:196` | Denegación por defecto |
| Cobertura de la matriz de reglas | `grep` sobre `tests/emulador/*.ts` | 4 colecciones de 80 |
| Inquilino sin `list` de notificaciones | `firestore.rules:2630` | Denegado por diseño |
| `CanalInApp` operativo | `src/notificaciones/canales.ts:208-217` | Persiste y devuelve `ok` |
| Sin script de backup | `grep` en `scripts/`, `server/`, `package.json` | Ninguno |
| `allow delete: if false` en `usuarios_auth` | `firestore.rules:452` | Ni el master borra el binding |
