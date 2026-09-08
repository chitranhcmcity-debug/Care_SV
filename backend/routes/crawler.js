const { verifyToken, requireAdmin } = require('../middleware/auth');
const { assert } = require('../utils/validation');
const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const Student = require('../models/Student');

const TARGET_URL = 'https://dkhp.itc.edu.vn/TraCuuThongTin.aspx';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET /api/crawler/scan-progress
router.get('/scan-progress', verifyToken, requireAdmin, async (req, res, next) => {
  // Parse query parameters
  const rawPrefixes = req.query.prefixes
    ? String(req.query.prefixes)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['501', '602', '502', '601', '401', '402', '701'];

  const rawYears = req.query.years
    ? String(req.query.years)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['25', '26'];

  const startSeq = parseInt(req.query.startSeq || '1', 10);
  const endSeq = parseInt(req.query.endSeq || '100', 10);
  const concurrency = Math.min(Math.max(parseInt(req.query.concurrency || '6', 10), 1), 15);

  assert(
    rawPrefixes.length <= 20 && rawPrefixes.every((p) => /^\d{3}$/.test(p)),
    'Invalid prefixes',
  );
  assert(rawYears.length <= 10 && rawYears.every((y) => /^\d{2}$/.test(y)), 'Invalid years');
  assert(
    Number.isInteger(startSeq) &&
      Number.isInteger(endSeq) &&
      startSeq >= 1 &&
      endSeq <= 999 &&
      startSeq <= endSeq,
    'Invalid sequence range',
  );
  assert(Number.isInteger(concurrency), 'Invalid concurrency');
  assert(
    rawPrefixes.length * rawYears.length * (endSeq - startSeq + 1) <= 10000,
    'Scan is too large',
  );
  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let isAborted = false;
  req.on('close', () => {
    isAborted = true;
    console.log(' 🛑 [SSE Crawler] Client đã gửi tín hiệu Dừng Quét (Close Connection).');
  });

  // Generate target MSSV list with EXACT 9-DIGIT FORMULA: [Prefix 3][Year 2]0[Seq 3]
  const mssvList = [];
  for (const yr of rawYears) {
    for (const prefix of rawPrefixes) {
      for (let i = startSeq; i <= endSeq; i++) {
        const indexStr = i.toString().padStart(3, '0');
        const mssv = `${prefix}${yr}0${indexStr}`;
        mssvList.push(mssv);
      }
    }
  }

  const totalTasks = mssvList.length;
  let currentTask = 0;
  let foundCount = 0;

  // Step 1: Initial GET to fetch ASP.NET viewstate, viewstategenerator & eventvalidation
  let viewState = '';
  let viewStateGenerator = '';
  let eventValidation = '';
  let sessionCookies = null;

  try {
    const initRes = await axios.get(TARGET_URL, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const $ = cheerio.load(initRes.data);
    viewState = $('#__VIEWSTATE').val() || '';
    viewStateGenerator = $('#__VIEWSTATEGENERATOR').val() || '';
    eventValidation = $('#__EVENTVALIDATION').val() || '';
    sessionCookies = initRes.headers['set-cookie'];
  } catch (initErr) {
    console.warn(' ⚠️ [Crawler] Không thể lấy ViewState ban đầu:', initErr.message);
  }

  // Helper scraper function per single MSSV
  async function scrapeSingleStudent(mssv) {
    if (!viewState || !eventValidation) return null;

    try {
      const params = new URLSearchParams();
      params.append('__VIEWSTATE', viewState);
      if (viewStateGenerator) params.append('__VIEWSTATEGENERATOR', viewStateGenerator);
      params.append('__EVENTVALIDATION', eventValidation);
      params.append('ctl00$ContentPlaceHolder1$txtMaSinhVien', mssv);
      params.append('ctl00$ContentPlaceHolder1$btnXemDiemSV', 'Xem điểm');

      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      };
      if (sessionCookies) {
        headers['Cookie'] = sessionCookies.map((c) => c.split(';')[0]).join('; ');
      }

      const postRes = await axios.post(TARGET_URL, params.toString(), {
        timeout: 8000,
        headers,
      });

      const $ = cheerio.load(postRes.data);
      // Correct ASP.NET element IDs from dkhp.itc.edu.vn/TraCuuThongTin.aspx
      const nameText = $('#ContentPlaceHolder1_lblHoTen').text().trim();
      const classText = $('#ContentPlaceHolder1_lblLopHoc').text().trim();
      const dobText = $('#ContentPlaceHolder1_lblNgaySinh').text().trim();
      const majorText = $('#ContentPlaceHolder1_lblNganhHoc').text().trim();

      if (nameText && nameText.length > 0) {
        const student = await Student.findOneAndUpdate(
          { studentCode: mssv },
          {
            studentCode: mssv,
            fullName: nameText,
            classCode: classText || 'K25/26',
            dob: dobText || '',
            major: majorText || 'Công nghệ Thông tin',
          },
          { upsert: true, returnDocument: 'after' },
        );
        return student;
      }
    } catch (err) {
      // Isolate error per request
    }
    return null;
  }

  // Step 2: Concurrency Batching processing
  for (let i = 0; i < mssvList.length; i += concurrency) {
    if (isAborted) {
      console.log(' 🛑 [Crawler] Dừng tiến trình quét thành công theo lệnh Admin.');
      break;
    }

    const chunk = mssvList.slice(i, i + concurrency);
    const results = await Promise.allSettled(chunk.map((mssv) => scrapeSingleStudent(mssv)));

    const batchFoundStudents = [];
    results.forEach((res) => {
      if (res.status === 'fulfilled' && res.value) {
        batchFoundStudents.push(res.value);
        foundCount++;
      }
    });

    currentTask += chunk.length;
    const percent = Math.min(Math.round((currentTask / totalTasks) * 100), 100);

    // Send real-time SSE update with batch results
    res.write(
      'data: ' +
        JSON.stringify({
          percent,
          currentTask: Math.min(currentTask, totalTasks),
          totalTasks,
          foundCount,
          currentMssv: chunk.join(', '),
          batchFound: batchFoundStudents.map((st) => ({
            _id: st._id,
            studentCode: st.studentCode,
            fullName: st.fullName,
            classCode: st.classCode,
            major: st.major,
            dob: st.dob,
          })),
        }) +
        '\n\n',
    );

    // Small delay between batches to ensure ASP.NET stability
    await sleep(80);
  }

  // Final SSE completion response
  if (!isAborted) {
    res.write(
      'data: ' +
        JSON.stringify({
          completed: true,
          percent: 100,
          currentTask: totalTasks,
          totalTasks,
          foundCount,
          message: `Hoàn tất cào dữ liệu sinh viên! Tìm thấy ${foundCount} sinh viên trên cổng trường.`,
        }) +
        '\n\n',
    );
    res.end();
  }
});

module.exports = router;
