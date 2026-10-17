# Incidencia de alta de claves IA — diagnóstico y parche AQ.

Fecha: 2026-10-17 (UTC). **ABIERTA. Parche preparado; no integrado ni publicado en producción.**

## 1. Sesión e inspección previa a modificar archivos

- Repositorio: `sarqsan/Gestor-de-inmuebles-vercel`.
- Checkout: `/home/user/Gestor-de-inmuebles-vercel`.
- Sesión/rama fija: `arena/07da0de4-gestor-de-inmuebles-vercel`.
- HEAD inicial, `main` local y `origin/main`: `3d285e89298e1b1d9746635eb8c92edaf3f69c94`.
- Árbol inicial limpio. Remoto `origin`: `https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git`.
- Inicialmente sólo estaban disponibles las refs locales de sesión/main y `origin/main`. Se consultó `git ls-remote --heads origin`, se obtuvo la ref remota de `arena/7eef00ef-gestor-de-inmuebles-vercel` y se completó el historial superficial mediante `git fetch --unshallow origin`. No se cambió de rama.
- `gh pr list --state all --limit 100`, PR #40 (cuerpo, commits y archivos), historial de commits y búsqueda `git log --all -S 'AQ.' -- src server tests`: no se localizó una corrección previa AQ. en el historial remoto obtenido. Esto no permite descartar trabajo no publicado en otras máquinas/sesiones.

### Tabla de evidencia

| Ubicación | SHA | Validador/texto encontrado | Rama y evidencia de despliegue |
|---|---|---|---|
| `src/ia/llavesUsuarioContrato.ts` | `3d285e89298e1b1d9746635eb8c92edaf3f69c94` | Prefijo exclusivo `AIza`, longitud 39 y regex `^AIza[0-9A-Za-z_-]{35}$` | `main`, sesión inicial; fuente del último SHA registrado como Production |
| `src/components/ia/AltaGuiadaLlaveIA.tsx` | `3d285e8` | Etiqueta «empieza por AIza»; guardar llama al contrato compartido | `main`; mismo SHA Production |
| `src/ia/tutorialLlaveUsuarioIA.ts` | `3d285e8` | Instrucciones/FAQ exclusivas AIza y 39 caracteres; contenido compartido con PDF | `main`; mismo SHA Production |
| `server/ia/llavesUsuarioIA.ts` y `server/ia/rutasLlavesIA.ts` | `3d285e8` | Servicio llama al mismo contrato; HTTP limita cuerpo a 200 caracteres y devuelve 422 por formato | `main`; mismo SHA Production |
| Contrato y archivos de alta de la otra sesión | `69d4bbd10582592c508cce89d0b2c431022e323e` | Sin diferencias frente a main en esos archivos; sin AQ. | `arena/7eef00ef-gestor-de-inmuebles-vercel`; deployment `7127473181`: Preview / success |
| Último Production registrado | `3d285e89298e1b1d9746635eb8c92edaf3f69c94` | Su fuente sigue imponiendo AIza | Deployment `7127791676`, creado 2026-10-16 19:33:27 UTC, Vercel bot, estado success |

Fuentes consultadas mediante `gh api`:
- [Deployment Production](https://api.github.com/repos/sarqsan/Gestor-de-inmuebles-vercel/deployments/7127791676) y [estados](https://api.github.com/repos/sarqsan/Gestor-de-inmuebles-vercel/deployments/7127791676/statuses).
- URL devuelta por el estado: `https://gestor-de-inmuebles-vercel-k20heqbc8-sarqsan2-4111s-projects.vercel.app`.
- [Estado del commit](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/commit/3d285e89298e1b1d9746635eb8c92edaf3f69c94): contexto Vercel success.

**Límite de la evidencia:** se inspeccionó el código fuente del SHA que GitHub/Vercel asocia a Production; no se inspeccionó directamente el bundle servido, la sesión del usuario, los alias vigentes ni la configuración de Production Branch en Vercel. El conector Vercel está desconectado y la red de esta sesión no permite acceder directamente al dominio de producción. El último Production corresponde a main, pero existe también un registro Production anterior del SHA `3eb23ce6f387173eb3869d7f166d7ee4b83b0ffb` de la otra rama: no debe confundirse la evidencia del último despliegue con una garantía de configuración exclusiva de rama.

## 2. Diagnóstico demostrado

La fuente del último SHA asociado a producción **no contiene soporte AQ.** El mismo contrato rechaza ese prefijo en el cliente y en el servicio de servidor. Además hay textos obsoletos en formulario y tutorial/PDF. No es solamente un mensaje cosmético.

- [PR #39](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/pull/39), merge `ad113d74f1905f6a42540cc0850a11dd55fdb4ee`: incorporó el subsistema de llaves con la regla antigua (commit de implementación `0537ce5`).
- [PR #40](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/pull/40), merge `3d285e8`: documentación y avisos de IA; no modifica el contrato del alta ni introduce AQ.
- No se encontró un PR de corrección AQ. fusionado, abierto o cerrado en el historial revisado; tampoco cambios AQ. en la rama 7eef00ef consultada.
- No hay evidencia para afirmar que la causa sea caché, un despliegue atrasado respecto a main o un bundle alternativo. No se ha comprobado el navegador afectado.

## 3. Corrección mínima preparada

[PR #41, BORRADOR](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/pull/41).

Commit de código: `f83c220f65811013c19ec04bec28ad98728d5688`, publicado únicamente en `arena/07da0de4-gestor-de-inmuebles-vercel`.

- AIza conserva exactamente su regla estricta de 39 caracteres.
- AQ. admite cuerpo base64url `[A-Za-z0-9_-]`, mínimo defensivo de 32 caracteres de cuerpo, máximo de entrada existente de 200 caracteres totales. Son límites locales de plausibilidad y protección de entrada, **no longitudes oficiales documentadas de Google**. Se prueban varias longitudes y los extremos.
- Se rechazan prefijos ajenos, cuerpos cortos, exceso de tamaño, espacios/saltos internos, puntuación y Unicode fuera del alfabeto.
- Cliente y servidor siguen usando un único validador. No fue necesario duplicar ni modificar las rutas/servicio.
- Etiqueta, tutorial/PDF y ayuda explican ambos formatos y distinguen forma de aceptación por Google.

Archivos del commit de corrección:
1. `src/ia/llavesUsuarioContrato.ts`
2. `src/ia/tutorialLlaveUsuarioIA.ts`
3. `src/components/ia/AltaGuiadaLlaveIA.tsx`
4. `src/components/ia/AltaGuiadaLlaveIA.test.tsx`
5. `tests/ia-fase9-llaves-usuario.test.ts`
6. `tests/ia-fase9-tutorial-llave.test.ts`
7. `docs/IA-FASE-9-LLAVES-DE-USUARIO-DISENO-Y-DECISIONES.md`
8. `docs/IA-FASE-9-INFORME-CIERRE.md`

Este informe es un archivo documental adicional. Sin cambios de dependencias, cifrado, autenticación, autorización, aislamiento, Firebase, variables de Vercel, clave maestra ni datos de usuarios. Las pruebas sólo usan valores sintéticos y almacenes/dobles locales.

## 4. Pruebas del candidato

| Comando/área | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | Correcto; lockfile sin cambios |
| `npm run lint` | Correcto, TypeScript sin errores (repetido tras los últimos cambios de pruebas) |
| `npm run build` | Correcto; aviso existente de bundle >500 kB |
| `npx vitest run tests/ia-fase9-llaves-usuario.test.ts tests/ia-fase9-tutorial-llave.test.ts src/components/ia/AltaGuiadaLlaveIA.test.tsx` | **70/70**: formato, formulario, servicio, cifrado, aislamiento, rutas HTTP, tutorial/PDF y protección del secreto |
| `npx vitest run` sobre `f83c220` con rama publicada | **230 archivos correctos / 1 fallido; 4253 passed, 4 failed, 7 todo** (231 archivos, 4264 pruebas) |
| Guardia A-04 dentro de la ejecución anterior | Correcta después de crear/publicar la ref de sesión |
| `npm run test:integracion` | Falla en Operaciones: **290 passed / 12 failed**; el `&&` interrumpe antes de Patrimonial |
| `npm run test:patrimonial` aparte | **85 passed / 3 failed** |
| `git diff --check` | Correcto |

La primera ejecución dirigida tuvo un fallo en una nueva aserción: trataba el prefijo público `AQ.` como secreto completo. Se corrigió la aserción sin relajar el validador; las ejecuciones posteriores pasan. La primera suite completa tuvo además dos fallos A-04 por faltar la ref remota de la rama nueva; desaparecen tras publicar la rama, sin modificar esa guardia.

### Bloqueos ajenos reproducidos sobre la base limpia

Se extrajo `git archive 3d285e8` a un directorio temporal excluido de snapshots, reutilizando las mismas dependencias y las refs Git sólo para lectura. No se cambió de rama ni se restauró el árbol de trabajo.

- `tests/seguimiento-incidencias-e2e.test.ts`: **los mismos 4 fallos** en base y candidato (líneas 269, 298, 332, 355). Las expectativas reciben un evento adicional `INCIDENCIA_ESCALADA`. El archivo y la implementación de seguimiento no se modifican aquí. No se declara confirmada una causa temporal o de negocio sin diagnóstico específico.
- Operaciones: **los mismos 12 fallos** en base y candidato:
  - `integration-boundaries.test.mjs` (1).
  - `isolation.test.mjs` (1).
  - `rules-architecture.test.mjs` (5).
  - `rules-harness.test.mjs` (5).
- Patrimonial: **los mismos 3 fallos** en base y candidato (expectativas de dependencias/lockfile, superficie de integración y custodia de reglas contra bases históricas).
- No se ejecutaron emuladores oficiales en esta sesión; no se afirma cobertura con Firestore real. No se cambiaron reglas ni se ocultaron/excluyeron las pruebas fallidas.

### Protección de claves

Los casos nuevos comprueban que AQ. no se almacena en claro en documentos/eventos del servicio, no aparece en respuestas HTTP ni en eventos de log de las rutas y no se pinta ni permanece en el campo tras guardar. Las guardias existentes de fuente para servicio/rutas/núcleo pasan. No se ha usado una credencial real ni se han consultado logs privados de producción: no se afirma una auditoría de esos logs.

## 5. Integración y estado de producción

**No fusionado. No publicado. Incidencia NO resuelta.**

La orden exige detener la publicación cuando hay pruebas fallidas. Se conserva la corrección en la rama fija de sesión y PR #41 en borrador; no se mezclan los commits ajenos de la rama 7eef00ef. No se ejecuta merge, push a main, force push, reset destructivo ni cambio de configuración.

Última consulta a la lista Production tras preparar el PR: sigue en `3d285e89298e1b1d9746635eb8c92edaf3f69c94`, deployment `7127791676`. El SHA del parche **no** está integrado en main ni demostrado en producción. Cualquier Preview automático de la rama no es el destino final ni satisface el cierre.

## 6. Verificación funcional real pendiente

| Acción en producción | Estado |
|---|---|
| Inspeccionar bundle/alias y confirmar nuevo SHA Production | Pendiente; no hay nuevo despliegue publicado por esta sesión |
| Registrar una clave desde Mi Cuenta | No ejecutado; no hay navegador autenticado disponible |
| Comprobar con Google si está habilitado | No ejecutado; configuración actual no inspeccionada |
| Ejecutar una operación real IA y confirmar resultado | No ejecutado |

Para continuar: resolver los bloqueos de pruebas en su ámbito sin ampliar silenciosamente este parche, revalidar la corrección, confirmar la configuración real de publicación con acceso a Vercel y fusionar/publicar mediante el procedimiento verificado. Después comprobar el SHA Production y ejecutar registro, comprobación y operación IA desde la aplicación con una sesión autorizada. **No enviar la clave por chat ni incluirla en informes.** Si Google rechaza la credencial, conservar el código/error saneado y continuar el diagnóstico; no cerrar la incidencia por aceptación sintáctica.
