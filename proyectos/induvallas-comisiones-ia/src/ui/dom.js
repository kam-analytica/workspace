/**
 * Utilidades de DOM sin framework: creación de elementos, tablas ordenables, botones, campos, modales, toasts y descargas.
 * @module ui/dom
 */
export function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node) && !Array.isArray(attrs)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  } else if (attrs !== undefined) {
    hijos.unshift(attrs);
  }
  agregar(el, hijos);
  return el;
}

export function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

/** Como Element.append, pero ignora null/false y aplana arreglos. Usar siempre en lugar de append nativo. */
export function poner(el, ...hijos) {
  return agregar(el, hijos);
}

export function limpiar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function boton(texto, onClick, { tipo = 'secundario', mini = false, deshabilitado = false, titulo = null, clase = '' } = {}) {
  const b = h('button', { type: 'button', class: `boton boton-${tipo}${mini ? ' boton-mini' : ''} ${clase}`.trim(), title: titulo, onClick }, texto);
  if (deshabilitado) b.disabled = true;
  return b;
}

export function campo(etiqueta, control, ayuda = null) {
  return h('label', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, etiqueta), control, ayuda ? h('span', { class: 'ayuda' }, ayuda) : null);
}

export function select(opciones, valor, onChange, attrs = {}) {
  const s = h('select', { ...attrs, onChange: (e) => onChange && onChange(e.target.value, e) });
  for (const o of opciones) {
    const opt = h('option', { value: o.valor }, o.texto);
    if (String(o.valor) === String(valor)) opt.selected = true;
    if (o.deshabilitado) opt.disabled = true;
    s.append(opt);
  }
  return s;
}

export function input(tipo, valor, onInput, attrs = {}) {
  const i = h('input', { type: tipo, ...attrs, onInput: (e) => onInput && onInput(e.target.value, e) });
  if (valor !== undefined && valor !== null) i.value = valor;
  return i;
}

export function badge(texto, clase = 'badge-neutro', titulo = null) {
  return h('span', { class: `badge ${clase}`, title: titulo }, texto);
}

export function tarjeta(titulo, contenido, { clase = '', acciones = null, memorable = false, subtitulo = null, id = null } = {}) {
  const cab = titulo || acciones ? h('div', { class: 'tarjeta-cab' }, h('div', null, titulo ? h('h2', null, titulo) : null, subtitulo ? h('div', { class: 'ayuda' }, subtitulo) : null), acciones ? h('div', { class: 'acciones' }, acciones) : null) : null;
  return h('section', { class: `tarjeta ${memorable ? 'tarjeta-memorable' : ''} ${clase}`.trim(), id }, cab, contenido);
}

export function vacio(mensaje) {
  return h('div', { class: 'vacio' }, mensaje);
}

/**
 * Tabla con encabezados ordenables y fila de totales.
 * columnas: [{ clave, titulo, num?, formato?(valor, fila), ordenar?(fila), ancho?, titulo_largo? }]
 */
export function tabla({ columnas, filas, totales = null, ordenable = true, claseFila = null, alHacerClic = null, compacta = false, clave = null, ordenInicial = null }) {
  let orden = ordenInicial ? { ...ordenInicial } : null;
  const env = h('div', { class: 'tabla-envoltorio' });
  const t = h('table', { class: `tabla ${compacta ? 'tabla-compacta' : ''}`.trim() });
  env.append(t);
  const render = () => {
    limpiar(t);
    const thead = h('thead');
    const tr = h('tr');
    for (const c of columnas) {
      const th = h('th', { class: `${c.num ? 'num' : ''} ${ordenable && c.ordenar !== false ? 'ordenable' : ''}`.trim(), title: c.tituloLargo || null, style: c.ancho ? { width: c.ancho } : null }, c.titulo);
      if (orden && orden.clave === c.clave) th.append(h('span', { class: 'orden' }, orden.desc ? '▼' : '▲'));
      if (ordenable && c.ordenar !== false) {
        th.addEventListener('click', () => {
          orden = orden && orden.clave === c.clave ? { clave: c.clave, desc: !orden.desc } : { clave: c.clave, desc: !!c.num };
          render();
        });
      }
      tr.append(th);
    }
    thead.append(tr);
    t.append(thead);
    let lista = [...filas];
    if (orden) {
      const col = columnas.find((c) => c.clave === orden.clave);
      const val = (f) => (col.ordenar ? col.ordenar(f) : f[col.clave]);
      lista.sort((a, b) => {
        const x = val(a);
        const y = val(b);
        const r = x === y ? 0 : x === null || x === undefined ? 1 : y === null || y === undefined ? -1 : x < y ? -1 : 1;
        return orden.desc ? -r : r;
      });
    }
    const tbody = h('tbody');
    for (const f of lista) {
      const tr = h('tr', { class: `${claseFila ? claseFila(f) || '' : ''} ${alHacerClic ? 'clic' : ''}`.trim(), dataset: clave ? { clave: String(f[clave]) } : null });
      for (const c of columnas) {
        const v = f[c.clave];
        tr.append(h('td', { class: c.num ? 'num' : null }, c.formato ? c.formato(v, f) : v === null || v === undefined ? '—' : v));
      }
      if (alHacerClic) tr.addEventListener('click', () => alHacerClic(f));
      tbody.append(tr);
    }
    if (!lista.length) tbody.append(h('tr', null, h('td', { colspan: columnas.length, class: 'silencioso cen' }, 'Sin registros')));
    t.append(tbody);
    if (totales) {
      const tfoot = h('tfoot');
      const tr = h('tr', { class: 'fila-total' });
      for (const c of columnas) {
        const v = totales[c.clave];
        tr.append(h('td', { class: c.num ? 'num' : null }, v === undefined ? '' : c.formato && v !== null && typeof v !== 'string' ? c.formato(v, totales) : v));
      }
      tfoot.append(tr);
      t.append(tfoot);
    }
  };
  render();
  return env;
}

/* Toasts */
let contenedorToasts = null;
export function toast(mensaje, tipo = 'info', ms = 3800) {
  if (!contenedorToasts) {
    contenedorToasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(contenedorToasts);
  }
  const t = h('div', { class: `toast toast-${tipo}` }, mensaje);
  contenedorToasts.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

/* Modales */
export function modal({ titulo, cuerpo, acciones = [], cerrable = true, ancho = null }) {
  const fondo = h('div', { class: 'modal-fondo', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo });
  const caja = h('div', { class: 'modal', style: ancho ? { width: ancho } : null });
  caja.append(h('h2', null, titulo), h('div', { class: 'modal-cuerpo' }, cuerpo));
  const cerrar = () => fondo.remove();
  if (acciones.length) {
    const fila = h('div', { class: 'modal-acciones' });
    for (const a of acciones) {
      fila.append(
        boton(a.texto, async () => {
          const r = a.onClick ? await a.onClick() : true;
          if (r !== false && a.cierra !== false) cerrar();
        }, { tipo: a.tipo || 'secundario' })
      );
    }
    caja.append(fila);
  }
  fondo.append(caja);
  if (cerrable) {
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo) cerrar();
    });
    fondo.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cerrar();
    });
  }
  document.body.append(fondo);
  const primero = caja.querySelector('input, select, textarea, button');
  if (primero) primero.focus();
  return { cerrar, caja };
}

export function confirmar(titulo, mensaje, { textoConfirmar = 'Confirmar', peligro = false, requerirTexto = null } = {}) {
  return new Promise((resolver) => {
    let entrada = null;
    const cuerpo = [h('p', null, mensaje)];
    if (requerirTexto) {
      entrada = input('text', '', null, { placeholder: requerirTexto, 'aria-label': `Escriba ${requerirTexto}` });
      cuerpo.push(campo(`Escriba ${requerirTexto} para confirmar`, entrada));
    }
    modal({
      titulo,
      cuerpo,
      acciones: [
        { texto: 'Cancelar', onClick: () => resolver(false) },
        {
          texto: textoConfirmar,
          tipo: peligro ? 'peligro' : 'primario',
          onClick: () => {
            if (requerirTexto && entrada.value.trim() !== requerirTexto) {
              toast(`Debe escribir ${requerirTexto}`, 'advertencia');
              return false;
            }
            resolver(true);
            return true;
          },
        },
      ],
    });
  });
}

export function pedirMotivo(titulo, mensaje, { textoConfirmar = 'Continuar', minimo = 8 } = {}) {
  return new Promise((resolver) => {
    const area = h('textarea', { placeholder: 'Motivo (obligatorio)', 'aria-label': 'Motivo' });
    modal({
      titulo,
      cuerpo: [h('p', null, mensaje), campo('Motivo', area, `Mínimo ${minimo} caracteres. Queda registrado en la bitácora.`)],
      acciones: [
        { texto: 'Cancelar', onClick: () => resolver(null) },
        {
          texto: textoConfirmar,
          tipo: 'primario',
          onClick: () => {
            const m = area.value.trim();
            if (m.length < minimo) {
              toast(`El motivo debe tener al menos ${minimo} caracteres`, 'advertencia');
              return false;
            }
            resolver(m);
            return true;
          },
        },
      ],
    });
  });
}

/** Descarga un archivo desde el navegador. */
export function descargar(nombre, datos, tipo = 'application/octet-stream') {
  const blob = datos instanceof Blob ? datos : new Blob([datos], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 2000);
}

export function leerArchivo(archivo, modo = 'arraybuffer') {
  return new Promise((resolver, rechazar) => {
    const r = new FileReader();
    r.onload = () => resolver(r.result);
    r.onerror = () => rechazar(r.error);
    if (modo === 'texto') r.readAsText(archivo);
    else r.readAsArrayBuffer(archivo);
  });
}

export function selectorArchivo(accept, onArchivo) {
  return () => {
    const i = h('input', { type: 'file', accept, class: 'oculto', 'aria-hidden': 'true' });
    i.addEventListener('change', () => {
      if (i.files && i.files[0]) onArchivo(i.files[0]);
      i.remove();
    });
    document.body.append(i);
    i.click();
    setTimeout(() => i.remove(), 120000);
  };
}
