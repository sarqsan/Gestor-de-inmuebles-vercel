> **Nota de reparación controlada P3 — 2026-10-18**: documento histórico recuperado del parche. No describe el estado vigente tras la reparación. La importación manual de extractos está deshabilitada por alcance conservador (E-07), la generación SEPA pain.001/pain.008 se conserva (E-06 del inventario), y las decisiones P3 requieren evento append-only con motivo y actor autenticado. Para el estado actual, prevalece el informe final de esta reparación y el código en main.

# P3 — Conciliación bancaria asistida: auditoría local y límites

**Corte funcional:** 2026-10-17 · **Revalidación del checkout:** 2026-10-18 · **Estado P3:** `BLOQUEADA/PENDIENTE`, no cerrada.  
**Rama fija:** `arena/d2bfa306-gestor-de-inmuebles-vercel`. Checkout local `HEAD=f782e53ed3beefa4cdcae4e839457480f9cfd995`, igual a `main`/`origin/main`; ref remota de sesión `13c0159d3e7b87b0035d7a16b73efd2eda8096d1` (seis commits por delante). El árbol local y las cinco rutas P3 se preservan; no se atribuyen al `HEAD` ni a la ref remota. Revalidación actual sobre el worktree: P3 focal **90/90**, focal Treasury/asistente/P3 **126/126**, Vitest global **247/248 archivos; 4.445 passed, 2 failed (A-04), 0 skipped, 7 todo**. No hubo PR, merge, commit/push de esta fase, deploy, publicación de Rules, conexión bancaria ni operación financiera.

## Dictamen y fronteras

El núcleo puro de importación y conciliación P3 está integrado en la rama de sesión: parseo/normalización, huellas e idempotencia, propuestas y clasificación de ambigüedades, matching y resultados fail-closed. CSV, OFX y MT940 tienen cobertura focal; Norma 43 conserva denegación segura porque no se encontró una fixture AEB normativa verificable. Una propuesta o decisión P3 es evidencia de revisión bancaria, no pago ni asiento: no llama a `registrarPagoPeriodo`, no cambia `CobroPeriodo`, no crea ingresos/gastos ni altera saldos.

La capa cliente de persistencia/transacciones, su UI y las nuevas Firestore Rules continúan en el worktree y **no** se integraron. Los tests de esa capa usan Firestore falso en memoria y un evaluador estático propio; no prueban la semántica real de Rules, permisos, transacciones, durabilidad o recuperación. En este sandbox no se encontraron Java ni Firebase CLI; no se lanzó emulador oficial. No se aplicaron estas Rules a un proyecto, no se consultó banco, no se usó PSD2/agregador ni se escribieron datos productivos.

## Integraciones seguras verificadas

| Commit | Alcance integrado en la rama de sesión | Verificación / límite |
|---|---|---|
| `1f03748614e6ecf8dec099393dabaf8e715b9baf` | Núcleo puro P3: tipos, parsers CSV/OFX/MT940/Norma 43, normalización, idempotencia, matching, motor y pruebas de importación. 14 archivos. | Sin persistencia ni Rules. P3 focal actual **90/90** en 5 archivos, incluido el test local de persistencia/mock y el harness estático; eso no convierte el test en emulador. |
| `0ab37456cb076a24bc7b3607de469bd7bcf20baa` | Frontera económica: solo conciliación manual `CONCILIADO` del mismo titular puede ofrecer evidencia opcional en el puente legado; `CONFIRMADO` no aplicado y otra cartera se excluyen. Aclara en Tesorería, Morosidad y Facturación que P3 no registra pagos. | Bloque B **92/92**, Bloque C **82/82**, y dos archivos de dominio **73/73**; cambios de UI y adaptador validados también por Vitest global. No conecta P3 con pagos. |
| `13c0159d3e7b87b0035d7a16b73efd2eda8096d1` | Mejora independiente de `scripts/test-bloque-e.ts`: la guardia captura completa una condición `allow list` multilinea y no se limita a la primera línea. | Bloque E **64/64**; parser más estricto, sin ampliar allowlist ni omitir reglas. |

La cadena incluye asimismo las integraciones independientes de P1/DEC-01 (`72232bea81ee65565eda0f450ede852bd6ffa0e0`), P2/P4/IA (`9562b8230a337048566208bd91ef4a51b2447372`) y guardias (`4958bb6cc73834e226191eb6085d34c6c40b3035`). Todas se publicaron solo en la rama fija; no se presentan como fusionadas en `main`.

## Recorrido revisado y frontera de persistencia

1. **UI:** `src/components/sections/ConciliacionBancariaSection.tsx` ofrece selección de titular, carga y preview del extracto, filtros, decisión humana con motivo, corrección/reversión y reporte por periodo. La revisión de perfil/ámbito en cliente mejora UX, pero no reemplaza Rules.
2. **Dominio:** `src/utils/conciliacion/` normaliza CSV/OFX/MT940, valida estructura/moneda/fechas/importes, deduplica por hash, propone candidatos y mantiene explícita la ambigüedad. Norma 43 rechaza si no hay fixture verificable.
3. **Adaptador:** `src/lib/conciliacionFirestore.ts` implementa en el diff local lectura/escritura acotadas, decisiones transaccionales, reservas de candidato y eventos trazables. El test sustituye Firestore por Map y transacciones simuladas; no representa un backend de Firebase.
4. **Persistencia/Rules:** el diff local `firestore.rules` pretende limitar por propietario y administrador autenticado, preservar movimientos/importaciones, exigir evento para decisiones y mantener eventos/reservas append-only. La guardia Patrimonial 88 lo compara con el baseline publicado y lo rechaza correctamente mientras el delta siga fuera del alcance autorizado.
5. **Efecto económico:** `src/tesoreria/conciliacionAdapter.ts` solo ofrece, como evidencia opcional, un movimiento negativo con decisión manual `CONCILIADO` y `propietarioId` coincidente. La acción de registrar el pago sigue siendo humana y separada; no se modifican cobros ni saldos por importar o conciliar.

## Diferencia P3 excluida de integración

Estos cinco archivos se conservan íntegros en el worktree, separados del conjunto publicado:

| Estado local | Ruta | Motivo de exclusión |
|---|---|---|
| Modificado | `firestore.rules` | Delta de 283 inserciones / 80 eliminaciones; sin compilación/emulador oficial y fuera del fingerprint permitido por Patrimonial 88. Blob Git local `b00c3b00c17350eecf60f9c6f74a9efd6e2c8bcc`; baseline de `HEAD` `0ba8c23d1f188859c34368463736c42bed8b16d6`. No publicar ni repinnear. |
| Modificado | `src/components/sections/ConciliacionBancariaSection.tsx` | UI cableada al servicio/transacción P3; depende de validar Rules/ámbito y ACK de persistencia real. |
| Modificado | `src/lib/conciliacionFirestore.ts` | Adaptador Firestore con operaciones y transacciones nuevas; mocks no verifican semántica, índices, límites ni permisos desplegados. |
| Modificado | `tests/conciliacion-persistencia.test.ts` | Prueba con Fake Firestore en memoria; útil como regresión local, no prueba durable ni cross-user oficial. |
| Nuevo | `tests/conciliacion-p3-rules.test.ts` | Harness propio sobre el texto de Rules; no sustituye Firebase Emulator Suite. |

`firestore.indexes.json` no tiene delta en este conjunto. Los cuatro ficheros fuente/prueba y el test nuevo no se descartaron: quedan preservados y deben revalidarse en el mismo conjunto cuando exista el entorno autorizado.

## Pruebas reejecutadas y significado

| Comando / alcance | Resultado | Qué demuestra / qué no |
|---|---|---|
| P3 focal: `npx vitest run tests/conciliacion.test.ts tests/conciliacion-persistencia.test.ts tests/conciliacion-p3.test.ts tests/conciliacion-p3-rules.test.ts tests/conciliacion-legacy.test.ts` | **5 archivos, 90/90** | Motor, parsers, mocks y harness estático. No emulador, Firestore ni persistencia real. |
| Suites legacy: `npx vitest run tests/conciliacion.test.ts tests/conciliacion-legacy.test.ts` | **2 archivos, 46/46** | Regresión Vitest heredada/local; no cobertura normativa AEB ni servicio bancario. |
| B / C / E / 7 | **92/92 · 82/82 · 64/64 · 438/438** | B/C/E y Bloque 7 reejecutados en la comprobación final; todos pasan. Dobles/harness donde corresponde. |
| `npm run auditoria:reglas:matriz` y `npm run auditoria:reglas:list` | Exit 0, análisis estático | No compila Rules ni prueba Firebase. |
| Vitest global sin exclusiones | **247/248 archivos aprobados; 4.445 passed, 2 failed, 0 skipped, 7 todo** | Ejecutado sobre el worktree local. Los dos fallos son expectativas A-04 que demandan `OK` pese a warnings reales por el borrado DEC-01 y la divergencia entre `HEAD=f782` y la ref remota `13c0159`. Las pruebas UX7 y host de lecturas heredadas se resolvieron. No certifica servicios productivos. |
| `npm run lint`, `npx tsc --noEmit -p .`, `npm run build` | Exit 0 | Reejecutados en el checkout local; el build transformó 2.424 módulos, con advertencias de imports mixtos y chunk principal 5.401,71 kB. No deploy. |
| `npm run test:operaciones` | **301/302**, falla solo test 120 | Guardia de superficie/allowlist contra f782. No se amplió la lista para forzar verde. |
| `npm run test:patrimonial` | **86/88**, fallan 87 y 88 | Test 87 limita superficie; 88 conserva DEC-01 exacta y luego detecta `firestore.rules` distinto de f782. No se cambió su hash esperado ni se publicó Rules. |
| `npm run auditoria:repositorio` | **A-04: WARNING, exit 1** | Ref local `HEAD=f782`, remota `origin/arena/...=13c0159`; el borrado DEC-01 es intencional. No modificar la guarda ni recrear el modal para obtener `OK`. |

## Dependencias y criterio de cierre pendiente

**Fase asignada:** P3/F1 (identidad, Rules y persistencia), P3/F2 (importación y decisión económica) y P3/F5 (guardias e integración). **P3 queda `BLOQUEADA/PENDIENTE`** hasta satisfacer, en conjunto y sin relajar límites:

- aportar una fixture Norma 43 identificada y verificable con fuente/versión, casos válidos e inválidos; o retirar formalmente esa compatibilidad del alcance anunciado y del inventario;
- disponer de JDK/Firebase CLI y ejecutar el Emulator Suite oficial con dos propietarios, administrador, profesional/tercero, token/perfil ausente/inactivo, lecturas y escrituras cruzadas, campos bancarios prohibidos, creación vinculada importación→movimiento→propuesta, evento/reserva, replay, CAS, reversión y límites de acceso;
- demostrar persistencia después de recarga/reinicio, idempotencia por fichero/movimiento/operación y recuperación de decisiones sin duplicar eventos; revisar índices y límites de transacciones con el emulador;
- confirmar con regresión que importar, aceptar justificante, conciliar, corregir o revertir nunca llama a `registrarPagoPeriodo`, cambia `CobroPeriodo` o altera saldos;
- resolver test 120, Patrimonial 87 y 88 con evidencia y autorización exactas, sin ensanchar allowlists, cambiar fingerprints, descartar los cambios P3 ni usar mocks como sustituto del emulador.

Hasta entonces, conservar el delta local sin publicarlo; no conectar PSD2/agregadores, bancos, SEPA, pagos o transferencias; no ejecutar operaciones financieras ni escribir datos reales. El estado por capacidad P3 está en [`anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md`](anexos/MAPA-MAESTRO-ERP-INVENTARIO-2026-10-16.md) y el dictamen de guardias/custodia en [`ESTADO-GIT-ERP.md`](ESTADO-GIT-ERP.md).
