const currencyFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});

document.addEventListener("DOMContentLoaded", async () => {
  await loadPartials();
  initMobileMenu();
  initAnchorNavigation();
  initRevealAnimations();
  initMediaFrames();
  initCarousel();
  initPlanPage();
});

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

function initPlanPage() {
  const planPage = document.querySelector("[data-plan-page]");
  const form = document.querySelector("[data-booking-form]");
  if (!planPage || !form) return;

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
      const response = await fetch("/api/requests.php", {
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
