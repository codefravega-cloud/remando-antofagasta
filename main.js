(function () {
  "use strict";
  const CONFIG = window.REMANDO_CONFIG || {};
  const remoteConfig = CONFIG.supabase || {};
  const remoteEnabled = Boolean(remoteConfig.url && remoteConfig.anonKey && window.supabase);
  const db = remoteEnabled ? window.supabase.createClient(remoteConfig.url, remoteConfig.anonKey) : null;
  let remoteState = null;
  const KEY = "remando-antofagasta-v1";
  const services = [
    { id: "tour", name: "Tour guiado SUP", detail: "Amanecer o atardecer · 60–90 min", price: 20000, label: "por persona", featured: true },
    { id: "yoga", name: "Yoga SUP", detail: "Jueves 09:00 y fines de semana · según clima", price: null, label: "consulta próximas fechas", featured: false },
    { id: "isla", name: "Isla SUP & eventos", detail: "Cumpleaños, empresas y colaboraciones", price: null, label: "cotización a medida", featured: false }
  ];
  const formatCLP = amount => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(amount);
  const dateLabel = date => new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00`));
  const makeSeedSlots = () => {
    const list = [];
    const base = new Date();
    for (let i = 1; i < 7 && list.length < 6; i += 1) {
      const day = new Date(base); day.setDate(base.getDate() + i);
      if (day.getDay() === 0) continue;
      const iso = day.toISOString().slice(0, 10);
      if (day.getDay() === 4) list.push({ id: `slot-${iso}-0900`, date: iso, time: "09:00", serviceId: "yoga", capacity: 8, active: true });
      if (day.getDay() === 6 || day.getDay() === 0) {
        list.push({ id: `slot-${iso}-0900`, date: iso, time: "09:00", serviceId: "tour", capacity: 4, active: true });
        list.push({ id: `slot-${iso}-1800`, date: iso, time: "18:00", serviceId: "tour", capacity: 4, active: true });
      }
    }
    return list;
  };
  const defaultState = () => ({ services, slots: makeSeedSlots(), bookings: [], settings: { whatsappNumber: CONFIG.whatsappNumber || "", location: CONFIG.location || "Balneario Municipal, Antofagasta" } });
  const setState = data => localStorage.setItem(KEY, JSON.stringify(data));
  const migrateState = state => {
    if (!state || !Array.isArray(state.services)) return state;
    const legacy = state.services.some(item => ["compartida", "privada", "paseo"].includes(item.id));
    if (!legacy) return state;
    const map = { compartida: "tour", privada: "yoga", paseo: "isla" };
    state.services = services;
    state.slots = (state.bookings || []).length ? (state.slots || []).map(slot => ({ ...slot, serviceId: map[slot.serviceId] || slot.serviceId })) : makeSeedSlots();
    setState(state);
    return state;
  };
  const getState = () => {
    if (remoteEnabled) return remoteState || { services: [], slots: [], bookings: [], settings: { whatsappNumber: CONFIG.whatsappNumber || "", location: CONFIG.location || "Balneario Municipal, Antofagasta" } };
    try { const stored = JSON.parse(localStorage.getItem(KEY)); if (stored) return migrateState(stored); const initial = defaultState(); setState(initial); return initial; } catch (_) { const initial = defaultState(); setState(initial); return initial; }
  };
  const escapeHtml = str => String(str || "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const getService = (state, id) => state.services.find(item => item.id === id) || state.services[0];
  const bookedCount = (state, slotId) => {
    const slot = state.slots.find(item => item.id === slotId);
    if (slot && Number.isInteger(slot.booked)) return slot.booked;
    return state.bookings.filter(item => item.slotId === slotId && item.status !== "cancelled").length;
  };

  async function loadRemoteState() {
    if (!db) return;
    const [serviceResult, slotResult, settingsResult] = await Promise.all([
      db.from("services").select("id,name,detail,price,label,featured,sort_order").eq("active", true).order("sort_order"),
      db.rpc("available_slots"),
      db.from("business_settings").select("key,value")
    ]);
    if (serviceResult.error) throw serviceResult.error;
    if (slotResult.error) throw slotResult.error;
    if (settingsResult.error) throw settingsResult.error;
    const settings = Object.fromEntries((settingsResult.data || []).map(item => [item.key, item.value]));
    remoteState = {
      services: serviceResult.data || [],
      slots: (slotResult.data || []).map(slot => {
        const startsAt = new Date(slot.starts_at);
        return {
          id: slot.id,
          date: startsAt.toLocaleDateString("en-CA", { timeZone: "America/Santiago" }),
          time: startsAt.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" }),
          serviceId: slot.service_id,
          capacity: slot.capacity,
          booked: slot.capacity - slot.remaining,
          active: true
        };
      }),
      bookings: [],
      settings: { whatsappNumber: settings.whatsappNumber || CONFIG.whatsappNumber || "", location: settings.location || CONFIG.location || "Balneario Municipal, Antofagasta" }
    };
  }

  function renderPricing() {
    const target = document.querySelector("[data-pricing-grid]"); if (!target) return;
    const state = getState();
    target.innerHTML = state.services.map(item => { const price = Number.isFinite(item.price) && item.price > 0 ? formatCLP(item.price) : "Consultar"; return `<article class="price-card ${item.featured ? "featured" : ""}">${item.featured ? "<span class=\"price-pill\">Valor publicado</span>" : ""}<p>${escapeHtml(item.detail)}</p><h3>${escapeHtml(item.name)}</h3><div class="price"><strong>${price}</strong><span>${escapeHtml(item.label)}</span></div><a class="price-action" href="#reserva" data-service-choice="${item.id}">Quiero esta salida <span>→</span></a></article>`; }).join("");
  }
  function renderSlots() {
    const target = document.querySelector("[data-slot-list]"); if (!target) return;
    const state = getState();
    const available = state.slots.filter(slot => slot.active && bookedCount(state, slot.id) < slot.capacity).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    target.innerHTML = available.length ? available.map(slot => { const service = getService(state, slot.serviceId); const remaining = slot.capacity - bookedCount(state, slot.id); return `<button class="slot" type="button" data-slot-id="${slot.id}"><span><strong>${dateLabel(slot.date)}</strong><small>${service.name} · ${service.detail.split("·")[1] || ""}</small></span><span class="slot-right"><b>${slot.time}</b><small>${remaining} ${remaining === 1 ? "cupo" : "cupos"}</small></span></button>`; }).join("") : "<p class=\"empty-slots\">No hay horas abiertas por ahora. Escríbenos para coordinar tu salida.</p>";
  }
  function selectSlot(id) {
    const state = getState(); const slot = state.slots.find(item => item.id === id); if (!slot) return;
    document.querySelectorAll(".slot").forEach(el => el.classList.toggle("selected", el.dataset.slotId === id));
    const input = document.querySelector('[name="slotId"]'); const label = document.querySelector("[data-selected-slot]");
    if (input) input.value = id;
    if (label) { const service = getService(state, slot.serviceId); label.textContent = `${dateLabel(slot.date)} · ${slot.time} · ${service.name}`; }
  }
  function handleBooking(form) {
    form.addEventListener("submit", async event => {
      event.preventDefault(); const status = form.querySelector("[data-form-status]");
      if (!form.reportValidity()) return;
      const state = getState(); const values = Object.fromEntries(new FormData(form).entries()); const slot = state.slots.find(item => item.id === values.slotId);
      if (!slot) { status.textContent = "Primero selecciona una hora disponible."; status.className = "form-status error"; return; }
      if (bookedCount(state, slot.id) >= slot.capacity) { renderSlots(); status.textContent = "Ese horario acaba de llenarse. Elige otro cupo."; status.className = "form-status error"; return; }
      if (db) {
        const submit = form.querySelector("button[type=submit]");
        submit.disabled = true;
        status.textContent = "Enviando solicitud…";
        status.className = "form-status";
        const { error } = await db.rpc("create_booking", {
          p_slot_id: slot.id,
          p_name: values.name.trim(),
          p_phone: values.phone.trim(),
          p_email: values.email.trim(),
          p_age: Number(values.age),
          p_emergency_name: values.emergencyName.trim(),
          p_emergency_phone: values.emergencyPhone.trim(),
          p_health_info: values.healthInfo.trim(),
          p_consent_at: new Date().toISOString()
        });
        submit.disabled = false;
        if (error) {
          status.textContent = error.message || "No pudimos enviar la solicitud. Inténtalo de nuevo.";
          status.className = "form-status error";
          return;
        }
        await loadRemoteState();
        renderSlots();
        form.reset();
        status.textContent = "Solicitud enviada. Te contactaremos para confirmar tu salida.";
        status.className = "form-status success";
        const whatsapp = getState().settings.whatsappNumber || CONFIG.whatsappNumber;
        if (whatsapp) {
          const service = getService(getState(), slot.serviceId);
          const message = `Hola, soy ${values.name.trim()}. Envié una solicitud para ${service.name} el ${dateLabel(slot.date)} a las ${slot.time}. ¿Me confirman disponibilidad?`;
          window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
        }
        return;
      }
      const booking = { id: `res-${Date.now()}`, slotId: slot.id, name: values.name.trim(), phone: values.phone.trim(), email: values.email.trim(), age: values.age, emergencyName: values.emergencyName.trim(), emergencyPhone: values.emergencyPhone.trim(), healthInfo: values.healthInfo.trim(), consentAt: new Date().toISOString(), createdAt: new Date().toISOString(), status: "pending" };
      state.bookings.push(booking); setState(state); renderSlots(); form.reset();
      status.textContent = "Solicitud enviada. Te contactaremos para confirmar tu salida."; status.className = "form-status success";
      const whatsapp = state.settings.whatsappNumber || CONFIG.whatsappNumber;
      if (whatsapp) { const service = getService(state, slot.serviceId); const message = `Hola, soy ${booking.name}. Envié una solicitud para ${service.name} el ${dateLabel(slot.date)} a las ${slot.time}. ¿Me confirman disponibilidad?`; window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`, "_blank", "noopener"); }
    });
  }
  function initLinks() {
    const state = getState(); const number = state.settings.whatsappNumber || CONFIG.whatsappNumber;
    document.querySelectorAll("[data-whatsapp-link]").forEach(link => { if (number) { link.href = `https://wa.me/${number}`; link.target = "_blank"; link.rel = "noreferrer"; } else { link.href = "#reserva"; link.title = "Configura el WhatsApp desde el panel del instructor"; } });
    document.querySelectorAll("[data-current-year]").forEach(el => el.textContent = new Date().getFullYear());
  }
  function weatherText(code) {
    const labels = { 0: "Despejado", 1: "Mayormente despejado", 2: "Parcialmente nublado", 3: "Nublado", 45: "Neblina", 48: "Neblina", 51: "Llovizna", 53: "Llovizna", 55: "Llovizna", 61: "Lluvia", 63: "Lluvia", 65: "Lluvia", 80: "Chubascos", 81: "Chubascos", 82: "Chubascos", 95: "Tormenta" };
    return labels[code] || "Condición variable";
  }
  function setWeather(selector, text) {
    const target = document.querySelector(selector); if (target) target.textContent = text;
  }
  async function initMarineWeather() {
    if (!document.querySelector("[data-weather-temp]")) return;
    const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=-23.67082&longitude=-70.40891&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=America%2FSantiago";
    const marineUrl = "https://marine-api.open-meteo.com/v1/marine?latitude=-23.67082&longitude=-70.40891&current=wave_height,wave_period&timezone=America%2FSantiago";
    try {
      const [weatherResponse, marineResponse] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
      if (!weatherResponse.ok || !marineResponse.ok) throw new Error("No fue posible actualizar el estado del mar");
      const [weather, marine] = await Promise.all([weatherResponse.json(), marineResponse.json()]);
      const current = weather.current || {}; const daily = weather.daily || {}; const sea = marine.current || {};
      const high = daily.temperature_2m_max && Number.isFinite(daily.temperature_2m_max[0]) ? ` · máxima ${Math.round(daily.temperature_2m_max[0])}°` : "";
      const low = daily.temperature_2m_min && Number.isFinite(daily.temperature_2m_min[0]) ? ` / mínima ${Math.round(daily.temperature_2m_min[0])}°` : "";
      setWeather("[data-weather-temp]", Number.isFinite(current.temperature_2m) ? `${Math.round(current.temperature_2m)}°C${high}${low}` : "Sin lectura");
      setWeather("[data-weather-condition]", weatherText(current.weather_code));
      setWeather("[data-weather-wind]", Number.isFinite(current.wind_speed_10m) ? `${Math.round(current.wind_speed_10m)} km/h` : "Sin lectura");
      setWeather("[data-weather-wave]", Number.isFinite(sea.wave_height) ? `${sea.wave_height.toFixed(1)} m · ${Number.isFinite(sea.wave_period) ? `${Math.round(sea.wave_period)} s` : "—"}` : "Sin lectura");
      const stamp = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date());
      setWeather("[data-weather-note]", `Actualizado a las ${stamp} para Balneario Municipal. Es una referencia; el instructor confirma seguridad y factibilidad de la salida.`);
    } catch (_) {
      setWeather("[data-weather-temp]", "Consulta local");
      setWeather("[data-weather-condition]", "Por confirmar");
      setWeather("[data-weather-wind]", "Por confirmar");
      setWeather("[data-weather-wave]", "Por confirmar");
      setWeather("[data-weather-note]", "No pudimos actualizar las condiciones ahora. Escríbenos para confirmar el estado del mar antes de salir.");
    }
  }
  function initInteractions() {
    const header = document.querySelector("[data-header]"); const onScroll = () => header && header.classList.toggle("is-scrolled", window.scrollY > 30); onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); reveal.unobserve(entry.target); } }), { threshold: 0.03 }); document.querySelectorAll(".reveal").forEach(el => reveal.observe(el));
    setTimeout(() => document.querySelectorAll(".reveal:not(.is-visible)").forEach(el => el.classList.add("is-visible")), 6000);
    document.addEventListener("click", event => { const slot = event.target.closest("[data-slot-id]"); if (slot) selectSlot(slot.dataset.slotId); const service = event.target.closest("[data-service-choice]"); if (service) { document.querySelector("#reserva").scrollIntoView({ behavior: "smooth" }); setTimeout(() => { const state = getState(); const next = state.slots.find(slot => slot.serviceId === service.dataset.serviceChoice && slot.active && bookedCount(state, slot.id) < slot.capacity); if (next) selectSlot(next.id); }, 500); } });
  }
  function safe(fn, name) { try { fn(); } catch (error) { console.warn(`[${name}]`, error); } }
  async function init() {
    if (db) {
      try { await loadRemoteState(); }
      catch (error) {
        console.warn("[supabase]", error);
        const slots = document.querySelector("[data-slot-list]");
        if (slots) slots.innerHTML = "<p class=\"empty-slots\">La agenda se está actualizando. Escríbenos por WhatsApp para coordinar tu salida.</p>";
      }
    }
    safe(renderPricing, "precios"); safe(renderSlots, "horarios"); safe(initLinks, "enlaces"); safe(initInteractions, "interacciones"); safe(initMarineWeather, "estado-del-mar"); const form = document.querySelector("[data-booking-form]"); if (form) safe(() => handleBooking(form), "reserva");
  }
  document.addEventListener("DOMContentLoaded", init);
})();
