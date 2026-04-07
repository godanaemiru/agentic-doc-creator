const docx = require("docx");
const fs = require("fs");

async function generateDocx(title, content, fileName) {
    const doc = new docx.Document({
        sections: [{
            properties: {},
            children: [
                new docx.Paragraph({
                    text: title,
                    heading: docx.HeadingLevel.HEADING_1,
                    alignment: docx.AlignmentType.CENTER,
                }),
                new docx.Paragraph({
                    text: content,
                    spacing: { before: 400}
                }),
            ],
        }],
    });

    const buffer = await docx.Packer.toBuffer(doc);
    fs.writeFileSync(`${fileName}.docx`, buffer );

    console.log(`Success! File saved locally as ${fileName}.docx`);
    return `${fileName}.docx successfully created.`;
}

generateDocx(
    "Q3 Initial Findings",
    "This is a test paragraph",
    "Test_Report"
);
