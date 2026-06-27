const analysis = window.CAPACITY_ANALYSIS;

const numberFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
const percentFormatter = new Intl.NumberFormat("th-TH", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

const statusThai = {
  "Over capacity": "เกินกำลัง",
  "High load": "โหลดสูง",
  "Normal": "ปกติ",
  "Low load": "โหลดต่ำ"
};

function text(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return numberFormatter.format(Number(value));
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return decimalFormatter.format(Number(value));
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return percentFormatter.format(Number(value));
}

function append(parent, tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) element.textContent = value;
  parent.appendChild(element);
  return element;
}

function renderKpis() {
  const overview = analysis.overview;
  const kpis = [
    ["Demand รวม/เดือน", formatNumber(overview.totalDemand), "ชิ้น/เดือน", "ok"],
    ["Capacity รวม/เดือน", formatNumber(overview.totalMonthlyCapacity), "ชิ้น/เดือน", "ok"],
    ["Required shifts", formatDecimal(overview.totalRequiredShifts), `${formatDecimal(overview.totalAvailableShifts)} shifts ที่มี`, "warning"],
    ["Utilization รวม", formatPercent(overview.totalUtilization), "เทียบ available shifts", "danger"],
    ["เครื่องเกินกำลัง", formatNumber(overview.overCapacity), "เครื่อง", "danger"],
    ["เครื่องที่ควรเพิ่ม", formatDecimal(overview.machineGap), "เครื่องโดยประมาณ", "warning"]
  ];

  const kpiGrid = document.querySelector("#kpiGrid");
  kpiGrid.replaceChildren();
  kpis.forEach(([label, value, unit, tone]) => {
    const card = append(kpiGrid, "article", `kpi-card ${tone}`);
    append(card, "p", "", label);
    append(card, "strong", "", value);
    append(card, "span", "", unit);
  });
}

function renderSummary() {
  const overview = analysis.overview;
  document.querySelector("#downloadReport").href = analysis.workbookFile;
  document.querySelector("#sourceSummary").textContent = `${analysis.sourceFile} | ${analysis.basis.hoursPerDay} ชั่วโมง/วัน, ${analysis.basis.workingDaysPerMonth} วัน/เดือน`;
  document.querySelector("#executiveSummary").textContent =
    `วิเคราะห์ ${formatNumber(overview.recordCount)} รายการผลิตใน ${formatNumber(overview.machineCount)} เครื่อง/section ` +
    `พบว่า demand รวม ${formatNumber(overview.totalDemand)} ชิ้น/เดือน ต้องใช้ ${formatDecimal(overview.totalRequiredShifts)} shifts ` +
    `จากกำลังที่มี ${formatDecimal(overview.totalAvailableShifts)} shifts โดยจุดคอขวดหลักคือ ${text(overview.topMachine.machine)} ` +
    `ที่ utilization ${formatPercent(overview.topMachine.utilization)}.`;

  const statusGrid = document.querySelector("#statusGrid");
  statusGrid.replaceChildren();
  analysis.statusCounts.forEach((item) => {
    const card = append(statusGrid, "article", `status-card ${item.className}`);
    append(card, "span", "", statusThai[item.label] || item.label);
    append(card, "strong", "", formatNumber(item.count));
  });
}

function renderUtilizationChart() {
  const chart = document.querySelector("#utilizationChart");
  chart.replaceChildren();
  const rows = analysis.machines.slice(0, 12);
  const maxUtilization = Math.max(...rows.map((item) => item.utilization), 1);

  rows.forEach((item) => {
    const row = append(chart, "div", "bar-row");
    append(row, "div", "bar-label", item.machine);
    const track = append(row, "div", "track");
    const fill = append(track, "div", `fill ${item.statusClass}`);
    fill.style.width = `${Math.max(2, (item.utilization / maxUtilization) * 100)}%`;
    append(row, "div", "bar-value", formatPercent(item.utilization));
  });
}

function renderShiftChart() {
  const chart = document.querySelector("#shiftChart");
  chart.replaceChildren();
  const rows = analysis.machines.slice(0, 12);
  const maxShift = Math.max(...rows.flatMap((item) => [item.requiredShifts, item.availableShifts]), 1);

  rows.forEach((item) => {
    const row = append(chart, "div", "shift-row");
    append(row, "div", "bar-label", item.machine);
    const requiredTrack = append(row, "div", "track");
    const requiredFill = append(requiredTrack, "div", "fill required");
    requiredFill.style.width = `${Math.max(2, (item.requiredShifts / maxShift) * 100)}%`;
    requiredTrack.title = `Required ${formatDecimal(item.requiredShifts)} shifts`;
    const availableTrack = append(row, "div", "track");
    const availableFill = append(availableTrack, "div", "fill available");
    availableFill.style.width = `${Math.max(2, (item.availableShifts / maxShift) * 100)}%`;
    availableTrack.title = `Available ${formatDecimal(item.availableShifts)} shifts`;
  });
}

function renderMachineTable() {
  const tbody = document.querySelector("#machineTable");
  tbody.replaceChildren();
  analysis.machines.forEach((item) => {
    const row = document.createElement("tr");
    [
      item.rank,
      item.machine,
      item.productCount,
      formatNumber(item.monthlyDemand),
      formatNumber(item.monthlyCapacity26d),
      formatDecimal(item.requiredShifts),
      formatDecimal(item.availableShifts),
      formatPercent(item.utilization),
      formatDecimal(item.machineGap)
    ].forEach((value) => append(row, "td", "", text(value)));
    const statusCell = append(row, "td");
    append(statusCell, "span", `status-pill ${item.statusClass}`, statusThai[item.status] || item.status);
    tbody.appendChild(row);
  });
}

function renderProductTable() {
  const tbody = document.querySelector("#productTable");
  tbody.replaceChildren();
  analysis.topProducts.forEach((item) => {
    const row = document.createElement("tr");
    [
      item.rank,
      item.machine,
      item.productName,
      item.productSpec,
      formatNumber(item.monthlyForecast),
      formatDecimal(item.requiredShifts),
      formatPercent(item.utilization)
    ].forEach((value) => append(row, "td", "", text(value)));
    tbody.appendChild(row);
  });
}

if (!analysis) {
  document.body.textContent = "ไม่พบข้อมูลวิเคราะห์";
} else {
  renderKpis();
  renderSummary();
  renderUtilizationChart();
  renderShiftChart();
  renderMachineTable();
  renderProductTable();
}
