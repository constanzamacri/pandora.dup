const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SELLER_EMAIL = Deno.env.get("SELLER_EMAIL");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Pandora DUP <onboarding@resend.dev>";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character] || character));

Deno.serve(async request => {
  if (!WEBHOOK_SECRET || request.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!RESEND_API_KEY || !SELLER_EMAIL) {
    return new Response("Missing email configuration", { status: 500 });
  }

  const payload = await request.json();
  const order = payload.record;
  const items = Array.isArray(order.items) ? order.items : [];
  const products = items.map((item: Record<string, unknown>) =>
    `<li>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)} — $${escapeHtml(item.price)}</li>`
  ).join("");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [SELLER_EMAIL],
      subject: `Nueva compra ${order.order_number} — ${order.customer_name}`,
      html: `
        <h1>Nueva compra en pandora.dup</h1>
        <p><strong>Pedido:</strong> ${escapeHtml(order.order_number)}</p>
        <p><strong>Cliente:</strong> ${escapeHtml(order.customer_name)}</p>
        <p><strong>Teléfono:</strong> ${escapeHtml(order.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.email)}</p>
        <p><strong>Entrega:</strong> ${escapeHtml(order.delivery_method)}</p>
        <p><strong>Pago:</strong> ${escapeHtml(order.payment_method)}</p>
        <h2>Productos</h2><ul>${products}</ul>
        <p><strong>Total:</strong> $${escapeHtml(order.total)}</p>
        <p><strong>Comentarios:</strong> ${escapeHtml(order.notes || "Sin comentarios")}</p>
      `
    })
  });

  const result = await response.text();
  return new Response(result, {
    status: response.status,
    headers: { "Content-Type": "application/json" }
  });
});
