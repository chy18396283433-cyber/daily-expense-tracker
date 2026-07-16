const STORAGE_KEY = "daily-expense-tracker-records";
const form = document.querySelector("#expenseForm");
const dateInput = document.querySelector("#date");
const list = document.querySelector("#recordList");
const emptyState = document.querySelector("#emptyState");
const template = document.querySelector("#recordTemplate");

const today = new Date();
dateInput.value = today.toISOString().slice(0, 10);
let records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
const money = (value) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(value);
const formatDate = (date) => new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00`));

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
function renderSummary() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const todayRecords = records.filter((item) => item.date === todayKey);
  const monthRecords = records.filter((item) => item.date.startsWith(monthKey));
  const sum = (items) => items.reduce((total, item) => total + item.amount, 0);
  document.querySelector("#todayTotal").textContent = money(sum(todayRecords));
  document.querySelector("#todayCount").textContent = todayRecords.length ? `共 ${todayRecords.length} 笔支出` : "今天还没有记录";
  document.querySelector("#monthTotal").textContent = money(sum(monthRecords));
  document.querySelector("#monthCount").textContent = `${monthRecords.length} 笔支出`;
  const categories = monthRecords.reduce((map, item) => ({ ...map, [item.category]: (map[item.category] || 0) + item.amount }), {});
  const top = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  document.querySelector("#topCategory").textContent = top ? top[0] : "暂无";
  document.querySelector("#topCategoryAmount").textContent = top ? money(top[1]) : "添加记录后显示";
}
function render() {
  list.innerHTML = "";
  const ordered = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  emptyState.hidden = ordered.length !== 0;
  ordered.forEach((record) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".category-icon").textContent = { 餐饮:"🍜", 交通:"🚇", 购物:"🛍️", 娱乐:"🎮", 居住:"🏠", 其他:"✦" }[record.category] || "✦";
    node.querySelector(".record-category").textContent = record.category;
    node.querySelector(".record-note").textContent = record.note || "未填写备注";
    node.querySelector(".record-amount").textContent = `-${money(record.amount)}`;
    node.querySelector(".record-date").textContent = formatDate(record.date);
    node.querySelector(".delete-button").addEventListener("click", () => { records = records.filter((item) => item.id !== record.id); save(); render(); });
    list.append(node);
  });
  renderSummary();
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form); const amount = Number(data.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return alert("请输入大于 0 的金额");
  records.push({ id: crypto.randomUUID(), amount, category: data.get("category"), date: data.get("date"), note: data.get("note").trim(), createdAt: Date.now() });
  save(); form.reset(); dateInput.value = new Date().toISOString().slice(0, 10); render();
});
document.querySelector("#clearButton").addEventListener("click", () => { if (records.length && confirm("确定清空所有花销记录吗？")) { records = []; save(); render(); } });
document.querySelector("#exportButton").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "daily-expenses.json" }); link.click(); URL.revokeObjectURL(link.href);
});
render();
