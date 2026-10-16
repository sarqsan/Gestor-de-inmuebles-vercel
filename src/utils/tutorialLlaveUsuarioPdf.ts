/**
 * IA · FASE 9 — TUTORIAL IMPRIMIBLE DEL ALTA GUIADA (§11.2.8)
 * ============================================================
 * Genera en el navegador (sin servidor) un PDF A4 con el contenido único de
 * `src/ia/tutorialLlaveUsuarioIA.ts`: introducción, los 7 pasos, avisos de
 * seguridad, líneas para anotar la fecha de alta (NUNCA la clave) y preguntas
 * frecuentes. Usa jsPDF, que ya es dependencia del proyecto (contrato §6: no
 * se añaden librerías de PDF).
 */
import jsPDF from 'jspdf';
import { TUTORIAL_LLAVE_USUARIO_IA, type TutorialLlaveUsuarioIA } from '../ia/tutorialLlaveUsuarioIA';

export const NOMBRE_FICHERO_TUTORIAL_LLAVE = 'tutorial-llave-ia-gestor-inmuebles.pdf';

const MARGEN = 18;
const ANCHO_A4 = 210;
const ALTO_A4 = 297;
const ANCHO_TEXTO = ANCHO_A4 - MARGEN * 2;
const LIMITE_Y = ALTO_A4 - 20;

interface Cursor {
  y: number;
}

export function generarPdfTutorialLlaveUsuario(tutorial: TutorialLlaveUsuarioIA = TUTORIAL_LLAVE_USUARIO_IA, fecha: Date = new Date()): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const cursor: Cursor = { y: 22 };

  const saltoSiHaceFalta = (alto: number) => {
    if (cursor.y + alto > LIMITE_Y) {
      doc.addPage();
      cursor.y = 22;
    }
  };

  const parrafo = (texto: string, opciones: { tamano?: number; negrita?: boolean; sangria?: number; espacio?: number } = {}) => {
    const tamano = opciones.tamano ?? 10;
    const sangria = opciones.sangria ?? 0;
    doc.setFontSize(tamano);
    doc.setFont('helvetica', opciones.negrita ? 'bold' : 'normal');
    const lineas = doc.splitTextToSize(texto, ANCHO_TEXTO - sangria) as string[];
    const altoLinea = tamano * 0.45;
    saltoSiHaceFalta(lineas.length * altoLinea + 2);
    doc.text(lineas, MARGEN + sangria, cursor.y);
    cursor.y += lineas.length * altoLinea + (opciones.espacio ?? 2);
  };

  const vineta = (texto: string) => parrafo(`• ${texto}`, { sangria: 4 });

  const titulo = (texto: string) => {
    saltoSiHaceFalta(14);
    cursor.y += 4;
    parrafo(texto, { tamano: 13, negrita: true, espacio: 3 });
    doc.setDrawColor(180);
    doc.line(MARGEN, cursor.y - 1, ANCHO_A4 - MARGEN, cursor.y - 1);
    cursor.y += 3;
  };

  // Portada compacta
  parrafo(tutorial.titulo, { tamano: 18, negrita: true, espacio: 3 });
  parrafo(tutorial.subtitulo, { tamano: 11, espacio: 2 });
  parrafo(`Versión ${tutorial.version} · generado el ${fecha.toLocaleDateString('es-ES')}`, { tamano: 8, espacio: 6 });
  for (const linea of tutorial.introduccion) parrafo(linea);

  titulo('Pasos');
  for (const paso of tutorial.pasos) {
    saltoSiHaceFalta(16);
    parrafo(`${paso.numero}. ${paso.titulo}`, { tamano: 11, negrita: true, espacio: 1.5 });
    for (const detalle of paso.detalle) vineta(detalle);
    if (paso.enlace) parrafo(`Enlace: ${paso.enlace}`, { tamano: 9, sangria: 4, espacio: 3 });
    cursor.y += 1;
  }

  titulo('Avisos de seguridad');
  for (const aviso of tutorial.avisosSeguridad) vineta(aviso);

  titulo('Para anotar a mano (nunca la clave)');
  for (const campo of tutorial.camposParaAnotar) parrafo(campo, { espacio: 5 });

  titulo('Preguntas frecuentes');
  for (const pf of tutorial.preguntasFrecuentes) {
    parrafo(pf.pregunta, { negrita: true, espacio: 1 });
    parrafo(pf.respuesta, { sangria: 4, espacio: 4 });
  }

  // Pie de página en todas las páginas
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gestor de Inmuebles · Tutorial de la llave de IA · página ${i} de ${paginas}`, MARGEN, ALTO_A4 - 10);
  }
  return doc;
}

/** Descarga el PDF en el navegador. */
export function descargarTutorialLlaveUsuarioPdf(): void {
  generarPdfTutorialLlaveUsuario().save(NOMBRE_FICHERO_TUTORIAL_LLAVE);
}

/** Abre el PDF en una pestaña nueva para imprimirlo (si el navegador lo permite). */
export function abrirTutorialLlaveUsuarioParaImprimir(): boolean {
  const doc = generarPdfTutorialLlaveUsuario();
  const url = doc.output('bloburl');
  const ventana = typeof window !== 'undefined' ? window.open(String(url), '_blank') : null;
  return Boolean(ventana);
}
