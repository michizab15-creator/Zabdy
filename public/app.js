'use strict';

/* ---------- tema ---------- */
(function theme() {
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem('sapti-theme'); } catch {}
  if (saved) root.setAttribute('data-theme', saved);
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dark = root.getAttribute('data-theme')
        ? root.getAttribute('data-theme') === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = dark ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('sapti-theme', next); } catch {}
    });
  });
})();

/* ---------- PWA ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const $ = (s, el = document) => el.querySelector(s);
const yearEl = $('#year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ---------- menú móvil ---------- */
(function nav() {
  const toggle = $('.nav-toggle');
  const links = $('#nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  links.addEventListener('click', (e) => {
    if (e.target.closest('a')) { links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && links.classList.contains('open')) {
      links.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus();
    }
  });
})();

/* ---------- diagnóstico ---------- */
const AREAS = [
  {
    key: 'estrategia', name: 'Estrategia', service: 'Estrategia de negocio',
    questions: [
      'Tenemos una visión y objetivos a 1–3 años que todo el equipo directivo conoce.',
      'Sabemos con claridad qué clientes y mercados priorizar (y cuáles no).',
      'Nuestra propuesta de valor se distingue claramente de la competencia.',
      'Las decisiones importantes se toman con datos y criterios acordados.',
    ],
    tips: [
      'Define 3 a 5 objetivos estratégicos medibles y compártelos con todo el equipo.',
      'Segmenta a tus clientes por rentabilidad y potencial; decide dónde no competir.',
      'Escribe tu propuesta de valor en una frase y valídala con clientes reales.',
    ],
  },
  {
    key: 'operaciones', name: 'Operaciones', service: 'Operaciones y procesos',
    questions: [
      'Nuestros procesos clave están documentados y se siguen de forma consistente.',
      'Rara vez tenemos retrabajos, cuellos de botella o “apagar incendios”.',
      'Medimos indicadores operativos (tiempos, costos, calidad) cada semana o mes.',
      'Las herramientas y sistemas que usamos nos ahorran tiempo en lugar de quitarlo.',
    ],
    tips: [
      'Mapea tus 3 procesos más críticos de principio a fin e identifica dónde se atora el trabajo.',
      'Elige 4 a 6 indicadores operativos y revísalos en una reunión corta y fija.',
      'Elimina pasos y aprobaciones que no agregan valor antes de automatizar.',
    ],
  },
  {
    key: 'crecimiento', name: 'Crecimiento', service: 'Crecimiento y salida al mercado',
    questions: [
      'Tenemos un flujo predecible de nuevos clientes potenciales.',
      'Conocemos nuestra tasa de conversión y el costo de adquirir un cliente.',
      'Nuestros precios reflejan el valor que entregamos y protegen el margen.',
      'Nuestros clientes vuelven a comprar y nos recomiendan.',
    ],
    tips: [
      'Construye un embudo comercial simple con etapas claras y mide la conversión entre ellas.',
      'Revisa tu estrategia de precios: ¿cobras por valor o por costo?',
      'Crea un programa de seguimiento a clientes actuales para recompra y referidos.',
    ],
  },
];
const TOTAL_Q = AREAS.reduce((n, a) => n + a.questions.length, 0);
let lastDiagnostic = null;

(function diagnostic() {
  const form = $('#diag-form');
  if (!form) return;
  const wrap = $('#diag-questions');
  let qi = 0;
  AREAS.forEach((area) => {
    const group = document.createElement('fieldset');
    group.className = 'q-group';
    const lg = document.createElement('legend');
    lg.textContent = area.name;
    group.appendChild(lg);
    area.questions.forEach((text) => {
      qi++;
      const id = `q${qi}`;
      const fs = document.createElement('fieldset');
      fs.className = 'q';
      fs.dataset.q = id;
      const legend = document.createElement('legend');
      legend.textContent = `${qi}. ${text}`;
      fs.appendChild(legend);
      const scale = document.createElement('div');
      scale.className = 'scale';
      const lo = document.createElement('span');
      lo.className = 'scale-ends';
      lo.textContent = 'Nada de acuerdo';
      lo.setAttribute('aria-hidden', 'true');
      scale.appendChild(lo);
      for (let v = 1; v <= 5; v++) {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = id;
        input.value = String(v);
        input.dataset.area = area.key;
        const labels = { 1: 'nada de acuerdo', 2: 'poco de acuerdo', 3: 'neutral', 4: 'de acuerdo', 5: 'totalmente de acuerdo' };
        input.setAttribute('aria-label', `${v}, ${labels[v]}`);
        const span = document.createElement('span');
        span.textContent = String(v);
        span.setAttribute('aria-hidden', 'true');
        label.append(input, span);
        scale.appendChild(label);
      }
      const hi = document.createElement('span');
      hi.className = 'scale-ends';
      hi.textContent = 'Totalmente de acuerdo';
      hi.setAttribute('aria-hidden', 'true');
      scale.appendChild(hi);
      fs.appendChild(scale);
      group.appendChild(fs);
    });
    wrap.appendChild(group);
  });

  const progressFill = $('#diag-progress-fill');
  const progressText = $('#diag-progress-text');
  function updateProgress() {
    const answered = form.querySelectorAll('input[type=radio]:checked').length;
    progressFill.style.width = `${(answered / TOTAL_Q) * 100}%`;
    progressText.textContent = `${answered} de ${TOTAL_Q} respondidas`;
    return answered;
  }
  form.addEventListener('change', (e) => {
    const q = e.target.closest('.q');
    if (q) q.classList.remove('missing');
    updateProgress();
  });
  form.addEventListener('reset', () => {
    setTimeout(() => {
      updateProgress();
      form.querySelectorAll('.q.missing').forEach((q) => q.classList.remove('missing'));
      $('#diag-error').hidden = true;
      $('#diag-results').hidden = true;
      lastDiagnostic = null;
      syncAttachment();
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const missing = [...form.querySelectorAll('.q')].filter((q) => !q.querySelector('input:checked'));
    const err = $('#diag-error');
    if (missing.length) {
      missing.forEach((q) => q.classList.add('missing'));
      err.textContent = `Faltan ${missing.length} ${missing.length === 1 ? 'pregunta' : 'preguntas'} por responder.`;
      err.hidden = false;
      missing[0].querySelector('input').focus();
      return;
    }
    err.hidden = true;
    const areas = AREAS.map((a) => {
      const vals = [...form.querySelectorAll(`input[data-area="${a.key}"]:checked`)].map((i) => Number(i.value));
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      return { ...a, score: Math.round(((avg - 1) / 4) * 100) };
    });
    const overall = Math.round(areas.reduce((s, a) => s + a.score, 0) / areas.length);
    renderResults(overall, areas);
  });

  function renderResults(overall, areas) {
    const box = $('#diag-results');
    box.hidden = false;
    const ring = $('#score-ring');
    ring.style.setProperty('--p', overall);
    ring.setAttribute('aria-label', `Puntaje general: ${overall} de 100`);
    $('#score-value').textContent = overall;
    let label, summary;
    if (overall >= 75) { label = 'Base sólida'; summary = 'Tu empresa tiene fundamentos fuertes. El reto es escalar sin perder lo que funciona.'; }
    else if (overall >= 50) { label = 'En desarrollo'; summary = 'Hay buenas bases, pero algunas áreas están limitando tu crecimiento. Enfocarte en ellas puede tener un impacto rápido.'; }
    else { label = 'Oportunidad de mejora'; summary = 'Hay áreas clave que hoy frenan a tu empresa. Con prioridades claras se pueden lograr avances importantes.'; }
    $('#score-label').textContent = label;
    $('#score-summary').textContent = summary;

    const bars = $('#area-bars');
    bars.textContent = '';
    areas.forEach((a) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = a.name;
      const bar = document.createElement('span');
      bar.className = 'bar';
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `${a.name}: ${a.score} de 100`);
      const fill = document.createElement('span');
      fill.className = a.score < 50 ? 'low' : a.score < 75 ? 'mid' : '';
      fill.style.width = `${Math.max(a.score, 3)}%`;
      bar.appendChild(fill);
      const val = document.createElement('strong');
      val.textContent = a.score;
      val.setAttribute('aria-hidden', 'true');
      li.append(name, bar, val);
      bars.appendChild(li);
    });

    const recs = $('#recommendations');
    recs.textContent = '';
    const sorted = [...areas].sort((x, y) => x.score - y.score);
    const h = document.createElement('h4');
    h.textContent = 'Por dónde empezar';
    h.className = 'score-label';
    recs.appendChild(h);
    sorted.slice(0, 2).forEach((a, i) => {
      const div = document.createElement('div');
      div.className = 'rec';
      const t = document.createElement('strong');
      t.textContent = `${i === 0 ? 'Prioridad 1' : 'Prioridad 2'}: ${a.name} (${a.score}/100)`;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `Servicio sugerido: ${a.service}`;
      const ul = document.createElement('ul');
      a.tips.forEach((tip) => { const li = document.createElement('li'); li.textContent = tip; ul.appendChild(li); });
      div.append(t, tag, ul);
      recs.appendChild(div);
    });

    lastDiagnostic = {
      overall,
      weakest: sorted[0],
      areas: areas.map((a) => ({ name: a.name, score: a.score })),
    };
    syncAttachment();
    box.focus();
    box.scrollIntoView({ block: 'start' });
  }

  $('#print-diag').addEventListener('click', () => window.print());
  $('#send-diag').addEventListener('click', () => {
    if (!lastDiagnostic) return;
    const svc = $('#c-service');
    if (svc && !svc.value) svc.value = lastDiagnostic.weakest.service;
    const msg = $('#c-msg');
    if (msg && !msg.value.trim()) {
      msg.value = `Hice el diagnóstico de Sapti (puntaje ${lastDiagnostic.overall}/100). Mi área más débil es ${lastDiagnostic.weakest.name} y me gustaría conversar sobre cómo mejorarla.`;
    }
    setTimeout(() => $('#c-name').focus(), 400);
  });
})();

function syncAttachment() {
  const box = $('#diag-attached');
  if (!box) return;
  box.hidden = !lastDiagnostic;
  if (lastDiagnostic) $('#diag-attached-score').textContent = lastDiagnostic.overall;
}

/* ---------- calculadora ---------- */
(function calculator() {
  const form = $('#calc-form');
  if (!form) return;
  const fmt = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
  const num = (id) => Math.max(0, Number($(id).value) || 0);
  function calc() {
    const people = num('#calc-people');
    const hours = num('#calc-hours');
    const cost = num('#calc-cost');
    const pct = num('#calc-improve');
    $('#calc-improve-out').textContent = `${pct}%`;
    const hoursYear = people * hours * 48;
    const loss = hoursYear * cost;
    const gain = loss * (pct / 100);
    $('#calc-loss').textContent = `$${fmt.format(loss)}`;
    $('#calc-gain').textContent = `$${fmt.format(gain)}`;
    $('#calc-hours-year').textContent = `Equivale a ${fmt.format(hoursYear * pct / 100)} horas al año que tu equipo podría dedicar a trabajo de valor.`;
  }
  form.addEventListener('input', calc);
  form.addEventListener('submit', (e) => e.preventDefault());
  calc();
  $('#calc-cta').addEventListener('click', () => {
    const msg = $('#c-msg');
    if (msg && !msg.value.trim()) {
      msg.value = `Usé la calculadora de Sapti: estimo ${$('#calc-gain').textContent} al año en valor recuperable. Me gustaría explorar cómo lograrlo.`;
    }
    const svc = $('#c-service');
    if (svc && !svc.value) svc.value = 'Operaciones y procesos';
  });
})();

/* ---------- contacto ---------- */
(function contact() {
  const form = $('#contact-form');
  if (!form) return;
  const status = $('#contact-status');
  const fields = {
    name: { el: $('#c-name'), err: $('#c-name-err'), check: (v) => v.trim().length >= 2 || 'Escribe tu nombre.' },
    email: { el: $('#c-email'), err: $('#c-email-err'), check: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Escribe un correo válido, por ejemplo nombre@empresa.com.' },
    message: { el: $('#c-msg'), err: $('#c-msg-err'), check: (v) => v.trim().length >= 5 || 'Cuéntanos un poco más (mínimo 5 caracteres).' },
  };
  const consent = $('#c-consent');
  const consentErr = $('#c-consent-err');

  function setErr(f, msg) {
    if (msg) { f.err.textContent = msg; f.err.hidden = false; f.el.setAttribute('aria-invalid', 'true'); }
    else { f.err.hidden = true; f.el.removeAttribute('aria-invalid'); }
  }
  Object.values(fields).forEach((f) => f.el.addEventListener('blur', () => {
    if (f.el.value) { const r = f.check(f.el.value); setErr(f, r === true ? '' : r); }
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let first = null;
    for (const f of Object.values(fields)) {
      const r = f.check(f.el.value);
      setErr(f, r === true ? '' : r);
      if (r !== true && !first) first = f.el;
    }
    if (!consent.checked) {
      consentErr.textContent = 'Necesitamos tu autorización para contactarte.';
      consentErr.hidden = false;
      consent.setAttribute('aria-invalid', 'true');
      if (!first) first = consent;
    } else { consentErr.hidden = true; consent.removeAttribute('aria-invalid'); }
    if (first) { first.focus(); return; }

    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    status.hidden = true;
    const attach = $('#c-attach');
    const payload = {
      name: fields.name.el.value,
      email: fields.email.el.value,
      phone: $('#c-phone').value,
      company: $('#c-company').value,
      service: $('#c-service').value,
      message: fields.message.el.value,
      website: $('#c-website').value,
      consent: true,
      diagnostic: lastDiagnostic && attach && attach.checked ? { overall: lastDiagnostic.overall, areas: lastDiagnostic.areas } : null,
    };
    try {
      const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.errors) {
          for (const [k, msg] of Object.entries(data.errors)) if (fields[k]) setErr(fields[k], msg);
        }
        throw new Error(data.error || 'No pudimos enviar tu mensaje.');
      }
      form.reset();
      form.hidden = true;
      const done = $('#contact-done');
      done.hidden = false;
      done.focus();
    } catch (err) {
      status.textContent = `${err.message || 'No pudimos enviar tu mensaje.'} Intenta de nuevo.`;
      status.className = 'status err';
      status.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar mensaje';
    }
  });

  $('#contact-again').addEventListener('click', () => {
    $('#contact-done').hidden = true;
    form.hidden = false;
    syncAttachment();
    fields.name.el.focus();
  });
})();
