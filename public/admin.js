'use strict';

(function admin() {
  const $ = (s) => document.querySelector(s);
  const LABELS = { nuevo: 'Nuevo', contactado: 'Contactado', reunion: 'Reunión agendada', propuesta: 'Propuesta enviada', ganado: 'Ganado', perdido: 'Perdido' };
  let leads = [];
  let statuses = Object.keys(LABELS);
  let current = null;
  const dateFmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

  async function api(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('Sesión expirada'); }
    if (!res.ok) throw new Error(data.error || 'Error');
    return data;
  }

  function showLogin() {
    $('#login-view').hidden = false;
    $('#app-view').hidden = true;
    $('#logout').hidden = true;
    $('#password').focus();
  }
  async function showApp() {
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    $('#logout').hidden = false;
    await load();
  }

  async function load() {
    $('#admin-status').textContent = 'Cargando…';
    const data = await api('/api/leads');
    leads = data.leads;
    statuses = data.statuses;
    const sel = $('#filter-status');
    if (sel.options.length === 1) {
      statuses.forEach((s) => sel.add(new Option(LABELS[s] || s, s)));
    }
    render();
    $('#admin-status').textContent = `Actualizado: ${dateFmt.format(new Date())}`;
  }

  function stat(v, l) {
    const d = document.createElement('div');
    d.className = 'stat';
    const a = document.createElement('div'); a.className = 'v'; a.textContent = v;
    const b = document.createElement('div'); b.className = 'l'; b.textContent = l;
    d.append(a, b);
    return d;
  }

  function render() {
    const now = Date.now();
    const week = leads.filter((l) => now - new Date(l.createdAt).getTime() < 7 * 864e5).length;
    const open = leads.filter((l) => !['ganado', 'perdido'].includes(l.status)).length;
    const won = leads.filter((l) => l.status === 'ganado').length;
    const closed = won + leads.filter((l) => l.status === 'perdido').length;
    const withDiag = leads.filter((l) => l.diagnostic);
    const avgDiag = withDiag.length ? Math.round(withDiag.reduce((s, l) => s + l.diagnostic.overall, 0) / withDiag.length) : '—';
    const stats = $('#stats');
    stats.textContent = '';
    stats.append(
      stat(leads.length, 'Prospectos totales'),
      stat(week, 'Últimos 7 días'),
      stat(open, 'En seguimiento'),
      stat(closed ? `${Math.round((won / closed) * 100)}%` : '—', 'Tasa de cierre'),
      stat(avgDiag, 'Diagnóstico promedio'),
    );

    const q = $('#search').value.trim().toLowerCase();
    const st = $('#filter-status').value;
    const list = leads.filter((l) =>
      (!st || l.status === st) &&
      (!q || [l.name, l.email, l.company, l.message, l.phone].join(' ').toLowerCase().includes(q)));

    const tbody = $('#rows');
    tbody.textContent = '';
    $('#empty').hidden = list.length > 0;
    list.forEach((l) => {
      const tr = document.createElement('tr');
      const td = (content) => { const c = document.createElement('td'); if (content instanceof Node) c.appendChild(content); else c.textContent = content || '—'; tr.appendChild(c); return c; };
      td(dateFmt.format(new Date(l.createdAt)));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'link-btn';
      btn.textContent = l.name;
      btn.setAttribute('aria-label', `Ver detalle de ${l.name}`);
      btn.addEventListener('click', () => openDetail(l.id));
      const cwrap = document.createElement('div');
      const em = document.createElement('div'); em.className = 'small muted'; em.textContent = l.email;
      cwrap.append(btn, em);
      td(cwrap);
      td(l.company);
      td(l.service);
      td(l.diagnostic ? `${l.diagnostic.overall}/100` : '');
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', `Estado de ${l.name}`);
      statuses.forEach((s) => sel.add(new Option(LABELS[s] || s, s, false, s === l.status)));
      sel.addEventListener('change', async () => {
        try {
          const r = await api(`/api/leads/${l.id}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
          Object.assign(l, r.lead);
          $('#admin-status').textContent = `Estado de ${l.name} actualizado a “${LABELS[sel.value]}”.`;
          render();
        } catch (e) { $('#admin-status').textContent = `No se pudo actualizar: ${e.message}`; }
      });
      td(sel);
      tbody.appendChild(tr);
    });
  }

  function openDetail(id) {
    current = leads.find((l) => l.id === id);
    if (!current) return;
    $('#d-title').textContent = current.name;
    const dl = $('#d-list');
    dl.textContent = '';
    const rows = [
      ['Fecha', dateFmt.format(new Date(current.createdAt))],
      ['Correo', current.email],
      ['Teléfono', current.phone],
      ['Empresa', current.company],
      ['Tema', current.service],
      ['Estado', LABELS[current.status]],
      ['Mensaje', current.message],
    ];
    if (current.diagnostic) {
      rows.push(['Diagnóstico', `${current.diagnostic.overall}/100 — ` + current.diagnostic.areas.map((a) => `${a.name}: ${a.score}`).join(' · ')]);
    }
    rows.forEach(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v || '—';
      dl.append(dt, dd);
    });
    $('#d-notes').value = current.notes || '';
    $('#d-status').textContent = '';
    $('#d-mail').href = `mailto:${encodeURIComponent(current.email)}?subject=${encodeURIComponent('Sapti — seguimiento a tu mensaje')}`;
    $('#detail').showModal();
  }

  $('#d-close').addEventListener('click', () => $('#detail').close());
  $('#d-save').addEventListener('click', async () => {
    try {
      const r = await api(`/api/leads/${current.id}`, { method: 'PATCH', body: JSON.stringify({ notes: $('#d-notes').value }) });
      Object.assign(current, r.lead);
      $('#d-status').textContent = 'Notas guardadas.';
    } catch (e) { $('#d-status').textContent = `No se pudo guardar: ${e.message}`; }
  });
  $('#d-delete').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a ${current.name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/leads/${current.id}`, { method: 'DELETE' });
      leads = leads.filter((l) => l.id !== current.id);
      $('#detail').close();
      $('#admin-status').textContent = 'Prospecto eliminado.';
      render();
    } catch (e) { $('#d-status').textContent = `No se pudo eliminar: ${e.message}`; }
  });

  $('#search').addEventListener('input', render);
  $('#filter-status').addEventListener('change', render);
  $('#refresh').addEventListener('click', () => load().catch(() => {}));
  $('#logout').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); showLogin(); });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.hidden = true;
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
      $('#password').value = '';
      await showApp();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      $('#password').focus();
    }
  });

  api('/api/session').then((s) => (s.authed ? showApp() : showLogin())).catch(showLogin);
})();
