# Informe de corrección de la auditoría de cierre — 2026-10-28

**Rama:** `arena/fb69e0b0-gestor-de-inmuebles-vercel` (no publicada, no fusionada)
**Base:** `2563831` (`main` del clon). **HEAD:** el último commit de la rama,
que se comprueba con `git log -1` (citar un hash dentro del mismo fichero que lo
contiene siempre queda un commit por detrás; ver la tabla del §2.2).
**Ámbito:** corrección de los defectos H-01…H-17 y D-01…D-09 de
`docs/INFORME-AUDITORIA-CIERRE-2026-10-27.md`.
**Naturaleza de este documento:** informe único de ejecución. No es una auditoría
nueva, no propone fases y no incluye peticiones de aprobación intermedias.

> **Regla de honestidad aplicada en todo el informe:** una prueba cuenta como
> superada sólo si se ha ejecutado en este entorno y el resultado está a la
> vista. Lo que no se ha podido ejecutar aparece en el §6 y **no** se cuenta como
> superado. Ninguna prueba omitida se presenta como aprobada.

---

## 1. Objeto, alcance y método

### 1.1 Qué se ha corregido

Los tres ejes bloqueantes de seguridad que la auditoría marcó como prioritarios y
el resto de hallazgos corregibles sin decisiones externas:

| Eje | Defecto | Estado |
|---|---|---|
| **A** | Relé de correo OTP abierto a cualquier usuario autenticado (H-08) | **Cerrado** |
| **B** | OTP generado, hasheado y validado en el navegador; firma forjable (H-03, H-07, H-09, H-10) | **Cerrado** |
| **C** | Límite de 256 KB eludible con `chunked` y cuota ausente/manipulable en 5 rutas públicas (H-04, H-05) | **Cerrado** |

### 1.2 Método

1. **Preservar antes de tocar.** Respaldo del árbol completo fuera de Git antes
   de confirmar: `/home/user/preservacion/arbol-20261028T080401Z.tar.gz`
   (sha256 `a74b652c33ef30915ebdbf945b4e4b0ca34593921370ba760062a206790ec2b0`,
   1.219 entradas, `gzip -t` OK), más `diff-rastreado-antes-commit.patch` y
   `git-status-antes-commit.txt`.
2. **Corregir en código, no en el informe.** Cada hallazgo cerrado tiene una
   prueba ejecutable o una comprobación HTTP reproducible (§5).
3. **No relajar reglas para aprobar.** Cuando un test fijaba el comportamiento
   inseguro (`.firebaserc` con `default` de producción) se reescribió el test
   **con el contrato nuevo explícito**, no se borró ni se puso `todo`.
4. **Commits locales pequeños y verificables.** Siete commits, cada uno con su
   verificación en el mensaje (§2).

### 1.3 Qué NO se ha hecho (por decisión del usuario, no por olvido)

Nada de: desplegar, publicar reglas o índices, escribir o migrar datos de
producción, activar servicios externos, contratar proveedores, usar
credenciales reales, `git push`, `merge` ni abrir PR. No se ha borrado ningún
informe ni documentación previa.

---

## 2. Estado Git verificable (H-01)

### 2.1 Hecho comprobado que cambia el diagnóstico

Este checkout **se recreó** desde `2563831`. Los commits locales que la
auditoría citaba como referencia de la sesión (`282b103`, `522d894`) **no son
resolubles aquí**:

```
$ git cat-file -e 282b103^{commit}   → fallo
$ git cat-file -e 522d894^{commit}   → fallo
$ git reflog → clone: from … (2563831) · checkout: moving from main to arena/fb69e0b0-…
```

El **contenido** de ese trabajo no se perdió: seguía íntegro en el árbol de
trabajo. Ese contenido es el que ha pasado la verificación de esta sesión y se
ha confirmado en `68030a7`, con un mensaje que declara el hecho tal cual.

Esto no repara la afirmación falsa del informe anterior (H-01: cuatro commits
que nunca existieron): la corrección es **dejar de citar hashes que Git no
puede demostrar** y pasar a citar sólo los de esta rama.

### 2.2 Commits de esta ejecución (verificados con `git log`)

| Hash | Contenido |
|---|---|
| `f2a28ef` | H-04 cuerpo acotado en streaming + H-05 cuota con IP de confianza + H-13 capacidad de auth real |
| `dfd3abb` | H-11 caché de cartera opt-in, con prefijo y borrada al cerrar sesión |
| `079725a` | H-14 guardias históricas sin `skip` incondicional |
| `146d797` | H-02 sin proyecto por defecto + H-16 índices declarados + documentación |
| `dd36454` | H-15 casos de emulador para las reglas nuevas + H-12 exclusión de pagos global |
| `3fd7cf1` | dependencias: crítica de DOMPurify y altas de express/vite (10 → 5) |
| `9273902` | recuperación: trabajo P0/P1/P2 + OTP que el clon recreado dejó sin confirmar |
| `f7cfde3`, `09758f5`, `6470e5d` | este informe y sus dos correcciones de cabecera |

> **Los hashes son de esta rama y se pueden comprobar con `git log`.** El
> entorno de trabajo recrea el `.git` en cada arranque (clon superficial desde
> `2563831`) conservando el árbol de ficheros; por eso los commits se rehacen y
> **sus hashes cambian de una ejecución a otra**. Lo que no cambia es el
> contenido ni la verificación: este informe se re-emitió tras la última
> recreación y las cifras del §7 se volvieron a medir sobre el árbol actual.

`git status` **limpio**. La rama **no existe en `origin`**
(`git ls-remote --heads origin refs/heads/arena/fb69e0b0-…` devuelve vacío):
es coherente con la prohibición de publicar, y por tanto el trabajo **sólo vive
en este checkout** hasta que se decida lo contrario.

---

## 3. Eje A — el relé de correo OTP ya no existe (H-08, H-10)

**Antes:** `POST /api/actas/otp/entregar` autenticaba y después enviaba un
código a **cualquier** `destino` que el cliente escribiera en el cuerpo. La
auditoría lo reprodujo con HTTP **200**: era un relé de correo abierto para
cualquier usuario con sesión, y el código viajaba en el cuerpo de la petición.

**Ahora:**

* La ruta **está retirada** y responde **410 `RUTA_RETIRADA`** con explicación,
  para que ni un cliente antiguo ni un atacante la confundan con un éxito.
* El envío vive en `POST /api/actas/otp/solicitar`, donde el destino **se deriva
  del participante guardado en el acta** (`destinoDelParticipante`), nunca del
  cuerpo: si se manda `destino`, se ignora; si el participante no tiene correo
  válido, **409 `DESTINO_NO_DISPONIBLE`**.
* Autorización explícita por rol y ámbito (esto cierra también **H-10**): gestor
  de la cartera del acta, master/administrador, o **el propio firmante**
  autenticado con correo **verificado** que coincide con el del participante.
  Cualquier otro caso: **403 `SIN_AUTORIZACION`**.

**Verificado en vivo** (servidor compilado, `dist/server.cjs`):

```
POST /api/actas/otp/entregar  → 410 {"codigo":"RUTA_RETIRADA", …}
POST /api/actas/otp/solicitar → 401 {"codigo":"NO_AUTENTICADO", …}  (sin token)
```

---

## 4. Eje B — el OTP y la firma tienen autoridad en el servidor (H-03, H-07, H-09)

### 4.1 Qué hacía el navegador antes

Generaba el código, calculaba su hash, lo escribía en `actas_otp`, lo leía para
mostrar el estado, lo actualizaba al fallar y **se declaraba la firma**
(`firmas[].estado = 'FIRMADA'`). El espacio de 6 dígitos con SHA-256 salado se
recorría en **134 ms** según la auditoría. La regla de Firestore lo permitía
porque el OTP era del mismo `ownerId`.

### 4.2 Arquitectura actual

```
navegador ──(id token)──► POST /api/actas/otp/solicitar ──► CSPRNG + SHA-256(sal)
                                    │                        └─► actas_otp (solo servidor)
                                    └──► correo al buzón DEL ACTA (enmascarado en la respuesta)

navegador ──(id token + código)──► POST /api/actas/otp/validar
                                    │  · intentos acotados (5) y enfriamiento 60 s
                                    │  · commit atómico: acta + actas_otp + audit_logs
                                    └──► firma acreditada; sin OTP válido NO hay firma
```

* **Generación y hash:** `src/utils/actas/actaOtpEngine.ts` con
  `globalThis.crypto` (rechazo de sesgo), sal de 128 bits y
  `algoritmoHash: 'SHA-256_SALTED'`. El código en claro **sólo existe** en el
  mensaje de correo; nunca se persiste ni se devuelve.
* **Consumo único y concurrencia:** la validación correcta escribe el acta, el
  OTP (`USADO`) y la auditoría en **un** `escribirAtomico` con precondición de
  `updateTime`. Si el acta cambió, **409 `CONFLICTO_CONCURRENCIA`** y el OTP
  **no** se consume.
* **Fuerza bruta (H-09):** intentos por OTP (5), enfriamiento de 60 s por
  firma, tope de 5 solicitudes/hora por firma y cuotas HTTP por IP y por
  `uid|acta|participante`. El espacio de 10⁶ deja de ser alcanzable.
* **Fallo de entrega:** si el proveedor rechaza el correo, el OTP se marca
  `EXPIRADO` con `transporteRealizado:false` y la API devuelve
  **502 `OTP_ENTREGA_RECHAZADA`**. Un modo seguro **nunca** devuelve `ok:true`.
* **Reglas (H-03):** `actas_otp` queda **cerrada al cliente** (`get, list` sólo
  master; `create, update, delete: false`) y en `actas` la función
  `evidenciaFirmaSoloServidor()` impide al propietario tocar `firmas`,
  `estadoFirma` ni `fechaFirma`, declarar el acta `FIRMADA` o nacer con firmas.
* **Cliente:** `ActasSection.tsx` ya no llama al motor de OTP; sólo a
  `solicitarOtpFirma` / `validarOtpFirmaApi` (`src/lib/entregaOtpApi.ts`), y
  `grep` confirma que **ningún** fichero de `src/` menciona `actas_otp`.

### 4.3 Pruebas ejecutadas

| Fichero | Resultado |
|---|---|
| `tests/otp-servidor.test.ts` | **17/17** |
| `tests/otp-transporte.test.ts` | **9/9** |
| `tests/reglas-actas-otp.test.ts` | **10/10** |
| `tests/acta-otp-entrega.test.tsx` | **9/9** |
| `tests/otp-csprng.test.ts` | **10/10** |
| `tests/acta-firma-e2e.test.ts` | **2/2** |

Contratos fijados: `solicitar` ⇒ `{ok, enviado, firmante, firmaId, otpId,
destinoEnmascarado, expiraEn, actaEstado}`; `validar` ⇒ `{ok, valido, firmante,
firmaId, estadoFirma, actaCerrada}`. Errores: `NO_AUTENTICADO` (401),
`SIN_AUTORIZACION` (403), `PETICION_INVALIDA` (400), `ACTA_NO_FIRMABLE` /
`FIRMA_YA_COMPLETADA` / `CONFLICTO_CONCURRENCIA` / `DESTINO_NO_DISPONIBLE`
(409), `OTP_NO_DISPONIBLE` / `FIRMA_NO_ENCONTRADA` (404), `DEMASIADAS_PETICIONES`
(429), `OTP_INVALIDO` (401, con `intentosRestantes`), `OTP_ENTREGA_RECHAZADA`
(502), `SERVIDOR_SIN_CONFIGURAR` (503).

---

## 5. Eje C — cuerpo acotado y cuota real en las superficies públicas (H-04, H-05)

### 5.1 H-04 · el `chunked` ya no esquiva el tope

**Antes:** el tope de 256 KB se comprobaba **sólo** con `Content-Length`. Un
cuerpo `Transfer-Encoding: chunked` llegaba entero al parser global de 15 MB (la
auditoría reprodujo 413 con cabecera y 503 con `chunked`).

**Ahora:** `server/shared/limiteCuerpo.ts` cuenta los **bytes del stream** y
corta en el límite, en los cuatro prefijos públicos (`/api/solicitud`,
`/api/visita`, `/api/cuestionario`, `/api/documentacion`), **antes** de que
`express.json`/`urlencoded` puedan releer el cuerpo, con
`type: () => true`. Un manejador de error dedicado traduce el fallo a
**413 `PETICION_INVALIDA`** en JSON (antes se convertía en un 500/503 opaco).

**Verificación HTTP real** contra `dist/server.cjs` recién compilado:

| Petición | Código | Cuerpo |
|---|---|---|
| `POST /api/solicitud/x` · **300 KB `chunked`** | **413** | `PETICION_INVALIDA` «La solicitud es demasiado grande» |
| `POST /api/solicitud/x` · 300 KB con `Content-Length` | **413** | idéntico |
| `POST /api/solicitud/x` · cuerpo pequeño | 503 | `PORTAL_NO_DISPONIBLE` (no hay Firestore configurado: falla cerrado) |
| `GET /api/health` | 200 | JSON de capacidades |

Prueba automatizada: `tests/portal-publico-limites.test.ts` **4/4** (incluye
`chunked` de 300 KB ⇒ 413 y `urlencoded`).

### 5.2 H-05 · la cuota ya no se puede cambiar de «IP»

**Antes:** `x-forwarded-for` se aceptaba siempre; bastaba rotar la cabecera para
estrenar cubo en cada petición. Además faltaba cuota en cuatro de las cinco
superficies públicas.

**Ahora:**

* `proxyDeConfianza(entorno)` sólo activa `trust proxy` con `VERCEL` o
  `TRUST_PROXY=1/true/sí/on`; `server.ts` hace
  `app.set('trust proxy', proxyDeConfianza())`.
* `claveClientePeticion(headers, token, ipRemota, usarProxy)`: la IP de conexión
  manda y `x-forwarded-for` **sólo** se lee con proxy de confianza. Clave
  `ip|token`.
* Cuotas por superficie en `rutasPortalPublico.ts` (`aplicarCuota`): solicitud
  8/min, visita 12/min, cuestionario 8/min, documentación 8/min, lecturas
  40/min; honeypot resuelto **antes** de tocar el servicio (400 sin efecto).

Pruebas: `tests/rate-limit-solicitud.test.ts` **10/10** (incluye «IP falsificada
NO cambia la clave») y `server/portalPublico/rutasPortalPublico.test.ts`
**13/13** (honeypot 400 sin llamar al servicio; 429 con `Retry-After`).

### 5.3 H-13 · la capacidad de autenticación deja de ser una constante

`capacidades.autenticacion` era `{estado:'OK'}` **literal**, y el doctor contaba
esa aserción como real («1/8»). Ahora `EntradasCapacidades` recibe
`autenticacion: boolean` y `server.ts` la deriva de la configuración real
(`proyectoId` resuelto y sin `errorConfiguracion`). Verificado en vivo: sin
credenciales, `/api/health` informa `autenticacion: NO_CONFIGURADO` y el resto en
`NO_CONFIGURADO`/`SIMULACION` — **14 capacidades**, ninguna «OK» inventada.
`tests/health-capacidades.test.ts` **9/9** (incluye el caso nuevo «sin proyecto
Firebase la autenticación NO es OK»).

---

## 6. Resto de hallazgos

| ID | Corrección | Verificación | Estado |
|---|---|---|---|
| **H-01** | Commits reales en lugar de hashes inexistentes; trabajo sin confirmar recuperado | `git log` (§2.2), `git status` limpio | **Cerrado** |
| **H-02** | `.firebaserc` **sin `projects.default`**; producción sólo como alias `produccion`; documentación con `--project` obligatorio | `tests/reglas-despliegue-produccion.test.ts` 4/4, `tests/configuracion-indices.test.ts` 8/8 | **Cerrado** |
| **H-03** | `evidenciaFirmaSoloServidor()` + `altaSinEvidenciaDeFirma()` + `actas_otp` cerrada | `tests/reglas-actas-otp.test.ts` 10/10 | **Cerrado** |
| **H-04** | Parser que cuenta bytes (streaming) | 4/4 + HTTP real 413 | **Cerrado** |
| **H-05** | IP de confianza + cuotas en las 5 superficies | 10/10 + 13/13 | **Cerrado** |
| **H-06** | Token público = `sol-<idInmueble>` legible: **no corregido** | — | **Abierto (no bloqueante)** |
| **H-07** | OTP en servidor, firma acreditada por commit atómico | 17/17 + 9/9 + 2/2 | **Cerrado** |
| **H-08** | Relé retirado (410) y destino derivado del acta | 410 en vivo + 9/9 | **Cerrado** |
| **H-09** | Intentos, enfriamiento, topes/hora y cuotas | 17/17 (+ `otp-csprng` 10/10) | **Cerrado** |
| **H-10** | Autorización por rol y ámbito en las rutas OTP | 17/17 (403 `SIN_AUTORIZACION`) | **Cerrado** |
| **H-11** | Caché opt-in, con prefijo, borrada al cerrar sesión | `tests/cache-local-h11.test.ts` 10/10 | **Cerrado** |
| **H-12** | Escáner global de banca/pagos sobre `src/` + `server/` | `tests/exclusion-integraciones-pago.test.ts` 5/5 | **Cerrado** |
| **H-13** | Capacidad derivada de configuración | 9/9 | **Cerrado** |
| **H-14** | `skip` ligado a la resolubilidad real del commit base | `test:operaciones` 299 pass/0 fail/3 skip · `test:patrimonial` 85/0/3 | **Cerrado** |
| **H-15** | 2 ficheros nuevos de emulador, **17 casos** para `actas_otp`, `actas`, `solicitudes`, `audit_logs` | **No ejecutados** (sin Java ni CLI) | **Parcial** |
| **H-16** | `firebase.json` declara `"indexes"`; documentación corregida (colecciones reales, `--force`, no-op de la CLI) | 8/8 (`configuracion-indices`) + `configuracion-documentada` 5/5 | **Cerrado en repositorio, no verificado con la CLI** |
| **H-17** | Sin staging operativo (P-06) y sin dictamen fiscal firmado (P-05) | `docs/P1.4-DICTAMEN-FISCAL-PREVIO-2026-10-27.md` es pre-dictamen técnico, **no** dictamen | **Abierto (externo)** |
| **D-09 / R-5** | `docs/CONFIGURACION-VERIFICABLE.md` §7: colecciones reales (ninguno de los 10 índices es de `candidatos`/`solicitudes`), comandos con `--project`, aviso de `--force` | test 8/8 | **Cerrado** |

### 6.1 H-14 · el detalle que la auditoría no vio

El `skip` dependía de `existsSync(docs/REGISTRO-EJECUCION-2026-10-27.md)`, un
fichero **siempre presente**: las 6 guardias se omitían siempre, incluso con
historial completo. Ahora dependen de `existeCommit(BASE_CHECKOUT)`.

Al reescribir una de ellas se destapó un fallo real que estaba **oculto por el
skip**: `src/features/operaciones/tests/isolation.test.mjs` usaba
`existeCommit(base)` con una variable `base` **inexistente**; en cuanto la
guardia se evaluaba, el fichero entero abortaba (`ReferenceError`). Corregido a
`BASE_CHECKOUT` (299 pass / 0 fail). Es exactamente el tipo de defecto que H-14
existía para destapar.

---

## 7. Validación ejecutada (cifras exactas, hoy)

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` | **0 errores** |
| `npm test` (Vitest) | **308 archivos, 5180 passed, 2 skipped, 7 todo** (5189) |
| `npm run test:operaciones` | **302 tests · 299 pass · 0 fail · 3 skip** |
| `npm run test:patrimonial` | **88 tests · 85 pass · 0 fail · 3 skip** |
| `npm run build` | **OK** · bundle 5.557,19 kB (1.383,64 kB gzip) · `dist/server.cjs` 710,7 kB |
| `npm run doctor` | sin inconsistencias estáticas; **0/8 capacidades en vivo** (no se le pasó `--url`) |
| `/api/health` en servidor real | **200**, 14 capacidades, ninguna «OK» sin configuración |
| Chunked 300 KB | **413** `PETICION_INVALIDA` |
| `x-forwarded-for` falsificado | no cambia la clave de cuota (test) |
| `POST /api/actas/otp/entregar` | **410** `RUTA_RETIRADA` |
| `POST /api/actas/otp/solicitar` sin token | **401** `NO_AUTENTICADO` |
| `npm audit --omit=dev` | **5 altas, 0 críticas** (partía de 10 · 1 crítica) |

**Los 2 tests omitidos de la suite** son `tests/seguridad-firestore-valoraciones.test.ts` §10.9:
dependen de que exista el commit histórico `33fcf38` para comparar la regla
anterior, y en este clon no existe. No se declaran superados. Los **7 `todo`**
son casos negativos de copropiedad declarados como pendientes por el propio
autor original, ajenos a esta corrección.

### 7.1 Dependencias (de 10 a 5, sin cambios de versión principal)

Se corrigió lo que no exigía un salto mayor:

* `overrides.dompurify = ^3.4.17` — cerraba la **crítica** que llegaba por
  `jspdf@4.2.1 → dompurify@3.4.15` (XSS en `IN_PLACE`). Encaja en el rango
  `^3.3.1` que pide `jspdf`; `jspdf` no usa `innerHTML`, pero el paquete quedaba
  instalado en el bundle.
* `npm audit fix` (sin `--force`): `express` 4.22.3, `body-parser` 1.20.9,
  `qs` 6.16.2, `vite` 6.4.5, `source-map-js` 1.2.2 — todos dentro de los rangos
  ya declarados. Suites y build repetidos **después** del cambio: idénticos.

Queda **bloqueado a propósito**:

* `firebase@12` (4 avisos, vía `@grpc/grpc-js`): el único «arreglo» es **bajar a
  `firebase@9.14.0`**, un downgrade de tres versiones mayores. No se aplica.
* `nodemailer@6.10.1`: el arreglo es `nodemailer@10.2.1` (salto de cuatro
  mayores). Exige revisar la API SMTP y las pruebas de entrega; se documenta y
  no se improvisa dentro de una corrección de seguridad.

---

## 8. Lo que NO se ha verificado (y no se presenta como superado)

1. **Emulador oficial de reglas (H-15).** `java` no existe en este entorno y
   `firebase-tools` no está instalado:
   `npm run test:emulador:reglas` **no se ha ejecutado**. Los 8 ficheros con
   **84 casos** (antes 6 / 67; +17 nuevos para `actas_otp`, `actas`,
   `solicitudes` y `audit_logs`) quedan para CI/staging. Las pruebas de reglas
   que sí se ejecutaron (`reglas-actas-otp` 10/10) son de **evaluador estático**,
   no del motor real: se declaran como tales.
2. **Publicación de reglas e índices (H-16).** `firebase.json` ya declara
   `indexes`, pero **no se ha ejecutado ningún comando de la CLI**. Con
   `firebase-tools` 15.10.0 `--only firestore:indexes` fue un **no-op
   silencioso** en configuración multi-base (`firebase/firebase-tools#10447`);
   debe confirmarse con la versión fijada 15.33.0 en un proyecto de staging.
   **Nunca** con `--force`: con `fieldOverrides: []` borraría índices y
   exclusiones creados por consola.
3. **Staging operativo (H-17).** No existe; no se ha creado ni se ha tocado
   ningún proyecto real. «Staging documentado» no es «staging operativo».
4. **Dictamen fiscal (H-17 / P-05).** `docs/P1.4-DICTAMEN-FISCAL-PREVIO-2026-10-27.md`
   es un **pre-dictamen técnico** con fuentes AEAT/BOE; **no** es un dictamen
   firmado. Hasta que exista, no se implementa transporte AEAT, ni plataforma
   B2B, ni declaración responsable de SIF, ni modalidad VERI*FACTU.
5. **E2E de navegador.** Sigue sin haber suite de navegador; las pruebas son de
   componente/servidor con `jsdom`.
6. **Bundle.** 5,56 MB en un único chunk, sin code-splitting: deuda de
   rendimiento, no de seguridad. No se aborda aquí para no mezclar riesgos.
7. **H-06.** El «token» del portal público es `sol-<idInmueble>`: cualquiera que
   conozca el id puede presentar una solicitud. Es un formulario público por
   diseño, pero la palabra «capacidad» no corresponde. Cambiarlo exige migrar
   enlaces ya publicados (fuera de alcance sin datos reales).
8. **Prueba de aceptación SMTP real.** No se ha enviado ningún correo: no hay
   proveedor configurado ni credenciales, y está prohibido activar servicios
   externos.

---

## 9. Exclusión permanente: banca, PSD2 y pagos online

Verificada **mecánicamente** en todo el código de producto (`src/` y `server/`,
> 300 ficheros), no por declaración de intenciones:
`tests/exclusion-integraciones-pago.test.ts` **5/5** falla si aparece cualquier
SDK o dominio de Stripe, Redsys, PayPal, Adyen, Mollie, Braintree, Square,
Plaid, Tink, GoCardless, Nordigen, o cualquier función de conciliación
automática (`importarMovimientosBancarios`, `conciliarAutomaticamente`,
`sincronizarBanco`, `openBanking`).

`Bizum`, `transferencia` y `domiciliación` sobreviven **sólo** como etiquetas de
un método declarado por una persona; el registro contable sigue exigiendo la
función humana `registrarPagoPeriodo` (`tests/justificantes-sin-contabilizacion.test.ts`,
que se conserva). Ningún pago se registra por inferencia de IA.

---

## 10. Veredicto

### **VALIDACIÓN INCOMPLETA**

No es **PREPARADO PARA VALIDACIÓN EN STAGING** porque dos condiciones de la
propia auditoría siguen sin cumplirse y no dependen de este entorno de código:
las **reglas nuevas no se han ejecutado nunca contra el motor real** de Firebase
(H-15) y **no existe staging operativo** ni dictamen fiscal firmado (H-17).

No es **NO PREPARADO** porque los siete bloqueantes de seguridad lo estaban por
defectos concretos que **hoy están cerrados y verificados**:

* el relé de correo responde **410** y el destino del OTP se deriva del acta;
* el OTP y la firma tienen autoridad en servidor, con commit atómico, intentos
  acotados y `actas_otp` cerrada al cliente;
* el cuerpo público se corta **también** con `chunked` (**413** medido);
* la cuota ya no se puede cambiar de IP por cabecera y cubre las 5 superficies;
* no hay destino de despliegue implícito (producción ya no es el `default`);
* el trabajo está en commits verificables y el árbol está limpio.

### Qué falta exactamente para pasar a «PREPARADO PARA VALIDACIÓN EN STAGING»

1. Ejecutar `npm run test:emulador:reglas` en CI (Java 21) y ver los 84 casos en
   verde, en particular los 17 nuevos. **Sin ese verde, H-15 no está cerrado.**
2. Crear un proyecto de staging real y, **sin tocar producción**:
   `firebase deploy --only firestore:indexes --project <staging>` seguido de
   `firebase firestore:indexes --project <staging> --database <id>` para
   confirmar que los 10 índices se crean (y que la CLI 15.33.0 no hace un no-op
   silencioso). Después, reglas en el mismo staging y una pasada de aceptación
   con una cuenta que no sea master.
3. Obtener el dictamen fiscal firmado (P-05) o dejar por escrito que la
   facturación queda fuera del alcance del despliegue.
4. Decidir sobre `nodemailer@10` y `firebase@12` (los 5 avisos restantes): no se
   resuelven sin cambio de versión principal y sin una prueba de entrega real.

**Nada de esto se ha hecho en esta sesión y nada se ha desplegado.** El
repositorio queda en un estado coherente, reproducible y honesto: los defectos
corregidos tienen prueba, y lo que no se ha podido probar está dicho con su
nombre.
