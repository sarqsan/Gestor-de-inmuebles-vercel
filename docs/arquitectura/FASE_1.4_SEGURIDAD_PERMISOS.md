# Fase 1.4 — Seguridad, permisos y aislamiento por propietario

> Objetivo: eliminar los `|| true` que dejaban Firestore abierto y garantizar
> que **ningún propietario puede leer ni escribir los datos económicos o
> fiscales de otro**. Se añaden también reglas de Firebase Storage para los
> justificantes de cobro y los documentos de candidatos.

## 1. Modelo de identidad

- La identidad fiable es la de **Firebase Authentication** (`request.auth`).
  El modo de "acceso directo" sin iniciar sesión no puede ser asegurado con
  reglas y queda fuera del modelo de seguridad (es un respaldo de desarrollo).
- El **Administrador principal** se reconoce por el email verificado
  `sarqsan2@gmail.com` (no se puede suplantar desde el cliente).
- Se crea un espejo reducido de identidad por UID, colección
  **`usuarios_auth/{uid}`**, con `usuarioId, email, tipoPerfil, estado, roles,
  propietarioId, profesionalId, inmuebleIds`. Las reglas resuelven el rol y el
  `propietarioId` con un `get()` de **ruta fija** (sólo depende de
  `request.auth.uid`).
- El espejo **no es falsificable**: su regla de escritura exige que los campos
  sensibles coincidan con el documento autoritativo `usuarios/{id}`, y éste no
  puede ser modificado por el propio usuario para cambiar de rol, de
  `propietarioId`, de `profesionalId`, de `inmuebleIds`, de permisos ni de email.
- La aplicación crea/actualiza ese espejo automáticamente al iniciar sesión, al
  restaurar la sesión y al completar el registro público (`syncAuthIndex`),
  **antes** de abrir las suscripciones de datos.

## 2. Aislamiento de colecciones (Firestore)

| Colección | Lectura | Escritura |
| --- | --- | --- |
| `propietarios` (NIF/CIF, **IBAN**, fiscal) | Admin; propietario sólo la **suya** (get) | Admin; propietario sólo la suya (id = su `propietarioId`) |
| `contratos_formalizacion` (**rentas, `registroCobros`, justificantes**) | Admin; propietario sólo los suyos | Admin; propietario sólo contratos con su `propietarioId`, que no se puede cambiar |
| `inmuebles` | Pública (funnel de captación/listados) | Admin o propietario titular |
| `candidatos` | `get` público (cuestionario por token); `list` autenticado | Autenticado o campos acotados del propio cuestionario |
| `solicitudes`, `solicitudes_seguro_impago` | Autenticado | Captación pública al crear; el resto autenticado |
| `invitaciones`, `slots_visita`, `solicitudes_documentacion` | Público (flujos por token) | Crear/actualizar público; borrar autenticado |
| `usuarios` | `get` autenticado; `list` admin | Auto-registro sin roles elevados; el usuario no puede elevarse ni cambiar su vínculo |
| `usuarios_auth` | El propio UID o admin | Sólo el UID propio y si refleja fielmente el perfil autoritativo |
| `configuracion_aseguradoras`, `system/*`, `audit_logs` | Admin (salvo `modulos_config`, público) | Admin; auditoría inmutable (sólo inserción autenticada) |
| `profesionales`, `enlaces_registro`, `especialidades` | Público (registro/catálogo) | Autenticado; borrado admin |
| Cualquier otra colección | Denegada por defecto | Denegada por defecto |

### Por qué la consulta de contratos del propietario es segura

Las reglas **no filtran**: una consulta se concede sólo si sus restricciones
garantizan que no puede devolver documentos prohibidos. Por eso el *listener*
de un propietario lanza exactamente:

```
contratos_formalizacion where("propietarioId","==", su propietarioId)
```

La regla de `list` compara `resource.data.propietarioId` con el valor obtenido
del espejo mediante un `get()` de **ruta fija** (constante para esa petición),
que es el patrón oficialmente soportado. La vista de un documento suelto (`get`)
admite además inmuebles que le hayan sido compartidos por `inmuebleIds`; esa
segunda vía no se usa en `list` porque una membresía por array no sería
demostrable para la consulta.

## 3. Firebase Storage (`storage.rules`, nuevo)

- `cobros_justificantes/{propietarioId}/{cobroId}/{archivo}`: lectura/escritura
  para usuarios internos, PDF/imagen, máximo 12 MB. La subida ahora se
  segmenta por propietario desde `uploadJustificanteCobro(..., propietarioId)`.
- `documentos_solicitados/...`: **subida** permitida al candidato anónimo del
  portal (con tipo y tamaño máx. 15 MB); lectura/gestión internas.
- `inmuebles/...`: lectura pública (catálogo), escritura interna de imágenes.
- Resto denegado por defecto.
- Las URL de descarga con token que genera el SDK actúan como enlace de
  capacidad: el destinatario del justificante puede abrirlo aunque no tenga
  sesión.

## 4. Despliegue de las reglas (NO lo hace Vercel)

Vercel sólo compila la aplicación. Las reglas se publican con Firebase CLI
(proyecto `startup-sanctuary-sln7n`), usando el `firebase.json` incluido, que
apunta a la base de datos con nombre:

```bash
npm i -g firebase-tools          # sólo la primera vez
firebase login
firebase deploy --only firestore:rules,storage
# o por separado:
#   firebase deploy --only firestore:rules
#   firebase deploy --only storage
```

> No hay credenciales de Firebase en el entorno de desarrollo: el despliegue de
> las reglas es una acción manual del propietario del proyecto.

## 5. Residuales conocidas (siguiente endurecimiento)

1. **Ficha de inmueble pública con campos fiscales/IBAN.** La lectura de
   `inmuebles` sigue siendo pública por el funnel de captación, pero la ficha
   aún incluye datos fiscales. Conviene moverlos a una subcolección privada
   (`inmuebles/{id}/datos_privados`) o separarlos de la vista pública.
2. **`candidatos` y `solicitudes` (datos de solicitantes, pre-contrato).**
   Cualquier usuario autenticado puede listarlos; la UI filtra por inmueble.
   Para aislarlos por propietario hay que añadir `propietarioIdId` a esos
   documentos (hoy sólo tienen `inmuebleId`), consultar con ese filtro y hacer
   una carga inicial (backfill). No se incluyó para no romper el funnel público
   ni los expedientes existentes.
3. **Storage por propietario sin *custom claims*.** Storage no puede leer
   Firestore; el aislamiento fino de cada carpeta de propietario requiere
   emitir *custom claims* (rol/propietarioId) desde un proceso autenticado.
4. Contratos/recibos **previos** que no tengan `propietarioId` no los verá un
   perfil de propietario (el administrador sí). Los nuevos contratos ya nacen
   con ese campo; los puede rellenar el administrador.

## 6. Checklist de prueba por fases (para la verificación final)

- [ ] Admin (`sarqsan2@gmail.com`): ve todas las carteras, contratos y cobros;
      edita y borra sin problemas.
- [ ] Propietario nuevo (registro público): se crea su ficha, inicia sesión y
      **sólo** ve sus inmuebles/contratos/cobros.
- [ ] Propietario A: intentar `list` de `propietarios` o de
      `contratos_formalizacion` sin filtro → **denegado**; con el filtro por su
      `propietarioId` → sólo lo suyo.
- [ ] Propietario A no puede leer el contrato ni la ficha fiscal/IBAN del
      propietario B (probar a mano con la consola/SDK usando su token).
- [ ] Un propietario no puede cambiar su `roles`, `tipoPerfil`, `propietarioId`
      ni `inmuebleIds` en `usuarios`, ni forzar su espejo `usuarios_auth`.
- [ ] La subida de un justificante cae en
      `cobros_justificantes/{miPropietarioId}/...` y se abre con su enlace.
- [ ] El candidato anónimo puede subir su documentación por el portal público,
      pero no listar lo de otros.
- [ ] Los flujos públicos sin login siguen funcionando: solicitud de alquiler,
      reserva de visita, cuestionario y documento por token.
