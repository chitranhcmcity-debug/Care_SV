const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const SCREENSHOT_DIR = path.join(__dirname, '../test_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function createMultiCourseExcel() {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: CD25CT1
  const sheet1 = workbook.addWorksheet('CD25CT1');
  sheet1.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'MSSV', key: 'mssv', width: 15 },
    { header: 'Họ và tên', key: 'name', width: 22 },
    { header: 'Lớp', key: 'class', width: 12 },
    { header: 'SĐT Sinh Viên', key: 'phone', width: 16 },
    { header: 'SĐT Phụ Huynh', key: 'parentPhone', width: 16 },
    { header: 'Nhóm HP 1', key: 'hp1', width: 30 },
    { header: 'Nhóm HP 2', key: 'hp2', width: 30 },
  ];

  sheet1.addRow({
    stt: 1,
    mssv: '501250101',
    name: 'Trần Minh Triết',
    class: 'CD25CT1',
    phone: '0908111222',
    parentPhone: '0989111222',
    hp1: '501_MMT_HK1_26.27_CD25LM',
    hp2: '602_LTTT_HK1_26.27', // Student enrolled in 2 course groups!
  });

  sheet1.addRow({
    stt: 2,
    mssv: '501250102',
    name: 'Lê Phạm Ngọc Anh',
    class: 'CD25CT1',
    phone: '0908333444',
    parentPhone: '0989333444',
    hp1: '501_MMT_HK1_26.27_CD25LM',
    hp2: '',
  });

  // Sheet 2: CL25TM1
  const sheet2 = workbook.addWorksheet('CL25TM1');
  sheet2.columns = [
    { header: 'STT', key: 'stt', width: 6 },
    { header: 'MSSV', key: 'mssv', width: 15 },
    { header: 'Họ và tên', key: 'name', width: 22 },
    { header: 'Lớp', key: 'class', width: 12 },
    { header: 'SĐT Sinh Viên', key: 'phone', width: 16 },
    { header: 'SĐT Phụ Huynh', key: 'parentPhone', width: 16 },
    { header: 'Nhóm HP 1', key: 'hp1', width: 30 },
  ];

  sheet2.addRow({
    stt: 1,
    mssv: '602250103',
    name: 'Phạm Quốc Huy',
    class: 'CL25TM1',
    phone: '0908555666',
    parentPhone: '0989555666',
    hp1: '501_MMT_HK1_26.27_CD25LM',
  });

  const filePath = path.join(__dirname, 'test_multi_course_import.xlsx');
  await workbook.xlsx.writeFile(filePath);
  console.log('✅ Created test Excel file with multi-course enrollment:', filePath);
  return filePath;
}

async function runE2E() {
  const excelFilePath = await createMultiCourseExcel();

  const candidatePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const executablePath = candidatePaths.find((p) => fs.existsSync(p));
  console.log('🌐 Using system browser at:', executablePath);

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    defaultViewport: { width: 1366, height: 900 },
  });

  const page = await browser.newPage();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function clickButtonByText(matchText) {
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.toLowerCase().includes(matchText.toLowerCase())) {
        await btn.click();
        return true;
      }
    }
    return false;
  }

  try {
    console.log('🚀 STAGE 1: Admin Configuration & Setup...');
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_0_Admin_Login.png') });

    // Login as Admin
    await page.type('input[type="email"]', 'admin@itc.edu.vn');
    await page.type('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_1_Admin_Dashboard.png') });

    // Go to System Config Tab
    await clickButtonByText('Cấu Hình');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_2_System_Config_Master.png') });

    // Go to Excel Import Tab
    await clickButtonByText('Nhập Sinh Viên');
    await sleep(1000);

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(excelFilePath);
      await sleep(1000);
      await clickButtonByText('Tải Up');
      await sleep(3500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_3_Excel_Multi_Course_Import.png') });

    // Go to Staff Management Tab
    await clickButtonByText('Nhân Sự CSKH');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_4_Staff_Management_Assigned_Classes.png') });

    // STAGE 2: Attendance Marking & Auto Task Routing
    console.log('📅 STAGE 2: Attendance Marking & Auto Routing...');
    await clickButtonByText('Cấu Hình Học Phần');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '2_1_Course_Group_List.png') });

    // STAGE 3: CSKH Task Queue & CRM Operations
    console.log('📞 STAGE 3: CSKH Task Operations & 360 Profile...');
    // Click Navbar Call Tasks link
    const navLinks = await page.$$('a');
    for (const link of navLinks) {
      const href = await page.evaluate((el) => el.getAttribute('href'), link);
      const text = await page.evaluate((el) => el.textContent, link);
      if (href === '/call-tasks' || (text && text.includes('Gọi Điện'))) {
        await link.click();
        break;
      }
    }
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '3_1_CSKH_Call_Task_Center.png') });

    // Try opening Student 360° Profile
    const profile360Btn = await clickButtonByText('Hồ Sơ Sinh Viên 360°');
    if (profile360Btn) {
      await sleep(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '3_2_Student_360_Profile_Modal.png') });
      // Close modal
      await clickButtonByText('Đóng Hồ Sơ');
      await sleep(500);
    }

    // STAGE 4: Analytics, Exam Ban Warnings & Handover 1-Click
    console.log('📈 STAGE 4: Analytics & Handover 1-Click...');
    const navLinks2 = await page.$$('a');
    for (const link of navLinks2) {
      const text = await page.evaluate((el) => el.textContent, link);
      if (text && text.includes('Quản Trị')) {
        await link.click();
        break;
      }
    }
    await sleep(1500);

    await clickButtonByText('Thống Kê');
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4_1_Analytics_Exam_Ban_Report.png') });

    await clickButtonByText('Nhân Sự CSKH');
    await sleep(1000);
    await clickButtonByText('BÀN GIAO LỚP 1-CLICK');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4_2_Handover_1_Click_Modal.png') });

    console.log('🎉 E2E Puppeteer Execution & Screenshots Generation Completed!');
  } catch (err) {
    console.error('❌ E2E Script Error:', err);
  } finally {
    await browser.close();
  }
}

runE2E();
