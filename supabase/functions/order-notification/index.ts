const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SELLER_EMAIL = Deno.env.get("SELLER_EMAIL");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Pandora DUP <onboarding@resend.dev>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character] || character));
const money = (value: unknown) => new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
}).format(Number(value) || 0);

Deno.serve(async request => {
  if (!RESEND_API_KEY || !SELLER_EMAIL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Missing email configuration", { status: 500 });
  }

  const payload = await request.json();
  const orderNumber = String(payload.orderNumber || "");
  if (!orderNumber) return new Response("Missing order number", { status: 400 });
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: order, error: orderError } = await client
    .from("orders")
    .select("*")
    .eq("order_number", orderNumber)
    .single();
  if (orderError || !order) return new Response("Order not found", { status: 404 });
  if (!order?.order_number) return new Response("Invalid order", { status: 400 });
  const items = Array.isArray(order.items) ? order.items : [];
  const products = items.map((item: Record<string, unknown>) =>
    `<li>${escapeHtml(item.name)} × ${escapeHtml(item.quantity)} — ${escapeHtml(money(Number(item.price) * Number(item.quantity)))}</li>`
  ).join("");
  const address = order.address
    ? `${order.address}, ${order.city || ""}${order.postal_code ? ` (${order.postal_code})` : ""}`
    : "No corresponde";

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
        <p><strong>Documento:</strong> ${escapeHtml(order.document)}</p>
        <p><strong>Teléfono:</strong> ${escapeHtml(order.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(order.email)}</p>
        <p><strong>Entrega:</strong> ${escapeHtml(order.delivery_method)}</p>
        <p><strong>Dirección:</strong> ${escapeHtml(address)}</p>
        <p><strong>Pago:</strong> ${escapeHtml(order.payment_method)}</p>
        <h2>Productos</h2><ul>${products}</ul>
        <p><strong>Subtotal:</strong> ${escapeHtml(money(order.subtotal))}</p>
        <p><strong>Descuento:</strong> ${escapeHtml(money(order.discount))}</p>
        <p><strong>Total:</strong> ${escapeHtml(money(order.total))}</p>
        <p><strong>Observaciones:</strong> ${escapeHtml(order.notes || "Sin observaciones")}</p>
      `
    })
  });

  const result = await response.text();
  return new Response(result, {
    status: response.status,
    headers: { "Content-Type": "application/json" }
  });
});
