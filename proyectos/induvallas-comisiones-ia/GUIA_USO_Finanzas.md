# Guía de uso · kam. Comisiones IA · INDUVALLAS

**Para el Departamento Financiero · V.1.0 · una página**

## Abrir y elegir rol
1. Haga doble clic en `ComisionesIA_Induvallas_V.1.0.html` (Chrome o Edge). No requiere internet.
2. Elija su rol: **Finanzas** (carga datos, calcula, valida, ajusta), **Gerencia Financiera** (además aprueba, reabre y genera el rol) o **Consulta** (solo lectura). El rol queda en cada registro de la bitácora.
3. La **fecha de referencia** (arriba) define qué período está en curso y la antigüedad de la cartera. Con datos reales, déjela en la fecha del día.

## Cargar datos
1. Pestaña **Datos** → **Descargar plantilla**. Complete las hojas Vendedores (con columnas `cuota_AAAA-MM`), Agencias (`pct_agencia` como 15 = 15 %), Clientes, Facturas (subtotal sin IVA), Cobros (valor aplicado a la factura, sin IVA) y NotasCredito.
2. **Importar archivo…**: la herramienta valida fila por fila (duplicados, fechas, referencias, cobros mayores que la factura, porcentajes fuera de rango). Solo carga si no hay errores. Elija **Reemplazar** (primera carga) o **Agregar** (cargas mensuales).
3. Para conocer la herramienta antes de cargar datos reales, use **Cargar datos de demostración** (ficticios).

## Cerrar un mes
1. Seleccione el período en la barra superior. El **Panel ejecutivo** da el veredicto del cierre y las alertas; cada alerta lleva al cálculo que la origina.
2. En **Motor de cálculo** revise cada vendedor: cumplimiento, tramo, ledger paso a paso (clic en una línea abre el detalle por factura), cascada, explicación en lenguaje natural y simulador «¿qué pasa si…?» (no altera los datos).
3. En **Liquidación y auditoría**: registre ajustes manuales con motivo, confirme los **controles del cierre**, pulse **Validar** (Finanzas) y luego **Aprobar y bloquear** (Gerencia). Un período aprobado no se recalcula; reabrirlo exige motivo y queda en la bitácora.
4. **Exportar Excel** genera el rol y el detalle por factura con formato es-EC; **Imprimir rol** usa una vista de impresión limpia.

## Actualizar la política de cobranza o la tabla de comisiones
- **Política de cobranza**: edite tramos de días, factores, caducidad, regla de transición y anticipo; **Simular esta versión** compara la política anterior con la nueva sobre el período seleccionado; **Guardar como nueva versión** la deja vigente desde la fecha indicada. Las versiones anteriores nunca se modifican.
- **Tabla de determinación**: cambie tasas base y multiplicadores, genere la matriz con un clic o edite celda a celda; **Vista previa del impacto** muestra el devengado por vendedor con la versión editada frente a la vigente.
- **Cartera de comisiones pendientes** (en Política de cobranza): facturas con comisión retenida, antigüedad, tramo actual y fecha de caducidad. Es la lista para presionar la cobranza; se exporta a Excel o CSV.

## Respaldo y confidencialidad
- Los datos viven solo en este navegador. **Exporte un respaldo JSON** al cerrar cada período y antes de cambiar de equipo; **Restaurar respaldo** lo recupera en cualquier navegador.
- Nada sale del equipo salvo lo que usted exporte. Los datos de compensación son datos personales (LOPDP): trate los archivos exportados como confidenciales.
- **Asistente**: pregunte en lenguaje natural («¿por qué Carolina cobra menos de lo devengado?», «cartera vencida de Sebastián», «¿quién superó el tope?»). Responde solo con lo que puede calcular y cita las reglas.

*kam-Analytica S.A.S. · RUC 1793220761001 · Desarrollado para INDUVALLAS*
