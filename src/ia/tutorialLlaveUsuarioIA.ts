/**
 * IA · FASE 9 — ALTA GUIADA DE LA LLAVE PROPIA (contenido único)
 * ===============================================================
 * Contenido estructurado del alta guiada (§11.2 del diseño): lo consumen la
 * pantalla `AltaGuiadaLlaveIA.tsx`, el endpoint `GET /api/ia/llave`
 * (`altaGuiada`) y el tutorial imprimible en PDF (§11.2.8,
 * `src/utils/tutorialLlaveUsuarioPdf.ts`). Una sola fuente: UI y PDF no
 * divergen.
 *
 * Módulo PURO: sin React, sin jsPDF, sin red. Nunca contiene una clave.
 */
import { LONGITUD_LLAVE_GEMINI, PREFIJO_LLAVE_GEMINI } from './llavesUsuarioContrato.js';

export const URL_OFICIAL_CLAVES_AI_STUDIO = 'https://aistudio.google.com/app/apikey';
export const VERSION_TUTORIAL_LLAVE = '1.0 · Fase IA 9';

export type ClavePasoAltaGuiada =
  | 'QUE_ES'
  | 'ANTES_DE_EMPEZAR'
  | 'CREAR_EN_AI_STUDIO'
  | 'PEGAR_EN_ERP'
  | 'CONFIRMACION'
  | 'VERIFICACION'
  | 'SUSTITUIR_O_REVOCAR';

export interface PasoAltaGuiadaLlave {
  /** Numeración §11.2.x del diseño. */
  numero: number;
  clave: ClavePasoAltaGuiada;
  titulo: string;
  detalle: readonly string[];
  enlace?: string;
}

export interface PreguntaFrecuenteLlave {
  pregunta: string;
  respuesta: string;
}

export interface TutorialLlaveUsuarioIA {
  titulo: string;
  subtitulo: string;
  version: string;
  introduccion: readonly string[];
  pasos: readonly PasoAltaGuiadaLlave[];
  avisosSeguridad: readonly string[];
  preguntasFrecuentes: readonly PreguntaFrecuenteLlave[];
  /** Líneas para anotar a mano en el PDF (fecha de alta; NUNCA la clave). */
  camposParaAnotar: readonly string[];
}

const PASOS_ALTA_GUIADA: readonly PasoAltaGuiadaLlave[] = Object.freeze<PasoAltaGuiadaLlave[]>([
  {
    numero: 1,
    clave: 'QUE_ES',
    titulo: 'Qué es la clave y por qué es tuya',
    detalle: [
      'Una clave de API es una contraseña larga que identifica tu cuenta de Google ante el servicio de IA (Gemini).',
      'Con tu propia clave, el uso de la IA se atribuye y se factura (si procede) en tu cuenta de Google, no en la del gestor de la aplicación.',
      'El Gestor de Inmuebles guarda la clave cifrada en su servidor, no la enseña a nadie (ni a los administradores) y puedes revocarla cuando quieras.',
      'Los límites de uso del Gestor (operaciones por día y por mes) siguen aplicándose como protección adicional.',
    ],
  },
  {
    numero: 2,
    clave: 'ANTES_DE_EMPEZAR',
    titulo: 'Antes de empezar',
    detalle: [
      'Necesitas una cuenta de Google (la misma de Gmail sirve) y acceso a Google AI Studio.',
      'La clave es personal e intransferible: no la compartas, no la envíes por correo ni la pegues en chats.',
      'Ten el Gestor de Inmuebles abierto en otra pestaña, en «Configuración → Llave de IA (clave propia)».',
    ],
  },
  {
    numero: 3,
    clave: 'CREAR_EN_AI_STUDIO',
    titulo: 'Crear la clave en Google AI Studio',
    enlace: URL_OFICIAL_CLAVES_AI_STUDIO,
    detalle: [
      `Abre ${URL_OFICIAL_CLAVES_AI_STUDIO} e inicia sesión con tu cuenta de Google.`,
      'Pulsa «Crear clave de API» (Create API key). Si te pide un proyecto, elige el que te proponga o crea uno nuevo con cualquier nombre.',
      `Se mostrará la clave: una cadena de ${LONGITUD_LLAVE_GEMINI} caracteres que empieza por «${PREFIJO_LLAVE_GEMINI}». Cópiala con el botón de copiar.`,
      'Si Google te ofrece restringir la clave, puedes hacerlo más adelante; para este tutorial basta con crearla.',
    ],
  },
  {
    numero: 4,
    clave: 'PEGAR_EN_ERP',
    titulo: 'Pegar la clave en el Gestor de Inmuebles',
    detalle: [
      'Vuelve a la pestaña del Gestor: «Configuración → Llave de IA (clave propia)».',
      'Pega la clave en el campo «Tu clave de API». El campo la oculta mientras escribes, como una contraseña.',
      'El Gestor comprueba la forma de la clave antes de enviarla (longitud, prefijo, caracteres) y te avisa si falta algo.',
      'Pulsa «Guardar clave». Se envía una sola vez, cifrada por HTTPS, y queda guardada cifrada en el servidor.',
    ],
  },
  {
    numero: 5,
    clave: 'CONFIRMACION',
    titulo: 'Confirmación',
    detalle: [
      'Verás el estado «REGISTRADA», la fecha de alta y los 4 últimos caracteres de la clave (por ejemplo «…a1b2») para que puedas reconocerla.',
      'A partir de ahora, tus operaciones de IA se ejecutan con tu clave. Si alguna función aún no está habilitada para tu perfil, el Gestor te lo indicará.',
    ],
  },
  {
    numero: 6,
    clave: 'VERIFICACION',
    titulo: 'Comprobar la clave con el proveedor (si está disponible)',
    detalle: [
      'Si el botón «Comprobar con el proveedor» está activo, púlsalo: el servidor hace una consulta mínima a Google para confirmar que la clave es válida.',
      'Si el entorno tiene esta comprobación desactivada, no te preocupes: la primera operación de IA que hagas servirá de comprobación.',
    ],
  },
  {
    numero: 7,
    clave: 'SUSTITUIR_O_REVOCAR',
    titulo: 'Sustituir o revocar la clave',
    detalle: [
      'Para cambiar de clave, pega la nueva y pulsa «Guardar clave»: la anterior deja de usarse al instante.',
      'Para dejar de usar la IA con tu cuenta, pulsa «Revocar»: el Gestor borra la clave cifrada y conserva sólo un apunte de que existió.',
      'Si sospechas que alguien ha visto tu clave, revócala también en Google AI Studio (botón de eliminar junto a la clave).',
    ],
  },
]);

export const TUTORIAL_LLAVE_USUARIO_IA: TutorialLlaveUsuarioIA = Object.freeze({
  titulo: 'Activar la IA con tu propia clave de Google',
  subtitulo: 'Tutorial paso a paso del Gestor de Inmuebles (alta guiada)',
  version: VERSION_TUTORIAL_LLAVE,
  introduccion: [
    'Las funciones de inteligencia artificial del Gestor de Inmuebles (análisis de documentos, redacción de cláusulas, asistente de incidencias, etc.) funcionan con la cuenta de Google de cada usuario.',
    'Para usarlas necesitas crear una «clave de API» en Google AI Studio y pegarla una sola vez en el Gestor. El Gestor la guarda cifrada, nunca la muestra y la usa únicamente para tus propias operaciones.',
    'Este tutorial te acompaña en los pasos. Tiempo estimado: 5 minutos.',
  ],
  pasos: PASOS_ALTA_GUIADA,
  avisosSeguridad: [
    'Nunca escribas la clave en este papel ni en ningún documento: si necesitas recordarla, vuelve a Google AI Studio.',
    'El Gestor nunca te pedirá la clave por correo, teléfono ni mensajería.',
    'Si pierdes el acceso a tu cuenta de Google, revoca la clave en el Gestor y crea una nueva cuando recuperes la cuenta.',
  ],
  preguntasFrecuentes: [
    {
      pregunta: '¿Tiene coste crear la clave?',
      respuesta: 'Crearla no cuesta nada. Google aplica a cada cuenta sus propios límites gratuitos y, si los superas y has activado facturación en tu cuenta, el coste se carga en tu cuenta de Google. El Gestor no interviene en ese cobro.',
    },
    {
      pregunta: '¿Puede el administrador del Gestor ver mi clave?',
      respuesta: 'No. Se guarda cifrada con una clave maestra del servidor y el sistema sólo la descifra en el momento de ejecutar una operación tuya. El panel de administración muestra consumo y límites, nunca claves.',
    },
    {
      pregunta: '¿Qué pasa si no registro ninguna clave?',
      respuesta: 'Las funciones de IA responderán con su modo básico (sin inteligencia artificial) o te pedirán la clave, según cómo esté configurado el entorno. Nada deja de funcionar en el resto del Gestor.',
    },
    {
      pregunta: 'Me dice que la clave tiene un formato incorrecto.',
      respuesta: `Comprueba que la has copiado entera (${LONGITUD_LLAVE_GEMINI} caracteres), que empieza por «${PREFIJO_LLAVE_GEMINI}» y que no lleva espacios ni comillas al principio o al final.`,
    },
  ],
  camposParaAnotar: [
    'Fecha en la que di de alta la clave: ____ / ____ / ________',
    'Cuenta de Google utilizada (sólo el nombre, no la clave): ______________________________',
  ],
});

/** Resumen para `GET /api/ia/llave` (pasos sin el detalle largo, para no engordar la respuesta). */
export function resumenAltaGuiadaLlave(): Array<{ numero: number; clave: ClavePasoAltaGuiada; titulo: string; enlace?: string }> {
  return TUTORIAL_LLAVE_USUARIO_IA.pasos.map((paso) => ({
    numero: paso.numero,
    clave: paso.clave,
    titulo: paso.titulo,
    ...(paso.enlace ? { enlace: paso.enlace } : {}),
  }));
}
