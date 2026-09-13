// Daily EMIS appointments report — runs via GitHub Actions on a schedule.
// Pulls today's confirmed appointments from Supabase, groups by district,
// and emails a summary via EmailJS.

const SUPABASE_URL = 'https://azojuqacdfdqvckjgbfu.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAILJS_PUBLIC_KEY = 'h99ky9kc3zYqny71H';
const EMAILJS_SERVICE_ID = 'service_amks3ym';
const EMAILJS_REPORT_TEMPLATE_ID = 'template_es8sqtg';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY;

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

async function fetchTodaysAppointments(date) {
  const url = `${SUPABASE_URL}/rest/v1/appointments`
    + `?visit_date=eq.${date}`
    + `&status=eq.confirmed`
    + `&select=district,visit_time,reason,schools(school_name,headteacher_name)`
    + `&order=district.asc,visit_time.asc`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase fetch failed: ${res.status} ${text}`);
  }
  return res.json();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildReport(date, rows) {
  const total = rows.length;
  const BANNER = 'https://jubaland-emis.github.io/jubaland-header.png';

  let html = `
  <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#26231F;">
    <img src="${BANNER}" alt="Ministry of Education Jubaland" style="width:100%;max-width:600px;display:block;margin-bottom:16px;">

    <div style="border:1px solid #ccc;border-radius:6px;padding:14px;text-align:center;margin-bottom:14px;">
      <div style="font-weight:bold;font-size:16px;">Warbixinta Maalinlaha ah - Ballamaha EMIS</div>
      <div style="font-size:13px;color:#555;margin-top:4px;">Taariikhda: ${escapeHtml(date)}</div>
    </div>

    <div style="text-align:center;font-weight:bold;font-size:15px;margin-bottom:20px;">
      Wadarta guud ee ballamaha maanta: ${total}
    </div>
  `;

  if (total === 0) {
    html += `
    <div style="border:1px solid #ddd;border-radius:6px;padding:20px;text-align:center;color:#555;">
      Maanta ballamo lama qorin.
    </div>
    </div>`;
    return html;
  }

  const byDistrict = {};
  for (const row of rows) {
    const d = row.district;
    if (!byDistrict[d]) byDistrict[d] = [];
    byDistrict[d].push(row);
  }

  const districts = Object.keys(byDistrict).sort();
  for (const district of districts) {
    const list = byDistrict[district];
    html += `
    <div style="background:#1E3A34;color:#fff;font-weight:bold;padding:8px 12px;border-radius:6px 6px 0 0;">
      ${escapeHtml(district)} (${list.length})
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
    `;
    list.forEach((r, i) => {
      const school = r.schools ? r.schools.school_name : 'N/A';
      const ht = r.schools ? r.schools.headteacher_name : 'N/A';
      const time = (r.visit_time || '').slice(0, 5);
      const reason = r.reason || '-';
      const bg = i % 2 === 0 ? '#f7f4ec' : '#ffffff';
      html += `
      <tr style="background:${bg};">
        <td style="border:1px solid #ddd;padding:8px;font-weight:bold;white-space:nowrap;">${escapeHtml(time)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(school)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(ht)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(reason)}</td>
      </tr>
      `;
    });
    html += `</table>`;
  }

  html += `</div>`;
  return html;
}

async function sendReportEmail(reportBody) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_REPORT_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: EMAILJS_PRIVATE_KEY,
      template_params: {
        report_body: reportBody
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS send failed: ${res.status} ${text}`);
  }
  console.log('Report email sent successfully.');
}

async function main() {
  const date = todayISO();
  console.log(`Building report for ${date}...`);
  const rows = await fetchTodaysAppointments(date);
  const report = buildReport(date, rows);
  console.log(report);
  await sendReportEmail(report);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
