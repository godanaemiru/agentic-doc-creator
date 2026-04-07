const minimist = require("minimist");
const fs = require("fs");
const docx = require("docx");
const PptxGenJS = require("pptxgenjs");
const PDFDocument = require("pdfkit");
const ExcelJS = require("exceljs");

// Parse the flags coming from the shell script
const args = minimist(process.argv.slice(2));
const fileType = args.type;
const title = args.title || "Agent Output";
const content = args.content || "No content provided.";
const fileName = `Agent_Output_${Date.now()}`;

async function generateFile() {
    console.log(`\n⚙️  Generator Engine started. Building a .${fileType} file...`);

    try {
        switch (fileType) {
            case "docx":
                const doc = new docx.Document({
                    sections: [{
                        properties: {},
                        children: [
                            new docx.Paragraph({ text: title, heading: docx.HeadingLevel.HEADING_1 }),
                            new docx.Paragraph({ text: content, spacing: { before: 400 } })
                        ]
                    }]
                });
                const buffer = await docx.Packer.toBuffer(doc);
                fs.writeFileSync(`${fileName}.docx`, buffer);
                break;

            case "pptx":
                let pres = new PptxGenJS();
                let slide = pres.addSlide();
                slide.addText(title, { x: 0.5, y: 0.5, w: 9, fontSize: 32, bold: true, align: "center" });
                slide.addText(content, { x: 0.5, y: 2.0, w: 9, fontSize: 18, align: "left" });
                await pres.writeFile({ fileName: `${fileName}.pptx` });
                break;

            case "pdf":
                const pdf = new PDFDocument();
                pdf.pipe(fs.createWriteStream(`${fileName}.pdf`));
                pdf.fontSize(25).text(title, { align: 'center' });
                pdf.moveDown();
                pdf.fontSize(14).text(content);
                pdf.end();
                break;

            case "excel":
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet("Data");
                sheet.columns = [
                    { header: "Title", key: "title", width: 30 },
                    { header: "Generated Content", key: "content", width: 80 }
                ];
                sheet.addRow({ title: title, content: content });
                await workbook.xlsx.writeFile(`${fileName}.xlsx`);
                break;

            default:
                console.error(`❌ Unsupported file type: ${fileType}`);
                process.exit(1);
        }
        console.log(`✅ Success! Saved as ${fileName}.${fileType}`);
    } catch (error) {
        console.error("❌ Error generating file:", error);
    }
}

generateFile();