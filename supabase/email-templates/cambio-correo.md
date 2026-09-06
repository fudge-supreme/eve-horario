# Cambio de correo

**Dónde pegarlo:** Supabase Dashboard → Authentication → Email Templates → **Change Email Address**

Con `double_confirm_changes = true` (ver `supabase/config.toml`), Supabase
manda esta misma plantilla tanto al correo viejo como al nuevo -- cada
uno tiene que confirmar por su lado antes de que el cambio se aplique.

**Asunto:**
```
Confirma el cambio de correo en Mi Horario
```

**Cuerpo (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
  <p style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2E7CF6;margin:0 0 8px">Mi Horario</p>
  <h1 style="font-size:22px;margin:0 0 16px;color:#1A1A1F">Confirma tu nuevo correo</h1>
  <p style="font-size:14px;line-height:1.6;color:#4A4A55;margin:0 0 24px">
    Pediste cambiar el correo de tu cuenta. Para completarlo, confírmalo desde este correo y desde el anterior -- toca el botón de abajo.
  </p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2E7CF6;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:12px;font-size:14px;font-weight:600">
    Confirmar este correo
  </a>
  <p style="font-size:12px;line-height:1.6;color:#8A8680;margin:24px 0 0">
    Si tú no pediste este cambio, ignora este correo y considera cambiar tu contraseña desde Ajustes → Seguridad.
  </p>
</div>
```
