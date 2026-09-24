/**
 * REGISTRO AUTÓNOMO — Lógica pura de los formularios de alta sin invitación.
 * Sin dependencias de Firebase ni del DOM: validación previa en la interfaz,
 * construcción de parámetros, mapeo de errores a mensajes seguros y
 * orquestación del alta. La autoridad de seguridad sigue siendo
 * `registerAutonomo()` + las reglas de Firestore.
 */
import type {
  RegisterAutonomoParams,
  RegisterAutonomoProfesionalParams,
  RegisterAutonomoPropietarioParams,
} from './authService';
import type { TipoProfesional, TipoPropietario, UsuarioApp } from '../types';

export interface ValoresRegistroPropietario {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  nifCif: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  provincia: string;
  tipoPropietario: TipoPropietario;
  password: string;
  confirmPassword: string;
}

export interface ZonaAdicionalForm {
  provincia: string;
  municipio: string;
}

export interface ValoresRegistroProfesional {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  nombreComercial: string;
  cifNif: string;
  tipo: TipoProfesional;
  especialidades: string[];
  provincia: string;
  municipio: string;
  zonasAdicionales: ZonaAdicionalForm[];
  password: string;
  confirmPassword: string;
}

/** Email con el mismo criterio que el resto del sistema. */
export function esEmailRegistroValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function falta(valor: string): boolean {
  return valor.trim().length === 0;
}

function validarEmail(email: string): string | null {
  if (falta(email)) return 'Por favor indica tu correo electrónico.';
  if (!esEmailRegistroValido(email)) return 'El correo electrónico no es válido.';
  return null;
}

function validarPassword(password: string, confirmPassword: string): string | null {
  if (!password || password.length < 6) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (password !== confirmPassword) return 'Las contraseñas no coinciden.';
  return null;
}

/** Valida el formulario de propietario en orden visual. Primer error o null. */
export function validarFormularioPropietario(v: ValoresRegistroPropietario): string | null {
  if (falta(v.nombre)) return 'Por favor indica tu nombre.';
  if (falta(v.apellidos)) return 'Por favor indica tus apellidos.';
  const emailErr = validarEmail(v.email);
  if (emailErr) return emailErr;
  if (falta(v.telefono)) return 'Por favor indica tu teléfono.';
  if (falta(v.nifCif)) return 'Por favor indica tu NIF/CIF.';
  if (falta(v.direccion)) return 'Por favor indica tu dirección fiscal.';
  if (falta(v.ciudad)) return 'Por favor indica tu ciudad.';
  if (falta(v.codigoPostal)) return 'Por favor indica tu código postal.';
  return validarPassword(v.password, v.confirmPassword);
}

/**
 * Valida el formulario de profesional en orden visual. Las especialidades
 * solo pueden venir del catálogo (la UI no permite escribirlas a mano).
 */
export function validarFormularioProfesional(
  v: ValoresRegistroProfesional,
  catalogoEspecialidades: string[]
): string | null {
  if (falta(v.nombre)) return 'Por favor indica tu nombre.';
  const emailErr = validarEmail(v.email);
  if (emailErr) return emailErr;
  if (falta(v.nombreComercial)) return 'Por favor indica tu nombre comercial.';
  if (v.especialidades.length === 0) return 'Selecciona al menos una especialidad del catálogo.';
  if (catalogoEspecialidades.length > 0) {
    const fuera = v.especialidades.find((e) => !catalogoEspecialidades.includes(e));
    if (fuera) return 'Hay una especialidad no válida. Selecciónala del catálogo.';
  }
  if (falta(v.provincia)) return 'Por favor indica tu provincia principal.';
  for (const z of v.zonasAdicionales) {
    if (falta(z.provincia)) return 'Cada zona adicional necesita su provincia.';
  }
  return validarPassword(v.password, v.confirmPassword);
}

const MENSAJE_GENERICO_REGISTRO =
  'No se pudo completar el registro. Revisa los datos e inténtalo de nuevo. Si el problema continúa, contacta con soporte.';
const MENSAJE_ALTA_INCOMPLETA =
  'Tu cuenta de acceso se creó pero no pudimos completar tu perfil. Contacta con soporte indicando tu correo electrónico.';

/**
 * Convierte errores del servicio en mensajes seguros para el usuario.
 * Nunca expone stack traces, códigos internos de Firestore/Auth ni IDs.
 * Los mensajes amistosos del servicio (validación, email duplicado) pasan tal cual.
 */
export function mapearErrorRegistroAutonomo(err: unknown): string {
  const msg =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message || '')
      : '';
  if (!msg) return MENSAJE_GENERICO_REGISTRO;
  // Fallo parcial (§7): versión sin detalle técnico ni IDs internos.
  if (msg.includes('Alta incompleta')) return MENSAJE_ALTA_INCOMPLETA;
  // Mensajes amistosos del servicio: validación previa y email duplicado.
  if (
    /ya tiene una cuenta|es obligatorio|no es válido|al menos 6 caracteres|al menos una especialidad|solo admite|roles ni permisos|no disponible|habilitado|no se pudo crear la cuenta/i.test(
      msg
    )
  ) {
    return msg;
  }
  return MENSAJE_GENERICO_REGISTRO;
}

export type EntradaRegistroAutonomo =
  | { tipo: 'propietario'; valores: ValoresRegistroPropietario }
  | {
      tipo: 'profesional';
      valores: ValoresRegistroProfesional;
      catalogoEspecialidades: string[];
    };

export interface DepsRegistroAutonomo {
  registerAutonomo: (p: RegisterAutonomoParams) => Promise<{ usuarioApp: UsuarioApp }>;
}

/**
 * Orquesta el alta: valida el formulario, construye los parámetros exactos
 * de `registerAutonomo()` y devuelve el perfil para entrar en el portal.
 * Solo para altas sin invitación: estos dos tipos nunca reutilizan fichas previas.
 */
export async function enviarRegistroAutonomo(
  entrada: EntradaRegistroAutonomo,
  deps: DepsRegistroAutonomo
): Promise<UsuarioApp> {
  let params: RegisterAutonomoParams;

  if (entrada.tipo === 'propietario') {
    const v = entrada.valores;
    const error = validarFormularioPropietario(v);
    if (error) throw new Error(error);
    const p: RegisterAutonomoPropietarioParams = {
      tipoPerfil: 'PROPIETARIO',
      email: v.email.trim(),
      password: v.password,
      nombre: v.nombre.trim(),
      apellidos: v.apellidos.trim(),
      telefono: v.telefono.trim(),
      nifCif: v.nifCif.trim(),
      direccion: v.direccion.trim(),
      ciudad: v.ciudad.trim(),
      codigoPostal: v.codigoPostal.trim(),
      tipoPropietario: v.tipoPropietario,
    };
    if (!falta(v.provincia)) p.provincia = v.provincia.trim();
    params = p;
  } else {
    const v = entrada.valores;
    const error = validarFormularioProfesional(v, entrada.catalogoEspecialidades);
    if (error) throw new Error(error);
    const p: RegisterAutonomoProfesionalParams = {
      tipoPerfil: 'PROFESIONAL',
      email: v.email.trim(),
      password: v.password,
      nombre: v.nombre.trim(),
      ...(falta(v.apellidos) ? {} : { apellidos: v.apellidos.trim() }),
      ...(falta(v.telefono) ? {} : { telefono: v.telefono.trim() }),
      nombreComercial: v.nombreComercial.trim(),
      ...(falta(v.cifNif) ? {} : { cifNif: v.cifNif.trim() }),
      tipo: v.tipo,
      especialidades: [...v.especialidades],
      provincia: v.provincia.trim(),
      ...(falta(v.municipio) ? {} : { municipio: v.municipio.trim() }),
      ...(v.zonasAdicionales.length === 0
        ? {}
        : {
            zonasAdicionales: v.zonasAdicionales.map((z) => ({
              provincia: z.provincia.trim(),
              ...(falta(z.municipio) ? {} : { municipio: z.municipio.trim() }),
            })),
          }),
    };
    params = p;
  }

  try {
    const { usuarioApp } = await deps.registerAutonomo(params);
    return usuarioApp;
  } catch (err) {
    throw new Error(mapearErrorRegistroAutonomo(err));
  }
}
