(function () {
  "use strict";
  const CONFIG = window.REMANDO_CONFIG || {};
  const remote = CONFIG.supabase || {};
  const db = remote.url && remote.anonKey && window.supabase ? window.supabase.createClient(remote.url, remote.anonKey) : null;
  let state = { services: [], slots: [], bookings: [], settings: {} };
  const esc = value => String(value || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  const dateLabel = value => new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Santiago" }).format(new Date(value));
  const timeLabel = value => new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" }).format(new Date(value));
  const service = id => state.services.find(item => item.id === id) || { name: "Salida", detail: "" };
  const count = slotId => state.bookings.filter(item => item.slot_id === slotId && item.status !== "cancelled").length;

  async function loadState() {
    const [services, slots, bookings, settings] = await Promise.all([
      db.from("services").select("*").order("sort_order"),
      db.from("slots").select("*").order("starts_at"),
      db.from("bookings").select("*").order("created_at", { ascending: false }),
      db.from("business_settings").select("key,value")
    ]);
    for (const result of [services, slots, bookings, settings]) if (result.error) throw result.error;
    state = { services: services.data || [], slots: slots.data || [], bookings: bookings.data || [], settings: Object.fromEntries((settings.data || []).map(item => [item.key, item.value])) };
  }

  function render() {
    const pending = state.bookings.filter(item => item.status === "pending").length;
    const confirmed = state.bookings.filter(item => item.status === "confirmed").length;
    document.querySelector("[data-stats]").innerHTML = `<article class="stat"><span>Horas activas</span><strong>${state.slots.filter(item => item.active).length}</strong></article><article class="stat"><span>Por confirmar</span><strong>${pending}</strong></article><article class="stat"><span>Reservas confirmadas</span><strong>${confirmed}</strong></article>`;
    document.querySelector("[data-slots-admin]").innerHTML = state.slots.length ? state.slots.map(slot => `<article class="admin-row"><div><strong>${dateLabel(slot.starts_at)} · ${timeLabel(slot.starts_at)} · ${esc(service(slot.service_id).name)}</strong><p>${count(slot.id)} de ${slot.capacity} cupos reservados · ${slot.active ? "Visible en la web" : "Oculto"}</p></div><div class="row-actions"><button class="small-btn" data-toggle-slot="${slot.id}">${slot.active ? "Ocultar" : "Activar"}</button><button class="icon-button" data-delete-slot="${slot.id}" aria-label="Eliminar horario">×</button></div></article>`).join("") : "<p class=\"empty-admin\">Aún no agregas horarios.</p>";
    document.querySelector("[data-bookings-admin]").innerHTML = state.bookings.length ? state.bookings.map(item => { const slot = state.slots.find(row => row.id === item.slot_id); return `<article class="admin-row"><div><strong>${esc(item.name)} <span class="status ${item.status}">${item.status === "pending" ? "pendiente" : item.status === "confirmed" ? "confirmada" : "cancelada"}</span></strong><p>${slot ? `${dateLabel(slot.starts_at)} · ${timeLabel(slot.starts_at)} · ${esc(service(slot.service_id).name)}` : "Horario eliminado"}</p><small>WhatsApp ${esc(item.phone)} · emergencia: ${esc(item.emergency_name)} (${esc(item.emergency_phone)})${item.health_info ? " · información de seguridad registrada" : ""}</small></div><div class="row-actions"><button class="small-btn" data-booking-status="${item.id}" data-next-status="confirmed">Confirmar</button><button class="small-btn" data-booking-status="${item.id}" data-next-status="cancelled">Cancelar</button></div></article>`; }).join("") : "<p class=\"empty-admin\">Todavía no llegan solicitudes.</p>";
    document.querySelector("[data-price-form]").innerHTML = state.services.map(item => `<label class="price-line"><span><strong>${esc(item.name)}</strong><span>${esc(item.detail)}</span></span><input data-price-id="${item.id}" type="number" min="0" value="${item.price ?? ""}" aria-label="Valor de ${esc(item.name)}" /></label>`).join("") + "<button class=\"btn btn-dark\" type=\"submit\">Guardar valores →</button><p class=\"form-status\" data-price-status></p>";
    const settings = document.querySelector("[data-settings-form]");
    settings.elements.whatsappNumber.value = state.settings.whatsappNumber || "";
    settings.elements.location.value = state.settings.location || CONFIG.location || "Balneario Municipal, Antofagasta";
    document.querySelector("[data-service-options]").innerHTML = state.services.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
  }

  async function refresh() { await loadState(); render(); }
  function showStatus(selector, text, type) { const target = document.querySelector(selector); target.textContent = text; target.className = `form-status ${type || ""}`; }
  async function ensureAdmin() { const { data, error } = await db.rpc("is_admin"); if (error || !data) throw new Error("Esta cuenta no tiene acceso de instructor."); }

  async function openApp() {
    await ensureAdmin();
    document.querySelector("[data-login]").hidden = true;
    document.querySelector("[data-admin-app]").hidden = false;
    await refresh();
  }

  function setup() {
    const login = document.querySelector("[data-login-form]");
    if (!db) { showStatus("[data-login-status]", "Falta la configuración de Supabase.", "error"); return; }
    db.auth.getSession().then(({ data }) => { if (data.session) openApp().catch(error => showStatus("[data-login-status]", error.message, "error")); });
    login.addEventListener("submit", async event => {
      event.preventDefault();
      const email = new FormData(login).get("email").trim();
      const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
      showStatus("[data-login-status]", error ? error.message : "Revisa tu correo y abre el enlace seguro para entrar.", error ? "error" : "success");
    });
    document.querySelector("[data-logout]").addEventListener("click", async () => { await db.auth.signOut(); document.querySelector("[data-admin-app]").hidden = true; document.querySelector("[data-login]").hidden = false; });
    document.addEventListener("click", async event => {
      const toggle = event.target.closest("[data-toggle-slot]"); const remove = event.target.closest("[data-delete-slot]"); const status = event.target.closest("[data-booking-status]");
      try {
        if (toggle) { const row = state.slots.find(item => item.id === toggle.dataset.toggleSlot); await db.from("slots").update({ active: !row.active }).eq("id", row.id); await refresh(); }
        if (remove) { await db.from("slots").delete().eq("id", remove.dataset.deleteSlot); await refresh(); }
        if (status) { await db.from("bookings").update({ status: status.dataset.nextStatus }).eq("id", status.dataset.bookingStatus); await refresh(); }
      } catch (error) { alert(error.message || "No pudimos guardar el cambio."); }
    });
    const dialog = document.querySelector("[data-slot-dialog]");
    document.querySelector("[data-open-slot]").addEventListener("click", () => dialog.showModal());
    document.querySelector("[data-slot-form]").addEventListener("submit", async event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const startsAt = new Date(`${values.date}T${values.time}:00`).toISOString();
      const { error } = await db.from("slots").insert({ starts_at: startsAt, service_id: values.serviceId, capacity: Number(values.capacity), active: true });
      if (error) { alert(error.message); return; } dialog.close(); event.currentTarget.reset(); await refresh();
    });
    document.querySelector("[data-price-form]").addEventListener("submit", async event => {
      event.preventDefault();
      for (const input of event.currentTarget.querySelectorAll("[data-price-id]")) {
        const price = input.value === "" ? null : Number(input.value);
        const { error } = await db.from("services").update({ price }).eq("id", input.dataset.priceId);
        if (error) { showStatus("[data-price-status]", error.message, "error"); return; }
      }
      showStatus("[data-price-status]", "Valores actualizados en la web.", "success"); await refresh();
    });
    document.querySelector("[data-settings-form]").addEventListener("submit", async event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      const rows = Object.entries(values).map(([key, value]) => ({ key, value: value.trim(), updated_at: new Date().toISOString() }));
      const { error } = await db.from("business_settings").upsert(rows);
      showStatus("[data-settings-status]", error ? error.message : "Ajustes guardados en la web.", error ? "error" : "success"); if (!error) await refresh();
    });
    document.querySelector("[data-export]").addEventListener("click", () => {
      const header = ["estado", "nombre", "whatsapp", "correo", "edad", "emergencia", "teléfono emergencia", "información relevante", "fecha solicitud"];
      const rows = state.bookings.map(item => [item.status, item.name, item.phone, item.email, item.age, item.emergency_name, item.emergency_phone, item.health_info, item.created_at]);
      const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `reservas-remando-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
    });
  }
  document.addEventListener("DOMContentLoaded", setup);
})();
