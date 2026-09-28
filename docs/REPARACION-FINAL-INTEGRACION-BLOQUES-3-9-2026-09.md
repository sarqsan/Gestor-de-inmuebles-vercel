# Auditoría y reparación final de PR #10 — 28-09-2026

## Estado ejecutivo

**PR #10 todavía no debe fusionarse.** La reparación local está basada en el head remoto real del PR, `d4fc378abcb31872d04c53b64fe78ffd9c214121`; las validaciones del nuevo head se registrarán aquí después de ejecutarlas. No se ha fusionado ni modificado `main`.

## Custodia y reconciliación Git

- Se comprobó el branch local, `HEAD`, remotos, `origin/main`, rama remota del PR y estado completo del árbol antes de editar código.
- El `HEAD` local inicial era `c6b858d4bc0e744ec302e497f2d318884e669c0d`, con 68 rutas modificadas y 147 entradas de estado no seguido (265 archivos al expandir directorios; sin cambios staged). El remoto del PR se comprobó con `git ls-remote` y fetch: seguía en `d4fc378abcb31872d04c53b64fe78ffd9c214121`.
- Las 672 rutas del árbol local se compararon con el árbol remoto: cero rutas ausentes/extra y cero diferencias de contenido o modo.
- Antes de reconciliar se guardó un archivo de custodia en `.git/arena-custody/pr10-pre-reconcile-20260928T173404+0000/`: inventario, diff binario, copia del índice y tar de las 333 rutas con estado local. SHA-256 del tar: `f8e61254489ce082be29d81f0b18e4fc408078abac607cce2658c9f41a5e602d`.
- El clon era shallow y cortaba la relación entre `c6b858d` y los heads remotos. Se obtuvo la historia completa de `main` (160 commits); entonces se confirmó que `c6b858d` era ancestro de `main` y que el PR estaba 82 commits por delante de ese `HEAD` (70 commits de main + 12 del PR).
- Tras la custodia y la igualdad exacta del árbol, se avanzó la rama fija `arena/01a0e6d9-gestor-de-inmuebles-vercel` al head remoto con reset mixto, sin checkout destructivo ni cambios en los archivos del working tree. El punto de partida de las reparaciones es `d4fc378`; la rama queda limpia respecto a ese head.

## Reconciliación del alcance por bloques

`main` permanece en `967ea936c70c4402a3f325667c566f04fb88b415`. El PR #10 está abierto, apunta a `main` y es el único vehículo de integración.

| Bloque | Fundamentos que ya están en `main` | Aporte que corresponde a PR #10 |
|---|---|---|
| B2 | Modelo canónico de gestiones de cartera y un onboarding patrimonial acotado/demo; no es el flujo productivo completo de invitación de carteras. | `ac70512` y documentación: onboarding, invitaciones, persistencia e interfaces dedicadas y sus pruebas. |
| B3 | Proyección de carteras completas; las delegaciones parciales no se elevan a acceso de cartera completa. | `c481ba7`: índice de relación parcial y enforcement Firestore/Storage por inmueble. |
| B4 | `94e11d6` documenta cierre de retención; no implementa el flujo de alquiler de B4. | `f7e16be`: flujo transaccional/UI de alquiler y contratos con ámbito parcial, reglas y pruebas. |
| B5 | Helpers y superficies de mantenimiento/gasto preexistentes. | `633a323` y reconciliación: puente de mantenimiento a gasto, `origen/origenId`, identidad determinista y pruebas. |
| B6 | `a9ef729` aporta expediente documental/fiscal; `c03d267` añade exportación fiscal ZIP. | `f10a45e`: gestor documental patrimonial, persistencia Firestore/Storage, auditoría y UI que extienden el índice documental canónico. No es un segundo motor fiscal ni un índice paralelo. |
| B7 | Fundamentos existentes de importación/exportación. | `413ea53`: XLSX integrado en el flujo canónico con adaptadores y pruebas. |
| B8 | Motor y dry-run de migración existentes. | `2c7eb02`: inventario de evidencias y barrera determinista de solo lectura; no migra registros. Los resultados esperados del test son fixtures/assertions, no datos reales migrados. |
| B9 | Cliente Gemini del servidor y funciones de IA existentes. | `5e165b4`: ayuda/experiencia, intents y validación contextual/RBAC; reutiliza el cliente existente y no hace escrituras Firestore directas. |

La afirmación previa del informe y del cuerpo del PR que atribuía B3/B4 a commits ya presentes en `main` era incorrecta y se ha eliminado. `a9ef729`, `c03d267` y `94e11d6` sí son ancestros de `main`, pero no son las implementaciones B3/B4 aportadas por el PR.

## B5 — persistencia verificable, errores y reintentos

### Consumidores inspeccionados

Se inspeccionaron todas las llamadas de producción a `saveGastoFirestore`, `saveGarantiaReparacionFirestore` y `saveTareaMantenimientoFirestore`, incluidas `App.tsx`, los paneles de mantenimiento/garantías, los modales de reforma/trabajo profesional, `RegistrarActuacionModal` y `importExportFirebase.ts`.

Los helpers originales absorbían excepciones. Algunos consumidores muestran éxito tras `await`; `importExportFirebase.ts` tenía su propia verificación posterior a la escritura. Para evitar un cambio global inadvertido, los helpers históricos conservan su contrato `Promise<void>` y su comportamiento best-effort.

### Cambio en B5

Se añadieron resultados explícitos discriminados (`FirestoreWriteResult`) para gasto, garantía y tarea. `RegistrarActuacionModal` usa las variantes verificables y detiene el flujo si una escritura devuelve `{ ok: false }`. El callback del panel usa el resultado verificable de la tarea y rechaza ante error; así el modal presenta el fallo y no se cierra ni muestra éxito.

Las escrituras siguen siendo secuenciales e independientes; **no se afirma atomicidad Firestore ni se introdujo una transacción/batch global**. Si falla una escritura posterior, las anteriores podrían haber confirmado. Ese estado parcial queda visible como error, y los reintentos reutilizan los IDs de gasto/garantía de tarea+fecha.

El gasto sigue usando la identidad determinista del puente y `origen/origenId`. Solo se reutiliza un gasto histórico cuando la tarea contiene el vínculo explícito para la misma fecha (`historialActuaciones[].gastoId` o `ultimoGastoId` junto con `ultimaFechaRealizada`). No se buscan ni infieren relaciones por importe, descripción, fecha aislada o similitud de IDs. Los gastos huérfanos no se migran ni se enlazan automáticamente.

### Cobertura requerida

Se añadieron/prueban los casos de éxito conjunto, error de gasto, error de garantía, rechazo al guardar tarea, repetición con IDs estables y gasto histórico vinculado. También se prueba que un historial/gasto huérfano no se incorpora por similitud de fecha, importe, texto o ID. La suite completa de Vitest y la suite nativa pasaron en el árbol de reparación (resultados en «Validación de la reparación»).

## Fechas de calendario

Los usos y tests existentes definen “meses” como meses de calendario y fijan que `2026-02-28 + 6 meses = 2026-08-28`; por tanto, la regla implementada conserva el día numérico y, cuando ese día no existe en el mes destino, lo limita al último día disponible. No mantiene una marca persistente de “fin de mes” para recurrencias: cada cálculo conserva el día numérico de la fecha de referencia que recibe.

Se reemplazó `setMonth/setUTCMonth` para estos cálculos por aritmética civil de año/mes/día. Esto evita el desbordamiento (por ejemplo, `2026-08-31 + 6 meses = 2027-02-28`, no una fecha de marzo) y no convierte una fecha civil a un instante que pueda desplazar el día local. La misma regla se aplica al cálculo de garantías y a recurrencias; las fechas de tipo `Date` se leen en calendario local. El resto de estados continúa comparando el día local y los tests cubren `Europe/Madrid`/DST.

La política concreta queda cubierta por pruebas de enero 31 + 1/6 meses, agosto 31 + 6 meses, febrero 28/29, mes de 30 días, recurrencia y cambio DST. Los tests del motor pasan dentro de Vitest completo y los tests específicos del Bloque 9 pasaron 119/119.

## Reparaciones y custodia previas

- `46bb9f7`: corrección de fechas locales/calendario y pruebas DST.
- `9c6defd`: reconciliación de cambios B5/B7.
- `d4fc378`: alineación de custodia; mantiene el alcance patrimonial comprobado y sus límites.

## Validación de la reparación (árbol derivado de `d4fc378`)

Resultados ejecutados sobre el árbol de reparación publicado; el código funcional no cambió después de estas ejecuciones. La actualización documental de estado se limita a consignar los resultados:

| Validación | Resultado |
|---|---|
| Tests nativos de Operaciones + Patrimonial (`node --test src/features/operaciones/tests/*.test.mjs src/features/patrimonial/tests/*.test.mjs`) | **389/389**, 0 fallos. |
| Bloque 5 (`npm run test:bloque-5`) | **186/186** comprobaciones; 182/182 tests Vitest. |
| Bloque 7 (`npm run test:bloque-7`) | **435/435** comprobaciones; 428/428 tests Vitest. |
| Bloque 8 (`npm run test:bloque-8`) | **211/211**, 4 archivos. |
| Bloque 9 (`npm run test:bloque-9`) | **119/119**, 12 archivos. |
| Vitest completo (`npx vitest run`) | **2.559/2.559**, 131 archivos. |
| Lint (`npm run lint`) | Correcto (`tsc --noEmit`). |
| Build (`npm run build`) | Correcto: 2.353 módulos Vite y bundle de servidor. Se mantienen avisos ya conocidos de imports dinámicos/estáticos y del chunk principal >500 kB; no son errores. |
| `git diff --check` | Correcto, sin errores de whitespace. |

La suite nativa verifica custodia/aislamiento, procedencia e identidad y guardas de reglas. Sus expectativas se actualizaron solo donde el baseline había quedado obsoleto: SHA del helper canónico ya presente en `main`, superficie exacta de los puentes B5/B9 y aserción positiva de que las reglas deniegan campos de carteras al crear un propietario. No se relajaron Rules ni guards de aislamiento.

La validación refleja este árbol de trabajo derivado del head remoto `d4fc378`; los checks remotos del commit reparado se comprobarán tras el push. No se atribuyen como resultados de esta ejecución checks anteriores ni se declara que PR #10 esté fusionado.

## Seguridad e infraestructura

La reparación conserva las mismas rutas Firestore, serialización y reglas de autorización; las nuevas funciones solo hacen observables los resultados de los mismos `setDoc` existentes. No se añade acceso administrativo ni se relajan permisos.

**INFRA-01:** Firebase Emulator no se ejecutó por limitación de infraestructura. No se afirma validación oficial de Rules mediante Emulator y no se intentará instalarlo en esta orden. No se usaron datos de producción; el Bloque 8 no realizó migración real. Las suites de IA son locales y no hacen llamadas live a Gemini.

## Estado

**PR #10 está abierto y listo para merge; no se ha fusionado ni modificado `main`.** Las validaciones locales y los checks remotos del head publicado están completos; no se ejecutará la fusión en esta orden.
