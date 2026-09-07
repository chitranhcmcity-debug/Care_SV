const axios = require('axios');
const ExcelJS = require('exceljs');
const fs = require('fs');

async function main() {
  try {
    console.log('Downloading export-template...');
    const response = await axios.get('http://localhost:5000/api/excel/export-template', {
      responseType: 'arraybuffer'
    });

    console.log('Parsing Excel...');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.data);

    // Get the first sheet (e.g., CD25CT1)
    const sheet = workbook.worksheets[0];
    console.log(`Editing sheet: ${sheet.name}`);

    // Assuming row 1 is header, row 2 is the first student
    const row = sheet.getRow(2);
    if (row && row.getCell(1).value) { // Mã SV
      console.log(`Original Phone: ${row.getCell(5).value}, Original Parent Phone: ${row.getCell(6).value}`);
      row.getCell(5).value = '0999999999'; // SĐT Sinh Viên
      row.getCell(6).value = '0888888888'; // SĐT Phụ Huynh
      row.commit();
      console.log('Updated phone numbers in the Excel sheet.');
    } else {
      console.log('No student found in row 2.');
    }

    const filepath = './import_test.xlsx';
    await workbook.xlsx.writeFile(filepath);
    console.log(`Saved updated Excel to ${filepath}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
