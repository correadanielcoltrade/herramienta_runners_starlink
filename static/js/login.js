// login.js (modificado)
document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('login-form');
  const msg = document.getElementById('error-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.setAttribute('aria-hidden', 'true');

    const correo = document.getElementById('email').value.trim();
    const contrasena = document.getElementById('password').value;

    if (!correo || !contrasena) {
      msg.textContent = 'Por favor completa correo y contraseña.';
      msg.setAttribute('aria-hidden', 'false');
      return;
    }

    try {
      const res = await fetch('/iniciar-sesion/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', // importante: permite recibir la cookie puesta por el servidor
        body: JSON.stringify({ correo, contrasena }),
      });

      if (res.ok) {
        // Ya no guardamos token en localStorage: el backend colocó la cookie HttpOnly
        window.location.href = '/inicio/';
      } else {
        const error = await res.json().catch(() => ({}));
        msg.textContent = error.msg || 'Credenciales incorrectas.';
        msg.setAttribute('aria-hidden', 'false');
      }
    } catch (err) {
      console.error(err);
      msg.textContent = 'Error de conexión con el servidor.';
      msg.setAttribute('aria-hidden', 'false');
    }
  });
});
