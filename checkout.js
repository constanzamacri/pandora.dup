const money = value => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
}).format(value);

let cart = [];
try {
  cart = JSON.parse(localStorage.getItem("pandoraCart")) || [];
} catch {
  cart = [];
}

const groupedItems = Object.values(cart.reduce((groups, product) => {
  const key = String(product.id);
  if (!groups[key]) groups[key] = { ...product, quantity: 0 };
  groups[key].quantity += 1;
  return groups;
}, {}));

const subtotal = cart.reduce((sum, product) => sum + Number(product.price), 0);
let selectedPayment = "";
let total = subtotal;

function renderSummary() {
  document.querySelector("[data-summary-items]").innerHTML = groupedItems.map(item => `
    <article class="summary-item">
      <img src="${item.image || item.image_url}" alt="">
      <div><h3>${item.name}</h3><p>Cantidad: ${item.quantity}</p></div>
      <strong>${money(item.price * item.quantity)}</strong>
    </article>
  `).join("");
  document.querySelector("[data-subtotal]").textContent = money(subtotal);
  document.querySelector("[data-total]").textContent = money(total);
}

function updatePayment(payment) {
  selectedPayment = payment;
  const hasDiscount = payment === "Transferencia";
  const discount = hasDiscount ? Math.round(subtotal * .1) : 0;
  total = subtotal - discount;
  document.querySelector("[data-discount-row]").classList.toggle("hidden", !hasDiscount);
  document.querySelector("[data-discount]").textContent = `-${money(discount)}`;
  document.querySelector("[data-total]").textContent = money(total);
}

function buildReceipt(form, orderNumber) {
  const itemLines = groupedItems
    .map(item => `- ${item.name} x${item.quantity}: ${money(item.price * item.quantity)}`)
    .join("\n");
  const discountLine = selectedPayment === "Transferencia"
    ? `\nDescuento por transferencia: -${money(Math.round(subtotal * .1))}`
    : "";
  const delivery = form.get("delivery");
  const deliveryDetails = delivery !== "Retiro en el local [Castelli 695]"
    ? `${delivery}: ${form.get("address")}, ${form.get("city")} (${form.get("postal_code")})`
    : delivery;
  return `PANDORA.DUP — COMPROBANTE DE PEDIDO
Pedido: ${orderNumber}
Fecha: ${new Date().toLocaleString("es-AR")}

CLIENTE
Nombre: ${form.get("name")} ${form.get("surname")}
Documento: ${form.get("document")}
Teléfono: ${form.get("phone")}
Email: ${form.get("email")}
Entrega: ${deliveryDetails}

PRODUCTOS
${itemLines}

Subtotal: ${money(subtotal)}${discountLine}
TOTAL: ${money(total)}
Forma de pago: ${selectedPayment}

Comentarios: ${form.get("notes") || "Sin comentarios"}

Este texto confirma la solicitud del pedido.`;
}

async function saveOrder(form, orderNumber) {
  const config = await import("./supabase-config.js");
  if (!config.isSupabaseConfigured) return;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  const delivery = form.get("delivery");
  const discount = selectedPayment === "Transferencia" ? Math.round(subtotal * .1) : 0;
  const { error } = await client.from("orders").insert({
    order_number: orderNumber,
    customer_name: `${form.get("name")} ${form.get("surname")}`.trim(),
    email: form.get("email"),
    phone: form.get("phone"),
    document: form.get("document"),
    delivery_method: delivery,
    address: delivery !== "Retiro en el local [Castelli 695]" ? form.get("address") : null,
    city: delivery !== "Retiro en el local [Castelli 695]" ? form.get("city") : null,
    postal_code: delivery !== "Retiro en el local [Castelli 695]" ? form.get("postal_code") : null,
    payment_method: selectedPayment,
    notes: form.get("notes") || null,
    subtotal,
    discount,
    total,
    items: groupedItems.map(item => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: item.quantity
    })),
    status: "pending"
  });
  if (error) throw error;
}

if (!cart.length) {
  document.querySelector("[data-checkout-data]").classList.add("hidden");
  document.querySelector(".order-summary").classList.add("hidden");
  document.querySelector("[data-empty-checkout]").classList.remove("hidden");
} else {
  renderSummary();
}

document.querySelectorAll('input[name="payment"]').forEach(input => {
  input.addEventListener("change", () => updatePayment(input.value));
});

function openStep(stepNumber) {
  document.querySelectorAll("[data-step-content]").forEach(content => {
    content.classList.toggle("hidden", content.dataset.stepContent !== String(stepNumber));
  });
  document.querySelectorAll("[data-step]").forEach(step => {
    step.classList.toggle("active", step.dataset.step === String(stepNumber));
  });
}

function validateStep(step) {
  const controls = [...step.querySelectorAll("input, select, textarea")]
    .filter(control => !control.closest(".hidden"));
  const invalid = controls.find(control => !control.checkValidity());
  if (invalid) {
    invalid.reportValidity();
    return false;
  }
  return true;
}

function isStepComplete(step) {
  const controls = [...step.querySelectorAll("input, select, textarea")]
    .filter(control => !control.closest(".hidden"));
  return controls.every(control => control.checkValidity());
}

function updateStepButtons() {
  document.querySelectorAll("[data-step]").forEach(step => {
    const button = step.querySelector("[data-next-step], .confirm-button");
    if (button) button.disabled = !isStepComplete(step);
  });
}

document.querySelector("[data-order-form]").addEventListener("input", updateStepButtons);
document.querySelector("[data-order-form]").addEventListener("change", updateStepButtons);

document.querySelectorAll('input[name="delivery"]').forEach(input => {
  input.addEventListener("change", () => {
    const needsAddress = input.value !== "Retiro en el local [Castelli 695]";
    const isAndreani = input.value === "Envío por correo Andreani";
    document.querySelector("[data-address-fields]").classList.toggle("hidden", !needsAddress);
    document.querySelector("[data-andreani-tools]").classList.toggle("hidden", !isAndreani);
    ["address", "city", "postal_code"].forEach(name => {
      document.querySelector(`[name="${name}"]`).required = needsAddress;
    });
    updateStepButtons();
  });
});

updateStepButtons();
setTimeout(updateStepButtons, 400);
setTimeout(updateStepButtons, 1200);
window.addEventListener("pageshow", updateStepButtons);

document.querySelectorAll("[data-next-step]").forEach(button => {
  button.addEventListener("click", () => {
    const currentStep = button.closest("[data-step]");
    if (!validateStep(currentStep)) return;
    const form = document.querySelector("[data-order-form]");
    const number = currentStep.dataset.step;
    if (number === "1") {
      document.querySelector('[data-step-summary="1"]').textContent =
        `${form.elements.name.value} ${form.elements.surname.value} · ${form.elements.email.value}`;
    }
    if (number === "2") {
      document.querySelector('[data-step-summary="2"]').textContent =
        form.elements.delivery.value;
    }
    currentStep.classList.add("completed");
    currentStep.querySelector("[data-edit-step]")?.classList.remove("hidden");
    openStep(button.dataset.nextStep);
  });
});

document.querySelectorAll("[data-edit-step]").forEach(button => {
  button.addEventListener("click", () => openStep(button.dataset.editStep));
});

document.querySelector("[data-order-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  updatePayment(form.get("payment"));
  const orderNumber = `PD-${Date.now().toString().slice(-8)}`;
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  submitButton.disabled = true;
  document.querySelector("[data-order-message]").textContent = "Registrando pedido...";
  try {
    await saveOrder(form, orderNumber);
  } catch (error) {
    submitButton.disabled = false;
    document.querySelector("[data-order-message]").textContent =
      "No pudimos registrar el pedido. Revisá tu conexión e intentá nuevamente.";
    return;
  }
  document.querySelector("[data-receipt-text]").value = buildReceipt(form, orderNumber);
  document.querySelector("[data-checkout-data]").classList.add("hidden");
  document.querySelector(".order-summary").classList.add("hidden");
  document.querySelector("[data-receipt]").classList.remove("hidden");
  localStorage.removeItem("pandoraCart");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("[data-copy-receipt]").addEventListener("click", async () => {
  const text = document.querySelector("[data-receipt-text]").value;
  try {
    await navigator.clipboard.writeText(text);
    document.querySelector("[data-copy-message]").textContent = "Comprobante copiado.";
  } catch {
    document.querySelector("[data-receipt-text]").select();
    document.querySelector("[data-copy-message]").textContent = "Seleccioná y copiá el texto.";
  }
});
