# Link para iniciar sesión (magic link)

**Dónde pegarlo:** Supabase Dashboard → Authentication → Email Templates → **Magic Link**

**Asunto:**
```
Tu link para entrar a Mi Horario
```

**Cuerpo (HTML):**
```html
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
  <p style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#2E7CF6;margin:0 0 8px">Mi Horario</p>
  <h1 style="font-size:22px;margin:0 0 16px;color:#1A1A1F">Entra con un toque</h1>
  <p style="font-size:14px;line-height:1.6;color:#4A4A55;margin:0 0 24px">
    Toca el botón de abajo para iniciar sesión sin necesidad de tu contraseña. Este link solo funciona una vez y expira pronto.
  </p>
  <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#2E7CF6;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:12px;font-size:14px;font-weight:600">
    Iniciar sesión
  </a>
  <p style="font-size:12px;line-height:1.6;color:#8A8680;margin:24px 0 0">
    Ábrelo desde el mismo dispositivo donde lo pediste. Si tú no pediste este link, puedes ignorar este correo -- nadie pudo entrar a tu cuenta con solo verlo.
  </p>
</div>
```
