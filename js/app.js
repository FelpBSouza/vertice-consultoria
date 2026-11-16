import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.0";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

const authHashParams = new URLSearchParams(window.location.hash.slice(1));
const authQueryParams = new URLSearchParams(window.location.search);
const authCallbackType = authHashParams.get("type") || authQueryParams.get("type");
let invitationFlow =
  ["invite", "recovery"].includes(authCallbackType) ||
  authQueryParams.has("code");
let passwordRecoveryFlow = authCallbackType === "recovery";
let authCallbackError =
  authHashParams.has("error") ||
  authHashParams.has("error_code") ||
  authQueryParams.has("error") ||
  authQueryParams.has("error_code");

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const toast = $("#toast");
const authScreen = $("#auth-screen");
const appShell = $("#app-shell");
const loginForm = $("#login-form");
const signupForm = $("#signup-form");
const passwordSetupForm = $("#password-setup-form");
const authMessage = $("#auth-message");
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0
});

const DEMO_COMPANY_NAME = "Orla Café e Alimentos Ltda.";
let companies = [];
let adminAccounts = [];
let financialPeriods = [];
let cashForecasts = [];
let debtMaturities = [];
let isDemoFinancialAnalysis = false;
let activeFinancialCompanyId = null;
let toastTimer;
let sessionRequest = 0;
let financialRequest = 0;
let currentRole = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function showAuthMessage(message, success = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("success", success);
  authMessage.hidden = !message;
}

function formatCurrency(value) {
  return value == null ? "—" : currencyFormatter.format(Number(value));
}

function normalizeCompany(company) {
  return {
    id: company.id,
    name: company.name,
    sector: company.sector,
    revenue: formatCurrency(company.monthly_revenue),
    ebitda: formatCurrency(company.ebitda),
    status: company.status
  };
}

function renderCompanies(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = companies.filter(company =>
    `${company.name} ${company.sector} ${company.revenue} ${company.ebitda} ${company.status}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedQuery)
  );
  const companyCell = company => `<div class="client-info"><span class="client-avatar">${escapeHTML(company.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("pt-BR"))}</span><div><div class="client-name">${escapeHTML(company.name)}</div><div class="client-email">${escapeHTML(company.sector)}</div></div></div>`;
  const dashboardRows = filtered.length
    ? filtered.slice(0, 4).map(company => `<tr><td>${companyCell(company)}</td><td>${escapeHTML(company.revenue)}</td><td>${escapeHTML(company.ebitda)}</td><td><span class="company-status ${isReviewNeeded(company) ? "review" : ""}">${escapeHTML(company.status)}</span></td></tr>`).join("")
    : `<tr><td colspan="4"><div class="empty-state">Nenhuma empresa cadastrada.</div></td></tr>`;
  const allRows = filtered.length
    ? filtered.map(company => `<tr><td>${companyCell(company)}</td><td>${escapeHTML(company.sector)}</td><td>${escapeHTML(company.revenue)}</td><td>${escapeHTML(company.ebitda)}</td><td><span class="company-status ${isReviewNeeded(company) ? "review" : ""}">${escapeHTML(company.status)}</span></td></tr>`).join("")
    : `<tr><td colspan="5"><div class="empty-state">Nenhuma empresa encontrada.</div></td></tr>`;

  $("#company-rows").innerHTML = dashboardRows;
  $("#all-company-rows").innerHTML = allRows;
  $("#company-count").textContent = filtered.length;
  $(".nav-count", $('[data-page="companies"]')).textContent = companies.length;
}

function formatDate(value) {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(timestamp);
}

function formatPeriod(value) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function monthOffset(value, offset) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function daysInPeriod(value) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatPercent(value) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value) + "%";
}

function formatDays(value) {
  return value == null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} dias`;
}

function parsePeriod(value, rowNumber) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Linha ${rowNumber}: use o período AAAA-MM ou AAAA-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] ? Number(match[3]) : 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || month < 1 || month > 12
    || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Linha ${rowNumber}: período inválido.`);
  }
  return `${match[1]}-${match[2]}-01`;
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("O CSV contém um campo entre aspas sem fechamento.");
  row.push(field.replace(/\r$/, ""));
  if (row.some(cell => cell.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("O CSV precisa conter cabeçalho e pelo menos uma linha de dados.");
  return rows;
}

function parseAmount(value, label, rowNumber) {
  const cleaned = value.trim().replace(/\s/g, "").replace(/^R\$/, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(?:\.\d{3})+$/.test(cleaned)
      ? cleaned.replace(/\./g, "")
      : cleaned;
  const amount = Number(normalized);
  if (!normalized || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`Linha ${rowNumber}: "${label}" deve ser um valor numérico não negativo.`);
  }
  return amount;
}

function parseOptionalAmount(value, label, rowNumber) {
  return value.trim() ? parseAmount(value, label, rowNumber) : null;
}

function parseFinancialCsv(text, forecast = false) {
  const rows = parseCsv(text);
  const headers = rows[0].map((header, index) =>
    header.trim().replace(/^\uFEFF/, "").toLocaleLowerCase("pt-BR")
  );
  const columns = forecast
    ? ["periodo", "entradas_previstas", "saidas_previstas"]
    : ["periodo", "receita", "cmv", "compras", "despesas_variaveis", "despesas_fixas", "contas_a_receber", "estoque", "fornecedores", "divida_bruta", "caixa"];
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const missing = columns.filter(column => !indexes.has(column));
  if (missing.length) {
    throw new Error(`Cabeçalho ausente: ${missing.join(", ")}. Baixe o modelo para conferir os nomes.`);
  }

  const seenPeriods = new Set();
  return rows.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    const getValue = column => cells[indexes.get(column)] || "";
    const period = parsePeriod(getValue("periodo"), rowNumber);
    if (seenPeriods.has(period)) throw new Error(`Linha ${rowNumber}: o período ${period.slice(0, 7)} está duplicado.`);
    seenPeriods.add(period);

    if (forecast) {
      return {
        period_start: period,
        expected_inflows: parseAmount(getValue("entradas_previstas"), "entradas_previstas", rowNumber),
        expected_outflows: parseAmount(getValue("saidas_previstas"), "saidas_previstas", rowNumber)
      };
    }

    return {
      period_start: period,
      revenue: parseAmount(getValue("receita"), "receita", rowNumber),
      cost_of_goods_sold: parseAmount(getValue("cmv"), "cmv", rowNumber),
      purchases: parseAmount(getValue("compras"), "compras", rowNumber),
      variable_expenses: parseAmount(getValue("despesas_variaveis"), "despesas_variaveis", rowNumber),
      fixed_expenses: parseAmount(getValue("despesas_fixas"), "despesas_fixas", rowNumber),
      accounts_receivable: parseAmount(getValue("contas_a_receber"), "contas_a_receber", rowNumber),
      inventory: parseAmount(getValue("estoque"), "estoque", rowNumber),
      supplier_payables: parseAmount(getValue("fornecedores"), "fornecedores", rowNumber),
      gross_debt: parseAmount(getValue("divida_bruta"), "divida_bruta", rowNumber),
      cash_balance: parseAmount(getValue("caixa"), "caixa", rowNumber),
      depreciation_expenses: parseOptionalAmount(getValue("depreciacao"), "depreciacao", rowNumber),
      financial_expenses: parseOptionalAmount(getValue("despesas_financeiras"), "despesas_financeiras", rowNumber),
      tax_expenses: parseOptionalAmount(getValue("impostos"), "impostos", rowNumber)
    };
  });
}

function renderAdminAccounts(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = adminAccounts.filter(account =>
    `${account.companyName} ${account.companySector} ${account.email}`
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedQuery)
  );
  const rows = filtered.length
    ? filtered.map(account => {
      const companyInitials = account.companyName
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toLocaleUpperCase("pt-BR");
      const confirmation = account.emailConfirmedAt
        ? `<span class="company-status">Confirmado</span>`
        : `<span class="company-status review">Pendente</span>`;
      return `<tr>
        <td><div class="client-info"><span class="client-avatar">${escapeHTML(companyInitials)}</span><div><div class="client-name">${escapeHTML(account.companyName)}</div><div class="client-email">${account.company ? "Empresa vinculada" : "Cadastro recebido"}</div></div></div></td>
        <td>${escapeHTML(account.email)}</td>
        <td>${escapeHTML(account.companySector || "—")}</td>
        <td>${confirmation}</td>
        <td>${escapeHTML(formatDate(account.createdAt))}</td>
      </tr>`;
    }).join("")
    : `<tr><td colspan="5"><div class="empty-state">${normalizedQuery ? "Nenhuma conta encontrada." : "Nenhuma conta de cliente cadastrada."}</div></td></tr>`;

  $("#admin-account-rows").innerHTML = rows;
  $("#admin-account-count").textContent = filtered.length;
}

function isReviewNeeded(company) {
  return company.status === "Dados pendentes" || company.status === "Revisão necessária";
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function escapeCSVCell(value) {
  const cell = String(value);
  const safeCell = /^\s*[=+\-@]/.test(cell) ? `'${cell}` : cell;
  return `"${safeCell.replace(/"/g, '""')}"`;
}

function getFinancialCompanyId() {
  if (currentRole === "company_owner") return companies[0]?.id || null;
  return $("#financial-company-select").value || null;
}

function configureFinancialCompanySelect() {
  const select = $("#financial-company-select");
  const demoCompanyId = companies.find(company => company.name === DEMO_COMPANY_NAME)?.id;
  const currentValue = currentRole === "company_owner"
    ? companies[0]?.id
    : activeFinancialCompanyId || select.value || demoCompanyId;
  select.replaceChildren();
  companies.forEach(company => {
    const option = document.createElement("option");
    option.value = company.id;
    option.textContent = company.name;
    select.append(option);
  });
  select.disabled = currentRole === "company_owner" || companies.length === 0;
  select.value = companies.some(company => company.id === currentValue)
    ? currentValue
    : companies[0]?.id || "";
  activeFinancialCompanyId = select.value || null;
  $("#financial-company-field").hidden = currentRole === "company_owner";
}

function downloadCsv(filename, rows) {
  const csv = `\uFEFF${rows.map(row => row.map(escapeCSVCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadFinancialTemplate() {
  downloadCsv("vertice-dados-mensais.csv", [
    ["periodo", "receita", "cmv", "compras", "despesas_variaveis", "despesas_fixas", "contas_a_receber", "estoque", "fornecedores", "divida_bruta", "caixa", "depreciacao", "despesas_financeiras", "impostos"]
  ]);
}

function downloadForecastTemplate() {
  const latest = financialPeriods[financialPeriods.length - 1];
  if (!latest) {
    showToast("Importe primeiro ao menos um período realizado.");
    return;
  }
  const rows = [["periodo", "entradas_previstas", "saidas_previstas"]];
  for (let month = 1; month <= 12; month += 1) {
    rows.push([monthOffset(latest.period_start, month).slice(0, 7), "", ""]);
  }
  downloadCsv("vertice-previsao-caixa.csv", rows);
}

function downloadDebtTemplate() {
  const latest = financialPeriods[financialPeriods.length - 1];
  if (!latest) {
    showToast("Importe primeiro ao menos um período realizado.");
    return;
  }
  const rows = [["periodo", "valor_vencimento"]];
  for (let month = 1; month <= 12; month += 1) {
    rows.push([monthOffset(latest.period_start, month).slice(0, 7), ""]);
  }
  downloadCsv("vertice-vencimentos-divida.csv", rows);
}

function calculateEbitda(period) {
  return Number(period.revenue)
    - Number(period.cost_of_goods_sold)
    - Number(period.variable_expenses)
    - Number(period.fixed_expenses);
}

function calculateNetIncome(period) {
  if ([period.depreciation_expenses, period.financial_expenses, period.tax_expenses].some(value => value == null)) {
    return null;
  }
  return calculateEbitda(period)
    - Number(period.depreciation_expenses)
    - Number(period.financial_expenses)
    - Number(period.tax_expenses);
}

function createDemoFinancialData() {
  const now = new Date();
  const latestPeriod = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10);
  const roundAmount = value => Math.round(value * 100) / 100;
  const periods = Array.from({ length: 12 }, (_, index) => {
    const isLatest = index === 11;
    const revenue = isLatest ? 720000 : roundAmount((8400000 - 720000) / 11);
    const costOfGoodsSold = isLatest ? 400000 : roundAmount((4700000 - 400000) / 11);
    return {
      period_start: monthOffset(latestPeriod, index - 11),
      revenue,
      cost_of_goods_sold: costOfGoodsSold,
      purchases: costOfGoodsSold,
      variable_expenses: isLatest ? 84000 : 80000,
      fixed_expenses: isLatest ? 120000 : roundAmount((2350000 - 204000 - 880000) / 11),
      accounts_receivable: isLatest ? 840000 : roundAmount(revenue * 1.15),
      inventory: isLatest ? 500000 : roundAmount(costOfGoodsSold * 1.25),
      supplier_payables: isLatest ? 350000 : roundAmount(costOfGoodsSold * 0.875),
      gross_debt: roundAmount(2800000 - index * (200000 / 11)),
      cash_balance: roundAmount(650000 + index * (170000 / 11)),
      depreciation_expenses: isLatest ? 30000 : 20000,
      financial_expenses: isLatest ? 20000 : roundAmount(160000 / 11),
      tax_expenses: 20000
    };
  });
  const seasonality = [0.94, 0.96, 1, 1.04, 1.02, 1.05, 1.01, 1.03, 1.06, 1.08, 1.12, 1.1];
  const latest = periods[periods.length - 1];
  const forecasts = seasonality.map((factor, index) => ({
    period_start: monthOffset(latest.period_start, index + 1),
    expected_inflows: roundAmount(760000 * factor),
    expected_outflows: roundAmount(730000 * factor)
  }));
  const monthlyMaturities = [35000, 35000, 35000, 35000, 35000, 250000, 35000, 35000, 35000, 35000, 35000, 35000];
  const maturities = monthlyMaturities.map((scheduled_amount, index) => ({
    period_start: monthOffset(latest.period_start, index + 1),
    scheduled_amount
  }));
  return { periods, forecasts, maturities };
}

function parseDebtMaturityCsv(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map(header =>
    header.trim().replace(/^\uFEFF/, "").toLocaleLowerCase("pt-BR")
  );
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const required = ["periodo", "valor_vencimento"];
  const missing = required.filter(column => !indexes.has(column));
  if (missing.length) {
    throw new Error(`Cabeçalho ausente: ${missing.join(", ")}. Baixe o modelo para conferir os nomes.`);
  }
  const monthlyAmounts = new Map();
  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const period = parsePeriod(cells[indexes.get("periodo")] || "", rowNumber).slice(0, 7) + "-01";
    const amount = parseOptionalAmount(cells[indexes.get("valor_vencimento")] || "", "valor_vencimento", rowNumber) || 0;
    monthlyAmounts.set(period, (monthlyAmounts.get(period) || 0) + amount);
  });
  return [...monthlyAmounts].map(([period_start, scheduled_amount]) => ({ period_start, scheduled_amount }));
}

function renderDreAnalysis(latest, previous) {
  const rows = $("#dre-analysis-rows");
  if (!latest) {
    rows.innerHTML = `<tr><td colspan="4"><div class="empty-state">Importe dados mensais para visualizar a análise da DRE.</div></td></tr>`;
    $("#dre-current-period").textContent = "MÊS ATUAL";
    return;
  }

  const linesFor = period => {
    const grossProfit = Number(period.revenue) - Number(period.cost_of_goods_sold);
    return [
      { label: "Receita líquida", amount: Number(period.revenue) },
      { label: "(−) CMV", amount: -Number(period.cost_of_goods_sold) },
      { label: "Lucro bruto", amount: grossProfit },
      { label: "(−) Despesas variáveis", amount: -Number(period.variable_expenses) },
      { label: "(−) Despesas fixas", amount: -Number(period.fixed_expenses) },
      { label: "EBITDA", amount: calculateEbitda(period) },
      { label: "(−) Depreciação", amount: period.depreciation_expenses == null ? null : -Number(period.depreciation_expenses) },
      { label: "(−) Despesas financeiras", amount: period.financial_expenses == null ? null : -Number(period.financial_expenses) },
      { label: "(−) Impostos", amount: period.tax_expenses == null ? null : -Number(period.tax_expenses) },
      { label: "Lucro líquido estimado", amount: calculateNetIncome(period) }
    ];
  };
  const currentLines = linesFor(latest);
  const previousLines = previous ? linesFor(previous) : [];
  $("#dre-current-period").textContent = formatPeriod(latest.period_start).toLocaleUpperCase("pt-BR");
  rows.innerHTML = currentLines.map((line, index) => {
    const vertical = latest.revenue > 0 && line.amount != null ? formatPercent(line.amount / latest.revenue * 100) : "—";
    const priorAmount = previousLines[index]?.amount;
    const change = priorAmount == null || line.amount == null ? null : line.amount - priorAmount;
    const changePercent = priorAmount == null || priorAmount === 0 ? null : change / Math.abs(priorAmount) * 100;
    const horizontal = change == null
      ? "—"
      : `${formatCurrency(change)}${changePercent == null ? "" : ` (${changePercent > 0 ? "+" : ""}${formatPercent(changePercent)})`}`;
    return `<tr${index === 2 || index === 5 || index === 9 ? ' class="total"' : ""}><td>${line.label}</td><td>${escapeHTML(formatCurrency(line.amount))}</td><td>${escapeHTML(vertical)}</td><td>${escapeHTML(horizontal)}</td></tr>`;
  }).join("");
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function renderDreWaterfall(latest) {
  const chart = $("#dre-waterfall");
  if (!latest) {
    chart.innerHTML = `<div class="empty-state">Importe dados mensais para visualizar a DRE em cascata.</div>`;
    $("#ebitda-benchmark").textContent = "Benchmark setorial fictício · EBITDA mediana 12%";
    $("#dre-waterfall-note").textContent = "";
    return;
  }
  const steps = [
    { label: "Receita", value: latest.revenue, total: true },
    { label: "CMV", value: -latest.cost_of_goods_sold },
    { label: "Desp. variáveis", value: -latest.variable_expenses },
    { label: "Desp. fixas", value: -latest.fixed_expenses },
    { label: "EBITDA", value: calculateEbitda(latest), total: true }
  ];
  const netIncome = calculateNetIncome(latest);
  if (netIncome != null) {
    steps.push(
      { label: "Depreciação", value: -Number(latest.depreciation_expenses) },
      { label: "Financeiras", value: -Number(latest.financial_expenses) },
      { label: "Impostos", value: -Number(latest.tax_expenses) },
      { label: "Lucro líquido", value: netIncome, total: true }
    );
  }
  const availableSteps = steps;
  const cumulative = [];
  let runningTotal = 0;
  availableSteps.forEach(step => {
    const start = step.total ? 0 : runningTotal;
    runningTotal = step.total ? step.value : runningTotal + step.value;
    cumulative.push({ start, end: runningTotal });
  });
  let minValue = Math.min(0, ...cumulative.map(item => Math.min(item.start, item.end)));
  let maxValue = Math.max(0, ...cumulative.map(item => Math.max(item.start, item.end)));
  if (minValue === maxValue) maxValue = 1;
  const padding = (maxValue - minValue) * 0.1;
  minValue -= padding;
  maxValue += padding;
  const width = availableSteps.length * 82 + 16;
  const top = 24;
  const bottom = 195;
  const y = value => top + (maxValue - value) / (maxValue - minValue) * (bottom - top);
  const barWidth = 34;
  const zeroY = y(0);
  const svgSteps = availableSteps.map((step, index) => {
    const x = 30 + index * 82;
    const { start, end } = cumulative[index];
    const barTop = Math.min(y(start), y(end));
    const barHeight = Math.max(2, Math.abs(y(end) - y(start)));
    const type = step.total
      ? step.value >= 0 ? "waterfall-total" : "waterfall-negative"
      : step.value >= 0 ? "waterfall-positive" : "waterfall-negative";
    const connector = index < availableSteps.length - 1
      ? `<line class="waterfall-connector" x1="${x + barWidth}" y1="${y(end)}" x2="${x + 82}" y2="${y(end)}"/>`
      : "";
    return `${connector}<rect class="${type}" x="${x}" y="${barTop}" width="${barWidth}" height="${barHeight}" rx="3"><title>${escapeHTML(step.label)}: ${escapeHTML(formatCurrency(step.value))}</title></rect><text class="waterfall-value" text-anchor="middle" x="${x + barWidth / 2}" y="${Math.max(14, barTop - 5)}">${escapeHTML(formatCompactCurrency(step.value))}</text><text class="waterfall-label" text-anchor="middle" x="${x + barWidth / 2}" y="220">${escapeHTML(step.label)}</text>`;
  }).join("");
  chart.innerHTML = `<svg viewBox="0 0 ${width} 236" role="img" aria-label="DRE em cascata de receita líquida a lucro líquido estimado"><line class="waterfall-grid" x1="20" y1="${zeroY}" x2="${width - 10}" y2="${zeroY}"/>${svgSteps}</svg>`;
  $("#dre-waterfall-note").textContent = netIncome == null
    ? "Lucro líquido indisponível: informe depreciação, despesas financeiras e impostos no CSV mensal."
    : "";
  const margin = latest.revenue > 0 ? calculateEbitda(latest) / latest.revenue * 100 : null;
  $("#ebitda-benchmark").textContent = margin == null
    ? "Margem EBITDA indisponível · mediana setorial fictícia 12%"
    : `Margem EBITDA ${formatPercent(margin)} · mediana setorial fictícia 12%`;
}

function renderCashForecast(latest) {
  const rows = $("#cash-forecast-rows");
  const chart = $("#cash-forecast-chart");
  if (!latest) {
    rows.innerHTML = `<tr><td colspan="7"><div class="empty-state">Importe dados mensais e uma previsão para visualizar o fluxo de caixa.</div></td></tr>`;
    chart.innerHTML = "";
    return;
  }

  const forecastsByPeriod = new Map(cashForecasts.map(forecast => [forecast.period_start, forecast]));
  const nextTwelveMonths = Array.from({ length: 12 }, (_, index) => monthOffset(latest.period_start, index + 1));
  const selectedForecasts = nextTwelveMonths.map(period => forecastsByPeriod.get(period));
  if (selectedForecasts.some(forecast => !forecast)) {
    const loadedMonths = selectedForecasts.filter(Boolean).length;
    rows.innerHTML = `<tr><td colspan="7"><div class="empty-state">Há ${loadedMonths} de 12 meses previstos. Importe períodos contínuos para completar os 12 meses seguintes a ${escapeHTML(formatPeriod(latest.period_start))}.</div></td></tr>`;
    chart.innerHTML = "";
    return;
  }

  const balances = { base: Number(latest.cash_balance), optimistic: Number(latest.cash_balance), stress: Number(latest.cash_balance) };
  const forecastData = selectedForecasts.map((forecast, index) => {
    const inflows = Number(forecast.expected_inflows);
    const outflows = Number(forecast.expected_outflows);
    const openingBalance = balances.base;
    balances.base += inflows - outflows;
    balances.optimistic += inflows * 1.1 - outflows * 0.9;
    balances.stress += inflows * 0.9 - outflows * 1.1;
    return {
      period: nextTwelveMonths[index],
      openingBalance,
      inflows,
      outflows,
      base: balances.base,
      optimistic: balances.optimistic,
      stress: balances.stress
    };
  });
  rows.innerHTML = forecastData.map(item =>
    `<tr><td>${escapeHTML(formatPeriod(item.period))}</td><td>${escapeHTML(formatCurrency(item.openingBalance))}</td><td>${escapeHTML(formatCurrency(item.inflows))}</td><td>${escapeHTML(formatCurrency(item.outflows))}</td><td>${escapeHTML(formatCurrency(item.base))}</td><td>${escapeHTML(formatCurrency(item.optimistic))}</td><td>${escapeHTML(formatCurrency(item.stress))}</td></tr>`
  ).join("");

  const allValues = forecastData.flatMap(item => [item.base, item.optimistic, item.stress]);
  let minValue = Math.min(0, ...allValues);
  let maxValue = Math.max(0, ...allValues);
  if (minValue === maxValue) maxValue = 1;
  const padding = (maxValue - minValue) * 0.08;
  minValue -= padding;
  maxValue += padding;
  const x = index => 42 + index * 69;
  const y = value => 18 + (maxValue - value) / (maxValue - minValue) * 122;
  const series = ["base", "optimistic", "stress"].map(name => {
    const points = forecastData.map((item, index) => `${x(index)},${y(item[name])}`).join(" ");
    const labels = forecastData.map((item, index) =>
      `<text class="forecast-label" text-anchor="middle" x="${x(index)}" y="165">${escapeHTML(formatPeriod(item.period).split(" ")[0])}</text>`
    ).join("");
    return `<polyline class="forecast-line ${name}" points="${points}"/>${name === "base" ? labels : ""}`;
  }).join("");
  chart.innerHTML = `<svg viewBox="0 0 850 174" role="img" aria-label="Saldo de caixa projetado nos cenários base, otimista e de estresse">${[0, 1, 2, 3].map(index => `<line class="forecast-grid" x1="34" y1="${18 + index * 40}" x2="830" y2="${18 + index * 40}"/>`).join("")}${series}</svg>`;
}

function renderDebtMaturities(latest) {
  const chart = $("#debt-maturity-chart");
  if (!latest) {
    chart.innerHTML = `<div class="empty-state">Importe os dados realizados para consultar os vencimentos.</div>`;
    return;
  }
  const maturitiesByMonth = new Map(debtMaturities.map(item => [item.period_start, item.scheduled_amount]));
  const months = Array.from({ length: 12 }, (_, index) => monthOffset(latest.period_start, index + 1));
  const amounts = months.map(month => maturitiesByMonth.get(month) || 0);
  const maxAmount = Math.max(...amounts, 0);
  if (maxAmount === 0) {
    chart.innerHTML = `<div class="empty-state">Nenhum vencimento informado para os próximos 12 meses. Importe o cronograma para visualizar o perfil de pagamentos.</div>`;
    return;
  }
  chart.innerHTML = `<div class="debt-bars">${months.map((month, index) => {
    const amount = amounts[index];
    const height = amount > 0 ? Math.max(3, amount / maxAmount * 100) : 0;
    return `<div class="debt-month"><div class="debt-bar-track"><span class="debt-month-value">${amount ? escapeHTML(formatCompactCurrency(amount)) : ""}</span><div class="debt-bar${amount ? " has-value" : ""}" style="height:${height}%"><span hidden>${escapeHTML(formatCurrency(amount))}</span></div></div><div class="debt-month-label">${escapeHTML(formatPeriod(month).split(" ")[0])}</div></div>`;
  }).join("")}</div>`;
}

function renderHealthAndAlerts(latest, hasFullYear, ltmEbitda) {
  const scoreElement = $("#health-score");
  const scoreCircle = $(".health-score");
  const pillarsElement = $("#health-pillars");
  const alertsElement = $("#financial-alerts");
  if (!latest) {
    scoreElement.textContent = "—";
    scoreCircle.className = "health-score";
    $("#health-score-caption").textContent = "Aguardando dados";
    pillarsElement.innerHTML = "";
    alertsElement.innerHTML = "";
    return;
  }

  const liquidity = latest.supplier_payables > 0
    ? (latest.cash_balance + latest.accounts_receivable + latest.inventory) / latest.supplier_payables
    : null;
  const ebitdaMargin = latest.revenue > 0 ? calculateEbitda(latest) / latest.revenue : null;
  const monthlyReserve = latest.cost_of_goods_sold + latest.variable_expenses + latest.fixed_expenses;
  const cashCoverage = monthlyReserve > 0 ? latest.cash_balance / monthlyReserve : null;
  const netDebt = latest.gross_debt - latest.cash_balance;
  const leverage = hasFullYear && ltmEbitda > 0 ? netDebt / ltmEbitda : null;
  const pillarValues = [
    {
      name: "Liquidez simplificada",
      value: liquidity,
      display: liquidity == null ? "N/D" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(liquidity)}x`,
      status: liquidity == null ? "unavailable" : liquidity < 1 ? "critical" : liquidity < 1.5 ? "warning" : "good",
      score: liquidity == null ? null : liquidity < 1 ? 25 : liquidity < 1.5 ? 60 : 100
    },
    {
      name: "Endividamento líquido / EBITDA",
      value: leverage,
      display: leverage == null ? "N/D" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(leverage)}x`,
      status: leverage == null ? "unavailable" : leverage > 3 ? "critical" : leverage > 1.5 ? "warning" : "good",
      score: leverage == null ? null : leverage > 3 ? 25 : leverage > 1.5 ? 60 : 100
    },
    {
      name: "Margem EBITDA",
      value: ebitdaMargin,
      display: ebitdaMargin == null ? "N/D" : formatPercent(ebitdaMargin * 100),
      status: ebitdaMargin == null ? "unavailable" : ebitdaMargin < 0 ? "critical" : ebitdaMargin < 0.05 ? "warning" : "good",
      score: ebitdaMargin == null ? null : ebitdaMargin < 0 ? 20 : ebitdaMargin < 0.05 ? 60 : 100
    },
    {
      name: "Caixa / reserva mensal",
      value: cashCoverage,
      display: cashCoverage == null ? "N/D" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(cashCoverage)} mês(es)`,
      status: cashCoverage == null ? "unavailable" : cashCoverage < 1 ? "critical" : cashCoverage < 3 ? "warning" : "good",
      score: cashCoverage == null ? null : cashCoverage < 1 ? 25 : cashCoverage < 3 ? 60 : 100
    }
  ];
  const availablePillars = pillarValues.filter(pillar => pillar.score != null);
  const score = availablePillars.length
    ? Math.round(availablePillars.reduce((sum, pillar) => sum + pillar.score, 0) / availablePillars.length)
    : null;
  scoreElement.textContent = score == null ? "—" : String(score);
  scoreCircle.className = `health-score${score == null ? "" : score >= 75 ? " good" : score >= 50 ? " warning" : " critical"}`;
  $("#health-score-caption").textContent = score == null
    ? "Dados insuficientes"
    : `Calculado com ${availablePillars.length} de 4 pilares`;
  pillarsElement.innerHTML = pillarValues.map(pillar =>
    `<div class="health-pillar ${pillar.status === "unavailable" ? "" : pillar.status}"><div class="health-pillar-name"><span class="health-pillar-dot"></span>${escapeHTML(pillar.name)}</div><div class="health-pillar-value">${escapeHTML(pillar.display)}</div></div>`
  ).join("");

  const alerts = [];
  if (liquidity != null && liquidity < 1) {
    alerts.push({ critical: true, title: "Liquidez simplificada abaixo de 1,0x", message: `Cobertura estimada de ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(liquidity)}x considerando caixa, recebíveis e estoque sobre fornecedores.` });
  }
  if (leverage != null && leverage > 3) {
    alerts.push({ critical: true, title: "Alavancagem acima de 3,0x", message: `Dívida líquida/EBITDA LTM de ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(leverage)}x.` });
  }
  if (cashCoverage != null && cashCoverage < 1) {
    alerts.push({ critical: true, title: "Caixa abaixo da reserva operacional", message: `O caixa cobre ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(cashCoverage)} mês(es) do CMV e das despesas variáveis e fixas atuais.` });
  }
  const unavailableRules = [
    liquidity == null ? "liquidez (sem fornecedores informados)" : null,
    leverage == null ? "endividamento (exige 12 meses completos e EBITDA LTM positivo)" : null,
    cashCoverage == null ? "reserva de caixa (sem custos e despesas mensais)" : null
  ].filter(Boolean);
  const alertCards = alerts.map(alert =>
    `<div class="financial-alert${alert.critical ? " critical" : ""}"><strong>${escapeHTML(alert.title)}</strong>${escapeHTML(alert.message)}</div>`
  );
  if (unavailableRules.length) {
    alertCards.push(`<div class="financial-alert info"><strong>Indicadores não avaliados</strong>${escapeHTML(unavailableRules.join("; "))}.</div>`);
  }
  if (!alerts.length && !unavailableRules.length) {
    alertCards.push(`<div class="financial-alert ok"><strong>Nenhum alerta automático identificado</strong>Regras avaliadas: liquidez simplificada abaixo de 1,0x, dívida líquida/EBITDA acima de 3,0x e caixa abaixo de 1 mês de custos e despesas operacionais.</div>`);
  }
  alertsElement.innerHTML = alertCards.join("");
}

function renderFinancialAnalysis() {
  const latest = financialPeriods[financialPeriods.length - 1] || null;
  $("#financial-data-mode").hidden = !isDemoFinancialAnalysis;
  $("#financial-demo-notice").hidden = !isDemoFinancialAnalysis;
  $$(".financial-import-grid button, .financial-import-grid input").forEach(control => {
    if (control.id.startsWith("import-")) {
      const kind = control.id.slice("import-".length, -"-csv".length);
      control.disabled = isDemoFinancialAnalysis || !$("#" + kind + "-csv-file").files[0];
    } else {
      control.disabled = isDemoFinancialAnalysis;
    }
  });
  $$(".financial-import-grid label[for]").forEach(label => {
    label.classList.toggle("disabled", isDemoFinancialAnalysis);
    label.setAttribute("aria-disabled", String(isDemoFinancialAnalysis));
  });
  const previousPeriod = latest ? monthOffset(latest.period_start, -1) : null;
  const previous = previousPeriod
    ? financialPeriods.find(period => period.period_start === previousPeriod)
    : null;

  $("#financial-period-caption").textContent = latest
    ? `Último período realizado: ${formatPeriod(latest.period_start)}. ${financialPeriods.length} mês(es) carregado(s).`
    : "Importe os dados mensais para calcular os indicadores.";

  const metrics = {
    "metric-pmr": latest && latest.revenue > 0
      ? formatDays(latest.accounts_receivable / latest.revenue * daysInPeriod(latest.period_start))
      : "—",
    "metric-pme": latest && latest.cost_of_goods_sold > 0
      ? formatDays(latest.inventory / latest.cost_of_goods_sold * daysInPeriod(latest.period_start))
      : "—",
    "metric-pmp": latest && latest.purchases > 0
      ? formatDays(latest.supplier_payables / latest.purchases * daysInPeriod(latest.period_start))
      : "—",
    "metric-working-capital": latest
      ? formatCurrency(latest.accounts_receivable + latest.inventory - latest.supplier_payables)
      : "—",
    "metric-break-even": latest && latest.revenue > 0
      && (latest.revenue - latest.cost_of_goods_sold - latest.variable_expenses) > 0
      ? formatCurrency(latest.fixed_expenses / ((latest.revenue - latest.cost_of_goods_sold - latest.variable_expenses) / latest.revenue))
      : "—"
  };
  const pmr = latest && latest.revenue > 0
    ? latest.accounts_receivable / latest.revenue * daysInPeriod(latest.period_start)
    : null;
  const pme = latest && latest.cost_of_goods_sold > 0
    ? latest.inventory / latest.cost_of_goods_sold * daysInPeriod(latest.period_start)
    : null;
  const pmp = latest && latest.purchases > 0
    ? latest.supplier_payables / latest.purchases * daysInPeriod(latest.period_start)
    : null;
  metrics["metric-cash-cycle"] = pmr == null || pme == null || pmp == null
    ? "—"
    : formatDays(pmr + pme - pmp);

  const periodsByMonth = new Map(financialPeriods.map(period => [period.period_start, period]));
  const ltmPeriods = latest
    ? Array.from({ length: 12 }, (_, index) => periodsByMonth.get(monthOffset(latest.period_start, index - 11)))
    : [];
  const hasFullYear = ltmPeriods.length === 12 && ltmPeriods.every(Boolean);
  const ltmEbitda = hasFullYear ? ltmPeriods.reduce((total, period) => total + calculateEbitda(period), 0) : 0;
  const netDebt = latest ? latest.gross_debt - latest.cash_balance : 0;
  metrics["metric-net-debt-ebitda"] = !hasFullYear
    ? "—"
    : ltmEbitda > 0
      ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(netDebt / ltmEbitda)}x`
      : "N/D";

  Object.entries(metrics).forEach(([id, value]) => {
    $(`#${id}`).textContent = value;
  });
  renderDreAnalysis(latest, previous);
  renderDreWaterfall(latest);
  renderCashForecast(latest);
  renderDebtMaturities(latest);
  renderHealthAndAlerts(latest, hasFullYear, ltmEbitda);
}

async function loadFinancialAnalysis(companyId = getFinancialCompanyId()) {
  const request = ++financialRequest;
  activeFinancialCompanyId = companyId;
  financialPeriods = [];
  cashForecasts = [];
  debtMaturities = [];
  isDemoFinancialAnalysis = false;
  if (!companyId) {
    renderFinancialAnalysis();
    return true;
  }
  renderFinancialAnalysis();

  let periodsResult;
  let forecastsResult;
  let maturitiesResult;
  try {
    [periodsResult, forecastsResult, maturitiesResult] = await Promise.all([
      supabase
        .from("vertice_financial_periods")
        .select("period_start, revenue, cost_of_goods_sold, purchases, variable_expenses, fixed_expenses, accounts_receivable, inventory, supplier_payables, gross_debt, cash_balance, depreciation_expenses, financial_expenses, tax_expenses")
        .eq("company_id", companyId)
        .order("period_start", { ascending: true }),
      supabase
        .from("vertice_cash_forecasts")
        .select("period_start, expected_inflows, expected_outflows")
        .eq("company_id", companyId)
        .order("period_start", { ascending: true }),
      supabase
        .from("vertice_debt_maturities")
        .select("period_start, scheduled_amount")
        .eq("company_id", companyId)
        .order("period_start", { ascending: true })
    ]);
  } catch (error) {
    if (request !== financialRequest) return false;
    console.error("Falha de rede ao carregar diagnóstico financeiro:", error);
    showToast("Não foi possível carregar os dados financeiros. Verifique sua conexão e tente novamente.");
    return false;
  }
  if (request !== financialRequest) return false;
  if (periodsResult.error || forecastsResult.error || maturitiesResult.error) {
    const error = periodsResult.error || forecastsResult.error || maturitiesResult.error;
    console.error("Erro ao carregar diagnóstico financeiro:", error);
    showToast("Não foi possível carregar os dados financeiros. Verifique a migration e tente novamente.");
    return false;
  }

  const storedPeriods = periodsResult.data || [];
  const storedForecasts = forecastsResult.data || [];
  const storedMaturities = maturitiesResult.data || [];
  const selectedCompany = companies.find(company => company.id === companyId);
  if (
    currentRole === "admin"
    && selectedCompany?.name === DEMO_COMPANY_NAME
    && storedPeriods.length === 0
    && storedForecasts.length === 0
    && storedMaturities.length === 0
  ) {
    const demoData = createDemoFinancialData();
    financialPeriods = demoData.periods;
    cashForecasts = demoData.forecasts;
    debtMaturities = demoData.maturities;
    isDemoFinancialAnalysis = true;
  } else {
    financialPeriods = storedPeriods.map(period => ({
      ...period,
      period_start: period.period_start,
      revenue: Number(period.revenue),
      cost_of_goods_sold: Number(period.cost_of_goods_sold),
      purchases: Number(period.purchases),
      variable_expenses: Number(period.variable_expenses),
      fixed_expenses: Number(period.fixed_expenses),
      accounts_receivable: Number(period.accounts_receivable),
      inventory: Number(period.inventory),
      supplier_payables: Number(period.supplier_payables),
      gross_debt: Number(period.gross_debt),
      cash_balance: Number(period.cash_balance),
      depreciation_expenses: period.depreciation_expenses == null ? null : Number(period.depreciation_expenses),
      financial_expenses: period.financial_expenses == null ? null : Number(period.financial_expenses),
      tax_expenses: period.tax_expenses == null ? null : Number(period.tax_expenses)
    }));
    cashForecasts = storedForecasts.map(forecast => ({
      ...forecast,
      expected_inflows: Number(forecast.expected_inflows),
      expected_outflows: Number(forecast.expected_outflows)
    }));
    debtMaturities = storedMaturities.map(maturity => ({
      ...maturity,
      scheduled_amount: Number(maturity.scheduled_amount)
    }));
  }
  renderFinancialAnalysis();
  return true;
}

function setImportFileStatus(kind, message, isError = false) {
  const status = $(`#${kind}-csv-name`);
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function bindCsvFileInput(kind) {
  const fileInput = $(`#${kind}-csv-file`);
  const importButton = $(`#import-${kind}-csv`);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    importButton.disabled = isDemoFinancialAnalysis || !file;
    setImportFileStatus(kind, file ? file.name : "Nenhum arquivo selecionado.");
  });
}

async function importFinancialCsv(kind) {
  const isForecast = kind === "forecast";
  const isDebt = kind === "debt";
  const fileInput = $(`#${kind}-csv-file`);
  const importButton = $(`#import-${kind}-csv`);
  const file = fileInput.files[0];
  const companyId = getFinancialCompanyId();
  if (isDemoFinancialAnalysis) {
    showToast("Selecione uma empresa real para importar dados financeiros.");
    return;
  }
  if (!file || !companyId) {
    showToast("Selecione uma empresa e um arquivo CSV.");
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    setImportFileStatus(kind, "O arquivo excede o limite de 2 MB.", true);
    return;
  }

  importButton.disabled = true;
  const originalLabel = importButton.textContent;
  importButton.textContent = "Importando...";
  try {
    let records = isDebt
      ? parseDebtMaturityCsv(await file.text())
      : parseFinancialCsv(await file.text(), isForecast);
    if (isForecast || isDebt) {
      const latest = financialPeriods[financialPeriods.length - 1];
      if (!latest) throw new Error("Importe os dados realizados antes de importar previsões ou vencimentos.");
      records.sort((first, second) => first.period_start.localeCompare(second.period_start));
      if (isForecast && records.length > 12) {
        throw new Error("A previsão pode incluir no máximo 12 meses por arquivo.");
      }
      const forecastHorizon = Array.from({ length: 12 }, (_, index) => monthOffset(latest.period_start, index + 1));
      const periodsInHorizon = records.map(record => forecastHorizon.indexOf(record.period_start));
      if (periodsInHorizon.some(index => index < 0)) {
        throw new Error("As datas devem estar nos 12 meses após o último período realizado.");
      }
      if (periodsInHorizon.some((monthIndex, index) => index > 0 && monthIndex !== periodsInHorizon[index - 1] + 1)) {
        throw new Error("Os períodos do arquivo devem ser contínuos, sem lacunas.");
      }
    }

    const table = isDebt
      ? "vertice_debt_maturities"
      : isForecast
        ? "vertice_cash_forecasts"
        : "vertice_financial_periods";
    const { error } = await supabase
      .from(table)
      .upsert(records.map(record => ({ ...record, company_id: companyId })), {
        onConflict: "company_id,period_start"
      });
    if (error) throw error;

    fileInput.value = "";
    importButton.disabled = true;
    setImportFileStatus(kind, `${records.length} linha(s) importada(s) com sucesso.`);
    const loaded = await loadFinancialAnalysis(companyId);
    if (loaded) showToast(isDebt
      ? "Cronograma de vencimentos atualizado."
      : isForecast
        ? "Previsão de caixa atualizada."
        : "Dados financeiros atualizados.");
  } catch (error) {
    console.error("Erro ao importar CSV financeiro:", error);
    setImportFileStatus(kind, error instanceof Error ? error.message : "Não foi possível importar o arquivo.", true);
  } finally {
    importButton.textContent = originalLabel;
    importButton.disabled = isDemoFinancialAnalysis || !fileInput.files[0];
  }
}

const pages = {
  dashboard: "Visão geral",
  "admin-accounts": "Contas de clientes",
  companies: "Empresas",
  client: "Minha empresa",
  "financial-analysis": "Diagnóstico financeiro",
  accounting: "Contabilidade",
  investments: "Investimentos",
  economy: "Economia",
  reports: "Relatórios"
};

function navigate(page) {
  if (!pages[page] || !["admin", "company_owner"].includes(currentRole)) return;
  if ((currentRole === "admin" && page === "client")
    || (currentRole === "company_owner" && !["client", "financial-analysis"].includes(page))) return;
  $$(".nav button").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $$(".page-section").forEach(section => section.classList.toggle("visible", section.id === `page-${page}`));
  $("#crumb-current").textContent = pages[page];
  $("#global-search").value = "";
  renderCompanies();
  if (page === "financial-analysis") loadFinancialAnalysis();
  $("#client-home-link").hidden = currentRole !== "company_owner";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadCompanies() {
  const { data, error } = await supabase
    .from("vertice_companies")
    .select("id, name, sector, monthly_revenue, ebitda, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar empresas:", error);
    showToast("Não foi possível carregar as empresas. Tente novamente.");
    return false;
  }

  companies = (data || []).map(normalizeCompany);
  configureFinancialCompanySelect();
  renderCompanies($("#global-search").value);
  if ($("#page-financial-analysis").classList.contains("visible")) {
    await loadFinancialAnalysis(getFinancialCompanyId());
  }
  return true;
}

async function loadAdminAccounts() {
  const [profilesResult, membershipsResult] = await Promise.all([
    supabase
      .from("vertice_profiles")
      .select("id, email, created_at, email_confirmed_at, company_name, company_sector")
      .eq("role", "company_owner")
      .order("created_at", { ascending: false }),
    supabase
      .from("vertice_company_memberships")
      .select("user_id, company:vertice_companies(name, sector)")
  ]);

  if (profilesResult.error || membershipsResult.error) {
    const error = profilesResult.error || membershipsResult.error;
    console.error("Erro ao carregar contas de clientes:", error);
    showToast("Não foi possível carregar as contas de clientes.");
    return false;
  }

  const companyByUser = new Map(
    membershipsResult.data.map(membership => [membership.user_id, membership.company])
  );
  adminAccounts = profilesResult.data.map(profile => {
    const company = companyByUser.get(profile.id);
    return {
      email: profile.email,
      createdAt: profile.created_at,
      emailConfirmedAt: profile.email_confirmed_at,
      company,
      companyName: company?.name || profile.company_name || "Empresa não informada",
      companySector: company?.sector || profile.company_sector || ""
    };
  });
  renderAdminAccounts($("#admin-account-search").value);
  return true;
}

function renderClientWorkspace() {
  const company = companies[0];
  $("#client-company-name").textContent = company?.name || "Empresa não encontrada";
  $("#client-company-sector").textContent = company?.sector || "";
  $("#client-company-status").textContent = company?.status || "Cadastro pendente";
}

async function ensureOwnerCompany(session) {
  const { data: membership, error: membershipError } = await supabase
    .from("vertice_company_memberships")
    .select("company_id")
    .eq("user_id", session.user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("Erro ao verificar empresa vinculada:", membershipError);
    return false;
  }
  if (membership) return true;

  const metadata = session.user.user_metadata || {};
  const companyName = typeof metadata.company_name === "string" ? metadata.company_name.trim() : "";
  const companySector = typeof metadata.company_sector === "string" ? metadata.company_sector.trim() : "";
  if (!companyName || !companySector) {
    console.error("Dados da empresa não encontrados no cadastro.");
    return false;
  }

  const { error } = await supabase.rpc("vertice_create_company_for_owner", {
    p_name: companyName,
    p_sector: companySector
  });
  if (error) {
    console.error("Erro ao preparar empresa do novo cliente:", error);
    return false;
  }

  return true;
}

async function handleSession(session) {
  const request = ++sessionRequest;
  showAuthMessage("");

  if (!session) {
    currentRole = null;
    companies = [];
    adminAccounts = [];
    financialPeriods = [];
    cashForecasts = [];
    debtMaturities = [];
    isDemoFinancialAnalysis = false;
    activeFinancialCompanyId = null;
    appShell.hidden = true;
    appShell.classList.remove("client-mode");
    $("#client-home-link").hidden = true;
    authScreen.hidden = false;
    loginForm.hidden = invitationFlow || passwordRecoveryFlow;
    signupForm.hidden = true;
    passwordSetupForm.hidden = true;
    if (passwordRecoveryFlow) {
      showAuthMessage("Este link de recuperação expirou ou não é válido. Solicite um novo link.");
    } else if (invitationFlow) {
      showAuthMessage("O convite expirou ou não é válido. Peça um novo convite ao administrador.");
    } else if (authCallbackError) {
      showAuthMessage("Este link expirou ou já foi usado. Solicite um novo link de acesso.");
    }
    return;
  }

  const customerSignup = session.user.user_metadata?.vertice_signup === true;
  if (passwordRecoveryFlow || (invitationFlow && !customerSignup)) {
    appShell.hidden = true;
    authScreen.hidden = false;
    loginForm.hidden = true;
    signupForm.hidden = true;
    passwordSetupForm.hidden = false;
    return;
  }

  const { data: profile, error } = await supabase
    .from("vertice_profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (request !== sessionRequest) return;
  if (error) {
    console.error("Erro ao verificar perfil:", error);
    currentRole = null;
    companies = [];
    adminAccounts = [];
    appShell.classList.remove("client-mode");
    appShell.hidden = true;
    authScreen.hidden = false;
    loginForm.hidden = false;
    signupForm.hidden = true;
    passwordSetupForm.hidden = true;
    showAuthMessage("Não foi possível verificar seu acesso. Tente novamente.");
    return;
  }

  const isAdmin = profile?.role === "admin";
  const isCompanyOwner = profile?.role === "company_owner";
  if (!isAdmin && !isCompanyOwner) {
    await supabase.auth.signOut();
    showAuthMessage("Esta conta não tem permissão de administrador.");
    return;
  }

  if (isCompanyOwner && !(await ensureOwnerCompany(session))) {
    if (request !== sessionRequest) return;
    appShell.hidden = true;
    authScreen.hidden = false;
    loginForm.hidden = true;
    signupForm.hidden = true;
    passwordSetupForm.hidden = true;
    showAuthMessage("Não foi possível preparar o espaço da empresa. Recarregue a página ou contate o suporte.");
    return;
  }

  if (request !== sessionRequest) return;
  currentRole = profile.role;
  appShell.classList.toggle("client-mode", isCompanyOwner);
  $("#client-home-link").hidden = !isCompanyOwner;
  authScreen.hidden = true;
  appShell.hidden = false;
  $("#profile-name").textContent = session.user.email || "Administrador";
  $("#profile-role").textContent = isAdmin ? "Administrador" : "Cliente";
  companies = [];
  if (isCompanyOwner) {
    renderClientWorkspace();
    navigate("client");
  } else {
    navigate("dashboard");
  }
  const [companiesLoaded, adminAccountsLoaded] = await Promise.all([
    loadCompanies(),
    isAdmin ? loadAdminAccounts() : Promise.resolve(true)
  ]);
  if (request !== sessionRequest || !companiesLoaded || !adminAccountsLoaded) return;
  if (isCompanyOwner) renderClientWorkspace();
}

function openModal() {
  $("#company-modal").classList.add("open");
  $("#company-name-input").focus();
}

function closeModal() {
  $("#company-modal").classList.remove("open");
  $("#company-form").reset();
}

function exportCompanies() {
  const csvRows = [
    ["Empresa", "Setor", "Faturamento mensal", "EBITDA", "Status"],
    ...companies.map(({ name, sector, revenue, ebitda, status }) => [name, sector, revenue, ebitda, status])
  ];
  const csv = "\uFEFF" + csvRows.map(row => row.map(escapeCSVCell).join(";")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "vertice-empresas.csv";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Lista de empresas exportada.");
}

$$(".nav button").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
$$("[data-page-link]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.pageLink)));
$$("[data-add-company]").forEach(button => button.addEventListener("click", openModal));
$$("[data-export]").forEach(button => button.addEventListener("click", exportCompanies));
$$("[data-toast]").forEach(button => button.addEventListener("click", event => {
  event.preventDefault();
  showToast(button.dataset.toast);
}));

$("#global-search").addEventListener("input", event => {
  const query = event.target.value;
  if (!$("#page-companies").classList.contains("visible")) navigate("companies");
  $("#global-search").value = query;
  renderCompanies(query);
});

$("#admin-account-search").addEventListener("input", event => renderAdminAccounts(event.target.value));
$("#financial-company-select").addEventListener("change", event => {
  activeFinancialCompanyId = event.target.value || null;
  loadFinancialAnalysis(activeFinancialCompanyId);
});
$("#refresh-financial-analysis").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  const originalLabel = button.textContent;
  button.textContent = "Atualizando...";
  await loadFinancialAnalysis(getFinancialCompanyId());
  button.textContent = originalLabel;
  button.disabled = false;
});
$("#client-home-link").addEventListener("click", () => navigate("client"));
$("#download-financial-template").addEventListener("click", downloadFinancialTemplate);
$("#download-forecast-template").addEventListener("click", downloadForecastTemplate);
$("#download-debt-template").addEventListener("click", downloadDebtTemplate);
$("#import-financial-csv").addEventListener("click", () => importFinancialCsv("financial"));
$("#import-forecast-csv").addEventListener("click", () => importFinancialCsv("forecast"));
$("#import-debt-csv").addEventListener("click", () => importFinancialCsv("debt"));
bindCsvFileInput("financial");
bindCsvFileInput("forecast");
bindCsvFileInput("debt");
$("#refresh-admin-accounts").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Atualizando...";
  await loadAdminAccounts();
  button.disabled = false;
  button.textContent = "Atualizar lista";
});

$("#notification-button").addEventListener("click", () => showToast("Você não tem novas notificações."));
$("#sign-out").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Erro ao encerrar sessão:", error);
    showToast("Não foi possível encerrar a sessão.");
  }
});
$("#close-modal").addEventListener("click", closeModal);
$("#cancel-modal").addEventListener("click", closeModal);
$("#company-modal").addEventListener("click", event => {
  if (event.target === $("#company-modal")) closeModal();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeModal();
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  showAuthMessage("");
  const button = $("#login-button");
  button.disabled = true;
  button.textContent = "Entrando...";
  const { error } = await supabase.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value
  });
  button.disabled = false;
  button.textContent = "Entrar";

  if (error) {
    showAuthMessage("Não foi possível entrar. Confira o e-mail e a senha.");
    console.error("Falha no login:", error);
  }
});

$("#show-signup").addEventListener("click", () => {
  showAuthMessage("");
  loginForm.hidden = true;
  signupForm.hidden = false;
  passwordSetupForm.hidden = true;
  $("#signup-company-name").focus();
});

$("#show-login").addEventListener("click", () => {
  showAuthMessage("");
  signupForm.hidden = true;
  passwordSetupForm.hidden = true;
  loginForm.hidden = false;
  $("#login-email").focus();
});

signupForm.addEventListener("submit", async event => {
  event.preventDefault();
  showAuthMessage("");

  const companyName = $("#signup-company-name").value.trim();
  const companySector = $("#signup-company-sector").value;
  const email = $("#signup-email").value.trim().toLowerCase();
  const password = $("#signup-password").value;
  if (companyName.length < 2 || companyName.length > 150) {
    showAuthMessage("Informe um nome de empresa entre 2 e 150 caracteres.");
    return;
  }
  if (password.length < 12) {
    showAuthMessage("Use uma senha com pelo menos 12 caracteres.");
    return;
  }
  if (password !== $("#signup-password-confirm").value) {
    showAuthMessage("As senhas não conferem.");
    return;
  }

  const button = $("#signup-button");
  button.disabled = true;
  button.textContent = "Criando conta...";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: new URL(window.location.pathname, window.location.origin).href,
      data: {
        vertice_signup: true,
        company_name: companyName,
        company_sector: companySector
      }
    }
  });
  button.disabled = false;
  button.textContent = "Criar conta";

  if (error) {
    console.error("Falha ao criar conta:", error);
    showAuthMessage(
      error.status === 429
        ? "Muitas tentativas. Aguarde um pouco e tente novamente."
        : "Não foi possível criar a conta. Verifique os dados e tente novamente."
    );
    return;
  }

  signupForm.reset();
  $("#login-email").value = email;
  if (data.session) {
    await handleSession(data.session);
    return;
  }

  signupForm.hidden = true;
  loginForm.hidden = false;
  showAuthMessage("Cadastro iniciado. Confirme seu e-mail para ativar o acesso à sua empresa.", true);
});

$("#forgot-password").addEventListener("click", async event => {
  event.preventDefault();
  showAuthMessage("");
  const email = $("#login-email").value.trim();
  if (!email) {
    showAuthMessage("Informe seu e-mail para receber um link de recuperação.");
    $("#login-email").focus();
    return;
  }

  const button = $("#forgot-password");
  button.disabled = true;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL(window.location.pathname, window.location.origin).href
  });
  button.disabled = false;

  if (error) {
    console.error("Falha ao solicitar recuperação de senha:", error);
    showAuthMessage(
      error.status === 429
        ? "O limite de e-mails foi atingido. Aguarde um pouco e tente novamente."
        : "Não foi possível enviar o link. Tente novamente mais tarde."
    );
    return;
  }

  showAuthMessage("Se o e-mail estiver cadastrado, enviaremos um link para criar uma nova senha.", true);
});

passwordSetupForm.addEventListener("submit", async event => {
  event.preventDefault();
  const password = $("#new-password").value;
  if (password !== $("#confirm-password").value) {
    showAuthMessage("As senhas não conferem.");
    return;
  }
  if (password.length < 12) {
    showAuthMessage("Use uma senha com pelo menos 12 caracteres.");
    return;
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    showAuthMessage("Não foi possível salvar a senha. Abra novamente o convite recebido por e-mail.");
    console.error("Falha ao definir senha:", error);
    return;
  }

  invitationFlow = false;
  passwordRecoveryFlow = false;
  authCallbackError = false;
  window.history.replaceState({}, "", window.location.pathname);
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    showAuthMessage("A senha foi salva, mas não foi possível validar a sessão. Entre novamente.");
    console.error("Falha ao recuperar sessão:", sessionError);
    return;
  }
  await handleSession(data.session);
});

$("#company-form").addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("name")).trim();
  const sector = String(formData.get("sector"));
  const revenue = Number(formData.get("revenue"));

  if (!Number.isFinite(revenue) || revenue < 0) {
    showToast("Informe um faturamento válido.");
    return;
  }

  const { data, error } = await supabase
    .from("vertice_companies")
    .insert({
      name,
      sector,
      monthly_revenue: revenue,
      status: "Cadastro inicial"
    })
    .select("id, name, sector, monthly_revenue, ebitda, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      showToast("Já existe uma empresa com esse nome.");
      return;
    }
    console.error("Erro ao cadastrar empresa:", error);
    showToast("Não foi possível cadastrar a empresa. Tente novamente.");
    return;
  }

  companies.unshift(normalizeCompany(data));
  renderCompanies($("#global-search").value);
  closeModal();
  navigate("companies");
  showToast("Empresa cadastrada.");
});

$$("[data-range]").forEach(button => button.addEventListener("click", () => {
  $$("[data-range]").forEach(tab => tab.classList.toggle("selected", tab === button));
  showToast(`Período ${button.dataset.range} selecionado (dados demonstrativos).`);
}));

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    invitationFlow = true;
    passwordRecoveryFlow = true;
  }
  if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "PASSWORD_RECOVERY"].includes(event)) {
    window.setTimeout(() => handleSession(session), 0);
  }
});
