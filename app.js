/* ==========================================================================
   LeadPredictor

   Model (works backwards from the revenue goal):
     customers  = totalRevenue / avgOrderValue
     leads      = customers / leadResponseRate
     prospects  = leads     / prospectResponseRate

   The chart shows those totals accrued linearly across the campaign months,
   so each bar is the cumulative funnel at the end of that month. The three
   bars nest: customers sits inside leads, which sits inside prospects.
   ========================================================================== */

(() => {
  'use strict';

  // ── i18n ────────────────────────────────────────────────────────────────

  const I18N = {
    en: {
      locale: 'en-US',
      language: 'Language', currency: 'Currency',
      campaignStart: 'Campaign Start', campaignEnd: 'Campaign End',
      totalRevenue: 'Total Revenue', avgOrderValue: 'Avg. Order Value',
      prospects: 'Prospects', leads: 'Leads', customers: 'Customers',
      leadResponseRate: 'Lead Response Rate',
      prospectResponseRate: 'Prospect Response Rate',
      chartTitle: 'Cumulative funnel by month',
      chartSubTpl: 'What it takes to reach {revenue} by {date}',
      axisMonths: 'Months', axisPeople: 'People',
      month: 'Month', monthN: 'Month #{n}',
      showTable: 'Show data table', hideTable: 'Hide data table',
      tableCaption: 'Cumulative totals at the end of each campaign month.',
      warnDates: 'Campaign end must be after the campaign start.',
      warnAov: 'Average order value must be greater than zero.',
      chartDescTpl: 'Horizontal stacked bars over {n} months. By the end of the campaign: {p} prospects, {l} leads, {c} customers.'
    },
    bg: {
      locale: 'bg-BG',
      language: 'Език', currency: 'Валута',
      campaignStart: 'Начало на кампанията', campaignEnd: 'Край на кампанията',
      totalRevenue: 'Общи приходи', avgOrderValue: 'Средна стойност на поръчка',
      prospects: 'Потенциални клиенти', leads: 'Лийдове', customers: 'Клиенти',
      leadResponseRate: 'Процент на отговор от лийдове',
      prospectResponseRate: 'Процент на отговор от потенциални клиенти',
      chartTitle: 'Натрупана фуния по месеци',
      chartSubTpl: 'Какво е нужно, за да достигнете {revenue} до {date}',
      axisMonths: 'Месеци', axisPeople: 'Хора',
      month: 'Месец', monthN: 'Месец №{n}',
      showTable: 'Покажи таблица', hideTable: 'Скрий таблицата',
      tableCaption: 'Натрупани стойности в края на всеки месец от кампанията.',
      warnDates: 'Краят на кампанията трябва да е след началото.',
      warnAov: 'Средната стойност на поръчка трябва да е по-голяма от нула.',
      chartDescTpl: 'Хоризонтални наслоени стълбове за {n} месеца. В края на кампанията: {p} потенциални клиенти, {l} лийда, {c} клиенти.'
    },
    de: {
      locale: 'de-DE',
      language: 'Sprache', currency: 'Währung',
      campaignStart: 'Kampagnenstart', campaignEnd: 'Kampagnenende',
      totalRevenue: 'Gesamtumsatz', avgOrderValue: 'Ø Bestellwert',
      prospects: 'Interessenten', leads: 'Leads', customers: 'Kunden',
      leadResponseRate: 'Lead-Rückmeldequote',
      prospectResponseRate: 'Interessenten-Rückmeldequote',
      chartTitle: 'Kumulierter Funnel nach Monat',
      chartSubTpl: 'Was nötig ist, um bis {date} {revenue} zu erreichen',
      axisMonths: 'Monate', axisPeople: 'Personen',
      month: 'Monat', monthN: 'Monat #{n}',
      showTable: 'Datentabelle anzeigen', hideTable: 'Datentabelle ausblenden',
      tableCaption: 'Kumulierte Werte am Ende jedes Kampagnenmonats.',
      warnDates: 'Das Kampagnenende muss nach dem Start liegen.',
      warnAov: 'Der Ø Bestellwert muss größer als null sein.',
      chartDescTpl: 'Horizontale gestapelte Balken über {n} Monate. Am Ende der Kampagne: {p} Interessenten, {l} Leads, {c} Kunden.'
    }
  };

  // Ordinal ramp (blue steps 450 / 300 / 100). Each bar is separated from the
  // one it nests inside by a surface ring, so every bar's WCAG-relevant
  // neighbour is the surface: 3.71:1, 6.54:1 and 12.38:1 respectively.
  const STAGE_COLOR = {
    prospects: '#2a78d6',
    leads:     '#6da7ec',
    customers: '#cde2fb'
  };
  const CORNER = 7;   // rounded data end; square at the baseline

  // ── DOM ─────────────────────────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);

  const el = {
    html:      document.documentElement,
    language:  $('#f-language'),
    currency:  $('#f-currency'),
    start:     $('#f-start'),
    end:       $('#f-end'),
    revenue:   $('#f-revenue'),
    aov:       $('#f-aov'),
    lrr:       $('#f-lrr'),
    prr:       $('#f-prr'),
    lrrOut:    $('#f-lrr-out'),
    prrOut:    $('#f-prr-out'),
    warning:   $('#date-warning'),
    chart:     $('#chart'),
    chartDesc: $('#chart-desc'),
    chartSub:  $('#chart-sub'),
    legend:    $('#legend'),
    tooltip:   $('#tooltip'),
    tableWrap: $('#table-view'),
    tableBtn:  $('#table-toggle'),
    tiles:     document.querySelectorAll('.tile')
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

  function num(locale, n) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  }
  function money(locale, currency, n) {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency, maximumFractionDigits: 0
    }).format(n);
  }
  function currencySymbol(locale, currency) {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency })
      .formatToParts(0);
    return (parts.find((p) => p.type === 'currency') || {}).value || currency;
  }
  function longDate(locale, date) {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
  }
  function monthLabel(locale, date) {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
      .format(date);
  }

  /** Clean axis ticks: step from {1, 2, 2.5, 5, 10} x 10^k, ~6 intervals. */
  function niceTicks(max, target = 6) {
    if (!(max > 0)) return { max: 1, ticks: [0, 1] };
    const raw = max / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= niceMax + step / 2; v += step) ticks.push(v);
    return { max: niceMax, ticks };
  }

  /** Rect path with per-corner radii [tl, tr, br, bl]. */
  function rrPath(x, y, w, h, radii) {
    const lim = Math.min(w / 2, h / 2);
    const [tl, tr, br, bl] = radii.map((r) => clamp(r, 0, lim));
    const arc = (r, ex, ey) => (r ? `A${r},${r} 0 0 1 ${ex},${ey}` : '');
    return `M${x + tl},${y}`
      + `H${x + w - tr}` + arc(tr, x + w, y + tr)
      + `V${y + h - br}` + arc(br, x + w - br, y + h)
      + `H${x + bl}`     + arc(bl, x, y + h - bl)
      + `V${y + tl}`     + arc(tl, x + tl, y) + 'Z';
  }

  // ── Model ───────────────────────────────────────────────────────────────

  const MS_PER_MONTH = 30.436875 * 24 * 60 * 60 * 1000;

  function parseDate(value) {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
  }

  function buildModel() {
    const lang = I18N[el.language.value] ? el.language.value : 'en';
    const t = I18N[lang];
    const currency = el.currency.value;

    const start = parseDate(el.start.value);
    const end = parseDate(el.end.value);
    const revenue = Math.max(0, Number(el.revenue.value) || 0);
    const aov = Number(el.aov.value) || 0;
    const lrr = clamp(Number(el.lrr.value) || 1, 0.5, 100) / 100;
    const prr = clamp(Number(el.prr.value) || 1, 0.5, 100) / 100;

    const warnings = [];
    let monthCount = 6;

    if (start && end) {
      if (end <= start) {
        warnings.push(t.warnDates);
      } else {
        monthCount = clamp(Math.round((end - start) / MS_PER_MONTH), 1, 60);
      }
    }
    if (!(aov > 0)) warnings.push(t.warnAov);

    const customers = aov > 0 ? revenue / aov : 0;
    const leads = customers / lrr;
    const prospects = leads / prr;

    // Cumulative totals at the end of each month.
    const rows = [];
    for (let i = 1; i <= monthCount; i++) {
      const f = i / monthCount;
      const date = start ? new Date(Date.UTC(
        start.getUTCFullYear(), start.getUTCMonth() + (i - 1), 1)) : null;
      rows.push({
        index: i,
        date,
        prospects: prospects * f,
        leads: leads * f,
        customers: customers * f
      });
    }

    return {
      lang, t, locale: t.locale, currency,
      start, end, revenue, aov, lrr, prr,
      prospects, leads, customers,
      monthCount, rows, warnings
    };
  }

  // ── Render: static text ─────────────────────────────────────────────────

  function renderText(m) {
    el.html.lang = m.lang;

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.dataset.i18n;
      if (m.t[key]) node.textContent = m.t[key];
    });

    const symbol = currencySymbol(m.locale, m.currency);
    document.querySelectorAll('[data-currency-symbol]')
      .forEach((n) => { n.textContent = symbol; });

    el.chartSub.textContent = fill(m.t.chartSubTpl, {
      revenue: money(m.locale, m.currency, m.revenue),
      date: m.end && m.start && m.end > m.start
        ? longDate(m.locale, m.end)
        : `${m.monthCount} ${m.t.axisMonths.toLowerCase()}`
    });

    el.tableBtn.querySelector('span').textContent =
      el.tableBtn.getAttribute('aria-expanded') === 'true'
        ? m.t.hideTable : m.t.showTable;

    if (m.warnings.length) {
      el.warning.textContent = m.warnings.join(' ');
      el.warning.hidden = false;
    } else {
      el.warning.hidden = true;
    }
  }

  // ── Render: legend ──────────────────────────────────────────────────────

  function renderLegend(m) {
    const items = [
      ['prospects', m.t.prospects],
      ['leads',     m.t.leads],
      ['customers', m.t.customers]
    ];
    el.legend.textContent = '';
    for (const [stage, label] of items) {
      const li = document.createElement('li');
      const sw = document.createElement('i');
      sw.style.setProperty('--swatch', STAGE_COLOR[stage]);
      li.append(sw, document.createTextNode(label));
      el.legend.appendChild(li);
    }
  }

  // ── Render: tiles ───────────────────────────────────────────────────────

  function renderTiles(m) {
    const totals = {
      prospects: m.prospects, leads: m.leads, customers: m.customers
    };
    el.tiles.forEach((tile) => {
      const stage = tile.dataset.stage;
      const value = totals[stage];
      const pct = m.prospects > 0 ? (value / m.prospects) * 100 : 0;
      tile.querySelector('[data-role="value"]').textContent =
        num(m.locale, Math.round(value));
      tile.querySelector('[data-role="pct"]').textContent =
        `${new Intl.NumberFormat(m.locale, { maximumFractionDigits: 0 }).format(pct)}%`;
      tile.querySelector('[data-role="meter"]').style.width =
        `${clamp(pct, 0, 100)}%`;
    });
  }

  // ── Render: chart ───────────────────────────────────────────────────────

  function renderChart(m, width) {
    const N = m.rows.length;
    const band = N <= 8 ? 50 : N <= 16 ? 32 : N <= 30 ? 21 : 15;
    const barH = Math.min(30, Math.round(band * 0.62));

    const M = { top: 14, right: 26, bottom: 44, left: 50 };
    const w = Math.max(360, width);
    const h = M.top + N * band + M.bottom;
    const plotW = w - M.left - M.right;
    const plotH = N * band;
    const plotBottom = M.top + plotH;

    const scale = niceTicks(m.prospects || 1);
    const x = (v) => (v / scale.max) * plotW;

    // Thin month labels when the campaign is long.
    const labelEvery = N <= 14 ? 1 : N <= 28 ? 2 : 4;

    const parts = [];
    parts.push(`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="presentation">`);

    // Elevation shadows — two per level, the way real elevation works:
    //   ambient  a tight unoffset halo. This is what carries the contrast
    //            boundary on the stacked top edges, where an offset-only
    //            shadow falls underneath the bar and is hidden.
    //   key      the soft offset lift that reads as height.
    parts.push('<defs>');
    [
      // stdDeviation sets how soft the shadow looks; flood-opacity sets how
      // deep its core goes. The blur is scaled to the nesting step: with only
      // ~5px of parent exposed, a wide blur swallows the band and the parent
      // loses its own color entirely, so the blur stays tight and the depth
      // comes from opacity instead.
      { amb: 1.4, ambOp: 0.60, dy: 2.0, sd: 3.5, op: 0.26 },  // prospects / surface
      { amb: 1.4, ambOp: 0.95, dy: 2.4, sd: 3.5, op: 0.30 },  // leads / prospects
      { amb: 1.4, ambOp: 0.95, dy: 2.4, sd: 3.5, op: 0.32 }   // customers / leads
    ].forEach((s, k) => {
      // userSpaceOnUse over the whole chart, so a soft shadow on a narrow bar
      // is never clipped by a bounding-box-relative filter region.
      parts.push(
        `<filter id="elev${k}" filterUnits="userSpaceOnUse" `
        + `x="0" y="0" width="${w}" height="${h}" `
        + `color-interpolation-filters="sRGB">`
        + `<feDropShadow dx="0" dy="0" stdDeviation="${s.amb}" `
        + `flood-color="#03060a" flood-opacity="${s.ambOp}" result="amb"/>`
        + `<feDropShadow in="amb" dx="0" dy="${s.dy}" stdDeviation="${s.sd}" `
        + `flood-color="#03060a" flood-opacity="${s.op}"/></filter>`
      );
    });
    parts.push('</defs>');

    // Gridlines (solid hairlines, recessive)
    parts.push('<g shape-rendering="crispEdges">');
    for (const tick of scale.ticks) {
      const gx = M.left + x(tick);
      parts.push(
        `<line x1="${gx}" y1="${M.top}" x2="${gx}" y2="${plotBottom}" `
        + `stroke="${tick === 0 ? 'var(--axis)' : 'var(--grid)'}" stroke-width="1"/>`
      );
    }
    parts.push('</g>');

    // Nested bars: customers on top of leads on top of prospects. They share a
    // baseline and a bottom edge; each inner bar is shorter so a band of the
    // one beneath stays visible, and each sits on a soft elevation shadow.
    // The shadow is also the contrast boundary — it darkens the parent right
    // under the child's edge, which is what keeps adjacent pairs above 3:1
    // without an outline. See README for the measured values.
    const STAGES = ['prospects', 'leads', 'customers'];
    const step = Math.max(3, Math.round(barH * 0.17));
    const heights = [
      barH,
      Math.max(5, barH - step),
      Math.max(4, barH - 2 * step)
    ];

    m.rows.forEach((row, i) => {
      const yTop = M.top + i * band;
      const cy = yTop + band / 2;
      const values = [row.prospects, row.leads, row.customers];

      // month tick label
      if (i % labelEvery === 0 || i === N - 1) {
        parts.push(
          `<text x="${M.left - 12}" y="${cy}" text-anchor="end" `
          + `dominant-baseline="central" font-size="10.5" fill="var(--text-muted)" `
          + `style="font-variant-numeric:tabular-nums">${row.index}</text>`
        );
      }

      parts.push(`<g class="row" data-i="${i}">`);
      parts.push('<g class="seg-group" pointer-events="none">');

      const bottom = cy + barH / 2;
      for (let k = 0; k < STAGES.length; k++) {
        const wBar = x(values[k]);
        if (wBar <= 0.4) continue;
        const h = heights[k];
        const r = Math.min(CORNER, h / 2, wBar / 2);
        parts.push(
          `<path class="seg" filter="url(#elev${k})" `
          + `d="${rrPath(M.left, bottom - h, wBar, h, [0, r, r, 0])}" `
          + `fill="${STAGE_COLOR[STAGES[k]]}"/>`
        );
      }
      parts.push('</g>');

      // hit target: full band, at least 24px tall, on top
      const hitH = Math.max(24, band);
      parts.push(
        `<rect class="hit" x="${M.left}" y="${yTop + (band - hitH) / 2}" `
        + `width="${plotW + M.right - 6}" height="${hitH}" tabindex="0" `
        + `role="button" aria-label="${esc(fill(m.t.monthN, { n: row.index }))}"/>`
      );
      parts.push('</g>');
    });

    // X axis ticks + titles — unit lives in the axis title, not on every tick
    for (const tick of scale.ticks) {
      parts.push(
        `<text x="${M.left + x(tick)}" y="${plotBottom + 17}" text-anchor="middle" `
        + `font-size="10.5" fill="var(--text-muted)" `
        + `style="font-variant-numeric:tabular-nums">`
        + `${esc(num(m.locale, tick))}</text>`
      );
    }
    parts.push(
      `<text x="${M.left + plotW / 2}" y="${h - 6}" text-anchor="middle" `
      + `font-size="11" fill="var(--text-muted)">${esc(m.t.axisPeople)}</text>`
    );
    parts.push(
      `<text transform="translate(14 ${M.top + plotH / 2}) rotate(-90)" `
      + `text-anchor="middle" font-size="11" fill="var(--text-muted)">`
      + `${esc(m.t.axisMonths)}</text>`
    );

    parts.push('</svg>');
    el.chart.innerHTML = parts.join('');

    el.chartDesc.textContent = fill(m.t.chartDescTpl, {
      n: m.monthCount,
      p: num(m.locale, Math.round(m.prospects)),
      l: num(m.locale, Math.round(m.leads)),
      c: num(m.locale, Math.round(m.customers))
    });

    wireHover(m);
  }

  // ── Tooltip ─────────────────────────────────────────────────────────────

  function tooltipContent(m, row) {
    const frag = document.createDocumentFragment();

    const title = document.createElement('div');
    title.className = 'tooltip__title';
    title.textContent = row.date
      ? `${fill(m.t.monthN, { n: row.index })} · ${monthLabel(m.locale, row.date)}`
      : fill(m.t.monthN, { n: row.index });
    frag.appendChild(title);

    // One tooltip, every series — values lead, labels follow.
    const rows = [
      ['prospects', m.t.prospects, row.prospects],
      ['leads',     m.t.leads,     row.leads],
      ['customers', m.t.customers, row.customers]
    ];
    for (const [stage, label, value] of rows) {
      const line = document.createElement('div');
      line.className = 'tooltip__row';

      const key = document.createElement('span');
      key.className = 'tooltip__key';
      key.style.background = STAGE_COLOR[stage];

      const name = document.createElement('span');
      name.className = 'tooltip__name';
      name.textContent = label;

      const val = document.createElement('span');
      val.className = 'tooltip__val';
      val.textContent = num(m.locale, Math.round(value));

      line.append(key, name, val);
      frag.appendChild(line);
    }
    return frag;
  }

  function wireHover(m) {
    const wrap = el.chart.parentElement;

    const show = (group, clientX, clientY) => {
      const row = m.rows[Number(group.dataset.i)];
      if (!row) return;
      el.chart.querySelectorAll('.row.is-active')
        .forEach((g) => g.classList.remove('is-active'));
      group.classList.add('is-active');

      el.tooltip.textContent = '';
      el.tooltip.appendChild(tooltipContent(m, row));
      el.tooltip.classList.add('is-visible');
      el.tooltip.setAttribute('aria-hidden', 'false');

      const box = wrap.getBoundingClientRect();
      const tip = el.tooltip.getBoundingClientRect();
      const rowBox = group.getBoundingClientRect();
      let left = clientX - box.left + 14;
      let top = rowBox.top + rowBox.height / 2 - box.top - tip.height / 2;
      left = clamp(left, 4, Math.max(4, box.width - tip.width - 4));
      top = clamp(top, 4, Math.max(4, box.height - tip.height - 4));
      el.tooltip.style.left = `${left}px`;
      el.tooltip.style.top = `${top}px`;
    };

    const hide = () => {
      el.chart.querySelectorAll('.row.is-active')
        .forEach((g) => g.classList.remove('is-active'));
      el.tooltip.classList.remove('is-visible');
      el.tooltip.setAttribute('aria-hidden', 'true');
    };

    el.chart.querySelectorAll('.hit').forEach((hit) => {
      const group = hit.closest('.row');
      hit.addEventListener('pointermove', (e) => show(group, e.clientX, e.clientY));
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', () => {
        const r = hit.getBoundingClientRect();
        show(group, r.left + Math.min(220, r.width / 2), r.top + r.height / 2);
      });
      hit.addEventListener('blur', hide);
    });

    el.chart.addEventListener('pointerleave', hide);
  }

  // ── Render: table view ──────────────────────────────────────────────────

  function renderTable(m) {
    const table = document.createElement('table');

    const caption = document.createElement('caption');
    caption.textContent = m.t.tableCaption;
    table.appendChild(caption);

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of [m.t.month, m.t.prospects, m.t.leads, m.t.customers]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of m.rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = row.date
        ? `${row.index} · ${monthLabel(m.locale, row.date)}`
        : String(row.index);
      tr.appendChild(th);
      for (const v of [row.prospects, row.leads, row.customers]) {
        const td = document.createElement('td');
        td.textContent = num(m.locale, Math.round(v));
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    el.tableWrap.textContent = '';
    el.tableWrap.appendChild(table);
  }

  // ── Orchestration ───────────────────────────────────────────────────────

  let model = null;

  function syncSlider(input, output) {
    const min = Number(input.min), max = Number(input.max);
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty('--pct', `${pct}%`);
    const locale = model ? model.locale : 'en-US';
    output.textContent = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(Number(input.value)) + '%';
  }

  function render() {
    model = buildModel();
    renderText(model);
    renderLegend(model);
    renderTiles(model);
    renderChart(model, el.chart.clientWidth || 640);
    renderTable(model);
    syncSlider(el.lrr, el.lrrOut);
    syncSlider(el.prr, el.prrOut);
  }

  // Inputs
  [el.language, el.currency, el.start, el.end, el.revenue, el.aov]
    .forEach((n) => n.addEventListener('change', render));
  [el.revenue, el.aov].forEach((n) => n.addEventListener('input', render));
  [el.lrr, el.prr].forEach((n) => n.addEventListener('input', render));

  document.querySelectorAll('.stepper__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.control').querySelector('input[type="number"]');
      if (!input) return;
      if (btn.dataset.step === 'up') input.stepUp(); else input.stepDown();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  el.tableBtn.addEventListener('click', () => {
    const open = el.tableBtn.getAttribute('aria-expanded') === 'true';
    el.tableBtn.setAttribute('aria-expanded', String(!open));
    el.tableWrap.hidden = open;
    el.tableBtn.querySelector('span').textContent =
      !open ? model.t.hideTable : model.t.showTable;
  });

  // Re-render the chart at the real pixel width so type never scales.
  let lastWidth = 0;
  new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w && Math.abs(w - lastWidth) > 1) {
      lastWidth = w;
      if (model) renderChart(model, w);
    }
  }).observe(el.chart);

  render();
})();
