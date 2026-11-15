# P0-B · Procedimiento de restauración (entregable J)

> Proyecto: `gestor-inmuebles-produccion` · Base: `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` (63 caracteres)
> Commit de referencia: `2bed683` · Estado: **procedimiento definido y con guardas probadas; ejecución real pendiente (bloqueo de red)**

---

## 1. Antes de empezar: qué NO se puede hacer

| Prohibido | Por qué |
|---|---|
| Restaurar sobre `gestor-inmuebles-produccion` | Restauración destructiva en producción. |
| Restaurar sin `--base-datos` | Caería en la base por defecto, que está vacía: «restauración correcta» de nada. |
| Usar el literal de la base por defecto | Prohibido por el propio repositorio (`tests/custodia-topologia-firestore-storage.test.ts`). |
| Restaurar Firestore sin su Storage (o al revés) | Dejaría documentos apuntando a archivos inexistentes. |
| Considerar «copia creada» como «recuperación verificada» | Son cosas distintas; la orden lo exige explícitamente. |

## 2. Los 8 pasos

### Paso 1 · Identificar el destino de restauración
El destino debe ser un **proyecto aislado**, nunca el de producción. Se declara en una
variable de entorno, no en el repositorio:

```bash
export P0_PROYECTOS_RESTAURACION="gestor-inmuebles-restore-test"
```

Sin esta variable el script aborta con `LISTA_BLANCA_VACIA`. Si el destino es producción,
aborta con `DESTINO_PRODUCCION` **aunque esté en la lista blanca** (la comprobación de
producción se evalúa primero).

### Paso 2 · Comprobar que el snapshot existe y está COMPLETO
Un snapshot es válido solo si tiene las **dos** piezas con el **mismo** `snapshotId`:

```
gs://<bucket>/<proyecto>/<snapshotId>/firestore/<snapshotId>.overall_export_metadata
gs://<bucket>/<proyecto>/<snapshotId>/storage/
```

Si falta una → `SNAPSHOT_INCOMPLETO` / `SNAPSHOT_DESACOPLADO`. No se improvisa: se elige otro snapshot.

### Paso 3 · Verificar la integridad antes de restaurar
```bash
node scripts/p0/verificar-coherencia.mjs --manifiesto manifiesto-<snapshotId>.json --objetos observado.json
node scripts/p0/verificar-coherencia.mjs --referencias refs.json --objetos objs.json
```
Salida esperada: `✅ Coherencia correcta`. Cualquier lista no vacía ⇒ **parar**.

### Paso 4 · Simulación (no escribe nada)
```bash
node scripts/p0/restaurar.mjs \
  --snapshot 20261115T030000Z-s1 \
  --destino gestor-inmuebles-restore-test \
  --base-datos <ID_BASE> \
  --bucket gestor-inmuebles-backups \
  --origen gestor-inmuebles-produccion
```
Debe imprimir el plan y terminar con `MODO SIMULACIÓN — no se ha escrito nada`.

### Paso 5 · Ejecución en el entorno aislado
Añadir `--confirmar`. El script ejecuta, en este orden:
1. `gcloud firestore import … --project=<aislado> --database=<ID_BASE>`
2. `gcloud storage rsync gs://<bucket>/<proyecto>/<snapshot>/storage gs://<aislado>.firebasestorage.app --recursive`

### Paso 6 · Verificar la restauración (no basta con que el import diga OK)
- Recuento por colección contra el manifiesto (`verificarManifiesto`).
- Colecciones testigo: `inmuebles`, `usuarios`, `contratos_formalizacion`.
- Referencias cruzadas: contratos → inmuebles, incidencias → inmuebles.
- **Apertura real de archivos**: descargar una muestra y comprobar que abre.
- Comparación de hashes contra el manifiesto.

### Paso 7 · Registrar el resultado
Toda operación deja línea en `docs/p0/backup-log.jsonl` (JSONL, sin credenciales):
`RESTAURACION_INICIADA`, `RESTAURACION_COMPLETADA` o `RESTAURACION_FALLIDA`.

### Paso 8 · Informe y limpieza
Documentar: qué se restauró, qué coincidió, qué falló, cuánto tardó. El proyecto aislado
se destruye tras el informe (o se conserva para auditoría, con acceso restringido).

## 3. Recuperación ante pérdida del segundo factor (P0-C)

Ver `src/lib/masterSeguridad.ts` → `PROCEDIMIENTO_RECUPERACION_MASTER`. Resumen:
1. Códigos de respaldo de MFA (custodiados **fuera** del repositorio).
2. Si no hay: restablecer el factor desde Firebase Console con una cuenta con rol Owner.
3. Registrar el incidente en `audit_logs`.
4. Restablecer contraseña y volver a enrolar el factor.

**Hoy este procedimiento es preventivo**: no hay segundo factor activo (§L del informe).

## 4. Evidencia de ejecución

**No hay evidencia de restauración real.** El entorno de la auditoría no tiene acceso a
Google Cloud (`storage.googleapis.com` y `firestore.googleapis.com` devuelven `000`) ni a
`gcloud`. El entregable K queda como pendiente externo, no como realizado.
