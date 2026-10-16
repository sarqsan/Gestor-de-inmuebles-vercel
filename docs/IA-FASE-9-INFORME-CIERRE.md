# IA · FASE 9 — INFORME DE CIERRE DE ORDEN (entrega en rama de sesión)

> **Conforme al CONTRATO DE INTEGRACIÓN ENTRE ARENAS §4.7** (informe de cierre de
> cualquier Arena): base SHA → HEAD SHA, qué toca, qué NO toca, pruebas,
> limitaciones reales, dependencias externas y política de resolución.
>
> **Estado: ENTREGADO EN RAMA — NO integrado.** La integración en `main`
> corresponde a quien autorice la PR #39 (§3.4) y no se ha ejecutado desde esta
> rama. **No se ha activado consumo real de IA** en ningún entorno.

| Campo | Valor |
| --- | --- |
| Rama de sesión | `arena/b93c6727-gestor-de-inmuebles-vercel` |
| **Base** | `4309f48dc017b32fd5c28e0d3282d772fd2dd237` (= `origin/main`, merge del PR #38) |
| **HEAD final** | ver `docs/ESTADO-GIT-ERP.md` («ENTREGA EN RAMA — FASE IA 9»), verificado con `git ls-remote` |
| Commits | `815fb5d` (diseño y decisiones, reconstrucción) · `0537ce5` (implementación Fase 9) · `baeb38e` (corrección de montaje por defecto + regresión) · commit de bloque B (este informe + MAPA + ESTADO GIT) |
| PR | **#39** contra `main` — `Fase IA 9 · Llaves de usuario (Vía 2): clave propia, alta guiada y tutorial PDF` |
| Alcance | Fase IA 9 del MAPA MAESTRO: **de quién es la clave del proveedor**. DECISIÓN §11 del diseño: **Vía 2** (clave propia de cada usuario) con **alta guiada** (§11.2) y **tutorial imprimible en PDF** (§11.2.8) |
| Mergeabilidad | **Sin conflictos** con `origin/main`: `git merge-tree --write-tree origin/main HEAD` → exit 0 |

## 0. Nota de procedencia (reconstrucción)

La orden pedía partir de `docs/IA-FASE-9-LLAVES-DE-USUARIO-DISENO-Y-DECISIONES.md`
y de los commits `bf1d1b4`, `f63fbfe`, `1efe2c9`, `37b23f1`. **Ni el documento
ni esos commits existen** en el remoto, en ninguna rama, en el reflog ni en la
API de GitHub (verificado con `git fetch --unshallow`, `git cat-file`,
`git log --all`, `git branch -r --contains` y `gh api`). Con autorización del
responsable, el documento se **reconstruyó** (marcado como reconstrucción en su
cabecera) con la DECISIÓN fijada por la orden —Vía 2 + alta guiada + tutorial
PDF— y las decisiones de detalle tomadas por esta Arena quedaron escritas en él
(§4, §9, §10, §11). Ese documento es la fuente de verdad de la fase.

## 1. Qué entrega

| Pieza | Fichero | Contenido |
| --- | --- | --- |
| Diseño | `docs/IA-FASE-9-LLAVES-DE-USUARIO-DISENO-Y-DECISIONES.md` | Problema, vías comparadas, DECISIÓN §11 (Vía 2), arquitectura §4, alta guiada §11.2, tutorial §11.2.8, variables §10, limitaciones §9, plan §8 |
| Contrato puro | `src/ia/llavesUsuarioContrato.ts` | Estados `AUSENTE/REGISTRADA/VERIFICADA/REVOCADA`, resumen sin secretos (sólo sufijo de 4), validación de **forma** (`AIza…`, 39 caracteres, códigos accionables), modos `USUARIO/NO_CONFIGURADO/CLAVE_MAESTRA_INVALIDA`, `RESPALDO/EXIGIR`, `DESACTIVADA/PROVEEDOR`, rutas y cabecera `X-IA-Llave-Usuario` |
| Tutorial declarativo | `src/ia/tutorialLlaveUsuarioIA.ts` | 7 pasos del alta guiada + avisos de custodia + preguntas frecuentes; enlace oficial `aistudio.google.com/app/apikey`; una sola fuente para la pantalla y el PDF |
| Cifrado | `server/ia/cifradoLlavesIA.ts` | AES-256-GCM con `IA_LLAVES_CLAVE_MAESTRA` (32 bytes base64/base64url), IV aleatorio, **AAD = uid** (un criptograma copiado a otro usuario no descifra), huella HMAC para «misma clave», generador de clave maestra |
| Servicio | `server/ia/llavesUsuarioIA.ts` | `ia_llaves/{uid}` + `ia_llaves_eventos/{uid}_{idempotencia}`; alta, `SIN_CAMBIOS`, sustitución (contador), revocación (borra el criptograma, conserva historial), marca de verificación, `resolverParaOperacion` (sólo núcleo); Firestore con CAS por `updateTime` y reintentos; variante en memoria para desarrollo/pruebas |
| Rutas | `server/ia/rutasLlavesIA.ts` | `GET/PUT/DELETE /api/ia/llave`, `POST /api/ia/llave/verificar`; guardia: subsistema configurado → token verificado → perfil veraz ACTIVO; mutaciones con `Idempotency-Key`; 400/401/403/404/409/422/503; logs con uid y sufijo, **nunca la llave** |
| Núcleo | `server/ia/nucleoIA.ts` | Paso 3b tras el permiso y antes del registro: resuelve la llave del usuario; cabecera `X-IA-Llave-Usuario`; sin llave → respaldo (`RESPALDO`) o `428 LLAVE_USUARIO_REQUERIDA {altaGuiada}` (`EXIGIR`) sin gastar idempotencia/cuota/saldo; `503 LLAVES_NO_DISPONIBLES` si el almacén falla; `503 LLAVES_CLAVE_MAESTRA_INVALIDA` (fallo cerrado); `estado().llaves` → `/api/health`; `crearVerificadorGeminiReal` (SDK sólo aquí, invariante de Fase 1) |
| Composición | `server/ia/configuracionIA.ts`, `server.ts` | El cliente del proveedor se crea **sólo** con `contexto.llaveUsuario`; **`GEMINI_API_KEY` deja de alimentar operaciones** (health la sigue informando); montaje de rutas tras el panel admin; verificador sólo con `IA_LLAVES_VERIFICACION=PROVEEDOR` |
| Cliente + UI | `src/lib/llavesUsuarioIA.ts`, `src/components/ia/AltaGuiadaLlaveIA.tsx`, `src/components/sections/ConfiguracionSection.tsx` | Tarjeta «Llave de IA (clave propia)» en Configuración: estado sin secretos, validación de forma local, alta/sustitución (campo `password`, vaciado al enviar), revocación con confirmación, comprobación con el proveedor (deshabilitada salvo entorno), degradación clara con 503, pasos del alta guiada |
| PDF | `src/utils/tutorialLlaveUsuarioPdf.ts` | `generarPdfTutorialLlaveUsuario` (A4, multipágina, jsPDF ya presente), descarga e impresión; líneas para anotar fecha y sufijo, **nunca la clave** |
| Operación | `scripts/clave-maestra-llaves-ia.mts` (`npm run ia:llaves:clave-maestra [-- --verificar]`), `.env.example`, `server/ia/validacionEntornoIA.ts` | Generación/verificación de la clave maestra sin imprimirla en logs; documentación de las 3 variables; aviso en la guardia de la Fase 8 si falta la clave maestra (bloqueo si es inválida) |

## 2. Alcance del diff (`origin/main...HEAD`)

`24 ficheros · ≈ +3.200 / −15` — 14 nuevos, 10 modificados (sin contar el commit de bloque B, que sólo toca `docs/`).

- **Nuevos (14)**: diseño, contrato, tutorial, cifrado, servicio, rutas, cliente, UI (+ test jsdom), PDF, script, `tests/ia-fase9-llaves-usuario.test.ts`, `tests/ia-fase9-tutorial-llave.test.ts`.
- **Modificados (10)**: `server.ts` (import + montaje), `server/ia/{nucleoIA,configuracionIA,validacionEntornoIA}.ts`, `ConfiguracionSection.tsx` (una línea de montaje), `.env.example`, `package.json` (**un script npm; sin dependencias nuevas**), y tres suites de la Fase 1 ajustadas al nuevo campo `llaves` del estado y al arranque ESM real con los ficheros nuevos.

### Qué NO toca (importante para la integración)

- **`firestore.rules` / `firebase.json` / `.firebaserc` / `vercel.json`: sin cambios.** `ia_llaves` e `ia_llaves_eventos` son de **acceso exclusivo por servidor** con credencial de servicio; las cubre el catch-all `match /{document=**} { allow read, write: if false }` (comprobado por prueba estática).
- **Sin dependencias nuevas** (jsPDF, `@google/genai`, Express y Firebase ya estaban).
- **Sin migraciones ni backfill**; sin datos de usuarios tocados.
- **Sin secretos**: ninguna clave maestra ni de proveedor en el repositorio; `.env.example` sólo documenta las variables.
- **Sin activación de IA**: no se ha usado ninguna credencial ni servicio de coste real. El bloqueo comercial TODO-O-NADA (Fase 7) y la autorización expresa (Fase 8) siguen vigentes y **preceden** a la resolución de la llave.
- **Compatibilidad**: los endpoints, el catálogo de 12 operaciones, el registro, el gobierno y el panel de administración no cambian de contrato; sólo aparece el campo `ia.llaves` en `/api/health` y la cabecera `X-IA-Llave-Usuario` en las respuestas de operación.

## 3. Pruebas (ejecutadas por esta Arena, sobre este HEAD)

| Suite | Resultado |
| --- | --- |
| `tests/ia-fase9-llaves-usuario.test.ts` — contrato, cifrado, servicio (memoria y Firestore simulado con CAS), rutas HTTP reales, núcleo Vía 2 (respaldo / activa / 428 / 503 / orden permiso→llave), composición y guardias estáticas | **39/39** |
| `tests/ia-fase9-tutorial-llave.test.ts` — PDF multipágina, texto de los 7 pasos, enlace oficial, sin claves | **2/2** |
| `src/components/ia/AltaGuiadaLlaveIA.test.tsx` (jsdom) — montaje por defecto sin bucle, estado, 503, forma local, alta con `Idempotency-Key`, SIN_CAMBIOS/409, revocación con confirmación, comprobación | **8/8** |
| `tests/ia-fase1-integracion-server.test.ts` (matriz 12 endpoints sobre la app real ESM de Vercel, ahora con los ficheros de Fase 9) | **35/35** |
| `tests/ia-fase1-arranque-seguro.test.ts` · `tests/ia-fase1-nucleo.test.ts` · `tests/configuracion-proyecto-firebase-activo.test.tsx` | en verde |
| **Suite completa** (`npx vitest run`) | **231 ficheros · 4.234 passed · 7 todo · 0 fallos** (exit 0, sobre `baeb38e`; el commit de bloque B sólo toca `docs/`) |
| `npx tsc --noEmit -p .` | **0 errores** |
| `npm run build` | **OK** (sólo el warning preexistente de chunk > 500 kB) |
| `npx tsx scripts/guardia-a04-repositorio.mts` | **A-04: OK** (tras commit y push de la rama) |

Incidencia detectada y corregida **durante** la verificación: la suite completa
hizo caer un worker por falta de memoria (`SIGABRT`) al renderizar
`ConfiguracionSection` sin props. Causa: `opciones = {}` como valor por defecto
en la firma de `AltaGuiadaLlaveIA` creaba una referencia nueva por render y el
`useEffect` relanzaba la carga sin fin. Corregido con una referencia estable
(`baeb38e`) y cubierto con prueba de regresión (una sola llamada a `fetch`).

**Pendiente de la integración (§3.2 del contrato):** revisión del diff y
**re-verificación de la suite completa sobre `main` tras el merge**, que esta
Arena no puede ejecutar.

## 4. Limitaciones reales (declaradas, no ocultas)

1. **Rotación de la clave maestra no automatizada**: cambiarla invalida los criptogramas; los usuarios tendrían que registrar su llave de nuevo. El procedimiento de recifrado queda para una orden de operación separada.
2. **Verificación con el proveedor desactivada por defecto**: la validez real de la llave se conoce en la primera operación (que cae a respaldo si el proveedor la rechaza y deja la traza en el registro).
3. **Sin límite específico de intentos de alta** más allá de autenticación, perfil veraz e idempotencia; el bloqueo de cuenta por administrador (Fase 2/7) sigue disponible.
4. **Un solo proveedor** (`GEMINI`): otro proveedor exigiría su validación de forma y su cliente.
5. **El respaldo heurístico sigue siendo la respuesta por defecto sin llave** (`RESPALDO`): es la opción menos disruptiva para el usuario, pero puede ocultar que «no hay IA real»; la cabecera `X-IA-Llave-Usuario: ausente` y la tarjeta de Configuración lo hacen visible. Con `EXIGIR` el servidor lo convierte en 428 explícito.
6. **Entorno de pruebas**: todo se ha validado con proveedor simulado y Firestore simulado; no hay evidencia de ejecución contra Firestore real ni contra Gemini real (coherente con «sin activar consumo»).

## 5. Dependencias externas y autorizaciones pendientes

1. **Autorización expresa** del responsable para cualquier consumo real de IA (igual que en la Fase 8).
2. **`IA_LLAVES_CLAVE_MAESTRA`** generada con `npm run ia:llaves:clave-maestra` y guardada **como secreto** del entorno (nunca en el repositorio); verificada con `-- --verificar`.
3. **`IA_POLITICA_JSON`** completa y aprobada (Fase 7) y credencial de servicio de Firebase (sin ella no hay registro ni llaves: `NO_CONFIGURADO`).
4. Decisión del responsable sobre **`IA_LLAVES_SIN_LLAVE`** (`RESPALDO` por defecto o `EXIGIR`) y sobre activar **`IA_LLAVES_VERIFICACION=PROVEEDOR`** (llamada real `models.list`).
5. **Presupuesto y cuotas** ya no son del proyecto sino de **cada usuario** en su Google AI Studio: el tutorial lo explica; conviene que la comunicación comercial lo deje claro.

Mientras falten, el servidor se comporta como hasta ahora: `503 APROBACION_COMERCIAL_PENDIENTE` sin política; con política pero sin clave maestra, `ia.llaves = NO_CONFIGURADO`, el alta responde `503 LLAVES_NO_CONFIGURADAS` y **el cliente del proveedor no se crea** (respuestas de respaldo).

## 6. Política de resolución de conflictos

No hubo conflictos: la rama se ancló a `4309f48` y `origin/main` no se ha movido. El merge es limpio según `git merge-tree`. Los commits son autónomos: el diseño (`815fb5d`) puede integrarse solo; la implementación (`0537ce5` + `baeb38e`) debe ir junta.

## 7. Obligaciones de la integración (§4.8)

Al integrar, actualizar `docs/MAPA-MAESTRO-ERP-ACTUAL.md` y `docs/ESTADO-GIT-ERP.md` con el estado «INTEGRADA» de la Fase IA 9 (hoy: cerrada en rama, pendiente de integración) y re-verificar la suite completa sobre `main`. La activación en producción es una orden distinta y separada (configurar los secretos de §5 bajo autorización).
