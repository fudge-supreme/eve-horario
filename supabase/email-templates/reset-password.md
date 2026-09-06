# Recuperar contraseña

**Dónde pegarlo:** Supabase Dashboard → Authentication → Email Templates → **Reset Password**

**Asunto:**
```
Elige una nueva contraseña para Mi Horario
```

**Cuerpo (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
  <p style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2E7CF6;margin:0 0 8px">Mi Horario</p>
  <h1 style="font-size:22px;margin:0 0 16px;color:#1A1A1F">Elige una nueva contraseña</h1>
  <p style="font-size:14px;line-height:1.6;color:#4A4A55;margin:0 0 24px">
    Alguien pidió restablecer la contraseña de esta cuenta. Si fuiste tú, toca el botón de abajo para elegir una nueva.
  </p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2E7CF6;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:12px;font-size:14px;font-weight:600">
    Elegir nueva contraseña
  </a>
  <p style="font-size:12px;line-height:1.6;color:#8A8680;margin:24px 0 0">
    Si tú no pediste este cambio, ignora este correo -- tu contraseña actual sigue funcionando y no se modificó nada.
  </p>
</div>
```
