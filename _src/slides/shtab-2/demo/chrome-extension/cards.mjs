export const columns = [
  ["todo", "To do"],
  ["ongoing", "Ongoing"],
  ["done", "Done — контроль эффекта"],
];

function stageInfo(item) {
  if (!item) return {};
  const [label, ...notes] = item.text.split(" · ");
  const info = { title: label.replace(/^\d+\.\s+/, "") };
  for (const note of notes) {
    const m = note.match(/^(Ответственный|Подтверждает):\s*(.+)$/i);
    if (m) info[m[1].toLowerCase()] = m[2].trim();
  }
  return info;
}

const CHECK = /^(\s*(?:[-+*]|\d+\.)\s+)\[([ xX])\](\s+)(.+)/;
export const stageTitle = item => stageInfo(item).title;
const taskTitle = item => item?.text.split(" · ")[0].replace(/\.(?:\s.*)?$/, "").trim();

export function parseCard(text, folder) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end < 0) throw Error("Добавьте шапку карточки");
  const fields = Object.create(null);
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([^:#\s]+):\s*(.*)$/);
    if (!m) continue;
    fields[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  const status = fields.status?.toLowerCase();
  if (!columns.some(([id]) => id === status)) throw Error("Укажите status: todo, ongoing или done");

  const stages = [];
  const handoff = [];
  const checklist = [];
  let section = checklist;
  let fence = "";
  for (let index = end + 1; index < lines.length; index++) {
    const line = lines[index];
    const mark = line.match(/^\s*(`{3,}|~{3,})/);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = "";
      continue;
    }
    if (fence) continue;
    const title = line.match(/^#{1,2}\s+(.+?)\s*#*\s*$/)?.[1].toLowerCase();
    if (title) {
      section = title === "стадии проекта" ? stages : title === "передача результатов" ? handoff : checklist;
      continue;
    }
    const m = line.match(CHECK);
    if (m) section.push({ done: m[2] !== " ", text: m[4], line: index });
  }

  const firstOpen = stages.findIndex(item => !item.done);
  const nextStage = stageInfo(stages[firstOpen]);
  const needsHandoff = status === "ongoing" && handoff.some(item => !item.done)
    && (!nextStage.title || nextStage.title === "Эффект зафиксирован");
  const stage = stages.length ? (needsHandoff ? "Передача результатов" : nextStage.title) : fields.стадия;
  const effectDone = stages.length
    ? stages.some(item => item.done && /^(?:\d+\.\s+)?Эффект зафиксирован(?:$|[\s.,;:—–-])/i.test(item.text))
    : fields.эффект === "зафиксирован";
  return {
    folder, status, stages, handoff, checklist,
    name: fields.имя || fields.name || folder,
    researcher: fields.исследователь || fields.ответственный,
    number: fields.rp || fields.номер,
    stage,
    stageOrder: needsHandoff ? (firstOpen < 0 ? stages.length : firstOpen) - 0.5
      : firstOpen < 0 ? Number.MAX_SAFE_INTEGER : firstOpen,
    stageOwner: needsHandoff ? undefined : nextStage.ответственный,
    stageApprover: needsHandoff ? undefined : nextStage.подтверждает,
    next: fields.следующий_шаг,
    owner: fields.за_кем_шаг,
    deadline: fields.дедлайн,
    effectDate: fields.проверка_эффекта,
    effectDone,
  };
}

export function parseRules(text) {
  const rules = JSON.parse(text);
  for (const key of ["startStages", "doneStages", "doneChecks"]) {
    if (!Array.isArray(rules?.[key]) || !rules[key].length || rules[key].some(x => typeof x !== "string" || !x.trim())) {
      throw Error(`Проверьте ${key} в dashboard-rules.json`);
    }
  }
  return rules;
}

function haveAll(names, list, title) {
  return names.every(name => list.some(item => item.done && title(item) === name));
}

export function allowedItems(card, rules) {
  const first = card.stages.find(item => !item.done);
  const canCloseStage = first && (card.status === "done" || stageTitle(first) !== "Эффект зафиксирован");
  const canHandoff = rules ? haveAll(rules.doneStages, card.stages, stageTitle)
    : card.stages.some(item => item.done && stageTitle(item) === "Презентация проведена");
  return [
    ...(canCloseStage ? [first] : []),
    ...(canHandoff ? card.handoff.filter(item => !item.done) : []),
    ...card.checklist.filter(item => !item.done),
  ];
}

function setField(lines, key, value) {
  if (/[\r\n]/.test(value)) throw Error("Поле должно быть в одну строку");
  const end = lines.indexOf("---", 1);
  const index = lines.slice(1, end).findIndex(line => line.startsWith(`${key}:`));
  if (index >= 0) lines[index + 1] = `${key}: ${value}`;
  else if (value) lines.splice(end, 0, `${key}: ${value}`);
}

export function planCheck(raw, folder, line, options = {}) {
  const { rules, evidence = "", next, owner, effectDate, preview = false } = options;
  const card = parseCard(raw, folder);
  const item = allowedItems(card, rules).find(it => it.line === line);
  if (!item) throw Error("Этот пункт сейчас нельзя отметить. Откройте карточку заново.");
  const isStage = card.stages.includes(item);
  const isHandoff = card.handoff.includes(item);
  const requiresEvidence = isHandoff || !!(isStage && stageInfo(item).подтверждает);
  if (requiresEvidence && !evidence.trim() && !preview) throw Error("Укажите, чем подтверждено выполнение");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  lines[line] = lines[line].replace(CHECK, "$1[x]$3$4");
  if (evidence.trim()) {
    if (/[\r\n]/.test(evidence)) throw Error("Подтверждение должно быть в одну строку");
    lines[line] += ` · Подтверждение: ${evidence.trim()}`;
  }
  const checked = parseCard(lines.join(eol), folder);
  let status = card.status;
  if (rules && (isStage || isHandoff)) {
    if (status === "todo" && haveAll(rules.startStages, checked.stages, stageTitle)) status = "ongoing";
    if (status === "ongoing" && haveAll(rules.doneStages, checked.stages, stageTitle)
        && haveAll(rules.doneChecks, checked.handoff, taskTitle)) status = "done";
  }
  if (status !== card.status) setField(lines, "status", status);
  const future = parseCard(lines.join(eol), folder);
  const actionChanged = future.status !== card.status || future.stage !== card.stage || isHandoff;
  if (actionChanged) {
    let suggestion = future.stage;
    if (future.stage === "Передача результатов") suggestion = taskTitle(future.handoff.find(it => !it.done));
    if (future.status === "done" && !future.effectDone) suggestion = "Проверить эффект";
    setField(lines, "следующий_шаг", next ?? suggestion ?? "");
    const suggestedOwner = future.stageOwner || (future.stage === "Передача результатов"
      ? card.researcher || card.owner : undefined);
    setField(lines, "за_кем_шаг", owner ?? suggestedOwner ?? "");
  }
  const needsEffectDate = status === "done" && card.status !== "done" && !future.effectDone;
  if (needsEffectDate) {
    const date = effectDate ?? card.effectDate ?? "";
    if (!preview && !formatDate(date)) throw Error("Укажите дату проверки эффекта");
    if (date) setField(lines, "проверка_эффекта", date);
  }
  const text = lines.join(eol);
  return { text, card: parseCard(text, folder), requiresEvidence, actionChanged, needsEffectDate };
}

export async function readCards(root) {
  const projects = await root.getDirectoryHandle("projects");
  const cards = [];
  const issues = [];
  for await (const entry of projects.values()) {
    if (entry.kind !== "directory" || /^[_.]/.test(entry.name)) continue;
    try {
      const file = await entry.getFileHandle("README.md");
      cards.push(parseCard(await (await file.getFile()).text(), entry.name));
    } catch (error) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") throw error;
      const message = error.name === "NotFoundError" ? "Добавьте README.md" : error.message;
      issues.push(`projects/${entry.name}/README.md · ${message}`);
    }
  }
  cards.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return { cards, issues };
}

export function formatDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return "";
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}
