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
  for (const line of lines.slice(end + 1)) {
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
    const m = line.match(/^\s*(?:[-+*]|\d+\.)\s+\[([ xX])\]\s+(.+)/);
    if (m) section.push({ done: m[1] !== " ", text: m[2] });
  }

  const nextStage = stageInfo(stages.find(item => !item.done));
  const needsHandoff = status === "ongoing" && handoff.some(item => !item.done)
    && (!nextStage.title || nextStage.title === "Эффект зафиксирован");
  const stage = stages.length ? (needsHandoff ? "Передача результатов" : nextStage.title) : fields.стадия;
  const effectDone = stages.length
    ? stages.some(item => item.done && /^(?:\d+\.\s+)?Эффект зафиксирован(?:$|[\s.,;:—–-])/i.test(item.text))
    : fields.эффект === "зафиксирован";
  return {
    folder, status, stages, handoff, checklist,
    name: fields.имя || fields.name || folder,
    number: fields.rp || fields.номер,
    stage,
    stageOwner: needsHandoff ? undefined : nextStage.ответственный,
    stageApprover: needsHandoff ? undefined : nextStage.подтверждает,
    next: fields.следующий_шаг,
    owner: fields.за_кем_шаг,
    deadline: fields.дедлайн,
    reminder: fields.напомнить,
    reminderText: fields.напоминание,
    effectDate: fields.проверка_эффекта,
    effectDone,
  };
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

export function remindersFor(cards) {
  return cards.flatMap(card => {
    const dates = [[card.reminder, card.reminderText || "Напоминание по проекту"]];
    if (!card.effectDone) dates.push([card.effectDate, "Контроль эффекта"]);
    return dates.filter(([date]) => formatDate(date))
      .map(([date, text]) => ({ date, text, project: card.name }));
  }).sort((a, b) => a.date.localeCompare(b.date));
}
