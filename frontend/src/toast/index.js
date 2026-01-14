import "./index.css";

let singleton = null;

function ensureToastElement() {
  let el = document.getElementById("toast");
  if (el) return el;

  el = document.createElement("div");
  el.id = "toast";
  el.className = "toast";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  document.body.appendChild(el);
  return el;
}

export function createToast() {
  if (singleton) return singleton;

  const el = ensureToastElement();
  let timer = null;

  function hide() {
    el.classList.remove("is-visible");
  }

  function show(message, durationMs = 900) {
    if (!message) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    el.textContent = message;
    el.classList.add("is-visible");
    timer = setTimeout(() => {
      hide();
      timer = null;
    }, durationMs);
  }

  singleton = { show, hide };
  return singleton;
}

export const toast = createToast();
