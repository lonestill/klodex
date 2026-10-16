/// Klodex web app — no build step, vanilla ES module.
import { marked } from "/web/vendor/marked.js";
import DOMPurify from "/web/vendor/purify.js";

const $ = (sel) => document.querySelector(sel);
const els = {
  provider: $("#provider"),
  model: $("#model"),
  modelCount: $("#model-count"),
  projectDir: $("#project-dir"),
  sessionList: $("#session-list"),
  sessionTitle: $("#session-title"),
  chat: $("#chat"),
  input: $("#input"),
  send: $("#btn-send"),
  stop: $("#btn-stop"),
  statusDot: $("#status-dot"),
  statusText: $("#status-text"),
  tokens: $("#tokens-info"),
};

const state = {
  catalog: [],        // providers with models
  provider: null,
  model: null,
  session: null,      // current SessionRow
  messages: [],       // UIMessages of current session
  running: false,
  abortCtl: null,     // fetch controller for stop
};
try {
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style') {
      node.remove();
    }
  });
} catch (e) {
  console.error("DOMPurify hook error", e);
}
const md = (text) => {
  const raw = marked.parse(text ?? "", { gfm: true, breaks: true });
  return DOMPurify.sanitize(raw, { FORBID_TAGS: ['style'], FORBID_ATTR: ['style'] });
};
const esc = (s) => s?.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `${res.status}`);
  }
  return res.json();
}

/* ---------- catalog ---------- */

async function loadCatalog() {
  const data = await api("/api/catalog");
  state.catalog = data.providers;
  renderProviders();
  if (!state.provider) applyDefaultChoice();
}

function statusBadge(p) {
  return { ready: "✓", local: "💻", keyless: "🆓", needs_key: "🔑" }[p.status] ?? "";
}

function renderProviders() {
  els.provider.innerHTML = "";
  for (const p of state.catalog) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${statusBadge(p)} ${p.name} (${p.models.length})`;
    els.provider.appendChild(opt);
  }
  if (state.provider) els.provider.value = state.provider;
  els.provider.dispatchEvent(new Event("change"));
}

function applyDefaultChoice() {
  // Prefer a ready cloud provider, then local, then keyless.
  const pick = state.catalog.find((p) => p.status === "ready") ?? state.catalog[0];
  if (pick) {
    state.provider = pick.id;
    els.provider.value = pick.id;
    els.provider.dispatchEvent(new Event("change"));
  }
}

function renderModels() {
  const p = state.catalog.find((x) => x.id === state.provider);
  els.model.innerHTML = "";
  if (!p) return;
  els.modelCount.textContent = `(у ${p.name}: ${p.models.length})`;
  for (const m of p.models) {
    const opt = document.createElement("option");
    opt.value = m.id;
    const flags = [];
    if (m.reasoning) flags.push("理由");
    if (m.free) flags.push("free");
    if (!m.toolCall) flags.push("без тулз");
    opt.textContent = flags.length ? `${m.name} · ${flags.join(", ")}` : m.name;
    if (flags.length) opt.title = flags.join(", ");
    if (flags.includes("free")) opt.dataset.free = "1";
    els.model.appendChild(opt);
  }
  els.model.value = localStorage.getItem("klodex_model." + state.provider) ?? els.model.options[0]?.value;
  State.lastModelId = els.model.value;
}

els.provider.addEventListener("change", () => {
  state.provider = els.provider.value;
  renderModels();
  State.lastProviderId = state.provider;
});

els.model.addEventListener("change", () => {
  state.model = els.model.value;
  localStorage.setItem("klodex_model." + state.provider, state.model);
});

/* ---------- sessions ---------- */

async function loadSessions() {
  const rows = await api("/api/sessions");
  els.sessionList.innerHTML = "";
  for (const s of rows) {
    const li = document.createElement("li");
    li.textContent = s.title || s.id.slice(0, 8);
    li.dataset.id = s.id;
    if (state.session?.id === s.id) li.classList.add("active");
    li.addEventListener("click", () => openSession(s.id));
    els.sessionList.appendChild(li);
  }
}

async function openSession(id) {
  document.querySelectorAll("#session-list li").forEach((li) => li.classList.toggle("active", li.dataset.id === id));
  state.messages = await api(`/api/sessions/${id}/messages`);
  const row = await api(`/api/sessions/${id}`);
  state.session = row;
  els.sessionTitle.textContent = row.title ?? id;
  if (row.provider) { state.provider = row.provider; els.provider.value = row.provider; renderModels(); if (row.model) els.model.value = row.model; }
  els.chat.innerHTML = "";
  $("#welcome")?.remove();
  for (const m of state.messages) renderMessage(m.data, { persist: true });
  scrollBottom();
}

async function newSession() {
  const dir = els.projectDir.value.trim() || undefined;
  const bodyData = { projectDir: dir, provider: state.provider, model: state.model };
  try {
    state.session = await api("/api/sessions", { method: "POST", body: JSON.stringify(bodyData) });
  } catch (e) {
    setStatus("err", "не смогли создать сессию: " + e.message);
    return;
  }
  state.messages = [];
  els.sessionTitle.textContent = "Новая сессия";
  els.chat.innerHTML = "";
  $("#welcome")?.remove();
  ensureWelcome();
  loadSessions();
  setStatus("ok", "готов");
}

$("#btn-new").addEventListener("click", newSession);

$("#btn-delete").addEventListener("click", async () => {
  if (!state.session) return;
  if (!confirm("Удалить сессию?")) return;
  await api(`/api/sessions/${state.session.id}`, { method: "DELETE" });
  state.session = null;
  state.messages = [];
  els.chat.innerHTML = "";
  ensureWelcome();
  els.sessionTitle.textContent = "Новая сессия";
  loadSessions();
});

$("#btn-refresh-catalog").addEventListener("click", async () => {
  setStatus("busy", "обновляю каталог…");
  await api("/api/catalog/refresh", { method: "POST" });
  await loadCatalog();
  setStatus("ok", "каталог обновлён");
});

$("#btn-key").addEventListener("click", () => promptKey());

async function promptKey() {
  const p = state.catalog.find((x) => x.id === state.provider);
  if (!p) return;
  if (p.status === "local") return alert("Локальный провайдер не требует ключа");
  const key = prompt(`API-ключ для провайдера “${p.name}”:\n(сохранится в ~/.config/klodex/config.jsonc)`);
  if (!key?.trim()) return;
  await api("/api/keys", { method: "POST", body: JSON.stringify({ provider: p.id, key: key.trim() }) });
  await api("/api/catalog/refresh", { method: "POST" });
  await loadCatalog();
  setStatus("ok", "ключ сохранён");
}

/* ---------- rendering ---------- */

function setStatus(kind, text) {
  els.statusDot.className = "dot" + (kind === "busy" ? " busy" : kind === "err" ? " err" : "");
  els.statusText.textContent = text;
}

function ensureWelcome() {
  if (!$("#welcome") && state.messages.length === 0) {
  }
}

function scrollBottom() {
  els.chat.scrollTop = els.chat.scrollHeight;
}

function tokenCountOf(m) {
  if (typeof m !== "string") return "";
  return m.length > 0 ? `${m.length}` : "";
}

function renderMessage(msg, { str = true } = {}) {
  // msg: UIMessage {id, role, parts}
  const div = document.createElement("div");
  div.className = `msg ${msg.role}`;
  const role = document.createElement("div");
  role.className = "role";
  role.textContent = msg.role === "user" ? "ты" : "klodex";
  if (msg.role === "assistant" && msg.model) {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = msg.model;
    role.appendChild(b);
  }
  const content = document.createElement("div");
  content.className = "content";
  div.append(role, content);

  for (const part of msg.parts ?? []) {
    renderPart(part, content);
  }
  els.chat.appendChild(div);
  scrollBottom();
  return div;
}

function renderPart(part, container, streaming = false) {
  if (part.type === "text") {
    const div = document.createElement("div");
    div.innerHTML = md(part.text ?? "");
    if (streaming) div.classList.add("caret");
    container.appendChild(div);
  } else if (part.type === "reasoning") {
    const d = document.createElement("details");
    d.className = "reasoning";
    const s = document.createElement("summary");
    s.textContent = "reasoning";
    const body = document.createElement("div");
    body.className = "rbody";
    body.textContent = part.text ?? "";
    d.append(s, body);
    container.appendChild(d);
  } else if (part.type?.startsWith("tool-")) {
    const name = part.type.slice(5);
    const d = document.createElement("details");
    d.className = "tool";
    const s = document.createElement("summary");
    const args = summarizeArgs(part.input, name);
    const st = document.createElement("span");
    st.className = "tstate " + (part.state === "output-error" ? "err" : "ok");
    s.innerHTML = `<span class="tname">${esc(name)}</span><span>${esc(args)}</span>`;
    s.appendChild(st);
    st.textContent = part.state === "output-error" ? "✗" : "✓";
    const body = document.createElement("div");
    body.className = "tbody";
    if (part.input) {
      const inL = document.createElement("div");
      inL.className = "tlabel io-in";
      inL.textContent = "input";
      const inP = document.createElement("pre");
      inP.textContent = typeof part.input === "string" ? part.input : JSON.stringify(part.input, null, 2);
      body.append(inL, inP);
    }
    if (part.output != null || part.errorText) {
      const outL = document.createElement("div");
      outL.className = "tlabel";
      outL.textContent = "output";
      const outP = document.createElement("pre");
      outP.textContent = typeof part.output === "string" ? part.output : JSON.stringify(part.output ?? part.errorText, null, 2);
      body.append(outL, outP);
    }
    d.append(s, body);
    container.appendChild(d);
  }
}

function summarizeArgs(input, toolName) {
  if (!input) return "";
  if (toolName === "bash") return ` → ${input.command}`;
  if (toolName === "read" || toolName === "write" || toolName === "edit") return ` → ${input.path}`;
  if (toolName === "glob") return ` → ${input.pattern}`;
  if (toolName === "grep") return ` → ${input.pattern}`;
  if (toolName === "subagent") return ` (${input.agent}) → ${...input.prompt}`;
  return "";
}

/* ---------- live streaming assistant message ---------- */

function makeStreamingAssistant() {
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.innerHTML = `<div class="role">klodex</div><div class="content"></div>`;
  els.chat.appendChild(div);
  scrollBottom();
  return { root: div, content: div.querySelector(".content") };
}

function appendTextToContent(content, text) {
  // find last text div
  let last = content.querySelector(".live-text:last-child");
  if (!last) {
    last = document.createElement("div");
    last.className = "live-text caret";
    content.appendChild(last);
  }
  last.dataset.raw = (last.dataset.raw ?? "") + text;
  last.innerHTML = md(last.dataset.raw);
  scrollBottom();
}

function closeLiveText(content) {
  content.querySelectorAll(".live-text").forEach((el) => el.classList.remove("caret"));
}

/* ---------- sending ---------- */

async function send() {
  const text = els.input.value.trim();
  if (!text || state.running) return;
  if (!state.provider) return setStatus("err", "выбери провайдера");
  if (!state.model) return setStatus("err", "выбери модель");
  if (!state.session) await newSession();

  state.running = true;
  state.abortCtl = new AbortController();
  els.send.disabled = true;
  els.send.style.display = "none";
  els.stop.style.display = "";
  setStatus("busy", "думаю…");
  els.tokens.textContent = "";

  const { root, content } = makeStreamingAssistant();
  const bodyData = {
    sessionId: state.session.id,
    message: text,
    model: `${state.provider}/${state.model}`,
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(bodyData),
      signal: state.abortCtl.signal,
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "stream failed");
    }
    await readSSE(res.body, (evt) => handleStreamEvent(evt, content, root));
  } catch (e) {
    if (e.name === "AbortError") {
      closeLiveText(content);
      setStatus("ok", "остановлено");
    } else {
      const err = document.createElement("div");
      err.className = "errbox";
      err.textContent = "Ошибка: " + (e.message ?? e);
      els.chat.appendChild(err);
      setStatus("err", e.message);
      root.remove();
    }
  } finally {
    els.input.value = "";
    state.running = false;
    state.abortCtl = null;
    els.send.disabled = false;
    els.send.style.display = "";
    els.stop.style.display = "none";
    loadSessions(); // title may have changed
  }
}

function handleStreamEvent(evt, content, root) {
  if (evt.t === "start") {
    // nothing; could attach model label
  } else if (evt.t === "text") {
    appendTextToContent(content, evt.d);
    setStatus("busy", "пишет…");
  } else if (evt.t === "reason") {
    handleReason(evt, content);
    setStatus("busy", "размышляет…");
  } else if (evt.t === "tool") {
    closeLiveText(content);
    const part = { type: `tool-${evt.name}`, toolCallId: evt.callId, state: "input-available", input: evt.input };
    renderPart(part, content);
    setStatus("busy", `инструмент ${evt.name}…`);
  } else if (evt.t === "toolres") {
    const part = { type: `tool-${evt.name}`, toolCallId: evt.callId, state: evt.isError ? "output-error" : "output-available", output: evt.isError ? undefined : evt.output, errorText: evt.isError ? evt.output : undefined, input: {} };
    renderPart(part, content);
    setStatus("busy", "пишет…");
  } else if (evt.t === "finish") {
    closeLiveText(content);
    els.tokens.textContent = `${evt.detail?.steps ?? 0} шаг(ов) · ${evt.detail?.tokens ?? 0} токенов`;
    setStatus("ok", "готов");
  } else if (evt.t === "error") {
    closeLiveText(content);
    const err = document.createElement("div");
    err.className = "errbox";
    err.textContent = "Ошибка: " + (evt.message ?? "unknown");
    content.appendChild(err);
    setStatus("err", evt.message);
  }
}

/* ---------- reasoning accumulation (v5 chunks idle) ---------- */

function handleReason(evt, content) {
  let d = content.querySelector(".reasoning:last-child");
  if (!d) {
    d = document.createElement("details");
    d.className = "reasoning";
    d.innerHTML = `<summary>reasoning</summary><div class="rbody"></div>`;
    content.appendChild(d);
  }
  const body = d.querySelector(".rbody");
  body.textContent += evt.d;
  d.open = state.showReasoningOpen;
  scrollBottom();
}

els.stop.addEventListener("click", () => {
  if (state.session && state.abortCtl) {
    state.abortCtl.abort();
    fetch("/api/chat/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: state.session.id }) });
  }
});

els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(200, els.input.scrollHeight) + "px";
});

els.send.addEventListener("click", send);

/* ---------- SSE reader ---------- */

async function readSSE(body, onEvent) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)));
        } catch (e) {
          console.error("bad SSE", e);
        }
      }
    }
  }
}

/* ---------- boot ---------- */

(function boot() {
  els.projectDir.value = localStorage.getItem("klodex_project") ?? "";
  els.projectDir.addEventListener("change", () => localStorage.setItem("klodex_project", els.projectDir.value));
  loadCatalog();
  loadSessions();
})();
