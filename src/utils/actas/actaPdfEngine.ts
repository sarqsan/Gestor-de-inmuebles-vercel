import jsPDF from 'jspdf';
import { Acta, ComparacionElemento } from '../../types/actas';
import { ESTADOS_ACTA_LABEL } from './actaStateMachine';

export interface DatosPdfActa {
  acta: Acta;
  actaEntrada?: Acta; // para comparación en salida
  inmuebleDireccion?: string;
  inmuebleCiudad?: string;
  contratoRenta?: number;
  comparacionElementos?: ComparacionElemento[];
}

export function generarPdfActa(datos: DatosPdfActa): jsPDF {
  const { acta, inmuebleDireccion, inmuebleCiudad, contratoRenta, comparacionElementos } = datos;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = 20;

  function addText(text: string, x: number, yPos: number, options?: { bold?: boolean; size?: number }) {
    doc.setFontSize(options?.size || 10);
    doc.setFont('helvetica', options?.bold ? 'bold' : 'normal');
    doc.text(text, x, yPos);
  }

  function addLine(yPos: number) {
    doc.setDrawColor(200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
  }

  function checkPage(needed: number = 20) {
    if (y + needed > 280) {
      doc.addPage();
      y = 20;
    }
  }

  // Header
  doc.setFillColor(240, 240, 240);
  doc.rect(0, 0, pageWidth, 25, 'F');
  addText(`ACTA DE ${acta.tipo}`, margin, 12, { bold: true, size: 16 });
  addText(`ID: ${acta.id} | Versión: v${acta.version} | Estado: ${ESTADOS_ACTA_LABEL[acta.estado]}`, margin, 18, { size: 9 });
  addText(`Fecha acto: ${acta.fechaActo} ${acta.horaActo || ''} | Generado: ${new Date().toLocaleString('es-ES')}`, margin, 22, { size: 8 });
  y = 30;

  // Inmueble y contrato
  addText('INMUEBLE Y CONTRATO', margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  addText(`Inmueble: ${inmuebleDireccion || acta.propertyId} ${inmuebleCiudad ? '- ' + inmuebleCiudad : ''}`, margin, y);
  y += 5;
  if (acta.contractId) {
    addText(`Contrato: ${acta.contractId} ${contratoRenta ? '| Renta: ' + contratoRenta + ' €' : ''}`, margin, y);
    y += 5;
  }
  if (acta.tipo === 'SALIDA' && acta.actaEntradaId) {
    addText(`Acta entrada vinculada: ${acta.actaEntradaId}`, margin, y);
    y += 5;
  }
  y += 3;
  checkPage();

  // Participantes
  addText('PARTICIPANTES', margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  acta.participantes.forEach(p => {
    checkPage(10);
    addText(`- ${p.nombre} (${p.rol}) ${p.dni ? 'DNI: ' + p.dni : ''} ${p.firmaRequerida ? '[Firma requerida]' : ''} ${p.haFirmado ? '[Firmado]' : ''}`, margin, y, { size: 9 });
    y += 5;
  });
  y += 3;
  checkPage();

  // Inventario
  addText(`INVENTARIO Y ESTADO (${acta.inventario.length} elementos)`, margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  if (acta.inventario.length === 0) {
    addText('Sin elementos registrados', margin, y);
    y += 5;
  } else {
    acta.inventario.forEach((elem, idx) => {
      checkPage(12);
      const line = `${idx + 1}. [${elem.categoria}] ${elem.elemento} - ${elem.estado} x${elem.cantidad || 1} ${elem.ubicacion ? '(' + elem.ubicacion + ')' : ''}`;
      const split = doc.splitTextToSize(line, pageWidth - margin * 2);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(split, margin, y);
      y += split.length * 4 + 1;
      if (elem.observaciones) {
        const obs = `   Obs: ${elem.observaciones}`;
        const obsSplit = doc.splitTextToSize(obs, pageWidth - margin * 2 - 5);
        doc.text(obsSplit, margin, y);
        y += obsSplit.length * 4;
      }
    });
  }
  y += 3;
  checkPage();

  // Contadores
  addText(`LECTURAS CONTADORES (${acta.lecturasContadores.length})`, margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  acta.lecturasContadores.forEach(lec => {
    checkPage(10);
    addText(`- ${lec.tipo}: ${lec.lectura} ${lec.unidad || ''} (${lec.fechaHora}) ${lec.observaciones || ''}`, margin, y, { size: 9 });
    y += 5;
  });
  if (acta.lecturasContadores.length === 0) {
    addText('Sin lecturas registradas', margin, y, { size: 9 });
    y += 5;
  }
  y += 3;
  checkPage();

  // Incidencias
  addText(`INCIDENCIAS (${acta.incidenciaIds.length})`, margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  if (acta.incidenciaIds.length === 0) {
    addText('Sin incidencias', margin, y, { size: 9 });
    y += 5;
  } else {
    addText(`IDs: ${acta.incidenciaIds.join(', ')}`, margin, y, { size: 9 });
    y += 5;
  }
  y += 3;
  checkPage();

  // Evidencias
  addText(`EVIDENCIAS (${acta.evidenciaIds.length})`, margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  if (acta.evidenciaIds.length === 0) {
    addText('Sin evidencias', margin, y, { size: 9 });
    y += 5;
  } else {
    addText(`IDs: ${acta.evidenciaIds.slice(0, 10).join(', ')}${acta.evidenciaIds.length > 10 ? '...' : ''}`, margin, y, { size: 8 });
    y += 5;
  }
  y += 3;
  checkPage();

  // Comparación si salida
  if (acta.tipo === 'SALIDA' && acta.resumenDiferencias) {
    addText('COMPARACIÓN ENTRADA → SALIDA', margin, y, { bold: true, size: 12 });
    y += 6;
    addLine(y - 2);
    y += 2;
    const res = acta.resumenDiferencias;
    addText(`Total: ${res.totalElementos} | Sin cambios: ${res.sinCambios} | Desgaste: ${res.conDesgaste} | Deterioro: ${res.conDeterioro} | Daño: ${res.conDano} | Ausencias: ${res.ausencias} | Atención: ${res.requiereAtencion}`, margin, y, { size: 8 });
    y += 5;
    if (comparacionElementos && comparacionElementos.length > 0) {
      comparacionElementos.filter(c => c.requiereAtencion).slice(0, 20).forEach(comp => {
        checkPage(10);
        addText(`- ${comp.nombre}: ${comp.estadoEntrada} → ${comp.estadoSalida} (${comp.diferencia})`, margin, y, { size: 8 });
        y += 4;
      });
    }
    // Contadores diferencias
    if (res.contadores.length > 0) {
      y += 2;
      addText('Diferencias contadores:', margin, y, { bold: true, size: 9 });
      y += 5;
      res.contadores.forEach(cc => {
        checkPage(10);
        addText(`- ${cc.tipo}: ${cc.lecturaEntrada || '-'} → ${cc.lecturaSalida || '-'} | Diff: ${cc.diferenciaTexto || '-'}`, margin, y, { size: 8 });
        y += 4;
      });
    }
    y += 3;
    checkPage();
  }

  // Observaciones
  if (acta.observaciones || acta.observacionesGenerales) {
    addText('OBSERVACIONES', margin, y, { bold: true, size: 12 });
    y += 6;
    addLine(y - 2);
    y += 2;
    const obsText = acta.observaciones || acta.observacionesGenerales || '';
    const splitObs = doc.splitTextToSize(obsText, pageWidth - margin * 2);
    doc.setFontSize(9);
    doc.text(splitObs, margin, y);
    y += splitObs.length * 4 + 5;
    checkPage();
  }

  // Firmas
  addText('FIRMAS', margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  if (acta.firmas.length === 0) {
    addText('Sin firmas registradas', margin, y, { size: 9 });
    y += 5;
  } else {
    acta.firmas.forEach(f => {
      checkPage(12);
      addText(`- ${f.firmanteNombre} (${f.firmanteRol}) - ${f.estado} ${f.fechaFirma ? 'Fecha: ' + f.fechaFirma : ''} | Método: ${f.metodo} | v${f.versionActa}`, margin, y, { size: 8 });
      y += 5;
      if (f.trazabilidad && f.trazabilidad.length > 0) {
        const last = f.trazabilidad[f.trazabilidad.length - 1];
        addText(`  Último evento: ${last.accion} - ${last.fecha}`, margin, y, { size: 7 });
        y += 4;
      }
    });
  }
  y += 5;
  checkPage();

  // Trazabilidad
  addText('TRAZABILIDAD / HISTORIAL', margin, y, { bold: true, size: 12 });
  y += 6;
  addLine(y - 2);
  y += 2;
  acta.historial.slice(-20).forEach(h => {
    checkPage(10);
    addText(`${h.fecha} - ${h.usuario} - ${h.accion} ${h.estadoAnterior ? '(' + h.estadoAnterior + '→' + h.estadoNuevo + ')' : ''} ${h.detalle || ''}`, margin, y, { size: 7 });
    y += 4;
  });

  // Footer versión
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Acta ${acta.id} v${acta.version} - Página ${i}/${totalPages} - ${acta.estado} - Generado ${new Date().toLocaleString('es-ES')}`, margin, 290);
    doc.text(`ID versión: ${acta.id}_v${acta.version} - Firma: ${acta.estadoFirma} - Trazabilidad completa en sistema`, margin, 293);
  }

  return doc;
}

export function descargarPdfActa(doc: jsPDF, acta: Acta) {
  const nombre = `Acta_${acta.tipo}_${acta.fechaActo}_v${acta.version}_${acta.id.slice(0, 8)}.pdf`;
  doc.save(nombre);
}

export async function generarPdfActaBlob(datos: DatosPdfActa): Promise<Blob> {
  const doc = generarPdfActa(datos);
  return doc.output('blob');
}
