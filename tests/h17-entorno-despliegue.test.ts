/**
 * DESTINO ÚNICO DEL SERVIDOR — solo el proyecto real.
 *
 * Historia breve, porque explica el porqué de estas pruebas: se llegó a preparar
 * un segundo destino («staging») y una variable `ENTORNO_DESPLIEGUE` para
 * seleccionarlo. El titular dijo con claridad que **no quiere entorno de pruebas**
 * (2026-10-29), así que se retiraron. Lo que queda es lo que sí quería y sí tiene
 * valor: el servidor **no puede** hablar con un proyecto que no sea el suyo.
 *
 * Estas pruebas fijan esa garantía, incluida la compatibilidad con el despliegue
 * actual (sin ninguna variable declarada).
 */
import { describe, expect, it } from 'vitest';
import {
  PROYECTO_PRODUCCION,
  PROYECTOS_PERMITIDOS,
  resolverDestinoFirebase,
  resolverAccesoFirebase,
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

describe('destino único · el servidor solo conoce un proyecto', () => {
  it('la lista de destinos permitidos tiene exactamente un elemento: el proyecto real', () => {
    expect(PROYECTOS_PERMITIDOS).toEqual([PROYECTO_PRODUCCION]);
    expect(PROYECTOS_PERMITIDOS).toHaveLength(1);
  });

  it('el despliegue actual funciona sin declarar ninguna variable', () => {
    const r = resolver(PROYECTO_PRODUCCION, {});
    expect(r.errorConfiguracion).toBeUndefined();
    expect(r.proyectoId).toBe(PROYECTO_PRODUCCION);
    expect(r.baseDatosId).toBe(BASE_DATOS);
  });

  it('cualquier otro proyecto se bloquea, se declare lo que se declare', () => {
    for (const ajeno of ['gestor-inmuebles-staging', 'proyecto-ajeno', 'gestor-inmuebles', '']) {
      expect(resolver(ajeno).errorConfiguracion).toBeDefined();
      // Ni siquiera una variable de entorno resucita la puerta retirada.
      expect(resolver(ajeno, { ENTORNO_DESPLIEGUE: 'staging' }).errorConfiguracion).toBeDefined();
      expect(resolver(ajeno, { FIREBASE_PROJECT_ID: ajeno }).errorConfiguracion).toBeDefined();
    }
    expect(resolver('proyecto-ajeno').errorConfiguracion).toBe('FIREBASE_PROYECTO_INCOMPATIBLE');
  });

  it('el destino bloqueado no filtra ni proyecto ni base', () => {
    const r = resolver('proyecto-ajeno');
    expect(r.proyectoId).toBeNull();
    expect(r.baseDatosId).toBeNull();
  });
});

describe('destino único · lo que ya estaba bien sigue igual de estricto', () => {
  it('sin base de datos con nombre no se arranca', () => {
    expect(resolverDestinoFirebase({}, config(PROYECTO_PRODUCCION, null)).errorConfiguracion)
      .toBe('FIREBASE_BASE_DATOS_AUSENTE');
  });

  it('una base con forma inválida se rechaza', () => {
    expect(resolverDestinoFirebase({}, config(PROYECTO_PRODUCCION, '(default)')).errorConfiguracion)
      .toBe('FIREBASE_CONFIGURACION_INVALIDA');
  });

  it('los overrides siguen siendo confirmatorios, nunca selectores', () => {
    expect(resolver(PROYECTO_PRODUCCION, { FIREBASE_PROJECT_ID: 'proyecto-ajeno' }).errorConfiguracion)
      .toBe('FIREBASE_OVERRIDE_INCOMPATIBLE');
    expect(resolver(PROYECTO_PRODUCCION, { FIREBASE_PROJECT_ID: PROYECTO_PRODUCCION }).errorConfiguracion)
      .toBeUndefined();
  });

  it('la credencial de servicio tiene que ser del mismo proyecto', () => {
    const cuenta = (projectId: string) => ({ project_id: projectId, client_email: 'x@y.z', private_key: 'k' }) as never;
    expect(resolverAccesoFirebase({}, cuenta(PROYECTO_PRODUCCION)).errorConfiguracion).toBeUndefined();
    expect(resolverAccesoFirebase({}, cuenta('otro-proyecto')).errorConfiguracion)
      .toBe('FIREBASE_PROYECTO_INCOMPATIBLE');
    expect(resolverAccesoFirebase({}, null).errorConfiguracion).toBe('FIREBASE_CREDENCIAL_AUSENTE');
  });
});
