# Lecturas de alquiler del propietario — diagnóstico y validación pendiente

## Causa en el código anterior

La app suscribía para cualquier usuario las colecciones completas de solicitudes,
profesionales, candidatos, documentación, invitaciones y agenda. Las reglas de
Firestore no usan permisos como filtros: las consultas globales se denegaban para
el propietario. Además, la pantalla de solicitudes y las de candidatos y visitas
no estaban en el menú del propietario. En el alta de profesionales privados se
usaba el ID de usuario, pero las reglas exigían el ID del propietario vinculado.

## Cambio preparado

- Solicitudes, candidatos, documentación, invitaciones y turnos se consultan por
  cada inmueble visible. Las reglas comprueban la relación con el documento real
  del inmueble, incluido cotitular y delegación vigente. Los datos históricos sin
  `propietarioId` se recuperan si tienen un `inmuebleId` válido. No se autoriza
  la consulta global ni inmuebles ajenos.
- Profesionales: consulta de catálogo público y privados del titular. Las nuevas
  fichas privadas se guardan con el ID de propietario vinculado a la cuenta.
- Las pantallas de solicitudes, candidatos y visitas se habilitan en el menú.
- No se reutiliza el almacenamiento compartido del navegador como fuente para
  estas colecciones: podría contener datos de otra sesión.

## No publicar sin verificar

Las pruebas unitarias y el evaluador local no sustituyen al motor real de reglas
ni comprueban los datos ni la configuración desplegada. El emulador oficial no se
ha ejecutado en este entorno (no se puede descargar el binario); está preparada
`tests/emulador/lecturas-alquiler-ambito.emulador.test.ts` para probar consultas
por inmueble propio, compartido y ajeno, históricas, anónimas y personal interno.
**Debe pasar la suite de emulador en CI antes de publicar reglas y aplicación de
forma coordinada**, seguida de una comprobación con una cuenta propietaria real.

Los profesionales históricos que lleven el ID de la cuenta en lugar del ID del
propietario, o carezcan de `esPrivado`, pueden necesitar una revisión y migración
controlada de datos. No se ha inspeccionado ni modificado la base de producción;
no es seguro asumir que todo registro sin bandera sea público. Los registros de
alquiler sin inmueble identificable también requieren revisión individual.
