/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Registro tipado de ayuda contextual y motor de consulta.
 *
 * El contenido describe funcionalidades REALES de la canónica (B/C/D/E y base).
 * Filtrado por rol/permiso = solo lectura del RBAC existente (nunca lo amplía).
 */
import type { ExperienceContext, HelpEntry, ModuloERP } from './tipos';
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
  // ---------------------------------------------------------------- UX-1A · pantallas de entrada (mismo registro; el rol filtra)
  {
    id: 'ayuda.admin.centro-control',
    module: 'administracion',
    section: 'administracion',
    title: 'Centro de Control',
    summary: 'Supervisión de la plataforma: usuarios, inmuebles, ocupación y auditoría.',
    content:
      'Esta pantalla es el Centro de Control del administrador. El panel inicial muestra cuatro cifras de la plataforma: usuarios, inmuebles, tasa de ocupación y eventos de auditoría, más la actividad reciente.\n\nEl menú interior abre Gestión de Usuarios, el directorio de inmuebles de la plataforma, propietarios, profesionales, Configuración y módulos, y el Registro de Auditoría. Las áreas operativas —inmuebles, cobros, tesorería, contratos— están en el menú principal. El Centro de Ayuda está en «Ayuda»; el asistente, junto al título.',
    roles: ['ADMINISTRADOR'],
    keywords: ['centro de control', 'supervisión', 'usuarios', 'auditoría', 'ocupación', 'plataforma'],
    relatedTutorials: ['recorrido.admin.centro-control'],
  },
  {
    id: 'ayuda.admin.inmuebles',
    module: 'inmuebles',
    section: 'inmuebles',
    title: 'Gestión de Inmuebles',
    summary: 'Listado de viviendas, filtros y alta de un inmueble.',
    content:
      'Aquí ves las viviendas de la cartera. Puedes buscar por dirección, ciudad, catastro o propietario y filtrar por Todos, Disponibles o Alquilados. Cada tarjeta abre la ficha de esa vivienda.\n\n«Nuevo Inmueble» abre el alta. Guardar crea la vivienda; no genera un recibo ni una liquidación.',
    roles: ['ADMINISTRADOR'],
    keywords: ['inmueble', 'vivienda', 'alta', 'nuevo inmueble', 'cartera'],
  },
  {
    id: 'ayuda.admin.configuracion',
    module: 'administracion',
    section: 'configuracion',
    title: 'Configuración del sistema',
    summary: 'Perfil de la aplicación, criterios de preselección, exportación e importación y aseguradoras.',
    content:
      'Configuración del sistema guarda el perfil de usuario o agencia (nombre, empresa, correo y teléfono), el ratio máximo de esfuerzo de preselección y si quieres avisos por correo cuando un candidato envía la documentación.\n\nTambién puedes exportar o importar un JSON de inmuebles y candidatos, y abrir «Configurar Entidades Aseguradoras y Ratios». «Guardar cambios» aplica el perfil y los criterios. No es la ficha de un propietario ni la de un profesional: esas están en sus portales.',
    roles: ['ADMINISTRADOR'],
    keywords: ['configuración', 'perfil de sistema', 'preselección', 'exportar', 'importar', 'aseguradoras'],
  },
  {
    id: 'ayuda.propietario.portal',
    module: 'propietarios',
    section: 'propietarios',
    title: 'Portal del propietario',
    summary: 'Tus viviendas, contratos, cobros, gastos e incidencias, en pestañas.',
    content:
      'Este es tu portal. Arriba ves tu nombre y cuántas viviendas hay en cartera. Las pestañas son Mis Viviendas, Mis Profesionales, Mis Contratos, Mis Liquidaciones, Morosidad, Gastos, Cobros, Incidencias y Mi Perfil.\n\nEn Mis Viviendas ves solo tus inmuebles. Si aún no hay ninguno, «Nuevo inmueble» crea el primero y lo vincula a tu cuenta. No generas ni apruebas liquidaciones: las consultas en su pestaña. El menú «Mi Cuenta» abre la pestaña Mi Perfil de este mismo portal, no la configuración del sistema.',
    roles: ['PROPIETARIO'],
    keywords: ['portal propietario', 'viviendas', 'profesionales', 'contratos', 'mi perfil'],
    relatedTutorials: ['recorrido.propietario.portal'],
  },
  {
    id: 'ayuda.propietario.perfil',
    module: 'propietarios',
    section: 'propietarios',
    title: 'Mi Perfil',
    summary: 'Tus datos de titular: nombre, NIF, contacto y domicilio.',
    content:
      'La pestaña Mi Perfil, dentro del portal, muestra la ficha de tu cuenta de propietario: nombre o razón social, NIF, teléfono, correo y domicilio. «Guardar Mi Ficha» actualiza esos datos.\n\nTambién llegas aquí desde el menú «Mi Cuenta». No abre la configuración del sistema ni otra sección.',
    roles: ['PROPIETARIO'],
    keywords: ['mi perfil', 'mi cuenta', 'ficha propietario', 'nif', 'domicilio'],
  },
  {
    id: 'ayuda.propietario.inmuebles',
    module: 'inmuebles',
    section: 'inmuebles',
    title: 'Tus viviendas',
    summary: 'El listado de inmuebles vinculados a tu cuenta y el alta.',
    content:
      'En Gestión de Inmuebles ves solo las viviendas vinculadas a tu cuenta. Puedes buscar, filtrar y abrir una tarjeta para el detalle.\n\n«Nuevo Inmueble» abre el mismo alta que el botón del portal. Si tu ficha está en la lista, el titular puede aparecer preseleccionado y el selector sigue siendo editable. Guardar crea esa vivienda; no cambia la de otras.',
    roles: ['PROPIETARIO'],
    keywords: ['mis viviendas', 'inmuebles', 'nuevo inmueble', 'titular'],
  },
  {
    id: 'ayuda.profesional.portal',
    module: 'administracion',
    section: 'administracion',
    title: 'Portal profesional',
    summary: 'Ficha, especialidades, zonas, viviendas asignadas y órdenes de trabajo.',
    content:
      'Este es tu portal de servicios. La cabecera muestra tu nombre comercial y cuántas viviendas tienes asignadas. Las pestañas son Mi Ficha y Datos, Mis Especialidades, Mis Zonas de Cobertura, Viviendas Asignadas y Órdenes de Trabajo y Partes.\n\nAl entrar ves las órdenes de trabajo. No administras la cartera ni las liquidaciones: solo lo que te han asignado. El menú «Mi Cuenta» abre la pestaña Mi Ficha y Datos de este portal.',
    roles: ['PROFESIONAL'],
    keywords: ['portal profesional', 'órdenes de trabajo', 'especialidades', 'zonas', 'servicios'],
    relatedTutorials: ['recorrido.profesional.portal'],
  },
  {
    id: 'ayuda.profesional.ficha',
    module: 'administracion',
    section: 'administracion',
    title: 'Mi Ficha y Datos',
    summary: 'Nombre comercial, contacto y datos que ven los propietarios al asignarte.',
    content:
      'La pestaña Mi Ficha y Datos guarda el nombre comercial, el contacto y los datos de facturación que los propietarios ven al asignarte un trabajo. «Guardar cambios» los deja en tu ficha.\n\nEl menú «Mi Cuenta» abre esta misma pestaña. No es la configuración del sistema.',
    roles: ['PROFESIONAL'],
    keywords: ['mi ficha', 'datos comerciales', 'nombre comercial', 'facturación profesional'],
  },
  {
    id: 'ayuda.profesional.viviendas',
    module: 'inmuebles',
    section: 'inmuebles',
    title: 'Viviendas asignadas',
    summary: 'Inmuebles en los que estás autorizado a atender averías y revisiones.',
    content:
      'El menú «Viviendas Asignadas» abre el listado de inmuebles vinculados a tu ficha. En el portal, la pestaña del mismo nombre muestra esas viviendas: dirección y ciudad. Si no hay ninguna, aún no te han designado.\n\nDesde aquí consultas las que ya tienes. No das de alta la cartera ni cambias al titular.',
    roles: ['PROFESIONAL'],
    keywords: ['viviendas asignadas', 'técnico', 'autorizado'],
  },
  {
    id: 'ayuda.inmuebles.alta',
    module: 'inmuebles',
    section: 'inmuebles',
    title: 'Alta de un inmueble',
    summary: 'Qué es la vivienda, quién es el titular, datos principales, apartado fiscal y guardado.',
    content:
      'El inmueble es la vivienda física permanente. Contratos e inquilinos posteriores quedan asociados a ese mismo registro. El alta tiene dos pestañas: «Datos generales y vivienda» (dirección, ciudad, renta, habitaciones y estado) y «Apartado fiscal y arrendador», que es opcional.\n\nEn el apartado fiscal eliges el propietario de la lista. Si abres el alta desde tu portal, tu ficha puede venir preseleccionada y el selector sigue editable. Al elegir un titular, el formulario vincula sus datos fiscales y su cuenta de cobro. «Guardar inmueble» crea la vivienda. No liquida, no genera un recibo y no modifica otras viviendas.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO', 'PROFESIONAL'],
    keywords: ['alta de inmueble', 'arrendador', 'referencia catastral', 'guardar inmueble', 'datos generales'],
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
  ayuda: 'Ayuda',
  desconocido: 'Otros',
};
