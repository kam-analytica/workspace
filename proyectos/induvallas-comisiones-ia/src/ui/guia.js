/**
 * Capa didáctica: recorrido inicial, pasos del cierre mensual, ayuda por pestaña, glosario y guion de la demostración.
 * Todo el texto de ayuda vive aquí para revisarlo en un solo lugar.
 * @module ui/guia
 */
import { h, modal, boton } from './dom.js';
import { estado, hayDatos, esDemo, periodoAprobado, resultadoPeriodo, estadoLiquidacion, irA } from './estado.js';
import { AUTOR_DEMO } from '../seed/defaults.js';

/* ------------------------------------------------------------------ Glosario */
export const GLOSARIO = {
  baseComisionable: { t: 'Base comisionable', d: 'Valor de la factura sin IVA menos la comisión de agencia (si la venta pasó por una agencia o central de medios). Sobre esta base se aplica el porcentaje de comisión. Regla R-00.' },
  cumplimiento: { t: 'Cumplimiento', d: 'Base comisionable del mes dividida para la cuota del vendedor. Con 100 % se cumple la cuota exacta. Define el tramo. Regla R-01.' },
  tramo: { t: 'Tramo', d: 'Escalón de cumplimiento (por ejemplo «Base» de 90 % a 100 %) que fija el porcentaje de comisión de todas las facturas del vendedor en el mes. Regla R-01.' },
  multiplicador: { t: 'Multiplicador', d: 'Factor que se aplica a la tasa base de cada línea y canal para obtener el porcentaje del tramo (0,5 reduce a la mitad; 1,25 lo eleva un cuarto).' },
  devengado: { t: 'Devengado', d: 'Comisión ganada con la factura: base comisionable por el porcentaje del tramo. Se gana al facturar, pero solo se paga según la cobranza. Regla R-01.' },
  liberado: { t: 'Liberado', d: 'Parte del devengado que ya se puede pagar porque la factura se cobró, en proporción a lo cobrado y según los días que tardó el cobro. Regla R-04.' },
  retenido: { t: 'Retenido', d: 'Comisión devengada que todavía no se paga porque la factura sigue sin cobrarse. Se libera cuando entra el cobro, o caduca si pasa el plazo. Regla R-04.' },
  caducado: { t: 'Caducado', d: 'Comisión que se pierde porque la factura superó el plazo máximo de cobro (121 días en la política actualizada). Regla R-04.' },
  factor: { t: 'Factor de liberación', d: 'Porcentaje de la comisión que se libera según los días entre la emisión de la factura y el cobro: 100 % hasta 60 días, 80 % hasta 90, 50 % hasta 120 y 0 % después. Regla R-04.' },
  rezago: { t: 'No liberado por rezago', d: 'Parte de la comisión que no se libera porque el cobro llegó tarde y el factor fue menor al 100 %. No es caducidad: la factura sí se cobró.' },
  politica: { t: 'Política de cobranza', d: 'Conjunto de reglas versionadas que dicen cuándo y cuánto se libera de la comisión según la cobranza. La anterior (v1.0) pagaba todo con la factura; la actualizada (v2.0) paga con el cobro.' },
  transicion: { t: 'Regla de transición', d: 'Cómo se aplica una política nueva a las facturas ya emitidas: solo a las emitidas desde su vigencia (opción por defecto) o a toda la cartera pendiente de cobro.' },
  cartera: { t: 'Cartera de comisiones pendientes', d: 'Lista de facturas con comisión retenida: cuántos días llevan, cuánto se liberaría si se cobraran hoy y cuándo caducan. Sirve para presionar la cobranza.' },
  clawback: { t: 'Clawback', d: 'Devolución de una comisión ya pagada cuando una nota de crédito anula parte de una factura que ya se había cobrado. Se descuenta en el mes de la nota de crédito. Regla R-03.' },
  notaCredito: { t: 'Nota de crédito', d: 'Documento que reduce el valor de una factura. Si llega antes de liquidar, reduce la base; si llega después de pagada la comisión, genera clawback. Regla R-03.' },
  saldoTrasladado: { t: 'Saldo trasladado', d: 'Cuando en un mes el neto a pagar es negativo (por clawback), el saldo se descuenta en el mes siguiente. Regla R-03.' },
  tope: { t: 'Tope mensual', d: 'Máximo de comisión pagable por vendedor en un mes. El excedente queda visible como pendiente de una política de diferimiento; no se pierde en silencio. Regla R-05.' },
  bonoMix: { t: 'Bono mix', d: 'Bono del 10 % sobre el devengado del mes cuando Retail Media representa al menos el 20 % de la base comisionable. Regla R-02.' },
  bonoClienteNuevo: { t: 'Bono cliente nuevo', d: 'USD 150 por cada cliente activado en el mes (hasta 5) para el vendedor titular del cliente. Regla R-02.' },
  ajuste: { t: 'Ajuste manual', d: 'Suma o resta al neto de un vendedor con motivo obligatorio, autor y fecha. Aparece en el ledger y en la bitácora. Regla R-06.' },
  ledger: { t: 'Ledger', d: 'Cuadro paso a paso de nueve líneas que muestra cómo se llega de la facturación a la comisión liquidable de un vendedor, con la regla y la fórmula de cada línea.' },
  periodoAprobado: { t: 'Período aprobado', d: 'Mes bloqueado por Gerencia Financiera: su cálculo queda congelado tal como se aprobó y no se recalcula. Reabrirlo exige un motivo que queda en la bitácora. Regla R-07.' },
  periodoEnCurso: { t: 'Período en curso', d: 'El mes de la fecha de referencia: todavía se le suman facturas y cobros; sus cifras cambian hasta el corte.' },
  fechaReferencia: { t: 'Fecha de referencia', d: 'Fecha «hoy» del cálculo. Define qué mes está en curso y la antigüedad de la cartera. Con datos reales debe ser la fecha del día; la demostración usa el 14-sep-2026.' },
  liquidable: { t: 'Comisión liquidable', d: 'Lo que efectivamente se paga en el mes: liberado del período más liberado de cartera, menos clawback y saldo anterior, más ajustes, limitado por el tope. Línea L9 del ledger.' },
  bitacora: { t: 'Bitácora', d: 'Registro de toda acción con fecha, usuario y detalle: cargas de datos, cambios de parámetros, ajustes, aprobaciones, reaperturas y exportaciones.' },
  seudonimizacion: { t: 'Copia anonimizada', d: 'Exportación de los datos con nombres y códigos reemplazados por seudónimos estables. Permite validar el cálculo fuera de INDUVALLAS sin compartir datos personales.' },
};

/** Texto con término subrayado y definición al pasar el ratón; clic abre el glosario en ese término. */
export function termino(clave, texto = null) {
  const g = GLOSARIO[clave];
  if (!g) return texto || clave;
  return h('span', { class: 'termino', title: g.d, tabindex: 0, role: 'button', 'aria-label': `${g.t}: ${g.d}`, onClick: (e) => { e.stopPropagation(); mostrarGlosario(clave); }, onKeydown: (e) => { if (e.key === 'Enter') { e.stopPropagation(); mostrarGlosario(clave); } } }, texto || g.t);
}

export function mostrarGlosario(claveInicial = null) {
  const lista = Object.entries(GLOSARIO).sort((a, b) => a[1].t.localeCompare(b[1].t, 'es'));
  const cuerpo = h('dl', { class: 'glosario' }, lista.map(([k, g]) => [h('dt', { id: `glos-${k}`, class: k === claveInicial ? 'glos-activo' : '' }, g.t), h('dd', null, g.d)]));
  const m = modal({ titulo: 'Glosario de términos', cuerpo, ancho: '720px', acciones: [{ texto: 'Cerrar' }] });
  if (claveInicial) setTimeout(() => m.caja.querySelector(`#glos-${claveInicial}`)?.scrollIntoView({ block: 'center' }), 50);
  return m;
}

/* ------------------------------------------------------------------ Ayuda por pestaña */
export const AYUDA_PESTANAS = {
  panel: {
    proposito: 'Vista de conjunto del cierre: veredicto, tendencia, mix, ranking y alertas.',
    pasos: [
      ['Elija el período', 'En la barra superior seleccione el mes que va a cerrar (por defecto, el último mes terminado).'],
      ['Lea el veredicto', 'Verde: listo. Ámbar: con observaciones. Rojo: hay alertas críticas que atender antes de aprobar.'],
      ['Revise el ranking', 'Haga clic en un vendedor para abrir su cálculo paso a paso en Motor de cálculo.'],
      ['Atienda las alertas', 'Cada alerta indica regla, vendedor y factura; al hacer clic lo lleva al lugar del cálculo que la origina.'],
    ],
  },
  datos: {
    proposito: 'Cargar, respaldar y conciliar la información. Es el primer paso de cada mes.',
    pasos: [
      ['Descargue la plantilla', 'Botón «Descargar plantilla». Complete las seis hojas: Vendedores (con cuotas), Agencias, Clientes, Facturas (sin IVA), Cobros y NotasCredito.'],
      ['Importe el archivo', 'Botón «Importar archivo…». La herramienta revisa fila por fila y muestra los errores con hoja, fila y columna. Solo carga si no hay errores.'],
      ['Elija cómo cargar', '«Reemplazar» borra lo anterior (primera carga); «Agregar» suma registros nuevos (cargas mensuales).'],
      ['Fije la fecha de referencia', 'Con datos reales, la fecha del día. Define el mes en curso y la antigüedad de la cartera.'],
      ['Respalde', 'Al cerrar cada mes, «Exportar respaldo JSON». Los datos viven solo en este navegador.'],
    ],
  },
  tabla: {
    proposito: 'Definir qué porcentaje de comisión corresponde a cada tramo de cumplimiento, línea y canal.',
    pasos: [
      ['Revise la matriz vigente', 'La tabla superior muestra los porcentajes que se están aplicando al período seleccionado.'],
      ['Edite si hace falta', 'Cambie tasas base y multiplicadores y pulse «Generar celdas», o edite celda a celda. Ajuste bonos y tope.'],
      ['Mida el impacto antes de guardar', '«Vista previa del impacto» recalcula el devengado de cada vendedor con la versión editada.'],
      ['Guarde como nueva versión', 'Indique desde qué fecha rige y un comentario. Las versiones anteriores se conservan intactas.'],
    ],
  },
  politica: {
    proposito: 'Definir cuándo se libera la comisión según la cobranza, comparar políticas y seguir la cartera pendiente.',
    pasos: [
      ['Revise la política vigente', 'Tramos de días con su factor de liberación, plazo de caducidad y regla de transición.'],
      ['Compare anterior y actualizada', 'El simulador aplica cada política al mismo período y muestra liberado, retenido y caducado por vendedor.'],
      ['Use la cartera para cobrar', 'Ordene por «Días restantes»: las facturas en rojo caducan en 15 días o menos. Exporte la lista a Excel para Cobranzas.'],
      ['Guarde cambios como versión', 'Cualquier cambio de tramos o factores se guarda con fecha de vigencia y comentario; nunca se sobrescribe una versión.'],
    ],
  },
  motor: {
    proposito: 'Entender y defender la comisión de cada vendedor: de la facturación a la comisión liquidable, línea por línea.',
    pasos: [
      ['Elija el vendedor', 'Selector arriba a la derecha. El gauge muestra su cumplimiento y el tramo alcanzado.'],
      ['Recorra el ledger', 'Nueve líneas en orden: facturación y base, tramo y devengado, bonos, liberado del mes, liberado de cartera, retenido y caducado, clawback, ajustes y comisión liquidable. Haga clic en una línea para ver las facturas que la componen.'],
      ['Lea la explicación', 'El texto de la derecha narra el cálculo con las reglas citadas; sirve para responder al vendedor.'],
      ['Pruebe escenarios', 'Los deslizadores del simulador responden «¿qué pasa si factura más, cobra antes o cambia el mix?» sin tocar los datos reales.'],
    ],
  },
  liquidacion: {
    proposito: 'Cerrar el mes: rol de comisiones, ajustes, controles, aprobación, exportación y auditoría.',
    pasos: [
      ['Revise el rol', 'Una fila por vendedor con todas las líneas. Haga clic en un vendedor para ver su detalle.'],
      ['Registre ajustes si corresponde', 'Solo con motivo. Quedan en el ledger y en la bitácora.'],
      ['Verifique los controles del cierre', 'Cuadre del rol con el detalle, cobros conciliados, notas de crédito aplicadas, meses anteriores aprobados y alertas críticas.'],
      ['Valide, apruebe y genere el rol', 'Finanzas valida; Gerencia Financiera aprueba y bloquea el mes; luego se genera el rol. Reabrir exige motivo.'],
      ['Exporte y archive', '«Exportar Excel» entrega rol y detalle por factura; «Imprimir rol» usa una vista limpia. La bitácora registra todo.'],
      ['Contraste con el Excel anterior', 'Cargue el rol histórico para ver, vendedor por mes, las diferencias con la herramienta y su explicación.'],
    ],
  },
  asistente: {
    proposito: 'Preguntar en lenguaje natural sobre el período seleccionado. Solo responde lo que puede calcular y cita las reglas.',
    pasos: [
      ['Pruebe un ejemplo', 'Haga clic en una de las preguntas sugeridas.'],
      ['Pregunte por un vendedor', 'Por ejemplo «¿por qué Carolina cobra menos de lo devengado?» o «cartera vencida de Sebastián».'],
      ['Simule', '«¿Cuánto costaría si Juan Pablo factura 5.000 más?» ejecuta el simulador y explica el cambio de tramo.'],
      ['Salte a la pantalla', 'Cada respuesta trae un botón «Ver en la herramienta» que abre el cálculo correspondiente.'],
    ],
  },
};

/* ------------------------------------------------------------------ Guion de la demostración */
export const GUION_DEMO = [
  { titulo: 'Carolina Mera supera el tope', que: 'Cumplimiento de 240 % con Retail Media por encima del 60 %: gana el bono mix y dos bonos por cliente nuevo, pero el neto supera el tope de USD 1.500 y el excedente queda visible como pendiente.', reglas: 'R-02, R-05', vendedorId: 'V07', pestana: 'motor', mirar: 'Línea L9 del ledger y alerta A-05.' },
  { titulo: 'Diego Cárdenas queda con saldo negativo', que: 'Con 64 % de cumplimiento no devenga comisión, y una nota de crédito de agosto anula gran parte de una factura de julio ya pagada: el clawback supera lo liberado y el saldo pasa a septiembre.', reglas: 'R-01, R-03', vendedorId: 'V04', pestana: 'motor', mirar: 'Líneas L2, L7 y L9; alertas A-01, A-06 y A-11.' },
  { titulo: 'Sebastián Andrade: caducidades y cartera en riesgo', que: 'Su cobranza se deterioró desde mayo: tres facturas caducaron en agosto y otras están a pocos días de caducar. Es el caso para presionar la cobranza.', reglas: 'R-04', vendedorId: 'V08', pestana: 'politica', mirar: 'Cartera de comisiones pendientes ordenada por días restantes; alertas A-03 y A-04.' },
  { titulo: 'Juan Pablo Ortiz a medio punto del Acelerador', que: 'Cumplimiento de 99,5 %: le faltaron USD 250 de base para pasar al tramo Acelerador. La herramienta lo señala para que el vendedor sepa qué tan cerca estuvo.', reglas: 'R-01', vendedorId: 'V06', pestana: 'motor', mirar: 'Gauge, línea L2 y alerta A-07.' },
  { titulo: 'María Fernanda Salazar con clawback por nota de crédito', que: 'Una factura de julio cobrada y pagada recibe en agosto una nota de crédito de USD 2.200: la comisión pagada sobre el valor anulado se descuenta en agosto.', reglas: 'R-03', vendedorId: 'V01', pestana: 'motor', mirar: 'Línea L7 del ledger y alerta A-06.' },
];

/* ------------------------------------------------------------------ Pasos del cierre mensual */
export function pestanasVisitadas() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem('kam.visitadas') || '[]'));
  } catch (e) {
    return new Set();
  }
}

export function marcarVisitada(id) {
  try {
    const v = pestanasVisitadas();
    v.add(id);
    sessionStorage.setItem('kam.visitadas', JSON.stringify([...v]));
  } catch (e) {
    /* sin almacenamiento de sesión */
  }
}

/** Estado de los cinco pasos del cierre para el período seleccionado. */
export function pasosCierre() {
  const visitadas = pestanasVisitadas();
  const per = resultadoPeriodo();
  const conDatos = hayDatos();
  const parametrosReales = (estado.dataset?.esquemas || []).some((e) => e.autor !== AUTOR_DEMO) || (estado.dataset?.politicas || []).some((p) => p.autor !== AUTOR_DEMO);
  const vendedores = per ? Object.keys(per.vendedores) : [];
  const estados = vendedores.map((v) => estadoLiquidacion(estado.periodo, v));
  const aprobado = periodoAprobado();
  const enRol = estados.length > 0 && estados.every((e) => e === 'en_rol');
  const validados = estados.filter((e) => e !== 'calculada').length;
  const criticas = per ? estado.resultado.alertas.filter((a) => a.periodo === estado.periodo && a.severidad === 'critico').length : 0;
  const pasos = [
    { id: 'datos', titulo: 'Cargar datos', pestana: 'datos', hecho: conDatos, instruccion: conDatos ? (esDemo() ? 'Datos ficticios cargados. Para un mes real, importe la plantilla en Datos.' : `${estado.dataset.facturas.length} facturas cargadas.`) : 'Importe la plantilla Excel o cargue los datos de demostración en la pestaña Datos.' },
    { id: 'parametros', titulo: 'Revisar parámetros', pestana: 'tabla', hecho: parametrosReales || (visitadas.has('tabla') && visitadas.has('politica')), instruccion: parametrosReales ? 'Parámetros propios registrados.' : 'Confirme la matriz de porcentajes (Tabla de determinación) y la política de cobranza (Política de cobranza). En la demostración basta con revisarlas.' },
    { id: 'calculo', titulo: 'Revisar cálculo y alertas', pestana: 'motor', hecho: visitadas.has('motor') && visitadas.has('panel'), instruccion: criticas ? `Hay ${criticas} alerta${criticas === 1 ? '' : 's'} crítica${criticas === 1 ? '' : 's'}: revíselas en el Panel y en el Motor de cálculo antes de aprobar.` : 'Recorra el ledger de cada vendedor en Motor de cálculo y las alertas del Panel.' },
    { id: 'aprobar', titulo: 'Validar y aprobar', pestana: 'liquidacion', hecho: aprobado, instruccion: aprobado ? 'Período aprobado y bloqueado.' : per?.enCurso ? 'El mes está en curso: se aprueba después del corte.' : validados < vendedores.length ? `Valide las liquidaciones (${validados} de ${vendedores.length}) en Liquidación y auditoría; luego Gerencia aprueba.` : 'Todas validadas: Gerencia Financiera puede aprobar y bloquear el mes.' },
    { id: 'rol', titulo: 'Generar y exportar el rol', pestana: 'liquidacion', hecho: enRol, instruccion: enRol ? 'Rol generado. Exporte a Excel o imprima.' : aprobado ? 'Pulse «Generar rol» y luego «Exportar Excel».' : 'Disponible después de aprobar el período.' },
  ];
  const actual = pasos.find((p) => !p.hecho) || null;
  for (const p of pasos) p.actual = p === actual;
  return pasos;
}

/* ------------------------------------------------------------------ Recorrido inicial */
const PAGINAS = () => [
  {
    titulo: '1 · Qué hace esta herramienta',
    cuerpo: [
      h('p', null, 'Calcula la comisión de cada vendedor a partir de las facturas y los cobros, aplica la política de cobranza vigente y produce el rol mensual con trazabilidad completa: cada cifra se puede abrir hasta la factura y la regla que la explica.'),
      h('p', null, 'El cierre de un mes sigue siempre cinco pasos, que verá como una barra de progreso encima del contenido:'),
      h('ol', { class: 'lista-pasos' }, ['Cargar datos (plantilla Excel).', 'Revisar parámetros (matriz de porcentajes y política de cobranza).', 'Revisar cálculo y alertas (Panel y Motor de cálculo).', 'Validar y aprobar (Liquidación y auditoría).', 'Generar y exportar el rol.'].map((t) => h('li', null, t))),
    ],
  },
  {
    titulo: '2 · Las siete pestañas',
    cuerpo: h('dl', { class: 'glosario' }, Object.entries(AYUDA_PESTANAS).map(([id, a]) => [h('dt', null, { panel: 'Panel ejecutivo', datos: 'Datos', tabla: 'Tabla de determinación', politica: 'Política de cobranza', motor: 'Motor de cálculo', liquidacion: 'Liquidación y auditoría', asistente: 'Asistente' }[id]), h('dd', null, a.proposito)])),
  },
  {
    titulo: '3 · Cómo leer una comisión',
    cuerpo: [
      h('p', null, 'De la factura a la comisión liquidable hay cuatro conceptos que conviene distinguir:'),
      h('dl', { class: 'glosario' }, ['baseComisionable', 'devengado', 'liberado', 'retenido', 'caducado', 'liquidable'].map((k) => [h('dt', null, GLOSARIO[k].t), h('dd', null, GLOSARIO[k].d)])),
      h('p', { class: 'ayuda' }, 'Los términos subrayados con puntos en cualquier pantalla muestran su definición al pasar el ratón; el botón «Glosario» de la cabecera los reúne todos.'),
    ],
  },
  {
    titulo: '4 · Por dónde empezar',
    cuerpo: hayDatos()
      ? [
          h('p', null, esDemo() ? 'Están cargados los datos ficticios de demostración (enero a septiembre 2026). El Panel ejecutivo trae un «Guion de la demostración» con cinco casos de control del cierre de agosto; recórralos en orden.' : 'Ya hay datos cargados. Siga la barra de pasos del cierre: le indica qué falta y a dónde ir.'),
          h('p', null, 'Cada pestaña empieza con una tarjeta «Cómo usar esta pestaña» con los pasos numerados. Puede plegarla y volver a abrirla cuando quiera.'),
        ]
      : [
          h('p', null, 'Todavía no hay datos. Tiene dos caminos:'),
          h('ol', { class: 'lista-pasos' }, [h('li', null, h('b', null, 'Ver la demostración: '), 'en la pestaña Datos pulse «Cargar datos de demostración». Son datos ficticios con casos preparados para entender cada regla.'), h('li', null, h('b', null, 'Cargar un mes real: '), 'descargue la plantilla, complétela e impórtela. La herramienta valida cada fila antes de cargar.')]),
          h('p', null, 'Cada pestaña empieza con una tarjeta «Cómo usar esta pestaña» con los pasos numerados.'),
        ],
  },
];

export function mostrarRecorrido({ alCerrar = null } = {}) {
  let indice = 0;
  const paginas = PAGINAS();
  const contenido = h('div', { class: 'recorrido' });
  const noMostrar = h('input', { type: 'checkbox', id: 'no-mostrar-recorrido' });
  const m = modal({ titulo: 'Guía paso a paso', cuerpo: contenido, ancho: '760px', acciones: [] });
  const pintar = () => {
    const p = paginas[indice];
    contenido.replaceChildren(
      h('div', { class: 'recorrido-progreso' }, paginas.map((_, i) => h('span', { class: `punto ${i === indice ? 'activo' : i < indice ? 'hecho' : ''}` }))),
      h('h3', { class: 'recorrido-titulo' }, p.titulo),
      h('div', { class: 'recorrido-cuerpo' }, p.cuerpo),
      h('div', { class: 'modal-acciones' },
        h('label', { class: 'interruptor ayuda', style: { marginRight: 'auto' } }, noMostrar, ' No volver a mostrar al abrir'),
        indice > 0 ? boton('Anterior', () => { indice -= 1; pintar(); }) : null,
        indice < paginas.length - 1 ? boton('Siguiente', () => { indice += 1; pintar(); }, { tipo: 'primario' }) : null,
        indice === paginas.length - 1 && !hayDatos() ? boton('Ir a Datos', () => { cerrar(); irA('datos', { resaltar: 'tarjeta-carga' }); }, { tipo: 'primario' }) : null,
        boton(indice === paginas.length - 1 ? 'Empezar' : 'Cerrar', cerrar)
      )
    );
  };
  const cerrar = () => {
    try {
      if (noMostrar.checked) localStorage.setItem('kam.recorridoVisto', '1');
    } catch (e) {
      /* sin localStorage */
    }
    m.cerrar();
    if (alCerrar) alCerrar();
  };
  pintar();
  return m;
}

export function recorridoVisto() {
  try {
    return localStorage.getItem('kam.recorridoVisto') === '1';
  } catch (e) {
    return true;
  }
}
