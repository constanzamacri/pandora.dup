const money = value => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
}).format(value);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
})[character]);

let cart = [];
try {
  cart = JSON.parse(localStorage.getItem("pandoraCart")) || [];
} catch {
  cart = [];
}

function groupCart(items) {
  return Object.values(items.reduce((groups, product) => {
  const key = String(product.id);
  if (!groups[key]) groups[key] = { ...product, quantity: 0 };
  groups[key].quantity += 1;
  return groups;
  }, {}));
}

let groupedItems = groupCart(cart);
let promotions = window.PromotionEngine.parse(localStorage.getItem("pandoraPromotions"));
let promotionPricing = window.PromotionEngine.calculate(cart, cart, promotions);
let subtotal = promotionPricing.total;
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
  document.querySelector("[data-subtotal]").textContent = money(promotionPricing.subtotal);
  document.querySelector("[data-total]").textContent = money(total);
  const promotionSummary = document.querySelector("[data-promotion-summary]");
  promotionSummary.classList.toggle("hidden", promotionPricing.applications.length === 0);
  promotionSummary.innerHTML = promotionPricing.applications.map(application =>
    `<p><span>Promo: ${escapeHtml(application.name)}${application.applications > 1 ? ` ×${application.applications}` : ""}</span><strong>${application.gift ? `${escapeHtml(application.gift)} de regalo` : `-${money(application.saving)}`}</strong></p>`
  ).join("");
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
  const notesLine = form.get("notes")?.trim()
    ? `\nObservaciones: ${form.get("notes").trim()}`
    : "";
  const promotionLines = promotionPricing.applications.length
    ? `\nPROMOCIONES\n${promotionPricing.applications.map(application =>
        `- ${application.name}${application.applications > 1 ? ` x${application.applications}` : ""}: ${application.gift ? `${application.gift} de regalo` : `-${money(application.saving)}`}`
      ).join("\n")}\n`
    : "";
  return `PANDORA.DUP — RESUMEN DEL PEDIDO
Pedido: ${orderNumber}

CLIENTE
Nombre: ${form.get("name")} ${form.get("surname")}
Documento: ${form.get("document")}
Teléfono: ${form.get("phone")}
Email: ${form.get("email")}

PRODUCTOS
${itemLines}
${promotionLines}

Subtotal productos: ${money(promotionPricing.subtotal)}
Descuento promociones: -${money(promotionPricing.discount)}${discountLine}
TOTAL: ${money(total)}
Entrega: ${deliveryDetails}
Forma de pago: ${selectedPayment}
${notesLine}`;
}

async function saveOrder(form, orderNumber) {
  const config = await import("./supabase-config.js");
  if (!config.isSupabaseConfigured) return;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const client = createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY);
  const [{ data: currentProducts, error: productsError }, { data: promotionSetting, error: promotionError }] =
    await Promise.all([
      client.rpc("get_store_products"),
      client.from("site_content").select("value").eq("key", "promotions_config").maybeSingle()
    ]);
  if (productsError) throw productsError;
  if (promotionError) throw promotionError;
  const productMap = new Map((currentProducts || []).map(product => [String(product.id), product]));
  const unavailableItems = cart.filter(item => !productMap.has(String(item.id)));
  if (unavailableItems.length) {
    throw new Error(`Producto no disponible: ${[...new Set(unavailableItems.map(item => item.name))].join(", ")}`);
  }
  cart = cart.map(item => ({ ...item, ...(productMap.get(String(item.id)) || {}) }));
  groupedItems = groupCart(cart);
  promotions = window.PromotionEngine.parse(promotionSetting?.value);
  promotionPricing = window.PromotionEngine.calculate(cart, currentProducts || [], promotions);
  subtotal = promotionPricing.total;
  updatePayment(selectedPayment);
  renderSummary();
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
  try {
    const { error: notificationError } = await client.functions.invoke("order-notification", {
      body: { orderNumber }
    });
    if (notificationError) console.warn("El pedido se guardó, pero no se pudo enviar el aviso.", notificationError);
  } catch (notificationError) {
    console.warn("El pedido se guardó, pero no se pudo enviar el aviso.", notificationError);
  }
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
  const orderNumber = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  submitButton.disabled = true;
  document.querySelector("[data-order-message]").textContent = "Registrando pedido...";
  try {
    await saveOrder(form, orderNumber);
  } catch (error) {
    console.error("No se pudo registrar el pedido:", error);
    submitButton.disabled = false;
    const unavailableMatch = String(error.message).match(/Producto no disponible:\s*(.+)/i);
    document.querySelector("[data-order-message]").textContent = unavailableMatch
      ? `${unavailableMatch[1]} ya no está disponible. Volvé al carrito, eliminá ese producto y elegilo nuevamente.`
      : /stock insuficiente/i.test(error.message)
        ? "Cambió la disponibilidad de uno de los productos. Volvé al carrito y ajustá las cantidades."
        : /producto inexistente|no tiene componentes/i.test(error.message)
          ? "Uno de los productos cambió. Volvé al carrito, eliminálo y agregalo nuevamente."
          : `No pudimos registrar el pedido: ${error.message || "error desconocido"}`;
    return;
  }
  document.querySelector("[data-receipt-text]").textContent = buildReceipt(form, orderNumber);
  document.querySelector("[data-checkout-data]").classList.add("hidden");
  document.querySelector(".order-summary").classList.add("hidden");
  document.querySelector("[data-receipt]").classList.remove("hidden");
  localStorage.removeItem("pandoraCart");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
