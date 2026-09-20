/**
 * BLOQUE B — Documento de liquidación del propietario.
 * Reutiliza el patrón de impresión de contratoEngine (window.print, sin duplicar motores).
 */
import { formatoImporteSepa } from './sepaUtils';
import type { LiquidacionPropietario, NaturalezaLineaLiquidacion } from './tipos';

const ETIQUETA_NATURALEZA: Record<NaturalezaLineaLiquidacion, string> = {
  cobrado: 'Ingreso cobrado',
  devengado_pendiente: 'Pendiente (informativo)',
  honorario: 'Honorario',
  iva_honorarios: 'IVA honorarios',
  gasto: 'Gasto',
  retencion: 'Retención',
  ajuste: 'Ajuste',
  pagado: 'Pago',
  retenido: 'Retenido',
};

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generarTextoLiquidacion(l: LiquidacionPropietario): string {
  const lineas = l.lineas.map(
    (x) => `  [${ETIQUETA_NATURALEZA[x.naturaleza]}] ${x.concepto} .... ${formatoImporteSepa(x.importe)} €${x.detalle ? `\n      ${x.detalle}` : ''}`,
  ).join('\n');
  return `LIQUIDACIÓN DE RENTAS — ${l.periodo}
Estado: ${l.estado}
Propietario: ${l.propietarioNombre}${l.propietarioNif ? ` (${l.propietarioNif})` : ''}
Generada: ${l.fechaGeneracion.slice(0, 10)}${l.fechaAprobacion ? ` · Aprobada: ${l.fechaAprobacion.slice(0, 10)}` : ''}${l.fechaPago ? ` · Pagada: ${l.fechaPago} (ref. ${l.referenciaBancariaPago || '—'})` : ''}

DETALLE
${lineas}

TOTALES
  Bruto cobrado:            ${formatoImporteSepa(l.totalBrutoCobrado)} €
  Honorarios:              -${formatoImporteSepa(l.totalHonorarios)} €
  IVA honorarios:          -${formatoImporteSepa(l.totalIvaHonorarios)} €
  Gastos imputables:       -${formatoImporteSepa(l.totalGastos)} €
  Retenciones:             -${formatoImporteSepa(l.totalRetenciones)} €
  NETO PROPIETARIO:         ${formatoImporteSepa(l.netoPropietario)} €
  (Pendiente de cobro informativo: ${formatoImporteSepa(l.totalDevengadoPendiente)} €)

Cuenta de abono: ${l.cuentaAbonoIban || '—'} (${l.cuentaAbonoTitular || '—'})
Config: honorarios ${l.configFiscal.honorariosPct}% · IVA ${l.configFiscal.aplicaIvaHonorarios ? `${l.configFiscal.ivaHonorariosPct}%` : 'no aplica'} · retención ${l.configFiscal.aplicaRetencion ? `${l.configFiscal.retencionPct}% (${l.configFiscal.motivoRetencion || ''})` : 'no aplica'}
Fuente: ${l.configFiscal.fuenteRegla || '—'}
Clave: ${l.claveIdempotencia} · hash ${l.hashCalculo}`;
}

export function imprimirLiquidacionPDF(l: LiquidacionPropietario): void {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;

  const filas = l.lineas.map((x) => {
    const positivo = x.importe >= 0;
    const color = x.naturaleza === 'devengado_pendiente' || x.naturaleza === 'pagado' ? '#64748b'
      : positivo ? '#047857' : '#b91c1c';
    return `<tr>
      <td><span class="tag">${esc(ETIQUETA_NATURALEZA[x.naturaleza])}</span><br><strong>${esc(x.concepto)}</strong>${x.detalle ? `<br><span class="det">${esc(x.detalle)}</span>` : ''}</td>
      <td class="num" style="color:${color}">${x.naturaleza === 'devengado_pendiente' ? '—' : `${formatoImporteSepa(x.importe)} €`}</td>
    </tr>`;
  }).join('');

  const historial = l.historial.map((h) => `<li><strong>${esc(h.accion)}</strong> — ${esc(h.detalle || '')} <span class="det">(${new Date(h.fecha).toLocaleString('es-ES')}${h.actorNombre ? ` · ${esc(h.actorNombre)}` : ''})</span></li>`).join('');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Liquidación ${esc(l.periodo)} — ${esc(l.propietarioNombre)}</title>
<style>
body{font-family:Georgia,'Times New Roman',serif;color:#111827;padding:40px;line-height:1.55;font-size:11pt}
h1{font-size:16pt;text-align:center;margin-bottom:2px}h2{font-size:10pt;text-align:center;font-weight:normal;color:#4b5563;margin-top:0}
.meta{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:18px 0;font-size:10pt}
table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border-bottom:1px solid #e5e7eb;padding:8px 6px;vertical-align:top;text-align:left}
.num{text-align:right;font-family:monospace;font-weight:bold;white-space:nowrap}
.tag{font-size:8pt;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:4px;padding:1px 6px;font-family:sans-serif}
.det{font-size:8.5pt;color:#64748b}.tot{background:#f1f5f9;font-weight:bold}.neto{background:#ecfdf5;font-size:13pt}
ul{font-size:9.5pt;color:#334155}.foot{text-align:center;font-size:8.5pt;color:#9ca3af;margin-top:30px;border-top:1px dashed #e5e7eb;padding-top:10px;font-family:sans-serif}
@media print{body{padding:16px}button{display:none!important}}
</style></head><body>
<div style="text-align:right;margin-bottom:14px"><button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;font-family:sans-serif">🖨️ Imprimir / Guardar en PDF</button></div>
<h1>LIQUIDACIÓN DE RENTAS — ${esc(l.periodo)}</h1>
<h2>Estado: <strong>${esc(l.estado)}</strong> · Ref. ${esc(l.id)} · hash ${esc(l.hashCalculo)}</h2>
<div class="meta">
<strong>Propietario:</strong> ${esc(l.propietarioNombre)}${l.propietarioNif ? ` · NIF ${esc(l.propietarioNif)}` : ''}<br>
<strong>Generada:</strong> ${esc(l.fechaGeneracion.slice(0, 10))}${l.fechaAprobacion ? ` · <strong>Aprobada:</strong> ${esc(l.fechaAprobacion.slice(0, 10))} por ${esc(l.aprobadaPor || '')}` : ''}${l.fechaPago ? ` · <strong>Pagada:</strong> ${esc(l.fechaPago)} (ref. ${esc(l.referenciaBancariaPago || '')})` : ''}<br>
<strong>Cuenta de abono:</strong> ${esc(l.cuentaAbonoIban || '—')} (${esc(l.cuentaAbonoTitular || '—')})<br>
<strong>Configuración:</strong> honorarios ${l.configFiscal.honorariosPct}% · IVA ${l.configFiscal.aplicaIvaHonorarios ? `${l.configFiscal.ivaHonorariosPct}%` : 'no aplica'} · retención ${l.configFiscal.aplicaRetencion ? `${l.configFiscal.retencionPct}% — ${esc(l.configFiscal.motivoRetencion || '')}` : 'no aplica'}<br>
<strong>Fuente normativa:</strong> ${esc(l.configFiscal.fuenteRegla || '—')}
</div>
<table><thead><tr><th>Concepto</th><th style="text-align:right">Importe</th></tr></thead><tbody>${filas}</tbody>
<tfoot>
<tr class="tot"><td>Bruto cobrado</td><td class="num">${formatoImporteSepa(l.totalBrutoCobrado)} €</td></tr>
<tr class="tot"><td>Total deducciones</td><td class="num">−${formatoImporteSepa(l.totalDeducciones)} €</td></tr>
<tr class="neto"><td>NETO PROPIETARIO</td><td class="num">${formatoImporteSepa(l.netoPropietario)} €</td></tr>
</tfoot></table>
<p class="det">Pendiente de cobro (informativo, no incluido en el neto): ${formatoImporteSepa(l.totalDevengadoPendiente)} €</p>
<h3 style="font-size:11pt">Trazabilidad</h3><ul>${historial}</ul>
<div class="foot">Documento generado por RentSelect Tesorería · Clave ${esc(l.claveIdempotencia)} · Este documento es un detalle de liquidación; no sustituye asesoramiento fiscal.</div>
</body></html>`;
  printWindow.document.write(html);
  printWindow.document.close();
}
