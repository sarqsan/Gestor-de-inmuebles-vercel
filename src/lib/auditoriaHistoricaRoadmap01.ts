/** Auditoría read-only de una instantánea administrativa completa. Nunca escribe Firestore.
 * Usa el proyector D3 CANÓNICO vía auditarProyeccionCarteras: no resuelve permisos.
 * La procedencia/completitud del export debe verificarla quien lo obtiene.
 */
import { auditarProyeccionCarteras } from './auditoriaProyeccionCarteras';
import type { GestionCartera } from './gestionesCartera';
import type { EnlaceRegistro, UsuarioApp, Propietario, Inmueble } from '../types';

export interface InstantaneaRoadmap01 {
  usuarios: UsuarioApp[];
  propietarios: Propietario[];
  usuarios_auth: Array<{ uid: string; usuarioId: string; propietarioId?: string; estado?: string;
    tipoPerfil?: string; email?: string; carterasL?: string[]; carterasE?: string[] }>;
  gestiones_cartera: GestionCartera[];
  inmuebles: Inmueble[];
  enlaces_registro: EnlaceRegistro[];
}
export type NivelHallazgo = 'CORRECTO' | 'INCOMPLETO' | 'INCONSISTENTE' | 'SOBREAUTORIZADO' | 'DECISION_HUMANA';
export interface HallazgoHistorico { nivel: NivelHallazgo; codigo: string; referencia: string }
export function auditarInstantaneaRoadmap01(s: InstantaneaRoadmap01, ahoraIso: string): HallazgoHistorico[] {
  const nombres = ['usuarios','propietarios','usuarios_auth','gestiones_cartera','inmuebles','enlaces_registro'] as const;
  for (const nombre of nombres) if (!Array.isArray(s[nombre])) throw new Error(`Instantánea incompleta: ${nombre} obligatorio`);
  if (!Number.isFinite(Date.parse(ahoraIso))) throw new Error('Fecha --as-of inválida');
  const out: HallazgoHistorico[] = [];
  const add = (nivel:NivelHallazgo,codigo:string,referencia:string) => out.push({nivel,codigo,referencia});
  const user = new Map(s.usuarios.map(x=>[x.id,x]));
  const owner = new Map(s.propietarios.map(x=>[x.id,x]));
  const house = new Map(s.inmuebles.map(x=>[x.id,x]));
  for (const [nombre, field] of nombres.map((n) => [n, n === 'usuarios_auth' ? 'uid' : 'id'] as const)) {
    const ids = new Set<string>();
    for (const item of s[nombre] as unknown as Record<string,unknown>[]) {
      const id = item[field];
      if (typeof id !== 'string' || !id) { add('INCONSISTENTE','ID_AUSENTE',nombre); continue; }
      if (ids.has(id)) add('INCONSISTENTE','ID_DUPLICADO',`${nombre}/${id}`);
      ids.add(id);
    }
  }
  const mirrors = new Map(s.usuarios_auth.map(x=>[x.uid,x]));
  for (const u of s.usuarios) {
    if (u.propietarioId && !owner.has(u.propietarioId)) add('INCONSISTENTE','PROPIETARIO_INEXISTENTE',`usuarios/${u.id}`);
    if (!u.authUid) { if (u.estado === 'ACTIVO') add('INCOMPLETO','AUTH_AUSENTE',`usuarios/${u.id}`); continue; }
    const m = mirrors.get(u.authUid);
    if (!m) { add('INCOMPLETO','ESPEJO_AUSENTE',`usuarios/${u.id}`); continue; }
    if (m.usuarioId !== u.id || m.propietarioId !== (u.propietarioId || '') ||
        m.estado !== u.estado || m.email !== u.email || m.tipoPerfil !== u.tipoPerfil)
      add('INCONSISTENTE','ESPEJO_IDENTIDAD_D2',`usuarios_auth/${u.authUid}`);
    const gestiones = s.gestiones_cartera.filter(g=>g.gestorUsuarioId === u.id);
    if (!Array.isArray(m.carterasL) || !Array.isArray(m.carterasE)) {
      add('INCOMPLETO','CARTERAS_NO_VERIFICABLES',`usuarios_auth/${u.authUid}`); continue;
    }
    const r = auditarProyeccionCarteras(u.id,gestiones,{carterasL:m.carterasL,carterasE:m.carterasE},new Set(owner.keys()));
    if (!r.hallazgos.length) add('CORRECTO','ESPEJO_D3',`usuarios_auth/${u.authUid}`);
    for (const h of r.hallazgos) add(
      h.codigo === 'ESPEJO_SOBREAUTORIZADO' ? 'SOBREAUTORIZADO' :
      h.codigo === 'ESPEJO_DESACTUALIZADO' ? 'INCOMPLETO' : 'DECISION_HUMANA',
      h.codigo,`usuarios_auth/${u.authUid}:${h.referencia}`);
  }
  for (const m of s.usuarios_auth) {
    if (!user.has(m.usuarioId) || user.get(m.usuarioId)?.authUid !== m.uid)
      add('INCONSISTENTE','ESPEJO_HUERFANO',`usuarios_auth/${m.uid}`);
  }
  for (const g of s.gestiones_cartera) {
    if (!user.has(g.gestorUsuarioId)) add('DECISION_HUMANA','GESTOR_AUSENTE',`gestiones_cartera/${g.id}`);
    if (!owner.has(g.propietarioId)) add('DECISION_HUMANA','PROPIETARIO_GESTION_AUSENTE',`gestiones_cartera/${g.id}`);
    for (const id of g.inmuebleIds || []) {
      const inmueble = house.get(id);
      if (!inmueble || inmueble.propietarioId !== g.propietarioId)
        add('DECISION_HUMANA','INMUEBLE_PARCIAL_INCOHERENTE',`gestiones_cartera/${g.id}:${id}`);
    }
  }
  for (const e of s.enlaces_registro) {
    if (!e.usuarioIdVinculado) continue; // enlaces genéricos, sin inferir persona
    const u = user.get(e.usuarioIdVinculado);
    if (!u || !owner.has(e.propietarioIdVinculado || '') || u.propietarioId !== e.propietarioIdVinculado ||
        u.email !== e.emailInvitado) add('INCONSISTENTE','INVITACION_DESTINO',`enlaces_registro/${e.id}`);
    if (e.estadoInvitacion === 'PENDIENTE' && e.activo) {
      if (!Number.isFinite(e.fechaCaducidadMs)) add('DECISION_HUMANA','INVITACION_LEGACY_REEMITIR',`enlaces_registro/${e.id}`);
      else if (e.fechaCaducidadMs! <= Date.parse(ahoraIso)) add('INCOMPLETO','INVITACION_EXPIRADA',`enlaces_registro/${e.id}`);
      else if (e.usosActuales === 0 && u?.estado === 'PENDIENTE' && !u.authUid)
        add('CORRECTO','INVITACION_PENDIENTE',`enlaces_registro/${e.id}`);
      else add('INCONSISTENTE','INVITACION_ESTADO',`enlaces_registro/${e.id}`);
    }
    if (e.estadoInvitacion === 'ACEPTADA' && (e.usosActuales !== 1 || u?.estado !== 'ACTIVO' || u.enlaceRegistroId !== e.id))
      add('INCONSISTENTE','INVITACION_CONSUMO',`enlaces_registro/${e.id}`);
  }
  return out.sort((a,b)=>a.referencia.localeCompare(b.referencia) || a.codigo.localeCompare(b.codigo));
}
