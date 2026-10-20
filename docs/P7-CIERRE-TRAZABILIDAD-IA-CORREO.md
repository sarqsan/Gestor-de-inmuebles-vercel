# P7 — Cierre funcional: correo sin falsos éxitos, resultados de IA trazables

Fecha: 2026-10-20

- SHA inicial real de `main` (verificado contra `origin/main` al empezar): `c359b1a2238030ab036591199f51c145aa5afd91`
- SHA de `main` tras la fusión del código de este cierre (PR #55): `ae5c32fcf0879c1565ddd6d31d3536c3474600db`
- Rama de trabajo: `arena/e9a268de-gestor-de-inmuebles-vercel`
- Estado: **P7 cerrado** (protecciones presentes, verificadas y fusionadas).

> El commit de fusión de este documento (PR #56) es documental y no altera código.
> La referencia de código verificada para el cierre es `ae5c32fc…`.

## 1. Punto de partida real (no el comunicado)

| Comprobación | Resultado |
| --- | --- |
| `git log -1 main` y `git log -1 origin/main` | `c359b1a2238030ab036591199f51c145aa5afd91` en ambos (coincidían) |
| Correcciones P7 anteriores (PR #48) | **Integradas**: PR #48 `MERGED` el 2026-10-19, commit de fusión `8d9c22fa761b99aa188f0341317f041cd29c4046`, ancestro de `main` (commit de trabajo `120d31b`) |
| Documentación de cierre P7 previa | **No existía** ningún documento P7 en `docs/`; este es el primero |
| Controles CI del repositorio | `.github/workflows/emulador-reglas.yml`: jobs **«Reglas Firestore y Storage (emuladores oficiales)»** y **«Tipos, suite completa y build»** (tsc + vitest + build), ambos obligatorios en cada PR |

Lo que ya estaba resuelto y **no** se ha reconstruido:

- Envío por Gmail API con fallo cerrado: solo se registra `CORREO_ENVIADO`, `fechaEnvio` y
  entrada de historial de éxito cuando la respuesta contiene `id` y `threadId` no vacíos; ante
  cancelación OAuth, token ausente, error HTTP o respuesta 2xx no verificable se conserva el
  borrador persistido y **no** se marca el envío (PR #48).
- Análisis de respuesta de aseguradora con fallo cerrado: se eliminó el *fallback* que inventaba
  dictámenes favorables; `server/ia/respuestaAseguradora.ts` + `src/ia/analisisRespuestaAseguradora.ts`
  validan el esquema y dejan el expediente en `ERROR_PROCESAMIENTO` con el texto original (PR #48).

## 2. Carencias reales encontradas y corregidas

### 2.1 La lectura automática se presentaba como «dictamen oficial»

El detalle del expediente titulaba el resultado de la IA **«Dictamen Oficial Extraído por IA»**, y
el listado mostraba el valor del campo `dictamenAseguradora` sin indicar su origen. Eso convierte un
análisis en un dictamen de aseguradora, que es exactamente lo que P7 prohíbe.

Corrección: `src/lib/seguroImpagoPresentacion.ts` (módulo puro) calcula origen, etiqueta, descripción
y tono; el detalle pasa a **«Lectura automática del correo (extracción IA)»** con aviso de que *no es
un dictamen oficial ni un certificado de la aseguradora* y requiere validación humana. El listado
muestra `Lectura IA · …`, `Pendiente de revisión humana` o `En estudio` con la misma fuente.

### 2.2 La respuesta pendiente de revisión no dejaba traza visible

`ERROR_PROCESAMIENTO` se persistía con el texto original, pero al reabrir el expediente la interfaz
no mostraba nada. Ahora hay un panel persistente («Respuesta conservada · pendiente de revisión
humana») con el texto original sin modificar y la indicación de que no se ha registrado dictamen ni
decisión automática.

### 2.3 El borrador de correo ocultaba los fallos de IA y atribuía a la IA la plantilla

`POST /api/generar-correo-aseguradora` devolvía la plantilla determinista del ERP con HTTP 200 sin
distinguirla de un texto generado por el proveedor; el cliente, además, se tragaba los errores.

Corrección:

- `server/ia/correoAseguradora.ts`: fallo cerrado (`IA_NO_DISPONIBLE`, `ERROR_PROVEEDOR_IA`,
  `RESPUESTA_IA_INVALIDA`), mismo patrón que el análisis de respuesta.
- `src/ia/borradorCorreoAseguradora.ts`: validación de contrato compartida cliente/servidor.
- El endpoint solo devuelve `generadoConIA: true` con `asunto` y `cuerpo` válidos; en cualquier otro
  caso devuelve la plantilla con `generadoConIA: false` y `motivoGeneracionSinIA`.
- El cliente valida la respuesta, conserva el borrador actual ante error y avisa del origen real
  («Borrador redactado por IA» vs. «se ha aplicado la plantilla estándar del ERP»).

### 2.4 Una estimación local se presentaba como análisis de IA

El bloque 3 del expediente se titulaba «ANÁLISIS IA Y ESTIMACIÓN DE RIESGO» y «Scoring de
Solvencia», pero la puntuación se calcula localmente (`CrearSolicitudSeguroModal`, fórmula sobre
ingresos/renta). Ahora se titula **«ESTIMACIÓN LOCAL DE SOLVENCIA»**, «Estimación local: N/100», con
nota de que es un cálculo del gestor y no un dictamen ni una valoración de la aseguradora. No se
renombran los campos persistidos (`scoreSolvenciaIA`, `nivelRiesgoIA`…) para no forzar migración;
queda documentado como deuda de nomenclatura.

### 2.5 Estados, errores y decisión humana

- Estado de envío con etiqueta y descripción reales: solo `CORREO_ENVIADO`
  se muestra como confirmado, con fecha de confirmación; el resto no afirma envío.
- Avisos de Gmail tipados (información vs. error) y mensaje explícito cuando no se puede confirmar
  o no hay contenido legible.
- Aviso de que el texto de demostración («Simular») **no lo ha enviado ninguna aseguradora**.
- Guardia contra dobles envíos por doble clic mientras hay un envío en curso.
- `Guardar Decisión` ahora espera a la persistencia: si falla, muestra alerta y **no cierra** el
  expediente (antes se cerraba como si se hubiera guardado).
- Se persisten valores declarados de `DecisionFinalPropietarioSeguro`
  (`ACEPTAR_CANDIDATO`/`SOLICITAR_AVAL_EXTRA`/`RECHAZAR_CANDIDATO`) con normalización de las
  etiquetas heredadas (`ACEPTADO`/`CONDICIONADO_AVAL`/`RECHAZADO`), y `dictamenTexto` validado
  (campo opcional añadido a `SolicitudSeguroImpago`).

## 3. Archivos relevantes

| Archivo | Papel |
| --- | --- |
| `src/components/DetalleSolicitudSeguroModal.tsx` | Envío Gmail, lectura IA, revisión humana, decisión y estados |
| `src/components/sections/SeguroImpagoSection.tsx` | Badges de estado y origen del dictamen en el listado |
| `src/lib/seguroImpagoPresentacion.ts` | Etiquetas/tonos y normalización de la decisión (puro, compartido) |
| `server/ia/correoAseguradora.ts` | Fallo cerrado del borrador de correo |
| `src/ia/borradorCorreoAseguradora.ts` | Contrato del borrador (cliente y servidor) |
| `server.ts` | `/api/generar-correo-aseguradora` declara `generadoConIA` y el motivo del respaldo |
| `src/types.ts` | `dictamenTexto?` en `SolicitudSeguroImpago` |
| `docs/P7-CIERRE-TRAZABILIDAD-IA-CORREO.md` | Este documento |

Se reutilizan los servicios existentes (`src/lib/gmailClient.ts`, `src/lib/clienteIA.ts`,
`server/ia/respuestaAseguradora.ts`, `server/ia/nucleoIA.ts`, `src/feedback/*`). No se crean
pantallas ni sistemas de trazabilidad paralelos.

## 4. Pruebas ejecutadas (resultados exactos)

Ejecución local, árbol limpio, commit `90f429c0953c8258cea09cf2e42df8232cd666f9` (fusionado como `ae5c32fc…`):

| Prueba | Resultado |
| --- | --- |
| `vitest` focales P7: `DetalleSolicitudSeguroModal.test.tsx` (26), `src/lib/seguroImpagoPresentacion.test.ts` (9), `tests/ia-borrador-correo-aseguradora.server.test.ts` (14), `tests/analisis-respuesta-aseguradora.server.test.ts` (12) | **61/61** |
| `tests/ia-fase1-integracion-server.test.ts` (núcleo IA, app real de `server.ts` y matriz de endpoints) | **36/36** |
| `npx vitest run` (suite completa) | **263 archivos, 263 correctos; 4702 pruebas correctas, 7 `todo`, 0 fallidas** |
| `npm run lint` (`tsc --noEmit`) | OK |
| `npm run build` (vite + bundle de servidor) | OK |
| `npm run test:integracion` | **300/302**; los 2 fallos son guardias heredadas del árbol canónico (`src/features/operaciones/tests/integration-boundaries.test.mjs:79` compara `server.ts` con el delta P2/P4 y `isolation.test.mjs:445` contrasta el diff con `f782`, que ya incluye las superficies P3 de `main`). Ya estaban documentadas en el PR #48 y **no se han alterado**. |

Cobertura nueva de los supuestos exigidos por P7:

- Envío confirmado, fallido e incierto; cancelación OAuth; token ausente; respuesta 2xx no verificable
  (con `id` o `threadId` vacíos). Sin éxito ficticio y sin reintento automático.
- Ausencia de doble envío por clics repetidos mientras el envío está en curso.
- IA válida, incompleta, inválida, JSON roto, proveedor caído y cliente no disponible; conservación
  del texto original y del estado de revisión humana; el dictamen previo no se reutiliza.
- Borrador de correo: contrato compartido, respaldo declarado como plantilla, borrador del usuario
  conservado ante error.
- Separación análisis/recomendación/dictamen: la lectura IA nunca se presenta como dictamen oficial;
  la solvencia local nunca se presenta como IA.
- Decisión humana: no cierra el expediente si no persiste y guarda valores declarados del modelo.
- Estados y mensajes visibles coherentes con el resultado real (incluido el texto de demostración).

## 5. Controles de integración (CI real del PR #55)

Run `39405807118`, commit `90f429c0953c8258cea09cf2e42df8232cd666f9`:

| Job | Resultado | Cifras |
| --- | --- | --- |
| Reglas Firestore y Storage (emuladores oficiales) | **pass** | 79/79 pruebas (5 archivos) |
| Tipos, suite completa y build | **pass** | 262/262 archivos; 4705 pruebas (4698 correctas + 7 `todo`), 0 fallidas; `tsc` OK; build OK |
| Vercel (preview del PR) | **pass** | Deploy de previsualización, sin paso a producción |
| Vercel Preview Comments | **pass** | — |

Fusión: PR #55 `MERGED` por `sarqsan` el 2026-10-20T10:12:15Z mediante *merge commit*
(`ae5c32fcf0879c1565ddd6d31d3536c3474600db`). `main` local y `origin/main` sincronizados; árbol de
trabajo limpio antes y después de la fusión.

## 6. Qué es una prueba simulada y qué no se ha probado

- **No se ha enviado ningún correo real**, ni a destinatarios internos ni externos, y **no se ha
  contactado con Gmail** en ninguna prueba: `sendGmailMessage`, `searchGmailMessages`,
  `getGmailMessageDetails`, `getAccessToken` y `googleSignIn` se sustituyen por dobles en las pruebas.
- **No se ha llamado a ningún proveedor de IA real**: el cliente y el generador se inyectan como
  dobles; el endpoint se probó contra la app real de `server.ts` con el proveedor no configurado.
- **No se ha contactado con ninguna aseguradora** ni se ha emitido ningún dictamen: los textos
  «Simular» son de demostración y ahora se etiquetan como tales.
- **No se han hecho escrituras ni pruebas en producción**, ni despliegues manuales, ni cambios de
  configuración de Vercel. El despliegue de *preview* del PR es la automatización ya existente.
- No se ha instalado Java, Firebase CLI ni emuladores como requisito nuevo: los emuladores son los
  del workflow preexistente, ejecutados en CI.

Por tanto, el envío de correo y el proveedor de IA están verificados **por contrato y por dobles**,
no mediante una operación real contra el servicio externo.

## 7. Limitaciones y pendientes verificados

1. **Guardias históricas de `test:integracion` (2 fallos)**: ajenas a P7 (comparan `server.ts` con el
   delta P2/P4 y el diff con el checkout `f782`). No se modifican; quedan documentadas.
2. **Nomenclatura heredada**: los campos persistidos `scoreSolvenciaIA`, `resumenSolvenciaIA`,
   `nivelRiesgoIA` y `alertasDetectadasIA` siguen llamándose «IA» aunque el cálculo es local. La
   interfaz ya no lo presenta como IA; renombrarlos exigiría migración de datos y queda fuera de P7.
3. **Origen de la respuesta recibida**: el modelo no guarda si el texto llegó de Gmail, se pegó a
   mano o procede de la demostración. La interfaz avisa del caso simulado, pero la traza persistida
   no lo distingue; añadirlo requiere un campo nuevo y reglas de datos (fuera de alcance).
4. **`dictamenTexto`**: ahora se persiste cuando la lectura IA es válida; los expedientes anteriores
   no lo tienen y muestran el código del dictamen.
5. La estimación local y la lectura IA siguen requiriendo validación humana explícita; no existe (ni
   se ha añadido) ningún dictamen automático de aseguradora.
