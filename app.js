const STORAGE_KEY = "production-capacity-machines-v1";

const sampleMachines = [
  {
    name: "CNC-01",
    quantity: 1,
    hoursPerDay: 8,
    downtimeMinutes: 30,
    cycleSeconds: 45,
    unitsPerCycle: 1,
    oee: 85
  },
  {
    name: "Press-02",
    quantity: 2,
    hoursPerDay: 8,
    downtimeMinutes: 45,
    cycleSeconds: 60,
    unitsPerCycle: 2,
    oee: 78
  },
  {
    name: "Packing-01",
    quantity: 1,
    hoursPerDay: 7.5,
    downtimeMinutes: 20,
    cycleSeconds: 30,
    unitsPerCycle: 1,
    oee: 90
  }
];

let machines = loadMachines();

const rowsEl = document.querySelector("#machineRows");
const totalDayEl = document.querySelector("#totalDay");
const totalHourEl = document.querySelector("#totalHour");
const bottleneckMachineEl = document.querySelector("#bottleneckMachine");
const bottleneckValueEl = document.querySelector("#bottleneckValue");
const averageOeeEl = document.querySelector("#averageOee");
const machineCountEl = document.querySelector("#machineCount");
const barChartEl = document.querySelector("#barChart");

document.querySelector("#addMachineButton").addEventListener("click", () => {
  machines.push({
    name: `เครื่อง ${machines.length + 1}`,
    quantity: 1,
    hoursPerDay: 8,
    downtimeMinutes: 0,
    cycleSeconds: 60,
    unitsPerCycle: 1,
    oee: 100
  });
  persistAndRender();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  if (!window.confirm("ล้างข้อมูลทั้งหมด?")) return;
  machines = [];
  persistAndRender();
});

document.querySelector("#resetSampleButton").addEventListener("click", () => {
  machines = structuredClone(sampleMachines);
  persistAndRender();
});

document.querySelector("#exportButton").addEventListener("click", exportCsv);

render();

function loadMachines() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return Array.isArray(saved) && saved.length ? saved : structuredClone(sampleMachines);
  } catch {
    return structuredClone(sampleMachines);
  }
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
  render();
}

function render() {
  rowsEl.innerHTML = "";

  machines.forEach((machine, index) => {
    const result = calculate(machine);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td><input class="machine-name" data-field="name" type="text" value="${escapeAttribute(machine.name)}" aria-label="ชื่อเครื่องจักร"></td>
      <td><input data-field="quantity" type="number" min="0" step="1" value="${machine.quantity}" aria-label="จำนวนเครื่อง"></td>
      <td><input data-field="hoursPerDay" type="number" min="0" step="0.25" value="${machine.hoursPerDay}" aria-label="ชั่วโมงทำงานต่อวัน"></td>
      <td><input data-field="downtimeMinutes" type="number" min="0" step="1" value="${machine.downtimeMinutes}" aria-label="เวลาหยุดต่อวัน"></td>
      <td><input data-field="cycleSeconds" type="number" min="0.01" step="0.01" value="${machine.cycleSeconds}" aria-label="Cycle Time วินาที"></td>
      <td><input data-field="unitsPerCycle" type="number" min="0" step="0.01" value="${machine.unitsPerCycle}" aria-label="จำนวนชิ้นต่อรอบ"></td>
      <td><input data-field="oee" type="number" min="0" max="100" step="0.1" value="${machine.oee}" aria-label="OEE เปอร์เซ็นต์"></td>
      <td><output>${formatNumber(result.hourlyCapacity)}</output></td>
      <td><output>${formatNumber(result.dailyCapacity)}</output></td>
      <td><button class="remove-button" type="button" aria-label="ลบเครื่องจักร" title="ลบเครื่องจักร">x</button></td>
    `;

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        updateMachine(index, input.dataset.field, input.value);
        updateRowOutputs(row, machines[index]);
        updateSummary();
        renderChart();
      });
    });

    row.querySelector(".remove-button").addEventListener("click", () => {
      machines.splice(index, 1);
      persistAndRender();
    });

    rowsEl.appendChild(row);
  });

  updateSummary();
  renderChart();
}

function updateMachine(index, field, value) {
  if (field === "name") {
    machines[index][field] = value;
  } else {
    machines[index][field] = normalizeNumber(value);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
}

function updateRowOutputs(row, machine) {
  const result = calculate(machine);
  const outputs = row.querySelectorAll("output");
  outputs[0].textContent = formatNumber(result.hourlyCapacity);
  outputs[1].textContent = formatNumber(result.dailyCapacity);
}

function calculate(machine) {
  const quantity = normalizeNumber(machine.quantity);
  const hoursPerDay = normalizeNumber(machine.hoursPerDay);
  const downtimeMinutes = normalizeNumber(machine.downtimeMinutes);
  const cycleSeconds = Math.max(normalizeNumber(machine.cycleSeconds), 0);
  const unitsPerCycle = normalizeNumber(machine.unitsPerCycle);
  const oeeFactor = clamp(normalizeNumber(machine.oee), 0, 100) / 100;
  const availableMinutes = Math.max((hoursPerDay * 60) - downtimeMinutes, 0);

  if (!cycleSeconds || !quantity || !unitsPerCycle || !availableMinutes) {
    return { hourlyCapacity: 0, dailyCapacity: 0, availableMinutes };
  }

  const hourlyCapacity = (3600 / cycleSeconds) * unitsPerCycle * oeeFactor * quantity;
  const dailyCapacity = (availableMinutes * 60 / cycleSeconds) * unitsPerCycle * oeeFactor * quantity;
  return { hourlyCapacity, dailyCapacity, availableMinutes };
}

function updateSummary() {
  const calculations = machines.map((machine) => ({
    machine,
    ...calculate(machine)
  }));
  const totalDay = calculations.reduce((sum, item) => sum + item.dailyCapacity, 0);
  const totalHour = calculations.reduce((sum, item) => sum + item.hourlyCapacity, 0);
  const activeMachines = calculations.filter((item) => item.dailyCapacity > 0);
  const bottleneck = activeMachines.reduce((lowest, item) => {
    if (!lowest || item.dailyCapacity < lowest.dailyCapacity) return item;
    return lowest;
  }, null);
  const avgOee = machines.length
    ? machines.reduce((sum, machine) => sum + clamp(normalizeNumber(machine.oee), 0, 100), 0) / machines.length
    : 0;

  totalDayEl.textContent = formatNumber(totalDay);
  totalHourEl.textContent = formatNumber(totalHour);
  bottleneckMachineEl.textContent = bottleneck ? bottleneck.machine.name || "-" : "-";
  bottleneckValueEl.textContent = `${formatNumber(bottleneck ? bottleneck.dailyCapacity : 0)} ชิ้น/วัน`;
  averageOeeEl.textContent = `${formatNumber(avgOee, 1)}%`;
  machineCountEl.textContent = `${machines.length} เครื่อง`;
}

function renderChart() {
  const values = machines
    .map((machine) => ({ name: machine.name || "-", dailyCapacity: calculate(machine).dailyCapacity }))
    .sort((a, b) => b.dailyCapacity - a.dailyCapacity);
  const max = Math.max(...values.map((item) => item.dailyCapacity), 0);

  barChartEl.innerHTML = "";

  if (!values.length) {
    barChartEl.innerHTML = `<div class="empty-state">ยังไม่มีรายการเครื่องจักร</div>`;
    return;
  }

  values.forEach((item) => {
    const row = document.createElement("div");
    const width = max ? Math.max((item.dailyCapacity / max) * 100, 2) : 0;
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label" title="${escapeAttribute(item.name)}">${escapeHtml(item.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      <div class="bar-value">${formatNumber(item.dailyCapacity)} ชิ้น/วัน</div>
    `;
    barChartEl.appendChild(row);
  });
}

function exportCsv() {
  const header = [
    "Machine",
    "Quantity",
    "Hours per day",
    "Downtime minutes",
    "Cycle seconds",
    "Units per cycle",
    "OEE percent",
    "Capacity per hour",
    "Capacity per day"
  ];
  const body = machines.map((machine) => {
    const result = calculate(machine);
    return [
      machine.name,
      machine.quantity,
      machine.hoursPerDay,
      machine.downtimeMinutes,
      machine.cycleSeconds,
      machine.unitsPerCycle,
      machine.oee,
      round(result.hourlyCapacity, 2),
      round(result.dailyCapacity, 2)
    ];
  });
  const csv = [header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production-capacity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: digits
  }).format(value || 0);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
