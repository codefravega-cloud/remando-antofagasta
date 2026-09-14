(function () {
  "use strict";
  const KEY = "remando-antofagasta-v1";
  const CONFIG = window.REMANDO_CONFIG || {};
  const makeSeedSlots = () => { const list = []; const base = new Date(); for (let i = 1; i < 7 && list.length < 6; i += 1) { const day = new Date(base); day.setDate(base.getDate() + i); if (day.getDay() === 0) continue; const iso = day.toISOString().slice(0, 10); list.push({ id:`slot-${iso}-0900`,date:iso,time:"09:00",serviceId:"compartida",capacity:4,active:true }); if (day.getDay() === 6) list.push({ id:`slot-${iso}-1130`,date:iso,time:"11:30",serviceId:"privada",capacity:2,active:true }); } return list; };
  const stateDefault = () => ({ services: [{id:"compartida",name:"Clase compartida",detail:"Aprende acompañado · 60 min",price:20000,label:"por persona",featured:true},{id:"privada",name:"Clase privada",detail:"Tu ritmo, tu sesión · 60 min",price:32000,label:"por persona",featured:false},{id:"paseo",name:"Paseo guiado",detail:"Para quienes ya reman · 90 min",price:24000,label:"por persona",featured:false}], slots: makeSeedSlots(), bookings: [], settings: { whatsappNumber: CONFIG.whatsappNumber || "", location: CONFIG.location || "Balneario Municipal, Antofagasta" } });
  const getState = () => { try { const stored = JSON.parse(localStorage.getItem(KEY)); if (stored) return stored; const initial = stateDefault(); setState(initial); return initial; } catch (_) { const initial = stateDefault(); setState(initial); return initial; } };
  const setState = data => localStorage.setItem(KEY, JSON.stringify(data));
  const migrateCatalog = state => {
    const legacy = Array.isArray(state.services) && state.services.some(item => ["compartida", "privada", "paseo"].includes(item.id));
    if (!legacy) return state;
    const map = { compartida: "tour", privada: "yoga", paseo: "isla" };
    state.services = [
      { id:"tour", name:"Tour guiado SUP", detail:"Amanecer o atardecer · 60–90 min", price:20000, label:"por persona", featured:true },
      { id:"yoga", name:"Yoga SUP", detail:"Jueves 09:00 y fines de semana · según clima", price:null, label:"consulta próximas fechas", featured:false },
      { id:"isla", name:"Isla SUP & eventos", detail:"Cumpleaños, empresas y colaboraciones", price:null, label:"cotización a medida", featured:false }
    ];
    state.slots = (state.bookings || []).length ? (state.slots || []).map(slot => ({ ...slot, serviceId: map[slot.serviceId] || slot.serviceId })) : makeSeedSlots();
    setState(state);
    return state;
  };
  const formatCLP = value => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value || 0);
  const dateLabel = date => new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const service = (state, id) => state.services.find(item => item.id === id) || { name: "Salida" };
  const count = (state, id) => state.bookings.filter(item => item.slotId === id && item.status !== "cancelled").length;
  const esc = value => String(value || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  function render() {
    const state = migrateCatalog(getState());
    const pending = state.bookings.filter(item => item.status === "pending").length;
    const confirmed = state.bookings.filter(item => item.status === "confirmed").length;
    document.querySelector("[data-stats]").innerHTML = `<article class="stat"><span>Horas activas</span><strong>${state.slots.filter(s => s.active).length}</strong></article><article class="stat"><span>Por confirmar</span><strong>${pending}</strong></article><article class="stat"><span>Reservas confirmadas</span><strong>${confirmed}</strong></article>`;
    const slots = state.slots.slice().sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
    document.querySelector("[data-slots-admin]").innerHTML = slots.length ? slots.map(slot => `<article class="admin-row"><div><strong>${dateLabel(slot.date)} · ${slot.time} · ${esc(service(state,slot.serviceId).name)}</strong><p>${count(state,slot.id)} de ${slot.capacity} cupos reservados · ${slot.active ? "Visible en la web" : "Oculto"}</p></div><div class="row-actions"><button class="small-btn" data-toggle-slot="${slot.id}">${slot.active ? "Ocultar" : "Activar"}</button><button class="icon-button" data-delete-slot="${slot.id}" aria-label="Eliminar horario">×</button></div></article>`).join("") : "<p class=\"empty-admin\">Aún no agregas horarios.</p>";
    const bookings = state.bookings.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    document.querySelector("[data-bookings-admin]").innerHTML = bookings.length ? bookings.map(item => { const slot = state.slots.find(s => s.id === item.slotId); return `<article class="admin-row"><div><strong>${esc(item.name)} <span class="status ${item.status}">${item.status === "pending" ? "pendiente" : item.status === "confirmed" ? "confirmada" : "cancelada"}</span></strong><p>${slot ? `${dateLabel(slot.date)} · ${slot.time} · ${esc(service(state,slot.serviceId).name)}` : "Horario eliminado"}</p><small>WhatsApp ${esc(item.phone)} · emergencia: ${esc(item.emergencyName)} (${esc(item.emergencyPhone)})${item.healthInfo ? " · info de seguridad registrada" : ""}</small></div><div class="row-actions"><button class="small-btn" data-booking-status="${item.id}" data-next-status="confirmed">Confirmar</button><button class="small-btn" data-booking-status="${item.id}" data-next-status="cancelled">Cancelar</button></div></article>`; }).join("") : "<p class=\"empty-admin\">Todavía no llegan solicitudes.</p>";
    document.querySelector("[data-price-form]").innerHTML = state.services.map(item => `<label class="price-line"><span><strong>${esc(item.name)}</strong><span>${esc(item.detail)}</span></span><input data-price-id="${item.id}" type="number" min="0" value="${item.price}" aria-label="Valor de ${esc(item.name)}" /></label>`).join("") + "<button class=\"btn btn-dark\" type=\"submit\">Guardar valores →</button><p class=\"form-status\" data-price-status></p>";
    const settings = document.querySelector("[data-settings-form]"); settings.elements.whatsappNumber.value = state.settings.whatsappNumber || ""; settings.elements.location.value = state.settings.location || CONFIG.location || "";
    document.querySelector("[data-service-options]").innerHTML = state.services.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join("");
  }
  function setup() {
    const login = document.querySelector("[data-login]"); const app = document.querySelector("[data-admin-app]");
    const open = () => { login.hidden = true; app.hidden = false; render(); };
    document.querySelector("[data-login-form]").addEventListener("submit", event => { event.preventDefault(); const pin = new FormData(event.currentTarget).get("pin"); const output = document.querySelector("[data-login-status]"); if (pin === (CONFIG.demoAdminPin || "2026")) { sessionStorage.setItem("remando-admin-demo", "1"); open(); } else { output.textContent = "PIN incorrecto."; output.className = "form-status error"; } });
    if (sessionStorage.getItem("remando-admin-demo") === "1") open();
    document.querySelector("[data-logout]").addEventListener("click", () => { sessionStorage.removeItem("remando-admin-demo"); app.hidden = true; login.hidden = false; });
    document.addEventListener("click", event => { const state = getState(); const toggle = event.target.closest("[data-toggle-slot]"); const remove = event.target.closest("[data-delete-slot]"); const status = event.target.closest("[data-booking-status]"); if (toggle) { const slot = state.slots.find(s => s.id === toggle.dataset.toggleSlot); slot.active = !slot.active; setState(state); render(); } if (remove) { state.slots = state.slots.filter(s => s.id !== remove.dataset.deleteSlot); setState(state); render(); } if (status) { const booking = state.bookings.find(b => b.id === status.dataset.bookingStatus); booking.status = status.dataset.nextStatus; setState(state); render(); } });
    const dialog = document.querySelector("[data-slot-dialog]"); document.querySelector("[data-open-slot]").addEventListener("click", () => dialog.showModal());
    document.querySelector("[data-slot-form]").addEventListener("submit", event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget).entries()); const state = getState(); state.slots.push({ id:`slot-${Date.now()}`,date:values.date,time:values.time,serviceId:values.serviceId,capacity:Number(values.capacity),active:true }); setState(state); dialog.close(); event.currentTarget.reset(); render(); });
    document.querySelector("[data-price-form]").addEventListener("submit", event => { event.preventDefault(); const state = getState(); event.currentTarget.querySelectorAll("[data-price-id]").forEach(input => { const item = state.services.find(s => s.id === input.dataset.priceId); item.price = Number(input.value); }); setState(state); const output = document.querySelector("[data-price-status]"); output.textContent = "Valores actualizados en este navegador."; output.className = "form-status success"; });
    document.querySelector("[data-settings-form]").addEventListener("submit", event => { event.preventDefault(); const state = getState(); const data = Object.fromEntries(new FormData(event.currentTarget).entries()); state.settings = { ...state.settings, ...data }; setState(state); const output = document.querySelector("[data-settings-status]"); output.textContent = "Ajustes guardados."; output.className = "form-status success"; });
    document.querySelector("[data-export]").addEventListener("click", () => { const state = getState(); const header = ["estado","nombre","whatsapp","correo","edad","emergencia","telefono emergencia","informacion relevante","fecha solicitud"]; const rows = state.bookings.map(item => [item.status,item.name,item.phone,item.email,item.age,item.emergencyName,item.emergencyPhone,item.healthInfo,item.createdAt]); const csv = [header,...rows].map(row => row.map(cell => `"${String(cell || "").replace(/"/g,'""')}"`).join(",")).join("\n"); const blob = new Blob(["\ufeff" + csv],{type:"text/csv;charset=utf-8"}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `reservas-remando-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url); });
  }
  document.addEventListener("DOMContentLoaded", setup);
})();
