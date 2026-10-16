# Anexo del Mapa Maestro — custodia y comparación de ramas (16-10-2026)

**Subordinado a [`../MAPA-MAESTRO-ERP-ACTUAL.md`](../MAPA-MAESTRO-ERP-ACTUAL.md).** HEAD de esta Arena: `fd3cae9daf987c9f04f148e55bb4136aa8cc090f` en `arena/dea47ba8-gestor-de-inmuebles-vercel`; `main` coincide. `git fetch --unshallow` y fetch **solo de objetos** de las puntas remotas para comparar, sin cambiar ramas ni árbol; 262 commits alcanzables desde HEAD, 48 referencias `refs/heads/*` anunciadas por `origin` al consultar. Comparación `git rev-list --left-right --count HEAD...<sha>`: columna «faltan en la rama» = commits en HEAD que la rama no contiene; «solo en rama» = commits no ancestrales de HEAD. **Ancestro ≠ equivalencia de comportamiento presente**: cambios posteriores pueden haberlo reemplazado o revertido. `DIV` no justifica cherry-pick; consultar diferencias y pruebas antes de cualquier recuperación autorizada. SHA abreviado a 10 caracteres.

**Petición explícita — `arena/2edd80de-gestor-de-inmuebles-vercel`: NO LOCALIZADA.** No hay ref local ni `refs/heads/arena/2edd80de-gestor-de-inmuebles-vercel` en `git ls-remote --heads origin`; consulta GitHub del branch devolvió 404. Sin commit identificable, **no se puede revisar su código, compararla ni atribuirle capacidad**. Necesario SHA, PR o ref disponible para auditoría posterior; no crear una rama suplente.

| Punta anunciada en `origin` | SHA | Faltan en rama | Solo en rama | Dictamen de custodia / interés |
|---|---|---:|---:|---|
| `arena/01a0a413-gestor-de-inmuebles-vercel` | `91da820b5c` | 223 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0ab19-gestor-de-inmuebles-vercel` | `29a97951de` | 239 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0ab97-gestor-de-inmuebles-vercel` | `aa251f5f6f` | 224 | 2 | DIV: B2B alternativo; módulo homónimo en HEAD, no declarar equivalencia sin diff funcional. |
| `arena/01a0ab9d-gestor-de-inmuebles-vercel` | `177d5af754` | 259 | 9 | DIV: Conciliación, actas, dashboard e inversión de otra línea; versiones en HEAD, comparar. |
| `arena/01a0b91c-gestor-de-inmuebles-vercel` | `06963592f1` | 225 | 1 | DIV: GAP7 facturación/VeriFactu; HEAD tiene código posterior diferente. |
| `arena/01a0bfbe-gestor-de-inmuebles-vercel` | `c6b858d4bc` | 172 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0bfd3-gestor-de-inmuebles-vercel` | `3c47ac60fa` | 150 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0c03d-gestor-de-inmuebles-vercel` | `14dac266e8` | 214 | 3 | DIV: R3, Storage y sindicación; HEAD tiene soluciones posteriores, contrastar residuales. |
| `arena/01a0c559-gestor-de-inmuebles-vercel` | `42d821a154` | 200 | 1 | DIV: Tests económicos propios; comprobar cobertura, no equiparar por nombre. |
| `arena/01a0d2f9-gestor-de-inmuebles-vercel` | `94340ea228` | 173 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0d832-gestor-de-inmuebles-vercel` | `1e73995d5e` | 142 | 7 | DIV: UX-0A/B y UX-1A/B/C; `bienvenida.ts` y eliminación de secundario NO existen en HEAD: candidato de recuperación selectiva. |
| `arena/01a0d97d-gestor-de-inmuebles-vercel` | `9c7fa85647` | 121 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0df8d-gestor-de-inmuebles-vercel` | `4c2fad6bcc` | 128 | 1 | DIV: Solo commit documental alternativo; cotejar afirmaciones con código, no autoridad vigente. |
| `arena/01a0e2af-gestor-de-inmuebles-vercel` | `c2b1087b98` | 111 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0e437-gestor-de-inmuebles-vercel` | `df4bdabe2c` | 107 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0e460-gestor-de-inmuebles-vercel` | `0e8d7fe6df` | 103 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0e6d9-gestor-de-inmuebles-vercel` | `16aa626065` | 88 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0e87c-gestor-de-inmuebles-vercel` | `413ea53162` | 100 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0e939-gestor-de-inmuebles-vercel` | `f3650cab7f` | 76 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0edaa-gestor-de-inmuebles-vercel` | `d5ab149067` | 75 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0edf7-gestor-de-inmuebles-vercel` | `d7239d3aab` | 72 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0ee4f-gestor-de-inmuebles-vercel` | `52546afab0` | 69 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0f18c-gestor-de-inmuebles-vercel` | `8e63461ef5` | 172 | 1 | DIV: Portal N titulares/baja, panel y utilidades ausentes; HEAD integró otro núcleo vía PR #27 tras revert #26; contrastar. |
| `arena/01a0f6df-gestor-de-inmuebles-vercel` | `b3925a3dce` | 66 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0f6fd-gestor-de-inmuebles-vercel` | `713d277777` | 64 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0f801-gestor-de-inmuebles-vercel` | `e71d852fc5` | 60 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0f863-gestor-de-inmuebles-vercel` | `f3720ff7f4` | 57 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0f8d1-gestor-de-inmuebles-vercel` | `b61fd93d53` | 54 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0fb73-gestor-de-inmuebles-vercel` | `4d6779b32e` | 52 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a0fca7-gestor-de-inmuebles-vercel` | `8508c078df` | 50 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a102b7-gestor-de-inmuebles-vercel` | `22cdce99fc` | 49 | 1 | DIV: Commit distinto en ancestry, `git cherry HEAD` = `-` (parche equivalente); no ausencia funcional automática. |
| `arena/01a1033e-gestor-de-inmuebles-vercel` | `deaa970d73` | 48 | 1 | DIV: Commit distinto en ancestry, `git cherry HEAD` = `-` (parche equivalente); no ausencia funcional automática. |
| `arena/01a10613-gestor-de-inmuebles-vercel` | `0aff94b45e` | 46 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a10c5e-gestor-de-inmuebles-vercel` | `dfeb70f403` | 42 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/01a10c6d-gestor-de-inmuebles-vercel` | `b33867fa86` | 41 | 3 | DIV: H8 e importación optimizada alternativos; `tests/h8-autorizacion-operativa.test.ts` ausente en HEAD. |
| `arena/24a5364c-gestor-de-inmuebles-vercel` | `ac219db032` | 5 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/5612f5cb-gestor-de-inmuebles-vercel` | `d87fcd659a` | 36 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/6be1a609-gestor-de-inmuebles-vercel` | `0026365731` | 38 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/a6622686-gestor-de-inmuebles-vercel` | `63ec01f621` | 10 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/b18a36de-gestor-de-inmuebles-vercel` | `c36c5528db` | 17 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/bf0ed892-gestor-de-inmuebles-vercel` | `75b5b9459e` | 7 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/c5a56994-gestor-de-inmuebles-vercel` | `8c4ca75022` | 1 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `arena/cbf4acc0-gestor-de-inmuebles-vercel` | `c44e23aaf2` | 13 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `automation/firestore-rules-deploy` | `b9043e49db` | 49 | 1 | DIV: Workflow de publicación ausente en HEAD, PR #22 abierto; NO integrar ni desplegar en esta auditoría. |
| `main` | `fd3cae9daf` | 0 | 0 | Igual a HEAD; baseline del mapa. |
| `recovery/arena-a` | `5ad151d91e` | 234 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |
| `recovery/arena-b-content` | `3a6ee6b057` | 259 | 1 | DIV: `CandidateCircuitTimeline.tsx` y `PortalDocumentacionPublicaContainer.tsx` ausentes; trabajo recuperado, NO validado/integrado. |
| `revert-25-arena/01a10613-gestor-de-inmuebles-vercel` | `dfa10c724e` | 44 | 0 | ANC: commit ancestral; resultado actual decidido por HEAD, no por el tip antiguo. |

## Acciones de recuperación / no regresión (no realizadas)

1. **Solo revisar, no integrar por inercia:** `arena/01a0d832-…` aporta experiencias de bienvenida y servicio de eliminación secundaria ausentes; `arena/01a0f18c-…` aporta presentación N titulares alternativa; `recovery/arena-b-content` aporta circuito de candidato/documentación alternativo. Son **RA**, no parte de HEAD: exigir revisión de compatibilidad de reglas, alcance de PII y resultados de tests antes de planear implementación. Lo que sí existe en HEAD (ayuda/tutoriales, baja patrimonial, titularidades, embudos) no demuestra que esas variantes estén integradas.
2. **Comparar antes de declarar perdido o absorbido:** `aa251f5f6` B2B; `177d5af75` dashboard/inversión/actas/conciliación; `06963592f` GAP7; `14dac266e` R3/Storage/sindicación; `42d821a15` tests económicos; `b33867fa8` H8/importación; `4c2fad6bc` mapa histórico. Hubo implementación en HEAD de muchos conceptos, pero parches/matrices no son byte idénticos; no se han ejecutado pruebas en los tips alternativos.
3. **Parche equivalente ≠ rama fusionada:** `git cherry HEAD 22cdce99fc` y `git cherry HEAD deaa970d73` dan `-`; las puntas no son ancestrales, pero su parche sí está reproducido. Solo un diff semántico contra HEAD resolvería equivalencia actual si hay posteriores cambios.
4. **Despliegue y custodia:** `automation/firestore-rules-deploy` contiene `.github/workflows/deploy-firestore-rules.yml` no presente en HEAD; PR #22 abierto. No se usó para publicar. `main`/`origin/main` y los ficheros ejecutables permanecen sin cambio por esta auditoría. Ninguna punta fue fusionada, cerrada, publicada ni empujada.

**Evidencia reproducible (solo lectura):** `git ls-remote --heads origin`; `git rev-list --left-right --count HEAD...<sha>`; `git cherry HEAD <sha>` para equivalentes; `git diff --name-status HEAD <sha>` y presencia de ficheros; `git log HEAD..<sha> --oneline`; `gh pr view 22`, `gh pr list`. Estas cifras son del momento de consulta, no un monitor de ramas.
