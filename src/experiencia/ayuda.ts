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
    roles: ['ADMINISTRADOR'],
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
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
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
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
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
      'Qué es. El Centro de Ayuda reúne las explicaciones de cada pantalla y los tutoriales disponibles para tu perfil.\n\nQué puedes hacer. Busca por palabras, filtra por módulo y abre un tutorial. El icono de ayuda de cada sección abre la ficha de esa pantalla: para qué sirve, qué acciones tiene y por dónde seguir.\n\nQué hace falta. Nada que configurar. Solo muestra contenido de funciones a las que ya tienes acceso: la ayuda nunca concede permisos.\n\nDespués. Si una ficha enlaza un recorrido, lo inicias desde aquí o desde el icono de ayuda. El asistente usa estas mismas fichas; no es otro manual.',
    keywords: ['ayuda', 'tutorial', 'buscar', 'centro de ayuda'],
  },
  // ---------------------------------------------------------------- UX-1C · pantallas sin ficha (el rol filtra; no concede permisos)
  // Sin ficha, a propósito: solicitudes/nuevo_candidato/cuestionario (no son destino de menú),
  // mis_* y mi_perfil (UX-0B no navega ahí), morosidad del propietario (no está en su menú),
  // portal `mas` (no se amplía el inquilino) e inversión del profesional (no está en su menú).
  {
    id: 'ayuda.dashboard.ejecutivo',
    module: 'inicio',
    section: 'dashboard',
    title: 'Panel ejecutivo',
    summary: 'Cifras reales de la cartera y atajos a cobros, gastos, incidencias e inmuebles.',
    content:
      'Qué es. Es el panel ejecutivo, no el Centro de Control de usuarios. Resume ocupación, cobros, gastos, incidencias y operaciones con los registros que ya existen.\n\nQué puedes hacer. Cambiar el periodo y saltar a Cobros, Gastos, Incidencias, Inmuebles, Contratos, Pólizas, Actas o Conciliación. Las tarjetas no crean registros.\n\nQué hace falta. Inmuebles, contratos, cobros o gastos ya registrados. Si no hay datos, el panel lo indica; no rellena cifras.\n\nDespués. Entra en la sección del atajo para revisar o registrar. Usuarios, auditoría y configuración están en Administración y Configuración.',
    roles: ['ADMINISTRADOR'],
    keywords: ['panel ejecutivo', 'dashboard', 'ocupación', 'atajos', 'centro de control ejecutivo'],
  },
  {
    id: 'ayuda.dashboard.propietario',
    module: 'inicio',
    section: 'dashboard',
    title: 'Resumen de tu cartera',
    summary: 'Cifras de tus inmuebles y atajos a las secciones que ya tienes en el menú.',
    content:
      'Qué es. Resume tus viviendas, cobros, gastos e incidencias. No es el Centro de Control del administrador ni la pestaña Mi Perfil.\n\nQué puedes hacer. Cambiar el periodo y abrir los atajos de tu menú. Solo ves el ámbito de tu cuenta.\n\nQué hace falta. Que tus inmuebles y sus contratos, cobros o gastos ya estén registrados. Sin datos, el panel lo dice.\n\nDespués. El día a día sigue en Mi Portal Propietario o en la sección del atajo. Mi Cuenta abre Mi Perfil, no este panel.',
    roles: ['PROPIETARIO'],
    keywords: ['resumen', 'cartera', 'panel', 'atajos', 'mis inmuebles'],
  },
  {
    id: 'ayuda.admin.propietarios',
    module: 'propietarios',
    section: 'propietarios',
    title: 'Propietarios e IBAN',
    summary: 'Fichas de titular, NIF, domicilio y cuentas de cobro. No crea el acceso al portal.',
    content:
      'Qué es. Directorio de propietarios y arrendadores, con sus cuentas de cobro.\n\nQué puedes hacer. Buscar y filtrar, crear o editar la ficha (datos fiscales, domicilio, representante, cuentas y notas), añadir un IBAN, marcarlo principal, copiarlo y eliminar con confirmación. Desde una ficha puedes abrir sus inmuebles o iniciar el alta de una vivienda en su contexto.\n\nQué hace falta. Nombre y NIF o CIF para que sirva de titular. El alta de la vivienda es la de Inmuebles: el selector de titular sigue editable.\n\nDespués. Ese titular se elige al guardar un inmueble. Esta pantalla no crea el usuario de acceso ni un pago al propietario.',
    roles: ['ADMINISTRADOR'],
    keywords: ['propietario', 'iban', 'nif', 'cuenta de cobro', 'arrendador', 'titular'],
  },
  {
    id: 'ayuda.gastos.gestion',
    module: 'finanzas',
    section: 'gastos',
    title: 'Gastos, recurrentes y préstamos',
    summary: 'Apuntes de los inmuebles que ya puedes ver, con recurrentes, préstamos y cuadre.',
    content:
      'Qué es. Registro de gastos de explotación o financiación asociados a un inmueble.\n\nQué puedes hacer. Filtrar por inmueble, tipo, categoría, estado y año. Registrar, editar o eliminar un gasto. En Recurrentes y Préstamos das de alta esas fichas y consultas el cuadre de rentabilidad. La lista es la de los inmuebles de tu sesión.\n\nQué hace falta. Un inmueble ya creado. Un gasto no marca un recibo como cobrado ni aprueba un pago al propietario.\n\nDespués. Fiscalidad e Informes reutilizan estos apuntes. No calculan un impuesto desde aquí.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['gasto', 'recurrente', 'préstamo', 'explotación', 'rentabilidad', 'apuntes'],
  },
  {
    id: 'ayuda.fiscal.alquileres',
    module: 'finanzas',
    section: 'fiscal',
    title: 'Fiscalidad anual de alquileres',
    summary: 'Ingresos y gastos del ejercicio, tomados de cobros y apuntes ya registrados. No calcula el IRPF.',
    content:
      'Qué es. Consulta anual por inmueble. No es una presentación a Hacienda.\n\nQué puedes hacer. Elegir ejercicio e inmueble, ver los ingresos del año tomados de los cobros existentes, los gastos del año tomados de los apuntes existentes, la sucesión de contratos y las referencias de documentación ya guardadas. El histórico no sobrescribe otros ejercicios.\n\nQué hace falta. Contratos, cobros o gastos ya registrados. El resultado de la pantalla no es la cuota de IRPF: debe revisarlo un asesor.\n\nDespués. Informes puede exportar el resumen fiscal del mismo origen. Para corregir una cifra, vuelve al cobro o al gasto.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['fiscalidad', 'ejercicio', 'irpf', 'ingresos', 'alquileres'],
  },
  {
    id: 'ayuda.informes.cartera',
    module: 'finanzas',
    section: 'informes',
    title: 'Informes y exportación',
    summary: 'Cartera, inmueble, rentabilidad y resumen fiscal, en pantalla o en PDF y JSON.',
    content:
      'Qué es. Informes de los inmuebles que ya puedes ver, calculados con contratos, cobros, gastos y el resto de registros existentes.\n\nQué puedes hacer. Elegir periodo (mes, trimestre, año o fechas) y la vista: cartera, inmueble, rentabilidad, fiscal o exportación. Generar PDF de cartera, de inmueble o fiscal, y exportar JSON.\n\nQué hace falta. Datos ya registrados. Si no hay, el informe sale vacío. No presenta modelos fiscales ni crea otro libro contable.\n\nDespués. Para corregir una cifra, edítala en Cobros, Gastos o Fiscalidad. Esta pantalla no la cambia.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['informe', 'exportar', 'pdf', 'json', 'rentabilidad', 'cartera'],
  },
  {
    id: 'ayuda.conciliacion.bancaria',
    module: 'finanzas',
    section: 'conciliacion',
    title: 'Conciliación de extractos',
    summary: 'Importa un extracto, revisa propuestas y deja trazabilidad. No cambia el importe histórico.',
    content:
      'Qué es. Cruza movimientos del extracto con cobros y gastos ya existentes.\n\nQué puedes hacer. Importar CSV, OFX, MT940 o Norma 43. Revisar la propuesta de cada movimiento: confirmar, rechazar, clasificarlo como comisión o transferencia interna, o dejarlo sin conciliar. Aplicar guarda la trazabilidad y no modifica el importe histórico.\n\nQué hace falta. Un extracto ya descargado y cobros o gastos con los que comparar. El estado se guarda por propietario. No hay conexión directa con la entidad ni cargo automático.\n\nDespués. Un movimiento confirmado puede servir de evidencia en Tesorería. El recibo se sigue en Cobros.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['conciliación', 'extracto', 'csv', 'ofx', 'mt940', 'norma 43', 'movimiento'],
  },
  {
    id: 'ayuda.facturacion.registro',
    module: 'finanzas',
    section: 'facturacion',
    title: 'Facturas y registro',
    summary: 'Emite facturas, encadena el registro y prepara VERI*FACTU. Sin conexión a la AEAT.',
    content:
      'Qué es. Facturas de los inmuebles que ya puedes ver, con serie, número y estado.\n\nQué puedes hacer. Filtrar por estado y ejercicio, crear una factura, emitirla (genera el registro con huella encadenada y la preparación VERI*FACTU), rectificarla o anularla. El apartado de factura electrónica B2B es otro bloque, no forma parte de esa preparación.\n\nQué hace falta. Receptor y datos de la factura. Emitir no envía nada a la AEAT: la conexión oficial no está hecha y aquí no se carga un certificado.\n\nDespués. La factura queda en esta lista. No sustituye al recibo de alquiler ni a un pago al propietario.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['factura', 'verifactu', 'serie', 'anular', 'rectificar', 'aeat'],
  },
  {
    id: 'ayuda.financiacion.hipotecas',
    module: 'finanzas',
    section: 'financiacion',
    title: 'Financiación hipotecaria',
    summary: 'Préstamos, LTV y cuadros de amortización. Sin conexión con la entidad.',
    content:
      'Qué es. Fichas de financiación vinculadas a un inmueble y a su titular.\n\nQué puedes hacer. Crear una financiación, ver el cuadro, registrar una amortización y consultar el LTV o una simulación. Solo aparecen las de los inmuebles de tu sesión.\n\nQué hace falta. Un inmueble. No pide credenciales ni se conecta con la entidad.\n\nDespués. Si existe un préstamo en Gastos, se consulta allí. Esta ficha no genera un pago.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['financiación', 'hipoteca', 'ltv', 'amortización', 'préstamo hipotecario'],
  },
  {
    id: 'ayuda.polizas.gestion',
    module: 'seguros',
    section: 'polizas',
    title: 'Pólizas de seguro',
    summary: 'Alta, vencimiento, alerta y renovación de las pólizas que ya puedes ver.',
    content:
      'Qué es. Pólizas de los inmuebles de tu ámbito. Como propietario solo ves las de inmuebles sobre los que tienes autorización.\n\nQué puedes hacer. Buscar y filtrar, crear una póliza, abrir el detalle, renovar y consultar el histórico. Las alertas avisan a 60, 45, 30 y 15 días del vencimiento.\n\nQué hace falta. Un inmueble al que asociarla. Crear la ficha no contrata la póliza con la aseguradora.\n\nDespués. Los siniestros se siguen desde Incidencias u Operaciones. La renovación queda en la propia póliza.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['póliza', 'seguro', 'vencimiento', 'renovación', 'alerta'],
  },
  {
    id: 'ayuda.inversion.analisis',
    module: 'finanzas',
    section: 'inversion',
    title: 'Inversión y valoración',
    summary: 'Análisis de compra o de un inmueble: valoración, comparables, coste y alquiler estimado.',
    content:
      'Qué es. Estudios guardados. No es el listado de la cartera.\n\nQué puedes hacer. Crear, ver, editar, duplicar o eliminar un análisis. Incluye valoración, comparables, coste de compra, financiación opcional y alquiler estimado, y puedes comparar escenarios. «Convertir en inmueble cartera» crea la vivienda en Inmuebles.\n\nQué hace falta. Las cifras del estudio. Convertir no crea contrato ni recibo.\n\nDespués. La vivienda nueva, si la conviertes, se gestiona en Inmuebles. El estudio no aprueba una compra.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['inversión', 'valoración', 'comparables', 'análisis', 'convertir en inmueble'],
  },
  {
    id: 'ayuda.recomercializacion.expediente',
    module: 'captacion',
    section: 'recomercializacion',
    title: 'Recomercialización',
    summary: 'Expediente de salida, inspección, valoración y nueva comercialización del inmueble.',
    content:
      'Qué es. Un expediente por activo que sale de un alquiler y vuelve a comercializarse.\n\nQué puedes hacer. Abrir un expediente, buscar por dirección y anotar inmobiliarias, propuestas y leads. Cerrar el ciclo cuando el expediente termina. El botón de alta está desactivado si no hay inmuebles.\n\nQué hace falta. Un inmueble. Abrir el expediente no finaliza el contrato ni publica un anuncio.\n\nDespués. El contrato se cierra en Formalización o en la ficha del inmueble. La nueva comercialización sigue en este expediente.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['recomercialización', 'expediente', 'salida', 'inmobiliaria', 'lead'],
  },
  {
    id: 'ayuda.operaciones.coordinacion',
    module: 'incidencias',
    section: 'operaciones',
    title: 'Coordinación operativa',
    summary: 'Vista conjunta de incidencias, trabajos, pólizas, siniestros y gastos ya registrados.',
    content:
      'Qué es. Pantalla de coordinación. No sustituye a Incidencias, Pólizas ni Gastos.\n\nQué puedes hacer. Revisar lo pendiente de tu ámbito y abrir el detalle con el formulario de su sección, incluida la póliza o el siniestro. También puedes ir a la sección de origen.\n\nQué hace falta. Que esos registros existan. Abrir esta pantalla no crea una incidencia ni un gasto.\n\nDespués. El cambio de estado de una avería se hace en Incidencias; el de una póliza, en Pólizas.',
    roles: ['ADMINISTRADOR', 'PROPIETARIO'],
    keywords: ['operaciones', 'coordinación', 'mantenimiento', 'siniestro', 'trabajos'],
  },
  {
    id: 'ayuda.captacion.preseleccionados',
    module: 'captacion',
    section: 'preseleccionados',
    title: 'Preseleccionados y visitas',
    summary: 'Candidatos ya preseleccionados o con invitación de visita, agenda y paso a contrato.',
    content:
      'Qué es. La cola posterior a Candidatos: quien está preseleccionado, tiene visita reservada o una invitación activa.\n\nQué puedes hacer. Filtrar por inmueble y estado, configurar la agenda de visitas, solicitar documentación económica y laboral, abrir la gestión de esa documentación y pasar a formalizar.\n\nQué hace falta. Un candidato en ese estado y un inmueble. Formalizar abre el alta de contrato; no lo deja firmado desde esta lista.\n\nDespués. El contrato sigue en Formalización. La valoración está en Análisis.',
    roles: ['ADMINISTRADOR'],
    keywords: ['preseleccionado', 'visita', 'agenda', 'documentación', 'formalizar'],
  },
  {
    id: 'ayuda.captacion.seguro-impago',
    module: 'seguros',
    section: 'seguro_impago',
    title: 'Seguro de impago',
    summary: 'Expedientes de seguro de impago y catálogo de aseguradoras. No emite la póliza.',
    content:
      'Qué es. Seguimiento del expediente de seguro de impago de un alquiler, con su referencia.\n\nQué puedes hacer. Crear un expediente, abrir su detalle, eliminarlo y configurar las entidades aseguradoras. Esa configuración es el catálogo de aseguradoras, no el perfil del sistema.\n\nQué hace falta. Candidato e inmueble del expediente. Registrarlo no contrata el seguro.\n\nDespués. La póliza, si llega a existir, se consulta en Pólizas. El contrato, en Formalización.',
    roles: ['ADMINISTRADOR'],
    keywords: ['seguro de impago', 'aseguradora', 'expediente de seguro', 'impago'],
  },
  {
    id: 'ayuda.captacion.candidatos',
    module: 'captacion',
    section: 'candidatos',
    title: 'Candidatos',
    summary: 'Busca, filtra, abre la ficha, cambia el estado y genera el informe.',
    content:
      'Qué es. Listado de personas interesadas en un inmueble, con su estado.\n\nQué puedes hacer. Buscar por nombre, correo, teléfono o inmueble. Filtrar por estado e inmueble. Abrir la ficha, actualizar el estado, generar el informe o eliminar el candidato. Añadir uno abre el alta ya existente.\n\nQué hace falta. Los datos del candidato. Cambiar el estado no crea el contrato.\n\nDespués. Si queda preseleccionado, sigue en Preseleccionados. La valoración está en Análisis.',
    roles: ['ADMINISTRADOR'],
    keywords: ['candidato', 'estado', 'informe', 'ficha', 'preselección'],
  },
  {
    id: 'ayuda.captacion.analisis',
    module: 'captacion',
    section: 'analisis',
    title: 'Valoración de candidatos',
    summary: 'Índice de solvencia y comparador. No aprueba ni rechaza al candidato.',
    content:
      'Qué es. Valoración a partir de capacidad de pago, estabilidad, ingresos y documentación aportada.\n\nQué puedes hacer. Elegir un candidato y ver la valoración individual, comparar candidatos de un inmueble o abrir el análisis de documentación. Generar el informe usa el mismo informe del candidato.\n\nQué hace falta. Un candidato, y mejor con documentación ya cargada en su ficha. La decisión final no se toma en esta pantalla.\n\nDespués. Si continúas con esa persona, el estado se cambia en Candidatos y el contrato en Formalización.',
    roles: ['ADMINISTRADOR'],
    keywords: ['solvencia', 'valoración de candidatos', 'comparador', 'documentación', 'análisis'],
  },
  {
    id: 'ayuda.propietario.suministros',
    module: 'suministros',
    section: 'suministros',
    title: 'Suministros de tus viviendas',
    summary: 'Consulta, lecturas y solicitud de cambio de titular. Sin alta ni borrado.',
    content:
      'Qué es. Luz, agua, gas y demás suministros de los inmuebles de tu cuenta.\n\nQué puedes hacer. Filtrar por inmueble, ver comercializadora, contador e histórico, registrar una lectura y solicitar un cambio de titular. La lectura guardada no se edita: una corrección es otra lectura.\n\nQué hace falta. Que la administración haya dado de alta el suministro. No puedes crearlo, editarlo, borrarlo ni confirmar el cambio: eso lo resuelve gestión.\n\nDespués. La lectura queda en el histórico. El inquilino, si tiene portal, puede ver el suministro de su contrato.',
    roles: ['PROPIETARIO'],
    keywords: ['suministro', 'lectura', 'contador', 'cambio de titular', 'luz', 'agua'],
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
