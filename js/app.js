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

let companies = [];
let adminAccounts = [];
let toastTimer;
let sessionRequest = 0;
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

const pages = {
  dashboard: "Visão geral",
  "admin-accounts": "Contas de clientes",
  companies: "Empresas",
  accounting: "Contabilidade",
  investments: "Investimentos",
  economy: "Economia",
  reports: "Relatórios"
};

function navigate(page) {
  if (!pages[page] || !["admin", "company_owner"].includes(currentRole)) return;
  if ((currentRole === "admin" && page === "client") || (currentRole === "company_owner" && page !== "client")) return;
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

  companies = data.map(normalizeCompany);
  renderCompanies($("#global-search").value);
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
    appShell.hidden = true;
    appShell.classList.remove("client-mode");
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
