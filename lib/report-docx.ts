import 'server-only';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from 'docx';
import type { UplineReport, ReportTable } from '@/lib/upline-report';

// The .docx that gets attached to the email. Same content as the on-screen
// preview, laid out like the issued form: header block, then each numbered line
// as "N. Label: value", its definition paragraph, and its table.
//
// Blank rows are printed for an empty table on purpose — the paper form has the
// skeleton whether or not there was activity that week, and a recipient reading
// a missing table as "not reported" rather than "nothing happened" is exactly
// the ambiguity the skeleton removes.

const FONT = 'Calibri';

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold, font: FONT, size: 20 })],
      }),
    ],
  });
}

function table(t: ReportTable): Table {
  const header = new TableRow({
    tableHeader: true,
    children: t.columns.map((c) => cell(c, true)),
  });
  const bodyRows = t.rows.length
    ? t.rows.map((r) => new TableRow({ children: r.map((v) => cell(v)) }))
    : Array.from(
        { length: Math.max(t.blankRows, 1) },
        () => new TableRow({ children: t.columns.map(() => cell('')) }),
      );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...bodyRows],
  });
}

export async function reportDocx(report: UplineReport): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({ text: `Stat form for ${report.orgName}`, bold: true, font: FONT, size: 28 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: `For W/Eing ${report.weekLabel}`, font: FONT, size: 24 }),
      ],
    }),
    new Paragraph({ children: [] }),
  ];

  for (const l of report.lines) {
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 60 },
        children: [
          new TextRun({ text: `${l.line}. ${l.label}: `, bold: true, font: FONT, size: 24 }),
          new TextRun({ text: l.value === '' ? '0' : l.value, bold: true, font: FONT, size: 24 }),
        ],
      }),
    );
    if (l.definition && l.definition.trim() !== '') {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: l.definition, italics: true, font: FONT, size: 20 })],
        }),
      );
    }
    if (l.table) {
      children.push(table(l.table));
      children.push(new Paragraph({ children: [] }));
    }
  }

  const doc = new Document({
    creator: 'OT Committee Coordination System',
    title: `Stat form for ${report.orgName} — W/Eing ${report.weekLabel}`,
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
