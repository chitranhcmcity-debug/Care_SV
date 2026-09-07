const axios = require('axios');
const cheerio = require('cheerio');

async function testCrawlerExact() {
  const url = 'https://dkhp.itc.edu.vn/TraCuuThongTin.aspx';

  console.log('🔄 GET requesting target page:', url);
  const getRes = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const $ = cheerio.load(getRes.data);
  const viewState = $('#__VIEWSTATE').val() || '';
  const viewStateGenerator = $('#__VIEWSTATEGENERATOR').val() || '';
  const eventValidation = $('#__EVENTVALIDATION').val() || '';
  const cookies = getRes.headers['set-cookie'];

  console.log('ViewState length:', viewState.length);
  console.log('ViewStateGenerator:', viewStateGenerator);
  console.log('EventValidation length:', eventValidation.length);

  // Test sequence 1..30 for 50125, 60225, 50124, 60224, 50225, 60125
  const testMssvs = [];
  const prefixes = ['501', '602', '502', '601', '401', '402', '701'];
  const years = ['25', '24', '23'];

  for (const yr of years) {
    for (const prefix of prefixes) {
      for (let i = 1; i <= 20; i++) {
        const indexStr = i.toString().padStart(3, '0');
        testMssvs.push(`${prefix}${yr}0${indexStr}`);
      }
    }
  }

  console.log(`\n🔍 Đang test cào ${testMssvs.length} MSSV...`);
  let found = 0;

  for (const mssv of testMssvs) {
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
    if (cookies) {
      headers['Cookie'] = cookies.map((c) => c.split(';')[0]).join('; ');
    }

    try {
      const postRes = await axios.post(url, params.toString(), { headers, timeout: 5000 });
      const $post = cheerio.load(postRes.data);

      const fullName = $post('#ContentPlaceHolder1_lblHoTen').text().trim();
      const classCode = $post('#ContentPlaceHolder1_lblLopHoc').text().trim();
      const dob = $post('#ContentPlaceHolder1_lblNgaySinh').text().trim();
      const major = $post('#ContentPlaceHolder1_lblNganhHoc').text().trim();

      if (fullName) {
        found++;
        console.log(`✅ FOUND [${mssv}]: Họ tên="${fullName}", Lớp="${classCode}", Ngày sinh="${dob}", Ngành="${major}"`);
      }
    } catch (err) {
      console.error(`❌ Error scanning ${mssv}:`, err.message);
    }
  }

  console.log(`\n🎉 TỔNG KẾT: Đã tìm thấy ${found} sinh viên!`);
}

testCrawlerExact();
