> **Nota de reparación controlada P3 — 2026-10-18**: documento histórico recuperado del parche. No describe el estado vigente tras la reparación. La importación manual de extractos está deshabilitada por alcance conservador (E-07), la generación SEPA pain.001/pain.008 se conserva (E-06 del inventario), y las decisiones P3 requieren evento append-only con motivo y actor autenticado. Para el estado actual, prevalece el informe final de esta reparación y el código en main.

# P2 — Justificantes de cobro: implementación y validación local

**Corte funcional:** 2026-10-17 · **Revalidación local:** 2026-10-18 · **Estado:** **A_MEDIAS** — implementación integrada en el commit `9562b8230a337048566208bd91ef4a51b2447372` de la rama de sesión; persistencia/recuperación durable Firestore/Storage no verificada.  
**Rama fija:** `arena/d2bfa306-gestor-de-inmuebles-vercel`; checkout local `HEAD=f782e53ed3beefa4cdcae4e839457480f9cfd995`, `main=origin/main=f782e53`; la ref remota de sesión sigue en `13c0159d3e7b87b0035d7a16b73efd2eda8096d1`, seis commits por delante. La cadena funcional publicada no se integró en `main`; el worktree queda preservado y las métricas siguientes son del checkout actual, no del SHA remoto. Sin commit/push, PR, merge, deploy ni acceso productivo.  
**P1:** continúa **BLOQUEADA/PENDIENTE** por falta de recepción SMTP acreditada. P1 es independiente y no es requisito para el desarrollo P2.

## Resultado funcional

- Un inquilino autenticado presenta un PDF, JPEG o PNG de hasta 4 MiB, con importe, fecha y método declarados. El servidor comprueba firma real del archivo, MIME, tamaño, vínculo del inquilino con el contrato y la correspondencia exacta contrato–cobro–propietario–inmueble. No confía en la validación del formulario.
- Un propietario titular o gestor delegado puede consultar y descargar documentos dentro del ámbito vigente. Propietario y gestor requieren identidad verificada, relación/permiso actual y alcance del contrato en cada petición. Las decisiones se autorizan de nuevo en el servicio; ocultar botones no es la protección.
- Las acciones humanas aceptan, rechazan con motivo o rectifican con motivo. Presentaciones nuevas después de rechazo conservan las versiones anteriores y crean trazas adicionales.
- El flujo usa estados documentales `SUBIENDO`, `ERROR_SUBIDA`, `PENDIENTE_REVISION`, `ACEPTADO` y `RECHAZADO`. CAS por versión, clave idempotente, reintentos y reparación de eventos cubren concurrencia y respuestas inciertas. El historial ordena eventos por versión y la descarga comprueba el vínculo del objeto actual o histórico.
- Documentos y auditoría se guardan en `justificantes_cobro` y `justificantes_cobro_auditoria`; el binario privado se maneja por el adaptador servidor de Google Cloud Storage. La API falla cerrada con 503 `P2_NO_DISPONIBLE` cuando no están configuradas las dependencias durables.

## Frontera contable (invariante)

P2 es una verificación **documental**, no una verificación bancaria. Subir, consultar, aceptar, rechazar o rectificar no actualiza `CobroPeriodo`, no llama a `registrarPagoPeriodo`, no crea ingresos, no concilia movimientos y no marca el dinero recibido. La fecha, el importe y el método son declaraciones asociadas al comprobante, no evidencia bancaria. La conciliación y contabilización deben seguir su propio flujo y requerir evidencia/confirmación correspondiente.

## Archivos principales

- Servicio, adaptador y rutas: `server/cobros/justificantesCobro.ts`, `server/cobros/almacenGoogleStorage.ts`, `server/cobros/rutasJustificantesCobro.ts`.
- API autenticada: `src/lib/justificantesCobroApi.ts`.
- Presentación/revisión: `src/components/portal-inquilino/PresentarJustificanteCobro.tsx`, `src/components/sections/JustificantesCobroInbox.tsx`, y su conexión a `PortalRecibos.tsx` / `CobrosSection.tsx`.
- Contrato/tipos y dependencias: `server.ts`, `server/ia/configuracionIA.ts`, `server/titularidades/googleBackend.ts`, `src/types.ts`.
- Regresiones: `server/cobros/justificantesCobro.test.ts`, `server/cobros/almacenGoogleStorage.test.ts`, pruebas UI de los dos componentes, `tests/justificantes-cobro-reglas.test.ts`, `tests/ia-fase1-integracion-server.test.ts` y `tests/ia-fase2-gobierno-firestore.test.ts`.

## Evidencia ejecutada

| Comprobación | Resultado del corte vigente |
|---|---|
| P2 directo (servicio, Storage, reglas estáticas y UIs) | **27/27 en 5 archivos**. Tests con dobles/adaptadores sintéticos; no demuestran durabilidad externa. |
| P2 ampliado (incluye arranque ESM/gobierno IA y paginación Firestore) | **84/84 en 7 archivos**. Tests con dobles/adaptadores sintéticos; no demuestran durabilidad externa. |
| Vitest global, sin exclusiones | **247/248 archivos aprobados; 4.445 passed, 2 failed, 0 skipped, 7 todo** en el worktree local. Los dos fallos son pruebas A-04 que exigen `OK` pese a warnings reales por el borrado DEC-01 y la divergencia a la punta remota. |
| `npm run auditoria:repositorio` / A-04 | **Exit 1, A-04: WARNING**: `HEAD=f782` vs `origin/arena/...=13c0159` más la baja intencional de DEC-01. La guarda no se alteró; no mover refs ni recrear el modal para obtener `OK`. |
| `npm run lint` / `npx tsc --noEmit -p .` | Exit 0, sin errores; `npm run lint` reejecutado en este cierre. |
| `npm run build` | Exit 0; Vite transformó 2.424 módulos. Warnings no bloqueantes de imports mixtos y chunk principal >5 MB. No deploy. |
| Separación económica | El servicio/rutas P2 no escribe `CobroPeriodo` ni llama a `registrarPagoPeriodo`; el comprobante sigue siendo evidencia documental y no acredita el dinero. |
| Aceptación durable | **Pendiente:** sin Firestore/Storage/emulador autorizado ni recuperación byte-identical tras reinicio. |
| `git diff --check` | Reejecutado después de actualizar la documentación: exit 0; scan de patrones limitados sin coincidencias, según el informe Git de corte. |

### Guardias nativas fuera de la suite Vitest — revalidación 2026-10-18

- `npm run test:operaciones`: **301/302**; falla solo el test 120, que encuentra rutas locales P1–P4/IA/DEC-01 fuera de la allowlist respecto a f782. El pase inicial de custodia fue 298/302: los tests 211, 221 y 223 no describían la semántica de Rules visible en f782; se alineó el harness con el `opRef(..., i)`, `data.idAfectado`, firmas `opDominio`/`opCambio`, snapshots y ausencia de `get/exists`, conservando las comprobaciones. Regresión focal `rules-harness`: 20/20. Tests 113 1/1, 119 1/1 y arquitectura 17/17 también pasan tras el cambio textual exacto de la guarda y el fetch puntual de su checkpoint; el test 120 sigue siendo el único fallo.
- `npm run test:patrimonial`: **86/88**; falla 87 por rutas fuera de la superficie permitida y 88 por el delta P3 de `firestore.rules` frente a f782. En 88 pasa primero la verificación de que la única baja sea el modal DEC-01, que no exista y que no haya renombres. No se amplió la allowlist, no se repinneó la regla ni se publicó Rules.
- Los antiguos resultados **290/302** de Operaciones y **85/88** de Patrimonial pertenecen a cortes históricos de este informe; no describen la ejecución actual. El detalle por fallo y raíz Git está en `docs/ESTADO-GIT-ERP.md` (sección de triage A-04/guardias).

## Límites de verificación y bloqueos exactos

- No hay `java` ni Firebase CLI en el sandbox; por eso no se ejecutaron emuladores oficiales de Firestore/Storage. Las dos pruebas de Rules son estáticas/sintéticas.
- No se dispuso de un proyecto/bucket sandbox autorizado para comprobar Firestore y Cloud Storage reales. Los tests del adaptador simulan `fetch`; no se afirma persistencia ni recuperación real de binarios, ni operación byte-identical después de reiniciar una función.
- La implementación P2 no altera `firestore.rules`, `storage.rules`, índices, `firebase.json`, `.firebaserc`, dependencias ni datos; el delta local de `firestore.rules` pertenece a P3 y no se publicó. Tampoco se consultaron credenciales/secretos ni información personal.
- El código P2 se publicó únicamente en la rama fija de sesión; no se hizo deploy ni se publicó en un entorno productivo. Los resultados locales no prueban el entorno de producción.
- El registro de auditoría es append-only a través del servicio (eventos creados y no editados por las rutas implementadas); no se configuró una política de retención/WORM del proveedor y no se afirma inmutabilidad infraestructural.

## Revalidación de custodia Git en el checkout actual (2026-10-18)

El clon es shallow (`.git/shallow` marca f782). El corte funcional P2 fue integrado y publicado en la rama fija mediante `9562b8230a337048566208bd91ef4a51b2447372`; el checkout local sigue en `f782e53ed3beefa4cdcae4e839457480f9cfd995` y la ref remota publicada en `13c0159d3e7b87b0035d7a16b73efd2eda8096d1`, seis commits más adelante. A-04 da `WARNING` en este estado por la divergencia local/remota y el borrado intencional DEC-01; no se cambió la guarda ni se movieron refs. El objeto histórico exacto necesario por una guardia quedó en `FETCH_HEAD`, no en una rama. Se preservan las 138 entradas de worktree y `/home/user/erp-continuity-backup-20261018/`; no se hizo commit, push, PR, merge, deploy ni acceso productivo. Los OID P2 anteriores (`bce3ccde…`, `f8d259b…`, `8e12f59…`) siguen como referencias históricas, no como prueba de estado actual.

## Qué falta para aceptación durable

En cuanto exista infraestructura no productiva autorizada: ejecutar la matriz autenticada de inquilino/propietario/gestor y denegaciones cruzadas contra servicios reales/emuladores; subir, descargar y recuperar el mismo hash después de reinicio; comprobar persistencia del estado y auditoría entre instancias; verificar permisos del bucket y respuestas fail-closed sin exposición de datos. Mantener separado el registro bancario. Este pendiente no cambia el dictamen P1 ni lo condiciona.
