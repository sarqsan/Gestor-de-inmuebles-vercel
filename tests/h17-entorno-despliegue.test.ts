/**
 * H-17 · El servidor puede hablar con staging — y solo con staging cuando toca.
 *
 * Contexto: `resolverDestinoFirebase()` exigía literalmente
 * `projectId === 'gestor-inmuebles-produccion'`, así que **un staging era
 * imposible**: no había forma de arrancar el servidor contra otro proyecto. Eso
 * convertía «staging documentado» en una promesa sin código detrás, que es
 * exactamente la trampa que el informe de cierre denunciaba («staging
 * documentado» ≠ «staging operativo»).
 *
 * La guardia nueva NO abre la puerta: sustituye un literal por una lista cerrada
 * de dos destinos y exige que el proyecto declarado coincida con el entorno
 * declarado. Las propiedades que se fijan aquí son las que impiden que esto se
 * degrade a «cualquier proyecto vale»:
 *
 *   1. producción sigue funcionando sin declarar nada (compatibilidad);
 *   2. un proyecto ajeno sigue bloqueado;
 *   3. staging sin declararlo, bloqueado;
 *   4. producción declarada como staging, bloqueado;
 *   5. un valor de entorno desconocido no se interpreta como producción.
 */
import { describe, expect, it } from 'vitest';
import {
  PROYECTO_PRODUCCION,
  PROYECTO_STAGING,
  PROYECTOS_PERMITIDOS,
  PROYECTO_POR_ENTORNO,
  entornoDeclarado,
  resolverDestinoFirebase,
} from '../server/titularidades/configuracionFirebase';

const BASE_DATOS = 'ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51';

const config = (projectId: string, baseDatos: string | null = BASE_DATOS) =>
  () => JSON.stringify({
    projectId,
    firestoreDatabaseId: baseDatos ?? undefined,
    apiKey: 'no-es-un-secreto-de-prueba',
  });

const resolver = (projectId: string, env: NodeJS.ProcessEnv = {}) =>
  resolverDestinoFirebase(env, config(projectId));

describe('H-17 · destinos permitidos', () => {
  it('son exactamente dos, nombrados: producción y staging', () => {
    expect(PROYECTOS_PERMITIDOS).toEqual(['gestor-inmuebles-produccion', 'gestor-inmuebles-staging']);
    expect(PROYECTO_POR_ENTORNO.produccion).toBe(PROYECTO_PRODUCCION);
    expect(PROYECTO_POR_ENTORNO.staging).toBe(PROYECTO_STAGING);
  });

  it('un proyecto que no está en la lista sigue bloqueado (no se ha abierto nada)', () => {
    for (const ajeno of ['proyecto-ajeno', 'gestor-inmuebles', 'gestor-inmuebles-staging-2', '']) {
      expect(resolver(ajeno, { ENTORNO_DESPLIEGUE: 'staging' }).errorConfiguracion).toBeDefined();
    }
    expect(resolver('proyecto-ajeno').errorConfiguracion).toBe('FIREBASE_PROYECTO_INCOMPATIBLE');
  });
});

describe('H-17 · producción sigue igual que antes', () => {
  it('sin declarar entorno, producción funciona (compatibilidad con el despliegue actual)', () => {
    const r = resolver(PROYECTO_PRODUCCION, {});
    expect(r.errorConfiguracion).toBeUndefined();
    expect(r.proyectoId).toBe(PROYECTO_PRODUCCION);
    expect(r.baseDatosId).toBe(BASE_DATOS);
  });

  it('declararla explícitamente como producción también funciona', () => {
    for (const valor of ['produccion', 'production', 'prod', 'PRODUCCION', '  produccion  ']) {
      const r = resolver(PROYECTO_PRODUCCION, { ENTORNO_DESPLIEGUE: valor });
      expect(r.errorConfiguracion).toBeUndefined();
      expect(r.proyectoId).toBe(PROYECTO_PRODUCCION);
    }
  });
});

describe('H-17 · staging es posible, pero no por accidente', () => {
  it('staging declarado como staging arranca', () => {
    const r = resolver(PROYECTO_STAGING, { ENTORNO_DESPLIEGUE: 'staging' });
    expect(r.errorConfiguracion).toBeUndefined();
    expect(r.proyectoId).toBe(PROYECTO_STAGING);
  });

  it('staging SIN declararlo está bloqueado (un JSON de staging no arranca solo)', () => {
    expect(resolver(PROYECTO_STAGING, {}).errorConfiguracion).toBe('FIREBASE_ENTORNO_INCOMPATIBLE');
    expect(resolver(PROYECTO_STAGING).errorConfiguracion).toBe('FIREBASE_ENTORNO_INCOMPATIBLE');
  });

  it('staging declarado como producción está bloqueado (el caso peligroso)', () => {
    // Un `firebase-applet-config.json` de staging desplegado en el dominio real
    // hablaría con la base de pruebas creyendo servir a clientes.
    expect(resolver(PROYECTO_STAGING, { ENTORNO_DESPLIEGUE: 'produccion' }).errorConfiguracion)
      .toBe('FIREBASE_ENTORNO_INCOMPATIBLE');
  });

  it('producción declarada como staging está bloqueado (el mismo error al revés)', () => {
    // Al revés es igual de grave: un staging que apunta a la base real permitiría
    // escribir datos de clientes desde un entorno sin garantías.
    expect(resolver(PROYECTO_PRODUCCION, { ENTORNO_DESPLIEGUE: 'staging' }).errorConfiguracion)
      .toBe('FIREBASE_ENTORNO_INCOMPATIBLE');
  });

  it('un valor de entorno desconocido NO se interpreta como producción', () => {
    expect(entornoDeclarado({ ENTORNO_DESPLIEGUE: 'loquesea' })).toBeNull();
    expect(entornoDeclarado({ ENTORNO_DESPLIEGUE: 'preproduccion' })).toBe('staging');
    expect(resolver(PROYECTO_PRODUCCION, { ENTORNO_DESPLIEGUE: 'loquesea' }).errorConfiguracion)
      .toBe('FIREBASE_ENTORNO_INCOMPATIBLE');
  });

  it('el destino bloqueado no filtra ni proyecto ni base', () => {
    const r = resolver(PROYECTO_STAGING, {});
    expect(r.proyectoId).toBeNull();
    expect(r.baseDatosId).toBeNull();
  });
});

describe('H-17 · lo que ya estaba bien no se ha relajado', () => {
  it('sin base de datos sigue bloqueado, incluso en staging', () => {
    expect(resolverDestinoFirebase({ ENTORNO_DESPLIEGUE: 'staging' }, config(PROYECTO_STAGING, null)).errorConfiguracion)
      .toBe('FIREBASE_BASE_DATOS_AUSENTE');
  });

  it('los overrides siguen siendo confirmatorios, nunca selectores', () => {
    expect(resolver(PROYECTO_STAGING, { ENTORNO_DESPLIEGUE: 'staging', FIREBASE_PROJECT_ID: 'proyecto-ajeno' }).errorConfiguracion)
      .toBe('FIREBASE_OVERRIDE_INCOMPATIBLE');
    expect(resolver(PROYECTO_STAGING, { ENTORNO_DESPLIEGUE: 'staging', FIREBASE_PROJECT_ID: PROYECTO_STAGING }).errorConfiguracion)
      .toBeUndefined();
  });

  it('una base con forma inválida sigue bloqueada', () => {
    expect(resolverDestinoFirebase(
      { ENTORNO_DESPLIEGUE: 'staging' },
      config(PROYECTO_STAGING, '(default)'),
    ).errorConfiguracion).toBe('FIREBASE_CONFIGURACION_INVALIDA');
  });
});
