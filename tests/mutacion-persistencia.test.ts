/**
 * PERSISTENCIA SEGURA: el aviso de éxito sólo aparece cuando la persistencia
 * lo confirmó, y el de error explica el MOTIVO real (sin jerga técnica).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { avisosOperacion, reiniciarAvisosOperacion } from '../src/feedback/canalFeedback';
import { ejecutarMutacion } from '../src/utils/mutacionFirestore';
import { mensajeErrorOperacion, normalizarErrorFirestore } from '../src/utils/erroresFirestore';
import { reportarResultadoGuardado } from '../src/estadoDatos/canalIncidencias';

beforeEach(() => {
  reiniciarAvisosOperacion();
});

function avisoError(): string | undefined {
  return avisosOperacion().find((a) => a.tipo === 'error')?.mensaje;
}
function avisoExito(): string | undefined {
  return avisosOperacion().find((a) => a.tipo === 'exito')?.mensaje;
}

describe('normalización de errores de Firestore', () => {
  it('traduce los códigos a mensajes útiles', () => {
    expect(normalizarErrorFirestore({ code: 'permission-denied' }).mensaje).toMatch(/No tienes permiso/);
    expect(normalizarErrorFirestore({ code: 'unavailable' }).mensaje).toMatch(/no responde/i);
    expect(normalizarErrorFirestore({ code: 'unauthenticated' }).mensaje).toMatch(/caducado/);
    expect(normalizarErrorFirestore({ code: 'not-found' }).mensaje).toMatch(/ya no existe/);
  });

  it('clasifica permisos y red', () => {
    expect(normalizarErrorFirestore({ code: 'permission-denied' }).esPermisos).toBe(true);
    expect(normalizarErrorFirestore({ code: 'unavailable' }).esRed).toBe(true);
    expect(normalizarErrorFirestore({ code: 'invalid-argument' }).esPermisos).toBe(false);
  });

  it('un error desconocido tiene mensaje genérico y código «desconocido»', () => {
    const normalizado = normalizarErrorFirestore(new Error('boom'));
    expect(normalizado.codigo).toBe('desconocido');
    expect(normalizado.mensaje).toMatch(/No se ha podido completar/);
  });

  it('mensajeErrorOperacion combina contexto y motivo', () => {
    expect(mensajeErrorOperacion({ code: 'permission-denied' }, 'No se ha podido guardar.')).toBe(
      'No se ha podido guardar. No tienes permiso para realizar esta operación. Si crees que es un error, contacta con administración.',
    );
    expect(mensajeErrorOperacion(new Error('x'), 'No se ha podido guardar.')).toBe('No se ha podido guardar.');
  });
});

describe('ejecutarMutacion: el veredicto manda', () => {
  it('éxito real ⇒ aviso de éxito', async () => {
    const onExito = vi.fn();
    const res = await ejecutarMutacion({
      accion: async () => true,
      mensajeExito: 'Titular añadido correctamente.',
      mensajeError: 'No se ha podido añadir el titular.',
      onExito,
    });
    expect(res.ok).toBe(true);
    expect(avisoExito()).toBe('Titular añadido correctamente.');
    expect(onExito).toHaveBeenCalled();
  });

  it('si la acción LANZA ⇒ fallo; el aviso muestra el MOTIVO real', async () => {
    const onFallo = vi.fn();
    const res = await ejecutarMutacion({
      accion: async () => {
        throw Object.assign(new Error('denegado'), { code: 'permission-denied' });
      },
      mensajeExito: 'Titular añadido correctamente.',
      mensajeError: 'No se ha podido añadir el titular.',
      onFallo,
    });
    expect(res.ok).toBe(false);
    expect(avisoExito()).toBeUndefined();
    expect(avisoError()).toBe(
      'No se ha podido añadir el titular. No tienes permiso para realizar esta operación. Si crees que es un error, contacta con administración.',
    );
    expect(onFallo).toHaveBeenCalled();
  });

  it('sustituye el aviso genérico: no quedan dos errores', async () => {
    await ejecutarMutacion({
      accion: async () => {
        throw Object.assign(new Error('x'), { code: 'unavailable' });
      },
      mensajeExito: 'ok',
      mensajeError: 'No se ha podido cerrar la titularidad.',
    });
    const errores = avisosOperacion().filter((a) => a.tipo === 'error');
    expect(errores).toHaveLength(1);
    expect(errores[0].mensaje).toMatch(/no responde/i);
  });

  it('si la acción devuelve false (contrato booleano) ⇒ fallo de persistencia', async () => {
    const res = await ejecutarMutacion<boolean>({
      accion: async () => false,
      mensajeExito: 'Titular añadido correctamente.',
      mensajeError: 'No se ha podido añadir el titular.',
    });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.motivo).toBe('persistencia');
    expect(avisoExito()).toBeUndefined();
    expect(avisoError()).toBe('No se ha podido añadir el titular.');
  });

  it('si la capa de datos registra un fallo de guardado ⇒ fallo aunque resuelva true', async () => {
    const res = await ejecutarMutacion({
      accion: async () => {
        reportarResultadoGuardado('titularidades', false);
        return true;
      },
      mensajeExito: 'Titular añadido correctamente.',
      mensajeError: 'No se ha podido añadir el titular.',
      origenesDatos: ['titularidades'],
    });
    expect(res.ok).toBe(false);
    expect(avisoExito()).toBeUndefined();
  });

  it('un error sin código reconocido mantiene el mensaje de la operación', async () => {
    await ejecutarMutacion({
      accion: async () => {
        throw new Error('Error raro');
      },
      mensajeExito: 'ok',
      mensajeError: 'No se ha podido añadir el titular.',
    });
    expect(avisoError()).toBe('No se ha podido añadir el titular.');
  });

  it('avisarExito:false no emite aviso de éxito', async () => {
    await ejecutarMutacion({
      accion: async () => true,
      mensajeExito: 'Titular añadido correctamente.',
      mensajeError: 'No se ha podido añadir el titular.',
      avisarExito: false,
    });
    expect(avisoExito()).toBeUndefined();
  });

  it('el mensaje de éxito puede depender del valor devuelto', async () => {
    await ejecutarMutacion({
      accion: async () => 'Ana',
      mensajeExito: (valor) => `Titular ${valor} añadido.`,
      mensajeError: 'No se ha podido añadir el titular.',
    });
    expect(avisoExito()).toBe('Titular Ana añadido.');
  });

  it('ninguna operación pendiente: no se avisa éxito por defecto', () => {
    reiniciarAvisosOperacion();
    expect(avisoExito()).toBeUndefined();
    expect(avisoError()).toBeUndefined();
  });
});
