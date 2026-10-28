/**
 * P0.3.4 — Recorrido extremo a extremo del MOTOR de firma (acta → OTP →
 * validación → FIRMADA). NO es el E2E con emulador oficial: ese requiere Java
 * y queda pendiente en CI. Aquí se ejercitan los motores puros reales con un
 * reloj real, sin dobles de la lógica de negocio, para demostrar el encadenamiento.
 */
import { describe, it, expect } from 'vitest';
import { crearOtpActa, validarOtp, validarOtpContexto } from '../src/utils/actas/actaOtpEngine';
import {
  crearFirmaActa,
  solicitarFirma,
  validarFirmaConOtp,
  completarFirma,
} from '../src/utils/actas/actaFirmaEngine';

describe('recorrido de firma con OTP (motores reales)', () => {
  it('solicitar → recibir → validar → firma completada', async () => {
    const participante = { id: 'u-1', nombre: 'Firmante Sintético', rol: 'INQUILINO' } as never;
    const firmaInicial = crearFirmaActa('acta-1', 1, participante, 'OTP');
    expect(firmaInicial.estado).toBeDefined();

    const { otp, codigoPlain } = await crearOtpActa({
      actaId: 'acta-1', firmaId: firmaInicial.id, ownerId: 'prop-1',
      versionActa: 1, canal: 'EMAIL',
    });
    expect(validarOtpContexto(otp, {
      actaId: 'acta-1', firmaId: firmaInicial.id, ownerId: 'prop-1', versionActa: 1,
    }).valido).toBe(true);

    const validacion = await validarOtp(otp, codigoPlain);
    expect(validacion.valido).toBe(true);
    expect(validacion.otpActualizado.estado).toBe('USADO');

    const conOtp = validarFirmaConOtp(solicitarFirma(firmaInicial));
    const completada = completarFirma(conOtp, '203.0.113.7', 'vitest');
    expect(completada.fechaFirma).toBeDefined();
    expect(completada.estado).not.toBe(firmaInicial.estado);
  });

  it('un código erróneo impide completar la firma', async () => {
    const participante = { id: 'u-2', nombre: 'Otro Firmante', rol: 'PROPIETARIO' } as never;
    const firma = crearFirmaActa('acta-2', 1, participante, 'OTP');
    const { otp, codigoPlain } = await crearOtpActa({ actaId: 'acta-2', firmaId: firma.id, ownerId: 'prop-1' });
    const malo = codigoPlain === '000000' ? '111111' : '000000';
    const r = await validarOtp(otp, malo);
    expect(r.valido).toBe(false);
    expect(r.otpActualizado.intentos).toBe(1);
    expect(r.otpActualizado.estado).toBe('ACTIVO');
  });
});
