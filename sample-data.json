// PDF rendering + email sending for the RRG SSC mailer.
const puppeteer = require('puppeteer');
const { buildHtml } = require('./template.js');

const CC_ALWAYS = process.env.CC_ALWAYS || 'van@rrgcre.com';

async function renderPdf(data) {
  const html = buildHtml(data);
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({ printBackground: true, preferCSSPageSize: true, format: 'Letter' });
  } finally {
    await browser.close();
  }
}

async function sendSsc(data, transport) {
  const pdf = await renderPdf(data);
  const concept = data.concept || 'Concept';
  const filename = `SSC_${concept.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '')}.pdf`;
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || CC_ALWAYS,
    to: data.repEmail,
    cc: CC_ALWAYS,
    subject: `Site Selection Criteria — ${concept}`,
    text: `Attached is the completed Site Selection Criteria for ${concept}.\n\nCompleted via the RRG SSC intake form.\n\n— Restaurant Realty Group, LLC`,
    attachments: [{ filename, content: pdf, contentType: 'application/pdf' }],
  });
  return { info, filename, size: pdf.length };
}

module.exports = { renderPdf, sendSsc, CC_ALWAYS };
