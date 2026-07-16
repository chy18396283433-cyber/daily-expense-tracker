const EXPENSE_STORAGE_KEY = "daily-expense-tracker-records";
const NOTE_STORAGE_KEY = "personal-toolkit-quick-note";

const routes = ["home", "expenses", "notes", "links"];
const navItems = document.querySelectorAll("[data-route]");
const views = Object.fromEntries(routes.map((route) => [route, document.querySelector(`#view-${route}`)]));

const form = document.querySelector("#expenseForm");
const dateInput = document.querySelector("#date");
const list = document.querySelector("#recordList");
const emptyState = document.querySelector("#emptyState");
const template = document.querySelector("#recordTemplate");
const quickNote = document.querySelector("#quickNote");
const noteCount = document.querySelector("#noteCount");

const today = new Date();
dateInput.value = today.toISOString().slice(0, 10);

let records = JSON.parse(localStorage.getItem(EXPENSE_STORAGE_KEY) || "[]");
quickNote.value = localStorage.getItem(NOTE_STORAGE_KEY) || "";

const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
const formatDate = (date) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));

function saveExpenses() {
  localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(records));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
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
    node.querySelector(".delete-button").addEventListener("click", () => {
      records = records.filter((item) => item.id !== record.id);
      saveExpenses();
      renderAll();
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

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amount = Number(data.get("amount"));

  if (!Number.isFinite(amount) || amount <= 0) {
    alert("请输入大于 0 的金额");
    return;
  }

  records.push({
    id: crypto.randomUUID(),
    amount,
    category: data.get("category"),
    date: data.get("date"),
    note: data.get("note").trim(),
    createdAt: Date.now(),
  });
  saveExpenses();
  form.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  renderAll();
});

quickNote.addEventListener("input", () => {
  localStorage.setItem(NOTE_STORAGE_KEY, quickNote.value);
  renderNote();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  if (records.length && confirm("确定清空所有花销记录吗？")) {
    records = [];
    saveExpenses();
    renderAll();
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

document.querySelector("#clearNoteButton").addEventListener("click", () => {
  quickNote.value = "";
  localStorage.removeItem(NOTE_STORAGE_KEY);
  renderNote();
});

renderAll();
goTo(location.hash.slice(1) || "home");
