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
  const eventForm = document.querySelector("[data-event-form]");
  const eventCoverInput = document.querySelector("[data-event-cover]");
  const eventGalleryInput = document.querySelector("[data-event-gallery]");
  const coverPreview = document.querySelector("[data-cover-preview]");
  const galleryPreview = document.querySelector("[data-gallery-preview]");
  const eventList = document.querySelector("[data-event-list]");
  const eventCount = document.querySelector("[data-event-count]");
  const eventError = document.querySelector("[data-event-error]");
  const eventSuccess = document.querySelector("[data-event-success]");
  const eventsRefresh = document.querySelector("[data-events-refresh]");
  const planForm = document.querySelector("[data-plan-form]");
  const planFormTitle = document.querySelector("[data-plan-form-title]");
  const planSubmit = document.querySelector("[data-plan-submit]");
  const planCancel = document.querySelector("[data-plan-cancel]");
  const planList = document.querySelector("[data-plan-list]");
  const planCount = document.querySelector("[data-plan-count]");
  const planError = document.querySelector("[data-plan-error]");
  const planSuccess = document.querySelector("[data-plan-success]");
  const plansRefresh = document.querySelector("[data-plans-refresh]");
  const workerForm = document.querySelector("[data-worker-form]");
  const workerList = document.querySelector("[data-worker-list]");
  const workerCount = document.querySelector("[data-worker-count]");
  const workerError = document.querySelector("[data-worker-error]");
  const workerSuccess = document.querySelector("[data-worker-success]");
  const workersRefresh = document.querySelector("[data-workers-refresh]");

  if (!loginCard || !loginForm || !panelApp) return;

  const state = {
    worker: null,
    requests: [],
    selectedId: null,
    events: [],
    plans: [],
    workers: []
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(loginError, "");

    const submitButton = loginForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Entrando...");

    try {
      const client = await getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: loginForm.email.value.trim(),
        password: loginForm.password.value
      });
      if (error) throw new Error("Email o contraseña incorrectos.");
      state.worker = await loadWorker(client, data.user);
      loginForm.reset();
      showPanel();
      await loadPanelData();
    } catch (error) {
      setText(loginError, error.message);
    } finally {
      setButtonLoading(submitButton, false, "Entrar al panel");
    }
  });

  logoutButton?.addEventListener("click", async () => {
    const client = await getSupabaseClient().catch(() => null);
    await client?.auth.signOut().catch(() => {});
    state.worker = null;
    state.requests = [];
    state.selectedId = null;
    state.events = [];
    state.plans = [];
    state.workers = [];
    showLogin();
  });

  refreshButton?.addEventListener("click", loadRequests);
  statusFilter?.addEventListener("change", loadRequests);
  eventsRefresh?.addEventListener("click", loadEvents);
  plansRefresh?.addEventListener("click", loadPlans);
  planCancel?.addEventListener("click", resetPlanForm);
  planForm?.elements.name?.addEventListener("input", () => {
    if (!planForm.elements.planId.value) {
      planForm.elements.slug.value = slugify(planForm.elements.name.value);
    }
  });
  workersRefresh?.addEventListener("click", loadWorkers);
  eventCoverInput?.addEventListener("change", () => {
    renderUploadPreview(eventCoverInput.files, coverPreview, "Foto principal");
  });
  eventGalleryInput?.addEventListener("change", () => {
    renderUploadPreview(eventGalleryInput.files, galleryPreview, "Foto");
  });
  detailClose?.addEventListener("click", () => {
    state.selectedId = null;
    renderList();
    renderDetail();
  });

  eventForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(eventError, "");
    setText(eventSuccess, "");

    const title = eventForm.elements.title?.value.trim() || "";
    const coverFiles = eventCoverInput?.files || [];
    const galleryFiles = eventGalleryInput?.files || [];
    const validationError = validateEventUpload(title, coverFiles, galleryFiles);
    if (validationError) {
      setText(eventError, validationError);
      return;
    }

    const submitButton = eventForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Publicando...");

    try {
      const client = await getSupabaseClient();
      const created = await createSupabaseEvent(client, title, coverFiles[0], Array.from(galleryFiles));
      state.events = [created, ...state.events.filter((item) => item.id !== created.id)];
      eventForm.reset();
      clearUploadPreview(coverPreview);
      clearUploadPreview(galleryPreview);
      renderEventList();
      setText(eventSuccess, "Evento publicado. Ya aparece en la página principal.");
    } catch (error) {
      setText(eventError, error.message);
    } finally {
      setButtonLoading(submitButton, false, "Publicar evento");
    }
  });

  planForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(planError, "");
    setText(planSuccess, "");

    let payload;
    try {
      payload = readPlanForm(planForm);
    } catch (error) {
      setText(planError, error.message);
      return;
    }

    const editingId = planForm.elements.planId.value;
    setButtonLoading(planSubmit, true, editingId ? "Guardando..." : "Creando...");
    try {
      const client = await getSupabaseClient();
      let query = editingId
        ? client.from("plans").update(payload).eq("id", editingId)
        : client.from("plans").insert(payload);
      const { data, error } = await query.select().single();
      if (error) throw error;

      const saved = mapSupabasePlan(data);
      state.plans = editingId
        ? state.plans.map((plan) => plan.id === saved.id ? saved : plan)
        : [...state.plans, saved];
      sortPlans(state.plans);
      renderPlanList();
      resetPlanForm();
      setText(planSuccess, editingId ? "Plan actualizado en la web." : "Plan creado y listo para mostrarse en la web.");
    } catch (error) {
      setText(planError, humanizePlanError(error));
    } finally {
      setButtonLoading(planSubmit, false, planForm?.elements.planId.value ? "Guardar cambios" : "Crear plan");
    }
  });

  workerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setText(workerError, "");
    setText(workerSuccess, "");

    const displayName = workerForm.elements.displayName?.value.trim() || "";
    const email = workerForm.elements.email?.value.trim().toLowerCase() || "";
    const password = workerForm.elements.password?.value || "";
    const validationError = validateWorker(displayName, email, password);
    if (validationError) {
      setText(workerError, validationError);
      return;
    }

    const submitButton = workerForm.querySelector('button[type="submit"]');
    setButtonLoading(submitButton, true, "Creando...");

    try {
      const created = await requestWorkersApi("POST", { displayName, email, password });
      state.workers = [created.worker, ...state.workers.filter((item) => item.id !== created.worker.id)];
      workerForm.reset();
      renderWorkers();
      setText(workerSuccess, `Trabajador creado. Ya puede entrar con ${created.worker.email}.`);
    } catch (error) {
      setText(workerError, error.message || "No se pudo crear el trabajador.");
    } finally {
      setButtonLoading(submitButton, false, "Crear trabajador");
    }
  });

  checkSession();

  async function checkSession() {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new Error("No hay una sesión activa.");
      state.worker = await loadWorker(client, data.user);
      showPanel();
      await loadPanelData();
    } catch {
      showLogin();
    }
  }

  async function loadPanelData() {
    await loadRequests();
    await loadEvents().catch((error) => {
      setText(eventError, error.message);
    });
    await loadPlans().catch((error) => {
      setText(planError, error.message);
    });
    await loadWorkers().catch((error) => {
      setText(workerError, error.message);
    });
  }

  async function loadRequests() {
    const selectedStatus = statusFilter?.value || "";
    const client = await getSupabaseClient();
    let query = client.from("requests").select("*").order("created_at", { ascending: false });
    if (selectedStatus) query = query.eq("status", selectedStatus);
    const { data, error } = await query;
    if (error) throw new Error(error.message || "No se pudieron cargar las solicitudes.");
    state.requests = (data || []).map(mapSupabaseRequest);

    if (!state.requests.some((request) => request.id === state.selectedId)) {
      state.selectedId = null;
    }

    renderStats();
    renderList();
    renderDetail();
  }

  async function loadEvents() {
    setText(eventError, "");
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from("events")
      .select("id,title,cover_path,is_visible,created_at,updated_at,event_images(id,storage_path,sort_order)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message || "No se pudieron cargar los eventos.");
    state.events = (data || []).map((item) => mapSupabaseEventForPanel(client, item));
    renderEventList();
  }

  async function loadPlans() {
    setText(planError, "");
    const client = await getSupabaseClient();
    const { data, error } = await client
      .from("plans")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message || "No se pudieron cargar los planes.");
    state.plans = (data || []).map(mapSupabasePlan);
    renderPlanList();
  }

  async function loadWorkers() {
    setText(workerError, "");
    const result = await requestWorkersApi("GET");
    state.workers = Array.isArray(result.workers) ? result.workers : [];
    renderWorkers();
  }

  async function requestWorkersApi(method, body) {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) throw new Error("La sesión ha caducado. Vuelve a iniciar sesión.");

    const response = await fetch("/api/workers", {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudo gestionar el equipo.");
    return result;
  }

  function showLogin() {
    loginCard.hidden = false;
    panelApp.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
  }

  function showPanel() {
    loginCard.hidden = true;
    panelApp.hidden = false;
    panelApp.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
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

  function renderEventList() {
    if (!eventList) return;
    eventList.replaceChildren();
    setText(eventCount, `${state.events.length} total`);

    if (!state.events.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Todavía no hay eventos publicados.";
      eventList.appendChild(empty);
      return;
    }

    state.events.forEach((eventData) => {
      const item = document.createElement("article");
      item.className = "admin-event-row";

      const image = document.createElement("img");
      image.src = eventData.mainImage;
      image.alt = "";
      image.loading = "lazy";

      const copy = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = eventData.title;
      const meta = document.createElement("p");
      const photos = Array.isArray(eventData.images) ? eventData.images.length : 1;
      meta.textContent = `${photos} ${photos === 1 ? "foto" : "fotos"} · ${formatDateTime(eventData.createdAt)}`;
      const visibility = document.createElement("span");
      visibility.className = `content-visibility ${eventData.isVisible ? "is-visible" : "is-hidden"}`;
      visibility.textContent = eventData.isVisible ? "Visible" : "Oculto";
      copy.append(title, meta, visibility);

      const actions = document.createElement("div");
      actions.className = "admin-row-actions";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn btn-outline-dark btn-small";
      toggle.textContent = eventData.isVisible ? "Ocultar" : "Mostrar";
      toggle.addEventListener("click", () => toggleEventVisibility(eventData));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-danger btn-small";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", () => deleteEvent(eventData));
      actions.append(toggle, remove);

      item.append(image, copy, actions);
      eventList.appendChild(item);
    });
  }

  function renderPlanList() {
    if (!planList) return;
    planList.replaceChildren();
    setText(planCount, `${state.plans.length} total`);

    if (!state.plans.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Todavía no hay planes configurados.";
      planList.appendChild(empty);
      return;
    }

    state.plans.forEach((plan) => {
      const item = document.createElement("article");
      item.className = "admin-plan-row";

      const icon = document.createElement("span");
      icon.className = "admin-plan-icon";
      icon.textContent = plan.icon;

      const copy = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = plan.name;
      const meta = document.createElement("p");
      meta.textContent = `${formatMoney(plan.price)} · ${plan.features.length} características · orden ${plan.sortOrder}`;
      const visibility = document.createElement("span");
      visibility.className = `content-visibility ${plan.isVisible ? "is-visible" : "is-hidden"}`;
      visibility.textContent = plan.isVisible ? "Visible" : "Oculto";
      copy.append(title, meta, visibility);

      const actions = document.createElement("div");
      actions.className = "admin-row-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn btn-outline-dark btn-small";
      edit.textContent = "Editar";
      edit.addEventListener("click", () => editPlan(plan));
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn btn-outline-dark btn-small";
      toggle.textContent = plan.isVisible ? "Ocultar" : "Mostrar";
      toggle.addEventListener("click", () => togglePlanVisibility(plan));
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-danger btn-small";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", () => deletePlan(plan));
      actions.append(edit, toggle, remove);

      item.append(icon, copy, actions);
      planList.appendChild(item);
    });
  }

  function editPlan(plan) {
    if (!planForm) return;
    planForm.elements.planId.value = plan.id;
    planForm.elements.name.value = plan.name;
    planForm.elements.slug.value = plan.slug;
    planForm.elements.price.value = String(plan.price);
    planForm.elements.icon.value = plan.icon;
    planForm.elements.sortOrder.value = String(plan.sortOrder);
    planForm.elements.featuredLabel.value = plan.featuredLabel;
    planForm.elements.shortDescription.value = plan.shortDescription;
    planForm.elements.heroTitle.value = plan.heroTitle;
    planForm.elements.heroDescription.value = plan.heroDescription;
    planForm.elements.includesTitle.value = plan.includesTitle;
    planForm.elements.features.value = plan.features.join("\n");
    planForm.elements.extras.value = plan.extras
      .map((extra) => `${extra.name} | ${extra.price} | ${extra.description || ""}`)
      .join("\n");
    planForm.elements.isFeatured.checked = plan.isFeatured;
    planForm.elements.isVisible.checked = plan.isVisible;
    setText(planFormTitle, `Editar ${plan.name}`);
    if (planSubmit) planSubmit.textContent = "Guardar cambios";
    if (planCancel) planCancel.hidden = false;
    setText(planError, "");
    setText(planSuccess, "");
    planForm.closest(".plan-admin-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetPlanForm() {
    if (!planForm) return;
    planForm.reset();
    planForm.elements.planId.value = "";
    planForm.elements.sortOrder.value = "0";
    planForm.elements.featuredLabel.value = "Más popular";
    planForm.elements.isVisible.checked = true;
    setText(planFormTitle, "Nuevo plan");
    if (planSubmit) planSubmit.textContent = "Crear plan";
    if (planCancel) planCancel.hidden = true;
    setText(planError, "");
  }

  async function toggleEventVisibility(eventData) {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("events")
        .update({ is_visible: !eventData.isVisible })
        .eq("id", eventData.id)
        .select("is_visible")
        .single();
      if (error) throw error;
      eventData.isVisible = data.is_visible;
      renderEventList();
      setText(eventSuccess, data.is_visible ? "Evento visible en la web." : "Evento ocultado de la web.");
      setText(eventError, "");
    } catch (error) {
      setText(eventError, error.message || "No se pudo cambiar la visibilidad del evento.");
    }
  }

  async function togglePlanVisibility(plan) {
    try {
      const client = await getSupabaseClient();
      const { data, error } = await client
        .from("plans")
        .update({ is_visible: !plan.isVisible })
        .eq("id", plan.id)
        .select()
        .single();
      if (error) throw error;
      const updated = mapSupabasePlan(data);
      state.plans = state.plans.map((item) => item.id === updated.id ? updated : item);
      renderPlanList();
      setText(planSuccess, updated.isVisible ? "Plan visible en la web." : "Plan ocultado de la web.");
      setText(planError, "");
    } catch (error) {
      setText(planError, humanizePlanError(error));
    }
  }

  async function deletePlan(plan) {
    const confirmed = window.confirm(`Eliminar el plan “${plan.name}”? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    try {
      const client = await getSupabaseClient();
      const { error } = await client.from("plans").delete().eq("id", plan.id);
      if (error) throw error;
      state.plans = state.plans.filter((item) => item.id !== plan.id);
      if (planForm?.elements.planId.value === plan.id) resetPlanForm();
      renderPlanList();
      setText(planSuccess, "Plan eliminado.");
      setText(planError, "");
    } catch (error) {
      setText(planError, humanizePlanError(error));
    }
  }

  function renderWorkers() {
    if (!workerList) return;
    workerList.replaceChildren();
    setText(workerCount, `${state.workers.length} total`);

    if (!state.workers.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Todavía no hay trabajadores autorizados.";
      workerList.appendChild(empty);
      return;
    }

    state.workers.forEach((worker) => {
      const item = document.createElement("article");
      item.className = "admin-worker-row";

      const avatar = document.createElement("span");
      avatar.className = "admin-worker-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = worker.displayName?.charAt(0).toUpperCase() || "E";

      const copy = document.createElement("div");
      const heading = document.createElement("div");
      heading.className = "admin-worker-name";
      const name = document.createElement("h4");
      name.textContent = worker.displayName || "Trabajador";
      heading.appendChild(name);
      if (worker.isCurrent) {
        const badge = document.createElement("span");
        badge.className = "worker-current-badge";
        badge.textContent = "Tú";
        heading.appendChild(badge);
      }
      const email = document.createElement("p");
      email.textContent = worker.email || "Email no disponible";
      const createdAt = document.createElement("small");
      createdAt.textContent = `Acceso creado: ${formatDateTime(worker.createdAt)}`;
      copy.append(heading, email, createdAt);

      item.append(avatar, copy);
      workerList.appendChild(item);
    });
  }

  async function deleteEvent(eventData) {
    const confirmed = window.confirm(`Eliminar el evento “${eventData.title}” y todas sus fotos?`);
    if (!confirmed) return;

    try {
      const client = await getSupabaseClient();
      const { error } = await client.from("events").delete().eq("id", eventData.id);
      if (error) throw error;
      if (eventData.storagePaths?.length) {
        const { error: storageError } = await client.storage
          .from(window.EventoSonicSupabase.bucket)
          .remove(eventData.storagePaths);
        if (storageError) console.warn("El evento se eliminó, pero quedaron archivos pendientes de limpieza.", storageError);
      }
      state.events = state.events.filter((item) => item.id !== eventData.id);
      renderEventList();
      setText(eventSuccess, "Evento eliminado.");
      setText(eventError, "");
    } catch (error) {
      setText(eventError, error.message);
    }
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
    const client = await getSupabaseClient();
    const changes = {
      status,
      worker_notes: notes
    };
    if (status === "aceptada") {
      changes.accepted_by = state.worker.id;
      changes.accepted_at = request.acceptedAt || new Date().toISOString();
    }
    const { data, error } = await client
      .from("requests")
      .update(changes)
      .eq("id", request.id)
      .select()
      .single();
    if (error) throw new Error(error.message || "No se pudo actualizar la solicitud.");
    const updated = mapSupabaseRequest(data);
    state.requests = state.requests.map((item) => item.id === updated.id ? updated : item);
    state.selectedId = updated.id;
    renderStats();
    renderList();
    renderDetail();
  }

  async function deleteSelectedRequest() {
    const request = state.requests.find((item) => item.id === state.selectedId);
    if (!request) return;

    const confirmed = window.confirm(`Eliminar la solicitud de ${request.clientName}? Esta accion no se puede deshacer.`);
    if (!confirmed) return;

    const client = await getSupabaseClient();
    const { error } = await client.from("requests").delete().eq("id", request.id);
    if (error) throw new Error(error.message || "No se pudo eliminar la solicitud.");
    state.requests = state.requests.filter((item) => item.id !== request.id);
    state.selectedId = null;
    renderStats();
    renderList();
    renderDetail();
  }
}

async function getSupabaseClient() {
  if (!window.EventoSonicSupabase) {
    throw new Error("La conexión con Supabase no está disponible.");
  }
  return window.EventoSonicSupabase.getClient();
}

async function loadWorker(client, user) {
  const { data, error } = await client
    .from("app_admins")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    await client.auth.signOut().catch(() => {});
    throw new Error("Este usuario no tiene acceso al panel de EventoSonic.");
  }
  return {
    id: user.id,
    username: data.display_name || user.email || "equipo"
  };
}

function mapSupabaseRequest(row) {
  return {
    id: row.id,
    planName: row.plan_name,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    eventType: row.event_type,
    eventDate: row.event_date,
    guests: row.guests,
    extrasText: row.extras_text,
    specialRequest: row.special_request,
    dietaryText: row.dietary_text,
    basePrice: row.base_price,
    extrasPrice: row.extras_price,
    totalPrice: row.total_price,
    status: row.status,
    workerNotes: row.worker_notes,
    acceptedBy: row.accepted_by,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSupabaseEventForPanel(client, row) {
  const publicUrl = (path) => client.storage
    .from(window.EventoSonicSupabase.bucket)
    .getPublicUrl(path).data.publicUrl;
  const galleryRows = [...(row.event_images || [])]
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
  const storagePaths = [row.cover_path, ...galleryRows.map((image) => image.storage_path)];
  return {
    id: row.id,
    title: row.title,
    mainImage: publicUrl(row.cover_path),
    images: storagePaths.map(publicUrl),
    storagePaths,
    isVisible: row.is_visible !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function createSupabaseEvent(client, title, cover, gallery) {
  const eventId = crypto.randomUUID();
  const coverPath = `${eventId}/principal-${safeFileName(cover.name)}`;
  const galleryPaths = gallery.map((file, index) => (
    `${eventId}/foto-${String(index + 1).padStart(2, "0")}-${safeFileName(file.name)}`
  ));
  const uploadedPaths = [];

  try {
    await uploadEventImage(client, coverPath, cover);
    uploadedPaths.push(coverPath);
    for (let index = 0; index < gallery.length; index += 1) {
      await uploadEventImage(client, galleryPaths[index], gallery[index]);
      uploadedPaths.push(galleryPaths[index]);
    }

    const { data: eventRow, error: eventError } = await client
      .from("events")
      .insert({ id: eventId, title, cover_path: coverPath, is_visible: true })
      .select("id,title,cover_path,is_visible,created_at,updated_at")
      .single();
    if (eventError) throw eventError;

    if (galleryPaths.length) {
      const { error: imagesError } = await client.from("event_images").insert(
        galleryPaths.map((storagePath, index) => ({
          event_id: eventId,
          storage_path: storagePath,
          sort_order: index
        }))
      );
      if (imagesError) throw imagesError;
    }

    return mapSupabaseEventForPanel(client, {
      ...eventRow,
      event_images: galleryPaths.map((storagePath, index) => ({
        id: index,
        storage_path: storagePath,
        sort_order: index
      }))
    });
  } catch (error) {
    if (uploadedPaths.length) {
      await client.storage.from(window.EventoSonicSupabase.bucket).remove(uploadedPaths).catch(() => {});
    }
    await client.from("events").delete().eq("id", eventId).catch(() => {});
    throw new Error(error.message || "No se pudo publicar el evento.");
  }
}

function mapSupabasePlan(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon || "ES",
    price: Number(row.price || 0),
    shortDescription: row.short_description || "",
    heroTitle: row.hero_title || row.name,
    heroDescription: row.hero_description || "",
    includesTitle: row.includes_title || "Qué incluye",
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    extras: Array.isArray(row.extras) ? row.extras.map((extra) => ({
      name: String(extra?.name || "Extra"),
      price: Number(extra?.price || 0),
      description: String(extra?.description || "")
    })) : [],
    isFeatured: Boolean(row.is_featured),
    featuredLabel: row.featured_label || "Más popular",
    isVisible: row.is_visible !== false,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readPlanForm(form) {
  const name = form.elements.name.value.trim();
  const slug = slugify(form.elements.slug.value);
  const price = Number(form.elements.price.value);
  const icon = form.elements.icon.value.trim().toUpperCase();
  const features = form.elements.features.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const extras = parsePlanExtras(form.elements.extras.value);

  if (!name) throw new Error("Escribe el nombre del plan.");
  if (!slug) throw new Error("Escribe una dirección válida para el plan.");
  if (!Number.isInteger(price) || price < 0) throw new Error("Indica un precio válido, sin decimales.");
  if (!icon || icon.length > 4) throw new Error("El icono debe tener entre 1 y 4 letras.");
  if (!form.elements.shortDescription.value.trim()) throw new Error("Escribe la descripción corta.");
  if (!form.elements.heroTitle.value.trim()) throw new Error("Escribe el título principal.");
  if (!form.elements.heroDescription.value.trim()) throw new Error("Escribe la descripción completa.");
  if (!form.elements.includesTitle.value.trim()) throw new Error("Escribe el título de la lista incluida.");
  if (!features.length) throw new Error("Añade al menos una característica incluida.");

  return {
    slug,
    name,
    icon,
    price,
    short_description: form.elements.shortDescription.value.trim(),
    hero_title: form.elements.heroTitle.value.trim(),
    hero_description: form.elements.heroDescription.value.trim(),
    includes_title: form.elements.includesTitle.value.trim(),
    features,
    extras,
    is_featured: form.elements.isFeatured.checked,
    featured_label: form.elements.featuredLabel.value.trim() || "Más popular",
    is_visible: form.elements.isVisible.checked,
    sort_order: Math.max(0, Number.parseInt(form.elements.sortOrder.value || "0", 10) || 0)
  };
}

function parsePlanExtras(value) {
  const lines = String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.map((line, index) => {
    const [name = "", priceText = "", ...descriptionParts] = line.split("|").map((part) => part.trim());
    const price = Number(priceText);
    if (!name || !Number.isInteger(price) || price < 0) {
      throw new Error(`Revisa el extra de la línea ${index + 1}. Usa: Nombre | Precio | Descripción.`);
    }
    return { name, price, description: descriptionParts.join(" | ") };
  });
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function sortPlans(plans) {
  plans.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "es"));
}

function humanizePlanError(error) {
  const message = String(error?.message || "");
  if (message.includes("plans_slug_key") || message.toLowerCase().includes("duplicate key")) {
    return "Ya existe un plan con esa dirección. Escribe otra distinta.";
  }
  return message || "No se pudo guardar el plan.";
}

async function uploadEventImage(client, path, file) {
  const { error } = await client.storage
    .from(window.EventoSonicSupabase.bucket)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw error;
}

function safeFileName(name) {
  return String(name || "imagen")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-100) || "imagen";
}

function validateEventUpload(title, coverFiles, galleryFiles) {
  if (!title) return "Escribe un título para la temática del evento.";
  if (!coverFiles.length) return "Selecciona una foto principal.";
  if (galleryFiles.length > 15) return "Puedes añadir hasta 15 fotos de galería.";

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  const files = [...coverFiles, ...galleryFiles];
  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      return `“${file.name}” no es JPG, PNG o WebP.`;
    }
    if (file.size > 8 * 1024 * 1024) {
      return `“${file.name}” supera el máximo de 8 MB.`;
    }
  }
  return "";
}

function validateWorker(displayName, email, password) {
  if (!displayName) return "Escribe el nombre del trabajador.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Introduce un email válido.";
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password.length > 72) return "La contraseña no puede superar los 72 caracteres.";
  return "";
}

function renderUploadPreview(fileList, container, label) {
  if (!container) return;
  clearUploadPreview(container);
  const files = Array.from(fileList || []);

  files.forEach((file, index) => {
    const item = document.createElement("figure");
    item.className = "event-preview-item";

    const image = document.createElement("img");
    image.alt = `${label} ${index + 1} seleccionada`;
    const previewUrl = URL.createObjectURL(file);
    image.src = previewUrl;
    image.dataset.previewUrl = previewUrl;

    const caption = document.createElement("figcaption");
    caption.textContent = file.name;
    item.append(image, caption);
    container.appendChild(item);
  });
}

function clearUploadPreview(container) {
  if (!container) return;
  container.querySelectorAll("img[data-preview-url]").forEach((image) => {
    URL.revokeObjectURL(image.dataset.previewUrl);
  });
  container.replaceChildren();
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
