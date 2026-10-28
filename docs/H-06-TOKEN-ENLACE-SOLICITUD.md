# H-06 — El enlace de solicitud es una capacidad, no un identificador

**Fecha:** 28-10-2026 · **Estado:** implementado y verificado en local · **Riesgo que cierra:** enumeración de inmuebles → alta de solicitudes falsas.

## 1. El problema

El enlace público de solicitud era `/#solicitud/sol-<idInmueble>`. El `id` es
enumerable (aparece en la URL de cualquier ficha pública y en los documentos de
Firestore que el propio dueño ve), así que cualquiera podía fabricar el enlace
de **cualquier** inmueble y usarlo para dar de alta solicitudes con datos
personales, adjuntar documentación y disparar notificaciones.

No es un `id` filtrado: es una **capacidad de escritura** derivada de un dato
público. Un `id` no se puede rotar; un secreto sí.

## 2. La solución

| Pieza | Valor |
|---|---|
| Formato del token | `sol-<idInmueble>-t<32 hex>` |
| Entropía del secreto | 128 bits (`crypto.getRandomValues`, 16 bytes) |
| Dónde se guarda | `inmuebles/<id>.tokenSolicitud` (documento **privado**) |
| Quién lo emite | `asegurarTokenSolicitud()` al guardar el inmueble |
| Fecha de corte del enlace heredado | **2027-01-31T23:59:59.000Z** |

El `id` sigue visible dentro del token **a propósito**: la ficha pública ya es
legible por id y así el servidor localiza la propiedad sin un índice extra. Lo
que el secreto protege es la **escritura**; la lectura no cambia.

Separador `-t` (y no `-`) porque los `id` admiten guiones (`isValidId` permite
`[A-Za-z0-9_-]{1,128}`): sin un separador imposible de confundir, un id que
acabase en `t` haría ambiguo el análisis.

### Un solo punto de decisión

```
src/lib/tokenSolicitudPublica.ts      ← fuente única (cliente y servidor)
  ├─ generarSecreto / generarTokenSolicitud     emisión
  ├─ analizarTokenSolicitud                     lectura
  ├─ verificarTokenContraPropiedad              capacidad (cerrado por defecto)
  ├─ idsFichaCandidatos                         qué fichas públicas probar
  ├─ asegurarTokenSolicitud                     emisión idempotente al guardar
  └─ tokenEnlaceParaMostrar                     qué token viaja en el enlace
```

Servidor: `resolverFichaParaSolicitud()` en
`server/portalPublico/servicioPortalPublico.ts` verifica el token contra
`inmuebles/<id>.tokenSolicitud` **antes** de crear la solicitud. Ya no existe
`idsFichaDesdeToken` (derivaba el id del token sin comprobar nada).

### Por qué el `id` en el token no reintroduce el problema

`verificarTokenContraPropiedad` es **cerrado por defecto**:

| Situación | Resultado | Respuesta al cliente |
|---|---|---|
| Token firmado y coincide con el guardado | `OK` | alta |
| Token firmado que no coincide | `TOKEN_NO_COINCIDE` | 404 genérico |
| `sol-<id>` heredado, dentro de la ventana | `OK` | alta |
| `sol-<id>` heredado, después del corte | `LEGADO_CADUCADO` | 404 `ENLACE_CADUCADO` |
| Propiedad ilegible / inexistente | `PROPIEDAD_NO_DISPONIBLE` | 404 genérico |

Un `id` escrito a mano nunca llega a `OK` si la propiedad ya tiene token: el
servidor exige la coincidencia con el secreto guardado. «No existe» y «no
autorizado» producen la misma respuesta, así que el enlace no sirve para
descubrir qué inmuebles existen.

## 3. Ventana de compatibilidad

Los enlaces `sol-<id>` ya repartidos siguen funcionando hasta
**2027-01-31T23:59:59.000Z** (`FECHA_CORTE_ENLACES_LEGADOS`). Después de esa
fecha el servidor responde `404 ENLACE_CADUCADO`; no hay prórroga silenciosa:
la fecha está en el código y en el aviso del diálogo de enlace.

El aviso del modal se calcula con `FECHA_CORTE_ENLACES_LEGADOS`, así que la
fecha que ve el usuario es la misma que aplica el servidor.

## 4. Migración: sin reescritura en bloque

**No hay migración.** El token se emite de forma perezosa e idempotente en los
dos únicos momentos en que se puede hacer con garantías:

1. **Al guardar el inmueble** — `saveInmuebleFirestore()` aplica
   `asegurarTokenSolicitud()` antes de sanitizar. Cubre altas y ediciones, y
   `saveInmuebleOrdinarioFirestore()` lo hereda.
2. **Al abrir el diálogo de enlace** — si el inmueble aún no tenía token se
   emite ahí y se persiste (`onEmitirToken` en `App.tsx`).

`asegurarTokenSolicitud()` **respeta** un token válido existente: reemisar
invalidaría todos los enlaces ya enviados. Un token con forma antigua
(`sol-<id>`) se sustituye por uno firmado en el siguiente guardado.

Consecuencia operativa: no hay job, ni script, ni ventana de mantenimiento. Un
inmueble sin token sigue aceptando su enlace heredado hasta el corte; en cuanto
se guarde o se abra su diálogo de enlace, pasa a token fuerte.

### Qué hay que hacer antes del 31-01-2027

- [ ] Revisar cuántos inmuebles siguen con `tokenSolicitud` con forma antigua o
      ausente (consulta de solo lectura: contar documentos de `inmuebles` cuyo
      `tokenSolicitud` no case con `^sol-.+-t[0-9a-f]{32}$`).
- [ ] Reenviar el enlace nuevo a los candidatos activos de esos inmuebles.
- [ ] Pasada la fecha, confirmar que un enlace heredado devuelve
      `404 ENLACE_CADUCADO` en producción.

## 5. Rollback

Sin migración no hay rollback de datos. Si hubiera que desactivar la exigencia
del token:

1. Revertir el commit de H-06 (rama → PR). El servidor vuelve a derivar el id
   del token y acepta `sol-<id>` sin comprobar `tokenSolicitud`.
2. Los `tokenSolicitud` ya escritos son inocuos: un campo privado adicional que
   nadie lee. No hace falta limpiarlos.
3. **Efecto:** se reabre la enumeración. Documentarlo como incidente aceptado y
   con fecha de reintento, no como estado normal.

## 6. Pruebas

| Fichero | Casos | Qué cubre |
|---|---|---|
| `tests/token-solicitud-publica.test.ts` | 20 | formato, entropía, unicidad, análisis, capacidad, emisión idempotente, token mostrado = token aceptado |
| `server/portalPublico/servicioPortalPublico.test.ts` | 43 (7 nuevos) | ruta de alta real: enlace bueno, heredado vigente, heredado caducado, token inventado, token de otro inmueble, id sin token |
| `tests/guardia-h06-enlace-token.test.ts` | 4 | nadie reconstruye `` `sol-${id}` `` fuera del módulo (probado por mutación) |
| `tests/ag03-solicitud-servidor.test.ts`, `tests/h7-edicion-ordinaria-titulares.test.ts` | 29 | contratos existentes del alta y del guardado, sin relajar el servidor |

La guardia se verificó **provocando la regresión**: insertar
`` const regresion = `sol-${inmueble.id}` `` en un componente hace fallar
`tests/guardia-h06-enlace-token.test.ts` señalando el fichero y el literal.

## 7. Lo que esto **no** resuelve

- No sustituye a las reglas de Firestore: `inmuebles` sigue siendo privado y
  `tokenSolicitud` no se publica en `fichas_publicas_inmueble`.
- No limita la tasa de altas: el alta sigue aceptando solicitudes de cualquiera
  que tenga el enlace. Un `id` ya no basta, pero un enlace filtrado sigue
  sirviendo (es el compromiso de cualquier enlace-capacidad).
- No cambia el modelo de datos de las solicitudes existentes.
