# P4-B — persistencia efectiva condicionada a cálculo válido

Revisión: 2026-10-20. Base verificada: `52312e5756e11e6abb7d0ab51a87d1a40024668d`.
Rama: `arena/08384beb-gestor-de-inmuebles-vercel`.

**El mecanismo de aplicación efectiva está implementado; no se declara resuelta la aplicabilidad normativa ni demostrada una actualización contractual real.** Los bloqueos del motor IRAV1 se conservan íntegros. Este informe sustituye las descripciones históricas del flujo exclusivamente de borradores en el informe P4 anterior; no revalida sus afirmaciones jurídicas ni sus fuentes externas.

## Inspección y decisión autorizada

- Fuente canónica: `contratos_formalizacion/{contratoId}.rentaMensual` (`ContratoFormalizacion`). `subscribeContratos` actualiza la interfaz; `cobrosEngine` lee la renta contractual. La renta declarada del inmueble no sustituye esta fuente.
- Existían motor IRAV1 versionado, panel, dos rutas POST, autorización de propietario/gestor por cartera, anexo v1, aviso pendiente, auditoría, operación idempotente y control anual. La confirmación anterior no cambiaba la renta.
- El adaptador REST existente admite commit atómico y precondición `VERSION/updateTime`. No se necesita migración, servicio ni dependencia nuevos.
- Decisión expresa del usuario en esta sesión: admitir declaración de comunicación ya realizada, con fecha, referencia documental y actor; derivar la efectividad con `fechaEfectividadDesdeComunicacion`; aplicar únicamente cuando esa fecha haya llegado. No representa verificación externa del documento ni entrega SMTP.
- La fecha se deriva del primer día del mes siguiente. Se bloquean fecha inválida/futura, ausencia de referencia/declaración, efecto futuro o anterior a la anualidad. No se reemplaza por la fecha programada del aviso. No se añade agenda de aplicación futura.

## Flujo y persistencia

1. Preview sin escrituras: servidor carga contrato y permisos, ejecuta el mismo motor, incorpora versión de cálculo `P4-IRAV1-v1` y, si existe declaración, fecha efectiva propuesta. La huella vincula actor, preview/evidencia y `updateTime` del contrato. No acepta renta, porcentaje o topes del cliente.
2. Confirmación: reautoriza, valida declaración, recalcula y compara la huella; conserva `REQUIERE_REVISION`. No permite aplicar un cálculo bloqueado ni anticipar la vigencia.
3. **Un único commit de seis escrituras**:
   - Parche de `rentaMensual` y `actualizacionRentaVigente` en el contrato, con CAS de la versión leída. `actualizacionRentaVigente` guarda anexo, efecto, renta anterior, versión, actor y fecha de registro.
   - Creación exclusiva de anexo, aviso, auditoría, operación idempotente y control contrato/aniversario en sus cinco colecciones existentes.
4. El historial reside en `anexos_actualizacion_renta`: renta anterior/nueva, índice/periodo/fuentes, versión, fecha efectiva, contrato, titular, evidencia declarada, actor y timestamp. Se mantiene v1 inmutable; no se sobrescriben versiones anteriores. El anexo cambia a `ACTUALIZACION_EFECTIVA_NO_FIRMADO`; esto **no acredita firma**. Documento y aviso usan los importes y fechas del mismo preview confirmado.
5. La máscara opcional del commit REST se añadió exclusivamente para evitar reescribir/recodificar campos ajenos del contrato (por ejemplo timestamps). Sin máscara el comportamiento anterior no cambia. La máscara exige CAS y campos presentes, no borrados implícitos.
6. Repetición de clave: recupera resultado, no reaplica porcentaje. Otra clave para la misma anualidad se rechaza. Un conflicto CAS no escribe contrato ni historial. Una respuesta perdida tras commit se informa como resultado incierto, no como ausencia de escritura; el reintento conserva la clave.
7. UI muestra renta vigente y fecha efectiva tras respuesta efectiva y tras recarga desde el contrato; presenta renta de partida por separado. Declara la evidencia, revisa antes de confirmar, permite cancelar sin escritura y bloquea doble pulsación. Cambiar evidencia invalida preview/consentimiento.

Atomicidad garantizada **por la llamada única `documents:commit` con precondiciones de Firestore**, no por una secuencia de llamadas independientes. Las comprobaciones locales verifican la construcción del commit y los conflictos mediante dobles, no su ejecución en un servicio real. La autorización se vuelve a leer en cada intento; no se cambia el modelo de permisos.

## Comunicaciones, compatibilidad y límites

- `estadoActualizacion: EFECTIVA` no equivale a envío. El aviso de la aplicación conserva `PENDIENTE_ENVIO`, `NO_COMUNICADO`, sin confirmación SMTP ni publicación en bandeja. `evidenciaComunicacion` identifica por separado la declaración de comunicación previa realizada por otro medio.
- Se reutiliza la construcción del anexo/aviso; no se introduce PDF, correo ni firma nuevos.
- La API de confirmación exige evidencia. Un cliente antiguo sin ese campo recibe rechazo, no un falso éxito de borrador. Los controles/anexos anteriores no se borran ni se convierten automáticamente en efectivos: si existe el control anual se rechaza otra aplicación.
- No hay rectificación P4: una nueva petición no sobrescribe el registro original. No se inventa reversión ni procedimiento jurídico. Tampoco se cambia la edición general de contratos ni se recalculan recibos/cobros históricos.
- No se ha añadido lectura pública del historial ni permisos de cliente para escribir en él; las escrituras P4 siguen en servidor.

## Pruebas y alcance de la evidencia

Antes de modificar: focal original **39/39** (22 motor, 10 servicio, 3 rutas, 4 panel).

Validación focal final: **81/81 en cinco archivos**:

| Suite existente | Pruebas | Evidencia |
|---|---:|---|
| Motor IRAV1 | 22 | Reglas/bloqueos, selección del índice, redondeo y función de fecha; sin modificar reglas |
| Servicio P4 | 19 | Aplicación a renta canónica, historial/fecha/auditoría, permisos y dos carteras, preview sin escrituras, ausencia/evidencia inválida, efecto futuro, datos/versiones cambiados, CAS tardío, duplicados/concurrencia, fallo y respuesta perdida |
| Rutas P4 | 4 | Token, payload estricto, evidencia obligatoria sin actor inyectado, 503 y ausencia de falso éxito |
| Panel P4 | 7 | Renta/fecha efectivas, consentimiento, evidencia, cancelación, invalidación de preview, doble clic, error/reintento y efecto futuro |
| Adaptador REST existente | 29 | Incluye tres pruebas P4-B: seis escrituras en un solo commit con máscara/CAS, conflicto/fallo y máscara inválida sin red |

**Las confirmaciones satisfactorias del servicio usan calculadora sintética y puerto en memoria.** Las pruebas REST ejecutan el adaptador real con `fetch`/OAuth simulados. Ninguna demuestra persistencia real, IAM o validez jurídica de un contrato. La aritmética válida se prueba separadamente en el motor existente; no se presenta como un recorrido normativo real confirmable.

Regresión local con el comando de CI (excluye únicamente A-04 de sandbox): **255 archivos, 4.620 aprobadas, 2 omitidas, 7 todo**, antes de añadir la tercera prueba de máscara. TypeScript correcto. Build correcto con avisos existentes de imports mixtos y chunks grandes. El PR ejecutará la regresión final y los emuladores del workflow ya existente; no se instalaron Java/Firebase CLI/emuladores en el sandbox.

## Pendientes que NO se resuelven ni se ocultan

- El servicio sigue sin aportar el máximo individual verificado y la cohorte extraordinaria sigue bloqueada incluso con ese dato. Cohortes anteriores, otras modalidades y horizonte no revisado mantienen sus restricciones. **No hay en esta revisión un ejemplo normativo real que permita afirmar cierre funcional ordinario de P4.** La decisión sobre evidencia/efectividad no autoriza a levantar esas restricciones.
- No se revalidaron por Internet las referencias legales ni los valores del snapshot; no se añadieron fuentes ni se inventaron datos.
- Sin prueba de persistencia P4 contra Firestore real/emulador ni escrituras de producción. El CI de reglas existente no sustituye esa prueba específica.
- Rectificación, nuevas cohortes, actualización de fuentes y entrega real de correo quedan fuera de esta orden. P1/P2/P3 no se reabren.

## Integración

Pendiente de PR, controles y verificación real del merge. El informe final de sesión indicará PR y SHA efectivo de `main`; este documento no afirma un merge antes de comprobarlo.
