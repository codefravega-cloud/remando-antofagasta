(function () {
  "use strict";
  window.REMANDO_CONFIG = {
    brandName: "Remando Antofagasta",
    instagramUrl: "https://www.instagram.com/remandoxantofagasta/",
    // Agrega el número en formato internacional, sin + ni espacios. Ej.: 56912345678
    whatsappNumber: "",
    location: "Balneario Municipal, Antofagasta",
    currency: "CLP",
    supabase: {
      url: "https://dremwvqokwbmdtcczjxh.supabase.co",
      // Esta clave es pública por diseño; las políticas de Supabase protegen los datos sensibles.
      anonKey: "sb_publishable_9ciovZouoUr9WEPS_zrx1g_EqKDL3-t"
    },
    // Se conserva sólo para abrir una vista local sin Supabase; no protege el panel publicado.
    demoAdminPin: "2026"
  };
})();
