import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = selector => document.querySelector(selector);

function setMessage(selector, text, error = false) {
  const element = $(selector);
  element.textContent = text;
  element.classList.toggle("error", error);
}

async function isAdministrator(userId) {
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data);
}

async function showProfile(user) {
  $("[data-auth-view]").classList.add("hidden");
  $("[data-profile-view]").classList.remove("hidden");
  $("[data-profile-email]").textContent = user.email;
  const admin = await isAdministrator(user.id);
  $("[data-admin-link]").classList.toggle("hidden", !admin);
}

function showAuth() {
  $("[data-profile-view]").classList.add("hidden");
  $("[data-auth-view]").classList.remove("hidden");
}

const { data: { session } } = await supabase.auth.getSession();
if (session?.user) await showProfile(session.user);

document.querySelectorAll("[data-auth-tab]").forEach(button => {
  button.addEventListener("click", () => {
    const login = button.dataset.authTab === "login";
    document.querySelectorAll("[data-auth-tab]").forEach(tab => tab.classList.toggle("active", tab === button));
    $("[data-login-form]").classList.toggle("hidden", !login);
    $("[data-register-form]").classList.toggle("hidden", login);
  });
});

$("[data-login-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  setMessage("[data-login-message]", "Ingresando...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("password")
  });
  if (error) {
    setMessage("[data-login-message]", "Correo o contraseña incorrectos.", true);
    return;
  }
  const admin = await isAdministrator(data.user.id);
  if (admin) {
    window.location.href = "admin.html";
    return;
  }
  await showProfile(data.user);
});

$("[data-register-form]").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  if (form.get("password") !== form.get("password_confirmation")) {
    setMessage("[data-register-message]", "Las contraseñas no coinciden.", true);
    return;
  }
  setMessage("[data-register-message]", "Creando cuenta...");
  const { data, error } = await supabase.auth.signUp({
    email: form.get("email"),
    password: form.get("password"),
    options: { emailRedirectTo: new URL("account.html", window.location.href).href }
  });
  if (error) {
    setMessage("[data-register-message]", error.message, true);
    return;
  }
  if (data.session) {
    await showProfile(data.user);
  } else {
    setMessage("[data-register-message]", "Revisá tu correo para confirmar la cuenta.");
  }
});

$("[data-logout]").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showAuth();
});
