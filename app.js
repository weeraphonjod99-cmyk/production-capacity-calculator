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
const installButton = document.querySelector("#installButton");
const importFileInput = document.querySelector("#importFileInput");
const importStatus = document.querySelector("#importStatus");
let deferredInstallPrompt = null;

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

importFileInput.addEventListener("change", async () => {
  const file = importFileInput.files?.[0];
  if (!file) return;

  setImportStatus(`กำลังอ่านไฟล์ ${file.name}...`);

  try {
    const importedMachines = await importMachinesFromFile(file);

    if (!importedMachines.length) {
      throw new Error("ไม่พบแถวข้อมูลเครื่องจักรในไฟล์");
    }

    machines = importedMachines;
    persistAndRender();
    setImportStatus(`นำเข้า ${importedMachines.length} เครื่องจาก ${file.name} สำเร็จ`, "success");
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

async function importMachinesFromFile(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    return extractMachinesFromSheets([{ name: "CSV", rows: parseDelimitedText(text, ",") }]);
  }

  if (lowerName.endsWith(".tsv") || file.type === "text/tab-separated-values") {
    const text = await file.text();
    return extractMachinesFromSheets([{ name: "TSV", rows: parseDelimitedText(text, "\t") }]);
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xlsm")) {
    const sheets = await readXlsxSheets(file);
    return extractMachinesFromSheets(sheets);
  }

  throw new Error("รองรับเฉพาะไฟล์ .xlsx, .xlsm, .csv และ .tsv");
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
    throw new Error("Browser นี้ยังไม่รองรับการอ่านไฟล์ .xlsx ในเครื่อง กรุณาใช้ Chrome, Edge หรือส่งออกเป็น CSV");
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
      const relationshipId = sheetElement.getAttribute("r:id");
      const target = relationshipMap[relationshipId];
      if (!target) return null;

      const path = normalizeXlsxPath(target);
      const entry = zipFiles[path];
      return entry ? { name, path, entry } : null;
    })
    .filter(Boolean)
    .reduce(async (promise, sheet) => {
      const sheets = await promise;
      const sheetXml = await inflateZipEntry(sheet.entry).then((bytes) => decodeUtf8(bytes));
      sheets.push({
        name: sheet.name,
        rows: parseWorksheetRows(sheetXml, sharedStrings)
      });
      return sheets;
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
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("อ่านโครงสร้างไฟล์ Excel ไม่สำเร็จ");
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const fileName = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error("อ่านข้อมูลภายในไฟล์ Excel ไม่สำเร็จ");
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    files[fileName] = {
      method,
      bytes: bytes.slice(dataStart, dataStart + compressedSize)
    };

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

  if (entry.method !== 8) {
    throw new Error("ไฟล์ Excel ใช้รูปแบบบีบอัดที่ยังไม่รองรับ");
  }

  const stream = new Blob([entry.bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function parseXml(xml) {
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.querySelector("parsererror")) {
    throw new Error("อ่าน XML ในไฟล์ Excel ไม่สำเร็จ");
  }
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
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
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

function extractMachinesFromSheets(sheets) {
  const imported = [];

  sheets.forEach((sheet) => {
    const rows = sheet.rows.filter((row) => row && row.some((value) => !isBlank(value)));
    if (!rows.length) return;

    const headerIndex = findHeaderRowIndex(rows);

    if (headerIndex === -1) {
      const machine = machineFromKeyValueRows(rows, sheet.name);
      if (machine) imported.push(machine);
      return;
    }

    const mapping = buildColumnMapping(rows[headerIndex]);

    rows.slice(headerIndex + 1).forEach((row) => {
      const machine = machineFromDataRow(row, mapping, sheet.name, imported.length + 1);
      if (machine) imported.push(machine);
    });
  });

  return imported;
}

function findHeaderRowIndex(rows) {
  let best = { index: -1, score: 0 };

  rows.forEach((row, index) => {
    const mapping = buildColumnMapping(row);
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { index, score };
  });

  return best.score >= 3 ? best.index : -1;
}

function buildColumnMapping(row) {
  return row.reduce((mapping, value, index) => {
    const field = guessMachineField(value);
    if (field && mapping[field] === undefined) mapping[field] = index;
    return mapping;
  }, {});
}

function machineFromDataRow(row, mapping, fallbackName, position) {
  const hasUsefulValue = Object.values(mapping).some((index) => !isBlank(row[index]));
  if (!hasUsefulValue) return null;

  const name = getMappedText(row, mapping.name) || fallbackName || `เครื่อง ${position}`;
  const machine = {
    name,
    quantity: getMappedNumber(row, mapping.quantity, 1),
    hoursPerDay: getMappedNumber(row, mapping.hoursPerDay, 8),
    downtimeMinutes: getMappedNumber(row, mapping.downtimeMinutes, 0),
    cycleSeconds: getMappedNumber(row, mapping.cycleSeconds, 60),
    unitsPerCycle: getMappedNumber(row, mapping.unitsPerCycle, 1),
    oee: normalizeOee(getMappedNumber(row, mapping.oee, 100))
  };

  if (Object.values(machine).every((value) => isBlank(value))) return null;
  if (isHeaderLike(machine.name)) return null;
  return machine;
}

function machineFromKeyValueRows(rows, fallbackName) {
  const values = { name: fallbackName };

  rows.forEach((row) => {
    const field = guessMachineField(row[0]);
    if (field) values[field] = row[1];
  });

  const machine = {
    name: getCleanText(values.name) || fallbackName,
    quantity: normalizeNumberWithDefault(values.quantity, 1),
    hoursPerDay: normalizeNumberWithDefault(values.hoursPerDay, 8),
    downtimeMinutes: normalizeNumberWithDefault(values.downtimeMinutes, 0),
    cycleSeconds: normalizeNumberWithDefault(values.cycleSeconds, 60),
    unitsPerCycle: normalizeNumberWithDefault(values.unitsPerCycle, 1),
    oee: normalizeOee(normalizeNumberWithDefault(values.oee, 100))
  };

  return Object.keys(values).length > 1 ? machine : null;
}

function guessMachineField(value) {
  const header = normalizeHeader(value);
  if (!header) return null;

  if (header.includes("ชิ้นต่อรอบ") || header.includes("ชิ้นรอบ") || header.includes("unitpercycle") || header.includes("unitspercycle") || header.includes("pcspercycle") || header.includes("piecepercycle")) {
    return "unitsPerCycle";
  }

  if (header.includes("cycletime") || header.includes("cycle") || header.includes("วินาที") || header.includes("second")) {
    return "cycleSeconds";
  }

  if (header.includes("oee") || header.includes("efficiency") || header.includes("ประสิทธิภาพ")) {
    return "oee";
  }

  if (header.includes("หยุด") || header.includes("downtime") || header.includes("stoptime") || header.includes("break") || header.includes("นาที")) {
    return "downtimeMinutes";
  }

  if (header.includes("ชั่วโมงต่อวัน") || header.includes("ชั่วโมงวัน") || header.includes("hoursperday") || header.includes("workinghours") || header.includes("hrday")) {
    return "hoursPerDay";
  }

  if (header.includes("จำนวนเครื่อง") || header.includes("quantity") || header === "qty" || header.includes("numberofmachine") || header.includes("machineqty")) {
    return "quantity";
  }

  if (header.includes("ชื่อเครื่อง") || header.includes("เครื่องจักร") || header === "เครื่อง" || header.includes("machine") || header === "mc") {
    return "name";
  }

  return null;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()_\-/%.,:]/g, "")
    .trim();
}

function getMappedText(row, index) {
  return index === undefined ? "" : getCleanText(row[index]);
}

function getMappedNumber(row, index, fallback) {
  return index === undefined ? fallback : normalizeNumberWithDefault(row[index], fallback);
}

function getCleanText(value) {
  return String(value ?? "").trim();
}

function normalizeNumberWithDefault(value, fallback) {
  if (isBlank(value)) return fallback;
  const number = Number(String(value).replace(/,/g, "").replace("%", "").trim());
  return Number.isFinite(number) ? number : fallback;
}

function normalizeOee(value) {
  if (value > 0 && value <= 1) return round(value * 100, 1);
  return clamp(value, 0, 100);
}

function isHeaderLike(value) {
  return Boolean(guessMachineField(value));
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function setImportStatus(message, tone = "neutral") {
  importStatus.textContent = message;
  importStatus.dataset.tone = tone;
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
