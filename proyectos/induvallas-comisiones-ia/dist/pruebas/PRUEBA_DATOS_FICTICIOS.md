# Kit de prueba · datos ficticios · flujo con datos anonimizados

Generado el 2026-09-14 con `npm run prueba` (determinista). Todos los datos son ficticios; los nombres de vendedores, clientes y agencias no corresponden a personas ni empresas reales.

## Archivos

| Archivo | Quién lo tendría en producción | Contenido |
|---|---|---|
| `Prueba_01_Datos_ficticios_INDUVALLAS.xlsx` | INDUVALLAS | Plantilla rellena "como saldría de INDUVALLAS": 8 vendedores con nombre, 32 clientes, 12 agencias, 459 facturas, 418 cobros y 12 notas de crédito (enero a septiembre 2026) |
| `Prueba_02_Datos_anonimizados.xlsx` | kam | La misma información seudonimizada con la clave `prueba-kam-2026` (sin nombres, códigos reales, cargos ni motivos) |
| `Prueba_02_Mapa_anonimizacion_NO_COMPARTIR.json` | INDUVALLAS | Mapa de reidentificación seudónimo → nombre real. En producción no se comparte; aquí se incluye para la prueba |
| `Prueba_03_Rol_historico_contraste.xlsx` | kam (preparado por INDUVALLAS con seudónimos) | Comisión pagada por vendedor y mes según un "Excel anterior" ficticio: 64 filas, 4 con desviaciones deliberadas |

Parámetros usados: los defaults de demostración que la herramienta trae al abrirse sin datos (matriz de 0,50 % a 2,00 %, bonos activos, tope USD 1.500, política v1.0 anterior y v2.0 vigente desde 01-ene-2026 con transición por emisión). Fecha de referencia del cálculo: 2026-09-14.

Nota: en esta prueba todos los períodos quedan abiertos (una plantilla no trae cierres), por lo que los totales difieren de los del botón «Cargar datos de demostración», donde enero a julio están aprobados y las notas de crédito de agosto generan clawback en lugar de reducir la base del mes de la factura (R-03).

Nota: la versión DEMO de la herramienta trae el mismo ejercicio embebido, sin archivos: al abrirla se cargan solos los datos ficticios (con enero a julio aprobados) y el botón «Rol histórico de la demostración» de Liquidación y auditoría carga un Excel anterior ficticio con cuatro diferencias explicadas. Este kit de archivos sirve para practicar el flujo real (plantilla → anonimización → contraste) y por eso deja todos los períodos abiertos.

## Prueba A · lado kam: importar la copia anonimizada y contrastar

1. Abra `ComisionesIA_Induvallas_V.1.3.html`, elija el rol Finanzas y, en la pestaña Datos, pulse «Borrar todos los datos» (la versión DEMO abre con los datos ficticios ya cargados).
2. Datos → Importar archivo… → `Prueba_02_Datos_anonimizados.xlsx` → debe indicar **archivo válido** → Reemplazar todos los datos.
3. Fecha de referencia del cálculo: 2026-09-14. Período: agosto 2026.
4. Liquidación y auditoría → Cargar rol histórico… → `Prueba_03_Rol_historico_contraste.xlsx`.

Resultado esperado: **60 coinciden** y **4 por revisar**, sin filas con error ni sin correspondencia. Las cuatro diferencias, con la explicación que debe encontrarse en el ledger de cada vendedor:

| Período | Vendedor (seudónimo y nombre real según el mapa) | Pagado histórico | Liquidable herramienta | Diferencia | Causa ficticia |
|---|---|---|---|---|---|
| 2026-06 | V-Q5JAHE (Valeria Espinoza) | 502,39 | 402,39 | −100,00 | Pago duplicado de USD 100,00 en junio |
| 2026-07 | V-HKGGMK (María Fernanda Salazar) | 645,90 | 636,36 | −9,54 | El Excel anterior pagó julio antes de la NC de USD 2.200 emitida en agosto y nunca la descontó (R-03) |
| 2026-08 | V-7JKDU2 (Andrés Villacís) | 257,53 | 283,03 | +25,50 | Error de digitación de USD 25,50 en el rol histórico |
| 2026-08 | V-MSWDXF (Sebastián Andrade) | 196,73 | 43,69 | −153,04 | El Excel anterior pagó el devengado íntegro con la emisión (política v1.0) sin retener por cobranza (R-04) |

Total histórico 23.717,51 frente a 23.480,43 de la herramienta (diferencia −237,08).

## Prueba B · lado INDUVALLAS: anonimizar y comprobar que el cálculo no cambia

1. En un navegador sin datos, importe `Prueba_01_Datos_ficticios_INDUVALLAS.xlsx` (Reemplazar). Verá los nombres ficticios completos.
2. Fecha de referencia 2026-09-14. Anote la comisión liquidable total de agosto 2026 en el rol: debe ser **USD 3.338,46**.
3. Datos → Exportar copia anonimizada… → clave `prueba-kam-2026`, escala 1 → se descargan el Excel anonimizado y el mapa. El Excel debe ser idéntico en contenido a `Prueba_02_Datos_anonimizados.xlsx` (mismos seudónimos: la anonimización es determinista por clave).
4. Importe el Excel anonimizado que acaba de generar (Reemplazar). El rol de agosto debe mostrar la misma comisión liquidable total, **USD 3.338,46**, ahora con seudónimos.

## Prueba C · por línea de comando (sin navegador)

```
npm run anonimizar -- dist/pruebas/Prueba_01_Datos_ficticios_INDUVALLAS.xlsx /tmp/anon.xlsx --clave "prueba-kam-2026"
```

Produce `/tmp/anon.xlsx` (idéntico a Prueba_02) y `/tmp/anon.mapa.json`.

## Qué mirar en el contraste

- Las diferencias por clawback (R-03) y por retención (R-04) son las que la política actualizada introduce frente a un Excel que pagaba con la emisión; la herramienta las explica línea por línea en el Motor de cálculo.
- Las diferencias por error de digitación o pago duplicado no tienen explicación en el ledger: son hallazgos sobre el proceso anterior.
- Con datos reales, cada fila "por revisar" se documenta con regla, dato o supuesto que la origina antes de dar por validado el cálculo.

*kam-Analytica S.A.S. · RUC 1793220761001 · Datos ficticios en modo demostración*
