# IA · FASE 9 — LLAVES DE USUARIO: DISEÑO Y DECISIONES

> **Nota de procedencia (léase primero).** La versión original de este documento
> y los commits `bf1d1b4`, `f63fbfe`, `1efe2c9` y `37b23f1` que lo acompañaban
> quedaron **locales** en el sandbox de la sesión `arena/658e62cd-…` y se
> perdieron al cerrarse esa sesión tras fusionarse la PR #38 (verificado el
> 2026-10-16 con `git fetch --all --tags`, `git log --all`, `git ls-remote` y la
> API de GitHub: ninguno de los cuatro SHA existe en el remoto ni en ninguna de
> las 51 ramas; el fichero no está en ningún árbol). Este texto es una
> **RECONSTRUCCIÓN** redactada a partir de (a) la arquitectura real de las
> Fases IA 1–8 integradas en `main` y (b) la decisión comunicada por el
> responsable: **§11 = Vía 2 (clave propia de cada usuario) con alta guiada
> (§11.2), incluido el tutorial imprimible en PDF (§11.2.8)**, y el **bloque B
> de §8** como cierre documental. Donde el original pudiera haber fijado un
> detalle distinto, prevalece lo que aquí se declara, porque es lo que se ha
> implementado y probado.

| Campo | Valor |
| --- | --- |
| Fase | IA · 9 — Llaves de usuario («de quién es la clave del proveedor») |
| Base | `4309f48dc017b32fd5c28e0d3282d772fd2dd237` (= `main`, merge de la PR #38) |
| Rama de sesión | `arena/b93c6727-gestor-de-inmuebles-vercel` |
| Estado del consumo real | **SIGUE BLOQUEADO** en producción (ver §9 y §10): esta fase no activa nada por sí misma |
| Documentos previos | `IA-FASE-1-NUCLEO-CENTRALIZADO.md`, `IA-FASE-2-GOBIERNO-USO.md`, `IA-FASE-7-GOBIERNO-IA-PERMISOS-COSTES.md`, `IA-FASE-8-VALIDACION-ENTORNO-NO-PRODUCTIVO.md`, `IA-FASES-5-8-INFORME-CIERRE.md` |

---

## 1. Propósito

Las Fases 1–8 dejaron el consumo de IA **gobernado y bloqueado**: sesión
verificada en servidor, idempotencia, registro por usuario, permisos por rol,
cuotas finitas, saldo, política TODO O NADA y un ensayo no productivo con
proveedor simulado. Todo ello presupone una pregunta que ninguna fase había
respondido: **¿con qué credencial del proveedor se ejecuta la operación y a
cuenta de quién corre el coste real?** Hasta ahora la única respuesta posible
era `GEMINI_API_KEY`, una clave **compartida** del operador leída del entorno
del servidor (`server/ia/configuracionIA.ts` → `crearClienteGemini`).

La Fase 9 resuelve esa pregunta de forma explícita y auditable: define las
vías posibles (§3), toma una decisión (§11) y la implementa (§4) sin tocar los
invariantes de las fases anteriores.

## 2. Contexto heredado (lo que NO cambia)

1. **Ninguna operación de IA sin pasar por el núcleo** (`nucleoIA.operacion`):
   token verificado, `Idempotency-Key`, registro en `ia_operaciones`, gobierno
   antes del proveedor.
2. **Bloqueo preventivo comercial** (`APROBACION_COMERCIAL_PENDIENTE`) mientras
   la política sea `POR_DEFECTO` o incompleta; **fallo cerrado** con política
   inválida (`POLITICA_IA_INVALIDA`). Ninguna cabecera, rol o parámetro lo
   desactiva.
3. **Sin credencial de servicio no hay consumo** (sin traza duradera no se crea
   el cliente del proveedor; los endpoints responden con su respaldo
   heurístico).
4. **Los secretos no se guardan en el repositorio ni se muestran** (contrato
   §5.5): la clave del proveedor nunca aparece en logs, respuestas ni
   registros.
5. Las colecciones `ia_*` son de **acceso exclusivo por servidor** (REST con
   credencial de servicio); el catch-all `deny-by-default` de
   `firestore.rules` las cubre y **no se publican reglas**.

## 3. Vías posibles

| Vía | Descripción | Quién paga al proveedor | Implicaciones |
| --- | --- | --- | --- |
| **1 · Clave compartida** | Una `GEMINI_API_KEY` del operador para todos; el gobierno de créditos (Fase 2/7) reparte el coste internamente. | El operador; después refactura en créditos. | Exige aprobación comercial de tarifas, facturación, presupuesto y cuotas del proveedor **por adelantado**; un fallo de gobierno es coste directo del operador. |
| **2 · Clave propia de cada usuario** | Cada usuario registra **su** clave del proveedor; el servidor la custodia cifrada y la usa SOLO para las operaciones de ese usuario. | Cada usuario, en su propia cuenta de Google. | Sin exposición económica del operador; el gobierno (permisos, cuotas, saldo) sigue aplicándose como techo adicional; necesita un **alta guiada** porque obtener una clave no es trivial para un usuario no técnico. |
| **3 · Mixta** | Clave compartida por defecto con posibilidad de clave propia. | Ambos. | Hereda los requisitos de la Vía 1 y añade una ambigüedad de atribución de coste que la auditoría no quiere. |

## 4. Diseño técnico de la Vía 2 (lo implementado)

### 4.1 Piezas

| Pieza | Fichero | Papel |
| --- | --- | --- |
| Contrato compartido (puro) | `src/ia/llavesUsuarioContrato.ts` | Tipos y constantes que comparten servidor y cliente: estados de la llave, DTO de resumen **sin secretos**, códigos de rechazo, validación de **formato** de la clave (`validarFormatoLlaveProveedorIA`), sufijo visible. Sin dependencias. |
| Tutorial / alta guiada (puro) | `src/ia/tutorialLlaveUsuarioIA.ts` | Contenido estructurado del alta guiada (pasos, avisos, preguntas frecuentes) que usan la UI, el endpoint `GET /api/ia/llave` y el PDF. Una sola fuente de texto. |
| Cifrado en reposo | `server/ia/cifradoLlavesIA.ts` | AES-256-GCM con clave maestra del servidor (`IA_LLAVES_CLAVE_MAESTRA`, 32 bytes en base64), IV aleatorio por cifrado y **AAD = uid** (un criptograma no sirve para otro usuario). Huella HMAC-SHA256 (con la clave maestra) para detectar el re-registro de la misma llave sin almacenar la llave. |
| Servicio de llaves | `server/ia/llavesUsuarioIA.ts` | Interfaz `ServicioLlavesIA` con dos implementaciones (Firestore REST vía el mismo puerto que el gobierno; memoria para desarrollo/pruebas): resumen, alta/sustitución, revocación, marca de verificación y **resolución interna** para la operación (la única ruta por la que el valor descifrado sale del almacén, y sólo hacia el núcleo). |
| Rutas HTTP | `server/ia/rutasLlavesIA.ts` | `GET /api/ia/llave`, `PUT /api/ia/llave`, `DELETE /api/ia/llave`, `POST /api/ia/llave/verificar`. Autenticación por token verificado + perfil veraz (misma fuente que el gobierno). Las mutaciones exigen `Idempotency-Key`. |
| Núcleo | `server/ia/nucleoIA.ts` | Resuelve la llave del usuario tras el permiso y antes del registro; crea el cliente del proveedor **con la llave del usuario** o lo deja en `null` (respaldo); cabecera `X-IA-Llave-Usuario`; modo estricto opcional (428). `estado()` expone `llaves`. |
| Composición | `server/ia/configuracionIA.ts` | Lee `IA_LLAVES_CLAVE_MAESTRA`; sin ella, llaves `NO_CONFIGURADO`; con ella inválida, fallo cerrado. **`GEMINI_API_KEY` deja de usarse para operaciones de usuario.** |
| Cliente | `src/lib/llavesUsuarioIA.ts` | Único acceso del navegador a `/api/ia/llave*` (token de sesión + `Idempotency-Key`; sin decidir nada). |
| UI | `src/components/ia/AltaGuiadaLlaveIA.tsx` | Alta guiada en **Configuración**: estado, pasos, pegado de la clave (campo de contraseña, validación local de formato), sustitución, revocación, verificación (si está disponible) y descarga/impresión del tutorial. |
| PDF | `src/utils/tutorialLlaveUsuarioPdf.ts` | Genera el tutorial imprimible con jsPDF (ya dependencia del proyecto; sin librerías nuevas). |
| Script | `scripts/clave-maestra-llaves-ia.mts` (`npm run ia:llaves:clave-maestra`) | Genera una clave maestra nueva o verifica la configurada **sin imprimirla**. |

### 4.2 Modelo de datos (acceso exclusivo por servidor)

`ia_llaves/{uid}` — una llave por usuario y proveedor:

```
version: 1
proveedor: 'GEMINI'
estado: 'REGISTRADA' | 'VERIFICADA' | 'REVOCADA'
cifrado: { algoritmo: 'AES-256-GCM', iv, etiqueta, datos } | null   (base64; null al revocar)
huella: HMAC-SHA256(claveMaestra, llave) en hex   (no reversible; detecta re-registro)
sufijo: últimos 4 caracteres (lo único visible en la UI: «…a1b2»)
registradaEn, verificadaEn | null, revocadaEn | null, actualizadaEn: ISO-8601
sustituciones: entero (cuántas veces se cambió la llave)
ultimaVerificacion: 'OK' | 'FALLIDA' | null
```

`ia_llaves_eventos/{iaklv_<sha256(uid, claveIdempotencia)[:40]>}` — historial
append-only (`ALTA`, `SUSTITUCION`, `REVOCACION`, `VERIFICACION_OK`,
`VERIFICACION_FALLIDA`) con `uid`, `sufijo` y fecha. El id determinista ancla la
idempotencia de cada mutación: un reintento con la misma clave ⇒ `409`.

Qué **no** se guarda nunca: la llave en claro, prompts, tokens de sesión,
emails ni nombres.

### 4.3 Flujo del núcleo con Vía 2

```
1 token verificado → 2 Idempotency-Key → 3 perfil veraz + permiso (Fase 2/7)
→ 3b LLAVE DEL USUARIO (Fase 9):
      servicio.resolverParaOperacion(uid)
        DISPONIBLE → cliente del proveedor con ESA llave · X-IA-Llave-Usuario: activa
        AUSENTE    → X-IA-Llave-Usuario: ausente
                     · modo RESPALDO (por defecto): cliente null → el endpoint responde con su respaldo heurístico (origenRespuesta RESPALDO, sin consumo)
                     · modo EXIGIR: 428 LLAVE_USUARIO_REQUERIDA (+ altaGuiada: '/api/ia/llave'), antes de reservar registro/cuota/saldo
        error      → 503 LLAVES_NO_DISPONIBLES (fallo cerrado)
→ 4 registro → 5 reserva de uso (cuotas/saldo) → proveedor → cierre
```

Orden deliberado: la llave se resuelve **después** del permiso (quien no puede
usar la operación no dispara lecturas del almacén de llaves) y **antes** del
registro y de la reserva (un usuario sin llave en modo estricto no gasta
clave de idempotencia, cuota ni saldo). La clave compartida del entorno no
interviene en ningún punto del flujo de usuario.

### 4.4 Estados del subsistema (`/api/health` → `ia.llaves`)

| Valor | Significado |
| --- | --- |
| `USUARIO` | Vía 2 operativa: clave maestra válida y servicio montado (Firestore en producción; memoria sólo en desarrollo explícito). |
| `NO_CONFIGURADO` | Sin `IA_LLAVES_CLAVE_MAESTRA` (estado del repositorio): nadie puede registrar llaves; ninguna operación crea el cliente del proveedor; las rutas `/api/ia/llave*` responden `503 LLAVES_NO_CONFIGURADAS`. |
| `CLAVE_MAESTRA_INVALIDA` | La variable existe y no es una clave de 32 bytes en base64: **fallo cerrado**, todas las operaciones responden `503 LLAVES_CLAVE_MAESTRA_INVALIDA` (misma filosofía que `POLITICA_IA_INVALIDA`). |

### 4.5 Códigos nuevos

| HTTP | Código | Dónde |
| --- | --- | --- |
| 503 | `LLAVES_NO_CONFIGURADAS` | rutas de llaves sin clave maestra |
| 503 | `LLAVES_CLAVE_MAESTRA_INVALIDA` | núcleo y rutas (fallo cerrado) |
| 503 | `LLAVES_NO_DISPONIBLES` | el almacén falló al resolver la llave |
| 428 | `LLAVE_USUARIO_REQUERIDA` | núcleo en modo `EXIGIR` |
| 422 | `LLAVE_FORMATO_INVALIDO` (+ `detalle`) | `PUT /api/ia/llave` |
| 422 | `LLAVE_RECHAZADA_POR_PROVEEDOR` | `POST /api/ia/llave/verificar` |
| 404 | `SIN_LLAVE` | `DELETE` / `verificar` sin llave activa |
| 409 | `LLAVE_ACCION_DUPLICADA` | mutación repetida con la misma `Idempotency-Key` |
| 503 | `VERIFICACION_NO_DISPONIBLE` | verificación con el proveedor desactivada (estado del repositorio) |

### 4.6 Validación de formato (local, sin red)

La clave de Gemini (Google AI Studio) tiene la forma `AIza` + 35 caracteres
`[A-Za-z0-9_-]` (39 en total). La validación recorta espacios y comillas,
rechaza el marcador `MY_GEMINI_API_KEY`, longitudes y alfabetos distintos, y
devuelve un código accionable (`VACIA`, `MARCADOR_DE_POSICION`, `LONGITUD`,
`PREFIJO`, `CARACTERES`). Es una comprobación de **forma**: la validez real
sólo la confirma el proveedor (§4.7).

### 4.7 Verificación con el proveedor (desactivada por defecto)

`POST /api/ia/llave/verificar` ejecuta `models.list` con la llave del usuario
(llamada sin consumo de tokens, pero **llamada real** al proveedor). El
verificador (`crearVerificadorGeminiReal`) vive en `server/ia/nucleoIA.ts`
porque el SDK del proveedor sólo se instancia en ese fichero (invariante de la
Fase 1, comprobado por `tests/ia-fase1-integracion-server.test.ts`). En el
repositorio está **desactivada** (`IA_LLAVES_VERIFICACION` ausente ⇒ `503
VERIFICACION_NO_DISPONIBLE`), coherente con «sin activar consumo real». Se
activa sólo con `IA_LLAVES_VERIFICACION=PROVEEDOR` por decisión expresa del
responsable. Mientras tanto, la llave queda `REGISTRADA` y plenamente
utilizable por el núcleo: la primera operación real será su verificación de
hecho (y, si el proveedor la rechaza, el endpoint cae a su respaldo y el
registro guarda el código normalizado del error, como en Fase 1).

## 5. Seguridad y privacidad

- **Cifrado en reposo** con clave maestra que vive sólo en el entorno del
  servidor; rotación: descifrar con la antigua y recifrar con la nueva (fuera
  del alcance de esta fase, documentado en §9).
- **AAD = uid**: un documento copiado a otro uid no descifra.
- **La llave nunca viaja de vuelta**: `GET` devuelve estado, sufijo y fechas.
- **La llave nunca se registra en logs**: los eventos `[ia-llaves]` llevan uid,
  estado y sufijo. Prueba estática en la suite (`tests/ia-fase9-*.test.ts`)
  comprueba que ni `valor` ni `llave` se interpolan en los logs.
- **Aislamiento por usuario**: la resolución usa el uid del token; no hay ruta
  de administración que devuelva llaves de otros usuarios (los administradores
  ven en el gobierno el consumo, no las credenciales).
- **Fallo cerrado** ante clave maestra inválida o almacén no disponible.
- **El navegador valida sólo la forma** y envía la clave una vez, por HTTPS,
  en el cuerpo de un `PUT` autenticado con `Idempotency-Key`.

## 6. Interacción con el gobierno (Fase 2/7) y la validación (Fase 8)

- El gobierno sigue aplicando **permiso por rol y operación, cuotas finitas y
  saldo** aunque la llave sea del usuario: la Vía 2 no es «barra libre»; las
  cuotas son el techo operativo del ERP y la factura del proveedor es del
  usuario.
- La tarifa en créditos (`costeCreditosPorOperacion`) sigue siendo la que
  declare la política aprobada. Con Vía 2 el responsable puede declararla a
  `0` para todas las operaciones (créditos como mero contador) **o**
  mantenerla: es una decisión comercial, no técnica, y por eso no se toca.
- El sandbox de Fase 8 sigue ejecutándose con proveedor simulado; su guardia
  añade un aviso si falta la clave maestra (la Vía 2 no podría resolver
  llaves) sin convertirlo en bloqueo.

## 7. Pruebas de la fase

| Suite | Cubre |
| --- | --- |
| `tests/ia-fase9-llaves-usuario.test.ts` | Contrato puro (formato, sufijo, DTO), cifrado (ida y vuelta, AAD, clave maestra inválida, huella), servicio en memoria y en Firestore simulado (alta, sustitución idempotente, revocación, resolución interna, CAS), rutas HTTP (401/403/503/422/409/404/200), núcleo con Vía 2 (cliente con la llave del usuario; nunca con `GEMINI_API_KEY`; respaldo/428; cabecera; estado), composición (`configuracionIA`) y guardias estáticas (montaje en `server.ts`, ausencia de la llave en logs). |
| `tests/ia-fase9-tutorial-llave.test.ts` | Contenido del alta guiada (pasos completos, enlace oficial, avisos) y generación real del PDF con jsPDF (páginas > 0, sin lanzar). |
| `src/components/ia/AltaGuiadaLlaveIA.test.tsx` | UI en jsdom con `fetchImpl` inyectado: estado AUSENTE → alta → REGISTRADA, validación local, error 503 sin clave maestra, revocación, botón del PDF. |
| Suites previas | Ajuste mínimo de los `toEqual` de `/api/health` (campo `llaves`) en `ia-fase1-arranque-seguro` e `ia-fase1-integracion-server`. Nada más cambia de expectativa. |

## 8. Plan de entrega

### Bloque A — implementación (esta rama)

1. Documento de diseño (este fichero).
2. Contrato + tutorial puros, cifrado, servicio, rutas, núcleo, composición,
   `server.ts`, cliente, UI, PDF, script, `.env.example`, `package.json`
   (scripts; **sin dependencias nuevas**).
3. Pruebas nuevas + suite completa en verde + `tsc --noEmit` 0 errores +
   `npm run build` OK.
4. Commit(s) con prefijo `Fase 9 ·`, push a la rama de sesión, PR contra
   `main` (sin activar consumo real: ninguna variable nueva se configura en
   producción desde esta rama).

### Bloque B — cierre documental (contrato de integración §4.7–4.8)

1. `docs/IA-FASE-9-INFORME-CIERRE.md`: base → HEAD, qué toca, qué NO toca,
   pruebas ejecutadas, limitaciones reales, dependencias externas y política
   de resolución.
2. `docs/MAPA-MAESTRO-ERP-ACTUAL.md`: fila en la historia documental y anexo
   «Orden IA 9» con el cambio de estado (de quién es la clave; consumo sigue
   bloqueado).
3. `docs/ESTADO-GIT-ERP.md`: sección «ENTREGA EN RAMA — FASE IA 9» con base,
   HEAD verificado por `git ls-remote`, cambios, no tocado, pruebas y
   pendientes.
4. Comprobación final: worktree limpio, push verificado, PR actualizada.

## 9. Limitaciones reales y bloqueos (declarados)

1. **Rotación de la clave maestra** no automatizada: cambiarla invalida los
   criptogramas existentes (los usuarios tendrían que volver a registrar su
   llave). Procedimiento previsto: descifrar/recifrar con un script de
   operación bajo autorización; fuera del alcance de la fase.
2. **Verificación con el proveedor desactivada** por defecto (§4.7): la validez
   real de la llave se conoce en la primera operación.
3. **Sin límite de intentos de alta por usuario** más allá de la autenticación y
   la idempotencia; si hiciera falta, el gobierno ya ofrece el bloqueo de
   cuenta por administrador.
4. **Multiproveedor**: el contrato fija `proveedor: 'GEMINI'`; añadir otro exige
   su propia validación de formato y cliente.
5. **No se publican reglas** ni se migran datos; la activación en producción
   exige configurar `IA_LLAVES_CLAVE_MAESTRA` (generada con el script, guardada
   como secreto) **además** de la política aprobada (`IA_POLITICA_JSON`), y
   sigue sujeta a la autorización expresa de la Fase 8.

## 10. Variables de entorno de la fase

| Variable | Valores | Por defecto (repositorio) | Efecto |
| --- | --- | --- | --- |
| `IA_LLAVES_CLAVE_MAESTRA` | base64 de 32 bytes | ausente | Sin ella: llaves `NO_CONFIGURADO` (nadie registra, ningún proveedor). Inválida: fallo cerrado. |
| `IA_LLAVES_SIN_LLAVE` | `RESPALDO` · `EXIGIR` | `RESPALDO` | Qué pasa cuando el usuario no tiene llave: respaldo heurístico (sin consumo) o `428 LLAVE_USUARIO_REQUERIDA`. |
| `IA_LLAVES_VERIFICACION` | `DESACTIVADA` · `PROVEEDOR` | `DESACTIVADA` | Permite `POST /api/ia/llave/verificar` con llamada real (`models.list`). Requiere autorización expresa. |
| `GEMINI_API_KEY` | — | — | **Ya no se usa para operaciones de usuario.** Se conserva sólo como indicador en `/api/health` (`geminiKeyConfigured`) por compatibilidad. |

---

## 11. DECISIÓN

### 11.1 Decisión adoptada: **Vía 2 — clave propia de cada usuario**

Motivos: (1) elimina la exposición económica del operador y la necesidad de
una facturación previa de créditos para empezar; (2) atribuye el coste a quien
consume, de forma verificable en la propia cuenta de Google del usuario; (3)
conserva íntegro el gobierno de las Fases 2/7 como techo operativo; (4) es la
única vía que puede desplegarse **sin** convertir al ERP en revendedor del
proveedor. Las Vías 1 y 3 quedan **descartadas** para esta etapa; `GEMINI_API_KEY`
deja de intervenir en las operaciones de usuario.

### 11.2 Alta guiada (obligatoria con la Vía 2)

Una clave de API no es un concepto natural para propietarios, inquilinos o
profesionales. Por eso la Vía 2 se entrega con un alta guiada en
**Configuración → «Llave de IA (clave propia)»**, con estos pasos:

- **11.2.1 Qué es y por qué** — explicación en lenguaje llano: la IA del ERP
  funciona con la cuenta de Google del propio usuario; el ERP guarda la clave
  cifrada, no la muestra nunca, y el usuario puede revocarla cuando quiera.
- **11.2.2 Antes de empezar** — requisitos: cuenta de Google, acceso a Google
  AI Studio, y la advertencia de que la clave es **personal e intransferible**
  (no compartirla, no pegarla en correos ni chats).
- **11.2.3 Crear la clave en Google AI Studio** — enlace oficial
  `https://aistudio.google.com/app/apikey`, botón «Crear clave de API»,
  elección/creación del proyecto, copia de la clave (empieza por `AIza`).
- **11.2.4 Pegar la clave en el ERP** — campo de contraseña (no se ve lo
  escrito), validación local de forma con mensajes accionables, botón
  «Guardar clave». El navegador la envía una sola vez por HTTPS.
- **11.2.5 Confirmación** — estado `REGISTRADA`, sufijo visible («…a1b2»),
  fecha de alta; aviso de que las cuotas del ERP siguen aplicándose.
- **11.2.6 Verificación (si está disponible)** — botón «Comprobar con el
  proveedor»; si el entorno la tiene desactivada, el panel lo dice y explica
  que la primera operación hará de comprobación.
- **11.2.7 Sustituir o revocar** — sustituir (nuevo pegado) o revocar
  (borrado del criptograma, estado `REVOCADA`, el historial conserva el
  evento). Recomendación de revocar también la clave en Google AI Studio si se
  sospecha filtración.
- **11.2.8 Tutorial imprimible (PDF)** — botón «Descargar tutorial en PDF»
  (y «Imprimir») que genera, en el navegador y sin servidor, un documento A4
  con los pasos 11.2.1–11.2.7, los avisos de seguridad, un espacio para
  anotar la fecha de alta (nunca la clave) y preguntas frecuentes. El
  contenido sale del mismo módulo puro que alimenta la pantalla
  (`src/ia/tutorialLlaveUsuarioIA.ts`), de modo que PDF y UI no divergen.

### 11.3 Consecuencias operativas

1. Para activar la Vía 2 en un entorno hacen falta **dos** secretos de
   servidor: `IA_LLAVES_CLAVE_MAESTRA` (generada con `npm run
   ia:llaves:clave-maestra`) y la política aprobada en `IA_POLITICA_JSON`.
   Ninguno se configura desde esta rama.
2. Sin llave propia, el usuario recibe respaldo heurístico (por defecto) o un
   `428` que le remite al alta guiada (`IA_LLAVES_SIN_LLAVE=EXIGIR`).
3. El panel de gobierno (administradores) no cambia: sigue viendo consumo,
   cuotas y saldo; **no** ve llaves.
4. Toda la trazabilidad de la Fase 1 se mantiene: cada operación queda
   registrada con el uid del token y, ahora, con la cabecera que indica si se
   ejecutó con llave propia.
