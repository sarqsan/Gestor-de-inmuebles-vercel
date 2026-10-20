> **P4-B · 2026-10-20:** para la implementación actual de persistencia efectiva condicionada, prevalece [P4-B-ACTUALIZACION-EFECTIVA.md](P4-B-ACTUALIZACION-EFECTIVA.md). Se conservan los bloqueos normativos; el contenido siguiente es histórico y no acredita el cierre actual ni el estado de Git.

> **Nota de reparación controlada P3 — 2026-10-18**: documento histórico recuperado del parche. No describe el estado vigente tras la reparación. La importación manual de extractos está deshabilitada por alcance conservador (E-07), la generación SEPA pain.001/pain.008 se conserva (E-06 del inventario), y las decisiones P3 requieren evento append-only con motivo y actor autenticado. Para el estado actual, prevalece el informe final de esta reparación y el código en main.

# P4 — actualización contractual anual de renta

**Informe de implementación y validación · corte funcional 17-10-2026; revalidación de checkout 18-10-2026**  
**Estado funcional: `A_MEDIAS` · código publicado en la ref remota de sesión por `9562b8230a337048566208bd91ef4a51b2447372`; el checkout local continúa en `HEAD=f782e53` con worktree preservado. No fusionado en `main`, sin envío, cron productivo ni Firestore real.**  
Unidad canónica: `RNT-01` en [inventario funcional](anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md). Este informe documenta evidencia y límites; no constituye asesoramiento jurídico ni acredita una actualización contractual concreta.

## 1. Dictamen ejecutivo

La rama de sesión contiene un motor determinista, una vista previa completa, endpoints server-side, confirmación expresa del propietario o gestor con permiso de escritura, un anexo borrador v1 inmutable, auditoría, claves de idempotencia y un aviso registrado como `PENDIENTE_ENVIO`. En las pruebas, los cobros y recibos históricos no se escriben ni se alteran.

La focal P4 directa vigente es **39/39 pruebas en cuatro archivos** (22 motor, 10 servicio, 3 rutas y 4 panel); las **45/45** de documentos anteriores no describen el conjunto actual. En la revalidación global, Vitest registra **247/248 archivos; 4.445 passed, 2 failed, 0 skipped, 7 todo**: los dos fallos son expectativas A-04 que exigen `OK` pese al warning actual del checkout local. La batería Treasury/asistente/P3 pasa **126/126 en 8 archivos**. A-04 da **WARNING/exit 1** por `HEAD=f782` frente a la ref remota `13c0159` y la baja intencional DEC-01; no se modificó la guarda. `npm run lint` y `npm run build` pasan. Las guardias nativas siguen **Operaciones 301/302** (test 120) y **Patrimonial 86/88** (87 y 88); detectan alcance fuera de la allowlist y el delta local de Rules, respectivamente, sin relajarse. No hubo commit/push/PR/merge/deploy; detalle en `docs/ESTADO-GIT-ERP.md`.

No se cierra P4: el RDL 29/2026 y el artículo 18 LAU requieren una resolución legal específica para su interacción con cohortes y cláusulas; la fuente del máximo individual de precios no está conectada; el servicio actual no proporciona ese dato al motor. Firestore/emulador, autorización IAM, recuperación durable, entrega de correo y publicación en bandeja interna no se probaron con servicios reales. El caso de confirmación durable del servicio usa una calculadora y un puerto en memoria inyectados; **no demuestra que una actualización jurídica concreta sea calculable ni que se haya escrito en Firestore**. No hubo cron productivo, correo real ni operación externa.

## 2. Fuentes oficiales cotejadas antes de codificar

Consulta efectuada el **17-10-2026**. Se guardan URL, fechas y ámbito junto al motor. La consolidación LAU advierte que tiene carácter informativo y carece de valor jurídico; el texto original del BOE se cotejó para el cambio extraordinario.

| Fuente primaria | URL | Publicación / vigor / consulta | Índice o periodo | Lectura utilizada y límite |
|---|---|---|---|---|
| BOE — Ley 29/1994 (LAU), texto consolidado a 2026-10-07, arts. 18.1–18.2 | <https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003&p=20261007&tn=0> | Consolidación 2026-10-07; consulta 2026-10-17 | — | Art. 18.1: actualización anual en los términos pactados; sin pacto expreso no se actualiza; si el pacto no detalla índice/metodología, entra el IRAV como mecanismo y límite general. Art. 18.2: comunicación escrita y exigibilidad desde el mes siguiente. El texto revisado **no fija un preaviso general de 30 días**. La consolidación es informativa; no se infiere la cláusula individual. |
| BOE — Real Decreto-ley 29/2026, texto original, BOE-A-2026-20823, disposición final sexta | <https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823> | Publicado 2026-10-07; en vigor 2026-10-08; consulta 2026-10-17 | Anualidades 2026-10-08 a 2027-12-31 | Si la renta supera el máximo individual aplicable del sistema de índices, no hay incremento; en otro caso rige el nuevo pacto y, si falta, el incremento no puede superar el 2 %. La interacción con art. 18.1, DA 11.ª, régimen temporal y cláusula preexistente no se automatiza sin revisión. |
| BOE — Resolución de derogación del RDL 26/2026, BOE-A-2026-20526; texto derogado BOE-A-2026-20266 | <https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20526> · <https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20266> | RDL publicado 2026-09-30; resolución de derogación publicada 2026-10-02; consulta 2026-10-17 | — | El RDL 26/2026 fue derogado; sus cambios no se consideran vigentes para este motor. |
| BOE — Real Decreto-ley 28/2026, BOE-A-2026-20822 | <https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20822> | Publicado 2026-10-07; consulta 2026-10-17; modificación señalada con efectos desde 2026-11-15 | Art. 10 LAU, no cálculo del art. 18 | Se registra como ámbito distinto; no se mezcla con la regla de actualización aquí revisada. |
| BOE — Resolución del INE que define el IRAV, BOE-A-2024-26685 | <https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-26685> | Publicada 2024-12-20; en vigor 2025-01-01; consultada 2026-10-17 | Serie IRAV1 | Se registra como base metodológica. No sustituye la verificación de la cláusula ni la aplicación individual de topes. |
| INE — serie oficial IRAV1 | <https://www.ine.es/consul/serie.do?d=true&s=IRAV1&c=2&nult=100> · ficha de últimos datos <https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177110&idp=1254735976607&menu=ultiDatos> | Consultada 2026-10-17; ficha de la serie consultada de nuevo para este informe | `2026M08`: **2,47 %**, definitivo, publicado 2026-09-15. `2026M09`: **2,54 %**, definitivo, publicado 2026-10-14. | La serie oficial devuelve estos dos periodos/valores como definitivos; la ficha actual identifica `2026M09` como último dato y muestra la publicación del 14-10-2026. Se conserva también fecha de publicación histórica del periodo `2026M08`. |
| INE — publicación/calendario del índice | <https://www.ine.es/uc/oC7D0Ncd> · <https://www.ine.es/dynt3/Calendario/calenHTML.htm> | Consultados 2026-10-17 | IRAV1 `2026M09` | URLs guardadas con la observación. El repositorio contiene una fotografía versionada, **no** un refresco automático del INE. |

## 3. Criterios funcionales y fronteras

| Dato / decisión | Tratamiento en P4 | Límite / respuesta si falta |
|---|---|---|
| Fecha de celebración | Se representa como `fechaCelebracionContrato` / `fechaCelebracion`; no se sustituye por la fecha de inicio. | Ausente, inválida o no acreditada ⇒ `REQUIERE_REVISION`. |
| Fecha de inicio y aniversario | El aniversario se deriva de `fechaInicioContrato`, de forma determinista. | Día 29-02 sin convención jurídica acreditada ⇒ `ANIVERSARIO_BISESTO_REQUIERE_REVISION`; no normaliza a otro día. |
| Modalidad y uso | Distingue vivienda habitual, temporada, habitación y uso distinto/local; necesita finalidad y referencia documental, y causa/uso acreditados en los subcasos correspondientes. | No deduce uso ni equipara temporada/habitación a vivienda habitual; fuera de alcance o dudoso ⇒ revisión. |
| Cláusula | Estados separados `ACREDITADA`, `AUSENTE_CONFIRMADA`, `NO_ACREDITADA`; la acreditada requiere extracto y referencia localizable al documento original. | No infiere que exista o falte cláusula; no cambia IPC/IGC por IRAV. |
| Índice | `IRAV1`, con valor, serie, periodo, estado, fecha de publicación/consulta y URLs; solo observa definitivos ya publicados antes de la fecha aplicable. | No anticipa un dato futuro. El snapshot tiene guardia técnica de antigüedad de 45 días; no existe descarga automática en esta versión. |
| Topes | Presenta IRAV y el límite extraordinario cuando proceda; el máximo individual se acepta únicamente como entrada marcada verificada en servidor. | El servicio P4 no obtiene actualmente el límite oficial individual y entrega `{}` al motor; durante el periodo extraordinario no propone importe. Incluso con un límite sintético, conserva revisión por interacción legal pendiente. |
| Fecha de efectividad | Función pura calcula el primer día del mes siguiente solo a partir de una fecha de comunicación válida. | Preview/confirmación dejan `fechaEfectividad: null`; no acreditan que se haya comunicado. |
| Aviso y canales | Preview `NO_PROGRAMADO`/`NO_COMUNICADO`; tras confirmar se registra `PENDIENTE_ENVIO`. Email e inbox llevan estados de validación independientes. | No se envía correo, no se publica en bandeja ni se afirma recepción SMTP. No hay cron productivo ni preaviso legal inventado de 30 días. |
| Resultado sin base suficiente | Estados `CALCULABLE`, `SIN_ACTUALIZACION` o `REQUIERE_REVISION`, según evidencia y ramas implementadas. | `REQUIERE_REVISION` no contiene porcentaje ni renta futura. No propone importe si falta dato, prueba o certeza jurídica. |

**Precisión del alcance actual:** a la fecha de corte, las anualidades que caen en la ventana extraordinaria revisada no se convierten automáticamente en importe. La prueba de persistencia usa una calculadora sintética inyectada para probar autorización/atomicidad/idempotencia; no es prueba de que el motor normativo actual produzca legítimamente `CALCULABLE` para un contrato real.

## 4. Implementación observada

### 4.1 Motor y vista previa

- `src/utils/actualizacionRentaEngine.ts`: cálculo puro y reproducible; reloj y serie inyectables en pruebas. Aritmética monetaria con céntimos/puntos base y redondeo mitad arriba, separada de la decisión jurídica.
- `src/components/ActualizacionRentaPreviewPanel.tsx`: vista de celebración/inicio/aniversario, modalidad/uso, evidencia de cláusula, renta, índice/topes, importe solo si calculable, aviso/comunicación/efectividad, fuentes y reglas normativas. El botón no confirma por sí solo: exige fecha y casilla de confirmación.
- `src/components/sections/FormalizacionSection.tsx`: integra el panel en el flujo de formalización.
- `src/lib/actualizacionRentaApi.ts`: llamadas relativas a la API autenticada.

### 4.2 API y autorización en servidor

- `server/actualizacionRenta/rutasActualizacionRenta.ts`: `POST /api/contratos/actualizacion-renta/previsualizar` y `/confirmar`; valida token y cuerpo estricto. Si no existe servicio durable, responde 503 en vez de usar memoria.
- `server/actualizacionRenta/servicioActualizacionRenta.ts`: resuelve `usuarios_auth`/`usuarios`, contrato y titular en servidor. Propietario solo puede actuar por su titularidad. Gestor requiere relación aceptada, activa, `LECTURA_ESCRITURA`, responsable actual y alcance que contenga el inmueble; `[]` solo significa cartera completa cuando está explícito. Inquilinos y titulares ajenos se deniegan.
- Antes de confirmar vuelve a autorizar, recalcula la vista previa, compara su huella con la vista previa confirmada, exige `confirmacionExplicita`, fecha elegida y clave de idempotencia.
- La operación construye un solo commit atómico de cinco escrituras, cada una con precondición `NO_EXISTE`: anexo v1, aviso, auditoría, operación/idempotencia y control único por contrato/aniversario. Un replay con los mismos datos recupera resultado; una clave con otros datos o una segunda clave para la misma anualidad se rechaza. El adaptador se apoya en Firestore de servidor si existe credencial; el comportamiento no se verificó contra Firestore real.
- El anexo es `BORRADOR_NO_FIRMADO`, `version: 1`, inmutable y conserva evidencia, renta anterior/propuesta, índice, topes, fuentes, actor y huella. El aviso queda `PENDIENTE_ENVIO`, `NO_COMUNICADO`, efectividad nula; `EMAIL` y `BANDEJA_INTERNA` mantienen banderas de validación separadas. No se actualizan contratos, recibos, cobros ni pagos pasados.

## 5. Evidencia y límites de pruebas

| Suite | Resultado reejecutado | Cobertura demostrada / no demostrada |
|---|---:|---|
| Cuatro archivos focales P4 | **39/39** | 22 engine, 10 servicio, 3 rutas, 4 panel. Cubre fechas/periodos y fuente IRAV, cohorts/topes, modalidad/uso/cláusula, céntimos, permisos, dos titulares, inquilino denegado, gestor en cartera, confirmación, idempotencia/reintentos y no mutación en mock. No emulador/Firestore/SMTP/inbox reales. |
| Focal P3 | **90/90** en 5 archivos | Incluye siete regresiones nuevas de colisión de importación, céntimos, titularidad, CAS, actor/idempotencia y rechazo auditable. La suite Rules es estática; persistencia con mocks. Norma 43 sigue bloqueada. |
| Bloque 7 | **438 PASS / 0 FAIL**; Vitest interno **431/431** | Umbral cobertura 201 ≥ 195 y regresión 230 ≥ 230; no se usa como evidencia de producción. |
| IA por titular | **341/341** en 19 archivos | Dobles cubren dos titulares/inquilinos, llaves/costes/cuotas segregados, alcance de gestor, no-fallback y denegaciones. No consumo real ni Firestore/Gemini. |
| Política IA (`ia:verificar-politica -- --ejemplo`) | Exit 0; plantilla completa de 12 operaciones/4 perfiles | Validador estático, sin escritura/red. No concede autorización de consumo real. |
| Sandbox IA (`ia:validar-entorno -- --ejemplo --usuarios 2 --json`) | Exit 0; proveedor simulado en memoria, 4 perfiles/12 filas | Sin clave, credencial de Firebase, red ni Firestore. La plantilla no equivale a aprobación del consumo y el proyecto externo no fue validado. |
| UX7 | **6/6** | Integración UI local, no recorrido de navegador productivo. |
| Vitest global, sin exclusiones | **247/248 archivos aprobados; 4.445 passed, 2 failed, 0 skipped, 7 todo** | Ejecutado en el worktree local. Los dos fallos son A-04 por expectativas de `OK` incompatibles con los warnings reales; A-04 no fue excluida. |
| A-04 (`npm run auditoria:repositorio`) | **WARNING, exit 1** | `HEAD=f782`, `origin/arena/...=13c0159` y baja intencional DEC-01. La guarda permanece intacta; no mover refs ni recrear el modal para obtener `OK`. |
| Operaciones | **301/302** | Único fallo actual: test 120, alcance local fuera de allowlist contra f782. Los antiguos 211/221/223 eran expectativas del harness no acordes con los helpers/firmas de Rules verificables en f782; corrección mínima revisada, `rules-harness` 20/20. Tests 113 1/1, 119 1/1 y `rules-architecture` 17/17. |
| Patrimonial | **86/88** | Test 87 detecta archivos fuera de la superficie permitida; test 88 pasa el borrado DEC-01 exacto y después falla por `firestore.rules` P3 local distinto de f782 (283 inserciones/80 borrados). No repinnear ni publicar Rules. |
| TypeScript/build | `npm run lint` exit 0; `npm run build` exit 0 | Vite transforma 2.424 módulos. Avisos de imports mixtos y chunk principal 5.401,71 kB. Build no es despliegue. |
| Reglas | `auditoria:reglas:matriz` y `auditoria:reglas:list` exit 0 | Análisis estático de `firestore.rules`; no Java/Firebase CLI disponibles, no Rules compiladas ni publicadas. |
| Inventario | **79/79 fichas** | Validador confirma IDs, estados, fases, relaciones por ID y dependencias/criterios estructurales; el cotejo individual contrastó 290 referencias de ruta (287 resueltas y 3 ausencias explícitas en C-06/UX-03). Recuento recalculado: 5 CERRADA, 64 A_MEDIAS, 2 SIN_EMPEZAR, 6 BLOQUEADA, 2 DESCARTADA. |

## 6. Fases de cierre: cada pendiente tiene dueño y criterio

Estos subgates están vinculados a `RNT-01`; no crean capacidades fuera del inventario. La asignación P/F identifica dónde resolver y evita dejar trabajo huérfano.

| Gate de `RNT-01` | Estado / fase | Criterio verificable para cerrar |
|---|---|---|
| **P4-L1 · Aplicabilidad legal y cohortes** | `A_MEDIAS` · **P4** | Matriz por celebración/inicio, tipo de vivienda/uso, anualidad, régimen transitorio, cláusula y topes, cotejada con texto BOE vigente (incluidos RDL 29/2026 DF 6.ª, LAU arts. 18/DA 11.ª y normas transitorias relevantes). Hasta tener base suficiente, cada caso incierto devuelve `REQUIERE_REVISION`, sin importe ni regla inferida. |
| **P4-L2 · Fuentes IRAV y máximo individual** | `A_MEDIAS` · **P4/F1** | Cargar/actualizar en servidor fuente oficial IRAV1 con URL, publicación/consulta, serie, periodo y estado; verificar vigencia de 45 días. Resolver el máximo individual desde el sistema oficial autorizado, con método, referencia y fecha. Probar dato ausente, futuro, viejo, provisional o contradictorio como fail-closed. |
| **P4-L3 · Evidencia por contrato** | `A_MEDIAS` · **P4/F2** | Recoger/documentar por contrato la fecha de celebración y la de inicio por separado; finalidad/modalidad/causa temporal; cláusula acreditada/ausencia confirmada con extracto y referencia al original; evidencia de uso. Pruebas por vivienda/temporada/habitación/uso distinto; sin inferencia ni importe si falta base. |
| **P4-L4 · Identidad, ámbito y persistencia durable** | `A_MEDIAS` · **P4/F1** | En sandbox autorizado, verificar Firestore de servidor/IAM, reautorización del propietario y gestor por inmueble, denegación del inquilino/otro titular, atomicidad real de las cinco escrituras, colisión/replay, recuperación tras reinicio y ausencia de mutación de cobros/recibos. Si servicio falta, API sigue en 503; no fallback en memoria. |
| **P4-L5 · Versiones y rectificación append-only** | `A_MEDIAS` · **P4/F2** | La versión 1 actual queda inmutable. Diseñar/validar una vía explícita para corrección o siguiente versión (v2+) que conserve la anterior, motivo/actor, auditoría e idempotencia; no permitir `update/delete` de versiones emitidas. Hasta entonces, una segunda confirmación de la anualidad se rechaza. |
| **P4-L6 · Aviso durable, agenda e inbox** | `A_MEDIAS` · **P4/F1–F3** | Mantener registro durable `PENDIENTE_ENVIO`; confirmar la zona horaria/fecha elegida y reintentos idempotentes en entorno no productivo. Probar lectura/publicación en bandeja interna con autorización propia, separada de email. No activar cron productivo. |
| **P4-L7 · Correo externo** | `BLOQUEADA/PENDIENTE` · **P1/F0/F3** | En sandbox autorizado, verificar envío, recepción y ausencia de rebote; un `accepted`, mock o estado del aviso no acredita entrega. Correo no bloquea la validación independiente de inbox interno; no enviar desde esta orden. |
| **P4-L8 · Reconciliación de guardias e integración** | `PARCIAL/BLOQUEADA` · **F5** | La rama de sesión y sus commits auténticos están verificados; P1, P2/P4/IA, el núcleo puro P3 y dos correcciones independientes de guardia se publicaron por separado. No se fusionó `main`. Para reconsiderar una integración amplia deben resolverse la allowlist/superficie (Operaciones 120 y Patrimonial 87) y Rules/emulador (Patrimonial 88), sin debilitar guardias ni repinnear; repetir suites, TSC y build sobre un mismo candidato. El segmento P3 de persistencia/UI/Rules sigue excluido. |

### Condiciones para reconsiderar merge a `main`

La instrucción de integrar subconjuntos seguros se aplicó: la rama fija quedó publicada con commits verificables de P1/DEC-01 (`72232be`), P2/P4/IA (`9562b82`), núcleo puro P3 (`1f03748`), guardias (`4958bb6`), frontera de conciliación manual y mensajes económicos (`0ab3745`) y parser multilinea de guardia (`13c0159`). El push se limitó a `arena/d2bfa306-gestor-de-inmuebles-vercel`; `main` siguió en `f782e53…`. No se creó PR, merge a `main` ni deploy. `git diff --check` pasó; el scan de referencias del inventario dejó solo las tres ausencias declaradas. Las validaciones globales, A-04 y guardias quedan registradas arriba. No se usó reset/clean, rebase destructivo, actualización artificial de refs ni se rebajaron allowlists. La persistencia/UI/Rules P3 no se integró: sin Java/Firebase CLI ni emulador autorizado, los mocks/harness no prueban Rules, ámbito, transacciones o recuperación durables; Patrimonial 88 falla correctamente frente al delta local.

## 7. Decisiones y no-alcance conservados

- **WhatsApp: `DESCARTADA` definitivamente** (DEC-01). No aparece en fases, criterios pendientes ni plan futuro; sus referencias restantes son historia.
- Correo e inbox interno mantienen estados/pruebas independientes. No se afirma recepción SMTP ni publicación interna.
- Sin cron productivo, IA/Gemini real, Firestore/Storage productivos, emuladores oficiales, escrituras con datos reales, publicación de Rules ni despliegue.
- El anexo global conserva 79 capacidades. La fila `RNT-01` enlaza a este informe, incluye criterios/fases y evita un pendiente huérfano. El resumen por módulos se calcula desde un solo registro con `node scripts/validar-inventario-capacidades.mjs`.
- P1 queda **BLOQUEADA/PENDIENTE**, P2 mantiene implementación local pero falta persistencia/recuperación durable y P3 **BLOQUEADA/PENDIENTE** por Norma 43, autorización/persistencia reales y guardias. Estos estados no se promueven por pruebas locales, mocks o commits.

## 8. Archivos y evidencias fuente

- Motor y fuentes: `src/utils/actualizacionRentaEngine.ts`.
- API y autorización: `server/actualizacionRenta/rutasActualizacionRenta.ts`, `server/actualizacionRenta/servicioActualizacionRenta.ts`.
- UI e integración: `src/components/ActualizacionRentaPreviewPanel.tsx`, `src/components/sections/FormalizacionSection.tsx`, `src/lib/actualizacionRentaApi.ts`.
- Focal P4: `src/utils/actualizacionRentaEngine.test.ts`, `server/actualizacionRenta/servicioActualizacionRenta.test.ts`, `server/actualizacionRenta/rutasActualizacionRenta.test.ts`, `src/components/ActualizacionRentaPreviewPanel.test.tsx`.
- Inventario canónico y recuentos: `docs/anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md` y `scripts/validar-inventario-capacidades.mjs`.
- Custodia/decisión de no-integrar: `docs/ESTADO-GIT-ERP.md`; continuidad: `docs/CONTINUIDAD-ARENA.md`; mapa canónico: `docs/MAPA-MAESTRO-ERP-ACTUAL.md`.
