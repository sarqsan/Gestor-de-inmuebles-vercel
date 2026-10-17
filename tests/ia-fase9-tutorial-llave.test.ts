/**
 * IA · FASE 9 — TUTORIAL IMPRIMIBLE DEL ALTA GUIADA (§11.2.8)
 * ===========================================================
 * El PDF se genera en Node con jsPDF (sin red). Comprueba que: se produce un
 * documento con varias páginas y el nombre de fichero estable; su texto incluye
 * los 7 pasos, el enlace oficial y las preguntas frecuentes; y que ni el
 * tutorial ni el PDF contienen nada con forma de clave de API.
 */
import { describe, expect, it } from 'vitest';
import {
  generarPdfTutorialLlaveUsuario,
  NOMBRE_FICHERO_TUTORIAL_LLAVE,
} from '../src/utils/tutorialLlaveUsuarioPdf';
import { TUTORIAL_LLAVE_USUARIO_IA, URL_OFICIAL_CLAVES_AI_STUDIO, VERSION_TUTORIAL_LLAVE, resumenAltaGuiadaLlave } from '../src/ia/tutorialLlaveUsuarioIA';
import { PREFIJO_LLAVE_GEMINI, LONGITUD_LLAVE_GEMINI } from '../src/ia/llavesUsuarioContrato';

const PATRON_CLAVE = new RegExp(`${PREFIJO_LLAVE_GEMINI}[0-9A-Za-z_-]{${LONGITUD_LLAVE_GEMINI - PREFIJO_LLAVE_GEMINI.length}}`);

/** Texto plano de todas las páginas (jsPDF guarda las cadenas escapadas entre paréntesis). */
function textoDelPdf(pdf: ReturnType<typeof generarPdfTutorialLlaveUsuario>): string {
  const bruto = pdf.output('arraybuffer');
  const latin1 = Buffer.from(bruto).toString('latin1');
  return [...latin1.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map((m) => m[1].replace(/\\\(/g, '(').replace(/\\\)/g, ')').replace(/\\\\/g, '\\'))
    .join('\n');
}

describe('IA Fase 9 · tutorial del alta guiada', () => {
  it('el contenido declarativo es completo y no contiene claves', () => {
    expect(TUTORIAL_LLAVE_USUARIO_IA.pasos).toHaveLength(7);
    expect(TUTORIAL_LLAVE_USUARIO_IA.preguntasFrecuentes.length).toBeGreaterThanOrEqual(4);
    expect(TUTORIAL_LLAVE_USUARIO_IA.pasos.some((p) => p.enlace === URL_OFICIAL_CLAVES_AI_STUDIO)).toBe(true);
    expect(resumenAltaGuiadaLlave().map((p) => p.clave)).toEqual(['QUE_ES', 'ANTES_DE_EMPEZAR', 'CREAR_EN_AI_STUDIO', 'PEGAR_EN_ERP', 'CONFIRMACION', 'VERIFICACION', 'SUSTITUIR_O_REVOCAR']);
    expect(JSON.stringify(TUTORIAL_LLAVE_USUARIO_IA)).not.toMatch(PATRON_CLAVE);
    expect(JSON.stringify(TUTORIAL_LLAVE_USUARIO_IA)).toContain('AQ.');
    expect(JSON.stringify(TUTORIAL_LLAVE_USUARIO_IA)).toContain('longitud variable');
  });

  it('genera un PDF A4 multipágina con nombre estable y el texto esperado', () => {
    const pdf = generarPdfTutorialLlaveUsuario(TUTORIAL_LLAVE_USUARIO_IA, new Date('2026-10-16T10:00:00.000Z'));
    expect(NOMBRE_FICHERO_TUTORIAL_LLAVE).toBe('tutorial-llave-ia-gestor-inmuebles.pdf');
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    const bytes = Buffer.from(pdf.output('arraybuffer'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(5_000);
    const texto = textoDelPdf(pdf);
    for (const paso of TUTORIAL_LLAVE_USUARIO_IA.pasos) {
      expect(texto, paso.clave).toContain(`${paso.numero}. ${paso.titulo}`);
    }
    expect(texto).toContain(URL_OFICIAL_CLAVES_AI_STUDIO);
    expect(texto).toContain(VERSION_TUTORIAL_LLAVE);
    expect(texto).toContain('Preguntas frecuentes');
    expect(texto).not.toMatch(PATRON_CLAVE);
  });
});
