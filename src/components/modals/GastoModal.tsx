import { inmueblesParaSeleccion } from '../../utils/bajaPatrimonialInmueble';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  TrendingDown,
  Home,
  Landmark,
  Save,
  AlertCircle,
  Paperclip,
  Trash2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type {
  CategoriaGasto,
  EstadoGasto,
  Gasto,
  Inmueble,
  TipoGasto,
  UsuarioApp,
} from '../../types';
import {
  CATEGORIAS_GASTO,
  categoriaDef,
  crearGasto,
  normalizarGasto,
  tipoDeCategoria,
} from '../../utils/gastosEngine';
import { uploadFacturaGasto, deleteFacturaGastoStorage } from '../../lib/firebase';
import { descargarDocumentoPatrimonial } from '../../lib/expedienteDocumental/gestorFirebase';
import { ErrorCampo, ResumenErrores, claseEntrada } from '../formularios/CampoFormulario';
import { hayErrores, resumenErrores, validarFormulario } from '../../formularios/validacion';
import type { ErroresFormulario } from '../../formularios/validacion';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';
import { useOperacionEnCurso } from '../../feedback/operaciones';
import { MENSAJES_CUSTODIA } from '../../lib/custodiaDocumental/subidaDirecta';
import { useDialogoAccesible } from '../../accesibilidad/dialogo';

interface GastoModalProps {
  gastoParaEditar?: Gasto | null;
  inmuebles: Inmueble[];
  inmuebleIdInicial?: string;
  currentUser?: UsuarioApp | null;
  onSave: (gasto: Gasto) => Promise<Gasto | void> | Gasto | void;
  onClose: () => void;
}

const labelInmueble = (i: Inmueble): string =>
  `${i.direccion}${i.ciudad ? `, ${i.ciudad}` : ''}`;

/** AG-04: el gasto se guardó, pero la factura no pudo custodiarse (Storage denegó, sin titular, plazo…). */
class FacturaNoCustodiada extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'FacturaNoCustodiada';
  }
}
export const MENSAJE_GASTO_SIN_FACTURA = 'El gasto se ha guardado, pero la factura NO se ha podido custodiar.';

export const GastoModal: React.FC<GastoModalProps> = ({
  gastoParaEditar,
  inmuebles: carteraCompleta,
  inmuebleIdInicial,
  currentUser,
  onSave,
  onClose,
}) => {
  const inmuebles = React.useMemo(() => inmueblesParaSeleccion(carteraCompleta, gastoParaEditar?.inmuebleId), [carteraCompleta, gastoParaEditar?.inmuebleId]);

  const isEditing = !!gastoParaEditar;
  const hoy = new Date().toISOString().split('T')[0];

  const [inmuebleId, setInmuebleId] = useState<string>(
    gastoParaEditar?.inmuebleId || inmuebleIdInicial || inmuebles[0]?.id || ''
  );
  // Una selección antigua no puede mantener operativa una vivienda dada de baja.
  React.useEffect(() => {
    if (!inmuebles.some((i) => i.id === inmuebleId)) setInmuebleId(inmuebles[0]?.id || '');
  }, [inmuebles, inmuebleId]);
  const [categoria, setCategoria] = useState<CategoriaGasto>(
    gastoParaEditar?.categoria || 'COMUNIDAD'
  );
  const [concepto, setConcepto] = useState<string>(gastoParaEditar?.concepto || '');
  const [proveedor, setProveedor] = useState<string>(gastoParaEditar?.proveedor || '');
  const [importe, setImporte] = useState<string>(
    gastoParaEditar ? String(gastoParaEditar.importe || '') : ''
  );
  const [estado, setEstado] = useState<EstadoGasto>(gastoParaEditar?.estado || 'PENDIENTE');
  const [fechaDevengo, setFechaDevengo] = useState<string>(
    gastoParaEditar?.fechaDevengo || hoy
  );
  const [fechaPago, setFechaPago] = useState<string>(gastoParaEditar?.fechaPago || '');
  const [aCargoDe, setACargoDe] = useState<'arrendador' | 'arrendatario'>(
    gastoParaEditar?.aCargoDe || 'arrendador'
  );
  const [deducible, setDeducible] = useState<boolean>(
    gastoParaEditar?.deducible ?? true
  );
  const [capitalAmortizado, setCapitalAmortizado] = useState<string>(
    gastoParaEditar?.capitalAmortizado != null ? String(gastoParaEditar.capitalAmortizado) : ''
  );
  const [intereses, setIntereses] = useState<string>(
    gastoParaEditar?.intereses != null ? String(gastoParaEditar.intereses) : ''
  );
  const [metodoPago, setMetodoPago] = useState<Gasto['metodoPago']>(
    gastoParaEditar?.metodoPago || 'transferencia'
  );
  const [notas, setNotas] = useState<string>(gastoParaEditar?.notas || '');
  const [errorMsg, setErrorMsg] = useState<string>('');
  // AG-04: si el gasto se guardó pero la factura no pudo custodiarse, el modal
  // sigue abierto; un reintento debe reutilizar el MISMO gasto (nunca duplicarlo).
  const gastoPersistidoRef = useRef<Gasto | null>(null);
  // UX-3 §7: `idle → ejecutando → resultado`. El hook ignora una segunda pulsación
  // mientras la operación está en curso (bloqueo de doble envío sin estados globales).
  const { ejecutando: guardando, ejecutar } = useOperacionEnCurso();
  // UX-4 §12/§15: los errores de validación van junto al campo; los de persistencia
  // se muestran aparte y nunca se mezclan con la validación del formulario.
  const [erroresCampo, setErroresCampo] = useState<ErroresFormulario>({});
  // UX-6 §11/§12: semántica de diálogo, foco dentro y Escape (el modal no se cierra
  // mientras la operación está en curso, para no perder lo introducido).
  const { refDialogo, propsDialogo } = useDialogoAccesible(
    { abierto: true, onCerrar: onClose, cerrableConEscape: !guardando },
    isEditing ? 'Editar gasto' : 'Nuevo gasto'
  );

  // UX-6 §12: cuando la validación falla, el foco va al primer campo con error para que
  // el motivo se oiga y se vea sin buscarlo a mano.
  useEffect(() => {
    if (!hayErrores(erroresCampo)) return;
    const contenedor = refDialogo.current;
    if (!contenedor) return;
    const primero = contenedor.querySelector<HTMLElement>('[aria-invalid="true"]');
    primero?.focus();
  }, [erroresCampo, refDialogo]);

  // FASE 2.2: factura / justificante documental en Storage.
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [facturaUrl, setFacturaUrl] = useState<string>(gastoParaEditar?.justificanteUrl || '');
  const [facturaPath, setFacturaPath] = useState<string>(gastoParaEditar?.justificantePath || '');
  const [eliminarFactura, setEliminarFactura] = useState<boolean>(false);
  const [subiendo, setSubiendo] = useState<boolean>(false);
  // P5.2-D: factura custodiada en el expediente P3 (p. ej. alta OCR). Es una
  // referencia DISTINTA del justificante adjuntado manualmente de arriba:
  // se muestra y se descarga verificada; este modal no la borra ni sustituye.
  const documentoExpedienteId = gastoParaEditar?.documento?.id || gastoParaEditar?.facturaOcr?.documentoId || '';
  const [descargandoExpediente, setDescargandoExpediente] = useState(false);
  const [errorExpediente, setErrorExpediente] = useState('');
  const descargarFacturaExpediente = async () => {
    if (!gastoParaEditar || !documentoExpedienteId) return;
    setDescargandoExpediente(true);
    setErrorExpediente('');
    try {
      const resultado = await descargarDocumentoPatrimonial(gastoParaEditar.inmuebleId, documentoExpedienteId);
      const url = URL.createObjectURL(resultado.blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = resultado.nombre;
      enlace.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErrorExpediente(error instanceof Error ? error.message : 'No se pudo recuperar la factura del expediente.');
    } finally {
      setDescargandoExpediente(false);
    }
  };

  const tipo: TipoGasto = tipoDeCategoria(categoria);
  const esFinanciacion = tipo === 'FINANCIACION';

  const categoriasDelTipo = useMemo(
    () => CATEGORIAS_GASTO.filter((c) => c.tipo === tipo),
    [tipo]
  );

  const seleccionarTipo = (nuevoTipo: TipoGasto) => {
    if (nuevoTipo === tipo) return;
    const primera = CATEGORIAS_GASTO.find((c) => c.tipo === nuevoTipo);
    if (primera) {
      setCategoria(primera.value);
      setDeducible(primera.deduciblePorDefecto);
      setACargoDe(primera.aCargoDePorDefecto);
    }
  };

  const handleSeleccionCategoria = (cat: CategoriaGasto) => {
    setCategoria(cat);
    const def = categoriaDef(cat);
    setDeducible(def.deduciblePorDefecto);
    setACargoDe(def.aCargoDePorDefecto);
  };

  const importeNum = parseFloat(importe.replace(',', '.')) || 0;

  const handleSubmit = async () => {
    setErrorMsg('');
    // UX-4 §12: reglas reales ya existentes (inmueble obligatorio, importe > 0),
    // ahora con el mensaje junto al campo correspondiente.
    const validos = validarFormulario(
      { inmuebleId, importe },
      {
        inmuebleId: { etiqueta: 'Inmueble', obligatorio: true },
        importe: { etiqueta: 'Importe total (€)', obligatorio: true, importe: true },
      }
    );
    if (hayErrores(validos)) {
      setErroresCampo(validos);
      return;
    }
    setErroresCampo({});

    const base = gastoPersistidoRef.current
      ? { ...gastoPersistidoRef.current }
      : gastoParaEditar
      ? { ...gastoParaEditar }
      : crearGasto({
          inmuebleId,
          propietarioId: '', // Lo asegura el handler de App según el inmueble / usuario.
          categoria,
          concepto,
          importe: importeNum,
          fechaDevengo,
          creadoPor: currentUser?.nombre,
          creadoPorId: currentUser?.id,
        });

    const gasto: Gasto = {
      ...base,
      inmuebleId,
      categoria,
      concepto: concepto.trim() || categoriaDef(categoria).label,
      proveedor: proveedor.trim() || undefined,
      importe: importeNum,
      estado,
      fechaDevengo: fechaDevengo || undefined,
      fechaPago: fechaPago || undefined,
      aCargoDe,
      deducible: esFinanciacion ? false : deducible,
      capitalAmortizado: esFinanciacion && capitalAmortizado !== ''
        ? parseFloat(capitalAmortizado.replace(',', '.')) || 0
        : undefined,
      intereses: esFinanciacion && intereses !== ''
        ? parseFloat(intereses.replace(',', '.')) || 0
        : undefined,
      metodoPago,
      notas: notas.trim() || undefined,
      justificanteUrl: eliminarFactura ? undefined : facturaUrl || undefined,
      justificantePath: eliminarFactura ? undefined : facturaPath || undefined,
    };

    // UX-3 §6: no se muestra éxito hasta que el resultado real lo confirma
    // (excepción, `false` del contrato B5 o incidencia de guardado → nunca éxito).
    await ejecutar({
      accion: async () => {
        // 1) Guardar el gasto (el handler de App asegura el propietarioId y
        //    devuelve el documento final, necesario para segmentar la factura).
        const guardado = (await onSave(normalizarGasto(gasto))) as Gasto | undefined;
        const referencia: Gasto = guardado || { ...normalizarGasto(gasto) };
        gastoPersistidoRef.current = referencia;

        // 2) Sustituir/eliminar la factura anterior si se pidió.
        if (eliminarFactura && gastoParaEditar?.justificantePath) {
          await deleteFacturaGastoStorage(gastoParaEditar.justificantePath);
        }

        // 3) Subir la nueva factura a Storage y guardar la URL resultante.
        //    AG-04: la subida es fail-closed (Storage o error explícito; sin
        //    respaldo efímero). Si falla, el gasto YA está guardado: se informa
        //    exactamente de eso y se mantiene el modal abierto para reintentar
        //    sobre el mismo gasto.
        if (facturaFile) {
          if (gastoParaEditar?.justificantePath && gastoParaEditar.justificantePath !== facturaPath) {
            await deleteFacturaGastoStorage(gastoParaEditar.justificantePath);
          }
          setSubiendo(true);
          try {
            const { url, storagePath } = await uploadFacturaGasto(
              referencia.id,
              facturaFile,
              facturaFile.name,
              referencia.propietarioId
            );
            await onSave(
              normalizarGasto({ ...referencia, justificanteUrl: url, justificantePath: storagePath })
            );
          } catch (err) {
            throw new FacturaNoCustodiada(mensajeDeErrorUsuario(err, MENSAJES_CUSTODIA.DESCONOCIDO));
          } finally {
            setSubiendo(false);
          }
        }
      },
      mensajeExito: isEditing ? 'Gasto actualizado correctamente.' : 'Gasto registrado correctamente.',
      mensajeError: (fallo) =>
        fallo.error instanceof FacturaNoCustodiada
          ? MENSAJE_GASTO_SIN_FACTURA
          : 'No se ha podido guardar el gasto.',
      origenesDatos: ['gastos'],
      // Si falla no se cierra: no se pierde nada de lo introducido (§15).
      onExito: () => onClose(),
      onFallo: (fallo) =>
        setErrorMsg(
          fallo.error instanceof FacturaNoCustodiada
            ? `${MENSAJE_GASTO_SIN_FACTURA} ${fallo.error.motivo} Puedes volver a adjuntarla ahora o más tarde editando el gasto.`
            : mensajeDeErrorUsuario(fallo.error, 'No se ha podido guardar el gasto.')
        ),
    });
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 outline-none transition';
  const labelCls = 'block text-xs font-semibold text-slate-600 mb-1';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={refDialogo}
        {...propsDialogo}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                esFinanciacion
                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Editar gasto' : 'Nuevo gasto'}
              </h3>
              <p className="text-xs text-slate-500">
                Explotación (coste del alquiler) o financiación (cuota hipotecaria)
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {hayErrores(erroresCampo) && <ResumenErrores mensaje={resumenErrores(erroresCampo)} />}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {/* Error de persistencia: separado de los errores de validación por campo. */}
              <span data-testid="error-persistencia-gasto">{errorMsg}</span>
            </div>
          )}

          {/* Selector de naturaleza (lo más importante de la fase) */}
          <div>
            <span className={labelCls}>Naturaleza del gasto</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => seleccionarTipo('EXPLOTACION')}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  !esFinanciacion
                    ? 'border-amber-500 bg-amber-50/60'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Home className="w-4 h-4" /> Explotación
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Comunidad, IBI, seguros, reparaciones, comisiones… computan al
                  resultado del alquiler.
                </p>
              </button>
              <button
                type="button"
                onClick={() => seleccionarTipo('FINANCIACION')}
                className={`text-left p-3 rounded-xl border-2 transition ${
                  esFinanciacion
                    ? 'border-violet-500 bg-violet-50/60'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 text-violet-700 font-semibold text-sm">
                  <Landmark className="w-4 h-4" /> Financiación
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                  Cuota hipotecaria: salida de caja. El capital no es gasto; solo
                  los intereses son gasto financiero.
                </p>
              </button>
            </div>
          </div>

          {/* Inmueble */}
          <div>
            <label htmlFor="campo-inmueble" className={labelCls}>Inmueble *</label>
            <select
              className={inputCls}
              value={inmuebleId}
              onChange={(e) => setInmuebleId(e.target.value)}
              disabled={isEditing}
              aria-invalid={Boolean(erroresCampo.inmuebleId)}
              aria-describedby="error-inmuebleid"
               id="campo-inmueble">
              {inmuebles.length === 0 && <option value="">Sin inmuebles</option>}
              {inmuebles.map((i) => (
                <option key={i.id} value={i.id}>
                  {labelInmueble(i)}
                </option>
              ))}
            </select>
            <ErrorCampo id="error-inmuebleid" mensaje={erroresCampo.inmuebleId} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Categoría */}
            <div>
              <label htmlFor="campo-categoria" className={labelCls}>Categoría *</label>
              <select
                className={inputCls}
                value={categoria}
                onChange={(e) => handleSeleccionCategoria(e.target.value as CategoriaGasto)}

                 id="campo-categoria">
                {categoriasDelTipo.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Estado */}
            <div>
              <label htmlFor="campo-estado" className={labelCls}>Estado</label>
              <select
                className={inputCls}
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoGasto)}

                 id="campo-estado">
                <option value="PENDIENTE">Pendiente</option>
                <option value="PAGADO">Pagado</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </div>
          </div>

          {/* Concepto y proveedor */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="campo-concepto" className={labelCls}>Concepto</label>
              <input
                type="text"
                className={inputCls}
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder={categoriaDef(categoria).label}

                 id="campo-concepto"/>
            </div>
            <div>
              <label htmlFor="campo-proveedor-acreedor" className={labelCls}>Proveedor / Acreedor</label>
              <input
                type="text"
                className={inputCls}
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Comunidad, banco, empresa…"

                 id="campo-proveedor-acreedor"/>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Importe */}
            <div>
              <label htmlFor="campo-importe-total" className={labelCls}>Importe total (€) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                aria-invalid={Boolean(erroresCampo.importe)}
                className={claseEntrada(erroresCampo.importe)}
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="0,00"

                aria-describedby="error-importe"
                inputMode="decimal"
                 id="campo-importe-total"/>
              <ErrorCampo id="error-importe" mensaje={erroresCampo.importe} />
            </div>
            {/* Fecha devengo */}
            <div>
              <label htmlFor="campo-fecha-factura-devengo" className={labelCls}>Fecha factura / devengo</label>
              <input
                type="date"
                className={inputCls}
                value={fechaDevengo}
                onChange={(e) => setFechaDevengo(e.target.value)}

                 id="campo-fecha-factura-devengo"/>
            </div>
            {/* Fecha pago */}
            <div>
              <label htmlFor="campo-fecha-de-pago" className={labelCls}>Fecha de pago</label>
              <input
                type="date"
                className={inputCls}
                value={fechaPago}
                onChange={(e) => setFechaPago(e.target.value)}
                disabled={estado !== 'PAGADO'}

                 id="campo-fecha-de-pago"/>
            </div>
          </div>

          {/* Desglose financiero (solo hipoteca / financiación) */}
          {esFinanciacion && (
            <div className="p-4 rounded-xl bg-violet-50/60 border border-violet-200 space-y-3">
              <p className="text-xs font-semibold text-violet-800">
                Desglose de la cuota (opcional, para separar capital e intereses)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="campo-capital-amortizado" className={labelCls}>Capital amortizado (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={capitalAmortizado}
                    onChange={(e) => setCapitalAmortizado(e.target.value)}
                    placeholder="No es gasto"

                    inputMode="decimal"
                     id="campo-capital-amortizado"/>
                </div>
                <div>
                  <label htmlFor="campo-intereses" className={labelCls}>Intereses (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    value={intereses}
                    onChange={(e) => setIntereses(e.target.value)}
                    placeholder="Gasto financiero"

                    inputMode="decimal"
                     id="campo-intereses"/>
                </div>
                <div className="flex items-end">
                  <div className="text-[11px] text-violet-700 leading-snug pb-2">
                    Suma sugerida:{' '}
                    <b>
                      {(
                        (parseFloat(capitalAmortizado.replace(',', '.')) || 0) +
                        (parseFloat(intereses.replace(',', '.')) || 0)
                      ).toFixed(2)}{' '}
                      €
                    </b>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* A cargo de */}
            <div>
              <label htmlFor="campo-coste-a-cargo-de" className={labelCls}>Coste a cargo de</label>
              <select
                className={inputCls}
                value={aCargoDe}
                onChange={(e) => setACargoDe(e.target.value as 'arrendador' | 'arrendatario')}

                 id="campo-coste-a-cargo-de">
                <option value="arrendador">Arrendador (propietario)</option>
                <option value="arrendatario">Arrendatario (inquilino)</option>
              </select>
            </div>
            {/* Método de pago */}
            <div>
              <label htmlFor="campo-metodo-de-pago" className={labelCls}>Método de pago</label>
              <select
                className={inputCls}
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as Gasto['metodoPago'])}

                 id="campo-metodo-de-pago">
                <option value="transferencia">Transferencia</option>
                <option value="domiciliacion">Domiciliación</option>
                <option value="bizum">Bizum</option>
                <option value="efectivo">Efectivo</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {/* Deducible (solo explotación) */}
          {!esFinanciacion && (
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                checked={deducible}
                onChange={(e) => setDeducible(e.target.checked)}
              />
              Deducible fiscalmente en el IRPF del alquiler
            </label>
          )}

          {/* P5.2-D: original en el expediente seguro del inmueble (solo lectura aquí) */}
          {documentoExpedienteId && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-xs font-semibold text-indigo-950">Factura custodiada en el expediente del inmueble{gastoParaEditar?.facturaOcr ? ' (alta por escáner OCR)' : ''}</p>
              <p className="mt-0.5 text-[11px] text-indigo-900/80">{gastoParaEditar?.documento?.nombre || 'Documento original'} · Se recupera del expediente seguro verificando su integridad. Adjuntar otra factura abajo añade un justificante aparte; no sustituye este original.</p>
              <button type="button" disabled={descargandoExpediente} onClick={() => void descargarFacturaExpediente()} className="mt-2 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-800 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-100 transition disabled:opacity-50">
                <Paperclip className="w-3.5 h-3.5" /> {descargandoExpediente ? 'Descargando…' : 'Descargar factura del expediente'}
              </button>
              {errorExpediente && <p role="alert" className="mt-2 text-[11px] text-rose-700">{errorExpediente}</p>}
            </div>
          )}

          {/* Factura / justificante en Storage */}
          <div>
            <label className={labelCls}>Factura / justificante (PDF o imagen, máx. 12 MB)</label>
            <div className="flex flex-wrap items-center gap-2">
              {facturaUrl && !eliminarFactura ? (
                <>
                  <a
                    href={facturaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-xl hover:bg-sky-100 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver factura actual
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setEliminarFactura(true);
                      setFacturaFile(null);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Quitar
                  </button>
                </>
              ) : (
                <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer transition">
                  <Paperclip className="w-3.5 h-3.5" />
                  {facturaFile ? facturaFile.name : 'Adjuntar factura'}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFacturaFile(f);
                      setEliminarFactura(false);
                    }}
                  />
                </label>
              )}
              {subiendo && (
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Subiendo…
                </span>
              )}
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              className={inputCls}
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones internas…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={guardando}
            className={`px-5 py-2 text-sm font-semibold text-white rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2 ${
              esFinanciacion ? 'bg-violet-600 hover:bg-violet-700' : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Registrar gasto'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
