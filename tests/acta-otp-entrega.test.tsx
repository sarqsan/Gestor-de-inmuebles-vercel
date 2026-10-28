/**
 * H-07/H-08 — Auditoría estática de la superficie de firma.
 * ---------------------------------------------------------------------------
 * El navegador ya no puede generar, guardar, leer ni validar OTP de actas: no
 * hay generación de código, ni hashes, ni `codigoPlain`, ni buzón elegido por el
 * cliente. Estas comprobaciones son deliberadamente textuales sobre el código
 * real para que ninguna "mejora" reintroduzca el diseño anterior sin que un test
 * lo detecte.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VISTA = readFileSync(resolve(__dirname, '../src/components/sections/ActasSection.tsx'), 'utf8');
const API = readFileSync(resolve(__dirname, '../src/lib/entregaOtpApi.ts'), 'utf8');
const CLIENTE_ACTAS = readFileSync(resolve(__dirname, '../src/lib/firebaseActas.ts'), 'utf8');
const SERVICIO = readFileSync(resolve(__dirname, '../server/actas/servicioOtpActas.ts'), 'utf8');
const RUTAS = readFileSync(resolve(__dirname, '../server/actas/rutasOtpActas.ts'), 'utf8');

describe('cliente · el código y el destino NO se gestionan en el navegador', () => {
  it('la vista ya no genera ni valida OTP en cliente', () => {
    expect(VISTA).not.toContain('crearOtpActa');
    expect(VISTA).not.toContain('validarOtp(');
    expect(VISTA).not.toContain('codigoPlain');
    expect(VISTA).not.toContain('saveOtpActaFirestore');
    expect(VISTA).not.toContain('subscribeOtpPorActa');
  });

  it('la vista pide el envío y la validación al servidor', () => {
    expect(VISTA).toContain('solicitarOtpFirma(');
    expect(VISTA).toContain('validarOtpFirmaApi(');
    expect(VISTA).toContain('data-testid="aviso-entrega-otp"');
  });

  it('el cliente HTTP sólo llama a las rutas de servidor y no envía `destino`', () => {
    expect(API).toContain("'/api/actas/otp/solicitar'");
    expect(API).toContain("'/api/actas/otp/validar'");
    expect(API).not.toContain('/api/actas/otp/entregar');
    // El cuerpo enviado se construye con `entrada` (acta + participante + código):
    // la prueba HTTP demuestra además que un `destino` inyectado se ignora.
    expect(API).toMatch(/body:\s*JSON\.stringify\(cuerpo\)/);
    expect(API).toMatch(/entrada: \{\s*actaId: string;\s*participanteId: string;/);
  });

  it('firebaseActas ya no expone escritura ni suscripción de OTP', () => {
    expect(CLIENTE_ACTAS).not.toContain('saveOtpActaFirestore');
    expect(CLIENTE_ACTAS).not.toContain('subscribeOtpPorActa');
    expect(CLIENTE_ACTAS).not.toContain("collection(db, 'actas_otp')");
  });

  it('la ruta antigua del relé de correo se ha retirado del código', () => {
    expect(existsSync(resolve(__dirname, '../server/actas/rutasEntregaOtp.ts'))).toBe(false);
    expect(RUTAS).toContain('RUTA_RETIRADA');
    expect(RUTAS).toContain("'/api/actas/otp/entregar'");
  });
});

describe('servidor · autoridad real del OTP', () => {
  it('el destino se deriva del participante del acta, nunca del cuerpo', () => {
    expect(SERVICIO).toContain('participante.email');
    expect(SERVICIO).not.toMatch(/cuerpo\.destino|entrada\.destino|body\.destino/);
    expect(RUTAS).not.toMatch(/datos\.destino/);
  });

  it('el código no se registra ni se devuelve', () => {
    expect(SERVICIO).not.toMatch(/console\.(log|info|warn|error)/);
    expect(SERVICIO).not.toContain('codigoPlainTemporal');
    expect(RUTAS).not.toMatch(/console\.(log|info|warn|error)/);
    expect(RUTAS).not.toContain('codigoPlain');
  });

  it('la firma se acredita con compare-and-swap y auditoría en el mismo commit', () => {
    expect(SERVICIO).toContain('escribirAtomico');
    expect(SERVICIO).toContain("tipo: 'VERSION'");
    expect(SERVICIO).toContain('ACTA_FIRMADA');
  });

  it('la entrega real se acredita antes de aceptar el código', () => {
    expect(SERVICIO).toContain('transporteRealizado');
    expect(SERVICIO).toContain('OTP_ENTREGA_NO_DISPONIBLE');
    // Las rutas propagan el código de error del servicio sin reinterpretarlo.
    expect(RUTAS).toContain('codigo: resultado.codigo');
  });
});
