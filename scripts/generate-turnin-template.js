#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const CFB = require("cfb");

const OUTPUT_FILE = "WK_TEMPLATE_Web_Marketing_Doc.xlsx";
const TOTAL_TEMPLATE_ROWS = 200;

const MAIN_HEADERS = [
  "CATEGORY",
  "PAGE LOCATION",
  "Event 1",
  "Event 2",
  "Event 3",
  "Special Dates",
  "PRIORITY",
  "PANEL NAME",
  "Prefix",
  "Value",
  "$/%",
  "Suffix",
  "Item",
  "Exclusions",
  "Generated Description",
  "BRAND or CATEGORY",
  "DIRECTION",
  "IMG NAME, RIN, P/U OR C/O",
  "Link Intent",
];

const CATEGORY_OPTIONS = [
  "Homepage",
  "Accessories",
  "Apparel",
  "Baby",
  "Baby Care",
  "Beauty",
  "Candy",
  "Electronics",
  "Everyday Home",
  "Food Snacks & Candy",
  "Furniture",
  "General Hardware",
  "Health & Wellness",
  "Home Depot",
  "Household Essentials",
  "Luggage & Travel",
  "Military (Navy Pride)",
  "Office and School Supplies",
  "Outdoor Home",
  "Personal Care",
  "Pet",
  "Seasonal",
  "Shoes",
  "Speciality Shops",
  "Sports Fitness and Outdoor",
  "Tactical",
  "Toys",
];

const PANEL_OPTIONS = ["Marketing Header", "Banner", "Left Nav", "A", "B", "C"];

const PREFIX_OPTIONS = [
  "Take An Additional",
  "Save Up To",
  "Military Exclusive Price",
  "Take An Extra",
  "Special Buy!",
  "True Blue Deal",
  "Sale",
  "Online Exclusive",
  "BOGO",
  "New!",
  "Save on",
  "Coming Soon!",
  "Military Exclusive",
];

const SUFFIX_OPTIONS = [
  "Off Our Everyday NEX Price",
  "Off Retail Price",
  "Off Our Everyday Value",
  "Off Already Reduced Clearance",
];

const EXCLUSION_OPTIONS = [
  "*Price as marked online.",
  "*Excludes Special Buys.",
  "*Excludes lab grown diamonds.",
  "*Excludes special buys and lab grown diamonds.",
  "*Excludes special buys and smartwatches.",
  "*Second item of equal or lesser value.",
  "*Excludes Birkenstock",
  "*Must Buy",
];

const LINK_INTENT_OPTIONS = [
  "Link to Brand",
  "Link To Category",
  "Link to Brand/Category",
  "Link to Brands/Category",
  "Link To Categories",
  "Link To Item",
  "Link to Brand page",
  "N/A",
  "C/O WK [Enter #]",
];

const LIST_HEADERS = [
  "Sale Pricing/Call out",
  "Value Message",
  "Category D-List",
  "Panel Name D-List",
  "Link Intent D-List",
  "Exclusions",
];

function encodeXML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cfbPath(relativePath) {
  return `Root Entry/${relativePath}`;
}

function getCfbEntry(cfb, relativePath) {
  const entry = CFB.find(cfb, cfbPath(relativePath));
  if (!entry) {
    throw new Error(`Workbook entry not found: ${relativePath}`);
  }
  return entry;
}

function updateStylesWithHeaderStyle(stylesXml) {
  let currentFontsCount = 0;
  let currentFillsCount = 0;
  let currentCellXfsCount = 0;

  stylesXml = stylesXml.replace(
    /<fonts count="(\d+)">([\s\S]*?)<\/fonts>/,
    (_, count, inner) => {
      currentFontsCount = Number(count);
      const headerFontXml =
        '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>';
      return `<fonts count="${currentFontsCount + 1}">${inner}${headerFontXml}</fonts>`;
    }
  );

  stylesXml = stylesXml.replace(
    /<fills count="(\d+)">([\s\S]*?)<\/fills>/,
    (_, count, inner) => {
      currentFillsCount = Number(count);
      const headerFillXml =
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill>';
      return `<fills count="${currentFillsCount + 1}">${inner}${headerFillXml}</fills>`;
    }
  );

  stylesXml = stylesXml.replace(
    /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/,
    (_, count, inner) => {
      currentCellXfsCount = Number(count);
      const headerXfXml = `<xf numFmtId="0" fontId="${currentFontsCount}" fillId="${currentFillsCount}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`;
      return `<cellXfs count="${currentCellXfsCount + 1}">${inner}${headerXfXml}</cellXfs>`;
    }
  );

  return { stylesXml, headerStyleIndex: currentCellXfsCount };
}

function applyHeaderStyleToFirstRow(sheetXml, styleIndex) {
  return sheetXml.replace(
    /(<row\b[^>]*\br="1"[^>]*>)([\s\S]*?)(<\/row>)/,
    (_, rowOpen, cellsXml, rowClose) => {
      const styledCells = cellsXml.replace(/<c\b([^>]*)>/g, (match, attrs) => {
        if (/\bs=/.test(attrs)) return `<c${attrs}>`;
        return `<c s="${styleIndex}"${attrs}>`;
      });
      return `${rowOpen}${styledCells}${rowClose}`;
    }
  );
}

function addFrozenHeaderPane(sheetXml) {
  if (/<pane\b/.test(sheetXml)) return sheetXml;

  const selfClosingPattern =
    /<sheetViews>\s*<sheetView\b([^>]*)\/>\s*<\/sheetViews>/;
  const expandedPattern =
    /<sheetViews>\s*<sheetView\b([^>]*)>([\s\S]*?)<\/sheetView>\s*<\/sheetViews>/;

  if (selfClosingPattern.test(sheetXml)) {
    return sheetXml.replace(
      selfClosingPattern,
      '<sheetViews><sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    );
  }

  if (expandedPattern.test(sheetXml)) {
    return sheetXml.replace(
      expandedPattern,
      '<sheetViews><sheetView$1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>$2</sheetView></sheetViews>'
    );
  }

  return sheetXml;
}

function injectDataValidations(sheetXml, validations) {
  const payload = validations
    .map(
      (v) =>
        `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${v.sqref}"><formula1>${encodeXML(
          v.formula1
        )}</formula1></dataValidation>`
    )
    .join("");

  const block = `<dataValidations count="${validations.length}">${payload}</dataValidations>`;

  if (/<dataValidations\b/.test(sheetXml)) {
    return sheetXml.replace(
      /<dataValidations\b[\s\S]*?<\/dataValidations>/,
      block
    );
  }

  if (sheetXml.includes("<ignoredErrors")) {
    return sheetXml.replace("<ignoredErrors", `${block}<ignoredErrors`);
  }

  return sheetXml.replace("</worksheet>", `${block}</worksheet>`);
}

function buildMainSheet() {
  const rows = [MAIN_HEADERS];

  for (let i = 0; i < TOTAL_TEMPLATE_ROWS; i += 1) {
    rows.push(new Array(MAIN_HEADERS.length).fill(""));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  for (let rowNumber = 2; rowNumber <= TOTAL_TEMPLATE_ROWS + 1; rowNumber += 1) {
    ws[`O${rowNumber}`] = {
      f: `IF(K${rowNumber}="$",CONCATENATE(I${rowNumber},K${rowNumber},J${rowNumber}," ",L${rowNumber},M${rowNumber},N${rowNumber}),CONCATENATE(I${rowNumber},J${rowNumber},K${rowNumber}," ",L${rowNumber},M${rowNumber},N${rowNumber}))`,
      t: "str",
    };
  }

  ws["!cols"] = [
    { wch: 26 },
    { wch: 24 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 10 },
    { wch: 18 },
    { wch: 24 },
    { wch: 10 },
    { wch: 7 },
    { wch: 34 },
    { wch: 16 },
    { wch: 45 },
    { wch: 50 },
    { wch: 24 },
    { wch: 16 },
    { wch: 30 },
    { wch: 24 },
  ];

  return ws;
}

function buildListsSheet() {
  const listColumns = [
    PREFIX_OPTIONS,
    SUFFIX_OPTIONS,
    CATEGORY_OPTIONS,
    PANEL_OPTIONS,
    LINK_INTENT_OPTIONS,
    EXCLUSION_OPTIONS,
  ];

  const maxLength = Math.max(...listColumns.map((list) => list.length));
  const rows = [LIST_HEADERS];

  for (let i = 0; i < maxLength; i += 1) {
    rows.push(listColumns.map((list) => list[i] || ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 34 },
    { wch: 38 },
    { wch: 38 },
    { wch: 24 },
    { wch: 36 },
    { wch: 52 },
  ];

  return ws;
}

function buildDataValidationConfig() {
  return [
    { sqref: "A2:A201", formula1: `'Lists'!$C$2:$C$${CATEGORY_OPTIONS.length + 1}` },
    { sqref: "C2:E201", formula1: '"X"' },
    { sqref: "H2:H201", formula1: `'Lists'!$D$2:$D$${PANEL_OPTIONS.length + 1}` },
    { sqref: "I2:I201", formula1: `'Lists'!$A$2:$A$${PREFIX_OPTIONS.length + 1}` },
    { sqref: "K2:K201", formula1: '"$,%"' },
    { sqref: "L2:L201", formula1: `'Lists'!$B$2:$B$${SUFFIX_OPTIONS.length + 1}` },
    { sqref: "N2:N201", formula1: `'Lists'!$F$2:$F$${EXCLUSION_OPTIONS.length + 1}` },
    { sqref: "S2:S201", formula1: `'Lists'!$E$2:$E$${LINK_INTENT_OPTIONS.length + 1}` },
  ];
}

function buildWorkbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildMainSheet(), "Main Page");
  XLSX.utils.book_append_sheet(workbook, buildListsSheet(), "Lists");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
    compression: true,
  });
}

function generateTemplateWorkbook(outputPath) {
  const baseBuffer = buildWorkbookBuffer();
  const cfb = CFB.read(baseBuffer, { type: "buffer" });

  const stylesEntry = getCfbEntry(cfb, "xl/styles.xml");
  const mainSheetEntry = getCfbEntry(cfb, "xl/worksheets/sheet1.xml");
  const listsSheetEntry = getCfbEntry(cfb, "xl/worksheets/sheet2.xml");

  const stylesXml = stylesEntry.content.toString("utf8");
  const mainSheetXml = mainSheetEntry.content.toString("utf8");
  const listsSheetXml = listsSheetEntry.content.toString("utf8");

  const { stylesXml: updatedStylesXml, headerStyleIndex } =
    updateStylesWithHeaderStyle(stylesXml);

  let updatedMainSheetXml = applyHeaderStyleToFirstRow(
    mainSheetXml,
    headerStyleIndex
  );
  updatedMainSheetXml = addFrozenHeaderPane(updatedMainSheetXml);
  updatedMainSheetXml = injectDataValidations(
    updatedMainSheetXml,
    buildDataValidationConfig()
  );

  let updatedListsSheetXml = applyHeaderStyleToFirstRow(
    listsSheetXml,
    headerStyleIndex
  );
  updatedListsSheetXml = addFrozenHeaderPane(updatedListsSheetXml);

  stylesEntry.content = Buffer.from(updatedStylesXml, "utf8");
  mainSheetEntry.content = Buffer.from(updatedMainSheetXml, "utf8");
  listsSheetEntry.content = Buffer.from(updatedListsSheetXml, "utf8");

  const outputBuffer = CFB.write(cfb, {
    type: "buffer",
    fileType: "zip",
    compression: true,
  });

  fs.writeFileSync(outputPath, outputBuffer);
}

function main() {
  const outputPath = path.resolve(process.cwd(), OUTPUT_FILE);
  generateTemplateWorkbook(outputPath);
  console.log(`Created template: ${outputPath}`);
}

main();
