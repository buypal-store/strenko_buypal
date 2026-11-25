/* ==========================================
   PEDIDO ARMADO POR EL AGENTE IA (Peldaño en Sento, Volko en Strenko) — 18/11/2026
   Este archivo es IDÉNTICO en los tomadores que lo usan (sento_chatwoot y strenko_buypal).
   Luis y Wendy: el agente NO sube pedidos. Cuando cierra una venta deja el pedido armado y validado en el ERP
   (herramientas.agentes_ia_chats.pedido_borrador, lo arma api/shared/pedido_agente.js). Aquí se muestra una franja
   "<agente> dejó un pedido armado" con el botón "Cargar pedido de <agente>": llena el carrito y los campos, y el asesor
   REVISA y sube como siempre con "Subir pedido". Nada se sube solo.
   - Pide el borrador a api/tomadorIADB con { soloBorrador: true } (rápido: no lee el chat ni usa IA).
   - El ERP deja de entregarlo cuando ya se subió un pedido de ese chat, así no se sube dos veces.
   - Al subir, el pedido lleva "desde_borrador" (queda en pedidos_tomador_log) para medir cuántos salen sin corregir.
   Gancho en app.js: el payload manda BorradorPeldano.cargado().
   ========================================== */
(function () {
  'use strict';
  const API = 'https://erp.buypal.com.pe/api/tomadorIADB';
  const conv = new URLSearchParams(window.location.search).get('conversation_id') || '';
  const BOT = /strenko/i.test(window.location.pathname + ' ' + window.location.hostname + ' ' + (window.catalogoId === 'bicicletas' ? 'strenko' : '')) ? 'Volko' : 'Peldaño';
  let borrador = null, cargado = '', oculto = '', franja = null, vueltas = 0;
  const $ = id => document.getElementById(id);
  const soles = n => 'S/ ' + (Math.round(Number(n || 0) * 100) / 100);
  function nodo(tag, estilo, texto) { const e = document.createElement(tag); if (estilo) e.style.cssText = estilo; if (texto != null) e.textContent = texto; return e; }

  // null = no se pudo preguntar (sin sesión, sin red): se reintenta pronto. false = el ERP respondió que no hay.
  async function pedir() {
    const sesion = window.SesionERP && SesionERP.token ? SesionERP.token() : '';
    if (!sesion) return null;
    try {
      const r = await fetch(API, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ id: Number(conv), soloBorrador: true, sesion }) });
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.borrador && d.borrador.body ? d.borrador : false;
    } catch (_) { return null; }
  }

  function pintar() {
    if (franja) { franja.remove(); franja = null; }
    if (!borrador || oculto === borrador.en) return;
    const b = borrador, cuerpo = b.body || {};
    franja = nodo('div', 'margin:8px 12px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.4;' +
      'background:#0f2a1c;border:1px solid rgba(34,197,94,.55);color:#e5e7eb;box-shadow:0 6px 18px rgba(0,0,0,.35)');
    const yaCargado = cargado === b.en;
    franja.appendChild(nodo('div', 'font-weight:800;margin-bottom:2px', yaCargado ? `🤖 Pedido de ${BOT} cargado: revisa cada campo antes de subir` : `🤖 ${BOT} dejó un pedido armado`));
    const entrega = cuerpo.reparto === 'Shalom' ? 'Shalom' : (cuerpo.distrito || cuerpo.reparto || '');
    franja.appendChild(nodo('div', '', [b.resumen, entrega, cuerpo.cliente].filter(Boolean).join(' · ')));
    // Lo que va a cargar el botón, a la vista ANTES de apretarlo (Luis 25/11: 3 pedidos salieron a otra ciudad sin que se notara)
    const destino = cuerpo.reparto === 'Shalom' ? (b.sede ? 'SHALOM ' + b.sede : String(cuerpo.direccion || '')) : [cuerpo.direccion, cuerpo.distrito].filter(Boolean).join(', ');
    if (destino) franja.appendChild(nodo('div', 'margin-top:4px;padding:4px 8px;border-radius:6px;font-weight:700;background:rgba(250,204,21,.14);color:#fde68a', '📍 Se carga: ' + destino));
    if (cuerpo.horario) franja.appendChild(nodo('div', 'color:#fde68a;margin-top:3px', '⏰ Horario del cliente: ' + (window.Horario ? Horario.texto(cuerpo.horario, true) : cuerpo.horario)));
    if ((b.falta || []).length) franja.appendChild(nodo('div', 'color:#fbbf24;margin-top:3px', '⚠️ Falta: ' + b.falta.join(' · ')));
    if ((b.avisos || []).length) franja.appendChild(nodo('div', 'color:#9ca3af;margin-top:3px', '👀 Revisar: ' + b.avisos.join(' · ')));
    // Pago: en rojo y aparte mientras el banco no lo confirme (Wendy 25/11); se vuelve a mirar cada 45 s
    if (b.pago) franja.appendChild(nodo('div', b.pago.ok ? 'margin-top:6px;font-weight:700;color:#86efac'
      : 'margin-top:6px;padding:5px 8px;border-radius:6px;font-weight:800;background:rgba(239,68,68,.18);color:#fca5a5', (b.pago.ok ? '✅ ' : '🔴 ') + b.pago.texto));
    const fila = nodo('div', 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap');
    const btn = nodo('button', 'padding:8px 12px;border:0;border-radius:8px;cursor:pointer;font-weight:700;font-size:13px;background:#22c55e;color:#04140b',
      yaCargado ? 'Volver a cargar' : 'Cargar pedido de ' + BOT);
    btn.type = 'button';
    btn.addEventListener('click', cargar);
    const cerrar = nodo('button', 'padding:8px 12px;border:1px solid rgba(255,255,255,.2);border-radius:8px;cursor:pointer;font-size:13px;background:transparent;color:#e5e7eb', 'Ocultar');
    cerrar.type = 'button';
    cerrar.addEventListener('click', function () { oculto = b.en; pintar(); });
    fila.appendChild(btn); fila.appendChild(cerrar);
    franja.appendChild(fila);
    const principal = document.querySelector('main');   // entre la barra de arriba y el catálogo
    if (principal && principal.parentNode) principal.parentNode.insertBefore(franja, principal); else document.body.insertBefore(franja, document.body.firstChild);
  }

  function poner(id, valor) {
    const campo = $(id);
    if (!campo || valor === null || valor === undefined || String(valor) === '') return;
    if (campo.tagName === 'SELECT' && !Array.from(campo.options).some(o => o.value === String(valor))) return;   // opción que no existe: lo elige el asesor
    campo.value = String(valor);
    campo.style.borderColor = 'rgba(34,197,94,.4)';
  }

  async function cargar() {
    const b = borrador;
    if (!b || !b.body) return;
    if (state.cart.length && !(await Avisos.preguntar('El carrito ya tiene productos.\n\n¿Reemplazarlos por el pedido que armó ' + BOT + '?'))) return;
    // Carrito: las líneas repetidas del pedido se juntan en una con su cantidad (al subir se vuelven a expandir)
    const grupos = [];
    (b.body.productos || []).forEach(function (p) {
      const precio = Number(p.precio) || 0;
      const g = grupos.find(x => x.sku === p.sku && x.precio === precio);
      if (g) g.cantidad++; else grupos.push({ sku: p.sku, nombre: p.nombre, precio: precio, cantidad: 1 });
    });
    const catalogo = window.productosData || [];
    state.cart = grupos.map(function (g) {
      const c = catalogo.find(x => x.sku === g.sku) || {};
      return { cartId: ++state.cartSeq, sku: g.sku, nombre: c.nombre || g.nombre || 'Producto', precio: g.precio,
        originalPrice: g.precio > 0 ? (Number(c.precio) || g.precio) : 0, cantidad: g.cantidad, type: g.precio > 0 ? 'producto' : 'regalo' };
    });
    state.finalTotal = 0;
    actualizarContador();
    const c = b.body;
    poner('campoCliente', c.cliente); poner('campoDNI', c.dni); poner('campoCelular', c.celular);
    poner('campoDireccion', c.direccion); poner('campoDistrito', c.distrito); poner('campoReferencia', c.referencia);
    poner('campoUbicacion', c.ubicacion); poner('campoCorreo', c.obs3); poner('campoReparto', c.reparto);
    poner('campoPlataforma', c.plataforma); poner('campoFormaPago', c.formaPago); poner('campoPago', c.pago);
    poner('campoBoleta', c.boleta); poner('campoRUC', c.ruc); poner('campoFecha', c.fecha);
    poner('campoAdelanto', c.adelanto); poner('campoEstado', 'Pendiente');
    // Horario (horario.js): el valor va en el campo oculto y el aviso de turno se vuelve a pintar
    if (c.horario && $('campoHorario')) { $('campoHorario').value = c.horario; const t = $('campoTurno'); if (t) t.dispatchEvent(new Event('change', { bubbles: true })); }
    cargado = b.en;
    pintar();
    if (!state.cart.length) { Avisos.mostrar('🤖 ' + BOT + ' no pudo identificar el producto: agrégalo desde el catálogo. Los datos del cliente ya están cargados.'); return; }
    abrirPedidoFinal();   // abre el formulario: la IA de siempre completa SOLO lo que quedó vacío (adelanto por capturas, etc.)
  }

  // Al abrir y luego cada 45 s (el 🟢 puede llegar con el panel ya abierto). Deja de preguntar a los 30 min.
  async function revisar() {
    if (!conv) return;
    const r = await pedir();
    if (r === false) { if (borrador) { borrador = null; pintar(); } }   // ya se subió (o caducó): la franja se va
    else if (r && (!borrador || borrador.en !== r.en || JSON.stringify(borrador.pago) !== JSON.stringify(r.pago))) { borrador = r; pintar(); }
    if (++vueltas < 40) setTimeout(revisar, r === null && vueltas < 8 ? 4000 : 45000);
  }

  window.BorradorPeldano = { cargado: () => cargado, revisar: revisar };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(revisar, 600));
  else setTimeout(revisar, 600);
})();
