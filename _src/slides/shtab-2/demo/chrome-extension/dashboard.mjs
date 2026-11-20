import { allowedItems, columns, formatDate, parseCard, parseRules, planCheck, readCards, stageTitle } from "./cards.mjs";

const $ = id => document.getElementById(id);
const connect = $("connect");
const resume = $("resume");
const refresh = $("refresh");
const dialog = $("project");
const form = $("project-form");
const checklist = $("project-checks");
const board = $("board");
const stageNav = $("stage-nav");
const previousStages = $("previous-stages");
const nextStages = $("next-stages");
const demo = window.SHTAB_DEMO;
const memory = demo ? new Map(Object.entries(demo.cards)) : null;
const labels = Object.fromEntries(columns);

let root;
let scope = "overview";
let reading = false;
let saving = false;
let lastView = "";
let snapshot = { cards: [], issues: [], rules: null };
let project;
let pending;

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function action(text, handler) {
  const button = element("button", text);
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function todayKey() {
  const date = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function labeled(parent, label, value, late = false) {
  if (!value) return;
  const p = element("p");
  if (late) p.className = "late";
  p.append(element("b", label), " · ", value);
  parent.append(p);
}

function status(message) {
  if ($("status").textContent !== message) $("status").textContent = message;
}

function cardSummary(card, detailed, today) {
  const article = element("article");
  const title = element("h3");
  const open = action(card.name, () => void openProject(card.folder));
  open.className = "card-link";
  title.append(open);
  article.append(title);
  labeled(article, "Номер", card.number);
  labeled(article, "На очереди", card.effectDone ? null : card.stage);
  if (card.effectDone) article.append(element("p", "Эффект зафиксирован"));
  if (card.status === "done" && !card.effectDone) {
    labeled(article, "Контроль эффекта", formatDate(card.effectDate), card.effectDate < today);
  }
  if (detailed) {
    if (card.stages.length) labeled(article, "Стадии", `${card.stages.filter(x => x.done).length} из ${card.stages.length}`);
    labeled(article, "Ведёт стадию", card.stageOwner);
    labeled(article, "Подтверждает", card.stageApprover);
    labeled(article, "Следующий шаг", card.next);
    labeled(article, "За кем шаг", card.owner);
    labeled(article, "Срок", formatDate(card.deadline), card.deadline < today);
  }
  return article;
}

function updateStageNav() {
  const overflow = board.scrollWidth - board.clientWidth;
  stageNav.hidden = scope !== "active" || overflow <= 1;
  previousStages.disabled = board.scrollLeft <= 1;
  nextStages.disabled = board.scrollLeft >= overflow - 1;
}

function render() {
  const { cards, issues } = snapshot;
  const today = todayKey();
  $("overview").setAttribute("aria-pressed", String(scope === "overview"));
  $("active").setAttribute("aria-pressed", String(scope === "active"));
  board.className = scope;
  board.tabIndex = scope === "active" ? 0 : -1;

  if (scope === "overview") {
    board.replaceChildren(...columns.map(([id, title]) => {
      const section = element("section");
      const group = cards.filter(card => card.status === id);
      const heading = element("h2");
      if (id === "ongoing") {
        const open = action(`${title} · ${group.length}`, () => selectScope("active"));
        open.className = "card-link column-link";
        open.setAttribute("aria-label", `Открыть Ongoing, проектов: ${group.length}`);
        heading.append(open);
      } else {
        heading.textContent = `${title} · ${group.length}`;
      }
      section.append(heading, ...group.map(card => cardSummary(card, false, today)));
      if (!group.length) section.append(element("p", "Пока пусто"));
      return section;
    }));
  } else {
    const active = cards.filter(card => card.status === "ongoing");
    const order = new Map();
    for (const card of active) {
      card.stages.forEach((item, index) => {
        const title = stageTitle(item);
        if (title !== "Эффект зафиксирован" && !order.has(title)) order.set(title, index);
      });
      if (card.handoff.length && !order.has("Передача результатов")) order.set("Передача результатов", card.stages.length - 1.5);
    }
    const groups = new Map([...order].sort((a, b) => a[1] - b[1]).map(([title]) => [title, []]));
    for (const card of active.sort((a, b) => a.stageOrder - b.stageOrder)) {
      const title = card.stage || "Стадия не указана";
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(card);
    }
    board.replaceChildren(...Array.from(groups, ([title, group]) => {
      const section = element("section");
      if (!group.length) section.className = "empty-stage";
      section.append(element("h2", `${title} · ${group.length}`), ...group.map(card => cardSummary(card, true, today)));
      return section;
    }));
    if (!active.length) board.append(element("p", "Нет проектов в работе."));
  }
  updateStageNav();
  $("issues").hidden = !issues.length;
  $("issue-list").replaceChildren(...issues.map(issue => element("li", issue)));
}

function selectScope(nextScope) {
  scope = nextScope;
  render();
}

async function readRules(directory) {
  try {
    const handle = await directory.getFileHandle("dashboard-rules.json");
    return { rules: parseRules(await (await handle.getFile()).text()) };
  } catch (error) {
    if (error.name !== "NotFoundError") return { rules: null, issue: error.message };
    return { rules: null };
  }
}

async function loadProject(directory, folder) {
  if (demo) return { raw: memory.get(folder) };
  const projects = await directory.getDirectoryHandle("projects");
  const projectFolder = await projects.getDirectoryHandle(folder);
  const handle = await projectFolder.getFileHandle("README.md");
  return { handle, raw: await (await handle.getFile()).text() };
}

async function scan() {
  if ((!root && !demo) || reading || saving) return;
  const active = root;
  reading = true;
  refresh.disabled = true;
  try {
    if (!demo && await active.queryPermission({ mode: "read" }) !== "granted") {
      if (active !== root) return;
      resume.hidden = false;
      snapshot = { cards: [], issues: [], rules: null };
      lastView = "";
      render();
      status(`Разрешите чтение папки «${active.name}».`);
      return;
    }
    const result = demo
      ? { cards: [...memory].map(([name, raw]) => parseCard(raw, name)), issues: [] }
      : await readCards(active);
    const { rules, issue } = demo ? { rules: demo.rules } : await readRules(active);
    if (active !== root) return;
    if (issue) result.issues.push(issue);
    snapshot = { ...result, rules };
    const view = JSON.stringify([todayKey(), snapshot]);
    if (view !== lastView) {
      render();
      lastView = view;
    }
    resume.hidden = true;
    const issues = result.issues.length ? ` · Нужна настройка: ${result.issues.length}` : "";
    status(demo ? "Учебные данные. Изменения действуют до перезагрузки страницы."
      : `Папка «${active.name}» · Проектов: ${result.cards.length}${issues}`);
  } catch (error) {
    if (active !== root) return;
    const canResume = error.name === "NotAllowedError" || error.name === "SecurityError";
    resume.hidden = !canResume;
    snapshot = { cards: [], issues: [], rules: null };
    lastView = "";
    render();
    status(error.name === "NotFoundError" || error.name === "TypeMismatchError"
      ? "Папка projects/ не найдена. Подключите корневую папку штаба."
      : canResume ? "Нужно снова разрешить чтение папки." : `Ошибка чтения · ${error.message}`);
  } finally {
    reading = false;
    refresh.disabled = false;
    if (active !== root) void scan();
  }
}

function appendChecks(title, items, enabled) {
  if (!items.length) return;
  const section = element("fieldset");
  const complete = items.filter(item => item.done).length;
  section.append(element("legend", `${title} · ${complete} из ${items.length}`));
  for (const item of items) {
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.done;
    checkbox.disabled = !enabled.has(item.line);
    if (!checkbox.disabled) checkbox.dataset.line = item.line;
    checkbox.addEventListener("change", () => selectCheck(checkbox, item));
    const label = element("label");
    label.append(checkbox, element("span", item.text));
    section.append(label);
  }
  checklist.append(section);
}

async function openProject(folder) {
  const active = root;
  try {
    const selected = await loadProject(active, folder);
    if (root !== active) return;
    const card = parseCard(selected.raw, folder);
    project = { ...selected, card, folder, root: active, rules: snapshot.rules };
    pending = null;
    form.reset();
    $("pending").hidden = true;
    $("project-title").textContent = card.name;
    $("project-path").textContent = `projects/${folder}/README.md`;
    $("project-message").textContent = snapshot.rules ? ""
      : "Для смены колонки настройте dashboard-rules.json по правилам вашего штаба.";
    const state = $("project-state");
    state.replaceChildren();
    labeled(state, "Статус", labels[card.status]);
    labeled(state, "На очереди", card.stage);
    labeled(state, "Следующий шаг", card.next);
    labeled(state, "За кем шаг", card.owner);
    checklist.replaceChildren();
    const enabled = new Set(allowedItems(card, project.rules).map(item => item.line));
    appendChecks("Стадии проекта", card.stages, enabled);
    appendChecks("Передача результатов", card.handoff, enabled);
    appendChecks("Чек-лист действий", card.checklist, enabled);
    if (!dialog.open) dialog.showModal();
  } catch (error) {
    $("feedback").textContent = `Не удалось открыть карточку · ${error.message}`;
  }
}

function selectCheck(checkbox, item) {
  if (saving || !project) return;
  pending = checkbox.checked ? item : null;
  for (const input of checklist.querySelectorAll("input[data-line]")) input.checked = input === checkbox && !!pending;
  $("pending").hidden = !pending;
  $("project-message").textContent = "";
  if (!pending) return;
  const preview = planCheck(project.raw, project.folder, pending.line, { rules: project.rules, preview: true });
  $("evidence").value = "";
  $("evidence").required = preview.requiresEvidence;
  $("next-fields").hidden = !preview.actionChanged;
  $("next-step").value = preview.card.next || "";
  $("next-owner").value = preview.card.owner || "";
  $("effect-field").hidden = !preview.needsEffectDate;
  $("effect-date").required = preview.needsEffectDate;
  $("effect-date").value = project.card.effectDate || "";
  const result = preview.card.status === project.card.status
    ? labels[project.card.status] : `${labels[project.card.status]} → ${labels[preview.card.status]}`;
  $("preview").textContent = [result, preview.card.stage].filter(Boolean).join(" · ");
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (saving || !project || !pending) return;
  const selected = project;
  saving = true;
  $("save").disabled = true;
  $("project-message").textContent = "";
  try {
    const change = planCheck(selected.raw, selected.folder, pending.line, {
      rules: selected.rules, evidence: $("evidence").value,
      next: $("next-step").value, owner: $("next-owner").value, effectDate: $("effect-date").value,
    });
    if (demo) {
      memory.set(selected.folder, change.text);
    } else {
      if (selected.root !== root) throw Error("Папка изменилась. Откройте карточку заново.");
      if (await selected.handle.requestPermission({ mode: "readwrite" }) !== "granted") {
        throw Error("Chrome не разрешил запись в карточку");
      }
      const current = await loadProject(root, selected.folder);
      const { rules } = await readRules(root);
      if (current.raw !== selected.raw || JSON.stringify(rules) !== JSON.stringify(selected.rules)) {
        throw Error("Карточка или правила изменились. Закройте и откройте проект заново.");
      }
      const writer = await current.handle.createWritable();
      await writer.write(change.text);
      await writer.close();
    }
    if (change.card.status !== selected.card.status) scope = "overview";
    $("feedback").textContent = `«${change.card.name}» · ${labels[change.card.status]} · ${demo ? "демо обновлено" : "карточка сохранена"}`;
    dialog.close();
  } catch (error) {
    $("project-message").textContent = error.message;
  } finally {
    saving = false;
    $("save").disabled = false;
    await scan();
  }
});

function storedRoot(value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("research-hq", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("settings");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const writing = value !== undefined;
      const tx = db.transaction("settings", writing ? "readwrite" : "readonly");
      const store = tx.objectStore("settings");
      const request = writing ? store.put(value, "root") : store.get("root");
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

connect.addEventListener("click", async () => {
  if (!window.showDirectoryPicker) {
    status("Откройте дашборд из расширения в Google Chrome.");
    return;
  }
  try {
    root = await window.showDirectoryPicker({ id: "research-hq", mode: "read" });
    try { await storedRoot(root); } catch { /* Папка доступна в этой вкладке. */ }
    await scan();
  } catch (error) {
    if (error.name !== "AbortError") status(`Не удалось подключить папку · ${error.message}`);
  }
});
resume.addEventListener("click", async () => {
  if (!root) return;
  try {
    await root.requestPermission({ mode: "read" });
    await scan();
  } catch (error) {
    status(`Не удалось разрешить чтение · ${error.message}`);
  }
});
refresh.addEventListener("click", scan);
$("overview").addEventListener("click", () => selectScope("overview"));
$("active").addEventListener("click", () => selectScope("active"));
$("close-project").addEventListener("click", () => { if (!saving) dialog.close(); });
dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
board.addEventListener("scroll", updateStageNav);
window.addEventListener("resize", updateStageNav);
previousStages.addEventListener("click", () => board.scrollBy({ left: -board.clientWidth, behavior: "smooth" }));
nextStages.addEventListener("click", () => board.scrollBy({ left: board.clientWidth, behavior: "smooth" }));

if (demo) {
  connect.hidden = true;
  refresh.hidden = true;
  await scan();
} else {
  window.addEventListener("focus", scan);
  setInterval(scan, 5000);
  render();
  try {
    root = await storedRoot();
    await scan();
  } catch {
    status("Выберите папку, в которой находится projects/.");
  }
}
