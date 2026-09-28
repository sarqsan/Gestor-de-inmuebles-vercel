# Reparación final e integración de Bloques 3–9 — 28-09-2026

## Estado ejecutivo

**VALIDADO EN ARENA; INTEGRACIÓN EN `main` PENDIENTE.** La reconciliación y las reparaciones están en `arena/01a0e6d9-gestor-de-inmuebles-vercel`, ya enviada a `origin` y asociada al PR #10 hacia `main`. El PR sigue abierto. No se declara «INTEGRADO Y VALIDADO»: no se ha actualizado `main` ni se han ejecutado pruebas sobre un `main` post-merge.

## Estado inicial inspeccionado

- `origin/main`: `967ea936c70c4402a3f325667c566f04fb88b415` (`967ea93`). Los commits de Bloques 3/4 identificados en la auditoría previa (`a9ef729`, `c03d267`, `94e11d6`) ya estaban en esa historia.
- Arena B (rama de esta sesión): `5e165b418c523f1953d9c6c0818ae98be3152647` (`5e165b4`); contenía los bloques 6, 8 y 9 pendientes de integrar.
- Arena C: Bloque 5 `633a32338e44d90adee43250cd0008048dae85b1` (`633a323`) y Bloque 7 `413ea531627c088badad1db8357da5fcb4565f8e` (`413ea53`). Los cambios de B/C solapaban principalmente `package.json` y `src/types.ts`, además del escritor de mantenimiento en B5.
- No se usaron datos de producción.

## Reconciliación y reparaciones

Se integró Arena C en Arena B después de las validaciones previas. Los conflictos de `package.json` y `RegistrarActuacionModal.tsx` se resolvieron combinando los scripts de los dos lados, el puente canónico B5 y las correcciones de fecha; no se descartaron cambios de ninguna rama. El port de Bloques 5 y 7 conservó sus motores y superficies canónicas, sin crear sistemas paralelos.

- **Fechas de mantenimiento:** aritmética de fecha calendario en UTC como contenedor; comparación de estado contra el día local; fecha por defecto local para `input[type=date]`. La fecha de fin de garantía del modal ahora usa `calcularFechaFinGarantia`, y no una segunda implementación. Regresión reproducida en `Europe/Madrid`: `2026-02-28 + 6 meses` permanece `2026-08-28` (antes podía quedar en `2026-08-27`). También se cubren próximo mantenimiento y estados alrededor del día local.
- **B5 mantenimiento → gasto:** el modal usa `operacionGastoEngine`, genera identidad determinista e incluye `origen`/`origenId`. Reutiliza un ID antiguo solo cuando la tarea ya enlaza explícitamente ese gasto en la actuación de la misma fecha o en `ultimoGastoId` de esa misma fecha. No se buscan vínculos por importe, texto, fecha aislada ni parecido de IDs; no se creó una migración ni una fusión histórica inferida. El inmueble real de la tarea se valida antes de guardar.
- **B7 importación/exportación:** se reconciliaron el XLSX y sus adaptadores/tests en el panel canónico; sin una ruta paralela de importación ni acceso a Firebase desde el parser.
- **Custodia de integración:** las pruebas de alcance que comparaban todo con referencias de la rama C se ajustaron al padre exacto de Arena B previo a la reconciliación (`46bb9f79b43949d833acf00e9557e575769d039a`). Mantienen comparaciones byte a byte de los archivos productivos patrimoniales, el allowlist exacto, validación de dependencias y un pin SHA-256 del registro de superficie; no se silenciaron ni se omitieron las pruebas.

### Clasificación de hallazgos

- **Bloqueante funcional/security:** ninguno encontrado en el alcance validado localmente.
- **Recomendable:** `saveGastoFirestore` y `saveGarantiaReparacionFirestore` en `src/lib/firebase.ts` capturan errores y solo los registran; los llamadores no pueden distinguir una escritura fallida de una exitosa. No se cambió el contrato global de persistencia en esta reparación y el emulador no estuvo disponible para reproducir fallos de escritura.
- **Infraestructura/custodia — INFRA-01:** Firebase Emulator no se ejecutó por una limitación de infraestructura del entorno. Por tanto, las reglas no tienen validación oficial del Emulator en esta ejecución.
- **No es un defecto:** `RegistrarActuacionModal` no recibe `gastosExistentes`; la idempotencia demostrada usa la identidad determinista tarea+fecha y los enlaces previos explícitos del modelo. La ausencia de esa prop no produjo duplicación en las pruebas. Un `gasto_mant_*` histórico sin `origenId` no se enlaza automáticamente salvo que la tarea ya lo referencie expresamente para esa misma actuación.

## Validación ejecutada

- Full Vitest: **131 archivos, 2.553 tests pasados**.
- Suite nativa de custodia/aislamiento de Operaciones y Patrimonial: **18/18**.
- Suite de seguridad enfocada (carteras, propietarios, delegación, límites Firestore y modal B5): **9 archivos, 146 tests pasados**.
- `npm run test:bloque-b`: **92/92**.
- `npm run test:bloque-c`: **82/82** (79 tests Vitest + comprobaciones del runner).
- `npm run test:bloque-e`: **64/64**.
- `npm run test:bloque-5`: **183/183 comprobaciones** (179 tests Vitest, cero fallos y sin tests omitidos).
- `npm run test:bloque-7`: **432/432 comprobaciones** (425 tests Vitest; incluye 12 libros fixture y round-trip XLSX determinista; cero fallos y sin tests omitidos).
- `npm run test:bloque-8`: **211 tests pasados**.
- `npm run test:bloque-9`: **119 tests pasados**.
- `npm run lint` (`tsc --noEmit`): correcto.
- `npm run build`: correcto. Vite muestra la advertencia no bloqueante de un chunk JavaScript >500 kB (aprox. 5,0 MB sin comprimir; 1,22 MB gzip).
- `git diff --check`: correcto.

Los conteos de los runners por bloque se solapan con el full Vitest y no se suman entre sí. Las pruebas de IA son locales/unitarias; no se hicieron llamadas a un proveedor Gemini ni a otro servicio externo.

## Commits y GitHub

- Reparación de fechas: `46bb9f79b43949d833acf00e9557e575769d039a` (`46bb9f7`).
- Reconciliación Arena C (B5/B7): `9c6defd620e15afebb6f722734e635d6c40558f7` (`9c6defd`), incorpora `633a323` y `413ea53`.
- Los cambios posteriores de custodia/documentación quedan en commits del mismo branch de sesión.
- El push se hizo únicamente a `origin/arena/01a0e6d9-gestor-de-inmuebles-vercel`. PR #10 apunta a `main`; en la última comprobación, Vercel y Vercel Preview Comments estaban en **pass**.
- El árbol de trabajo se dejará limpio tras el commit de este informe. `main` no se ha modificado desde esta sesión.

## Siguiente paso permitido

Revisar y fusionar el PR #10 mediante el flujo del repositorio. Tras esa fusión, ejecutar validación post-merge contra el SHA resultante de `main`, incluida la comprobación del emulador cuando la infraestructura lo permita. Hasta entonces, el estado correcto es **VALIDADO EN ARENA; PENDIENTE DE INTEGRACIÓN Y VALIDACIÓN POST-MERGE**.
