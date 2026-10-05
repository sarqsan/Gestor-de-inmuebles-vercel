/** BLOQUE E — Mi contrato (vista saneada + PDF canónico + acta de entrega). */
import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileText, KeyRound } from 'lucide-react';
import type { ContratoFormalizacion, Inmueble } from '../../types';
import { sanearContratoParaInquilino } from '../../inquilino/portalEngine';
import { generarTextoActaEntrega, imprimirContratoPDF } from '../../utils/contratoEngine';

interface Props {
  contrato: ContratoFormalizacion;
  inmueble: Inmueble | null;
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-500 font-medium">{etiqueta}</span>
      <span className="text-xs font-bold text-right">{valor}</span>
    </div>
  );
}

function fmtFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES');
}

export const PortalContrato: React.FC<Props> = ({ contrato }) => {
  const vm = useMemo(() => sanearContratoParaInquilino(contrato), [contrato]);
  const [copiado, setCopiado] = useState(false);
  const [verActa, setVerActa] = useState(false);

  const copiarIban = async () => {
    try {
      await navigator.clipboard.writeText(vm.ibanPago);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* portapapeles no disponible */
    }
  };

  const acta = vm.actaEntregaLlaves;
  const cargo = (q: string) => (q === 'arrendatario' ? 'Tú (inquilino)' : 'Arrendador');

  return (
    <div className="space-y-3">
      {/* Renta y pago */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold mb-2">Renta y pago</h3>
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-black text-indigo-800">{vm.rentaMensual.toFixed(2)} €<span className="text-sm font-bold">/mes</span></p>
          <p className="text-xs text-slate-600 font-medium">Pagar antes del día {vm.diaLimitePagoMes} de cada mes</p>
        </div>
        <div className="mt-2">
          <Fila etiqueta="Cuenta de pago (IBAN)" valor={<span className="font-mono text-[11px] break-all">{vm.ibanPago}</span>} />
          <button
            onClick={copiarIban}
            className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl cursor-pointer"
          >
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'IBAN copiado' : 'Copiar IBAN'}
          </button>
        </div>
        <div className="mt-2 divide-y divide-slate-100">
          <Fila etiqueta="Fianza legal" valor={`${vm.fianzaLegalImporte.toFixed(2)} € (${vm.fianzaLegalMeses} mes)`} />
          {vm.garantiaAdicionalImporte > 0 && (
            <Fila etiqueta="Garantía adicional" valor={`${vm.garantiaAdicionalImporte.toFixed(2)} €`} />
          )}
          <Fila etiqueta="Comunidad" valor={cargo(vm.gastosComunidadCargo)} />
          <Fila etiqueta="IBI" valor={cargo(vm.ibiCargo)} />
          <Fila etiqueta="Suministros" valor={cargo(vm.suministrosCargo)} />
        </div>
      </section>

      {/* Vigencia */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold mb-1">Vigencia</h3>
        <Fila etiqueta="Inicio" valor={fmtFecha(vm.fechaInicioContrato)} />
        <Fila etiqueta="Fin" valor={fmtFecha(vm.fechaFinContrato)} />
        <Fila etiqueta="Duración" valor={`${vm.duracionAnios} año(s)`} />
        <Fila etiqueta="Estado" valor={vm.estado} />
        {vm.modalidadAlquiler === 'habitaciones' && (
          <Fila etiqueta="Habitación" valor={vm.habitacionIdentificador || '—'} />
        )}
        <Fila etiqueta="Mascotas" valor={vm.permitirMascotas ? `Sí${vm.clausulaMascotasDetalle ? ` (${vm.clausulaMascotasDetalle})` : ''}` : 'No'} />
        <Fila etiqueta="Subarriendo" valor={vm.permitirSubarriendo ? 'Sí' : 'No'} />
        {vm.incluyeMueblesInventario && <Fila etiqueta="Inventario" valor={vm.inventarioDetalle || 'Incluido'} />}
      </section>

      {/* Arrendador */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold mb-1">Arrendador</h3>
        <Fila etiqueta="Nombre" valor={vm.arrendadorNombre} />
        <Fila etiqueta="Teléfono" valor={vm.arrendadorTelefono} />
        <Fila etiqueta="Email" valor={<span className="break-all">{vm.arrendadorEmail}</span>} />
        {vm.segundoArrendadorNombre && <Fila etiqueta="Coarrendador" valor={vm.segundoArrendadorNombre} />}
      </section>

      {/* Firmas */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <h3 className="text-sm font-extrabold mb-1">Firmas</h3>
        <Fila
          etiqueta="Arrendador"
          valor={vm.firmaArrendador.firmado ? `Firmado${vm.firmaArrendador.fecha ? ` (${fmtFecha(vm.firmaArrendador.fecha)})` : ''}` : 'Pendiente'}
        />
        <Fila
          etiqueta="Arrendatario"
          valor={vm.firmaArrendatario.firmado ? `Firmado${vm.firmaArrendatario.fecha ? ` (${fmtFecha(vm.firmaArrendatario.fecha)})` : ''}` : 'Pendiente'}
        />
      </section>

      {vm.clausulasPersonalizadas.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h3 className="text-sm font-extrabold mb-1">Cláusulas adicionales</h3>
          {vm.clausulasPersonalizadas.map((c, i) => (
            <div key={i} className="py-1.5 border-b border-slate-100 last:border-0">
              <p className="text-xs font-bold">{c.titulo}</p>
              <p className="text-xs text-slate-600">{c.contenido}</p>
            </div>
          ))}
        </section>
      )}

      {/* Acta de entrega */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <button
          onClick={() => setVerActa(!verActa)}
          className="w-full flex items-center justify-between cursor-pointer"
        >
          <span className="flex items-center gap-2 text-sm font-extrabold">
            <KeyRound className="w-4 h-4 text-indigo-700" /> Acta de entrega de llaves
          </span>
          <span className="text-xs text-indigo-700 font-bold">{verActa ? 'Ocultar' : 'Ver'}</span>
        </button>
        {verActa && (
          <div className="mt-2">
            <Fila etiqueta="Fecha de entrega" valor={fmtFecha(acta.fechaEntrega)} />
            <Fila etiqueta="Llaves vivienda / portal / buzón" valor={`${acta.juegosLlavesVivienda} / ${acta.juegosLlavesPortal} / ${acta.juegosLlavesBuzon}`} />
            {acta.contadorElectricidadKwh && <Fila etiqueta="Contador luz inicial" valor={`${acta.contadorElectricidadKwh} kWh`} />}
            {acta.contadorAguaM3 && <Fila etiqueta="Contador agua inicial" valor={`${acta.contadorAguaM3} m³`} />}
            {acta.contadorGasM3 && <Fila etiqueta="Contador gas inicial" valor={`${acta.contadorGasM3} m³`} />}
            {acta.estadoPintura && <Fila etiqueta="Pintura" valor={acta.estadoPintura} />}
            {acta.estadoLimpieza && <Fila etiqueta="Limpieza" valor={acta.estadoLimpieza} />}
            {acta.observacionesEstado && (
              <p className="mt-1 text-xs text-slate-600 italic">{acta.observacionesEstado}</p>
            )}
            <pre className="mt-2 p-2 bg-slate-50 rounded-xl text-[11px] text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {generarTextoActaEntrega(contrato)}
            </pre>
          </div>
        )}
      </section>

      <button
        onClick={() => imprimirContratoPDF(contrato)}
        className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-2xl cursor-pointer"
      >
        <Download className="w-4 h-4" /> Descargar mi contrato (PDF)
      </button>
      <p className="flex items-center gap-1 text-[11px] text-slate-400 justify-center">
        <FileText className="w-3 h-3" /> Se abrirá la vista de impresión para guardarlo en PDF
      </p>
    </div>
  );
};
