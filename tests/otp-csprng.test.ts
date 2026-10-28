/**
 * P0.3.1/P0.3.3 — Entropía criptográfica, hash salado y CERO texto plano.
 * Pruebas reales sobre el motor; no se usa ningún doble de `crypto`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  crearOtpActa,
  generarCodigoOtp,
  validarOtp,
  esOtpSeguro,
  validarOtpContexto,
  ErrorOtpActa,
} from '../src/utils/actas/actaOtpEngine';

const CODIGO = readFileSync(resolve(__dirname, '../src/utils/actas/actaOtpEngine.ts'), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('generarCodigoOtp · CSPRNG', () => {
  it('no usa Math.random en ningún punto del motor', () => {
    expect(CODIGO).not.toContain('Math.random(');
    expect(CODIGO).not.toContain('hashCodigoSync');
  });

  it('genera 6 dígitos con una distribución no degenerada', () => {
    const digitos = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const codigo = generarCodigoOtp();
      expect(codigo).toMatch(/^\d{6}$/);
      for (const d of codigo) digitos.add(d);
    }
    expect(digitos.size).toBe(10);
    expect(new Set(Array.from({ length: 100 }, () => generarCodigoOtp())).size).toBeGreaterThan(95);
  });

  it('sin CSPRNG falla cerrado: nunca degrada a Math.random', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => generarCodigoOtp()).toThrow(ErrorOtpActa);
    try { generarCodigoOtp(); } catch (e) { expect((e as ErrorOtpActa).codigo).toBe('OTP_ENTROPIA_NO_DISPONIBLE'); }
  });

  it('sin crypto.subtle el hash NO usa un respaldo débil', async () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    await expect(crearOtpActa({ actaId: 'a', firmaId: 'f', ownerId: 'o' })).rejects.toThrow(/SHA-256/);
  });
});

describe('crearOtpActa · secretos', () => {
  it('el OTP es seguro: hash de 64 hex, sal de 128 bits y sin texto plano', async () => {
    const { otp, codigoPlain } = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1' });
    expect(esOtpSeguro(otp)).toBe(true);
    expect(otp.codigoHash).not.toContain(codigoPlain);
    expect(JSON.stringify(otp)).not.toContain(codigoPlain);
    expect(otp.algoritmoHash).toBe('SHA-256_SALTED');
    expect(otp.transporteRealizado).toBe(false);
    expect(otp.canal).toBe('PENDIENTE_PROVEEDOR');
  });

  it('dos OTP con el MISMO código hipotético tienen hash y sal distintos', async () => {
    const a = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1' });
    const b = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1' });
    expect(a.otp.codigoSalt).not.toBe(b.otp.codigoSalt);
    expect(a.otp.codigoHash).not.toBe(b.otp.codigoHash);
  });

  it('el id del OTP no incluye Math.random y es imprevisible', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const { otp } = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1' });
      ids.add(otp.id);
      expect(otp.id).toMatch(/^otp_a1_\d+_[0-9a-f]{12}$/);
    }
    expect(ids.size).toBe(20);
  });
});

describe('validarOtp · ciclo real', () => {
  it('código correcto ⇒ válido, usado y sin código plano tras el uso', async () => {
    const { otp, codigoPlain } = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1' });
    const r = await validarOtp(otp, codigoPlain);
    expect(r.valido).toBe(true);
    expect(r.otpActualizado.estado).toBe('USADO');
    expect(r.otpActualizado.codigoPlainTemporal).toBeUndefined();
    expect(JSON.stringify(r.otpActualizado)).not.toContain(codigoPlain);
    const reuso = await validarOtp(r.otpActualizado, codigoPlain);
    expect(reuso.valido).toBe(false);
  });

  it('código incorrecto incrementa intentos y bloquea al quinto', async () => {
    const { otp, codigoPlain } = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1' });
    const erroneo = codigoPlain === '000000' ? '111111' : '000000';
    let actual = otp;
    for (let i = 1; i <= 5; i += 1) {
      const r = await validarOtp(actual, erroneo);
      expect(r.valido).toBe(false);
      actual = r.otpActualizado;
      expect(actual.intentos).toBe(i);
    }
    expect(actual.estado).toBe('BLOQUEADO');
  });

  it('el aislamiento por acta/firma/owner/versión sigue vigente', async () => {
    const { otp } = await crearOtpActa({ actaId: 'a1', firmaId: 'f1', ownerId: 'o1', versionActa: 1 });
    expect(validarOtpContexto(otp, { actaId: 'a1', firmaId: 'f1', ownerId: 'o1' }).valido).toBe(true);
    for (const malo of [
      { actaId: 'otra', firmaId: 'f1', ownerId: 'o1' },
      { actaId: 'a1', firmaId: 'otra', ownerId: 'o1' },
      { actaId: 'a1', firmaId: 'f1', ownerId: 'otro' },
      { actaId: 'a1', firmaId: 'f1', ownerId: 'o1', versionActa: 2 },
    ]) {
      expect(validarOtpContexto(otp, malo).valido).toBe(false);
    }
  });
});
