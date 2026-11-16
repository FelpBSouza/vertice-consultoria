    const companies = [
      { name: "Orla Café e Alimentos Ltda.", sector: "Alimentação", revenue: "R$ 720.000", ebitda: "R$ 116.000", status: "Análise em andamento" },
      { name: "NorteLog Transportes Ltda.", sector: "Logística", revenue: "R$ 1.800.000", ebitda: "R$ 190.000", status: "Dados pendentes" },
      { name: "VivaForma Saúde Ltda.", sector: "Saúde", revenue: "R$ 540.000", ebitda: "R$ 92.000", status: "Análise em andamento" },
      { name: "Casa Brava Móveis Ltda.", sector: "Comércio", revenue: "R$ 380.000", ebitda: "R$ 42.000", status: "Revisão necessária" },
      { name: "TecnoLume Sistemas Ltda.", sector: "Tecnologia", revenue: "R$ 650.000", ebitda: "R$ 155.000", status: "Análise em andamento" }
    ];

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const toast = $("#toast");
    let toastTimer;

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
    }

    function renderCompanies(query = "") {
      const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
      const filtered = companies.filter(company => `${company.name} ${company.sector} ${company.revenue} ${company.ebitda} ${company.status}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
      const companyCell = company => `<div class="client-info"><span class="client-avatar">${escapeHTML(company.name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("pt-BR"))}</span><div><div class="client-name">${escapeHTML(company.name)}</div><div class="client-email">${escapeHTML(company.sector)}</div></div></div>`;
      const dashboardRows = filtered.length ? filtered.slice(0, 4).map(company => `<tr><td>${companyCell(company)}</td><td>${escapeHTML(company.revenue)}</td><td>${escapeHTML(company.ebitda)}</td><td><span class="company-status ${company.status === "Dados pendentes" || company.status === "Revisão necessária" ? "review" : ""}">${escapeHTML(company.status)}</span></td></tr>`).join("") : `<tr><td colspan="4"><div class="empty-state">Nenhuma empresa encontrada.</div></td></tr>`;
      const allRows = filtered.length ? filtered.map(company => `<tr><td>${companyCell(company)}</td><td>${escapeHTML(company.sector)}</td><td>${escapeHTML(company.revenue)}</td><td>${escapeHTML(company.ebitda)}</td><td><span class="company-status ${company.status === "Dados pendentes" || company.status === "Revisão necessária" ? "review" : ""}">${escapeHTML(company.status)}</span></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty-state">Nenhuma empresa encontrada.</div></td></tr>`;
      $("#company-rows").innerHTML = dashboardRows;
      $("#all-company-rows").innerHTML = allRows;
      $("#company-count").textContent = filtered.length;
      $(".nav-count", $('[data-page="companies"]')).textContent = companies.length;
    }

    function escapeHTML(value) {
      return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    }

    const pages = {
      dashboard: "Visão geral",
      companies: "Empresas",
      accounting: "Contabilidade",
      investments: "Investimentos",
      economy: "Economia",
      reports: "Relatórios"
    };

    function navigate(page) {
      if (!pages[page]) return;
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

    function openModal() {
      $("#company-modal").classList.add("open");
      $("#company-name-input").focus();
    }
    function closeModal() {
      $("#company-modal").classList.remove("open");
      $("#company-form").reset();
    }
    function exportCompanies() {
      const csvRows = [["Empresa", "Setor", "Faturamento mensal (demonstrativo)", "EBITDA (demonstrativo)", "Status"], ...companies.map(({ name, sector, revenue, ebitda, status }) => [name, sector, revenue, ebitda, status])];
      const csv = "\uFEFF" + csvRows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      link.download = "vertice-empresas-demonstrativo.csv";
      link.click();
      URL.revokeObjectURL(link.href);
      showToast("Lista demonstrativa de empresas exportada.");
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
    $("#notification-button").addEventListener("click", () => showToast("Você não tem novas notificações."));
    $("#close-modal").addEventListener("click", closeModal);
    $("#cancel-modal").addEventListener("click", closeModal);
    $("#company-modal").addEventListener("click", event => {
      if (event.target === $("#company-modal")) closeModal();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeModal();
    });
    $("#company-form").addEventListener("submit", event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const name = String(formData.get("name")).trim();
      const sector = String(formData.get("sector"));
      const revenue = Number(formData.get("revenue"));
      if (!Number.isFinite(revenue) || revenue < 0) {
        showToast("Informe um faturamento válido.");
        return;
      }
      if (companies.some(company => company.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) {
        showToast("Já existe uma empresa com este nome.");
        return;
      }
      const formattedRevenue = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(revenue);
      companies.unshift({ name, sector, revenue: formattedRevenue, ebitda: "—", status: "Cadastro inicial" });
      renderCompanies($("#global-search").value);
      closeModal();
      navigate("companies");
      showToast("Empresa adicionada ao workspace.");
    });
    $$("[data-range]").forEach(button => button.addEventListener("click", () => {
      $$("[data-range]").forEach(tab => tab.classList.toggle("selected", tab === button));
      showToast(`Período ${button.dataset.range} selecionado (dados demonstrativos).`);
    }));

    renderCompanies();