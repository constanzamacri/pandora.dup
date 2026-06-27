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

function buildReceipt(form) {
  const orderNumber = `PD-${Date.now().toString().slice(-8)}`;
  const itemLines = groupedItems
    .map(item => `- ${item.name} x${item.quantity}: ${money(item.price * item.quantity)}`)
    .join("\n");
  const discountLine = selectedPayment === "Transferencia"
    ? `\nDescuento por transferencia: -${money(Math.round(subtotal * .1))}`
    : "";
  return `PANDORA.DUP — COMPROBANTE DE PEDIDO
Pedido: ${orderNumber}
Fecha: ${new Date().toLocaleString("es-AR")}

CLIENTE
Nombre: ${form.get("name")} ${form.get("surname")}
Teléfono: ${form.get("phone")}
Email: ${form.get("email")}
Dirección: ${form.get("address")}, ${form.get("city")} (${form.get("postal_code")})

PRODUCTOS
${itemLines}

Subtotal: ${money(subtotal)}${discountLine}
TOTAL: ${money(total)}
Forma de pago: ${selectedPayment}

Comentarios: ${form.get("notes") || "Sin comentarios"}

Este texto confirma la solicitud del pedido.`;
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

document.querySelector("[data-order-form]").addEventListener("submit", event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  updatePayment(form.get("payment"));
  document.querySelector("[data-receipt-text]").value = buildReceipt(form);
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
