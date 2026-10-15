import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as google from '../server/titularidades/googleBackend';
import { crearDependenciasReales, buscarTitulares } from '../server/titularidades/backendTitulares';
import { resolverDestinoFirebase } from '../server/titularidades/configuracionFirebase';
import { crearDependenciasNucleoIA, resolverConfiguracionIA } from '../server/ia/configuracionIA';

const config = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
// Solo estructura para pruebas con métodos interceptados; nunca se firma ni se envía a Google.
const cuenta = { project_id: config.projectId, client_email: '', private_key: '' };
afterEach(() => vi.restoreAllMocks());

describe('destino coherente de los backends Firebase', () => {
  it('titulares lee y consulta en la base canónica, no en default', async () => {
    const destinos: unknown[] = [];
    vi.spyOn(google.ClienteFirestoreRest.prototype, 'leerDocumento').mockImplementation(async function () {
      destinos.push([this.projectId, this.baseDatosId]);
      return null;
    });
    vi.spyOn(google.ClienteFirestoreRest.prototype, 'consultarPrefijo').mockImplementation(async function () {
      destinos.push([this.projectId, this.baseDatosId]);
      return [];
    });
    const deps = crearDependenciasReales(cuenta, false, {});
    await deps.leerDocumento!('inmuebles/prueba');
    await deps.consultarPrefijo!('propietarios', 'nombre', 'pru', 10);
    expect(destinos).toEqual(Array(2).fill([config.projectId, config.firestoreDatabaseId]));
    expect(resolverDestinoFirebase({})).toEqual({ proyectoId: config.projectId, baseDatosId: config.firestoreDatabaseId });
  });

  it('el camino HTTP sin dependencias inyectadas utiliza el destino canónico', async () => {
    vi.spyOn(google, 'leerCuentaServicio').mockReturnValue(cuenta);
    const verificar = vi.spyOn(google, 'verificarIdToken').mockResolvedValue({ uid: 'uid-prueba' });
    const documentos: Record<string, Record<string, unknown>> = {
      'usuarios_auth/uid-prueba': { usuarioId: 'usuario-prueba', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
      'usuarios/usuario-prueba': { authUid: 'uid-prueba', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
      'inmuebles/inmueble-prueba': { propietarioId: 'propietario-prueba' },
    };
    const leer = vi.spyOn(google.ClienteFirestoreRest.prototype, 'leerDocumento').mockImplementation(async function (ruta) {
      expect(this.baseDatosId).toBe(config.firestoreDatabaseId);
      expect(this.projectId).toBe(config.projectId);
      return documentos[ruta] ? { id: ruta.split('/').at(-1)!, datos: documentos[ruta] } : null;
    });
    vi.spyOn(google.ClienteFirestoreRest.prototype, 'consultarPrefijo').mockResolvedValue([]);
    const resultado = await buscarTitulares({ idToken: 'token-solo-prueba', inmuebleId: 'inmueble-prueba', termino: 'prueba' }, { auditar: () => {} });
    expect(resultado).toMatchObject({ ok: true, codigo: 200 });
    expect(leer).toHaveBeenCalledTimes(3);
    expect(verificar).toHaveBeenCalledWith('token-solo-prueba', config.projectId);
  });

  it('los overrides son confirmatorios, nunca selectores de otro destino', async () => {
    const entorno = { FIREBASE_PROJECT_ID: ` ${config.projectId} `, FIRESTORE_DATABASE_ID: ` ${config.firestoreDatabaseId} ` };
    expect(resolverConfiguracionIA(entorno, cuenta)).toMatchObject({ proyectoId: config.projectId, baseDatosId: config.firestoreDatabaseId, modoRegistro: 'FIRESTORE' });
    const ajeno = { FIREBASE_PROJECT_ID: 'destino-prueba', FIRESTORE_DATABASE_ID: 'base-prueba' };
    expect(resolverConfiguracionIA(ajeno, { ...cuenta, project_id: 'destino-prueba' })).toMatchObject({ errorConfiguracion: 'FIREBASE_OVERRIDE_INCOMPATIBLE' });
    const leer = vi.spyOn(google.ClienteFirestoreRest.prototype, 'leerDocumento');
    const deps = crearDependenciasReales({ ...cuenta, project_id: 'destino-prueba' }, false, ajeno);
    expect(await deps.leerDocumento!('inmuebles/prueba')).toBeNull();
    expect(leer).not.toHaveBeenCalled();
  });

  it('titulares rechaza credencial ajena con 503, sin verificar ni leer ni consultar', async () => {
    const leer = vi.spyOn(google.ClienteFirestoreRest.prototype, 'leerDocumento');
    const consultar = vi.spyOn(google.ClienteFirestoreRest.prototype, 'consultarPrefijo');
    const verificar = vi.spyOn(google, 'verificarIdToken');
    const deps = crearDependenciasReales({ ...cuenta, project_id: 'otro-proyecto' }, false, {});
    expect(deps.leerCredencial!()).toBeNull();
    expect(await deps.leerDocumento!('inmuebles/prueba')).toBeNull();
    expect(await deps.consultarPrefijo!('propietarios', 'nombre', 'pru', 10)).toEqual([]);
    expect(await deps.verificarToken!('token-solo-prueba')).toBeNull();
    expect(await buscarTitulares({ inmuebleId: 'prueba', termino: 'prueba' }, { ...deps, auditar: () => {} })).toMatchObject({ codigo: 503 });
    expect(leer).not.toHaveBeenCalled();
    expect(consultar).not.toHaveBeenCalled();
    expect(verificar).not.toHaveBeenCalled();
  });

  it('IA aísla credencial ajena sin construir registro, proveedor ni verificador activo', async () => {
    expect(resolverConfiguracionIA({}, { ...cuenta, project_id: 'otro-proyecto' })).toMatchObject({
      modoRegistro: 'NO_CONFIGURADO', errorConfiguracion: 'FIREBASE_PROYECTO_INCOMPATIBLE',
    });
    expect(resolverConfiguracionIA({ FIREBASE_PROJECT_ID: 'otro-proyecto' }, cuenta)).toMatchObject({ errorConfiguracion: 'FIREBASE_OVERRIDE_INCOMPATIBLE' });
    const cargar = vi.spyOn(google, 'leerCuentaServicio').mockReturnValue({ ...cuenta, project_id: 'otro-proyecto' });
    const verificar = vi.spyOn(google, 'verificarIdToken');
    for (const entorno of [{ VERCEL: '1' }, { NODE_ENV: 'development' }]) {
      const deps = crearDependenciasNucleoIA(entorno);
      expect(deps.errorConfiguracion).toBe('FIREBASE_PROYECTO_INCOMPATIBLE');
      expect(deps.registro).toBeNull();
      expect(deps.crearClienteProveedor()).toBeNull();
      expect(await deps.verificarToken('token-solo-prueba')).toBeNull();
    }
    expect(verificar).not.toHaveBeenCalled();
    expect(cargar).toHaveBeenCalledTimes(2);
  });
});
