import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canWriteContrato } from './authService';
import type { ContratoFormalizacion, UsuarioApp } from '../types';

/**
 * AG-10 · ¿Quién puede disparar el guardado automático del contrato?
 *
 * El defecto original intentaba escribir el contrato para TODOS los perfiles
 * que lo veían (incluido el inquilino y el gestor con solo lectura). Las reglas
 * lo deniegan y cada intento generaba una incidencia.
 *
 * Se verifica el criterio que `App.tsx` usa ahora — `canWriteContrato`, que ya
 * era el criterio único de escritura de contrato en la aplicación — y una
 * guarda sobre el código real del efecto.
 */

const RAIZ = resolve(__dirname, '..', '..');

const CONTRATO_A = {
  id: 'contrato-ag10-a',
  propietarioId: 'prop-ag10-a',
  inmuebleId: 'inm-ag10-a',
} as unknown as ContratoFormalizacion;

const CONTRATO_PARCIAL = {
  id: 'contrato-ag10-p',
  propietarioId: 'prop-ag10-p',
  inmuebleId: 'inm-ag10-parcial',
} as unknown as ContratoFormalizacion;

function usuario(extra: Partial<UsuarioApp>): UsuarioApp {
  return {
    id: 'usr-sintetico',
    nombre: 'Usuario sintético',
    email: 'usuario@example.invalid',
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    ...extra,
  } as UsuarioApp;
}

describe('AG-10 · el guardado automático solo se dispara con permiso de escritura', () => {
  it('el titular de la cartera SÍ escribe su contrato', () => {
    expect(canWriteContrato(
      usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-ag10-a' }),
      CONTRATO_A
    )).toBe(true);
  });

  it('el INQUILINO no escribe el contrato (las reglas solo le dejan sus índices)', () => {
    expect(canWriteContrato(
      usuario({ tipoPerfil: 'INQUILINO', contratoIds: ['contrato-ag10-a'] } as Partial<UsuarioApp>),
      CONTRATO_A
    )).toBe(false);
  });

  it('el PROFESIONAL no escribe contratos', () => {
    expect(canWriteContrato(usuario({ tipoPerfil: 'PROFESIONAL' }), CONTRATO_A)).toBe(false);
  });

  it('otro propietario no escribe un contrato ajeno', () => {
    expect(canWriteContrato(
      usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-ag10-otro' }),
      CONTRATO_A
    )).toBe(false);
  });

  // NOTA: no existe un tipoPerfil 'GESTOR'. Un gestor de cartera es un
  // PROFESIONAL cuya escritura la concede `carterasE` (proyección D1R); las
  // reglas lo reconocen por `isPropietarioRole()`. Así se prueba aquí.
  it('el gestor con cartera de ESCRITURA sí escribe (PROFESIONAL + carterasE)', () => {
    expect(canWriteContrato(
      usuario({ tipoPerfil: 'PROFESIONAL', carterasE: ['prop-ag10-a'] }),
      CONTRATO_A
    )).toBe(true);
  });

  it('el PROFESIONAL sin cartera en carterasE no escribe', () => {
    expect(canWriteContrato(
      usuario({ tipoPerfil: 'PROFESIONAL', carterasE: [] }),
      CONTRATO_A
    )).toBe(false);
  });

  it('la delegación parcial escribe solo el inmueble de su ámbito', () => {
    const gestor = usuario({
      tipoPerfil: 'PROFESIONAL',
      carterasE: [],
      inmueblesDelegadosParcialesEscritura: ['inm-ag10-parcial'],
    });

    expect(canWriteContrato(gestor, CONTRATO_PARCIAL)).toBe(true);
    expect(canWriteContrato(gestor, CONTRATO_A)).toBe(false);
  });

  it('sin usuario no hay escritura', () => {
    expect(canWriteContrato(null, CONTRATO_A)).toBe(false);
    expect(canWriteContrato(undefined, CONTRATO_A)).toBe(false);
  });
});

describe('AG-10 · el efecto real de App.tsx', () => {
  const app = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');

  it('el guardado automático exige permiso antes de escribir', () => {
    const inicio = app.indexOf('Materializa el calendario de cobros');
    expect(inicio).toBeGreaterThan(-1);
    const efecto = app.slice(inicio, inicio + 3000);
    expect(efecto).toContain('canWriteContrato(usuarioConAmbitoAlquiler, contrato)');
  });

  it('la persistencia se espera con await y pasa por el gestor con reintentos', () => {
    const inicio = app.indexOf('Materializa el calendario de cobros');
    const efecto = app.slice(inicio, inicio + 3000);
    expect(efecto).toContain('gestorGuardadoContratos.current');
    expect(efecto).toContain('.guardar(contrato.id, huella');
  });

  it('la firma de idempotencia NO se marca antes de que la escritura confirme', () => {
    const inicio = app.indexOf('Materializa el calendario de cobros');
    const efecto = app.slice(inicio, inicio + 3000);
    // El patrón defectuoso: marcar la firma y escribir sin esperar.
    expect(efecto).not.toMatch(/cobrosEnsureRef\.current\.set\(contrato\.id, firma\);\s*if \(sincro\.necesitaGuardado\)/);
    // La firma se marca dentro del camino de éxito.
    const bloqueExito = efecto.slice(efecto.indexOf("if (resultado === 'GUARDADO')"));
    expect(bloqueExito).toContain('cobrosEnsureRef.current.set(contrato.id, firma)');
  });

  it('el estado local del contrato solo se actualiza cuando se persistió', () => {
    const inicio = app.indexOf('Materializa el calendario de cobros');
    const efecto = app.slice(inicio, inicio + 3000);
    const bloqueExito = efecto.slice(efecto.indexOf("if (resultado === 'GUARDADO')"));
    expect(bloqueExito).toContain('setContratos(');
  });
});
