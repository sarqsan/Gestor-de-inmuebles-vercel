/**
 * @vitest-environment jsdom
 */
/**
 * P0.1.7 — Ningún botón sugiere un resultado real donde no lo hay.
 * Verifica el render REAL de la insignia (React Testing Library) y coteja el
 * inventario único contra el marcado de cada superficie.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EtiquetaSimulacion } from '../src/components/common/EtiquetaSimulacion';
import { SIMULACIONES, TEXTO_INSIGNIA, simulacionPorId } from '../src/lib/inventarioSimulaciones';

const RAIZ = resolve(__dirname, '..');
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8');

describe('inventario de simulaciones (H-23)', () => {
  it('contiene exactamente las 9 simulaciones, con IDs únicos y mensaje', () => {
    expect(SIMULACIONES).toHaveLength(9);
    expect(new Set(SIMULACIONES.map((s) => s.id)).size).toBe(9);
    for (const s of SIMULACIONES) {
      expect(s.titulo.length).toBeGreaterThan(4);
      expect(s.mensaje.length).toBeGreaterThan(30);
      expect(s.superficie.startsWith('src/')).toBe(true);
      expect(['SIMULACION', 'PENDIENTE', 'NO_IMPLEMENTADO']).toContain(s.estado);
    }
  });

  it('cada superficie existe en el repositorio', () => {
    for (const s of SIMULACIONES) {
      expect(() => leer(s.superficie), s.superficie).not.toThrow();
    }
  });

  it('toda entrada está etiquetada: insignia, texto explícito o sin UI documentada', () => {
    for (const s of SIMULACIONES) {
      const codigo = leer(s.superficie);
      if (s.etiquetado === 'insignia') {
        expect(codigo, s.id).toContain(`EtiquetaSimulacion id="${s.id}"`);
      } else {
        expect(codigo, `${s.id} (${s.textoUI})`).toContain(s.textoUI);
      }
      expect(simulacionPorId(s.id)).toBe(s);
    }
  });
});

describe('EtiquetaSimulacion · render real', () => {
  it.each(SIMULACIONES.filter((s) => s.etiquetado === 'insignia').map((s) => s.id))(
    'muestra aviso visible y mensaje para %s', (id) => {
      const { container } = render(<EtiquetaSimulacion id={id} />);
      const nota = container.querySelector('[data-testid="etiqueta-simulacion"]');
      expect(nota).not.toBeNull();
      expect(nota?.getAttribute('data-simulacion')).toBe(id);
      expect(nota?.getAttribute('role')).toBe('note');
      expect(nota?.textContent).toContain(TEXTO_INSIGNIA);
      expect(nota?.textContent).toContain(simulacionPorId(id)!.mensaje.slice(0, 25));
      expect(nota?.textContent).not.toMatch(/enviado correctamente|operación completada|firma completada/i);
    },
  );

  it('un ID desconocido cae en mensaje genérico SEGURO, nunca en éxito', () => {
    const { container } = render(<EtiquetaSimulacion id="no-existe" compacto />);
    const texto = container.querySelector('[role="note"]')?.textContent || '';
    expect(texto).toContain(TEXTO_INSIGNIA);
    expect(texto).toContain('no produce ningún resultado real');
  });
});

describe('superficies críticas sin promesa de resultado real', () => {
  it('el botón «Solicitar firma + OTP» queda precedido por el aviso de entrega pendiente', () => {
    const codigo = leer('src/components/sections/ActasSection.tsx');
    const aviso = codigo.indexOf('EtiquetaSimulacion id="entregaOtp"');
    const boton = codigo.indexOf('Solicitar firma + OTP');
    expect(aviso).toBeGreaterThan(-1);
    expect(boton).toBeGreaterThan(aviso);
    expect(boton - aviso).toBeLessThan(1000);
  });

  it('VERI*FACTU y B2B ya no insinúan conexión con la AEAT', () => {
    const codigo = leer('src/components/sections/FacturacionSection.tsx');
    expect(codigo).toContain('EtiquetaSimulacion id="verifactu"');
    expect(codigo).toContain('EtiquetaSimulacion id="b2b"');
    expect(codigo).not.toMatch(/conexión real con AEAT pendiente \(certificado/i);
  });

  it('el texto normativo obsoleto del adaptador B2B está corregido (D-09)', () => {
    const codigo = leer('src/utils/intercambioB2B/adaptadoresB2B.ts');
    expect(codigo).toContain('Orden HAC/1028/2026');
    expect(codigo).not.toContain('pendiente de orden ministerial');
  });

  it('la sindicación no afirma publicación automática', () => {
    const codigo = leer('src/components/PublicacionInmueblesPanel.tsx');
    expect(codigo).toContain('EtiquetaSimulacion id="sindicacion"');
    expect(codigo).toContain('sin publicar automáticamente');
  });
});
