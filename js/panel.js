const statusLabels = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  contactada: "Contactada"
};

const statusOrder = ["pendiente", "aceptada", "contactada", "rechazada"];
const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});

document.addEventListener("DOMContentLoaded", () => {
  initWorkerPanel();
});

function initWorkerPanel() {
  const loginCard = document.querySelector("[data-login-card]");
  const loginForm = document.querySelector("[data-login-form]");
  const loginError = document.querySelector("[data-login-error]");
  const panelApp = document.querySelector("[data-panel-app]");
  const logoutButton = document.querySelector("[data-logout]");
  const greeting = document.querySelector("[data-worker-greeting]");
  const statusFilter = document.querySelector("[data-status-filter]");
  const refreshButton = document.querySelector("[data-refresh]");
  const list = document.querySelector("[data-request-list]");
  const detail = document.querySelector("[data-request-detail]");
  const detailCard = document.querySelector("[data-detail-card]");
  const detailClose = document.querySelector("[data-detail-close]");
  const detailStatus = document.querySelector("[data-detail-status]");
  const requestCount = document.querySelector("[data-request-count]");
  const stats = document.querySelector("[data-stats]");
  const workspace = document.querySelector("[data-admin-workspace]");

  if (!loginCard || !loginForm || !panelApp) return;

  const state = {
    worker: null,
    requests: [],
    selectedId: null
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(loginError, "");

    const submitButton = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Entrando...");

    try {
      const result = await api("/api/login.php", {
        method: "POST",
        body: {
          username: loginForm.username.value.trim(),
          password: loginForm.password.value
        }
      });
      state.worker = result.worker;
      loginForm.reset();
      showPanel();
      await loadRequests();
    } catch (error) {
      setText(loginError, error.message);
    } finally {
      setButtonLoading(submitButton, false, "Entrar al panel");
    }
  });

  logoutButton?.addEventListener("click", async () => {
    await api("/api/logout.php", { method: "POST", body: {} }).catch(() => {});
    state.worker = null;
    state.requests = [];
    state.selectedId = null;
    showLogin();
  });

  refreshButton?.addEventListener("click", loadRequests);
  statusFilter?.addEventListener("change", loadRequests);
  detailClose?.addEventListener("click", () => {
    state.selectedId = null;
    renderList();
    renderDetail();
  });

  checkSession();

  async function checkSession() {
    try {
      const result = await api("/api/me.php");
      state.worker = result.worker;
      showPanel();
      await loadRequests();
    } catch {
      showLogin();
    }
  }

  async function loadRequests() {
    const selectedStatus = statusFilter?.value || "";
    const endpoint = selectedStatus
      ? `/api/requests.php?status=${encodeURIComponent(selectedStatus)}`
      : "/api/requests.php";
    const result = await api(endpoint);
    state.requests = result.requests;

    if (!state.requests.some((request) => request.id === state.selectedId)) {
      state.selectedId = null;
    }

    renderStats();
    renderList();
    renderDetail();
  }

  function showLogin() {
    loginCard.hidden = false;
    panelApp.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
  }

  function showPanel() {
    loginCard.hidden = true;
    panelApp.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
    setText(greeting, `Hola, ${state.worker?.username || "equipo"}`);
  }

  function renderStats() {
    if (!stats) return;
    stats.replaceChildren();

    const totals = state.requests.reduce((acc, request) => {
      acc[request.status] = (acc[request.status] || 0) + 1;
      return acc;
    }, {});

    statusOrder.forEach((status) => {
      const item = document.createElement("article");
      item.className = `admin-stat status-${status}`;

      const value = document.createElement("strong");
      value.textContent = totals[status] || 0;

      const label = document.createElement("span");
      label.textContent = statusLabels[status];

      item.append(value, label);
      stats.appendChild(item);
    });
  }

  function renderList() {
    if (!list) return;
    list.replaceChildren();
    setText(requestCount, `${state.requests.length} total`);

    if (!state.requests.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No hay solicitudes para este filtro.";
      list.appendChild(empty);
      return;
    }

    state.requests.forEach((request) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `request-row status-${request.status}`;
      item.setAttribute("aria-pressed", String(request.id === state.selectedId));
      item.classList.toggle("is-active", request.id === state.selectedId);
      item.addEventListener("click", () => {
        state.selectedId = state.selectedId === request.id ? null : request.id;
        renderList();
        renderDetail();
      });

      const header = document.createElement("span");
      header.className = "request-row-header";

      const title = document.createElement("strong");
      title.textContent = `${request.clientName} · ${request.planName}`;

      header.appendChild(title);

      const meta = document.createElement("span");
      meta.textContent = `${formatDate(request.eventDate)} · ${request.eventType} · ${formatMoney(request.totalPrice)}`;

      const status = document.createElement("small");
      status.className = `status-pill status-${request.status}`;
      status.textContent = statusLabels[request.status] || request.status;

      header.appendChild(status);

      const preview = document.createElement("span");
      preview.className = "request-row-preview";
      preview.textContent = `${request.clientEmail} - ${request.clientPhone}`;

      item.append(header, meta, preview);
      list.appendChild(item);
    });
  }

  function renderDetail() {
    if (!detail) return;
    detail.replaceChildren();

    const request = state.requests.find((item) => item.id === state.selectedId);
    if (!request) {
      if (detailCard) detailCard.hidden = true;
      workspace?.classList.remove("has-detail");
      setText(detailStatus, "");
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Selecciona una solicitud para ver los datos del cliente y gestionar el estado.";
      detail.appendChild(empty);
      return;
    }

    if (detailCard) detailCard.hidden = false;
    workspace?.classList.add("has-detail");
    setText(detailStatus, statusLabels[request.status] || request.status);
    detail.append(
      detailBlock("Cliente", [
        ["Nombre", request.clientName],
        ["Email", request.clientEmail],
        ["Teléfono / WhatsApp", request.clientPhone]
      ]),
      detailBlock("Evento", [
        ["Plan", request.planName],
        ["Tipo", request.eventType],
        ["Fecha", formatDate(request.eventDate)],
        ["Invitados", String(request.guests)],
        ["Precio base", formatMoney(request.basePrice)],
        ["Extras", formatMoney(request.extrasPrice)],
        ["Total estimado", formatMoney(request.totalPrice)]
      ]),
      detailBlock("Preferencias", [
        ["Extras", request.extrasText],
        ["Dietas", request.dietaryText],
        ["Petición especial", request.specialRequest]
      ]),
      detailBlock("Seguimiento", [
        ["Solicitud recibida", formatDateTime(request.createdAt)],
        ["Ultima actualizacion", formatDateTime(request.updatedAt)],
        ["Notas guardadas", request.workerNotes || "Sin notas internas"]
      ])
    );

    const contactActions = document.createElement("div");
    contactActions.className = "admin-contact-actions";
    contactActions.append(
      contactLink("WhatsApp", whatsappUrl(request.clientPhone, request.clientName, request.planName), "btn btn-whatsapp"),
      contactLink("Email", `mailto:${encodeURIComponent(request.clientEmail)}?subject=${encodeURIComponent(`EventoSonic - ${request.planName}`)}`, "btn btn-outline-dark")
    );

    const notesLabel = document.createElement("label");
    notesLabel.className = "field field-textarea";
    const notesTitle = document.createElement("span");
    notesTitle.textContent = "Notas internas";
    const notes = document.createElement("textarea");
    notes.rows = 5;
    notes.value = request.workerNotes || "";
    notes.dataset.notesInput = "true";
    notesLabel.append(notesTitle, notes);

    const actions = document.createElement("div");
    actions.className = "admin-status-actions";
    actions.append(
      actionButton("Aceptar", "aceptada", "btn btn-primary btn-status-accepted"),
      actionButton("Marcar contactada", "contactada", "btn btn-outline-dark"),
      actionButton("Rechazar", "rechazada", "btn btn-outline-dark btn-status-rejected"),
      deleteButton()
    );

    detail.append(contactActions, notesLabel, actions);
  }

  function detailBlock(title, rows) {
    const block = document.createElement("div");
    block.className = "detail-block";

    const heading = document.createElement("h4");
    heading.textContent = title;
    block.appendChild(heading);

    rows.forEach(([label, value]) => {
      const row = document.createElement("p");
      const labelNode = document.createElement("span");
      labelNode.textContent = label;
      const valueNode = document.createElement("strong");
      valueNode.textContent = value || "No indicado";
      row.append(labelNode, valueNode);
      block.appendChild(row);
    });

    return block;
  }

  function actionButton(label, status, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", () => updateRequestStatus(status));
    return button;
  }

  function deleteButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-danger";
    button.textContent = "Eliminar solicitud";
    button.addEventListener("click", deleteSelectedRequest);
    return button;
  }

  async function updateRequestStatus(status) {
    const request = state.requests.find((item) => item.id === state.selectedId);
    if (!request) return;

    const notes = detail.querySelector("[data-notes-input]")?.value || "";
    const result = await api(`/api/request.php?id=${encodeURIComponent(request.id)}`, {
      method: "PATCH",
      body: { status, notes }
    });

    state.requests = state.requests.map((item) => item.id === result.request.id ? result.request : item);
    state.selectedId = result.request.id;
    renderStats();
    renderList();
    renderDetail();
  }

  async function deleteSelectedRequest() {
    const request = state.requests.find((item) => item.id === state.selectedId);
    if (!request) return;

    const confirmed = window.confirm(`Eliminar la solicitud de ${request.clientName}? Esta accion no se puede deshacer.`);
    if (!confirmed) return;

    await api(`/api/request.php?id=${encodeURIComponent(request.id)}`, { method: "DELETE" });
    state.requests = state.requests.filter((item) => item.id !== request.id);
    state.selectedId = null;
    renderStats();
    renderList();
    renderDetail();
  }
}

async function api(endpoint, options = {}) {
  const fetchOptions = {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: {}
  };

  if (options.body) {
    fetchOptions.headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(endpoint, fetchOptions);
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "No se pudo completar la acción");
  }

  return result;
}

function contactLink(label, href, className) {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function whatsappUrl(phone, name, plan) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  const message = `Hola ${name}, soy del equipo de EventoSonic. Hemos revisado tu solicitud para ${plan} y queremos ultimar los detalles contigo.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(date);
}

function formatDateTime(value) {
  if (!value) return "No indicado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No indicado";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatMoney(value) {
  return euroFormatter.format(Number(value || 0));
}

function setText(element, value) {
  if (element) element.textContent = value;
}

function setButtonLoading(button, isLoading, text) {
  if (!button) return;
  button.disabled = isLoading;
  button.textContent = text;
}
