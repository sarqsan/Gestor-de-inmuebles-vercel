# IA · FASE 8 — Validación y activación gradual (entorno NO productivo)

> **Estado:** el ensayo está IMPLEMENTADO y probado, pero **la activación real
> sigue SIN autorizar y SIN ejecutar**. No se ha usado ninguna credencial ni
> servicio de coste real, no se ha activado el consumo en producción y la
> configuración del repositorio mantiene la IA bloqueada. Los bloqueos que
> faltan por resolver se detallan al final: son exactamente los que exigen
> autorización expresa.

## 1. Qué se puede ensayar hoy (sin coste y sin red)

| Pieza | Fichero | Papel |
| --- | --- | --- |
| Guardia de entorno | `server/ia/validacionEntornoIA.ts` → `evaluarEntornoIA` | Identifica proyecto, base de datos y entorno con la MISMA fuente que el servidor; **se niega en producción**; enumera bloqueos (sin política, política POR_DEFECTO o incompleta, configuración incoherente) y avisos (sin credencial de servicio, `GEMINI_API_KEY` presente) sin imprimir secretos. |
| Límites de gasto | `limitesGastoIA` | Peor caso aritmético con la política declarada: operaciones por usuario/día y mes, sistema completo, operación más cara, créditos mes y día. |
| Proveedor simulado | `proveedorSimulado` | Doble de prueba sin SDK, sin clave y sin red; cuenta llamadas y permite simular fallos por operación (reembolsos y respaldos). |
| Bloqueo del real | `proveedorRealBloqueado` | Cualquier intento de usar el proveedor real en la validación falla con el motivo y la acción requerida (autorización expresa, proyecto no productivo, presupuesto y cuotas de API verificados). |
| Sandbox | `ejecutarSandboxIA` | Monta las DOCE rutas del catálogo con el núcleo real, gobierno y registro en memoria y una **cuenta de prueba** (identidad veraz, saldo de prueba cargado con un ajuste explícito): devuelve permisos, códigos HTTP, motor, coste, reembolso, llamadas y log. |
| CLI | `scripts/validar-ia-entorno-no-productivo.mts` (`npm run ia:validar-entorno`) | Ejecuta el ensayo completo (`--ejemplo`, `--fichero`, `--usuarios N`, `--json`) e imprime límites, matriz y consumo. Sin red y sin escrituras. |

## 2. Cómo se ejecuta el ensayo

```bash
# 1) la política aprobada de referencia (o la del entorno, con IA_POLITICA_JSON)
npm run ia:verificar-politica -- --ejemplo

# 2) ensayo en entorno no productivo con cuenta de prueba y proveedor simulado
npm run ia:validar-entorno -- --ejemplo --usuarios 25

# 3) mismo ensayo legible por máquina (para adjuntar a la revisión)
npm run ia:validar-entorno -- --ejemplo --json > ensayo-fase8.json
```

Código de salida 1 mientras la validación no sea posible (producción, política
ausente/incompleta o configuración incoherente). El ensayo **no toca
Firestore, no cambia la configuración del proyecto y no llama al proveedor
real**: todo el estado del sandbox vive en memoria y se descarta al terminar.

## 3. Qué revisar del ensayo (criterios de la fase)

- **Permisos**: por cada operación, si el perfil de la cuenta de prueba podía
  ejecutarla (200) o no (403 `OPERACION_NO_PERMITIDA`), sin llamadas al
  proveedor en los rechazos.
- **Cuotas y saldo**: consumo dentro de las cuotas finitas y con saldo
  suficiente; ningún rechazo por cuota o saldo con la política de referencia.
- **Errores y reembolsos**: al simular el fallo del proveedor, la operación cae
  a su respaldo determinista y el crédito se reembolsa íntegro.
- **Registro**: los documentos de consumo contienen sólo la lista blanca de
  campos (`CAMPOS_REGISTRO_IA`), sin prompts ni datos personales.
- **Log**: los rechazos y los estados aparecen con códigos normalizados.
- **Límites**: los operaciones/día y /mes del sistema y los créditos del peor
  caso quedan por escrito (ver §4).

## 4. Límites identificados (peor caso con la política de referencia)

Con `CUOTAS_IA_REFERENCIA` (20/día y 200/mes por usuario) y la tarifa máxima
declarada (3 créditos, `ANALIZAR_INSPECCION`):

| Alcance | Operaciones | Créditos (peor caso) |
| --- | --- | --- |
| Por usuario | 20/día · 200/mes | 60/día · 600/mes |
| Sistema con 25 usuarios | 500/día · 5.000/mes | 1.500/día · 15.000/mes |

Son **techos de negocio** (créditos internos), no la factura del proveedor: el
coste real se acota con el **presupuesto y las cuotas de API de Google Cloud**,
que deben estar identificados y verificados antes de autorizar la activación.

## 5. Bloqueos pendientes (acción concreta requerida)

1. **Autorización expresa** del responsable del proyecto para cualquier consumo
   real. Sin ella el consumo permanece desactivado.
2. **Entorno no productivo dedicado**: proyecto y base de datos de pruebas (hoy
   la configuración del repositorio apunta al proyecto de la aplicación; el
   ensayo no lo usa porque corre en memoria, pero la activación gradual exige un
   proyecto separado).
3. **Credencial de servicio y clave del proveedor de ese entorno**, más
   `IA_POLITICA_JSON` con la política completa verificada.
4. **Presupuesto y cuotas de API** identificados y verificados en Google Cloud
   (el sandbox no los sustituye).
5. **Revisión del consumo y los logs** del ensayo con la cuenta de prueba, y
   decisión escrita de activar por fases.

Mientras cualquiera de estos puntos falte, las operaciones de IA del servidor
siguen respondiendo 503 (`APROBACION_COMERCIAL_PENDIENTE` con la política por
defecto o `POLITICA_IA_INVALIDA` con una política mal formada) y no se crea el
cliente del proveedor.

## 6. Pruebas (ejecutadas)

`tests/ia-fase8-validacion-entorno.test.ts` — 17 casos: guardia de entorno
(producción, sin política, POR_DEFECTO, incompleta, proyecto incoherente),
límites de gasto derivados de la política, proveedor simulado sin SDK ni red
(auditoría del propio módulo), bloqueo del proveedor real y sandbox de las doce
operaciones con cuenta de prueba (permisos, consumo, reembolsos, registro sin
datos sensibles y ausencia de rutas nuevas en el servidor).
