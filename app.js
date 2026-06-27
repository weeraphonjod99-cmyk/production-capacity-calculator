const STORAGE_KEY = "production-capacity-planner-v1";

const sampleState = {
  settings: {
    workingDays: 26,
    warningThreshold: 85
  },
  machines: [
    createMachine({
      name: "CNC-01",
      type: "CNC",
      quantity: 1,
      hoursPerDay: 8,
      downtimeMinutes: 30,
      cycleSeconds: 45,
      unitsPerCycle: 1,
      oee: 85
    }),
    createMachine({
      name: "Press-02",
      type: "Press",
      quantity: 2,
      hoursPerDay: 8,
      downtimeMinutes: 45,
      cycleSeconds: 60,
      unitsPerCycle: 2,
      oee: 78.1
    }),
    createMachine({
      name: "Packing-01",
      type: "Packing",
      quantity: 1,
      hoursPerDay: 7.5,
      downtimeMinutes: 20,
      cycleSeconds: 30,
      unitsPerCycle: 1,
      oee: 90
    })
  ],
  jobs: []
};

sampleState.jobs = [
  createJob({ name: "MIDDLE TERMINAL", code: "48187096AA", machineId: sampleState.machines[1].id, monthlyDemand: 250000, priority: "สูง" }),
  createJob({ name: "Arc Plate", code: "51207117AD1", machineId: sampleState.machines[1].id, monthlyDemand: 400000, priority: "เร่งด่วน" }),
  createJob({ name: "PASSIVE BRACKET", code: "SB-068A-2", machineId: sampleState.machines[0].id, monthlyDemand: 4000, priority: "ปกติ" }),
  createJob({ name: "Packing Lot A", code: "PK-A", machineId: sampleState.machines[2].id, monthlyDemand: 12000, priority: "ปกติ" })
];

let state = loadState();
let deferredInstallPrompt = null;

const machineRowsEl = document.querySelector("#machineRows");
const jobRowsEl = document.querySelector("#jobRows");
const jobMachineSelect = document.querySelector("#jobMachineSelect");
const totalDayEl = document.querySelector("#totalDay");
const totalMonthEl = document.querySelector("#totalMonth");
const monthBasisEl = document.querySelector("#monthBasis");
const totalDemandEl = document.querySelector("#totalDemand");
const overloadedCountEl = document.querySelector("#overloadedCount");
const machineCountEl = document.querySelector("#machineCount");
const barChartEl = document.querySelector("#barChart");
const importFileInput = document.querySelector("#importFileInput");
const importStatus = document.querySelector("#importStatus");
const workingDaysInput = document.querySelector("#workingDaysInput");
const warningThresholdInput = document.querySelector("#warningThresholdInput");
const installButton = document.querySelector("#installButton");

document.querySelector("#machineForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.machines.push(createMachine({
    name: data.get("name"),
    type: data.get("type"),
    quantity: data.get("quantity"),
    hoursPerDay: data.get("hoursPerDay"),
    downtimeMinutes: data.get("downtimeMinutes"),
    cycleSeconds: data.get("cycleSeconds"),
    unitsPerCycle: data.get("unitsPerCycle"),
    oee: data.get("oee")
  }));
  event.currentTarget.reset();
  event.currentTarget.elements.quantity.value = 1;
  event.currentTarget.elements.hoursPerDay.value = 8;
  event.currentTarget.elements.downtimeMinutes.value = 0;
  event.currentTarget.elements.cycleSeconds.value = 60;
  event.currentTarget.elements.unitsPerCycle.value = 1;
  event.currentTarget.elements.oee.value = 85;
  persistAndRender();
});

document.querySelector("#jobForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.jobs.push(createJob({
    name: data.get("name"),
    code: data.get("code"),
    machineId: data.get("machineId"),
    monthlyDemand: data.get("monthlyDemand"),
    dueDate: data.get("dueDate"),
    priority: data.get("priority")
  }));
  event.currentTarget.reset();
  event.currentTarget.elements.monthlyDemand.value = 10000;
  event.currentTarget.elements.priority.value = "ปกติ";
  persistAndRender();
});

workingDaysInput.addEventListener("input", () => {
  state.settings.workingDays = clamp(normalizeNumber(workingDaysInput.value), 1, 31);
  persistAndRender();
});

warningThresholdInput.addEventListener("input", () => {
  state.settings.warningThreshold = clamp(normalizeNumber(warningThresholdInput.value), 1, 100);
  persistAndRender();
});

document.querySelector("#resetSampleButton").addEventListener("click", () => {
  state = structuredClone(sampleState);
  persistAndRender();
});

document.querySelector("#clearButton").addEventListener("click", () => {
  if (!window.confirm("ล้างข้อมูลเครื่องจักรและงานทั้งหมด?")) return;
  state = { settings: { workingDays: 26, warningThreshold: 85 }, machines: [], jobs: [] };
  persistAndRender();
});

document.querySelector("#exportButton").addEventListener("click", exportCsv);

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;

  setImportStatus(`กำลังอ่านไฟล์ ${file.name}...`);

  try {
    const imported = await importPlannerFromFile(file);
    if (!imported.machines.length && !imported.jobs.length) {
      throw new Error("ไม่พบข้อมูลเครื่องจักรหรืองานผลิตในไฟล์");
    }

    mergeImportedData(imported);
    persistAndRender();
    setImportStatus(`นำเข้า ${imported.machines.length} เครื่อง และ ${imported.jobs.length} งาน จาก ${file.name} สำเร็จ`, "success");
  } catch (error) {
    setImportStatus(error.message || "นำเข้าไฟล์ไม่สำเร็จ", "error");
  } finally {
    importFileInput.value = "";
  }
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  installButton.disabled = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
  installButton.disabled = false;
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

render();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.machines && saved?.jobs) return normalizeState(saved);

    const oldMachines = JSON.parse(localStorage.getItem("production-capacity-machines-v1") || "null");
    if (Array.isArray(oldMachines) && oldMachines.length) {
      return normalizeState({
        settings: sampleState.settings,
        machines: oldMachines.map((machine) => createMachine(machine)),
        jobs: []
      });
    }
  } catch {
    return structuredClone(sampleState);
  }

  return structuredClone(sampleState);
}

function normalizeState(rawState) {
  const machines = (rawState.machines || []).map((machine) => createMachine(machine));
  const machineIds = new Set(machines.map((machine) => machine.id));
  const fallbackMachineId = machines[0]?.id || "";
  const jobs = (rawState.jobs || [])
    .map((job) => createJob({ ...job, machineId: machineIds.has(job.machineId) ? job.machineId : fallbackMachineId }))
    .filter((job) => job.machineId);

  return {
    settings: {
      workingDays: clamp(normalizeNumber(rawState.settings?.workingDays || 26), 1, 31),
      warningThreshold: clamp(normalizeNumber(rawState.settings?.warningThreshold || 85), 1, 100)
    },
    machines,
    jobs
  };
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function render() {
  workingDaysInput.value = state.settings.workingDays;
  warningThresholdInput.value = state.settings.warningThreshold;
  renderMachineOptions();
  renderMachines();
  renderJobs();
  renderSummary();
  renderChart();
}

function renderMachineOptions() {
  const options = state.machines.map((machine) => (
    `<option value="${escapeAttribute(machine.id)}">${escapeHtml(machine.name)}</option>`
  ));
  jobMachineSelect.innerHTML = options.length ? options.join("") : `<option value="">เพิ่มเครื่องก่อน</option>`;
  jobMachineSelect.disabled = !options.length;
}

function renderMachines() {
  const metrics = getMachineMetrics();
  machineRowsEl.innerHTML = "";

  if (!state.machines.length) {
    machineRowsEl.innerHTML = `<tr><td colspan="14" class="empty-state">ยังไม่มีเครื่องจักร</td></tr>`;
    return;
  }

  state.machines.forEach((machine) => {
    const metric = metrics.get(machine.id);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input data-kind="machine" data-id="${machine.id}" data-field="name" value="${escapeAttribute(machine.name)}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="type" value="${escapeAttribute(machine.type)}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="quantity" type="number" min="1" step="1" value="${machine.quantity}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="hoursPerDay" type="number" min="0" step="0.25" value="${machine.hoursPerDay}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="downtimeMinutes" type="number" min="0" step="1" value="${machine.downtimeMinutes}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="cycleSeconds" type="number" min="0.01" step="0.01" value="${machine.cycleSeconds}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="unitsPerCycle" type="number" min="0.01" step="0.01" value="${machine.unitsPerCycle}"></td>
      <td><input data-kind="machine" data-id="${machine.id}" data-field="oee" type="number" min="0" max="100" step="0.1" value="${machine.oee}"></td>
      <td><output>${formatNumber(metric.dailyCapacity)}</output></td>
      <td><output>${formatNumber(metric.monthlyCapacity)}</output></td>
      <td><output>${formatNumber(metric.monthlyDemand)}</output></td>
      <td><span class="status-pill ${metric.statusClass}">${formatPercent(metric.utilization)}</span></td>
      <td>${metric.status}</td>
      <td><button class="remove-button" type="button" data-remove-machine="${machine.id}" title="ลบเครื่อง">x</button></td>
    `;
    machineRowsEl.appendChild(row);
  });

  machineRowsEl.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => updateMachine(input.dataset.id, input.dataset.field, input.value));
  });
  machineRowsEl.querySelectorAll("[data-remove-machine]").forEach((button) => {
    button.addEventListener("click", () => removeMachine(button.dataset.removeMachine));
  });
}

function renderJobs() {
  const metrics = getMachineMetrics();
  jobRowsEl.innerHTML = "";

  if (!state.jobs.length) {
    jobRowsEl.innerHTML = `<tr><td colspan="8" class="empty-state">ยังไม่มีงานผลิต</td></tr>`;
    return;
  }

  state.jobs.forEach((job) => {
    const machine = findMachine(job.machineId);
    const metric = metrics.get(job.machineId);
    const requiredDays = metric?.dailyCapacity ? job.monthlyDemand / metric.dailyCapacity : 0;
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input data-kind="job" data-id="${job.id}" data-field="name" value="${escapeAttribute(job.name)}"></td>
      <td><input data-kind="job" data-id="${job.id}" data-field="code" value="${escapeAttribute(job.code)}"></td>
      <td>${machineSelectHtml(job)}</td>
      <td><input data-kind="job" data-id="${job.id}" data-field="monthlyDemand" type="number" min="0" step="1" value="${job.monthlyDemand}"></td>
      <td><output>${formatNumber(requiredDays, 1)} วัน</output></td>
      <td><input data-kind="job" data-id="${job.id}" data-field="dueDate" type="date" value="${escapeAttribute(job.dueDate)}"></td>
      <td>${prioritySelectHtml(job)}</td>
      <td><button class="remove-button" type="button" data-remove-job="${job.id}" title="ลบงาน">x</button></td>
    `;
    jobRowsEl.appendChild(row);
  });

  jobRowsEl.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => updateJob(input.dataset.id, input.dataset.field, input.value));
    input.addEventListener("change", () => updateJob(input.dataset.id, input.dataset.field, input.value));
  });
  jobRowsEl.querySelectorAll("[data-remove-job]").forEach((button) => {
    button.addEventListener("click", () => removeJob(button.dataset.removeJob));
  });
}

function machineSelectHtml(job) {
  const options = state.machines.map((machine) => (
    `<option value="${escapeAttribute(machine.id)}" ${machine.id === job.machineId ? "selected" : ""}>${escapeHtml(machine.name)}</option>`
  ));
  return `<select data-kind="job" data-id="${job.id}" data-field="machineId">${options.join("")}</select>`;
}

function prioritySelectHtml(job) {
  return `
    <select data-kind="job" data-id="${job.id}" data-field="priority">
      ${["ปกติ", "สูง", "เร่งด่วน"].map((priority) => (
        `<option value="${priority}" ${priority === job.priority ? "selected" : ""}>${priority}</option>`
      )).join("")}
    </select>
  `;
}

function renderSummary() {
  const metrics = [...getMachineMetrics().values()];
  const totalDay = metrics.reduce((sum, metric) => sum + metric.dailyCapacity, 0);
  const totalMonth = metrics.reduce((sum, metric) => sum + metric.monthlyCapacity, 0);
  const totalDemand = state.jobs.reduce((sum, job) => sum + job.monthlyDemand, 0);
  const overloaded = metrics.filter((metric) => metric.utilization > 1).length;

  totalDayEl.textContent = formatNumber(totalDay);
  totalMonthEl.textContent = formatNumber(totalMonth);
  monthBasisEl.textContent = `${state.settings.workingDays} วันทำงาน`;
  totalDemandEl.textContent = formatNumber(totalDemand);
  overloadedCountEl.textContent = overloaded;
  machineCountEl.textContent = `${state.machines.length} เครื่อง`;
}

function renderChart() {
  const values = [...getMachineMetrics().values()]
    .sort((a, b) => b.utilization - a.utilization);
  const max = Math.max(...values.map((item) => item.utilization), 1);
  barChartEl.innerHTML = "";

  if (!values.length) {
    barChartEl.innerHTML = `<div class="empty-state">ยังไม่มีข้อมูลโหลดเครื่องจักร</div>`;
    return;
  }

  values.forEach((item) => {
    const width = Math.max((item.utilization / max) * 100, item.utilization ? 3 : 0);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <div class="bar-label" title="${escapeAttribute(item.machine.name)}">${escapeHtml(item.machine.name)}</div>
      <div class="bar-track"><div class="bar-fill ${item.statusClass}" style="width:${width}%"></div></div>
      <div class="bar-value">${formatPercent(item.utilization)}</div>
    `;
    barChartEl.appendChild(row);
  });
}

function updateMachine(id, field, value) {
  const machine = findMachine(id);
  if (!machine) return;
  if (["name", "type"].includes(field)) {
    machine[field] = value;
  } else {
    machine[field] = normalizeNumber(value);
  }
  persistAndRender();
}

function updateJob(id, field, value) {
  const job = state.jobs.find((item) => item.id === id);
  if (!job) return;
  if (field === "monthlyDemand") {
    job[field] = normalizeNumber(value);
  } else {
    job[field] = value;
  }
  persistAndRender();
}

function removeMachine(id) {
  if (state.jobs.some((job) => job.machineId === id) && !window.confirm("เครื่องนี้มีงานผูกอยู่ ต้องการลบเครื่องและงานที่เกี่ยวข้อง?")) return;
  state.jobs = state.jobs.filter((job) => job.machineId !== id);
  state.machines = state.machines.filter((machine) => machine.id !== id);
  persistAndRender();
}

function removeJob(id) {
  state.jobs = state.jobs.filter((job) => job.id !== id);
  persistAndRender();
}

function getMachineMetrics() {
  const metrics = new Map();
  state.machines.forEach((machine) => {
    const capacity = calculateMachineCapacity(machine);
    const monthlyCapacity = capacity.dailyCapacity * state.settings.workingDays;
    const monthlyDemand = state.jobs
      .filter((job) => job.machineId === machine.id)
      .reduce((sum, job) => sum + job.monthlyDemand, 0);
    const utilization = monthlyCapacity ? monthlyDemand / monthlyCapacity : 0;
    const status = getStatus(utilization);
    metrics.set(machine.id, {
      machine,
      ...capacity,
      monthlyCapacity,
      monthlyDemand,
      utilization,
      status: status.label,
      statusClass: status.className
    });
  });
  return metrics;
}

function calculateMachineCapacity(machine) {
  const quantity = Math.max(normalizeNumber(machine.quantity), 0);
  const hoursPerDay = Math.max(normalizeNumber(machine.hoursPerDay), 0);
  const downtimeMinutes = Math.max(normalizeNumber(machine.downtimeMinutes), 0);
  const cycleSeconds = Math.max(normalizeNumber(machine.cycleSeconds), 0);
  const unitsPerCycle = Math.max(normalizeNumber(machine.unitsPerCycle), 0);
  const oeeFactor = clamp(normalizeNumber(machine.oee), 0, 100) / 100;
  const availableMinutes = Math.max((hoursPerDay * 60) - downtimeMinutes, 0);

  if (!cycleSeconds || !quantity || !unitsPerCycle || !availableMinutes) {
    return { hourlyCapacity: 0, dailyCapacity: 0, availableMinutes };
  }

  return {
    hourlyCapacity: (3600 / cycleSeconds) * unitsPerCycle * oeeFactor * quantity,
    dailyCapacity: (availableMinutes * 60 / cycleSeconds) * unitsPerCycle * oeeFactor * quantity,
    availableMinutes
  };
}

function getStatus(utilization) {
  if (utilization > 1) return { label: "เกินกำลัง", className: "danger" };
  if (utilization * 100 >= state.settings.warningThreshold) return { label: "โหลดสูง", className: "warning" };
  if (utilization > 0) return { label: "ปกติ", className: "ok" };
  return { label: "ยังไม่มีงาน", className: "idle" };
}

function findMachine(id) {
  return state.machines.find((machine) => machine.id === id);
}

function createMachine(machine = {}) {
  return {
    id: machine.id || makeId("machine"),
    name: String(machine.name || "เครื่องใหม่").trim(),
    type: String(machine.type || "").trim(),
    quantity: normalizeNumberWithDefault(machine.quantity, 1),
    hoursPerDay: normalizeNumberWithDefault(machine.hoursPerDay, 8),
    downtimeMinutes: normalizeNumberWithDefault(machine.downtimeMinutes, 0),
    cycleSeconds: normalizeNumberWithDefault(machine.cycleSeconds, 60),
    unitsPerCycle: normalizeNumberWithDefault(machine.unitsPerCycle, 1),
    oee: normalizeOee(normalizeNumberWithDefault(machine.oee, 100))
  };
}

function createJob(job = {}) {
  return {
    id: job.id || makeId("job"),
    name: String(job.name || "งานใหม่").trim(),
    code: String(job.code || "").trim(),
    machineId: String(job.machineId || "").trim(),
    monthlyDemand: normalizeNumberWithDefault(job.monthlyDemand, 0),
    dueDate: String(job.dueDate || "").trim(),
    priority: String(job.priority || "ปกติ").trim()
  };
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function exportCsv() {
  const machineMetrics = getMachineMetrics();
  const machineHeader = [
    "type",
    "machine",
    "machine_type",
    "quantity",
    "hours_per_day",
    "downtime_minutes",
    "cycle_seconds",
    "units_per_cycle",
    "oee_percent",
    "daily_capacity",
    "monthly_capacity",
    "monthly_demand",
    "utilization",
    "status"
  ];
  const machineRows = state.machines.map((machine) => {
    const metric = machineMetrics.get(machine.id);
    return [
      "machine",
      machine.name,
      machine.type,
      machine.quantity,
      machine.hoursPerDay,
      machine.downtimeMinutes,
      machine.cycleSeconds,
      machine.unitsPerCycle,
      machine.oee,
      round(metric.dailyCapacity, 2),
      round(metric.monthlyCapacity, 2),
      round(metric.monthlyDemand, 2),
      round(metric.utilization, 4),
      metric.status
    ];
  });
  const jobHeader = ["type", "job", "code", "machine", "monthly_demand", "required_days", "due_date", "priority"];
  const jobRows = state.jobs.map((job) => {
    const machine = findMachine(job.machineId);
    const metric = machineMetrics.get(job.machineId);
    return [
      "job",
      job.name,
      job.code,
      machine?.name || "",
      job.monthlyDemand,
      round(metric?.dailyCapacity ? job.monthlyDemand / metric.dailyCapacity : 0, 2),
      job.dueDate,
      job.priority
    ];
  });
  const csv = [
    machineHeader,
    ...machineRows,
    [],
    jobHeader,
    ...jobRows
  ].map((row) => row.map(csvCell).join(",")).join("\n");

  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `production-plan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importPlannerFromFile(file) {
  const lowerName = file.name.toLowerCase();
  let sheets;

  if (lowerName.endsWith(".csv") || file.type === "text/csv") {
    sheets = [{ name: "CSV", rows: parseDelimitedText(await file.text(), ",") }];
  } else if (lowerName.endsWith(".tsv") || file.type === "text/tab-separated-values") {
    sheets = [{ name: "TSV", rows: parseDelimitedText(await file.text(), "\t") }];
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    sheets = await readXlsxSheets(file);
  } else {
    throw new Error("รองรับเฉพาะไฟล์ .xlsx, .xlsm, .csv และ .tsv");
  }

  return extractPlannerFromSheets(sheets);
}

function mergeImportedData(imported) {
  const machineByName = new Map(state.machines.map((machine) => [machine.name.toLowerCase(), machine]));

  imported.machines.forEach((machine) => {
    const existing = machineByName.get(machine.name.toLowerCase());
    if (existing) {
      Object.assign(existing, { ...machine, id: existing.id });
    } else {
      state.machines.push(machine);
      machineByName.set(machine.name.toLowerCase(), machine);
    }
  });

  imported.jobs.forEach((job) => {
    if (!findMachine(job.machineId)) return;
    state.jobs.push(job);
  });
}

function extractPlannerFromSheets(sheets) {
  const machines = [];
  const jobs = [];
  const machineByName = new Map();

  sheets.forEach((sheet) => {
    const rows = sheet.rows.filter((row) => row?.some((value) => !isBlank(value)));
    const headerIndex = findPlannerHeaderRowIndex(rows);
    if (headerIndex === -1) return;

    const mapping = buildPlannerColumnMapping(rows[headerIndex]);
    rows.slice(headerIndex + 1).forEach((row, index) => {
      const machineName = getMappedText(row, mapping.machine) || sheet.name || `เครื่อง ${machines.length + 1}`;
      const normalizedName = machineName.toLowerCase();
      let machine = machineByName.get(normalizedName);

      if (!machine) {
        machine = createMachine({
          name: machineName,
          type: getMappedText(row, mapping.machineType),
          quantity: getMappedNumber(row, mapping.quantity, 1),
          hoursPerDay: getMappedNumber(row, mapping.hoursPerDay, 8),
          downtimeMinutes: getMappedNumber(row, mapping.downtimeMinutes, 0),
          cycleSeconds: getMappedNumber(row, mapping.cycleSeconds, 60),
          unitsPerCycle: getMappedNumber(row, mapping.unitsPerCycle, 1),
          oee: getMappedNumber(row, mapping.oee, 85)
        });
        machines.push(machine);
        machineByName.set(normalizedName, machine);
      }

      const jobName = getMappedText(row, mapping.job) || getMappedText(row, mapping.product) || "";
      const monthlyDemand = getMappedNumber(row, mapping.monthlyDemand, 0);
      if (jobName || monthlyDemand) {
        jobs.push(createJob({
          name: jobName || `งาน ${index + 1}`,
          code: getMappedText(row, mapping.code),
          machineId: machine.id,
          monthlyDemand,
          dueDate: getMappedText(row, mapping.dueDate),
          priority: getMappedText(row, mapping.priority) || "ปกติ"
        }));
      }
    });
  });

  return { machines, jobs };
}

function findPlannerHeaderRowIndex(rows) {
  let best = { index: -1, score: 0 };
  rows.forEach((row, index) => {
    const score = Object.keys(buildPlannerColumnMapping(row)).length;
    if (score > best.score) best = { index, score };
  });
  return best.score >= 2 ? best.index : -1;
}

function buildPlannerColumnMapping(row) {
  return row.reduce((mapping, value, index) => {
    const field = guessPlannerField(value);
    if (field && mapping[field] === undefined) mapping[field] = index;
    return mapping;
  }, {});
}

function guessPlannerField(value) {
  const header = normalizeHeader(value);
  if (!header) return null;
  if (header.includes("เครื่องจักร") || header.includes("ชื่อเครื่อง") || header === "machine" || header.includes("mc")) return "machine";
  if (header.includes("ประเภท") || header.includes("machinetype")) return "machineType";
  if (header.includes("จำนวนเครื่อง") || header === "qty" || header.includes("quantity")) return "quantity";
  if (header.includes("ชั่วโมง") || header.includes("hoursperday")) return "hoursPerDay";
  if (header.includes("หยุด") || header.includes("downtime")) return "downtimeMinutes";
  if (header.includes("cycle") || header.includes("วินาที") || header.includes("加工时间") || header.includes("压铸时间")) return "cycleSeconds";
  if (header.includes("ชิ้นต่อรอบ") || header.includes("模腔数") || header.includes("cavity") || header.includes("unitspercycle")) return "unitsPerCycle";
  if (header.includes("oee")) return "oee";
  if (header.includes("งาน") || header.includes("สินค้า") || header.includes("productname") || header.includes("产品名称")) return "job";
  if (header.includes("product")) return "product";
  if (header.includes("รหัส") || header.includes("产品品号") || header.includes("code") || header.includes("part")) return "code";
  if (header.includes("เดือน") || header.includes("monthly") || header.includes("月预测")) return "monthlyDemand";
  if (header.includes("กำหนดส่ง") || header.includes("duedate")) return "dueDate";
  if (header.includes("priority") || header.includes("ความสำคัญ")) return "priority";
  return null;
}

function parseDelimitedText(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  row.push(cell);
  if (row.some((value) => !isBlank(value))) rows.push(row);
  return rows;
}

async function readXlsxSheets(file) {
  if (!("DecompressionStream" in window)) {
    throw new Error("Browser นี้ยังไม่รองรับการอ่านไฟล์ .xlsx กรุณาใช้ Chrome, Edge หรือส่งออกเป็น CSV");
  }

  const zipFiles = await unzipXlsx(await file.arrayBuffer());
  const workbookXml = await readZipText(zipFiles, "xl/workbook.xml");
  const workbookRelsXml = await readZipText(zipFiles, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = zipFiles["xl/sharedStrings.xml"]
    ? await readZipText(zipFiles, "xl/sharedStrings.xml")
    : "";
  const sharedStrings = parseSharedStrings(sharedStringsXml);
  const workbookDoc = parseXml(workbookXml);
  const relationshipMap = parseWorkbookRelationships(workbookRelsXml);

  return [...workbookDoc.getElementsByTagName("sheet")]
    .map((sheetElement) => {
      const name = sheetElement.getAttribute("name") || "Sheet";
      const target = relationshipMap[sheetElement.getAttribute("r:id")];
      if (!target) return null;
      const path = normalizeXlsxPath(target);
      const entry = zipFiles[path];
      return entry ? { name, path, entry } : null;
    })
    .filter(Boolean)
    .reduce(async (promise, sheet) => {
      const output = await promise;
      const sheetXml = await inflateZipEntry(sheet.entry).then((bytes) => decodeUtf8(bytes));
      output.push({ name: sheet.name, rows: parseWorksheetRows(sheetXml, sharedStrings) });
      return output;
    }, Promise.resolve([]));
}

async function unzipXlsx(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const endRecordOffset = findZipEndRecord(view);
  const totalEntries = view.getUint16(endRecordOffset + 10, true);
  const directoryOffset = view.getUint32(endRecordOffset + 16, true);
  const decoder = new TextDecoder();
  const files = {};
  let offset = directoryOffset;

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("อ่านโครงสร้างไฟล์ Excel ไม่สำเร็จ");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const fileName = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) throw new Error("อ่านข้อมูลภายในไฟล์ Excel ไม่สำเร็จ");
    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    files[fileName] = { method, bytes: bytes.slice(dataStart, dataStart + compressedSize) };
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return files;
}

function findZipEndRecord(view) {
  const minimumOffset = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error("ไฟล์ Excel ไม่สมบูรณ์หรือไม่ใช่ .xlsx");
}

async function readZipText(files, path) {
  const entry = files[path];
  if (!entry) throw new Error(`ไม่พบ ${path} ในไฟล์ Excel`);
  return decodeUtf8(await inflateZipEntry(entry));
}

async function inflateZipEntry(entry) {
  if (entry.method === 0) return entry.bytes;
  if (entry.method !== 8) throw new Error("ไฟล์ Excel ใช้รูปแบบบีบอัดที่ยังไม่รองรับ");
  const stream = new Blob([entry.bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function parseXml(xml) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) throw new Error("อ่าน XML ในไฟล์ Excel ไม่สำเร็จ");
  return documentXml;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  return [...parseXml(xml).getElementsByTagName("si")].map((item) => (
    [...item.getElementsByTagName("t")].map((text) => text.textContent || "").join("")
  ));
}

function parseWorkbookRelationships(xml) {
  const relationships = {};
  [...parseXml(xml).getElementsByTagName("Relationship")].forEach((relationship) => {
    relationships[relationship.getAttribute("Id")] = relationship.getAttribute("Target");
  });
  return relationships;
}

function normalizeXlsxPath(target) {
  const cleanTarget = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const parts = [];
  cleanTarget.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") parts.pop();
    else parts.push(part);
  });
  return parts.join("/");
}

function parseWorksheetRows(xml, sharedStrings) {
  const worksheet = parseXml(xml);
  const rows = [];
  [...worksheet.getElementsByTagName("row")].forEach((rowElement) => {
    const rowNumber = Math.max(normalizeNumber(rowElement.getAttribute("r")), rows.length + 1);
    const row = [];
    [...rowElement.getElementsByTagName("c")].forEach((cellElement) => {
      const cellAddress = cellElement.getAttribute("r") || "";
      const columnName = cellAddress.replace(/[0-9]/g, "");
      const columnIndex = columnName ? excelColumnToIndex(columnName) : row.length;
      row[columnIndex] = getXlsxCellValue(cellElement, sharedStrings);
    });
    rows[rowNumber - 1] = row;
  });
  return rows.filter(Boolean);
}

function getXlsxCellValue(cellElement, sharedStrings) {
  const type = cellElement.getAttribute("t");
  if (type === "inlineStr") {
    return [...cellElement.getElementsByTagName("t")].map((text) => text.textContent || "").join("");
  }
  const rawValue = cellElement.getElementsByTagName("v")[0]?.textContent ?? "";
  if (type === "s") return sharedStrings[normalizeNumber(rawValue)] ?? "";
  if (type === "b") return rawValue === "1";
  if (type === "str") return rawValue;
  const numericValue = Number(rawValue);
  return Number.isFinite(numericValue) ? numericValue : rawValue;
}

function excelColumnToIndex(columnName) {
  return columnName
    .toUpperCase()
    .split("")
    .reduce((sum, letter) => (sum * 26) + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()_\-/%.,:]/g, "")
    .trim();
}

function getMappedText(row, index) {
  return index === undefined ? "" : String(row[index] ?? "").trim();
}

function getMappedNumber(row, index, fallback) {
  return index === undefined ? fallback : normalizeNumberWithDefault(row[index], fallback);
}

function normalizeNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").replace("%", "").trim());
  return Number.isFinite(number) ? number : 0;
}

function normalizeNumberWithDefault(value, fallback) {
  if (isBlank(value)) return fallback;
  const number = normalizeNumber(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOee(value) {
  if (value > 0 && value <= 1) return round(value * 100, 1);
  return clamp(value, 0, 100);
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((value || 0) * factor) / factor;
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: digits }).format(value || 0);
}

function formatPercent(value) {
  return `${formatNumber((value || 0) * 100, 1)}%`;
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

function setImportStatus(message, tone = "neutral") {
  importStatus.textContent = message;
  importStatus.dataset.tone = tone;
}
