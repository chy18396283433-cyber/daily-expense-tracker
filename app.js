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
const syncStatus = document.querySelector("#syncStatus");

const today = new Date();
dateInput.value = today.toISOString().slice(0, 10);

let records = JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || "[]");
let syncConfig = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || "{}");
let cloudReady = false;
let noteTimer = null;

quickNote.value = localStorage.getItem(NOTE_STORAGE_KEY) || "";
apiBaseInput.value = syncConfig.apiBase || DEFAULT_API_BASE;
apiTokenInput.value = syncConfig.token || "";

const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
const formatDate = (date) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));
const hasCloudConfig = () => Boolean(syncConfig.apiBase && syncConfig.token);

function saveExpenses() {
  localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(records));
}

function saveSyncConfig() {
  syncConfig = {
    apiBase: apiBaseInput.value.trim().replace(/\/+$/, "") || DEFAULT_API_BASE,
    token: apiTokenInput.value.trim(),
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

function currentMonthStats() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const monthRecords = records.filter((item) => item.date.startsWith(monthKey));
  const total = monthRecords.reduce((sum, item) => sum + item.amount, 0);
  return { total, count: monthRecords.length };
}

function renderSummary() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter((item) => item.date === todayKey);
  const month = currentMonthStats();
  const sum = (items) => items.reduce((total, item) => total + item.amount, 0);

  setText("#todayTotal", money(sum(todayRecords)));
  setText("#todayCount", todayRecords.length ? `共 ${todayRecords.length} 笔支出` : "今天还没有记录");
  setText("#monthTotal", money(month.total));
  setText("#monthCount", `${month.count} 笔支出`);
  setText("#homeMonthTotal", money(month.total));
  setText("#homeMonthCount", `${month.count} 笔支出`);

  const monthKey = todayKey.slice(0, 7);
  const monthRecords = records.filter((item) => item.date.startsWith(monthKey));
  const categories = monthRecords.reduce((map, item) => ({ ...map, [item.category]: (map[item.category] || 0) + item.amount }), {});
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

  setText("#topCategory", top ? top[0] : "暂无");
  setText("#topCategoryAmount", top ? money(top[1]) : "添加记录后显示");
}

function renderExpenses() {
  list.innerHTML = "";
  const ordered = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  emptyState.hidden = ordered.length !== 0;

  ordered.forEach((record) => {
    const node = template.content.cloneNode(true);
    const categoryLabel = { 餐饮: "食", 交通: "行", 购物: "购", 娱乐: "乐", 居住: "住", 其他: "其" }[record.category] || "其";

    node.querySelector(".category-icon").textContent = categoryLabel;
    node.querySelector(".record-category").textContent = record.category;
    node.querySelector(".record-note").textContent = record.note || "未填写备注";
    node.querySelector(".record-amount").textContent = `-${money(record.amount)}`;
    node.querySelector(".record-date").textContent = formatDate(record.date);
    node.querySelector(".delete-button").addEventListener("click", async () => {
      const previous = records;
      records = records.filter((item) => item.id !== record.id);
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

  const record = {
    id: crypto.randomUUID(),
    amount,
    category: data.get("category"),
    date: data.get("date"),
    note: data.get("note").trim(),
    createdAt: Date.now(),
  };

  records.push(record);
  saveExpenses();
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  renderAll();

  if (!cloudReady) return;
  try {
    await apiRequest("/expenses", { method: "POST", body: JSON.stringify(record) });
    setSyncStatus("花销记录已同步到云端。");
  } catch (error) {
    setSyncStatus(`记录同步失败：${error.message}`, true);
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
