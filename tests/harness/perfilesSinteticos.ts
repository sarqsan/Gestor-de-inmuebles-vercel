/** Completa fixtures D2/D3 previos con la ficha canónica requerida por la
 * verificación de UID del espejo. Solo se invoca desde las pruebas: NUNCA
 * transforma datos de producción ni altera el evaluador de Security Rules.
 */
export function completarPerfilesSinteticos(db: Record<string,Record<string,unknown>>): void {
  for (const [ruta, espejo] of Object.entries(db)) {
    if (!ruta.startsWith('usuarios_auth/')) continue;
    const uid=ruta.slice('usuarios_auth/'.length);
    const id=typeof espejo.usuarioId === 'string' ? espejo.usuarioId : uid;
    if (!('usuarioId' in espejo)) espejo.usuarioId=id;
    const perfil=db[`usuarios/${id}`];
    if (!perfil) db[`usuarios/${id}`]={id,authUid:uid,estado:espejo.estado,tipoPerfil:espejo.tipoPerfil};
    else {
      if (!('authUid' in perfil)) perfil.authUid=uid;
      if (!('estado' in perfil)) perfil.estado=espejo.estado;
      if (!('tipoPerfil' in perfil)) perfil.tipoPerfil=espejo.tipoPerfil;
    }
  }
}
