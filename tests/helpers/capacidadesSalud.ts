/** Doble de respuesta de `/api/health` para los tests del doctor. */
export const ESTADOS = ['OK', 'NO_CONFIGURADO', 'SIMULACION', 'BLOQUEADO'] as const;

const ok = (detalle = 'disponible') => ({ estado: 'OK', detalle });

export const CAPACIDADES_SALUD: Record<string, { estado: string; detalle: string }> = {
  autenticacion: ok('token verificado'),
  firestore: ok(),
  almacenDocumental: ok(),
  portalesPublicos: ok(),
  custodia: ok(),
  justificantesCobro: ok(),
  actualizacionRenta: ok(),
  seguimiento: ok(),
  notificaciones: ok(),
  modoEmail: ok(),
  cron: ok(),
  registroIA: ok(),
  llavesIA: ok(),
  analisisIA: ok(),
};

export function respuestaSalud(capacidades: Record<string, unknown> = CAPACIDADES_SALUD) {
  return {
    status: 'ok',
    esquemaDiagnostico: 1,
    ia: { registro: 'FIRESTORE', llaves: 'CONFIGURADO' },
    notificaciones: { email: { modo: 'REAL' }, cron: { configurado: true } },
    configuracion: { entorno: 'test', master: { overrideConfigurado: false } },
    capacidades,
  };
}

export { ESTADOS as ESTADOS_CAPACIDAD };
