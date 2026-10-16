# IA · FASE 7 — Gobierno de IA: permisos explícitos, tarifas y cuotas finitas

> **Estado:** implementada y probada en entorno NO productivo. **No se ha
> activado ningún consumo de IA en producción**: la política del repositorio
> sigue bloqueando todas las operaciones (`503
> APROBACION_COMERCIAL_PENDIENTE`) y no se ha usado ninguna credencial ni
> servicio de coste real. La activación gradual es la Fase 8.

## 1. Qué cambia respecto a la Fase 2

| Aspecto | Fase 2 | Fase 7 |
| --- | --- | --- |
| Permisos | `'*'` = todo el catálogo (y herencia de lo no declarado) | **lista explícita por perfil**, operación a operación; `'*'` es INVÁLIDO |
| Política por defecto | todos los perfiles con `'*'`, coste 0, sin cuotas | **deniega todas las operaciones** (los 4 perfiles declarados con ámbito vacío) y bloquea el consumo |
| Tarifas | secciones opcionales; lo no declarado = 0 implícito | **obligatorio declarar la tarifa de las 12 operaciones**; sin huecos |
| Cuotas | `null` = sin límite | **siempre finitas** (día y mes, enteros ≥ 1) |
| Completitud | parcial permitida («cada sección presente sustituye a la anterior») | **TODO O NADA**: si `IA_POLITICA_JSON` existe, debe declarar permisos de los 4 perfiles, tarifas de las 12 operaciones y las 2 cuotas |
| Consecuencia | una política parcial podía habilitar consumo | una política parcial es **INVÁLIDA ⇒ 503 `POLITICA_IA_INVALIDA`** (fallo cerrado) |

El núcleo, las cuentas de créditos, la idempotencia, los reembolsos y el
registro contable **no cambian**: la Fase 7 cierra el contrato de configuración
y lo verifica operación a operación.

## 2. Matriz de permisos de referencia (12 operaciones × 4 perfiles)

`ADMINISTRADOR` opera todo el ERP; el resto de perfiles tienen el mínimo
privilegio de su área. **Ningún perfil recibe un permiso que no esté en esta
tabla** (el comodín ya no existe) y el ámbito se resuelve en servidor a partir
del espejo de identidad veraz, nunca del cuerpo de la petición.

| Operación | PROPIETARIO | PROFESIONAL | INQUILINO | ADMINISTRADOR | Créditos |
| --- | --- | --- | --- | --- | --- |
| `ANALIZAR_DOCUMENTO` | sí | — | — | sí | 2 |
| `GENERAR_CORREO_ASEGURADORA` | — | — | — | sí | 1 |
| `ANALIZAR_RESPUESTA_ASEGURADORA` | — | — | — | sí | 1 |
| `ASISTENTE_INTERPRETAR` | sí | sí | sí | sí | 1 |
| `ANALIZAR_CUESTIONARIO` | — | — | — | sí | 2 |
| `REDACTAR_CLAUSULA` | — | — | — | sí | 2 |
| `ANALIZAR_INSPECCION` | — | sí | — | sí | 3 |
| `PROPONER_MEJORAS` | sí | sí | — | sí | 2 |
| `ESTIMAR_PRICING` | sí | — | — | sí | 2 |
| `GENERAR_KIT_PUBLICACION` | sí | — | — | sí | 2 |
| `ANALIZAR_INCIDENCIA` | — | sí | — | sí | 2 |
| `ASISTENTE_INCIDENCIAS_INQUILINO` | — | — | sí | sí | 2 |

Las once operaciones anteriores más la nueva (asistente de incidencias del
inquilino) están en la tabla: 48 combinaciones comprobadas por prueba
(`tests/ia-fase7-gobierno-permisos-costes.test.ts`).

**Cuotas de referencia:** 20 operaciones/día y 200 operaciones/mes por usuario
(ventanas UTC). El saldo inicial de cada cuenta es 0: sólo un administrador lo
mueve con importes explícitos.

## 3. Cómo se declara la política (plantilla aprobada)

La plantilla está versionada en `docs/politica-ia.ejemplo.json` (misma matriz
que la tabla anterior) y es el valor de `IA_POLITICA_JSON`:

```bash
npm run ia:verificar-politica              # la política del entorno (o el BLOQUEO actual)
npm run ia:verificar-politica -- --ejemplo # valida la plantilla versionada
npm run ia:verificar-politica -- --fichero mi-politica.json
```

El verificador **no escribe nada y no llama a la red**: imprime la matriz, las
tarifas, las cuotas y el estado de aprobación, y sale con código 1 cuando la
política no permite consumir (por defecto, incompleta o inválida). En
`configuracionIA.ts` una política ilegible o incompleta deja el núcleo en
`POLITICA_INVALIDA`: 503 en las doce rutas.

## 4. Qué se ha verificado (y con qué)

| Garantía | Prueba |
| --- | --- |
| Sin comodines, sin tarifas implícitas, sin cuotas ilimitadas | `tests/ia-fase2-politica.test.ts`, `tests/ia-fase7-gobierno-permisos-costes.test.ts` |
| Plantilla del repositorio completa y sin deriva respecto al catálogo | `tests/ia-fase7-*` (incluye la comparación con `docs/politica-ia.ejemplo.json`) |
| Las 12 operaciones por el núcleo real: ADMINISTRADOR 200, INQUILINO 403 salvo la suya | `tests/ia-fase7-*` (HTTP real, proveedor doble) |
| Créditos: consumo, saldo insuficiente, cuotas finitas (429), bloqueo de cuenta | `tests/ia-fase2-gobierno.test.ts`, `tests/ia-fase7-*` |
| Idempotencia: misma clave ⇒ 409 y un único descuento | `tests/ia-fase2-gobierno.test.ts`, `tests/ia-fase7-*` |
| Reembolso íntegro cuando el proveedor no responde con éxito | `tests/ia-fase2-gobierno.test.ts`, `tests/ia-fase7-*` |
| Registro de consumo sin datos personales (lista blanca de campos) | `tests/ia-fase2-*`, `tests/ia-fase7-*`, matriz `tests/ia-fase1-integracion-server.test.ts` |
| Aislamiento por usuario también con la política completa | `tests/ia-fase2-aislamiento-usuarios.test.ts`, `tests/ia-fase7-*` |
| Con la política incompleta NO hay consumo (12 rutas en 503) | `tests/ia-fase2-bloqueo-consumo.test.ts`, `tests/ia-fase7-*` |
| El panel de administración muestra el estado real (completa/pendiente, cuotas finitas) | `src/components/ia/PanelGobiernoIA.test.tsx` |

## 5. Límites y siguiente paso

- Los créditos, cuotas y tarifas son **controles internos** de la aplicación
  (quién puede usar la IA y cuántas veces). No sustituyen a los límites de
  facturación del proveedor, que se configuran en Google Cloud.
- Esta fase **no activa** nada: para consumir de verdad hacen falta la política
  aprobada en el entorno, la credencial de servicio y la clave del proveedor.
- **Fase 8 (siguiente)** — validación y activación gradual en entorno no
  productivo con cuenta de prueba, revisión de consumo y logs, y límites de
  gasto identificados y verificados **antes** de cualquier autorización expresa.
  Sin esa autorización, el consumo permanece desactivado.
