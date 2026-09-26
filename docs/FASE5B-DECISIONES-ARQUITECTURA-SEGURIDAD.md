# FASE 5B — DECISIONES ARQUITECTURA Y SEGURIDAD (diseño; sin implementación)

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **Naturaleza:** SOLO diseño y documentación. **0 escrituras Firestore/Storage · 0 reglas modificadas · B4 NO ejecutado.**
**Nota de estado:** reset 7 del sandbox detectado al inicio; commits FASE 2–5 restaurados desde disco como `6703990`/`6aec5e2`/`1710409`/`3f0b359`.

---

## 1. MODELO CUENTA / TITULAR / GESTOR

### 1.1 Conceptos (no confundir)
| Concepto | Qué es | Dónde vive | Clave |
|---|---|---|---|
| Identidad de autenticación | credencial (email+password) | Firebase Auth | `uid` |
| Usuario de aplicación | perfil operativo (roles, permisos, ámbito) | `usuarios/{id}` + espejo `usuarios_auth/{uid}` | `id` / `uid` |
| Titular legal | persona física/jurídica dueña del patrimonio | `propietarios/{id}` (existente; semánticamente "titular") | `titularId` (= propietarioId actual) |
| Gestor | **función**, no identidad: usuario que administra cartera ajena mientras exista autorización | relación `gestiones_cartera` | — |
| Cartera | **conjunto derivado**: inmuebles con `propietarioId == titularId`. NO se materializa | vista sobre `inmuebles` | — |
| Permiso | nivel de acceso (LECTURA / LECTURA_ESCRITURA) sobre un ámbito | campo de `gestiones_cartera` (o del titular sobre lo propio) | — |

Principio: **la gestión es ortogonal a la titularidad.** Un usuario puede ser a la vez titular de su propia cartera y gestor de carteras ajenas; son dos ámbitos que se suman, nunca se mezclan.

### 2. MODELO DE CARTERA — entidad propuesta: `gestiones_cartera/{id}`

**Decisión técnica: colección independiente** (no subcolección, no relación por documentos sueltos):
- El gestor necesita listar "mis carteras" → `collectionGroup`/consulta simple por `gestorUsuarioId`; con subcolección bajo `propietarios/{tid}/gestiones` haría falta collectionGroup igualmente y las rutas de regla serían más largas sin ventaja.
- El master admin necesita el listado global y las reglas necesitan `get()` por ruta conocida en ambos diseños; la colección independiente permite índices compuestos limpios: `(titularId, estado)` y `(gestorUsuarioId, estado)`.
- Se descarta "relación mediante documentos" (p.ej. arrays en `usuarios`): sin ciclo de vida propio no se puede auditar cesión/devolución/revocación con fechas y eventos.

**Campos propuestos:**
```
gestiones_cartera/{id}:
  id, titularId, gestorUsuarioId,
  inmuebleIds: string[]        // [] = cartera completa del titular
  permiso: 'LECTURA' | 'LECTURA_ESCRITURA'
  responsableActual: 'GESTOR' | 'TITULAR'
  estado: 'PENDIENTE_ACEPTACION' | 'ACTIVA' | 'REVOCADA'   // nunca se borra
  fechaInicio, fechaFin?, creadoPor, createdAt, updatedAt
  eventos: [ { tipo, actorId, actorRol, fecha, motivo? } ] // histórico append-only
```

### 3. MODELO DE PERMISOS
- **Titular sobre su cartera:** LECTURA+ESCRITURA por defecto (es su patrimonio); configurable a solo-lectura si delega (decisión D1).
- **Gestor:** `permiso` del documento de gestión. LECTURA = get/list ámbito + descarga documental. LECTURA_ESCRITURA = + crear/modificar gastos, incidencias, documentos; **nunca** cambiar `propietarioId`, ni ceder a terceros, ni borrar.
- **Resolución de ámbito (servidor, en reglas):** `ámbito(usuario) = {propietarioId propio} ∪ inmuebleIds ∪ {titularId : gestión ACTIVA}`. Para evitar `get()` encadenados por petición, el espejo `usuarios_auth/{uid}` se extiende con `carterasLecturaIds[]` y `carterasEscrituraIds[]`, **sincronizadas solo por flujo de confianza** (admin SDK / Cloud Function al aceptar/revocar); el usuario no puede escribir esos arrays (endurecer `indexIsTruthful()`). Trade-off documentado: si la sincronización falla, el gestor pierde acceso (fail-closed) — nunca lo gana.

### 4. CESIÓN (gestor → titular)
Transición sobre el MISMO documento: `responsableActual: GESTOR → TITULAR` + evento `GESTION_CEDIDA`. El gestor conserva `LECTURA` (seguimiento), pierde escritura (propuesta; confirmar en D1). La titularidad de los inmuebles NO cambia.

### 5. DEVOLUCIÓN (titular → gestor)
Transición inversa: `responsableActual: TITULAR → GESTOR` + evento `GESTION_DEVUELTA`. **Invariantes que garantizan los requisitos 9 y 10:**
1. La devolución NO crea ningún documento de inmueble ni de titular (la cartera es derivada) → no duplica información.
2. Ningún documento de `gestiones_cartera` se elimina jamás; `REVOCADA` conserva `eventos[]` → histórico íntegro.
3. `inmueble.propietarioId` es invariante bajo cualquier transición de gestión.
4. Máximo una gestión no-REVOCADA por par `(titularId, gestorUsuarioId)`.
5. Prohibida la autogestión (`titularId` y `gestorUsuarioId` del mismo humano).
6. Revocación (por titular o master) → `REVOCADA`, efecto inmediato, auditada.

Reglas propuestas (no aplicadas): create por master o titular; `responsableActual` solo lo cambia el responsable vigente; `eventos` solo crece (validación `arrayUnion` + tamaño); delete prohibido (`allow delete: if false`).

## 6. AISLAMIENTO FIRESTORE — F5-1 (endurecimiento de `inmuebles`)

**1) Comportamiento actual (evidencia):** `isStaff() = isSignedIn() && !isTenant()` (firestore.rules L344-346); `inmuebles` `allow get/list: if isStaff()`. El frontend usa `subscribeInmuebles()` = `onSnapshot(INMUEBLES_COL)` **sin filtro where** (firebase.ts L260-274), consumida por `App.tsx` y `DashboardEjecutivoSection.tsx`.
**2) Defecto concreto:** cualquier cuenta autenticada no-inquilino puede leer y ENUMERAR inmuebles ajenos (IBAN/NIF/valores/notas); el aislamiento real depende del filtrado React; conocer el ID basta para el `get`.
**3) Modelo de autorización propuesto:** ámbito del §3 (titular ∪ asignados ∪ carteras gestionadas ∪ master).
**4) Reglas necesarias (texto propuesto, NO aplicado):**
```
allow get: if isMasterAdmin()
  || resource.data.propietarioId == myPropId()
  || resource.data.propietarioPrincipalId == myPropId()
  || myInmuebleIds().hasAny([inmuebleId])
  || gestionaCartera(resource.data.propietarioId)      // espejo: carterasL/E
  || (isTenant() && …sin cambios…);
allow list: if isMasterAdmin()
  || resource.data.propietarioId == myPropId()
  || myInmuebleIds().hasAny([resource.data.id])
  || resource.data.propietarioId in misCarterasIds();
```
**5) Efectos sobre la aplicación existente (verificado):** `subscribeInmuebles()` sin filtro **fallará (permission-denied) para todo perfil excepto master** en cuanto se endurezca `list`. Cambio previo obligatorio en cliente: suscripción por ámbito — titular: `where('propietarioId','==',myPropId)` (+ `where('id','in',inmuebleIds)` combinado en cliente); gestor: `where('propietarioId','in',carterasL∪carterasE)`; master: sin filtro. Afecta a `App.tsx` (estado global) y `DashboardEjecutivoSection.tsx`; los `get()` por referencia (gasto→inmueble) quedan cubiertos por la nueva regla `get`. `dryRunFichasPublicas.ts` usa INMUEBLES_COL (herramienta de admin; verificar en implementación).
**6) Anti-manipulación:** create/update ya exigen titularidad sobre `propietarioId` (verificado en FASE 5) — se conserva; la regla de `list` obliga a `where` compatibles; manipular el filtro del cliente solo produce permission-denied, nunca datos ajenos.

## 7. AISLAMIENTO STORAGE (residuales R-1/R-2)

**Actual:** `get = internalUser()` (cualquier autenticado que conozca la ruta); sin claims no hay aislamiento por `{propietarioId}`.
**Propuesta:** custom claims de Auth asignadas por flujo de confianza (admin SDK / Cloud Function sobre `syncAuthIndex`): `propId`, `carterasL[]`, `carterasE[]`. Reglas por ruta (patrón, no aplicado):
```
match /gastos_facturas/{propietarioId}/{gastoId}/{f} {
  allow get: if propietarioId == request.auth.token.propId
    || propietarioId in (token.carterasL + token.carterasE);
}
```
Mismo patrón para: comprobantes de cobros (`cobros_justificantes/{propietarioId}/…`), documentos de inmuebles, contratos y documentación fiscal (futuras rutas `expedientes_fiscales/…` de B6). `list` sigue solo-master. Alternativa sin claims: `firestore.get()` en reglas de Storage (latencia/coste por operación; se documenta y descarta como primera opción). **Migración:** los tokens existentes no llevan claims hasta su renovación → desplegar claims primero, endurecer `get` después (fail-closed durante la ventana solo si se endurece antes). Residuales R-4 (downloadURL con token) y R-5 (rutas sin bloque) se mantienen declarados; no se tocan.

## 8. STAGING DE MIGRACIÓN — comparación formal

| Criterio | A) Escritura directa | B) Staging completo | C) Staging selectivo |
|---|---|---|---|
| Seguridad | Baja: exige propietarioId YA y toca productivo | **Alta: 0 contacto con productivo** | Media |
| Rollback | Borrado de docs productivos (mala auditoría) | **Trivial: se descarta el lote** | Doble lógica |
| Idempotencia | ids deterministas, pero revertir es destructivo | re-ejecutar = mismo lote, sin efectos | por rama |
| Auditoría | sobre productivo | acta de lote + promoción separada | mixta |
| Trazabilidad | procedencia en doc productivo | **lote→registro→promoción completa** | por rama |
| Recuperación tras error | estado parcial en productivo | staging aislado; se reintenta | parcial en productivo |
| Coste | mínimo | colección adicional (bajo) | medio |
| Complejidad | baja | media (promoción futura) | **alta (dos caminos + criterio)** |
| Compat. datos actuales | exige decisiones bloqueadas | **compatible con propietarioId pendiente** | parcial |
| Compat. importaciones futuras | cada fuente repite el riesgo | modelo reutilizable por fuente | parcial |
| Compat. exportación fiscal (B6) | expone datos sin validar | **exportación solo de productivo limpio** | mezcla |

**Recomendación técnica: B (staging completo).** Justificación ligada a hechos vigentes: (i) no hay fichero canónico A/B confirmado (INC-06); (ii) hay 15 registros sin id y 16+28 incidencias abiertas; (iii) el registro 27 está truncado (INC-08); (iv) faltan documentos (P1-01); (v) no se inventa lo que no existe; (vi) `propietarioId` está bloqueado por decisión de negocio. Estructura propuesta: `importacion_lotes/{loteId}` (acta) + subcolección `registros/{registroId}` (payload normalizado + veredicto). Escritura de staging SOLO por `firebase-admin` (bypass de reglas → no exige modificar firestore.rules; el importador auto-aplica aislamiento) o, si se prefiere reglas nuevas, con aprobación explícita (D4). **No se implementa ninguna opción.**

## 9. CONTRATO DE IMPORTACIÓN — condiciones de CONFIRMADO

**Mínimo exigible antes de CONFIRMADO:** lote (id, sistema origen, fecha, `sha256` del fichero original, actor, modo), titular destino y ámbito (propietarioId + carteras), registros (analizados/clasificables/bloqueados, huellas), documentos (esperados/recibidos/sha256), incidencias (abiertas/críticas), dependencias (mapa de titulares, contratos necesarios), resultado agregado.
**Situaciones que IMPIDEN CONFIRMADO (todas mapeadas a códigos existentes):**
| Bloqueo | Código | Efecto |
|---|---|---|
| `propietarioId` desconocido | P0-2 | lote completo en staging; jamás promoción |
| Fichero canónico A/B ausente | INC-06 | no existe lote confirmable |
| Registro truncado (reg. 27) | INC-08 | registro BLOQUEADO; lote no confirmable con truncados |
| Documento incompleto | P1-01 | documento PENDIENTE; registro promovible sin doc solo si el usuario lo autoriza |
| Conflicto de origen (A vs B) | INC-05 | registros en conflicto BLOQUEADOS hasta resolución |
| Colisión de ID (mismo id, distinta huella) | B3 | BLOQUEADO_CONFLICTO (ya implementado en dedup) |
| Cobro sin contrato destino | FASE 3 §J | COBRO_BLOQUEADO |
| Incidencia crítica abierta | P0 | confirmación del ámbito afectado suspendida |

## 10. AUDITORÍA (esquema final propuesto; `audit_logs` sigue append-only)

Sin sistema paralelo: se extiende el uso de `audit_logs` (reglas intactas: create autenticado, update/delete `false`, read master).
- **Importación:** ids deterministas `audit_{loteSha256}_{seq}`; `entidadAfectada: 'lote'`; `detalles`: `{loteId, loteSha256, sistemaOrigen, origenId, entidad, idDestino, operacion, propietarioIdAfectado, gestorId?, resultado, incidencias[]}`.
- **CRUD:** `ENTIDAD_CREADA/MODIFICADA/ELIMINADA` (extender la unión TS `entidadAfectada` con `'gasto'|'cobro'|'importacion'|'lote'|'gestion'`).
- **Gestión:** `GESTION_CREADA/ACEPTADA/CEDIDA/DEVUELTA/REVOCADA/PERMISO_MODIFICADO` con actor, ámbito y motivo.
- **Acceso/descarga documental:** opcional vía Cloud Function sobre eventos de Storage (fuera de alcance actual; se documenta).

## 11. TESTS DE SEGURIDAD (batería diseñada; ejecución futura)

Capas: (a) `@firebase/rules-unit-testing` + emuladores (firebase-tools) — devDependencies nuevas, requieren aprobación (D6); (b) tests puros de la máquina de estados de gestión (módulo puro, sin Firebase).
| Test | Capa | Aserción |
|---|---|---|
| A) titular A no lee inmueble de B | emulador | `get` → permission-denied |
| B) titular A no lista inmuebles de B | emulador | `list` sin where → denied; con where ajeno → denied |
| C) titular A no lee gasto de B | emulador | `get`/`list` → denied (regresión de lo ya correcto) |
| D) titular A no modifica `propietarioId` | emulador | update con propietarioId distinto → denied |
| E) titular A no accede a documento de B | emulador Storage | `get` objeto ruta ajena → denied (tras claims) |
| F) gestor autorizado accede a su cartera | emulador | get/list inmueble+gasto del titular gestionado → allow |
| G) gestor sin autorización no accede | emulador | misma ruta sin gestión ACTIVA → denied |
| H) tras cesión el acceso cambia | emulador + puro | escritura del gestor → denied; lectura → allow (según D1) |
| I) tras devolución se restaura el ámbito | emulador + puro | escritura del gestor → allow de nuevo; eventos íntegros |
| J) cliente no amplía privilegios | emulador | manipular espejo `usuarios_auth`, payload con roles, o `propietarioId` → denied (`indexIsTruthful`, anti-reasignación) |

## 12. DECISIONES QUE REQUIEREN APROBACIÓN DEL USUARIO
- **D1** Modelo `gestiones_cartera` tal como se propone (incluye: ¿el gestor conserva LECTURA tras ceder? Propuesta: sí).
- **D2** Endurecimiento de `inmuebles` (F5-1) + cambio previo de `subscribeInmuebles()` y consumidores.
- **D3** Claims de Storage + flujo de confianza (Cloud Function/admin) para asignarlas.
- **D4** Staging B: escritura vía `firebase-admin` (sin tocar reglas) vs reglas nuevas de staging.
- **D5** Fichero canónico A/B (bloqueo externo, sigue abierto: INC-06).
- **D6** Nuevas dependencias: `firebase-admin`, `firebase-tools`, `@firebase/rules-unit-testing` (dev).

## 13. IMPACTO SOBRE B4 Y ORDEN RECOMENDADO
B4 (escritura `--confirmar`) sigue **NO autorizado**: necesita D1–D6 y el fichero canónico. Con staging B, la primera ejecución productiva de B4 escribiría SOLO en `importacion_lotes` (0 riesgo sobre datos actuales).
**Recomendación de orden: B6 antes que B4.** B6 (`expedienteFiscalEngine` + ZIP, FASE 3 línea B6) es de **solo lectura, sin escrituras**, no depende de ninguna decisión bloqueada (D1–D5), valida el modelo de lectura y el contrato ZIP/manifest, y produce valor inmediato (exportación fiscal de los datos actuales con ámbito/periodo). B4 queda para después de D1–D6.

---

## Verificación de FASE 5B
- Firestore: **0 escrituras** · Storage: **0 escrituras** · datos existentes: **0 modificaciones**.
- `firestore.rules` / `storage.rules` / `firestore.indexes.json` / código fuente: **sin cambios** (diff verificado).
- Este documento es el único artefacto nuevo. Commit FASE 5B **sin push**. B4 NO ejecutado.
