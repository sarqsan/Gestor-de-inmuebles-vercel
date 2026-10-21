# AUDITORÍA INTEGRAL — PLAN DE CORRECCIONES

**SHA auditado:** `2563831df9b026dec8276c45db40977f72883f9d`
**Naturaleza:** plan **propuesto**. Nada de este documento se ha implementado. No se ha modificado código, reglas, configuración ni datos.

## Criterios de ordenación

1. **Primero lo que expone datos o corrompe el histórico económico** (A-20, A-01).
2. **Agrupar por causa común**, no por síntoma: una sola corrección por causa.
3. **Nada que dependa de una decisión de producto se adelanta** a esa decisión (A-04, A-01-a/b).
4. **Las verificaciones que requieren acceso se separan** del trabajo de código.

## Agrupación por causa común

| Causa raíz | Hallazgos que resuelve | Nº de correcciones |
|---|---|---|
| C1 · `isStaff()` como permiso universal sobre datos personales | A-20, A-13 (parcial) | 1 modelo + 1 prueba |
| C2 · El histórico económico vive en documentos que el cliente reescribe | A-01, A-12, A-06 (parcial) | 1 decisión + 1 implementación |
| C3 · La captación se lee sin ámbito; el cliente escribe de vuelta | A-03, A-08 | 2 correcciones de cliente |
| C4 · Los tokens de capacidad no tienen ciclo de vida | A-04, A-13 (parcial) | 1 modelo + validaciones |
| C5 · Identificadores de propietario y de usuario se confunden | A-05 | 1 línea + 1 prueba |
| C6 · Dos criterios para «documento del gasto» | A-06 | 1 selector canónico |
| C7 · Secretos derivados persistidos | A-07 | 1 retirada + 1 purga |
| C8 · Higiene de CI y dependencias | A-09, A-10, A-11, A-14, A-15, A-16, A-17, A-18, A-19 | 9 acciones independientes |

**Regla aplicada:** A-01 y A-12 se resuelven juntos (misma escritura); A-20 y A-13 comparten el modelo de permisos de captación; A-03 y A-08 comparten el cliente de captación.

---

## Fase 0 — Antes de tocar nada (verificaciones que no requieren código)

| # | Acción | Por qué | Salida |
|---|---|---|---|
| 0.1 | Comparar `firestore.rules` y `storage.rules` publicadas con las del repositorio | Nada garantiza que producción tenga estas reglas | Acta de diferencias |
| 0.2 | Confirmar si existen cuentas PROFESIONAL activas con ficha en producción | Determina si A-20 es una exposición activa | Recuento y fecha |
| 0.3 | Ejecutar `npm run test:emulador:reglas` en una máquina con Java | Evidencia E3 propia (hoy solo CI) | Informe del emulador |
| 0.4 | Confirmar `V4` (cuenta de servicio), `CRON_SECRET` y `EMAIL_PROVEEDOR` en Vercel | Sin ellos, P2/P3/P4 y portales responden 503 | Captura de la configuración (sin secretos) |
| 0.5 | Decidir el modelo de A-01 (append-only vs. versión inmutable) y el de A-04 (caducidad) | Bloquean la implementación | Decisión registrada |

---

## Fase 1 — Seguridad de datos personales (bloqueante)

### 1.1 · A-20 — Permisos de captación por ámbito

- **Alcance:** reemplazar `isStaff()` en `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `notificaciones`, `profesionales` y `enlaces_registro` por predicados de mínimo privilegio (`esAdminInmuebles()`, `esGestorDeCartera(pid)`, `esProfesionalAsignado()`).
- **Riesgo de regresión:** el gestor de cartera necesita seguir viendo su captación; el admin, toda. Comprobar `carterasL/E` en la regla, no en la consulta.
- **Coste:** medio. **Dependencias:** decisión 0.5 y Fase 3.1 (cliente de captación) para que la UI no se quede vacía.
- **Criterio de cierre:** las 4 pruebas de regresión de A-20 en verde **en el emulador oficial**, más una prueba de aceptación con una cuenta PROFESIONAL sintética que intente `list` de `candidatos` y reciba `permission-denied`. Hoy está reproducido el comportamiento contrario con el harness (5/5).

### 1.2 · A-04 — Ciclo de vida de los tokens

- **Alcance:** campos `expiraEn`, `revocadoEn`, `estado`; validación en `servicioPortalPublico`; endpoint de revocación; migración de enlaces vivos (fecha de caducidad por defecto).
- **Coste:** medio. **Dependencias:** 0.5.
- **Criterio de cierre:** pruebas de token caducado, revocado y de invitación `CANCELADO`/`RECHAZADO` → 404/409; los enlaces existentes conservan una caducidad decidida y comunicada.

---

## Fase 2 — Integridad económica

### 2.1 · A-01 + A-12 — Histórico económico y concurrencia

- **Alcance según decisión 0.5:**
  - (a) colección `cobros_periodos` append-only + `audit_logs` obligatorio; o
  - (b) inmutabilidad del periodo pagado en la regla + `runTransaction` con `updateTime` en cliente.
- **Además:** bloquear el `delete` de contratos con cobros y de gastos con documento; baja lógica.
- **Coste:** alto (toca modelo, reglas, cliente e importación/exportación). **Dependencias:** ninguna funcional, pero **debe ir antes de A-02 y A-06**.
- **Criterio de cierre:** pruebas (1) alteración de importe pagado → denegada; (2) borrado con histórico → denegado; (3) dos escrituras concurrentes → conflicto, no pérdida; (4) toda escritura económica aparece en `audit_logs`.

### 2.2 · A-02 — P4 actualiza los periodos pendientes

- **Alcance:** en la transacción de confirmación, actualizar `importePrevisto` de `PENDIENTE` ≥ fecha efectiva, con entrada en historial.
- **Coste:** bajo. **Dependencias:** 2.1 (saber dónde vive el histórico).
- **Criterio de cierre:** prueba del motor con periodos pregenerados; verifica que no toca los ya cobrados ni los anteriores a la efectividad.

### 2.3 · A-06 — Selector canónico del documento del gasto

- **Alcance:** una función única que devuelva el documento de un gasto (`documento`, `documentos[]`, `justificanteUrl`, `justificantePath`) y su estado de custodia; usada por fiscalidad, índice documental y P6.
- **Coste:** bajo. **Dependencias:** 2.1 (donde se decide el documento).
- **Criterio de cierre:** gasto manual cuenta como documentado; el ZIP del asesor lo incluye etiquetado como referencia no custodiada; prueba unitaria de ambos motores.

---

## Fase 3 — Integridad de datos y captación

### 3.1 · A-03 + A-08 — Cliente de captación

- **Alcance:** eliminar la reescritura con snapshot vacío; suscribir `candidatos`/`solicitudes` con `dataScope`; mostrar estado de error cuando la consulta se deniega.
- **Coste:** bajo. **Dependencias:** 1.1 (si se cambian los permisos, el ámbito del cliente debe coincidir).
- **Criterio de cierre:** snapshot vacío no escribe (espía); propietario y gestor ven exactamente los suyos; test de componente.

### 3.2 · A-13 — Cierre de campos y límite de tasa

- **Alcance:** `hasOnly` en las reglas de alta pública con la lista blanca del formulario; `estado` forzado; limitador en las rutas públicas.
- **Coste:** bajo-medio. **Dependencias:** 1.1.
- **Criterio de cierre:** alta con campo extra → denegada; 30 req/min → 429; alta legítima sigue funcionando (prueba del portal completo).

### 3.3 · A-05 — Identificador de propietario en el alta de profesionales

- **Alcance:** `currentUser.propietarioId` en lugar de `currentUser.id`; mismo ajuste en el filtro de UI.
- **Coste:** muy bajo. **Criterio de cierre:** prueba de harness/emulador + alta manual como propietario.

### 3.4 · A-09 — Semilla sin usuarios

- **Alcance:** no crear usuarios demo; solo catálogos, y solo fuera de producción.
- **Coste:** muy bajo. **Criterio de cierre:** prueba de arranque con `usuarios` vacía en entorno de producción → 0 usuarios creados.

---

## Fase 4 — Higiene técnica (paralelizable)

| # | Hallazgo | Acción | Criterio de cierre |
|---|---|---|---|
| 4.1 | A-10 | Retirar/re-basar las 3 guardas; CI en `push` a `main`; limpiar ramas del workflow | `test:integracion` 302/302; run en `main` |
| 4.2 | A-11 | Actualizar `nodemailer` (mayor), `source-map-js`, `vite` | `npm audit --omit=dev` sin altas + suite verde + SMTP aislado |
| 4.3 | A-07 | Dejar de escribir y purgar `passwordHash`; eliminar login directo | `grep` sin resultados; login solo Firebase Auth |
| 4.4 | A-14 | Mensaje genérico + id de correlación en el 500 de avisos | Prueba de error inyectado sin texto interno |
| 4.5 | A-15 | *Lazy load* por sección | Chunk inicial < 1 MB; medición en aceptación |
| 4.6 | A-16 | Índice de documentos vigentes; marcar históricos | `docs/README` con estado por documento |
| 4.7 | A-17 | Marcar datos de caché y su fecha | Prueba de UI |
| 4.8 | A-18 | App Check/reCAPTCHA en el proyecto | Prueba de llamada sin token → bloqueada |
| 4.9 | A-19 | README de puesta en marcha | Existe y es correcto |

---

## Qué necesita pruebas reales y qué puede cerrarse en CI/emulador

| Se puede cerrar en CI/emulador | Necesita entorno real autorizado |
|---|---|
| A-20 (reglas + emulador) | A-20 en su dimensión de **datos existentes** (¿hay profesionales con ficha activos?) |
| A-01 (reglas + emulador, si se elige 2.1-b) | A-01 si se elige 2.1-a (migración de `registroCobros` a colección) |
| A-02, A-03, A-05, A-06, A-08, A-09, A-13 (unitarias/UI) | A-04 (enlaces vivos, caducidad decidida y comunicada) |
| A-07, A-10, A-11, A-14, A-15, A-17, A-19 | A-16 (gobernanza: decisión del equipo) |
| — | A-18 (App Check requiere configuración del proyecto) |
| — | V-1 … V-7 (reglas publicadas, SMTP, cron, GCS, IA, UI por rol) |

---

## Criterios globales para considerar cerrada **esta auditoría**

La auditoría deja de estar «parcial» cuando existan:

1. **Evidencia E4** de los recorridos D1–D5 y D9–D11 con datos sintéticos en un entorno autorizado, con verificación posterior de la persistencia.
2. **Acta de comparación** reglas publicadas ↔ repositorio.
3. **Prueba de entrega real** de un aviso (SMTP) y **ejecución observada** del cron.
4. **Cierre de A-20 y A-01** con sus pruebas de regresión en el emulador oficial.
5. **Prueba por rol** de la matriz de permisos sobre el entorno de aceptación.

Hasta entonces, el dictamen sigue siendo: **auditada parcialmente; no se puede declarar la aplicación segura ni funcional en su conjunto.**
