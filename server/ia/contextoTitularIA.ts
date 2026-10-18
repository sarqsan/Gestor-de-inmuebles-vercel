/**
 * IA · contexto y autorización por titular contractual.
 *
 * El UID autenticado es el actor, no el pagador. Este servicio rehidrata el
 * contrato desde el servidor, comprueba el ámbito del actor y resuelve de forma
 * unívoca la cuenta activa del titular contractual. No acepta `propietarioId`,
 * UID del pagador, llave, coste ni cuota desde la petición.
 *
 * `configuracionIA.ts` conecta el resolver al núcleo y extrae un localizador de
 * contrato permitido por operación. Si una ruta/petición no proporciona ese
 * localizador, el núcleo falla cerrado antes de leer llave, reservar cuota o
 * crear un proveedor. Las pruebas usan Firestore en memoria; no acreditan Rules,
 * persistencia, IAM ni consumo real.
 */

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/;

export interface PuertoContextoTitularIA {
  leerDocumento(ruta: string): Promise<{ id: string; datos: Record<string, unknown> } | null>;
  consultarIgualdadesOrden(
    coleccion: string,
    consulta: { igualdades?: Array<[campo: string, valor: string]>; limite: number },
  ): Promise<Array<{ id: string; datos: Record<string, unknown> }>>;
}

export type ResultadoContextoTitularIA =
  | {
      estado: 'RESUELTO';
      contratoId: string;
      inmuebleId: string;
      propietarioId: string;
      propietarioUid: string;
      actorTipo: 'PROPIETARIO' | 'GESTOR' | 'INQUILINO';
    }
  | {
      estado: 'RECHAZADO';
      codigo: 'PETICION_INVALIDA' | 'PERFIL_NO_VALIDO' | 'CONTRATO_NO_AUTORIZADO' | 'TITULAR_NO_RESUELTO' | 'FUENTE_NO_DISPONIBLE';
    };

export interface EntradaResolverContextoTitularIA {
  uidActor: string;
  contratoId: string;
  permisoMinimo?: 'LECTURA' | 'LECTURA_ESCRITURA';
}

export interface ServicioContextoTitularIA {
  resolver(entrada: EntradaResolverContextoTitularIA): Promise<ResultadoContextoTitularIA>;
}

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
}

function texto(valor: unknown, max = 180): string | null {
  if (typeof valor !== 'string') return null;
  const resultado = valor.trim();
  return resultado.length > 0 && resultado.length <= max ? resultado : null;
}

function idValido(valor: unknown): valor is string {
  return typeof valor === 'string' && ID_RE.test(valor) && valor !== '.' && valor !== '..';
}

function listaTextos(valor: unknown): string[] {
  return Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function idsAmbitoExplicitos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || !valor.every((item) => idValido(item))) return null;
  return valor as string[];
}

interface ActorIA {
  uid: string;
  usuarioId: string;
  tipoPerfil: string;
  espejo: Record<string, unknown>;
  ficha: Record<string, unknown>;
}

export function crearServicioContextoTitularIA(puerto: PuertoContextoTitularIA): ServicioContextoTitularIA {
  async function resolverActor(uid: string): Promise<ActorIA | null> {
    const espejoDoc = await puerto.leerDocumento(`usuarios_auth/${encodeURIComponent(uid)}`);
    const espejo = espejoDoc?.datos;
    const usuarioId = texto(espejo?.usuarioId);
    if (!espejo || espejo.estado !== 'ACTIVO' || !idValido(usuarioId)
      || (typeof espejo.authUid === 'string' && espejo.authUid !== uid)) return null;

    const fichaDoc = await puerto.leerDocumento(`usuarios/${encodeURIComponent(usuarioId)}`);
    const ficha = fichaDoc?.datos;
    if (!ficha || ficha.authUid !== uid || ficha.estado !== 'ACTIVO'
      || ficha.tipoPerfil !== espejo.tipoPerfil) return null;
    return { uid, usuarioId, tipoPerfil: String(ficha.tipoPerfil), espejo, ficha };
  }

  async function resolverUidTitular(propietarioId: string): Promise<string | null> {
    const usuarios = await puerto.consultarIgualdadesOrden('usuarios', {
      igualdades: [['propietarioId', propietarioId], ['tipoPerfil', 'PROPIETARIO'], ['estado', 'ACTIVO']],
      limite: 2,
    });
    // Cero o más de una cuenta activa para el mismo titular: no adivinar.
    if (usuarios.length !== 1) return null;
    const usuario = usuarios[0];
    const uid = texto(usuario.datos.authUid, 128);
    if (!uid || usuario.datos.propietarioId !== propietarioId
      || usuario.datos.tipoPerfil !== 'PROPIETARIO' || usuario.datos.estado !== 'ACTIVO') return null;

    const espejoDoc = await puerto.leerDocumento(`usuarios_auth/${encodeURIComponent(uid)}`);
    const espejo = espejoDoc?.datos;
    if (!espejo || espejo.estado !== 'ACTIVO' || espejo.authUid !== uid
      || espejo.usuarioId !== usuario.id || espejo.tipoPerfil !== 'PROPIETARIO'
      || espejo.propietarioId !== propietarioId) return null;
    return uid;
  }

  async function autorizadoComoGestor(
    actor: ActorIA,
    propietarioId: string,
    inmuebleId: string,
    permisoMinimo: 'LECTURA' | 'LECTURA_ESCRITURA',
  ): Promise<boolean> {
    const relaciones = objeto(actor.espejo.gestionesPorPropietario);
    const relacionId = relaciones[propietarioId];
    if (!idValido(relacionId)) return false;
    const documento = await puerto.leerDocumento(`gestiones_cartera/${encodeURIComponent(relacionId)}`);
    if (!documento) return false;
    const gestion = documento.datos;
    const permisosLectura = permisoMinimo === 'LECTURA'
      ? gestion.permiso === 'LECTURA' || gestion.permiso === 'LECTURA_ESCRITURA'
      : gestion.permiso === 'LECTURA_ESCRITURA' && gestion.responsableActual === 'GESTOR';
    const inmuebles = idsAmbitoExplicitos(gestion.inmuebleIds);
    return gestion.propietarioId === propietarioId
      && gestion.gestorUsuarioId === actor.usuarioId
      && gestion.estado === 'ACTIVA'
      && gestion.resolucionInvitacion === 'ACEPTADA'
      && permisosLectura
      // [] explícito es cartera completa según onboarding; undefined/corrupto no lo es.
      && inmuebles !== null
      && (inmuebles.length === 0 || inmuebles.includes(inmuebleId));
  }

  return {
    async resolver(entrada) {
      const uid = texto(entrada.uidActor, 128);
      if (!uid || /[\u0000-\u001f/]/.test(uid) || !idValido(entrada.contratoId)) {
        return { estado: 'RECHAZADO', codigo: 'PETICION_INVALIDA' };
      }
      try {
        const actor = await resolverActor(uid);
        if (!actor) return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_VALIDO' };

        const contrato = await puerto.leerDocumento(`contratos_formalizacion/${encodeURIComponent(entrada.contratoId)}`);
        if (!contrato || (typeof contrato.datos.id === 'string' && contrato.datos.id !== entrada.contratoId)) {
          return { estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' };
        }
        const propietarioId = texto(contrato.datos.propietarioId);
        const inmuebleId = texto(contrato.datos.inmuebleId);
        if (!propietarioId || !inmuebleId) return { estado: 'RECHAZADO', codigo: 'TITULAR_NO_RESUELTO' };

        let actorTipo: 'PROPIETARIO' | 'GESTOR' | 'INQUILINO' | null = null;
        if (actor.tipoPerfil === 'PROPIETARIO' && actor.ficha.propietarioId === propietarioId) {
          actorTipo = 'PROPIETARIO';
        } else if (actor.tipoPerfil === 'INQUILINO'
          && listaTextos(actor.ficha.contratoIds).includes(entrada.contratoId)) {
          actorTipo = 'INQUILINO';
        } else if ((actor.tipoPerfil === 'ADMINISTRADOR' || actor.tipoPerfil === 'PROFESIONAL')
          && await autorizadoComoGestor(actor, propietarioId, inmuebleId, entrada.permisoMinimo ?? 'LECTURA')) {
          actorTipo = 'GESTOR';
        }
        if (!actorTipo) return { estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' };

        const propietarioUid = await resolverUidTitular(propietarioId);
        if (!propietarioUid) return { estado: 'RECHAZADO', codigo: 'TITULAR_NO_RESUELTO' };
        return { estado: 'RESUELTO', contratoId: entrada.contratoId, inmuebleId, propietarioId, propietarioUid, actorTipo };
      } catch {
        return { estado: 'RECHAZADO', codigo: 'FUENTE_NO_DISPONIBLE' };
      }
    },
  };
}
