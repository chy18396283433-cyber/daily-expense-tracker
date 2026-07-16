const EXPENSE_STORAGE_KEY = "daily-expense-tracker-records";
const NOTE_STORAGE_KEY = "personal-toolkit-quick-note";
const SYNC_CONFIG_KEY = "personal-toolkit-sync-config";
const DEFAULT_API_BASE = "https://docs.getnexa.asia/toolkit-api";

const routes = ["home", "expenses", "notes", "links", "settings"];
const navItems = document.querySelectorAll("[data-route]");
const views = Object.fromEntries(routes.map((route) => [route, document.querySelector(`#view-${route}`)]));

const form = document.querySelector("#expenseForm");
const dateInput = document.querySelector("#date");
const list = document.querySelector("#recordList");
const emptyState = document.querySelector("#emptyState");
const template = document.querySelector("#recordTemplate");
const quickNote = document.querySelector("#quickNote");
const noteCount = document.querySelector("#noteCount");
const apiBaseInput = document.querySelector("#apiBase");
const apiTokenInput = document.querySelector("#apiToken");
const paydayInput = document.querySelector("#payday");
const syncStatus = document.querySelector("#syncStatus");
const cycleTitle = document.querySelector("#cycleTitle");
const cycleRange = document.querySelector("#cycleRange");
const previousCycleButton = document.querySelector("#previousCycleButton");
const currentCycleButton = document.querySelector("#currentCycleButton");
const nextCycleButton = document.querySelector("#nextCycleButton");
const formModeLabel = document.querySelector("#formModeLabel");
const formTitle = document.querySelector("#formTitle");
const submitExpenseButton = document.querySelector("#submitExpenseButton");
const cancelEditButton = document.querySelector("#cancelEditButton");

const today = new Date();
dateInput.value = today.toISOString().slice(0, 10);

let records = JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || "[]");
let syncConfig = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || "{}");
let cloudReady = false;
let noteTimer = null;
let selectedCycleOffset = 0;
let editingRecordId = null;

quickNote.value = localStorage.getItem(NOTE_STORAGE_KEY) || "";
apiBaseInput.value = syncConfig.apiBase || DEFAULT_API_BASE;
apiTokenInput.value = syncConfig.token || "";
paydayInput.value = syncConfig.payday || 15;

const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
const formatDate = (date) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));
const hasCloudConfig = () => Boolean(syncConfig.apiBase && syncConfig.token);

function saveExpenses() {
  localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(records));
}

function saveSyncConfig() {
  const payday = Math.min(31, Math.max(1, Number(paydayInput.value) || 15));
  paydayInput.value = payday;
  syncConfig = {
    apiBase: apiBaseInput.value.trim().replace(/\/+$/, "") || DEFAULT_API_BASE,
    token: apiTokenInput.value.trim(),
    payday,
  };
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setSyncStatus(message, isError = false) {
  syncStatus.textContent = message;
  syncStatus.classList.toggle("error", isError);
}

function setFormMode(record = null) {
  editingRecordId = record ? record.id : null;
  formModeLabel.textContent = record ? "EDIT RECORD" : "NEW RECORD";
  formTitle.textContent = record ? "编辑花销" : "记一笔";
  submitExpenseButton.textContent = record ? "保存修改" : "保存这笔花销";
  cancelEditButton.hidden = !record;
}

function resetExpenseForm() {
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  setFormMode(null);
}

function fillExpenseForm(record) {
  form.amount.value = record.amount;
  form.category.value = record.category;
  form.date.value = record.date;
  form.note.value = record.note || "";
  setFormMode(record);
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function apiRequest(path, options = {}) {
  if (!hasCloudConfig()) throw new Error("还没有配置云同步令牌");
  const response = await fetch(`${syncConfig.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Toolkit-Token": syncConfig.token,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "云同步请求失败");
  return data;
}

async function loadCloudData() {
  if (!hasCloudConfig()) {
    cloudReady = false;
    setSyncStatus("当前使用本地浏览器保存。");
    return;
  }

  try {
    const [expenseData, noteData] = await Promise.all([apiRequest("/expenses"), apiRequest("/note")]);
    records = expenseData.records || [];
    quickNote.value = noteData.note || "";
    saveExpenses();
    localStorage.setItem(NOTE_STORAGE_KEY, quickNote.value);
    cloudReady = true;
    setSyncStatus("云同步已连接，数据会保存到服务器 SQLite。");
    renderAll();
  } catch (error) {
    cloudReady = false;
    setSyncStatus(`云同步连接失败：${error.message}`, true);
    renderAll();
  }
}

async function saveCloudNoteSoon() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => {
    if (!cloudReady) return;
    try {
      await apiRequest("/note", { method: "PUT", body: JSON.stringify({ note: quickNote.value }) });
      setSyncStatus("便签已同步到云端。");
    } catch (error) {
      setSyncStatus(`便签同步失败：${error.message}`, true);
    }
  }, 450);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function makeCycleDate(year, monthIndex, payday) {
  return new Date(year, monthIndex, Math.min(payday, daysInMonth(year, monthIndex)), 12);
}

function addMonths(date, count) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1, 12);
}

function currentPayCycle(offset = 0) {
  const payday = Math.min(31, Math.max(1, Number(syncConfig.payday) || 15));
  const now = new Date();
  const thisCycleStart = makeCycleDate(now.getFullYear(), now.getMonth(), payday);
  const baseStart = now >= thisCycleStart
    ? thisCycleStart
    : makeCycleDate(addMonths(now, -1).getFullYear(), addMonths(now, -1).getMonth(), payday);
  const startMonth = addMonths(baseStart, offset);
  const start = makeCycleDate(startMonth.getFullYear(), startMonth.getMonth(), payday);
  const nextMonth = addMonths(start, 1);
  const nextStart = makeCycleDate(nextMonth.getFullYear(), nextMonth.getMonth(), payday);
  const displayEnd = new Date(nextStart);
  displayEnd.setDate(displayEnd.getDate() - 1);
  return { start: dateKey(start), end: dateKey(nextStart), displayEnd: dateKey(displayEnd), payday, offset };
}

function cycleStats(offset = selectedCycleOffset) {
  const cycle = currentPayCycle(offset);
  const cycleRecords = records.filter((item) => item.date >= cycle.start && item.date < cycle.end);
  const total = cycleRecords.reduce((sum, item) => sum + item.amount, 0);
  return { ...cycle, records: cycleRecords, total, count: cycleRecords.length };
}

function cycleLabel(offset) {
  if (offset === 0) return "当前账期";
  if (offset === -1) return "上个账期";
  return `${Math.abs(offset)} 个账期前`;
}

function renderCycleControls() {
  nextCycleButton.disabled = selectedCycleOffset >= 0;
  previousCycleButton.disabled = selectedCycleOffset <= -24;
}

function renderSummary() {
  const todayKey = dateKey(new Date());
  const todayRecords = records.filter((item) => item.date === todayKey);
  const cycle = cycleStats();
  const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

  setText("#todayTotal", money(sum(todayRecords)));
  setText("#todayCount", todayRecords.length ? `共 ${todayRecords.length} 笔支出` : "今天还没有记录");
  setText("#cycleTotal", money(cycle.total));
  setText("#cycleCount", `${cycle.count} 笔支出 · ${cycle.start} 至 ${cycle.displayEnd}`);
  setText("#homeCycleTotal", money(cycleStats(0).total));
  setText("#homeCycleCount", `${cycleStats(0).count} 笔 · 发薪日 ${cycle.payday} 号`);
  cycleTitle.textContent = cycleLabel(cycle.offset);
  cycleRange.textContent = `${cycle.start} 至 ${cycle.displayEnd}`;

  const categories = cycle.records.reduce((map, item) => ({ ...map, [item.category]: (map[item.category] || 0) + item.amount }), {});
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

  setText("#topCategory", top ? top[0] : "暂无");
  setText("#topCategoryAmount", top ? money(top[1]) : "本期添加记录后显示");
}

function renderExpenses() {
  list.innerHTML = "";
  const cycle = cycleStats();
  const ordered = [...cycle.records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  emptyState.hidden = ordered.length !== 0;

  ordered.forEach((record) => {
    const node = template.content.cloneNode(true);
    const categoryLabel = { 餐饮: "食", 交通: "行", 购物: "购", 娱乐: "乐", 居住: "住", 其他: "其" }[record.category] || "其";

    node.querySelector(".category-icon").textContent = categoryLabel;
    node.querySelector(".record-category").textContent = record.category;
    node.querySelector(".record-note").textContent = record.note || "未填写备注";
    node.querySelector(".record-amount").textContent = `-${money(record.amount)}`;
    node.querySelector(".record-date").textContent = formatDate(record.date);
    node.querySelector(".edit-button").addEventListener("click", () => fillExpenseForm(record));
    node.querySelector(".delete-button").addEventListener("click", async () => {
      const previous = records;
      records = records.filter((item) => item.id !== record.id);
      if (editingRecordId === record.id) resetExpenseForm();
      saveExpenses();
      renderAll();
      if (!cloudReady) return;
      try {
        await apiRequest(`/expenses/${encodeURIComponent(record.id)}`, { method: "DELETE" });
        setSyncStatus("记录已从云端删除。");
      } catch (error) {
        records = previous;
        saveExpenses();
        renderAll();
        setSyncStatus(`删除失败：${error.message}`, true);
      }
    });
    list.append(node);
  });
}

function renderNote() {
  const length = quickNote.value.trim().length;
  noteCount.textContent = `${length} 字`;
  setText("#homeNoteState", length ? "已保存" : "空");
}

function renderAll() {
  renderCycleControls();
  renderExpenses();
  renderSummary();
  renderNote();
}

function goTo(route) {
  const nextRoute = routes.includes(route) ? route : "home";
  Object.entries(views).forEach(([name, view]) => view.classList.toggle("active", name === nextRoute));
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.route === nextRoute));
  if (location.hash.slice(1) !== nextRoute) location.hash = nextRoute;
}

navItems.forEach((item) => {
  item.addEventListener("click", (event) => {
    const route = item.dataset.route;
    if (!route) return;
    event.preventDefault();
    goTo(route);
  });
});

window.addEventListener("hashchange", () => goTo(location.hash.slice(1)));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amount = Number(data.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("请输入大于 0 的金额");
    return;
  }

  const existing = editingRecordId ? records.find((item) => item.id === editingRecordId) : null;
  const record = {
    id: existing?.id || crypto.randomUUID(),
    amount,
    category: data.get("category"),
    date: data.get("date"),
    note: data.get("note").trim(),
    createdAt: existing?.createdAt || Date.now(),
  };

  const previous = records;
  records = existing
    ? records.map((item) => item.id === record.id ? record : item)
    : [...records, record];
  saveExpenses();
  resetExpenseForm();
  renderAll();

  if (!cloudReady) return;
  try {
    await apiRequest("/expenses", { method: "POST", body: JSON.stringify(record) });
    setSyncStatus(existing ? "花销记录已更新到云端。" : "花销记录已同步到云端。");
  } catch (error) {
    records = previous;
    saveExpenses();
    renderAll();
    setSyncStatus(`${existing ? "更新" : "记录同步"}失败：${error.message}`, true);
  }
});

quickNote.addEventListener("input", () => {
  localStorage.setItem(NOTE_STORAGE_KEY, quickNote.value);
  renderNote();
  saveCloudNoteSoon();
});

document.querySelector("#clearButton").addEventListener("click", async () => {
  if (!records.length || !confirm("确定清空所有花销记录吗？")) return;
  const previous = records;
  records = [];
  saveExpenses();
  renderAll();
  if (!cloudReady) return;
  try {
    await apiRequest("/expenses", { method: "DELETE" });
    setSyncStatus("云端花销记录已清空。");
  } catch (error) {
    records = previous;
    saveExpenses();
    renderAll();
    setSyncStatus(`清空失败：${error.message}`, true);
  }
});

document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "daily-expenses.json" });
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#copyNoteButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(quickNote.value);
  } catch {
    quickNote.select();
    document.execCommand("copy");
  }
});

document.querySelector("#clearNoteButton").addEventListener("click", async () => {
  quickNote.value = "";
  localStorage.removeItem(NOTE_STORAGE_KEY);
  renderNote();
  if (!cloudReady) return;
  try {
    await apiRequest("/note", { method: "PUT", body: JSON.stringify({ note: "" }) });
    setSyncStatus("云端便签已清空。");
  } catch (error) {
    setSyncStatus(`清空便签失败：${error.message}`, true);
  }
});

document.querySelector("#saveSyncButton").addEventListener("click", async () => {
  saveSyncConfig();
  renderAll();
  await loadCloudData();
});

document.querySelector("#testSyncButton").addEventListener("click", async () => {
  saveSyncConfig();
  try {
    await apiRequest("/health");
    cloudReady = true;
    setSyncStatus("连接成功，可以使用云同步。");
  } catch (error) {
    cloudReady = false;
    setSyncStatus(`连接失败：${error.message}`, true);
  }
});

document.querySelector("#uploadLocalButton").addEventListener("click", async () => {
  saveSyncConfig();
  try {
    await apiRequest("/import", { method: "POST", body: JSON.stringify({ records, note: quickNote.value }) });
    cloudReady = true;
    setSyncStatus("本地数据已上传到云端。");
    await loadCloudData();
  } catch (error) {
    setSyncStatus(`上传失败：${error.message}`, true);
  }
});

renderAll();
goTo(location.hash.slice(1) || "home");
loadCloudData();

paydayInput.addEventListener("change", () => {
  selectedCycleOffset = 0;
  saveSyncConfig();
  renderAll();
});

cancelEditButton.addEventListener("click", resetExpenseForm);

previousCycleButton.addEventListener("click", () => {
  selectedCycleOffset -= 1;
  renderAll();
});

currentCycleButton.addEventListener("click", () => {
  selectedCycleOffset = 0;
  renderAll();
});

nextCycleButton.addEventListener("click", () => {
  selectedCycleOffset = Math.min(0, selectedCycleOffset + 1);
  renderAll();
});
