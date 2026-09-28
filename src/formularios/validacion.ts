/**
 * BLOQUE 10 · UX-4 — VALIDACIÓN DE FORMULARIOS.
 *
 * Reglas reales de la aplicación (no se inventan reglas de negocio), con mensajes
 * claros y en el campo afectado:
 *  · `obligatorio` — «La dirección es obligatoria.»
 *  · `importe`     — «Introduce un importe mayor que 0.»
 *  · `entero`      — «Introduce un número entero.»
 *  · `iban`        — «Introduce un IBAN válido (ES…).»
 *  · `email`       — «Introduce un correo electrónico válido.»
 *  · `nif` / `nifCif` — «Introduce un NIF/CIF válido.»
 *  · `longitudMaxima`, `longitudMinima`
 *  · `fecha`       — «Introduce una fecha válida.»
 *  · `personalizada` — regla propia del formulario, con su mensaje.
 *
 * La validación es **declarativa y pura**: los formularios declaran campos y reglas,
 * y obtienen un mapa `campo → mensaje`. El error de persistencia NO pasa por aquí:
 * va al canal de avisos (UX-3) para que nunca se confunda con un error de formulario (§8).
 */

export interface ReglaValidacion {
  /** Marca un mensaje propio para la regla. */
  mensaje?: string;
}

export interface CampoValidable {
  /** Etiqueta legible del campo (para el resumen de errores). */
  etiqueta: string;
  /** Mensaje propio para la regla de obligatoriedad (si se quiere uno específico). */
  mensaje?: string;
  obligatorio?: boolean;
  importe?: boolean;
  entero?: boolean;
  iban?: boolean;
  email?: boolean;
  nif?: boolean;
  nifCif?: boolean;
  fecha?: boolean;
  longitudMinima?: number;
  longitudMaxima?: number;
  /** Reglas adicionales: devuelven un mensaje si el valor no es válido. */
  personalizadas?: Array<(valor: string) => string | undefined>;
}

export type ErroresFormulario = Record<string, string>;

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Formato de fecha del ERP (`AAAA-MM-DD`) y existencia real de esa fecha. */
function esFechaValida(texto: string): boolean {
  if (!RE_FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/** Normaliza el valor de un IBAN (sin espacios, mayúsculas). */
export function normalizarIban(valor: string): string {
  return (valor || '').replace(/\s+/g, '').toUpperCase();
}

/** Valida un IBAN por estructura y dígito de control (ISO 13616). */
export function esIbanValido(valor: string): boolean {
  const iban = normalizarIban(valor);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const reorganizado = iban.slice(4) + iban.slice(0, 4);
  const numeros = reorganizado
    .split('')
    .map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55)))
    .join('');
  let resto = 0;
  for (const digito of numeros) resto = (resto * 10 + Number(digito)) % 97;
  return resto === 1;
}

/** Valida NIF/NIE/CIF español por estructura (sin consultar el censo). */
export function esNifValido(valor: string): boolean {
  const nif = (valor || '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{8}[A-Z]$/.test(nif)) return true; // DNI
  if (/^[XYZ]\d{7}[A-Z]$/.test(nif)) return true; // NIE
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(nif)) return true; // CIF
  return false;
}

export interface OpcionesValidacion {
  /** El campo no es un dato de persona física: el NIF puede quedar vacío. */
  mensajeObligatorio?: (etiqueta: string) => string;
}

export function mensajeObligatorioPorDefecto(etiqueta: string): string {
  return `«${etiqueta}» es obligatorio.`;
}

/** Valida un valor contra las reglas del campo. Devuelve el mensaje o `undefined`. */
export function validarCampo(valor: string, campo: CampoValidable, opciones: OpcionesValidacion = {}): string | undefined {
  const texto = (valor ?? '').toString();
  const limpio = texto.trim();
  const etiqueta = campo.etiqueta;
  const obligatorio = opciones.mensajeObligatorio ?? mensajeObligatorioPorDefecto;

  if (campo.obligatorio && !limpio) return campo.mensaje ? campo.mensaje : obligatorio(etiqueta);
  if (!limpio) return undefined; // Campo opcional vacío: el resto de reglas no aplican.

  if (campo.longitudMinima !== undefined && limpio.length < campo.longitudMinima) {
    return `«${etiqueta}» debe tener al menos ${campo.longitudMinima} caracteres.`;
  }
  if (campo.longitudMaxima !== undefined && limpio.length > campo.longitudMaxima) {
    return `«${etiqueta}» no puede superar ${campo.longitudMaxima} caracteres.`;
  }
  if (campo.importe) {
    const numero = Number(limpio.replace(',', '.'));
    if (!Number.isFinite(numero)) return `Introduce un importe válido en «${etiqueta}».`;
    if (numero <= 0) return `Introduce un importe mayor que 0 en «${etiqueta}».`;
  }
  if (campo.entero) {
    if (!/^-?\d+$/.test(limpio)) return `«${etiqueta}» debe ser un número entero.`;
  }
  if (campo.iban && !esIbanValido(limpio)) return `Introduce un IBAN válido en «${etiqueta}».`;
  if (campo.email && !RE_EMAIL.test(limpio)) return `Introduce un correo electrónico válido en «${etiqueta}».`;
  if (campo.nif && !esNifValido(limpio)) return `Introduce un NIF/NIE válido en «${etiqueta}».`;
  if (campo.nifCif && !esNifValido(limpio)) return `Introduce un NIF/CIF válido en «${etiqueta}».`;
  if (campo.fecha && !esFechaValida(limpio)) return `Introduce una fecha válida en «${etiqueta}».`;

  for (const regla of campo.personalizadas ?? []) {
    const mensaje = regla(limpio);
    if (mensaje) return mensaje;
  }
  return undefined;
}

/** Valida un formulario completo: devuelve `campo → mensaje` (vacío = válido). */
export function validarFormulario(
  valores: Record<string, string>,
  campos: Record<string, CampoValidable>,
  opciones: OpcionesValidacion = {}
): ErroresFormulario {
  const errores: ErroresFormulario = {};
  for (const [nombre, campo] of Object.entries(campos)) {
    const mensaje = validarCampo(valores[nombre] ?? '', campo, opciones);
    if (mensaje) errores[nombre] = mensaje;
  }
  return errores;
}

export function hayErrores(errores: ErroresFormulario): boolean {
  return Object.keys(errores).length > 0;
}

/** Resumen legible para formularios largos (opcional, §9). */
export function resumenErrores(errores: ErroresFormulario): string {
  const mensajes = Object.values(errores);
  if (mensajes.length === 0) return '';
  if (mensajes.length === 1) return mensajes[0];
  return `Revisa ${mensajes.length} campos: ${mensajes.join(' ')}`;
}
