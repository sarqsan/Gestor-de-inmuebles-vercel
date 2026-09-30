/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Registro tipado de ayuda contextual y motor de consulta.
 *
 * El contenido describe funcionalidades REALES de la canónica (B/C/D/E y base).
 * Filtrado por rol/permiso = solo lectura del RBAC existente (nunca lo amplía).
 */
import type { CategoriaAyuda, ExperienceContext, HelpEntry, ModuloERP } from './tipos';
import { contextoCumpleRoles, contextoTienePermiso } from './contexto';

export const AYUDA_REGISTRO: HelpEntry[] = [
  {
    id: 'ayuda.inicio.panel',
    module: 'inicio',
    section: 'inicio',
    title: 'Panel de inicio',
    summary: 'Resumen de candidatos, inmuebles y accesos directos a las secciones más usadas.',
    content:
      'El panel de inicio muestra un resumen operativo de la cartera: candidatos por estado, inmuebles y avisos.\n\nDesde las tarjetas puedes saltar directamente a la sección correspondiente. Si no ves un dato, comprueba en la sección de origen que el registro existe y que tu perfil tiene acceso a él.',
    keywords: ['inicio', 'resumen', 'panel', 'dashboard'],
  },
  {
    id: 'ayuda.tesoreria.liquidaciones',
    module: 'tesoreria',
    section: 'tesoreria',
    title: 'Liquidaciones a propietarios (Tesorería)',
    summary: 'Cómo se genera, aprueba y paga una liquidación mensual y qué significa cada estado.',
    content:
      'Una liquidación agrupa, para un propietario y un periodo, los cobros efectivamente recibidos y los gastos imputables, y calcula el importe neto a transferir.\n\nEstados: BORRADOR (generada, editable) → APROBADA (validada para pago) → PAGADA (con referencia y evidencia). ANULADA y REVERSADA quedan trazadas con motivo.\n\nGenerar y aprobar requiere el permiso «tesoreria.liquidar»; registrar el pago o reversar requiere «tesoreria.pagar». Las pestañas SEPA preparan ficheros pain.008/pain.001 para la banca electrónica: nunca se ejecuta ningún cargo automáticamente.',
    roles: ['ADMINISTRADOR'],
    permissions: ['tesoreria.ver'],
    keywords: ['liquidación', 'liquidaciones', 'propietario', 'pago', 'sepa', 'pain.008', 'pain.001', 'tesorería', 'neto'],
    relatedTutorials: ['tutorial.tesoreria.liquidacion'],
  },
  {
    id: 'ayuda.tesoreria.mis-liquidaciones',
    module: 'tesoreria',
    section: 'tesoreria',
    title: 'Mis liquidaciones',
    summary: 'Consulta de las liquidaciones de tus inmuebles y del detalle de cada línea.',
    content:
      'Aquí ves las liquidaciones que la gestión ha generado para tus inmuebles: periodo, líneas de ingresos cobrados, gastos imputados y neto.\n\nNo puedes generar ni aprobar liquidaciones: esas acciones corresponden a la administración. Si detectas una diferencia, utiliza la sección de incidencias o contacta con gestión.',
    roles: ['PROPIETARIO'],
    keywords: ['liquidación', 'mis liquidaciones', 'neto', 'propietario'],
  },
  {
    id: 'ayuda.morosidad.expedientes',
    module: 'morosidad',
    section: 'morosidad',
    title: 'Morosidad y recobro',
    summary: 'Expedientes de impago: detección, comunicaciones, acuerdos de pago y vía legal.',
    content:
      'Cada expediente de morosidad agrupa la deuda pendiente de un contrato y su historial de actuaciones (comunicaciones, acuerdos de pago, escalado legal).\n\nLos saldos se calculan a partir de los cobros del ERP; el expediente no crea una segunda contabilidad. Las comunicaciones quedan registradas; el envío real por email/SMS depende del transporte configurado.',
    roles: ['ADMINISTRADOR'],
    keywords: ['morosidad', 'impago', 'recobro', 'expediente', 'deuda', 'acuerdo de pago'],
  },
  {
    id: 'ayuda.actas.entrada-salida',
    module: 'actas',
    section: 'actas',
    title: 'Actas de entrada y salida',
    summary: 'Inventario por elementos, lecturas, evidencias, firma con OTP y PDF.',
    content:
      'Un acta documenta el estado de la vivienda al inicio (ENTRADA) o al final (SALIDA) del contrato: elementos con su estado, lecturas de contadores, fotografías y observaciones.\n\nUna vez firmada, el acta es inmutable: cualquier corrección genera una nueva versión enlazada a la anterior. La comparación entrada↔salida es determinista y sirve de base objetiva ante desperfectos.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['acta', 'entrada', 'salida', 'inventario', 'firma', 'otp', 'pdf', 'fianza', 'desperfectos'],
  },
  {
    id: 'ayuda.inquilinos.portal',
    module: 'inquilinos',
    section: 'inquilinos',
    title: 'Portal de inquilinos: accesos e invitaciones',
    summary: 'Cómo dar acceso a un inquilino a su portal y qué verá una vez dentro.',
    content:
      'El acceso del inquilino nace siempre de una invitación vinculada a un contrato: en «Invitaciones» eliges el contrato, la caducidad y los usos, y compartes el enlace generado. Al registrarse, el inquilino queda vinculado únicamente a ese contrato.\n\nEn su portal el inquilino ve una versión saneada de su contrato, recibos, incidencias, documentos (actas), suministros e historial, y puede escribir a gestión, notificar averías y registrar lecturas. Nunca accede al ERP ni a datos de otros inquilinos.\n\nEn «Accesos» puedes revisar y desvincular contratos; en «Mensajes» respondes los hilos por contrato.',
    roles: ['ADMINISTRADOR'],
    permissions: ['inquilinos.ver'],
    keywords: ['inquilino', 'portal', 'invitación', 'enlace', 'acceso', 'mensajes', 'vinculación'],
  },
  {
    id: 'ayuda.suministros.gestion',
    module: 'suministros',
    section: 'suministros',
    title: 'Suministros y lecturas',
    summary: 'Ficha de suministro (CUPS/contador), lecturas inmutables, reparto y cambios de titular.',
    content:
      'Cada suministro pertenece a un inmueble e identifica tipo, comercializadora y CUPS/contador. Las lecturas son inmutables: una corrección se registra como nueva lectura que referencia a la anterior.\n\nEl reparto permite distribuir un consumo entre unidades; los cambios de titular quedan trazados con su estado.',
    keywords: ['suministro', 'luz', 'agua', 'gas', 'lectura', 'contador', 'cups', 'reparto', 'titular'],
  },
  {
    id: 'ayuda.incidencias.flujo',
    module: 'incidencias',
    section: 'incidencias',
    title: 'Flujo de una incidencia',
    summary: 'Desde la avería hasta el gasto: incidencia → profesional → presupuesto → reparación → factura.',
    content:
      'Una incidencia describe una avería o necesidad en un inmueble, con prioridad y responsabilidad. Puede asignarse a un profesional, recibir presupuesto, ejecutarse y cerrarse con factura, que genera el gasto correspondiente.\n\nLas incidencias notificadas por inquilinos desde su portal aparecen con origen INQUILINO y quedan acotadas a su contrato.',
    keywords: ['incidencia', 'avería', 'reparación', 'profesional', 'presupuesto', 'factura'],
  },
  // ---------------------------------------------------------------- ERP · base y C/D
  {
    id: 'ayuda.cobros.gestion',
    module: 'cobros',
    section: 'cobros',
    title: 'Gestión de cobros',
    summary: 'Recibos mensuales por contrato: estados, justificantes y verificación.',
    content:
      'Cada contrato genera un recibo por periodo. Estados principales: PENDIENTE (aún no cobrado), RECIBIDO (pago comunicado o justificado), VERIFICADO (conciliado por gestión), RETRASADO (vencido sin pago), INCIDENCIA (pago con discrepancia), DEVUELTO/RECLAMADO (pagos fallidos o reclamados).\n\nDesde aquí se registran pagos y justificantes; los cobros verificados son los únicos que entran en la liquidación del propietario (Tesorería) y los impagados alimentan los expedientes de Morosidad. El recibo que ve el inquilino en su portal es este mismo dato, sin duplicar.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['cobro', 'recibo', 'pago', 'justificante', 'verificado', 'retrasado', 'impago', 'alquiler'],
  },
  {
    id: 'ayuda.contratos.formalizacion',
    module: 'contratos',
    section: 'formalizacion',
    title: 'Formalización de contratos',
    summary: 'Contratos LAU: datos, renta, fianza, garantías, vigencia y estado.',
    content:
      'Un contrato une inmueble, arrendador e inquilino con renta, día de pago, fianza legal, garantías adicionales, duración y reparto de gastos (comunidad, suministros).\n\nEl contrato es la referencia del resto del ERP: de él dependen los recibos, la liquidación al propietario, las actas de entrada/salida, los expedientes de morosidad y el acceso del inquilino a su portal. En el portal, el inquilino ve una versión saneada (renta, IBAN de pago, fianza, vigencia, firmas), nunca los datos privados del arrendador.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['contrato', 'lau', 'fianza', 'renta', 'vigencia', 'garantía', 'formalización'],
  },
  {
    id: 'ayuda.morosidad.estados',
    module: 'morosidad',
    section: 'morosidad',
    title: 'Estados de un expediente de morosidad',
    summary: 'De DETECTADA a CERRADA: qué significa cada fase y qué transiciones exigen motivo.',
    content:
      'DETECTADA: impago identificado a partir de los cobros. PENDIENTE_CONTACTO / RECLAMACION_INICIADA / EN_RECOBRO: gestión amistosa con comunicaciones registradas. COMPROMISO_PAGO y PAGO_PARCIAL: acuerdo con el inquilino; si no se cumple pasa a COMPROMISO_INCUMPLIDO. ESCALADA y JURIDICA: vía formal/legal. PAGADA y CERRADA son terminales; reabrir exige motivo y deja histórico.\n\nNingún cambio de estado es silencioso: las transiciones sensibles requieren motivo y quedan en el historial del expediente.',
    roles: ['ADMINISTRADOR'],
    keywords: ['morosidad', 'estado', 'expediente', 'compromiso', 'jurídica', 'escalada', 'reabrir'],
  },
  {
    id: 'ayuda.actas.estados-firma',
    module: 'actas',
    section: 'actas',
    title: 'Estados y firma de un acta',
    summary: 'BORRADOR → EN_REVISION → PENDIENTE_FIRMA → FIRMADA → CERRADA; qué se puede editar en cada uno.',
    content:
      'BORRADOR: acta editable (inventario, lecturas, fotos). EN_REVISION: validación previa. PENDIENTE_FIRMA: se generan códigos OTP por participante (uso único, caducidad corta, intentos limitados). FIRMADA: inmutable; se genera el PDF y se guarda su referencia. CERRADA: archivada. CANCELADA/ERROR: trazadas con motivo.\n\nSi hay que corregir un acta firmada se crea una nueva versión enlazada a la anterior; la firmada nunca se modifica. El inquilino ve las actas FIRMADAS/CERRADAS de su contrato en su portal, sin DNI ni notas internas.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['acta', 'estado', 'firma', 'otp', 'versión', 'inmutable', 'pdf'],
  },
  {
    id: 'ayuda.incidencias.estados',
    module: 'incidencias',
    section: 'incidencias',
    title: 'Estados de una incidencia',
    summary: 'ABIERTA → EN_VALORACION/PRESUPUESTOS → ASIGNADA → EN_REPARACION → RESUELTA → CERRADA.',
    content:
      'ABIERTA/REGISTRADA: recibida (las del inquilino llegan con origen INQUILINO). EN_VALORACION y PRESUPUESTOS: se determina responsabilidad y coste. ASIGNADA: hay profesional. EN_REPARACION/EN_CURSO: trabajo en marcha. RESUELTA: terminada, pendiente de cierre. CERRADA: cerrada con factura/gasto si procede. CANCELADA/RECHAZADA: no prosperan, con motivo.\n\nEl inquilino ve en su portal el estado, el profesional asignado y las fechas; no ve teléfonos, costes ni facturas.',
    keywords: ['incidencia', 'estado', 'asignada', 'reparación', 'resuelta', 'cerrada', 'profesional'],
  },
  // ---------------------------------------------------------------- PORTAL DEL INQUILINO (BLOQUE E)
  {
    id: 'ayuda.portal.inicio',
    host: 'PORTAL_INQUILINO',
    module: 'inicio',
    section: 'inicio',
    title: 'Tu portal',
    summary: 'Tu vivienda, la renta, el recibo de este mes y accesos rápidos.',
    content:
      'Este es tu portal como inquilino. Aquí ves solo la información de tu contrato: la vivienda, la renta mensual, el recibo del mes en curso y accesos directos a avisar de una avería, dar una lectura o escribir a gestión.\n\nSi tienes más de un contrato, puedes cambiar entre ellos desde la cabecera. El botón de actualizar recarga los datos; cerrar sesión te devuelve a la pantalla de acceso.',
    roles: ['INQUILINO'],
    keywords: ['portal', 'inicio', 'hogar', 'vivienda', 'renta'],
    relatedTutorials: ['recorrido.portal.primeros-pasos'],
  },
  {
    id: 'ayuda.portal.contrato',
    host: 'PORTAL_INQUILINO',
    module: 'contratos',
    section: 'contrato',
    title: 'Mi contrato',
    summary: 'Condiciones de tu alquiler: renta, IBAN de pago, fianza, vigencia y firmas.',
    content:
      'Aquí consultas las condiciones esenciales de tu contrato: renta y día de pago, cuenta (IBAN) donde ingresar, fianza legal y garantías, quién paga comunidad y suministros, fechas de inicio/fin y duración, y el estado de las firmas.\n\nEs una vista de solo lectura. Si detectas un error, escribe a gestión desde «Mensajes». Puedes copiar el IBAN con un toque.',
    roles: ['INQUILINO'],
    keywords: ['contrato', 'renta', 'iban', 'fianza', 'vigencia', 'firma', 'duración'],
  },
  {
    id: 'ayuda.portal.recibos',
    host: 'PORTAL_INQUILINO',
    module: 'cobros',
    section: 'recibos',
    title: 'Recibos y pagos',
    summary: 'Cada mes con su estado y los justificantes publicados por gestión.',
    content:
      'La lista muestra el recibo de cada periodo. Pendiente: aún no consta el pago. Retrasado: venció sin pago. En revisión: hay una incidencia con el pago que gestión está comprobando. Pagado: gestión ha recibido o verificado el importe. El total pendiente suma lo que está por pagar.\n\nSi gestión ha publicado justificantes, puedes abrirlos desde el recibo. Si has pagado y sigue en Pendiente, avisa por «Mensajes» para que lo verifiquen; desde el portal no se marcan pagos.',
    roles: ['INQUILINO'],
    keywords: ['recibo', 'pago', 'pendiente', 'retrasado', 'justificante', 'total'],
  },
  {
    id: 'ayuda.portal.incidencias',
    host: 'PORTAL_INQUILINO',
    module: 'incidencias',
    section: 'incidencias',
    title: 'Averías e incidencias',
    summary: 'Cómo avisar de una avería y qué significa cada estado.',
    content:
      'Pulsa el botón «+» para notificar una avería: un título breve, qué ocurre, dónde y desde cuándo, y fotos si ayudan. La incidencia queda ABIERTA y vinculada a tu contrato.\n\nDespués verás su evolución: Asignada (hay profesional), En reparación, Resuelta y Cerrada. Aparece el nombre del profesional asignado y las fechas; los presupuestos y costes los gestiona la administración.',
    roles: ['INQUILINO'],
    keywords: ['avería', 'incidencia', 'reparación', 'profesional', 'fotos', 'notificar'],
    relatedTutorials: ['recorrido.portal.primeros-pasos'],
  },
  {
    id: 'ayuda.portal.suministros',
    host: 'PORTAL_INQUILINO',
    module: 'suministros',
    section: 'suministros',
    title: 'Suministros, lecturas y cambio de titular',
    summary: 'Tus suministros, cómo dar una lectura y cómo solicitar un cambio de titular.',
    content:
      'Cada tarjeta es un suministro de tu vivienda (luz, agua, gas…) con su comercializadora y la última lectura. Ábrela para ver el histórico.\n\n«Dar lectura»: introduce el valor del contador; debe ser igual o superior a la última lectura. Una lectura guardada no se edita: si te equivocas, registra otra que la corrija. «Cambio de titular»: solicitas poner el suministro a tu nombre indicando los datos del nuevo titular y la fecha de efecto; el estado pasa de Solicitado a Confirmado o Rechazado (con motivo) según lo resuelva gestión.',
    roles: ['INQUILINO'],
    keywords: ['suministro', 'lectura', 'contador', 'luz', 'agua', 'gas', 'titular', 'cambio de titular'],
    relatedTutorials: ['recorrido.portal.primeros-pasos'],
  },
  {
    id: 'ayuda.portal.mensajes',
    host: 'PORTAL_INQUILINO',
    module: 'inquilinos',
    section: 'mensajes',
    title: 'Mensajes con gestión',
    summary: 'Un hilo por contrato para hablar directamente con la administración.',
    content:
      'Escribe tu mensaje y pulsa enviar: llega a gestión vinculado a tu contrato. Las respuestas aparecen en el mismo hilo y, mientras no las abras, se marcan como no leídas en «Más».\n\nUsa este canal para dudas del contrato, pagos o cualquier gestión que no sea una avería (para averías usa «Averías», así queda registrada y asignada).',
    roles: ['INQUILINO'],
    keywords: ['mensaje', 'gestión', 'contacto', 'hilo', 'responder'],
  },
  {
    id: 'ayuda.portal.documentos',
    host: 'PORTAL_INQUILINO',
    module: 'actas',
    section: 'documentos',
    title: 'Documentos',
    summary: 'Actas de entrada/salida, justificantes de recibos y evidencias de tus incidencias.',
    content:
      'Aquí se agrupan los documentos de tu contrato: las actas de entrada/salida que gestión ha firmado y publicado (puedes abrir el PDF), los justificantes de pago publicados y las fotos/evidencias de tus incidencias y lecturas.\n\nSi un acta no aparece es porque todavía no está firmada o publicada. Todo es de solo lectura.',
    roles: ['INQUILINO'],
    keywords: ['documento', 'acta', 'pdf', 'justificante', 'evidencia', 'foto'],
  },
  {
    id: 'ayuda.portal.historial',
    host: 'PORTAL_INQUILINO',
    module: 'inquilinos',
    section: 'historial',
    title: 'Historial',
    summary: 'Cronología de tu actividad: contrato, incidencias, mensajes, lecturas y cambios de titular.',
    content:
      'El historial ordena por fecha todo lo relevante de tu contrato: inicio y firma del contrato, incidencias y sus cambios de estado, mensajes enviados y recibidos, lecturas registradas y solicitudes de cambio de titular.\n\nSirve para comprobar cuándo hiciste cada gestión y en qué estado quedó.',
    roles: ['INQUILINO'],
    keywords: ['historial', 'actividad', 'cronología', 'fecha'],
  },
  {
    id: 'ayuda.portal.cuenta',
    host: 'PORTAL_INQUILINO',
    module: 'administracion',
    section: 'cuenta',
    title: 'Mi cuenta',
    summary: 'Tus datos de acceso, los contratos vinculados y el cierre de sesión.',
    content:
      'Muestra el correo con el que accedes, tus contratos vinculados y tu último acceso. Desde aquí cierras sesión.\n\nTu acceso nació de una invitación de gestión ligada a tu contrato; si cambias de vivienda o de contrato, gestión debe vincularte el nuevo.',
    roles: ['INQUILINO'],
    keywords: ['cuenta', 'acceso', 'correo', 'cerrar sesión', 'contratos vinculados'],
  },
  {
    id: 'ayuda.centro.uso',
    module: 'ayuda',
    section: 'ayuda',
    title: 'Cómo usar el Centro de Ayuda',
    summary: 'Busca por palabras, filtra por módulo y sigue tutoriales guiados paso a paso.',
    content:
      'El Centro de Ayuda reúne las explicaciones de cada pantalla y los tutoriales disponibles para tu perfil. Solo muestra contenido de funciones a las que ya tienes acceso: la ayuda nunca concede permisos.\n\nEl icono de ayuda de cada sección abre la explicación de esa pantalla concreta.',
    keywords: ['ayuda', 'tutorial', 'buscar', 'centro de ayuda'],
  },
  {
    id: 'ayuda.usuarios.permisos', categoria: 'usuarios_permisos', module: 'administracion', section: 'administracion',
    title: 'Usuarios, roles y permisos', summary: 'Cómo se asigna el acceso y por qué la ayuda o el asistente no amplían permisos.',
    content: 'El acceso depende del perfil, los roles y los permisos que mantiene la administración. El asistente solo puede proponer capacidades que ya están disponibles para tu contexto; no asigna permisos ni abre información fuera del ámbito autorizado.\n\nSi una acción no aparece o devuelve «sin permiso», solicita la revisión al administrador. Compartir un ID de inmueble o documento no sustituye la autorización.',
    roles: ['ADMINISTRADOR'], permissions: ['administracion.usuarios'], keywords: ['usuario', 'usuarios', 'rol', 'permisos', 'acceso', 'rbac'],
  },
  {
    id: 'ayuda.titulares.fichas', categoria: 'titulares', module: 'propietarios', section: 'propietarios',
    title: 'Titulares y sus fichas', summary: 'Relación entre el titular, sus inmuebles y la información patrimonial visible.',
    content: 'La ficha del titular es la referencia de su identidad y datos de gestión. Los inmuebles se relacionan por sus IDs y vínculos canónicos; no se deben asociar por coincidencia de nombre o dirección.\n\nLa visibilidad de una ficha y sus datos depende del perfil, los permisos y las carteras/delegaciones activas.',
    keywords: ['titular', 'titulares', 'propietario', 'propietarios', 'ficha'],
  },
  {
    id: 'ayuda.carteras.ambito', categoria: 'carteras', module: 'propietarios', section: 'propietarios',
    title: 'Carteras y delegaciones', summary: 'El alcance delegado depende de la relación activa y de los permisos de lectura o escritura.',
    content: 'Las carteras y delegaciones delimitan el ámbito de gestión que recibe cada usuario. Una delegación de lectura no implica permiso de escritura; una delegación revocada conserva solo lo que permita el modelo canónico.\n\nLa IA utiliza el contexto ya autorizado por la aplicación. No infiere una cartera desde el texto, el nombre del usuario ni un ID proporcionado en una consulta.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'], keywords: ['cartera', 'carteras', 'delegación', 'delegaciones', 'gestor'],
  },
  {
    id: 'ayuda.inmuebles.contexto', categoria: 'inmuebles', module: 'inmuebles', section: 'inmuebles',
    title: 'Ficha del inmueble', summary: 'El inmueble es el contexto común de contratos, operaciones, economía y documentos relacionados.',
    content: 'La ficha del inmueble muestra la información vinculada a su ID canónico. Los módulos relacionados pueden mostrar contratos, incidencias, gastos y documentos siempre que exista una relación explícita y el usuario tenga acceso.\n\nSi el asistente no tiene un inmueble seleccionado como contexto, no debe asumir cuál quieres consultar; puedes abrir su ficha y volver a preguntar.',
    keywords: ['inmueble', 'inmuebles', 'vivienda', 'ficha', 'relaciones'],
  },
  {
    id: 'ayuda.fiscalidad.motor', categoria: 'fiscalidad', module: 'finanzas', section: 'fiscal',
    title: 'Fiscalidad y resultados del motor', summary: 'Los resúmenes fiscales se derivan de cobros, gastos y contratos del ERP.',
    content: 'El módulo fiscal deriva sus resultados de los datos canónicos y de los motores oficiales. La clasificación de un gasto que muestra el ERP no sustituye el criterio profesional ni determina por sí sola el resultado tributario.\n\nEl asistente puede recuperar un resumen del motor cuando esa capacidad esté disponible; no decide deducibilidad ni recalcula impuestos por su cuenta.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'], keywords: ['fiscalidad', 'fiscal', 'deducible', 'deducibilidad', 'impuestos', 'irpf'],
  },
  {
    id: 'ayuda.documentos.canonicos', categoria: 'documentos', module: 'actas', section: 'actas',
    title: 'Documentos y evidencias', summary: 'Los archivos se consultan desde el expediente documental canónico y con sus permisos.',
    content: 'Cada documento debe permanecer vinculado a la entidad y al ámbito autorizados en el gestor documental existente. La IA no accede directamente a Storage ni crea copias o colecciones alternativas.\n\nSi el archivo no está disponible o no tienes permiso, el asistente no puede afirmar su contenido ni describirlo.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'], keywords: ['documento', 'documentos', 'storage', 'expediente', 'factura', 'archivo'],
  },
  {
    id: 'ayuda.importacion.exportacion', categoria: 'importacion_exportacion', module: 'administracion', section: 'configuracion',
    title: 'Importación y exportación', summary: 'Usa el panel canónico para validar archivos y revisar el resultado antes de aplicarlo.',
    content: 'La importación y exportación deben realizarse desde el panel canónico, que valida el formato, conserva procedencia y presenta los errores antes de confirmar. La IA puede orientar sobre el flujo, pero no lee archivos locales ni importa datos en segundo plano.\n\nRevisa el resumen y confirma desde la interfaz oficial; no pegues secretos ni documentos patrimoniales en el chat.',
    roles: ['ADMINISTRADOR'], keywords: ['importar', 'importación', 'exportar', 'exportación', 'xlsx', 'csv'],
  },
  {
    id: 'ayuda.migracion.historica', categoria: 'migracion', module: 'ayuda', section: 'ayuda',
    title: 'Migración histórica', summary: 'La migración requiere fuentes completas, custodiadas y un dry-run autorizado.',
    content: 'La migración histórica es un proceso controlado, no una acción automática del asistente. Los archivos originales se aportarán desde la aplicación cuando el flujo operativo esté habilitado; no se guardan dentro del código.\n\nUna fila incompleta o en conflicto debe permanecer pendiente. La IA puede explicar estados y orientar, pero no completa valores ausentes ni ejecuta la promoción de datos.',
    keywords: ['migración', 'histórica', 'fuente', 'incompleta', 'conflicto', 'dry-run'],
  },
  {
    id: 'ayuda.auditoria.registros', categoria: 'auditoria', module: 'administracion', section: 'administracion',
    title: 'Auditoría', summary: 'Las acciones relevantes quedan en el registro de auditoría canónico.',
    content: 'La auditoría del ERP conserva eventos relevantes mediante el registro existente. El asistente no crea una auditoría paralela ni guarda conversaciones completas por defecto; para consultas de datos registra solo la capacidad, el motor, el resultado resumido y el ámbito, sin incluir el texto de la pregunta.',
    roles: ['ADMINISTRADOR'], permissions: ['administracion.auditoria'], keywords: ['auditoría', 'audit_logs', 'registro', 'trazabilidad'],
  },
  {
    id: 'ayuda.configuracion.general', categoria: 'configuracion', module: 'administracion', section: 'configuracion',
    title: 'Configuración', summary: 'La configuración habilita opciones según el perfil; no sustituye los permisos de cada módulo.',
    content: 'Las opciones de configuración visibles dependen del perfil y de los permisos. Activar una opción visual no debe interpretarse como una autorización de datos o de escritura. Si una conexión de IA no está disponible, el asistente puede seguir ofreciendo la ayuda estática y la resolución local.',
    roles: ['ADMINISTRADOR'], permissions: ['administracion.configuracion'], keywords: ['configuración', 'ajustes', 'módulos', 'conexión', 'gemini'],
  },
  // ── AUDITORÍA UX PROPIETARIO (2026-09-29): titularidad e importar/exportar ─────
  {
    id: 'ayuda.datos.importar', categoria: 'importacion_exportacion', module: 'datos', section: 'datos',
    title: 'Importar datos paso a paso',
    summary: 'Sube un archivo JSON, CSV o Excel y revísalo en vista previa antes de escribir nada.',
    content:
      'En la pestaña «Importar» eliges el archivo (JSON, CSV o .xlsx) y el tipo de datos (inmuebles, propietarios, contratos, cobros o gastos).\n\nAl pulsar «Analizar» se ejecuta una lectura de prueba que NO escribe nada: verás el resumen (nuevos, duplicados ya existentes, posibles conflictos y problemas de validación) y el detalle por registro.\n\nSolo cuando el resultado te convenga, confirmas la importación: se aplican exclusivamente los registros autorizados dentro de tu ámbito y queda registro de la operación. Si un dato no es tuyo, el sistema lo bloquea igual que en cualquier otra pantalla.',
    keywords: ['importar', 'subir', 'excel', 'csv', 'json', 'vista previa', 'duplicados', 'datos'],
    relatedTutorials: ['recorrido.propietario.primeros-pasos'],
  },
  {
    id: 'ayuda.datos.exportar', categoria: 'importacion_exportacion', module: 'datos', section: 'datos',
    title: 'Exportar tus datos',
    summary: 'Descarga inmuebles, propietarios, contratos, cobros o gastos en JSON, CSV o Excel, por inmueble y por ejercicio.',
    content:
      'En la pestaña «Exportar» eliges qué datos quieres (inmuebles, propietarios, contratos, cobros o gastos) y el formato (JSON canónico, CSV o Excel).\n\nPuedes acotar la descarga por inmueble (lista de identificadores, dividida por comas) y, para cobros y gastos, por ejercicio fiscal. La exportación nunca incluye datos fuera de tu ámbito.\n\nPara el informe fiscal estructurado y la exportación fiscal CSV/JSON usa la sección «Informes & Export»: es un sistema distinto, pensado para revisión y preparación de la declaración, no para presentación oficial.',
    keywords: ['exportar', 'descargar', 'excel', 'csv', 'json', 'copia', 'datos', 'ejercicio'],
    relatedTutorials: ['recorrido.propietario.primeros-pasos'],
  },
  {
    id: 'ayuda.inmuebles.titularidad', categoria: 'inmuebles', module: 'inmuebles', section: 'inmuebles',
    title: 'Titularidad de un inmueble',
    summary: 'Quién figura como titular, qué es el cotitular fiscal y cómo cambiarlos desde la ficha.',
    content:
      'En la parte alta de la ficha de cada inmueble verás siempre quién figura como titular (y el cotitular, si lo hay).\n\nEl «titular económico» es la ficha de propietario a la que se vinculan cobros, gastos y liquidaciones. El «segundo propietario» es un cotitular fiscal: aparece en contratos y pólizas, pero no tiene acceso a la aplicación por ese motivo.\n\nPara añadir o cambiar el cotitular usa «Editar titularidad» en la ficha: puedes elegir una ficha existente o escribir los datos fiscales a mano (nombre, NIF, dirección…). La titularidad de la ficha patrimonial (alta de otros titulares con cuenta propia) la gestiona la administración.',
    keywords: ['titular', 'titularidad', 'segundo propietario', 'cotitular', 'arrendador', 'copropietario', 'fiscal'],
    relatedTutorials: ['recorrido.propietario.primeros-pasos'],
  },
  {
    id: 'ayuda.propietarios.titulares', categoria: 'titulares', module: 'propietarios', section: 'propietarios',
    title: 'Titulares patrimoniales y cuentas de acceso',
    summary: 'La ficha de titular (nombre, NIF, cuentas bancarias) es independiente de quién puede entrar en la aplicación.',
    content:
      'Un titular patrimonial es la identidad jurídica a la que pertenecen los inmuebles: lleva nombre, NIF, dirección fiscal y cuentas bancarias. Una cosa distinta es la cuenta de acceso a la aplicación (usuario y contraseña), que se concede por invitación.\n\nDesde esta pantalla puedes revisar y completar tu ficha e importar datos hacia ella. La creación de otros titulares patrimoniales corresponde a la administración: si necesitas añadir un nuevo titular independiente, solicítalo.\n\nPara que una vivienda tenga un cotitular fiscal (segundo arrendador en contratos) no hace falta crear nada aquí: se configura en la ficha del propio inmueble, en «Editar titularidad».',
    keywords: ['titular', 'propietario', 'titulares', 'patrimonial', 'segundo propietario', 'cotitular', 'cuenta', 'acceso'],
    relatedTutorials: ['recorrido.propietario.primeros-pasos'],
  },
];

/** Palabras vacías frecuentes en español que no deben puntuar en la búsqueda. */
const STOPWORDS = new Set(['los', 'las', 'del', 'una', 'uno', 'unos', 'unas', 'que', 'con', 'por', 'para', 'como', 'este', 'esta', 'esto', 'sobre', 'entre', 'desde', 'hasta', 'donde', 'cuando', 'quiero', 'puedo', 'tengo', 'hacer', 'necesito', 'mis', 'sus', 'sin', 'mas']);

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** ¿La entrada es visible para el contexto? (rol y permisos requeridos; solo lectura del RBAC). */
export function ayudaVisibleEn(entrada: HelpEntry, ctx: ExperienceContext): boolean {
  if ((entrada.host ?? 'ERP') !== ctx.host) return false;
  if (!contextoCumpleRoles(ctx, entrada.roles)) return false;
  if (entrada.permissions && entrada.permissions.length > 0) {
    // Si los permisos del usuario son desconocidos, el contenido condicionado no se muestra.
    if (ctx.missing.includes('permissions')) return false;
    if (!entrada.permissions.every((p) => contextoTienePermiso(ctx, p))) return false;
  }
  return true;
}

export interface OpcionesAyuda {
  registro?: HelpEntry[];
}

/** Ayuda visible para el contexto (todas las secciones). */
export function ayudaDisponible(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): HelpEntry[] {
  const registro = opciones.registro ?? AYUDA_REGISTRO;
  return registro.filter((e) => ayudaVisibleEn(e, ctx));
}

/** Ayuda de la pantalla actual (coincidencia exacta por sección). */
export function ayudaParaContexto(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): HelpEntry[] {
  if (!ctx.section) return [];
  return ayudaDisponible(ctx, opciones).filter((e) => e.section === ctx.section);
}

/** Ayuda del módulo actual (más amplia que la de la pantalla). */
export function ayudaParaModulo(ctx: ExperienceContext, modulo: ModuloERP, opciones: OpcionesAyuda = {}): HelpEntry[] {
  return ayudaDisponible(ctx, opciones).filter((e) => e.module === modulo);
}

/**
 * Búsqueda por texto sobre título, resumen, contenido y palabras clave, con puntuación
 * simple (título > keywords > resumen > contenido). Respeta rol/permisos del contexto.
 */
export function buscarAyuda(ctx: ExperienceContext, consulta: string, opciones: OpcionesAyuda = {}): HelpEntry[] {
  const q = normalizar(consulta);
  if (!q) return ayudaDisponible(ctx, opciones);
  const terminos = q.split(/\s+/).filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (terminos.length === 0) return [];
  const puntuadas = ayudaDisponible(ctx, opciones)
    .map((e) => {
      const titulo = normalizar(e.title);
      const kws = (e.keywords ?? []).map(normalizar);
      const resumen = normalizar(e.summary);
      const contenido = normalizar(e.content);
      let puntos = 0;
      for (const t of terminos) {
        if (titulo.includes(t)) puntos += 5;
        if (kws.some((k) => k.includes(t))) puntos += 4;
        if (resumen.includes(t)) puntos += 2;
        if (contenido.includes(t)) puntos += 1;
      }
      return { e, puntos };
    })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.e.title.localeCompare(b.e.title));
  return puntuadas.map((x) => x.e);
}

export function obtenerAyuda(id: string, opciones: OpcionesAyuda = {}): HelpEntry | undefined {
  return (opciones.registro ?? AYUDA_REGISTRO).find((e) => e.id === id);
}

/** Módulos con al menos una entrada visible (para el filtro del Centro de Ayuda). */
export function modulosConAyuda(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): ModuloERP[] {
  return Array.from(new Set(ayudaDisponible(ctx, opciones).map((e) => e.module)));
}

export const CATEGORIAS_AYUDA: ReadonlyArray<{ id: CategoriaAyuda; nombre: string }> = [
  { id: 'inicio', nombre: 'Inicio' },
  { id: 'usuarios_permisos', nombre: 'Usuarios y permisos' },
  { id: 'titulares', nombre: 'Titulares' },
  { id: 'carteras', nombre: 'Carteras' },
  { id: 'inmuebles', nombre: 'Inmuebles' },
  { id: 'alquileres', nombre: 'Alquileres' },
  { id: 'operaciones', nombre: 'Operaciones' },
  { id: 'fiscalidad', nombre: 'Fiscalidad' },
  { id: 'documentos', nombre: 'Documentos' },
  { id: 'importacion_exportacion', nombre: 'Importación/exportación' },
  { id: 'migracion', nombre: 'Migración' },
  { id: 'auditoria', nombre: 'Auditoría' },
  { id: 'configuracion', nombre: 'Configuración' },
];

export function categoriaDeAyuda(entrada: HelpEntry): CategoriaAyuda {
  if (entrada.categoria) return entrada.categoria;
  const porModulo: Partial<Record<ModuloERP, CategoriaAyuda>> = {
    inicio: 'inicio', inmuebles: 'inmuebles', propietarios: 'titulares',
    contratos: 'alquileres', cobros: 'alquileres', tesoreria: 'alquileres',
    morosidad: 'operaciones', actas: 'documentos', inquilinos: 'usuarios_permisos',
    suministros: 'operaciones', incidencias: 'operaciones', finanzas: 'fiscalidad',
    seguros: 'operaciones', administracion: 'configuracion', ayuda: 'inicio', captacion: 'alquileres',
  };
  return porModulo[entrada.module] ?? 'inicio';
}

export function categoriasConAyuda(ctx: ExperienceContext, opciones: OpcionesAyuda = {}): CategoriaAyuda[] {
  const disponibles = new Set(ayudaDisponible(ctx, opciones).map(categoriaDeAyuda));
  return CATEGORIAS_AYUDA.filter((c) => disponibles.has(c.id)).map((c) => c.id);
}

export const NOMBRE_CATEGORIA_AYUDA: Record<CategoriaAyuda, string> = Object.fromEntries(CATEGORIAS_AYUDA.map((c) => [c.id, c.nombre])) as Record<CategoriaAyuda, string>;

export const NOMBRE_MODULO: Record<ModuloERP, string> = {
  inicio: 'Inicio',
  inmuebles: 'Inmuebles',
  propietarios: 'Propietarios',
  captacion: 'Captación y candidatos',
  contratos: 'Contratos',
  cobros: 'Cobros',
  tesoreria: 'Tesorería',
  morosidad: 'Morosidad',
  actas: 'Actas',
  inquilinos: 'Portal de inquilinos',
  suministros: 'Suministros',
  incidencias: 'Incidencias',
  finanzas: 'Finanzas y fiscalidad',
  seguros: 'Seguros',
  administracion: 'Administración',
  datos: 'Importar / Exportar',
  ayuda: 'Ayuda',
  desconocido: 'Otros',
};
