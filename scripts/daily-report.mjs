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

function buildReport(date, rows) {
  const total = rows.length;
  let body = `Warbixinta Maalinlaha ah - Ballamaha EMIS\nTaariikhda: ${date}\n\nWadarta guud ee ballamaha maanta: ${total}\n\n`;

  if (total === 0) {
    body += 'Maanta ballamo lama qorin.\n';
    return body;
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
    body += `${district} (${list.length}):\n`;
    for (const r of list) {
      const school = r.schools ? r.schools.school_name : 'N/A';
      const ht = r.schools ? r.schools.headteacher_name : 'N/A';
      const time = (r.visit_time || '').slice(0, 5);
      const reason = r.reason || '-';
      body += `  - ${time} | ${school} | ${ht} | ${reason}\n`;
    }
    body += '\n';
  }

  return body;
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
