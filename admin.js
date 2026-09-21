(function () {
  "use strict";
  const CONFIG = window.REMANDO_CONFIG || {};
  const remote = CONFIG.supabase || {};
  const db = remote.url && remote.anonKey && window.supabase ? window.supabase.createClient(remote.url, remote.anonKey) : null;
  let state = { services: [], slots: [], bookings: [], settings: {}, templates: [], templatesReady: true, incomes: [], incomesReady: true };
  let bookingFilter = "all";
  const esc = value => String(value || "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const money = value => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Number(value || 0));
  const dateLabel = value => new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Santiago" }).format(new Date(value));
  const timeLabel = value => new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Santiago" }).format(new Date(value));
  const inputDate = value => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date(value));
  const weekdayLabel = value => (["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][Number(value)] || "Día");
  const monthKey = value => inputDate(value).slice(0, 7);
  const categoryLabel = value => ({ transferencia: "Transferencia", efectivo: "Efectivo", abono: "Abono", otro: "Otro" }[value] || "Ingreso");
  const service = id => state.services.find(item => item.id === id) || { name: "Salida", detail: "", price: 0 };
  const slotFor = booking => state.slots.find(slot => slot.id === booking.slot_id);
  const count = slotId => state.bookings.filter(item => item.slot_id === slotId && item.status !== "cancelled").length;
  const statusLabel = status => ({ pending: "pendiente", confirmed: "confirmada", cancelled: "cancelada" }[status] || status);

  async function loadState() {
    const [services, slots, bookings, settings, templates, incomes] = await Promise.all([
      db.from("services").select("*").order("sort_order"),
      db.from("slots").select("*").order("starts_at"),
      db.from("bookings").select("*").order("created_at", { ascending: false }),
      db.from("business_settings").select("key,value"),
      db.from("weekly_slot_templates").select("*").order("weekday").order("starts_time"),
      db.from("manual_income_entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false })
    ]);
    for (const result of [services, slots, bookings, settings]) if (result.error) throw result.error;
    state = { services: services.data || [], slots: slots.data || [], bookings: bookings.data || [], settings: Object.fromEntries((settings.data || []).map(item => [item.key, item.value])), templates: templates.data || [], templatesReady: !templates.error, incomes: incomes.data || [], incomesReady: !incomes.error };
  }

  function filteredBookings() {
    const search = (document.querySelector("[data-booking-search]")?.value || "").trim().toLowerCase();
    return state.bookings.filter(item => {
      const matchesStatus = bookingFilter === "all" || item.status === bookingFilter;
      const haystack = `${item.name} ${item.phone} ${item.email}`.toLowerCase();
      return matchesStatus && (!search || haystack.includes(search));
    });
  }

  function renderStats() {
    const upcoming = state.slots.filter(item => item.active && new Date(item.starts_at) >= new Date()).length;
    const pending = state.bookings.filter(item => item.status === "pending").length;
    const confirmed = state.bookings.filter(item => item.status === "confirmed");
    const clients = new Set(state.bookings.filter(item => item.status !== "cancelled").map(item => `${item.name}|${item.phone}`.toLowerCase())).size;
    const income = confirmed.reduce((sum, item) => sum + Number(service(slotFor(item)?.service_id).price || 0), 0);
    document.querySelector("[data-stats]").innerHTML = `
      <article class="stat"><span>Próximas salidas</span><strong>${upcoming}</strong></article>
      <article class="stat"><span>Por confirmar</span><strong>${pending}</strong></article>
      <article class="stat"><span>Confirmadas</span><strong>${confirmed.length}</strong></article>
      <article class="stat"><span>Clientes activos</span><strong>${clients}</strong></article>
      <article class="stat income"><span>Ingreso confirmado</span><strong>${money(income)}</strong></article>`;
  }

  function renderFinance() {
    const today = inputDate(new Date()); const month = today.slice(0, 7);
    const bookingIncome = key => state.bookings.filter(item => item.status === "confirmed" && slotFor(item) && inputDate(slotFor(item).starts_at).startsWith(key)).reduce((sum, item) => sum + Number(service(slotFor(item).service_id).price || 0), 0);
    const manualIncome = key => state.incomes.filter(item => String(item.entry_date || "").startsWith(key)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const todayBookings = bookingIncome(today); const monthBookings = bookingIncome(month); const todayManual = manualIncome(today); const monthManual = manualIncome(month);
    const summary = document.querySelector("[data-finance-summary]");
    summary.innerHTML = `<article><span>Total de hoy</span><strong>${money(todayBookings + todayManual)}</strong><small>${money(todayManual)} registrado · ${money(todayBookings)} en reservas confirmadas</small></article><article><span>Acumulado del mes</span><strong>${money(monthBookings + monthManual)}</strong><small>${money(monthManual)} manual · ${money(monthBookings)} confirmado</small></article><article><span>Ingresos manuales</span><strong>${state.incomes.length}</strong><small>Movimientos registrados</small></article>`;
    const list = document.querySelector("[data-income-list]");
    if (!state.incomesReady) { list.innerHTML = "<p class=\"empty-admin\">La caja se activará al actualizar la base de datos.</p>"; return; }
    list.innerHTML = state.incomes.length ? state.incomes.slice(0, 10).map(item => {
      const whatsapp = String(item.client_phone || "").replace(/\D/g, ""); const classMoment = item.class_date ? `${esc(item.class_date)}${item.class_time ? ` · ${esc(String(item.class_time).slice(0, 5))}` : ""}` : esc(item.entry_date);
      const serviceName = item.service_name || "Ingreso general";
      const person = item.client_name ? `<p class="income-client"><strong>${esc(item.client_name)}</strong>${item.participants ? ` · ${Number(item.participants)} participante${Number(item.participants) === 1 ? "" : "s"}` : ""}</p>` : "";
      const contact = item.client_phone ? `<small>${esc(item.client_phone)} ${whatsapp ? `<a href="https://wa.me/${whatsapp}" target="_blank" rel="noreferrer">WhatsApp ↗</a>` : ""}</small>` : "";
      const details = [item.health_info, item.emergency_name ? `Emergencia: ${item.emergency_name}${item.emergency_phone ? ` · ${item.emergency_phone}` : ""}` : "", item.note].filter(Boolean).map(esc).join(" · ");
      return `<article class="admin-row income-row"><div><strong>${money(item.amount)} · ${esc(categoryLabel(item.category))}</strong>${person}<p>${esc(serviceName)} · ${classMoment}</p>${details ? `<small class="income-details">${details}</small>` : ""}${contact}</div><div class="row-actions"><button class="icon-button" data-delete-income="${item.id}" aria-label="Eliminar ingreso">×</button></div></article>`;
    }).join("") : "<p class=\"empty-admin\">Aún no registras clases o ingresos manuales.</p>";
    const form = document.querySelector("[data-income-form]"); const date = form.elements.entryDate; const classDate = form.elements.classDate; if (!date.value) date.value = today; if (!classDate.value) classDate.value = today;
  }

  function renderSlots() {
    const target = document.querySelector("[data-slots-admin]");
    const upcoming = state.slots.filter(slot => new Date(slot.starts_at) > new Date());
    target.innerHTML = upcoming.length ? upcoming.map(slot => `<article class="admin-row slot-row"><div><strong>${dateLabel(slot.starts_at)} · ${timeLabel(slot.starts_at)} · ${esc(service(slot.service_id).name)}</strong><p>${count(slot.id)} de ${slot.capacity} cupos reservados · ${slot.active ? "Visible en la web" : "Oculto"}</p></div><div class="row-actions"><button class="small-btn" data-edit-slot="${slot.id}">Editar</button><button class="small-btn" data-toggle-slot="${slot.id}">${slot.active ? "Ocultar" : "Activar"}</button><button class="icon-button" data-delete-slot="${slot.id}" aria-label="Eliminar horario">×</button></div></article>`).join("") : "<p class=\"empty-admin\">No hay salidas futuras en esta semana.</p>";
  }

  function renderTemplates() {
    const target = document.querySelector("[data-templates-admin]");
    if (!state.templatesReady) { target.innerHTML = "<p class=\"empty-admin\">La agenda semanal se activará al actualizar la base de datos.</p>"; return; }
    target.innerHTML = state.templates.length ? state.templates.map(item => `<article class="admin-row template-row"><div><strong>${weekdayLabel(item.weekday)} · ${String(item.starts_time).slice(0, 5)} · ${esc(service(item.service_id).name)}</strong><p>${item.capacity} cupos · ${item.active ? "Se repite cada semana" : "Pausado"}</p></div><div class="row-actions"><button class="small-btn" data-edit-template="${item.id}">Editar</button><button class="small-btn" data-toggle-template="${item.id}">${item.active ? "Pausar" : "Activar"}</button><button class="icon-button" data-delete-template="${item.id}" aria-label="Eliminar horario semanal">×</button></div></article>`).join("") : "<p class=\"empty-admin\">Aún no hay horarios recurrentes. Agrega los días y horas que se repiten cada semana.</p>";
  }

  function renderBookings() {
    const target = document.querySelector("[data-bookings-admin]");
    const rows = filteredBookings();
    target.innerHTML = rows.length ? rows.map(item => {
      const slot = slotFor(item); const salida = slot ? `${dateLabel(slot.starts_at)} · ${timeLabel(slot.starts_at)} · ${esc(service(slot.service_id).name)}` : "Horario eliminado";
      return `<article class="admin-row booking-row"><div><strong>${esc(item.name)} <span class="status ${esc(item.status)}">${statusLabel(item.status)}</span></strong><p>${salida}</p><small>${esc(item.phone)} · reserva ${new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "2-digit" }).format(new Date(item.created_at))}</small></div><div class="row-actions"><button class="small-btn" data-view-booking="${item.id}">Ver ficha</button>${item.status !== "confirmed" ? `<button class="small-btn" data-booking-status="${item.id}" data-next-status="confirmed">Confirmar</button>` : ""}${item.status !== "cancelled" ? `<button class="small-btn is-danger" data-booking-status="${item.id}" data-next-status="cancelled">Cancelar</button>` : ""}</div></article>`;
    }).join("") : "<p class=\"empty-admin\">No hay clientes con este filtro.</p>";
  }

  function renderEditors() {
    document.querySelector("[data-price-form]").innerHTML = state.services.filter(item => item.active !== false).map(item => `<label class="price-line"><span><strong>${esc(item.name)}</strong><span>${esc(item.detail)}</span></span><input data-price-id="${item.id}" type="number" min="0" value="${item.price ?? ""}" aria-label="Valor de ${esc(item.name)}" /></label>`).join("") + "<button class=\"btn btn-dark\" type=\"submit\">Guardar valores →</button><p class=\"form-status\" data-price-status></p>";
    const settings = document.querySelector("[data-settings-form]");
    settings.elements.whatsappNumber.value = state.settings.whatsappNumber || "";
    settings.elements.location.value = state.settings.location || CONFIG.location || "Balneario Municipal, Antofagasta";
    const serviceOptions = state.services.filter(item => item.active !== false).map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
    document.querySelector("[data-service-options]").innerHTML = serviceOptions;
    document.querySelector("[data-template-service-options]").innerHTML = serviceOptions;
    document.querySelector("[data-income-service-options]").innerHTML = `<option value="" selected disabled>Selecciona una clase</option>${state.services.filter(item => item.active !== false).map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
  }

  function render() { renderStats(); renderFinance(); renderSlots(); renderTemplates(); renderBookings(); renderEditors(); }
  async function refresh() { await loadState(); render(); }
  function showStatus(selector, text, type) { const target = document.querySelector(selector); if (!target) return; target.textContent = text; target.className = `form-status ${type || ""}`; }
  async function ensureAdmin() { const { data, error } = await db.rpc("is_admin"); if (error || !data) throw new Error("Esta cuenta no tiene acceso de instructor."); }

  function openSlotDialog(slot) {
    const dialog = document.querySelector("[data-slot-dialog]"); const form = document.querySelector("[data-slot-form]");
    form.reset(); form.elements.slotId.value = slot?.id || "";
    document.querySelector("[data-slot-dialog-title]").textContent = slot ? "Editar horario" : "Nuevo horario";
    document.querySelector("[data-slot-save]").textContent = slot ? "Guardar cambios →" : "Agregar horario →";
    if (slot) { form.elements.date.value = inputDate(slot.starts_at); form.elements.time.value = timeLabel(slot.starts_at); form.elements.serviceId.value = slot.service_id; form.elements.capacity.value = slot.capacity; }
    dialog.showModal();
  }

  function openTemplateDialog(template) {
    const dialog = document.querySelector("[data-template-dialog]"); const form = document.querySelector("[data-template-form]");
    form.reset(); form.elements.templateId.value = template?.id || "";
    document.querySelector("[data-template-dialog-title]").textContent = template ? "Editar horario semanal" : "Nuevo horario semanal";
    document.querySelector("[data-template-save]").textContent = template ? "Guardar horario semanal →" : "Agregar horario semanal →";
    if (template) { form.elements.weekday.value = template.weekday; form.elements.startsTime.value = String(template.starts_time).slice(0, 5); form.elements.serviceId.value = template.service_id; form.elements.capacity.value = template.capacity; }
    dialog.showModal();
  }

  function openBookingDialog(id) {
    const booking = state.bookings.find(item => item.id === id); if (!booking) return;
    const slot = slotFor(booking); const whatsApp = String(booking.phone || "").replace(/\D/g, "");
    const departure = slot ? `${dateLabel(slot.starts_at)} · ${timeLabel(slot.starts_at)} · ${esc(service(slot.service_id).name)}` : "Horario eliminado";
    document.querySelector("[data-booking-detail]").innerHTML = `<div class="client-sheet"><div><span>Cliente</span><strong>${esc(booking.name)}</strong></div><div><span>Salida</span><strong>${departure}</strong></div><div><span>Estado</span><strong><span class="status ${esc(booking.status)}">${statusLabel(booking.status)}</span></strong></div><div><span>WhatsApp</span><strong>${esc(booking.phone)} ${whatsApp ? `<a href="https://wa.me/${whatsApp}" target="_blank" rel="noreferrer">Abrir chat ↗</a>` : ""}</strong></div><div><span>Correo</span><strong>${esc(booking.email || "No informado")}</strong></div><div><span>Edad</span><strong>${esc(booking.age || "No informada")}</strong></div><div><span>Contacto de emergencia</span><strong>${esc(booking.emergency_name)} · ${esc(booking.emergency_phone)}</strong></div><div class="client-sheet-wide"><span>Información relevante para la actividad</span><strong>${esc(booking.health_info || "No informó antecedentes.")}</strong></div></div>`;
    document.querySelector("[data-booking-dialog]").showModal();
  }

  async function openApp() { await ensureAdmin(); document.querySelector("[data-login]").hidden = true; document.querySelector("[data-admin-app]").hidden = false; await refresh(); }

  function setup() {
    const login = document.querySelector("[data-login-form]");
    if (!db) { showStatus("[data-login-status]", "Falta la configuración de Supabase.", "error"); return; }
    db.auth.getSession().then(({ data }) => { if (data.session) openApp().catch(error => showStatus("[data-login-status]", error.message, "error")); });
    login.addEventListener("submit", async event => { event.preventDefault(); const values = new FormData(login); const email = String(values.get("email") || "").trim(); const password = String(values.get("password") || ""); const { error } = await db.auth.signInWithPassword({ email, password }); if (error) { showStatus("[data-login-status]", "Correo, contraseña o permiso de instructor incorrecto.", "error"); return; } try { await openApp(); } catch (accessError) { await db.auth.signOut(); showStatus("[data-login-status]", accessError.message || "Esta cuenta no tiene permiso de instructor.", "error"); } });
    document.querySelector("[data-logout]").addEventListener("click", async () => { await db.auth.signOut(); document.querySelector("[data-admin-app]").hidden = true; document.querySelector("[data-login]").hidden = false; });
    document.querySelector("[data-refresh]").addEventListener("click", () => refresh().catch(error => alert(error.message || "No pudimos actualizar los datos.")));
    document.querySelector("[data-booking-search]").addEventListener("input", renderBookings);
    document.querySelector("[data-close-booking]").addEventListener("click", () => document.querySelector("[data-booking-dialog]").close());
    document.addEventListener("click", async event => {
      const toggle = event.target.closest("[data-toggle-slot]"); const remove = event.target.closest("[data-delete-slot]"); const status = event.target.closest("[data-booking-status]"); const edit = event.target.closest("[data-edit-slot]"); const view = event.target.closest("[data-view-booking]"); const filter = event.target.closest("[data-booking-filter]"); const templateEdit = event.target.closest("[data-edit-template]"); const templateToggle = event.target.closest("[data-toggle-template]"); const templateRemove = event.target.closest("[data-delete-template]"); const incomeRemove = event.target.closest("[data-delete-income]");
      try {
        if (filter) { bookingFilter = filter.dataset.bookingFilter; document.querySelectorAll("[data-booking-filter]").forEach(button => button.classList.toggle("is-active", button === filter)); renderBookings(); }
        if (edit) openSlotDialog(state.slots.find(item => item.id === edit.dataset.editSlot));
        if (view) openBookingDialog(view.dataset.viewBooking);
        if (templateEdit) openTemplateDialog(state.templates.find(item => item.id === templateEdit.dataset.editTemplate));
        if (toggle) { const row = state.slots.find(item => item.id === toggle.dataset.toggleSlot); const { error } = await db.from("slots").update({ active: !row.active }).eq("id", row.id); if (error) throw error; await refresh(); }
        if (remove) { const { error } = await db.from("slots").delete().eq("id", remove.dataset.deleteSlot); if (error) throw error; await refresh(); }
        if (templateToggle) { const row = state.templates.find(item => item.id === templateToggle.dataset.toggleTemplate); const { error } = await db.from("weekly_slot_templates").update({ active: !row.active, updated_at: new Date().toISOString() }).eq("id", row.id); if (error) throw error; await db.rpc("refresh_booking_week"); await refresh(); }
        if (templateRemove) { const { error } = await db.from("weekly_slot_templates").delete().eq("id", templateRemove.dataset.deleteTemplate); if (error) throw error; await refresh(); }
        if (incomeRemove) { const { error } = await db.from("manual_income_entries").delete().eq("id", incomeRemove.dataset.deleteIncome); if (error) throw error; await refresh(); }
        if (status) { const { error } = await db.from("bookings").update({ status: status.dataset.nextStatus }).eq("id", status.dataset.bookingStatus); if (error) throw error; await refresh(); }
      } catch (error) { alert(error.message || "No pudimos guardar el cambio."); }
    });
    document.querySelector("[data-open-slot]").addEventListener("click", () => openSlotDialog());
    document.querySelector("[data-open-template]").addEventListener("click", () => openTemplateDialog());
    document.querySelector("[data-slot-form]").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries()); const payload = { starts_at: new Date(`${values.date}T${values.time}:00`).toISOString(), service_id: values.serviceId, capacity: Number(values.capacity), active: true };
      const result = values.slotId ? await db.from("slots").update(payload).eq("id", values.slotId) : await db.from("slots").insert(payload);
      if (result.error) { alert(result.error.message); return; } document.querySelector("[data-slot-dialog]").close(); await refresh();
    });
    document.querySelector("[data-template-form]").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
      const payload = { weekday: Number(values.weekday), starts_time: values.startsTime, service_id: values.serviceId, capacity: Number(values.capacity), active: true, updated_at: new Date().toISOString() };
      const result = values.templateId ? await db.from("weekly_slot_templates").update(payload).eq("id", values.templateId) : await db.from("weekly_slot_templates").insert(payload);
      if (result.error) { alert(result.error.message); return; }
      const scheduled = await db.rpc("refresh_booking_week"); if (scheduled.error) { alert(scheduled.error.message); return; }
      document.querySelector("[data-template-dialog]").close(); await refresh();
    });
    document.querySelector("[data-income-form]").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form).entries());
      const { error } = await db.from("manual_income_entries").insert({ amount: Number(values.amount), entry_date: values.entryDate, category: values.category, note: String(values.note || "").trim() || null, client_name: String(values.clientName || "").trim(), client_phone: String(values.clientPhone || "").trim(), service_name: String(values.serviceId || "").trim(), class_date: values.classDate, class_time: values.classTime, participants: Number(values.participants), emergency_name: String(values.emergencyName || "").trim() || null, emergency_phone: String(values.emergencyPhone || "").trim() || null, health_info: String(values.healthInfo || "").trim() || null });
      showStatus("[data-income-status]", error ? error.message : "Clase e ingreso registrados en caja.", error ? "error" : "success");
      if (!error) { form.reset(); await refresh(); }
    });
    document.querySelector("[data-price-form]").addEventListener("submit", async event => { event.preventDefault(); for (const input of event.currentTarget.querySelectorAll("[data-price-id]")) { const price = input.value === "" ? null : Number(input.value); const { error } = await db.from("services").update({ price }).eq("id", input.dataset.priceId); if (error) { showStatus("[data-price-status]", error.message, "error"); return; } } showStatus("[data-price-status]", "Valores actualizados en la web.", "success"); await refresh(); });
    document.querySelector("[data-settings-form]").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const rows = Object.entries(values).map(([key, value]) => ({ key, value: value.trim(), updated_at: new Date().toISOString() })); const { error } = await db.from("business_settings").upsert(rows); showStatus("[data-settings-status]", error ? error.message : "Ajustes guardados en la web.", error ? "error" : "success"); if (!error) await refresh(); });
    document.querySelector("[data-export]").addEventListener("click", () => { const header = ["estado", "nombre", "whatsapp", "correo", "edad", "emergencia", "teléfono emergencia", "información relevante", "fecha solicitud"]; const rows = state.bookings.map(item => [item.status, item.name, item.phone, item.email, item.age, item.emergency_name, item.emergency_phone, item.health_info, item.created_at]); const csv = [header, ...rows].map(row => row.map(cell => `"${String(cell || "").replace(/"/g, '""')}"`).join(",")).join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); link.download = `reservas-remando-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href); });
  }
  document.addEventListener("DOMContentLoaded", setup);
})();
