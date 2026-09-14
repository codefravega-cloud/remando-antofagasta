# Remando Antofagasta — publicación y operación

## Lo que ya funciona

La landing muestra horarios, permite solicitar una reserva con WhatsApp, contacto de emergencia e información relevante para la seguridad. El panel en `admin.html` permite crear/ocultar horarios, editar valores, confirmar solicitudes y exportar un CSV.

En la versión entregada todo se guarda en el navegador (`localStorage`). Es ideal para revisar diseño y flujo, pero **no sirve como sistema de reservas real**: ni el instructor ni las personas que reservan comparten los mismos datos y el PIN no es seguridad real.

## Contenido verificado en Instagram (septiembre de 2026)

- Tours guiados al amanecer y al atardecer desde el Balneario Municipal: **$20.000 por persona**.
- Clases personalizadas o grupales, arriendo de equipos, paseos guiados y talleres en alta mar.
- Yoga SUP: jueves a las 09:00 y fines de semana, siempre sujeto a las condiciones del clima y el mar.
- Isla SUP para cumpleaños, grupos de empresa, sesiones de fotos, desayunos flotantes y colaboraciones.

Los posts elegidos se muestran mediante enlaces y marcos oficiales de Instagram, sin copiar sus archivos de imagen fuera de la plataforma.

## Antes de publicar

1. Abre `assets/config.js` y agrega el WhatsApp del negocio, sin `+`, por ejemplo `56912345678`.
2. Actualiza los valores de muestra desde `admin.html`.
3. Copia las fotografías que el dueño autorice desde su Instagram a `assets/photos/source/`; luego reemplaza las imágenes usadas en `index.html`/`styles.css`. No descargues ni reutilices imágenes de terceros sin permiso o licencia.
4. Revisa que la descripción de la actividad, edad mínima, equipamiento incluido y políticas de cancelación sean correctos.

## Para operar reservas reales y datos privados

Como el formulario solicita información de salud, usa un backend con acceso restringido antes de aceptar reservas de clientes. Supabase es una alternativa sencilla: crea un proyecto, ejecuta `supabase/schema.sql`, activa correo/contraseña para el instructor y aplica políticas RLS. Después conecta las operaciones de `main.js` y `admin.js` a Supabase; no pongas una contraseña o una `service_role key` en archivos públicos.

También se recomienda:

- Mostrar una política de privacidad con responsable, finalidad, plazo de retención y canal de eliminación.
- Pedir solo información estrictamente necesaria para seguridad y limitar quién puede verla.
- Gestionar el consentimiento de forma verificable.
- Definir qué ocurre si el mar no permite realizar la actividad.

## Publicación estática

Sube el contenido completo de esta carpeta a Hostinger, Netlify o similar. La landing se verá, pero la reserva compartida requiere el backend indicado arriba.
