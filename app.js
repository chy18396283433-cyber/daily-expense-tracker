const EXPENSE_STORAGE_KEY = "daily-expense-tracker-records";
const NOTE_STORAGE_KEY = "personal-toolkit-quick-note";
const SYNC_CONFIG_KEY = "personal-toolkit-sync-config";
const DEFAULT_API_BASE = "https://docs.getnexa.asia/toolkit-api";

const routes = ["home", "expenses", "notes", "dates", "text", "links", "settings"];
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
const recordSearch = document.querySelector("#recordSearch");
const recordCategoryFilter = document.querySelector("#recordCategoryFilter");
const recordCount = document.querySelector("#recordCount");
const loadMoreRecordsButton = document.querySelector("#loadMoreRecordsButton");
const formModeLabel = document.querySelector("#formModeLabel");
const formTitle = document.querySelector("#formTitle");
const submitExpenseButton = document.querySelector("#submitExpenseButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const dateStartInput = document.querySelector("#dateStart");
const dateEndInput = document.querySelector("#dateEnd");
const dateAddBaseInput = document.querySelector("#dateAddBase");
const dateAddDaysInput = document.querySelector("#dateAddDays");
const dateDiffResult = document.querySelector("#dateDiffResult");
const dateAddResult = document.querySelector("#dateAddResult");
const textInput = document.querySelector("#textInput");
const textStats = document.querySelector("#textStats");
const analysisRange = document.querySelector("#analysisRange");
const analysisDailyAverage = document.querySelector("#analysisDailyAverage");
const analysisLargest = document.querySelector("#analysisLargest");
const analysisActiveDays = document.querySelector("#analysisActiveDays");
const analysisProjection = document.querySelector("#analysisProjection");
const categoryAnalysisList = document.querySelector("#categoryAnalysisList");
const weeklyAnalysisList = document.querySelector("#weeklyAnalysisList");
const analysisInsight = document.querySelector("#analysisInsight");

const today = new Date();
const todayKey = today.toISOString().slice(0, 10);
dateInput.value = todayKey;
dateStartInput.value = todayKey;
dateEndInput.value = todayKey;
dateAddBaseInput.value = todayKey;

let records = JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || "[]");
let syncConfig = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || "{}");
let cloudReady = false;
let noteTimer = null;
let selectedCycleOffset = 0;
let editingRecordId = null;
let visibleRecordLimit = 10;

quickNote.value = localStorage.getItem(NOTE_STORAGE_KEY) || "";
apiBaseInput.value = syncConfig.apiBase || DEFAULT_API_BASE;
apiTokenInput.value = syncConfig.token || "";
paydayInput.value = syncConfig.payday || 15;

const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
const parseDate = (value) => new Date(`${value}T12:00:00`);
const formatDate = (date) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(parseDate(date));
const formatFullDate = (date) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date);
const formatShortDate = (date) => new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
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

function filteredCycleRecords() {
  const cycle = cycleStats();
  const keyword = recordSearch.value.trim().toLowerCase();
  const category = recordCategoryFilter.value;
  return cycle.records.filter((record) => {
    const matchesCategory = !category || record.category === category;
    const text = `${record.category} ${record.note || ""} ${record.date}`.toLowerCase();
    return matchesCategory && (!keyword || text.includes(keyword));
  });
}

function daysBetween(start, end) {
  return Math.max(1, Math.round((parseDate(end) - parseDate(start)) / 86400000));
}

function renderEmptyAnalysis(message) {
  categoryAnalysisList.innerHTML = `<p class="analysis-empty">${message}</p>`;
  weeklyAnalysisList.innerHTML = `<p class="analysis-empty">${message}</p>`;
  analysisInsight.textContent = message;
}

function renderAnalysis() {
  const cycle = cycleStats();
  const totalDays = daysBetween(cycle.start, cycle.end);
  const today = dateKey(new Date());
  const elapsedEnd = cycle.offset === 0 ? (today < cycle.end ? today : cycle.displayEnd) : cycle.displayEnd;
  const elapsedDays = cycle.offset === 0 ? daysBetween(cycle.start, dateKey(new Date(parseDate(elapsedEnd).getTime() + 86400000))) : totalDays;
  const activeDays = new Set(cycle.records.map((record) => record.date)).size;
  const largest = cycle.records.reduce((max, record) => record.amount > max.amount ? record : max, { amount: 0, category: "暂无" });
  const dailyAverage = cycle.total / Math.max(1, elapsedDays);
  const projected = cycle.offset === 0 ? dailyAverage * totalDays : cycle.total;

  analysisRange.textContent = `${cycle.start} 至 ${cycle.displayEnd}`;
  analysisDailyAverage.textContent = money(dailyAverage);
  analysisLargest.textContent = largest.amount ? money(largest.amount) : money(0);
  analysisActiveDays.textContent = `${activeDays} 天`;
  analysisProjection.textContent = money(projected);

  if (!cycle.records.length) {
    renderEmptyAnalysis("这个账期还没有记录，添加几笔后会显示分析。");
    return;
  }

  const categoryTotals = cycle.records.reduce((map, record) => {
    map[record.category] = (map[record.category] || 0) + record.amount;
    return map;
  }, {});
  const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
  categoryAnalysisList.innerHTML = "";
  sortedCategories.forEach(([category, amount]) => {
    const row = document.createElement("div");
    const head = document.createElement("div");
    const name = document.createElement("strong");
    const value = document.createElement("span");
    const bar = document.createElement("div");
    const fill = document.createElement("span");
    const percent = cycle.total ? Math.round((amount / cycle.total) * 100) : 0;

    row.className = "analysis-row";
    head.className = "analysis-row-head";
    bar.className = "analysis-bar";
    name.textContent = category;
    value.textContent = `${money(amount)} · ${percent}%`;
    fill.style.width = `${Math.max(4, percent)}%`;

    head.append(name, value);
    bar.append(fill);
    row.append(head, bar);
    categoryAnalysisList.append(row);
  });

  const trendEnd = parseDate(cycle.offset === 0 ? (today < cycle.end ? today : cycle.displayEnd) : cycle.displayEnd);
  const dayTotals = cycle.records.reduce((map, record) => {
    map[record.date] = (map[record.date] || 0) + record.amount;
    return map;
  }, {});
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(trendEnd);
    date.setDate(date.getDate() - (6 - index));
    const key = dateKey(date);
    return { key, label: formatShortDate(date), amount: dayTotals[key] || 0 };
  });
  const maxDayAmount = Math.max(...days.map((day) => day.amount), 1);
  weeklyAnalysisList.innerHTML = "";
  days.forEach((day) => {
    const item = document.createElement("div");
    item.className = "weekly-bar-item";
    item.innerHTML = `
      <span class="weekly-amount">${day.amount ? money(day.amount) : "-"}</span>
      <div class="weekly-track"><span style="height: ${Math.max(6, (day.amount / maxDayAmount) * 100)}%"></span></div>
      <span class="weekly-label">${day.label}</span>
    `;
    weeklyAnalysisList.append(item);
  });

  const topCategory = sortedCategories[0];
  const topPercent = Math.round((topCategory[1] / cycle.total) * 100);
  const largestText = largest.amount ? `最高单笔是 ${largest.category} ${money(largest.amount)}。` : "";
  analysisInsight.textContent = `${cycleLabel(cycle.offset)}共 ${cycle.count} 笔，${activeDays} 天有支出；${topCategory[0]}占比最高，为 ${topPercent}%。${largestText}`;
}

function renderExpenses() {
  list.innerHTML = "";
  const ordered = filteredCycleRecords().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const visible = ordered.slice(0, visibleRecordLimit);
  recordCount.textContent = `${ordered.length} 条`;
  emptyState.hidden = ordered.length !== 0;
  loadMoreRecordsButton.hidden = ordered.length <= visibleRecordLimit;
  loadMoreRecordsButton.textContent = `加载更多（还剩 ${Math.max(0, ordered.length - visibleRecordLimit)} 条）`;

  visible.forEach((record) => {
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

function renderDateTools() {
  if (dateStartInput.value && dateEndInput.value) {
    const start = parseDate(dateStartInput.value);
    const end = parseDate(dateEndInput.value);
    const diff = Math.round((end - start) / 86400000);
    const direction = diff > 0 ? "后" : diff < 0 ? "前" : "";
    dateDiffResult.textContent = `${Math.abs(diff)} 天${direction ? ` ${direction}` : ""}`;
  } else {
    dateDiffResult.textContent = "请选择日期";
  }

  if (dateAddBaseInput.value) {
    const result = parseDate(dateAddBaseInput.value);
    result.setDate(result.getDate() + (Number(dateAddDaysInput.value) || 0));
    dateAddResult.textContent = formatFullDate(result);
  } else {
    dateAddResult.textContent = "请选择日期";
  }
}

function renderTextStats() {
  const text = textInput.value;
  const lines = text ? text.split(/\r\n|\r|\n/).length : 0;
  const nonSpace = text.replace(/\s/g, "").length;
  const words = (text.match(/[A-Za-z0-9_]+|[\u4e00-\u9fa5]/g) || []).length;
  textStats.textContent = `${text.length} 字符 · ${nonSpace} 非空白 · ${lines} 行 · ${words} 词/字`;
}

function renderAll() {
  renderCycleControls();
  renderExpenses();
  renderSummary();
  renderAnalysis();
  renderNote();
  renderDateTools();
  renderTextStats();
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

[dateStartInput, dateEndInput, dateAddBaseInput, dateAddDaysInput].forEach((input) => {
  input.addEventListener("input", renderDateTools);
});

textInput.addEventListener("input", renderTextStats);

document.querySelector("#trimTextButton").addEventListener("click", () => {
  textInput.value = textInput.value.split(/\r?\n/).map((line) => line.trim()).join("\n").trim();
  renderTextStats();
});

document.querySelector("#removeBlankLinesButton").addEventListener("click", () => {
  textInput.value = textInput.value.split(/\r?\n/).filter((line) => line.trim()).join("\n");
  renderTextStats();
});

document.querySelector("#copyTextButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText(textInput.value);
});

document.querySelector("#clearTextButton").addEventListener("click", () => {
  textInput.value = "";
  renderTextStats();
});

renderAll();
goTo(location.hash.slice(1) || "home");
loadCloudData();

paydayInput.addEventListener("change", () => {
  selectedCycleOffset = 0;
  visibleRecordLimit = 10;
  saveSyncConfig();
  renderAll();
});

cancelEditButton.addEventListener("click", resetExpenseForm);

recordSearch.addEventListener("input", () => {
  visibleRecordLimit = 10;
  renderExpenses();
});

recordCategoryFilter.addEventListener("change", () => {
  visibleRecordLimit = 10;
  renderExpenses();
});

loadMoreRecordsButton.addEventListener("click", () => {
  visibleRecordLimit += 10;
  renderExpenses();
});

previousCycleButton.addEventListener("click", () => {
  selectedCycleOffset -= 1;
  visibleRecordLimit = 10;
  renderAll();
});

currentCycleButton.addEventListener("click", () => {
  selectedCycleOffset = 0;
  visibleRecordLimit = 10;
  renderAll();
});

nextCycleButton.addEventListener("click", () => {
  selectedCycleOffset = Math.min(0, selectedCycleOffset + 1);
  visibleRecordLimit = 10;
  renderAll();
});
