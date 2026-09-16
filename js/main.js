const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
  await initEventsGallery();
  await initPlansGallery();
  initMobileMenu();
  initAnchorNavigation();
  initRevealAnimations();
  initMediaFrames();
  initCarousel();
  await initPlanPage();
});

async function initEventsGallery() {
  const list = document.querySelector("[data-events-list]");
  const modal = document.querySelector("[data-event-modal]");
  if (!list) return;

  try {
    const events = await fetchPublishedEvents();
    list.replaceChildren();
    if (!events.length) {
      list.appendChild(createPublicEmptyState("Muy pronto publicaremos nuevos eventos."));
      return;
    }
    events.forEach((eventData) => {
      list.appendChild(createEventCard(eventData, modal));
    });
  } catch (error) {
    console.info("La galería publicada no está disponible; se muestran los ejemplos incluidos.", error);
  }

  if (!modal) return;
  modal.querySelector("[data-event-close]")?.addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
}

async function fetchPublishedEvents() {
  if (!window.EventoSonicSupabase) return [];
  const client = await window.EventoSonicSupabase.getClient();
  const { data, error } = await client
    .from("events")
    .select("id,title,cover_path,created_at,updated_at,event_images(storage_path,sort_order,id)")
    .eq("is_visible", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((eventData) => mapSupabaseEvent(client, eventData));
}

async function initPlansGallery() {
  const list = document.querySelector("[data-plans-list]");
  if (!list || !window.EventoSonicSupabase) return;

  try {
    const client = await window.EventoSonicSupabase.getClient();
    const { data, error } = await client
      .from("plans")
      .select("id,slug,name,icon,price,short_description,features,is_featured,featured_label,sort_order")
      .eq("is_visible", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    list.replaceChildren();
    if (!data?.length) {
      list.appendChild(createPublicEmptyState("Estamos preparando nuevos planes para ti."));
      return;
    }
    data.forEach((plan) => list.appendChild(createPlanCard(plan)));
  } catch (error) {
    console.info("Los planes editables todavía no están disponibles; se muestran los planes incluidos.", error);
  }
}

function createPublicEmptyState(message) {
  const empty = document.createElement("p");
  empty.className = "public-empty-state";
  empty.textContent = message;
  return empty;
}

function createPlanCard(plan) {
  const card = document.createElement("article");
  card.className = `plan-card reveal${plan.is_featured ? " plan-card-featured" : ""}`;

  if (plan.is_featured) {
    const badge = document.createElement("span");
    badge.className = "plan-badge";
    badge.textContent = plan.featured_label || "Destacado";
    card.appendChild(badge);
  }

  const icon = document.createElement("span");
  icon.className = "plan-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = plan.icon || "ES";

  const title = document.createElement("h3");
  title.textContent = plan.name;
  const price = document.createElement("p");
  price.className = "plan-price";
  price.textContent = `desde ${formatCurrency(Number(plan.price || 0))}`;
  const description = document.createElement("p");
  description.className = "plan-description";
  description.textContent = plan.short_description || "Una propuesta personalizada para tu celebración";
  const features = document.createElement("ul");
  features.className = "plan-features";
  (Array.isArray(plan.features) ? plan.features : []).forEach((feature) => {
    const item = document.createElement("li");
    item.textContent = feature;
    features.appendChild(item);
  });
  const link = document.createElement("a");
  link.className = "btn btn-primary";
  link.href = `/plan/${encodeURIComponent(plan.slug)}`;
  link.textContent = "Seleccionar plan";

  card.append(icon, title, price, description, features, link);
  return card;
}

function mapSupabaseEvent(client, eventData) {
  const imageUrl = (path) => client.storage
    .from(window.EventoSonicSupabase.bucket)
    .getPublicUrl(path).data.publicUrl;
  const gallery = [...(eventData.event_images || [])]
    .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
    .map((item) => imageUrl(item.storage_path));
  const cover = imageUrl(eventData.cover_path);

  return {
    id: eventData.id,
    title: eventData.title,
    mainImage: cover,
    images: [cover, ...gallery],
    createdAt: eventData.created_at,
    updatedAt: eventData.updated_at
  };
}

function createEventCard(eventData, modal) {
  const card = document.createElement("article");
  card.className = "gallery-card event-card";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "event-card-button";
  button.setAttribute("aria-label", `Ver fotos de ${eventData.title}`);
  button.addEventListener("click", () => openEventModal(modal, eventData));

  const frame = document.createElement("div");
  frame.className = "media-frame gallery-frame";

  const image = document.createElement("img");
  image.src = eventData.mainImage;
  image.alt = eventData.title;
  image.loading = "lazy";
  image.className = "media-image media-imagen-galeria";

  const placeholder = document.createElement("div");
  placeholder.className = "media-placeholder";
  const placeholderTitle = document.createElement("strong");
  placeholderTitle.textContent = eventData.title;
  const placeholderText = document.createElement("span");
  placeholderText.textContent = "Fotografía principal del evento";
  placeholder.append(placeholderTitle, placeholderText);
  frame.append(image, placeholder);

  const copy = document.createElement("span");
  copy.className = "event-card-copy";
  const title = document.createElement("h3");
  title.textContent = eventData.title;
  const count = document.createElement("span");
  const total = Array.isArray(eventData.images) ? eventData.images.length : 1;
  count.textContent = total === 1 ? "Ver foto" : `Ver ${total} fotos`;
  copy.append(title, count);

  button.append(frame, copy);
  card.appendChild(button);
  return card;
}

function openEventModal(modal, eventData) {
  if (!modal) return;

  const title = modal.querySelector("[data-event-title]");
  const mainImage = modal.querySelector("[data-event-main]");
  const count = modal.querySelector("[data-event-photo-count]");
  const thumbnails = modal.querySelector("[data-event-thumbnails]");
  const images = Array.isArray(eventData.images) && eventData.images.length
    ? eventData.images
    : [eventData.mainImage];

  if (title) title.textContent = eventData.title;
  if (count) count.textContent = images.length === 1 ? "1 fotografía" : `${images.length} fotografías`;
  if (mainImage) {
    mainImage.src = images[0];
    mainImage.alt = eventData.title;
    mainImage.closest(".media-frame")?.classList.remove("is-missing");
  }

  if (thumbnails) {
    thumbnails.replaceChildren();
    images.forEach((source, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "event-thumbnail";
      button.classList.toggle("is-active", index === 0);
      button.setAttribute("aria-label", `Ver foto ${index + 1} de ${eventData.title}`);

      const image = document.createElement("img");
      image.src = source;
      image.alt = "";
      image.loading = "lazy";
      button.appendChild(image);
      button.addEventListener("click", () => {
        if (mainImage) {
          mainImage.src = source;
          mainImage.alt = `${eventData.title}, foto ${index + 1}`;
        }
        thumbnails.querySelectorAll(".event-thumbnail").forEach((item) => item.classList.remove("is-active"));
        button.classList.add("is-active");
      });
      thumbnails.appendChild(button);
    });
  }

  if (typeof modal.showModal === "function") {
    modal.showModal();
  } else {
    modal.setAttribute("open", "");
  }
}

async function loadPartials() {
  const partials = document.querySelectorAll("[data-include]");
  if (!partials.length) return;

  await Promise.all(Array.from(partials).map(async (element) => {
    const url = element.dataset.include;
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
      element.outerHTML = await response.text();
    } catch (error) {
      element.innerHTML = `<p class="include-error">No se pudo cargar ${url}</p>`;
      console.error(error);
    }
  }));
}

function initMobileMenu() {
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.querySelector(".nav-menu");

  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    document.body.classList.toggle("menu-open", !isExpanded);
  });
}

function initAnchorNavigation() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]');
  const menuToggle = document.querySelector(".nav-toggle");

  anchorLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      const target = hash === "#top" ? document.body : document.querySelector(hash);

      if (target) {
        event.preventDefault();
        if (hash === "#top") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        history.pushState(null, "", hash);
      }

      if (document.body.classList.contains("menu-open")) {
        document.body.classList.remove("menu-open");
        if (menuToggle) {
          menuToggle.setAttribute("aria-expanded", "false");
        }
      }
    });
  });
}

function initRevealAnimations() {
  const revealElements = document.querySelectorAll(".reveal");
  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.18,
    rootMargin: "0px 0px -60px 0px"
  });

  revealElements.forEach((element) => observer.observe(element));
}

function initMediaFrames() {
  const frames = document.querySelectorAll(".media-frame");

  frames.forEach((frame) => {
    const image = frame.querySelector(".media-image");
    if (!image) return;

    if (image.complete && image.naturalWidth > 0) {
      frame.classList.add("is-loaded");
      return;
    }

    image.addEventListener("load", () => {
      frame.classList.add("is-loaded");
    }, { once: true });

    image.addEventListener("error", () => {
      frame.classList.remove("is-loaded");
      frame.classList.add("is-missing");
    }, { once: true });
  });
}

function initCarousel() {
  const carousel = document.querySelector("[data-carousel]");
  if (!carousel) return;

  const track = carousel.querySelector(".carousel-track");
  const slides = Array.from(track.children);
  const dotsContainer = carousel.querySelector("[data-carousel-dots]");
  const prevButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");

  let currentIndex = 0;
  let perView = getSlidesPerView();
  let autoPlay = null;

  function buildDots() {
    const totalPages = Math.max(slides.length - perView + 1, 1);
    dotsContainer.innerHTML = "";

    Array.from({ length: totalPages }).forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "carousel-dot";
      dot.setAttribute("aria-label", `Ir al grupo ${index + 1}`);
      dot.addEventListener("click", () => {
        currentIndex = index;
        updateCarousel();
        restartAutoPlay();
      });
      dotsContainer.appendChild(dot);
    });
  }

  function updateCarousel() {
    perView = getSlidesPerView();
    const maxIndex = Math.max(slides.length - perView, 0);
    currentIndex = Math.min(currentIndex, maxIndex);

    const slideWidth = 100 / perView;
    slides.forEach((slide) => {
      slide.style.flexBasis = `${slideWidth}%`;
    });

    const slideWidthPx = slides[0]?.getBoundingClientRect().width || 0;
    track.style.transform = `translateX(-${currentIndex * slideWidthPx}px)`;

    const dots = dotsContainer.querySelectorAll(".carousel-dot");
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === currentIndex);
    });
  }

  function move(direction) {
    const maxIndex = Math.max(slides.length - perView, 0);
    currentIndex = direction === "next"
      ? (currentIndex >= maxIndex ? 0 : currentIndex + 1)
      : (currentIndex <= 0 ? maxIndex : currentIndex - 1);
    updateCarousel();
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlay = window.setInterval(() => {
      move("next");
    }, 4000);
  }

  function stopAutoPlay() {
    if (autoPlay) {
      window.clearInterval(autoPlay);
      autoPlay = null;
    }
  }

  function restartAutoPlay() {
    startAutoPlay();
  }

  prevButton?.addEventListener("click", () => {
    move("prev");
    restartAutoPlay();
  });

  nextButton?.addEventListener("click", () => {
    move("next");
    restartAutoPlay();
  });

  carousel.addEventListener("mouseenter", stopAutoPlay);
  carousel.addEventListener("mouseleave", startAutoPlay);
  window.addEventListener("resize", () => {
    const updatedPerView = getSlidesPerView();
    if (updatedPerView !== perView) {
      perView = updatedPerView;
      buildDots();
      updateCarousel();
    } else {
      updateCarousel();
    }
  });

  buildDots();
  updateCarousel();
  startAutoPlay();
}

function getSlidesPerView() {
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 768) return 2;
  return 1;
}

async function initPlanPage() {
  const planPage = document.querySelector("[data-plan-page]");
  const form = document.querySelector("[data-booking-form]");
  if (!planPage || !form) return;

  const dynamicSlug = new URLSearchParams(window.location.search).get("slug");
  if (dynamicSlug) {
    try {
      const plan = await fetchPublishedPlan(dynamicSlug);
      populatePlanPage(planPage, form, plan);
    } catch (error) {
      const hero = planPage.querySelector(".plan-hero .container");
      if (hero) {
        hero.replaceChildren();
        const eyebrow = document.createElement("p");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = "Plan no disponible";
        const title = document.createElement("h1");
        title.textContent = "Este plan no está publicado";
        const message = document.createElement("p");
        message.textContent = "Puede que se haya ocultado o eliminado. Vuelve a nuestros planes para elegir otra opción.";
        const link = document.createElement("a");
        link.className = "btn btn-primary";
        link.href = "/#planes";
        link.textContent = "Ver planes disponibles";
        hero.append(eyebrow, title, message, link);
      }
      planPage.querySelector(".section")?.setAttribute("hidden", "");
      console.info("No se pudo cargar el plan solicitado.", error);
      return;
    }
  }

  const basePrice = Number(planPage.dataset.planPrice || 0);
  const planName = planPage.dataset.planName || "Plan EventoSonic";
  const extraInputs = Array.from(form.querySelectorAll('input[name="extras"]'));
  const dietaryInputs = Array.from(form.querySelectorAll('input[name="dietas"]'));
  const dateInput = form.querySelector('input[name="fecha"]');
  const summaryPlan = document.querySelector("[data-summary-plan]");
  const summaryBase = document.querySelector("[data-summary-base]");
  const summaryExtras = document.querySelector("[data-summary-extras]");
  const summaryTotal = document.querySelector("[data-summary-total]");
  const errorMessage = document.querySelector("[data-form-error]");
  const successModal = document.querySelector("[data-success-modal]");
  const successMessage = document.querySelector("[data-success-message]");

  if (summaryPlan) summaryPlan.textContent = planName;
  if (summaryBase) summaryBase.textContent = formatCurrency(basePrice);
  if (summaryTotal) summaryTotal.textContent = formatCurrency(basePrice);

  if (dateInput) {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 15);
    dateInput.min = toDateInputValue(minDate);
  }

  extraInputs.forEach((input) => {
    input.addEventListener("change", updateSummary);
  });

  updateSummary();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (errorMessage) errorMessage.textContent = "";

    const validationError = validateForm(form, dateInput);
    if (validationError) {
      if (errorMessage) errorMessage.textContent = validationError;
      return;
    }

    const selectedExtras = getSelectedExtras(extraInputs);
    const dietarySelections = dietaryInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
    const extrasTotal = selectedExtras.reduce((sum, item) => sum + item.price, 0);
    const total = basePrice + extrasTotal;

    const payload = {
      plan_nombre: planName,
      cliente_nombre: form.nombre.value.trim(),
      cliente_email: form.email.value.trim(),
      cliente_telefono: form.telefono.value.trim(),
      evento_tipo: form.evento.value,
      evento_fecha: form.fecha.value,
      invitados: form.invitados.value,
      extras_lista: selectedExtras.length
        ? selectedExtras.map((item) => `${item.name} (+${item.price}€)`).join(", ")
        : "Sin extras añadidos",
      peticion_especial: form.peticion.value.trim() || "Sin petición especial",
      dieteticas: dietarySelections.length ? dietarySelections.join(", ") : "Sin preferencias dietéticas",
      precio_base: basePrice,
      precio_extras: extrasTotal,
      precio_total: total
    };

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Enviando solicitud...";
    }

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "No se pudo guardar la solicitud");
      }

      if (successMessage) {
        successMessage.textContent = `Gracias ${payload.cliente_nombre}, hemos recibido tu solicitud para el ${planName}. Uno de nuestros trabajadores te contactará por WhatsApp al número ${payload.cliente_telefono} en menos de 24 horas para ultimar todos los detalles.`;
      }

      if (successModal) {
        successModal.hidden = false;
      }

      form.reset();
      updateSummary();
    } catch (error) {
      if (errorMessage && error.message) {
        errorMessage.textContent = error.message;
        return;
      }

      if (errorMessage) {
        errorMessage.textContent = "Ha ocurrido un error al enviar. Por favor, escríbenos directamente a eventosonic25@gmail.com o por WhatsApp al 647 808 298.";
      }
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Enviar solicitud de reserva";
      }
    }
  });

  function updateSummary() {
    const selectedExtras = getSelectedExtras(extraInputs);
    const extrasTotal = selectedExtras.reduce((sum, item) => sum + item.price, 0);
    const total = basePrice + extrasTotal;

    summaryExtras.innerHTML = "";

    if (!selectedExtras.length) {
      const listItem = document.createElement("li");
      listItem.textContent = "No has seleccionado extras todavía.";
      summaryExtras.appendChild(listItem);
    } else {
      selectedExtras.forEach((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = `${item.name} (${formatCurrency(item.price)})`;
        summaryExtras.appendChild(listItem);
      });
    }

    if (summaryTotal) {
      summaryTotal.textContent = formatCurrency(total);
    }
  }
}

async function fetchPublishedPlan(slug) {
  if (!window.EventoSonicSupabase) throw new Error("Supabase no está disponible.");
  const client = await window.EventoSonicSupabase.getClient();
  const { data, error } = await client
    .from("plans")
    .select("slug,name,price,hero_title,hero_description,includes_title,features,extras")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();
  if (error || !data) throw error || new Error("Plan no encontrado.");
  return data;
}

function populatePlanPage(planPage, form, plan) {
  planPage.dataset.planName = plan.name;
  planPage.dataset.planPrice = String(plan.price || 0);
  document.title = `${plan.name} | EventoSonic`;

  const heroEyebrow = planPage.querySelector(".plan-hero .eyebrow");
  const heroTitle = planPage.querySelector(".plan-hero h1");
  const heroDescription = planPage.querySelector(".plan-hero .container > p:last-child");
  const includesTitle = planPage.querySelector(".plan-main > .content-card h2");
  const includesList = planPage.querySelector(".include-list");
  const extrasGrid = form.querySelector(".extras-grid");

  if (heroEyebrow) heroEyebrow.textContent = plan.name;
  if (heroTitle) heroTitle.textContent = plan.hero_title;
  if (heroDescription) heroDescription.textContent = plan.hero_description || "";
  if (includesTitle) includesTitle.textContent = plan.includes_title || "Qué incluye";

  if (includesList) {
    includesList.replaceChildren();
    (Array.isArray(plan.features) ? plan.features : []).forEach((feature) => {
      const item = document.createElement("li");
      item.textContent = feature;
      includesList.appendChild(item);
    });
  }

  if (extrasGrid) {
    extrasGrid.replaceChildren();
    (Array.isArray(plan.extras) ? plan.extras : []).forEach((extra) => {
      const label = document.createElement("label");
      label.className = "extra-card";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = "extras";
      input.value = extra.name || "Extra";
      input.dataset.price = String(Number(extra.price || 0));
      const title = document.createElement("span");
      title.className = "extra-title";
      title.append(document.createTextNode(`${input.value} `));
      const price = document.createElement("strong");
      price.textContent = `(+${formatCurrency(Number(extra.price || 0))})`;
      title.appendChild(price);
      const description = document.createElement("span");
      description.className = "extra-description";
      description.textContent = extra.description || "";
      label.append(input, title, description);
      extrasGrid.appendChild(label);
    });
  }
}

function getSelectedExtras(extraInputs) {
  return extraInputs
    .filter((input) => input.checked)
    .map((input) => ({
      name: input.value,
      price: Number(input.dataset.price || 0)
    }));
}

function validateForm(form, dateInput) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^[+\d\s().-]{9,}$/;

  if (!form.nombre.value.trim()) return "Por favor, introduce tu nombre completo.";
  if (!emailPattern.test(form.email.value.trim())) return "Introduce un email válido.";
  if (!phonePattern.test(form.telefono.value.trim())) return "Introduce un teléfono o WhatsApp válido.";
  if (!form.evento.value) return "Selecciona el tipo de evento.";
  if (!form.fecha.value) return "Selecciona la fecha del evento.";

  if (dateInput && dateInput.min && form.fecha.value < dateInput.min) {
    return "La fecha del evento debe ser al menos 15 días posterior a hoy.";
  }

  if (!form.invitados.value || Number(form.invitados.value) < 1) {
    return "Indica un número válido de invitados.";
  }

  return "";
}

function formatCurrency(amount) {
  return currencyFormatter.format(amount);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
