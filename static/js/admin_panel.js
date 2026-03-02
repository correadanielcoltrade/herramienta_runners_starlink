document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "/admin-panel/api/users";

  const createForm = document.getElementById("create-user-form");
  const createCorreo = document.getElementById("create-correo");
  const createContrasena = document.getElementById("create-contrasena");
  const createFeedback = document.getElementById("create-feedback");

  const refreshBtn = document.getElementById("btn-refresh-users");
  const usersTableBody = document.getElementById("users-table-body");

  const editModal = document.getElementById("edit-user-modal");
  const editForm = document.getElementById("edit-user-form");
  const editCorreo = document.getElementById("edit-correo");
  const editContrasena = document.getElementById("edit-contrasena");
  const editFeedback = document.getElementById("edit-feedback");

  const closeModalBtn = document.getElementById("btn-close-modal");
  const cancelEditBtn = document.getElementById("btn-cancel-edit");
  const deleteUserBtn = document.getElementById("btn-delete-user");

  const roleInputsCreate = [
    document.getElementById("create-role-admin"),
    document.getElementById("create-role-compras"),
    document.getElementById("create-role-recepcion")
  ];

  const roleInputsEdit = [
    document.getElementById("edit-role-admin"),
    document.getElementById("edit-role-compras"),
    document.getElementById("edit-role-recepcion")
  ];

  let users = [];

  function escapeHtml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSelectedRoles(inputs) {
    return inputs.filter((input) => input.checked).map((input) => input.value);
  }

  function setSelectedRoles(inputs, roles) {
    const roleSet = new Set((roles || []).map((r) => String(r).toLowerCase()));
    inputs.forEach((input) => {
      input.checked = roleSet.has(input.value);
    });
  }

  function setFeedback(el, message, isError = false) {
    el.textContent = message || "";
    el.classList.toggle("error", isError);
    el.classList.toggle("success", Boolean(message) && !isError);
  }

  async function parseResponse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.msg || "Error inesperado");
    }
    return body;
  }

  async function listUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="4" class="muted">Cargando usuarios...</td></tr>';

    try {
      const response = await fetch(API_BASE, {
        method: "GET",
        credentials: "same-origin"
      });
      users = await parseResponse(response);
      renderUsers();
    } catch (err) {
      usersTableBody.innerHTML = `<tr><td colspan="4" class="error-cell">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderUsers() {
    if (!Array.isArray(users) || users.length === 0) {
      usersTableBody.innerHTML = '<tr><td colspan="4" class="muted">No hay usuarios registrados.</td></tr>';
      return;
    }

    usersTableBody.innerHTML = users.map((user) => {
      const correo = escapeHtml(user.correo);
      const roleBadges = (user.roles || []).map((role) => `<span class="role-badge">${escapeHtml(role)}</span>`).join(" ");
      const hasPassword = user.has_password ? "Configurada" : "Sin definir";

      return `
        <tr>
          <td>${correo}</td>
          <td>${roleBadges || '<span class="muted">Sin rol</span>'}</td>
          <td>${hasPassword}</td>
          <td>
            <button class="btn small" type="button" data-action="edit" data-correo="${correo}">Editar</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function openEditModal(correo) {
    const user = users.find((u) => String(u.correo).toLowerCase() === String(correo).toLowerCase());
    if (!user) {
      return;
    }

    editCorreo.value = user.correo;
    editContrasena.value = "";
    setSelectedRoles(roleInputsEdit, user.roles || []);
    setFeedback(editFeedback, "");

    editModal.classList.remove("hidden");
    editModal.setAttribute("aria-hidden", "false");
  }

  function closeEditModal() {
    editModal.classList.add("hidden");
    editModal.setAttribute("aria-hidden", "true");
    editForm.reset();
    setFeedback(editFeedback, "");
  }

  async function createUser(event) {
    event.preventDefault();
    setFeedback(createFeedback, "");

    const payload = {
      correo: createCorreo.value.trim().toLowerCase(),
      contrasena: createContrasena.value,
      roles: getSelectedRoles(roleInputsCreate)
    };

    if (!payload.correo || !payload.contrasena || payload.roles.length === 0) {
      setFeedback(createFeedback, "Correo, contrasena y al menos un rol son obligatorios.", true);
      return;
    }

    try {
      const response = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });

      await parseResponse(response);
      createForm.reset();
      setFeedback(createFeedback, "Usuario creado correctamente.");
      await listUsers();
    } catch (err) {
      setFeedback(createFeedback, err.message, true);
    }
  }

  async function updateUser(event) {
    event.preventDefault();
    setFeedback(editFeedback, "");

    const correo = editCorreo.value.trim().toLowerCase();
    const payload = {
      roles: getSelectedRoles(roleInputsEdit)
    };

    if (editContrasena.value.trim()) {
      payload.contrasena = editContrasena.value.trim();
    }

    if (!correo || payload.roles.length === 0) {
      setFeedback(editFeedback, "Debes mantener al menos un rol para el usuario.", true);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(correo)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });

      await parseResponse(response);
      setFeedback(editFeedback, "Cambios guardados.");
      await listUsers();
      setTimeout(closeEditModal, 350);
    } catch (err) {
      setFeedback(editFeedback, err.message, true);
    }
  }

  async function deleteUser() {
    const correo = editCorreo.value.trim().toLowerCase();
    if (!correo) {
      return;
    }

    const confirmed = window.confirm(`Seguro que deseas eliminar el usuario ${correo}?`);
    if (!confirmed) {
      return;
    }

    setFeedback(editFeedback, "");

    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(correo)}`, {
        method: "DELETE",
        credentials: "same-origin"
      });

      await parseResponse(response);
      await listUsers();
      closeEditModal();
    } catch (err) {
      setFeedback(editFeedback, err.message, true);
    }
  }

  usersTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='edit']");
    if (!button) {
      return;
    }
    openEditModal(button.dataset.correo || "");
  });

  createForm.addEventListener("submit", createUser);
  editForm.addEventListener("submit", updateUser);

  refreshBtn.addEventListener("click", listUsers);
  closeModalBtn.addEventListener("click", closeEditModal);
  cancelEditBtn.addEventListener("click", closeEditModal);
  deleteUserBtn.addEventListener("click", deleteUser);

  editModal.addEventListener("click", (event) => {
    if (event.target === editModal) {
      closeEditModal();
    }
  });

  listUsers();
});
