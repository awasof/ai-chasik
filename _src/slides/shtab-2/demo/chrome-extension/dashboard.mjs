import { columns, formatDate, readCards, remindersFor } from "./cards.mjs";

const $ = id => document.getElementById(id);
const connect = $("connect");
const resume = $("resume");
const refresh = $("refresh");
let root;
let reading = false;
let lastView = "";

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
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

function render({ cards, issues }, today) {
  $("board").replaceChildren(...columns.map(([id, title]) => {
    const section = element("section");
    const selected = cards.filter(card => card.status === id);
    section.append(element("h2", `${title} · ${selected.length}`));
    for (const card of selected) {
      const article = element("article");
      article.append(element("h3", card.name));
      labeled(article, "Номер", card.number);
      labeled(article, "На очереди", card.effectDone ? null : card.stage);
      labeled(article, "Следующий шаг", card.next);
      labeled(article, "За кем", card.owner);
      labeled(article, "Срок", formatDate(card.deadline), card.deadline < today);
      if (card.effectDone) article.append(element("p", "Эффект зафиксирован"));
      if (card.checklist.length) {
        const details = element("details");
        const complete = card.checklist.filter(item => item.done).length;
        const list = element("ul");
        for (const item of card.checklist) list.append(element("li", (item.done ? "Готово · " : "Открыто · ") + item.text));
        details.append(element("summary", `Чек-лист · ${complete} из ${card.checklist.length}`), list);
        article.append(details);
      }
      section.append(article);
    }
    return section;
  }));
  const reminders = remindersFor(cards);
  $("reminders").hidden = reminders.length === 0;
  $("reminder-list").replaceChildren(...reminders.map(item => {
    const li = element("li", `${formatDate(item.date)} · ${item.project} · ${item.text}`);
    if (item.date < today) li.className = "late";
    return li;
  }));
  $("issues").hidden = issues.length === 0;
  $("issue-list").replaceChildren(...issues.map(issue => element("li", issue)));
}

function status(message) {
  if ($("status").textContent !== message) $("status").textContent = message;
}

async function scan() {
  if (!root || reading) return;
  const active = root;
  reading = true;
  refresh.disabled = true;
  try {
    if (await active.queryPermission({ mode: "read" }) !== "granted") {
      if (active !== root) return;
      resume.hidden = false;
      render({ cards: [], issues: [] }, todayKey());
      lastView = "";
      status(`Разрешите чтение папки «${active.name}».`);
      return;
    }
    const result = await readCards(active);
    if (active !== root) return;
    const today = todayKey();
    const view = JSON.stringify([today, result]);
    if (view !== lastView) {
      render(result, today);
      lastView = view;
    }
    resume.hidden = true;
    const issues = result.issues.length ? ` · Нужна настройка: ${result.issues.length}` : "";
    status(`Папка «${active.name}» · Проектов: ${result.cards.length}${issues}`);
  } catch (error) {
    if (active !== root) return;
    const canResume = error.name === "NotAllowedError" || error.name === "SecurityError";
    resume.hidden = !canResume;
    lastView = "";
    render({ cards: [], issues: [] }, todayKey());
    status(error.name === "NotFoundError" || error.name === "TypeMismatchError"
      ? "Папка projects/ не найдена. Подключите корневую папку штаба."
      : canResume ? "Нужно снова разрешить чтение папки." : `Ошибка чтения · ${error.message}`);
  } finally {
    reading = false;
    refresh.disabled = false;
    if (active !== root) void scan();
  }
}

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
    try { await storedRoot(root); } catch { /* Папка по-прежнему доступна в этой вкладке. */ }
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
window.addEventListener("focus", scan);
setInterval(scan, 5000);
render({ cards: [], issues: [] }, todayKey());
try {
  root = await storedRoot();
  await scan();
} catch {
  status("Выберите папку, в которой находится projects/.");
}
