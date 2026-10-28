# Evidencia de verificación en producción — 28-10-2026

Registro de los dos ciclos de fusión de la tarde del 28-10-2026 y del **fallo de
métrica** que apareció en el primero. Existe porque el proyecto se gobierna con
evidencia ejecutada, no con impresiones: si un run dice «verde», tiene que poder
decirse **de qué commit**.

## Ciclo 1 — H-06 (PR #71) · evidencia NO válida para el commit

| Dato | Valor |
|---|---|
| Merge en `main` | `8a1e84b` (19:40:14Z) |
| Run de verificación | `40756373910` · **success** |
| Despliegue de producción de `8a1e84b` | `7395524034` · creado 19:41:22Z |
| Despliegue que el run verificó | el anterior, `0622e5a` |

El run se declaró verde **antes de que existiera** el despliegue del commit
fusionado. Verificó `0622e5a`, el merge anterior. Las cuatro comprobaciones
(200 / 410 / 401 / 413) eran ciertas, pero hablaban de otro código.

**Por qué importa:** es la peor clase de verde. Un run verde que no identifica el
commit verificado es indistinguible de un run verde correcto, así que la
siguiente persona lo cita como prueba de algo que no se probó.

**Causa:** el workflow cogía «el último despliegue de producción en éxito» en el
instante de arrancar. Vercel tarda ~1 min en construir; un run disparado por
`push` a `main` siempre llega antes.

## Ciclo 2 — corrección de la métrica (PR #72)

| Dato | Valor |
|---|---|
| Merge en `main` | `5280678` (19:50Z) |
| Run de verificación | `40757856045` · **success** |
| Despliegue de producción de `5280678` | `7395735721` · creado 19:51:20Z, éxito 19:51:21Z |
| Paso «Resolver el despliegue» | 19:50:20Z → 19:51:23Z (**63 s**) |

Los 63 s del paso son la prueba de que **esperó a su propio commit**: con la
lógica anterior ese paso tardaba ~5 s. Terminó 2 s después de que el despliegue
de `5280678` pasara a éxito, es decir, en cuanto apareció la coincidencia de
`sha`.

Comprobaciones (todas de solo lectura, sobre el alias estable
`https://gestor-de-inmuebles-vercel.vercel.app`):

| Comprobación | Respuesta | Lectura |
|---|---|---|
| `/api/health` | **200** | esquema 1 y mapa de capacidades legibles |
| `POST /api/actas/otp/entregar` | **410** | ruta retirada como debe |
| `POST /api/actas/otp/solicitar` | **401** | sin sesión, no se generó ningún OTP |
| `POST /api/solicitud` (300 KB fragmentados) | **413** | rechazado antes de parsear |

## Regla operativa que queda

1. Un run verde **solo** cuenta como evidencia si su resumen dice
   `**Commit verificado:** <sha>` y ese sha es el del merge.
2. Si el resumen trae «⚠️ El despliegue verificado no es el commit de este run»,
   la evidencia **no** sirve: hay que relanzar cuando el despliegue exista.
3. La guardia `tests/verificacion-produccion-workflow.test.ts` impide que la
   selección por `sha` y el aviso en voz alta desaparezcan sin que falle CI.

## Lo que esta evidencia NO cubre

- **Comportamiento de H-06 en vivo.** Las cuatro sondas son de salud y de
  rechazos; ninguna crea una solicitud. Comprobar en producción que un
  `sol-<id>` inventado devuelve 404 exigiría una escritura real contra datos de
  producción, así que la garantía es la suite: 7 casos de la ruta de alta real
  (`server/portalPublico/servicioPortalPublico.test.ts`) sobre el código que
  ahora corre en producción. Se comprobará a mano, con un inmueble de prueba,
  cuando exista un proyecto de staging (H-17).
- **Los 10 índices y las reglas de Firestore**: publicados por el usuario; su
  confirmación en consola sigue pendiente.
