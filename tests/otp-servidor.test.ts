/**
 * H-07/H-08/H-09 — El OTP de actas es autoridad del SERVIDOR.
 * ---------------------------------------------------------------------------
 * Estas pruebas ejercitan el servicio REAL (`server/actas/servicioOtpActas.ts`)
 * con un puerto Firestore en memoria que respeta precondiciones y máscaras, y un
 * proveedor de correo doble. No hay red, ni credenciales, ni proyecto Firebase:
 * lo que se demuestra es la lógica que decide autorización, destino, intentos y
 * acreditación de la firma.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { solicitarOtpFirma, validarOtpYFirmar, enmascararCorreo } from '../server/actas/servicioOtpActas';
import {
  PuertoOtpFalso,
  ProveedorCorreoFalso,
  actaDePrueba,
  sembrarPropietario,
  IDENTIDAD_PROPIETARIO,
  IDENTIDAD_AJENO,
  IDENTIDAD_INQUILINO,
} from './harness/puertoOtpFalso';

const TRANSPORTE_REAL = (proveedor: ProveedorCorreoFalso) => ({
  modo: 'REAL' as const,
  proveedor: 'SMTP_PRUEBA',
  provider: proveedor,
});

let puerto: PuertoOtpFalso;
let proveedor: ProveedorCorreoFalso;

beforeEach(() => {
  puerto = new PuertoOtpFalso();
  proveedor = new ProveedorCorreoFalso();
  sembrarPropietario(puerto);
  puerto.sembrar('actas', 'acta-1', actaDePrueba());
});

describe('solicitud del código · el destino NO lo elige el cliente', () => {
  it('envía el código al correo del PARTICIPANTE guardado en el acta', async () => {
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });

    expect(resultado.ok).toBe(true);
    expect(proveedor.enviados).toHaveLength(1);
    expect(proveedor.enviados[0].to).toBe('inquilino@example.test');
    expect(resultado.destinoEnmascarado).toBe('i***@example.test');
    // La respuesta NUNCA contiene el código (se comprueba contra el enviado real).
    expect(JSON.stringify(resultado)).not.toContain(proveedor.codigos[0]);
    expect(resultado.firmaId).toBeTruthy();
  });

  it('el documento del OTP guarda hash + sal y NUNCA el código en claro', async () => {
    await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    const codigo = proveedor.codigos[0];
    const otps = puerto.todos('actas_otp');
    expect(otps).toHaveLength(1);
    const guardado = JSON.stringify(otps[0].datos);
    expect(guardado).not.toContain(codigo);
    expect(otps[0].datos.codigoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(otps[0].datos.codigoSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(otps[0].datos.transporteRealizado).toBe(true);
  });

  it('un participante sin correo NO recibe código y no se crea OTP', async () => {
    puerto.sembrar('actas', 'acta-2', actaDePrueba({
      id: 'acta-2',
      participantes: [{ id: 'p-sin-correo', nombre: 'Sin Correo', rol: 'ARRENDATARIO', firmaRequerida: true, haFirmado: false }],
    }));
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-2', participanteId: 'p-sin-correo' },
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.codigo).toBe('DESTINO_NO_DISPONIBLE');
    expect(proveedor.enviados).toHaveLength(0);
    expect(puerto.todos('actas_otp')).toHaveLength(0);
  });

  it('un usuario sin relación con el acta no puede pedir el código (403)', async () => {
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_AJENO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.http).toBe(403);
    expect(proveedor.enviados).toHaveLength(0);
  });

  it('el firmante autenticado con correo VERIFICADO puede pedir su propio código (ronda ya abierta)', async () => {
    // La ronda la abre el gestor: un firmante no puede mover el acta a firma.
    const apertura = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-propietario' },
    });
    expect(apertura.ok).toBe(true);
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_INQUILINO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(resultado.ok).toBe(true);
    expect(proveedor.enviados[1].to).toBe('inquilino@example.test');
  });

  it('un firmante NO puede abrir por su cuenta la ronda de firma de un acta en borrador', async () => {
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_INQUILINO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.codigo).toBe('ACTA_NO_FIRMABLE');
    expect(proveedor.enviados).toHaveLength(0);
  });

  it('un correo no verificado no acredita identidad de firmante', async () => {
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: {
        identidad: { ...IDENTIDAD_INQUILINO, emailVerificado: false },
        actaId: 'acta-1',
        participanteId: 'part-inquilino',
      },
    });
    expect(resultado.http).toBe(403);
    expect(proveedor.enviados).toHaveLength(0);
  });

  it('sin transporte REAL (MODO_SEGURO) responde 503 y el código no sirve para firmar', async () => {
    const solicitud = await solicitarOtpFirma({
      puerto,
      transporte: { modo: 'MODO_SEGURO', proveedor: null, provider: proveedor },
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(solicitud.http).toBe(503);
    expect(proveedor.enviados).toHaveLength(0);

    const otps = puerto.todos('actas_otp');
    expect(otps).toHaveLength(1);
    expect(otps[0].datos.transporteRealizado).toBe(false);

    const firmaId = String(otps[0].datos.firmaId);
    expect(firmaId).toBeTruthy();
    const validacion = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo: '123456' },
    });
    expect(validacion.ok).toBe(false);
    expect(['OTP_ENTREGA_RECHAZADA', 'OTP_NO_DISPONIBLE']).toContain(validacion.codigo);
  });

  it('si el proveedor rechaza el envío, responde 502 y no acredita entrega', async () => {
    proveedor.ok = false;
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(resultado.http).toBe(502);
    expect(puerto.datosDe('actas_otp', String(resultado.otpId || puerto.todos('actas_otp')[0].id))?.transporteRealizado).toBe(false);
  });

  it('respeta el enfriamiento: dos solicitudes seguidas de la misma firma → 429', async () => {
    const primera = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(primera.ok).toBe(true);
    const segunda = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino' },
    });
    expect(segunda.http).toBe(429);
    expect(segunda.codigo).toBe('ENFRIAMIENTO_ACTIVO');
    expect(proveedor.enviados).toHaveLength(1);
  });
});

describe('validación · la firma se acredita en el servidor', () => {
  async function solicitar(participanteId: string) {
    const resultado = await solicitarOtpFirma({
      puerto,
      transporte: TRANSPORTE_REAL(proveedor),
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId },
    });
    expect(resultado.ok).toBe(true);
    return resultado;
  }

  it('código correcto → firma FIRMADA, OTP consumido, acta en proceso y auditoría', async () => {
    await solicitar('part-inquilino');
    const codigo = proveedor.codigos[0];
    const validacion = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo, ip: '203.0.113.9', userAgent: 'vitest' },
    });
    expect(validacion.ok).toBe(true);
    expect(validacion.actaCerrada).toBe(false);
    expect(validacion.estadoFirma).toBe('EN_PROCESO');

    const acta = puerto.datosDe('actas', 'acta-1')!;
    const firmas = acta.firmas as Array<Record<string, unknown>>;
    expect(firmas.find((f) => f.firmanteId === 'part-inquilino')?.estado).toBe('FIRMADA');
    expect(firmas.find((f) => f.firmanteId === 'part-propietario')?.estado).toBe('SOLICITADA');
    expect(acta.estado).toBe('PENDIENTE_FIRMA');

    const otp = puerto.todos('actas_otp')[0];
    expect(otp.datos.estado).toBe('USADO');
    expect(otp.datos.usado).toBe(true);
    expect(otp.datos.origenValidacion).toBe('GESTOR_EN_PRESENCIA');

    const auditoria = puerto.todos('audit_logs');
    expect(auditoria.some((a) => a.datos.accion === 'ACTA_FIRMADA')).toBe(true);
  });

  it('al completarse todas las firmas el acta pasa a FIRMADA (sólo el servidor)', async () => {
    await solicitar('part-inquilino');
    const codigo1 = proveedor.codigos[0];
    const primera = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo: codigo1 },
    });
    expect(primera.ok).toBe(true);

    await solicitar('part-propietario');
    const codigo2 = proveedor.codigos[1];
    const segunda = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-propietario', codigo: codigo2 },
    });
    expect(segunda.ok).toBe(true);
    expect(segunda.actaCerrada).toBe(true);

    const acta = puerto.datosDe('actas', 'acta-1')!;
    expect(acta.estado).toBe('FIRMADA');
    expect(acta.estadoFirma).toBe('FIRMADA');
    expect(typeof acta.fechaFirma).toBe('string');
  });

  it('un código del firmante A no vale para la firma del firmante B', async () => {
    await solicitar('part-inquilino');
    const codigo = proveedor.codigos[0];
    const cruzada = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-propietario', codigo },
    });
    expect(cruzada.ok).toBe(false);
    const acta = puerto.datosDe('actas', 'acta-1')!;
    expect((acta.firmas as Array<Record<string, unknown>>).every((f) => f.estado !== 'FIRMADA')).toBe(true);
  });

  it('cinco intentos fallidos bloquean el OTP y ya no se puede validar', async () => {
    await solicitar('part-inquilino');
    for (let intento = 1; intento <= 5; intento += 1) {
      const fallo = await validarOtpYFirmar({
        puerto,
        entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo: '000000' },
      });
      expect(fallo.ok).toBe(false);
      expect(fallo.http).toBe(401);
      expect(fallo.intentosRestantes).toBe(5 - intento);
    }
    const otp = puerto.todos('actas_otp')[0];
    expect(otp.datos.estado).toBe('BLOQUEADO');
    expect(otp.datos.intentos).toBe(5);

    const despues = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo: proveedor.codigos[0] },
    });
    expect(despues.ok).toBe(false);
    expect(despues.codigo).toBe('OTP_NO_DISPONIBLE');
  });

  it('si el commit entra en conflicto, nada se escribe: ni firma ni consumo', async () => {
    await solicitar('part-inquilino');
    puerto.conflictosForzados = 1;
    const validacion = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_PROPIETARIO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo: proveedor.codigos[0] },
    });
    expect(validacion.ok).toBe(false);
    expect(validacion.codigo).toBe('CONFLICTO_CONCURRENCIA');

    const otp = puerto.todos('actas_otp')[0];
    expect(otp.datos.usado).not.toBe(true);
    expect(otp.datos.estado).toBe('ACTIVO');
    const acta = puerto.datosDe('actas', 'acta-1')!;
    expect((acta.firmas as Array<Record<string, unknown>>).every((f) => f.estado !== 'FIRMADA')).toBe(true);
  });

  it('un tercero no puede validar el código de otro (403)', async () => {
    await solicitar('part-inquilino');
    const validacion = await validarOtpYFirmar({
      puerto,
      entrada: { identidad: IDENTIDAD_AJENO, actaId: 'acta-1', participanteId: 'part-inquilino', codigo: proveedor.codigos[0] },
    });
    expect(validacion.http).toBe(403);
  });
});

describe('enmascarado del destino', () => {
  it('nunca publica el buzón completo', () => {
    expect(enmascararCorreo('ana.perez@dominio.es')).toBe('a***@dominio.es');
    expect(enmascararCorreo('sin-arroba')).toBe('***');
  });
});
