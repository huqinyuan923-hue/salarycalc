'use strict';

/* ================= 主题 ================= */
const THEME_KEY = 'salarycalc-theme';
const themeBtn = document.getElementById('themeToggle');
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
}
applyTheme(localStorage.getItem(THEME_KEY) ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ================= 税率表 ================= */
// 综合所得年度税率表：[上限, 税率, 速算扣除数]
const ANNUAL = [
  [36000, 0.03, 0], [144000, 0.10, 2520], [300000, 0.20, 16920],
  [420000, 0.25, 31920], [660000, 0.30, 52920], [960000, 0.35, 85920],
  [Infinity, 0.45, 181920],
];
// 按月换算税率表（年终奖单独计税）
const MONTHLY = [
  [3000, 0.03, 0], [12000, 0.10, 210], [25000, 0.20, 1410],
  [35000, 0.25, 2660], [55000, 0.30, 4410], [80000, 0.35, 7160],
  [Infinity, 0.45, 15160],
];
const taxOf = (x, table) => {
  if (x <= 0) return 0;
  for (const [cap, rate, quick] of table) {
    if (x <= cap) return x * rate - quick;
  }
  return 0;
};
// 年终奖单独计税：按「奖金 ÷ 12」选档，再对奖金全额计税
const bonusTax = b => {
  if (b <= 0) return 0;
  const m = b / 12;
  for (const [cap, rate, quick] of MONTHLY) {
    if (m <= cap) return b * rate - quick;
  }
  return 0;
};

/* ================= 元素 ================= */
const $ = id => document.getElementById(id);
const num = (id, fallback = 0) => {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const money = n => (n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = n => Math.round(n || 0).toLocaleString('zh-CN');

/* ================= 计算核心 ================= */
function calc(gross) {
  const salary = gross;
  const hfRate = Math.min(Math.max(num('hfRate', 12), 0), 20) / 100;
  const baseIn = num('base');
  const bMin = num('baseMin');
  const bMax = num('baseMax');
  const extra = num('extra');
  const bonus = num('bonus');

  let base = baseIn > 0 ? baseIn : salary;
  if (bMin > 0) base = Math.max(base, bMin);
  if (bMax > 0) base = Math.min(base, bMax);

  const rates = {
    pension: num('pPension', 8) / 100,
    medical: num('pMedical', 2) / 100,
    unemployment: num('pUnemploy', 0.5) / 100,
  };
  const companyRates = {
    pension: num('ePension', 16) / 100,
    medical: num('eMedical', 9) / 100,
    unemployment: num('eUnemploy', 0.5) / 100,
    injury: num('eInjury', 0.4) / 100,
  };

  const ins = {
    pension: base * rates.pension,
    medical: base * rates.medical,
    unemployment: base * rates.unemployment,
    fund: base * hfRate,
  };
  const insTotal = ins.pension + ins.medical + ins.unemployment + ins.fund;

  const company = {
    pension: base * companyRates.pension,
    medical: base * companyRates.medical,
    unemployment: base * companyRates.unemployment,
    injury: base * companyRates.injury,
    fund: base * hfRate,
  };
  const companyTotal = company.pension + company.medical + company.unemployment + company.injury + company.fund;

  const annualPre = salary * 12;
  const taxable = Math.max(0, annualPre - 60000 - insTotal * 12 - extra * 12);
  const annualTax = taxOf(taxable, ANNUAL);
  const monthlyTax = annualTax / 12;
  const netMonthly = salary - insTotal - monthlyTax;

  // 年终奖
  const bonusSepTax = bonusTax(bonus);
  const bonusSepNet = bonus - bonusSepTax;
  const annualTaxMerged = bonus > 0 ? taxOf(taxable + bonus, ANNUAL) : annualTax;
  const bonusMergeExtra = annualTaxMerged - annualTax;
  const bonusMergeNet = bonus - bonusMergeExtra;

  return {
    gross: salary,
    base, ins, insTotal, company, companyTotal,
    annualPre, annualDeduct: 60000, extraAnnual: extra * 12,
    taxable, annualTax, monthlyTax, netMonthly,
    bonus, bonusSepTax, bonusSepNet, bonusMergeExtra, bonusMergeNet,
    yearNet: netMonthly * 12 + Math.max(bonusSepNet, bonusMergeNet),
  };
}

// 税后 → 税前：对税前做二分
function calcReverse(netTarget) {
  if (netTarget <= 0) return calc(0);
  let lo = 0, hi = Math.max(netTarget * 3, 10000);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const r = calc(mid);
    if (r.netMonthly > netTarget) hi = mid; else lo = mid;
  }
  return calc(Math.round(lo * 100) / 100);
}

/* ================= 渲染 ================= */
let reverseMode = false;

function row(label, value, cls = '') {
  return `<tr class="${cls}"><td>${label}</td><td>${value}</td></tr>`;
}

function render() {
  const salaryIn = num('salary');
  if (salaryIn <= 0) {
    $('results').style.display = 'none';
    return;
  }
  $('results').style.display = '';

  const r = reverseMode ? calcReverse(salaryIn) : calc(salaryIn);

  const heroVal = reverseMode ? r.gross : r.netMonthly;
  $('heroLabel').textContent = reverseMode ? '推算的税前月薪' : '税后月薪';
  $('heroNum').textContent = money(heroVal);
  $('heroSub').innerHTML = reverseMode
    ? `对应税后约 <b>${money(r.netMonthly)}</b> 元 / 月`
    : `税前 <b>${money(r.gross)}</b> 元 / 月`;

  // 五险一金
  $('insuranceTable').querySelector('tbody').innerHTML =
    row(`养老保险（基数 ${money0(r.base)}）`, money(r.ins.pension)) +
    row(`医疗保险`, money(r.ins.medical)) +
    row(`失业保险`, money(r.ins.unemployment)) +
    row(`住房公积金`, money(r.ins.fund));
  $('insuranceTable').querySelector('tfoot').innerHTML =
    `<tr><td>个人合计</td><td>${money(r.insTotal)}</td></tr>`;

  // 个税
  $('taxTable').querySelector('tbody').innerHTML =
    row('税前年收入', money(r.annualPre)) +
    row('减：基本减除费用（5000 × 12）', money(r.annualDeduct), 'dim') +
    row('减：五险一金（个人，全年）', money(r.insTotal * 12), 'dim') +
    row('减：专项附加扣除（全年）', money(r.extraAnnual), 'dim') +
    row('年度应纳税所得额', money(r.taxable)) +
    row('年度个税合计', money(r.annualTax)) +
    row('平均每月个税', money(r.monthlyTax), 'pos');

  // 年终奖
  const hasBonus = r.bonus > 0;
  $('bonusCard').style.display = hasBonus ? '' : 'none';
  if (hasBonus) {
    $('bnSeparate').textContent = money(r.bonusSepNet) + ' 元';
    $('bsSeparate').textContent = `奖金个税 ${money(r.bonusSepTax)} 元`;
    $('bnMerged').textContent = money(r.bonusMergeNet) + ' 元';
    $('bsMerged').textContent = `并入后多缴 ${money(r.bonusMergeExtra)} 元`;
    const sepBetter = r.bonusSepNet >= r.bonusMergeNet;
    $('boxSeparate').classList.toggle('best', sepBetter);
    $('boxMerged').classList.toggle('best', !sepBetter);
    const diff = Math.abs(r.bonusSepNet - r.bonusMergeNet);
    $('bonusAdv').textContent = sepBetter
      ? `建议选择「单独计税」，到手多 ${money(diff)} 元`
      : `建议选择「并入综合所得」，到手多 ${money(diff)} 元`;
  }

  // 全年总览
  const sepBetter = r.bonusSepNet >= r.bonusMergeNet;
  $('yearTable').querySelector('tbody').innerHTML =
    row('税前年收入', money(r.annualPre)) +
    row('五险一金（个人，全年）', money(r.insTotal * 12), 'dim') +
    row('个税（全年，不含年终奖）', money(r.annualTax), 'dim') +
    (hasBonus
      ? row(`年终奖到手（${sepBetter ? '单独计税' : '并入综合'}）`, money(sepBetter ? r.bonusSepNet : r.bonusMergeNet))
      : '') +
    row('全年总到手', money(r.yearNet), 'pos');

  // 单位部分
  $('companyTable').querySelector('tbody').innerHTML =
    row(`养老保险（基数 ${money0(r.base)}）`, money(r.company.pension)) +
    row('医疗保险', money(r.company.medical)) +
    row('失业保险', money(r.company.unemployment)) +
    row('工伤保险', money(r.company.injury)) +
    row('住房公积金', money(r.company.fund));
  $('companyTable').querySelector('tfoot').innerHTML =
    `<tr><td>单位合计</td><td>${money(r.companyTotal)}</td></tr>`;
}

/* ================= 事件 ================= */
let renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 120);
}
document.querySelectorAll('main input').forEach(el => el.addEventListener('input', scheduleRender));

$('modeGross').addEventListener('click', () => setMode(false));
$('modeNet').addEventListener('click', () => setMode(true));
function setMode(rev) {
  reverseMode = rev;
  $('modeGross').setAttribute('aria-pressed', String(!rev));
  $('modeNet').setAttribute('aria-pressed', String(rev));
  $('salaryLabel').textContent = rev ? '税后到手月薪（元）' : '税前月薪（元）';
  $('salary').placeholder = rev ? '例如 11000' : '例如 15000';
  render();
}

/* ================= 税率表渲染 ================= */
function bracketRows(table) {
  let lo = 0;
  return table.map(([cap, rate, quick]) => {
    const range = cap === Infinity ? '超过 ' + money0(lo) : `${money0(lo)} < x ≤ ${money0(cap)}`;
    const row = `<tr><td>${range}</td><td>${(rate * 100).toFixed(0)}%</td><td>${money0(quick)}</td></tr>`;
    lo = cap;
    return row;
  }).join('');
}
$('rateAnnual').innerHTML =
  `<tr><th>全年应纳税所得额</th><th>税率</th><th>速算扣除数</th></tr>` + bracketRows(ANNUAL);
$('rateMonthly').innerHTML =
  `<tr><th>奖金月均额（奖金 ÷ 12）</th><th>税率</th><th>速算扣除数</th></tr>` + bracketRows(MONTHLY);

/* 初始 */
render();
