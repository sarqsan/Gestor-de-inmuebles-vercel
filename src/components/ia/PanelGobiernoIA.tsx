/**
 * IA · FASE 2 — PANEL DE ADMINISTRACIÓN DEL GOBIERNO DE USO
 * =========================================================
 * Consulta (sólo lectura) de la política de uso, el consumo por usuario y los
 * bloqueos, más las acciones explícitas de administrador: bloquear/desbloquear
 * el uso de IA y mover el saldo con un importe explícito.
 *
 * Autorización 100% en servidor (`server/ia/adminIA.ts`): este panel no decide
 * permisos ni calcula saldos; sin perfil ADMINISTRADOR las llamadas devuelven
 * 403 y el panel lo muestra. No hay tarifas ni saldos inventados: los valores
 * comerciales figuran como PENDIENTES DE APROBACIÓN hasta que se configuren.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import {
  bloquearCuentaGobiernoIA,
  cargarCuentaGobiernoIA,
  cargarResumenGobiernoIA,
  moverCreditoGobiernoIA,
  type CuentaGobiernoIADTO,
  type OpcionesAdminGobiernoIA,
  type ResumenGobiernoIADTO,
  type ResultadoAccionAdminIA,
} from '../../lib/adminGobiernoIA';
import type { OperacionResumenIADTO } from '../../ia/gobiernoIAContrato';

interface EstadoPanel {
  resumen: ResumenGobiernoIADTO | null;
  cuenta: CuentaGobiernoIADTO | null;
  cargando: boolean;
  error: string | null;
  mensaje: string | null;
}

const fechaCorta = (iso: string | undefined): string => {
  if (!iso) return '—';
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? iso : fecha.toLocaleString();
};

function EtiquetaEstado({ estado }: { estado: string }): ReactElement {
  const clase = estado === 'COMPLETADA' || estado === 'APLICADO' || estado === 'VERAZ'
    ? 'bg-emerald-500/15 text-emerald-300'
    : estado === 'EN_CURSO' || estado === 'PENDIENTE'
      ? 'bg-amber-500/15 text-amber-300'
      : 'bg-rose-500/15 text-rose-300';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${clase}`}>{estado}</span>;
}

function TablaOperaciones({ operaciones, titulo }: { operaciones: OperacionResumenIADTO[]; titulo: string }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</div>
      <table className="w-full text-left text-xs text-slate-300">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 pr-3">Fecha</th>
            <th className="py-1 pr-3">Actor UID</th>
            <th className="py-1 pr-3">Titular UID</th>
            <th className="py-1 pr-3">Operación</th>
            <th className="py-1 pr-3">Estado</th>
            <th className="py-1 pr-3">Origen</th>
            <th className="py-1 pr-3">Créditos</th>
            <th className="py-1 pr-3">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {operaciones.length === 0 && (
            <tr><td className="py-2 text-slate-500" colSpan={8}>Sin operaciones registradas.</td></tr>
          )}
          {operaciones.map((op) => (
            <tr key={op.id} className="border-t border-slate-800">
              <td className="py-1 pr-3 whitespace-nowrap">{fechaCorta(op.iniciadaEn)}</td>
              <td className="py-1 pr-3 font-mono text-[11px]">{op.uid}</td>
              <td className="py-1 pr-3 font-mono text-[11px]">{op.uidTitular ?? '—'}</td>
              <td className="py-1 pr-3">{op.operacion}</td>
              <td className="py-1 pr-3"><EtiquetaEstado estado={op.estado} /></td>
              <td className="py-1 pr-3">{op.origenRespuesta ?? '—'}</td>
              <td className="py-1 pr-3">
                {op.costeCreditos ?? 0}{op.creditosReembolsados ? ` (−${op.creditosReembolsados})` : ''}
              </td>
              <td className="py-1 pr-3">{op.tokensTotales ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PanelGobiernoIA(props: { opciones?: OpcionesAdminGobiernoIA }): ReactElement {
  const opciones = props.opciones;
  const [estado, setEstado] = useState<EstadoPanel>({ resumen: null, cuenta: null, cargando: true, error: null, mensaje: null });
  const [uidBusqueda, setUidBusqueda] = useState('');
  const [motivoBloqueo, setMotivoBloqueo] = useState('');
  const [creditos, setCreditos] = useState('');
  const [motivoCredito, setMotivoCredito] = useState('');

  useEffect(() => {
    let vivo = true;
    cargarResumenGobiernoIA(opciones)
      .then((resumen) => {
        if (!vivo) return;
        setEstado((prev) => ({ ...prev, resumen, cargando: false, error: resumen ? null : 'No se pudo cargar el resumen (¿perfil ADMINISTRADOR?).' }));
      })
      .catch(() => vivo && setEstado((prev) => ({ ...prev, cargando: false, error: 'No se pudo cargar el resumen.' })));
    return () => {
      vivo = false;
    };
  }, [opciones]);

  const buscarCuenta = useCallback(async () => {
    const uid = uidBusqueda.trim();
    if (!uid) return;
    setEstado((prev) => ({ ...prev, cargando: true, mensaje: null }));
    try {
      const cuenta = await cargarCuentaGobiernoIA(uid, opciones);
      setEstado((prev) => ({ ...prev, cuenta, cargando: false, error: cuenta ? null : 'No se pudo cargar la cuenta (uid no válido o sin permiso).' }));
    } catch {
      setEstado((prev) => ({ ...prev, cargando: false, error: 'No se pudo cargar la cuenta.' }));
    }
  }, [uidBusqueda, opciones]);

  const ejecutarAccion = useCallback(async (accion: () => Promise<ResultadoAccionAdminIA>, exito: string) => {
    setEstado((prev) => ({ ...prev, mensaje: null }));
    const resultado = await accion();
    if (resultado.ok) {
      await buscarCuenta(); // refresca la cuenta y DESPUÉS fija el mensaje de éxito
      setEstado((prev) => ({ ...prev, mensaje: exito, error: null }));
    } else {
      setEstado((prev) => ({ ...prev, mensaje: null, error: `${resultado.error ?? 'Error'} (${resultado.codigo ?? resultado.status})` }));
    }
  }, [buscarCuenta]);

  const resumen = estado.resumen;
  const cuenta = estado.cuenta?.cuenta ?? null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" aria-label="Panel de gobierno de IA" data-testid="panel-gobierno-ia">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Gobierno de IA · consumo y bloqueos</h3>
        {resumen && (
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            gobierno: {resumen.gobierno.modo}
          </span>
        )}
        {resumen?.politica && (
          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            política: {resumen.politica.origen}
          </span>
        )}
        {resumen?.politica?.pendienteAprobacionComercial && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300" data-testid="badge-pendiente">
            Política INCOMPLETA o sin aprobar: el servidor BLOQUEA el consumo de IA hasta declarar permisos explícitos por perfil,
            tarifas finitas de las operaciones y cuotas finitas (IA_POLITICA_JSON)
          </span>
        )}
        {resumen?.politica && resumen.politica.politicaCompleta && (
          <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" data-testid="badge-completa">
            Política declarada y completa: permisos explícitos, tarifas y cuotas finitas
          </span>
        )}
      </header>

      {estado.cargando && <p className="text-xs text-slate-400">Cargando…</p>}
      {estado.error && <p className="mb-2 text-xs text-rose-400" role="alert">{estado.error}</p>}
      {estado.mensaje && <p className="mb-2 text-xs text-emerald-400" role="status">{estado.mensaje}</p>}

      {resumen?.politica && (
        <div className="mb-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="text-[10px] uppercase text-slate-500">Cuota diaria / mensual (finita)</div>
            <div className="font-semibold">{resumen.politica.cuotas.operacionesPorDia} / {resumen.politica.cuotas.operacionesPorMes}</div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="text-[10px] uppercase text-slate-500">Tarifas declaradas</div>
            <div className="font-semibold">
              {Object.keys(resumen.politica.costeCreditosPorOperacion).length} operaciones
              {' · '}
              {(Object.values(resumen.politica.costeCreditosPorOperacion) as number[]).filter((c) => c > 0).length} con coste &gt; 0
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
            <div className="text-[10px] uppercase text-slate-500">Perfiles con permisos explícitos</div>
            <div className="font-semibold">
              {new Set(Object.values(resumen.politica.perfilesPorOperacion).flat()).size} de 4
              <span className="ml-1 text-[10px] text-slate-500">(sin comodines)</span>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          Uid del usuario
          <input
            value={uidBusqueda}
            onChange={(e) => setUidBusqueda(e.target.value)}
            placeholder="uid de Firebase Auth"
            className="ml-2 w-64 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200"
            data-testid="entrada-uid"
          />
        </label>
        <button
          type="button"
          onClick={buscarCuenta}
          className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
          data-testid="boton-buscar"
        >
          Consultar cuenta
        </button>
      </div>

      {estado.cuenta && (
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900 p-3" data-testid="cuenta-usuario">
          {cuenta ? (
            <div className="grid gap-2 text-xs text-slate-300 sm:grid-cols-4">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Saldo (créditos)</div>
                <div className="text-lg font-bold text-slate-100">{cuenta.saldoCreditos}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Uso hoy / mes (UTC)</div>
                <div className="font-semibold">{cuenta.ventanaDiaUsos} / {cuenta.ventanaMesUsos}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Totales</div>
                <div className="font-semibold">{cuenta.totalOperaciones} ops · {cuenta.totalCreditosConsumidos} créditos</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500">Bloqueo</div>
                <div className="font-semibold">
                  {cuenta.bloqueada
                    ? <span className="text-rose-400">BLOQUEADA{cuenta.motivoBloqueo ? ` · ${cuenta.motivoBloqueo}` : ''}</span>
                    : <span className="text-emerald-400">activa</span>}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Sin cuenta todavía: el usuario aún no ha usado la IA (saldo inicial 0).</p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              Motivo del bloqueo
              <input
                value={motivoBloqueo}
                onChange={(e) => setMotivoBloqueo(e.target.value)}
                maxLength={120}
                placeholder="breve, sin datos personales"
                className="ml-2 w-56 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
              />
            </label>
            <button
              type="button"
              onClick={() => ejecutarAccion(
                () => bloquearCuentaGobiernoIA(estado.cuenta!.uid, true, motivoBloqueo.trim() || 'bloqueado por administración', opciones),
                'Cuenta bloqueada.',
              )}
              className="rounded bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
              data-testid="boton-bloquear"
            >
              Bloquear
            </button>
            <button
              type="button"
              onClick={() => ejecutarAccion(
                () => bloquearCuentaGobiernoIA(estado.cuenta!.uid, false, 'desbloqueado por administración', opciones),
                'Cuenta desbloqueada.',
              )}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
              data-testid="boton-desbloquear"
            >
              Desbloquear
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-400">
              Créditos (± entero)
              <input
                value={creditos}
                onChange={(e) => setCreditos(e.target.value)}
                placeholder="p. ej. 100 o -20"
                className="ml-2 w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
                data-testid="entrada-creditos"
              />
            </label>
            <label className="text-xs text-slate-400">
              Motivo
              <input
                value={motivoCredito}
                onChange={(e) => setMotivoCredito(e.target.value)}
                maxLength={120}
                placeholder="aprobación, promoción, corrección…"
                className="ml-2 w-56 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const valor = Number.parseInt(creditos, 10);
                if (!Number.isInteger(valor) || valor === 0) {
                  setEstado((prev) => ({ ...prev, mensaje: null, error: 'Introduce un entero distinto de 0.' }));
                  return;
                }
                void ejecutarAccion(
                  () => moverCreditoGobiernoIA(estado.cuenta!.uid, valor, motivoCredito.trim() || 'ajuste manual', opciones),
                  `Saldo movido en ${valor} crédito(s).`,
                );
              }}
              className="rounded bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
              data-testid="boton-credito"
            >
              Mover saldo
            </button>
          </div>
        </div>
      )}

      {estado.cuenta && (
        <div className="mb-4 space-y-3">
          <TablaOperaciones operaciones={estado.cuenta.operaciones} titulo={`Últimas operaciones de ${estado.cuenta.uid}`} />
          <div className="overflow-x-auto">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ajustes de administración</div>
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Fecha</th>
                  <th className="py-1 pr-3">Tipo</th>
                  <th className="py-1 pr-3">Créditos</th>
                  <th className="py-1 pr-3">Estado</th>
                  <th className="py-1 pr-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {estado.cuenta.ajustes.length === 0 && (
                  <tr><td className="py-2 text-slate-500" colSpan={5}>Sin ajustes.</td></tr>
                )}
                {estado.cuenta.ajustes.map((a) => (
                  <tr key={a.id} className="border-t border-slate-800">
                    <td className="py-1 pr-3 whitespace-nowrap">{fechaCorta(a.creadoEn)}</td>
                    <td className="py-1 pr-3">{a.tipo}</td>
                    <td className="py-1 pr-3">{a.creditos ?? '—'}</td>
                    <td className="py-1 pr-3"><EtiquetaEstado estado={a.estado} /></td>
                    <td className="py-1 pr-3">{a.motivo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resumen && <TablaOperaciones operaciones={resumen.operacionesRecientes} titulo="Últimas operaciones (global)" />}
    </section>
  );
}

export default PanelGobiernoIA;
