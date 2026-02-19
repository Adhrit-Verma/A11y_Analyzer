// src/services/staticTools.js
const puppeteer = require("puppeteer");
const { AxePuppeteer } = require("@axe-core/puppeteer");

const lighthouseModule = require("lighthouse");
const lighthouse =
  typeof lighthouseModule === "function" ? lighthouseModule : lighthouseModule.default;

const chromeLauncher = require("chrome-launcher");

/** Keep your existing logic exactly */
async function fetchHtml(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch URL: ${resp.status}`);
  }
  return await resp.text();
}

function detectSecurityChallenge(html) {
  const lower = html.toLowerCase();

  if (
    lower.includes("cloudflare") &&
    (lower.includes("one more step") || lower.includes("checking your browser"))
  ) {
    return "cloudflare";
  }

  // add more providers here if you want later
  return null;
}

function computeSeveritySummaryFromAxe(axeResults) {
  const summary = { critical: 0, high: 0, moderate: 0, low: 0 };
  if (!axeResults || !Array.isArray(axeResults.violations)) return summary;

  for (const v of axeResults.violations) {
    const impact = (v.impact || "minor").toLowerCase();
    if (impact === "critical") summary.critical++;
    else if (impact === "serious") summary.high++;
    else if (impact === "moderate") summary.moderate++;
    else summary.low++; // minor, unknown → low
  }

  return summary;
}

// src/services/staticTools.js
async function runAxe(url) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    const htmlSnapshot = await page.content();

    const axe = new AxePuppeteer(page);
    const results = await axe.analyze();

    // ✅ Enrich axe nodes with xpath + line for better preview + code-fix
    const getXPathInPage = async (selector) => {
      if (!selector) return null;
      try {
        return await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;

          function getXPath(node) {
            if (node.id) return `//*[@id="${node.id}"]`;
            const parts = [];
            while (node && node.nodeType === Node.ELEMENT_NODE) {
              let index = 1;
              let sib = node.previousElementSibling;
              while (sib) {
                if (sib.tagName === node.tagName) index++;
                sib = sib.previousElementSibling;
              }
              parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
              node = node.parentElement;
            }
            return "/" + parts.join("/");
          }

          return getXPath(el);
        }, selector);
      } catch {
        return null;
      }
    };

    const findApproxLine = (needle, haystack) => {
      if (!needle || !haystack) return null;
      const idx = haystack.indexOf(needle);
      if (idx === -1) return null;
      // count newlines before idx
      let line = 1;
      for (let i = 0; i < idx; i++) {
        if (haystack.charCodeAt(i) === 10) line++;
      }
      return line;
    };

    if (Array.isArray(results.violations)) {
      for (const v of results.violations) {
        if (!Array.isArray(v.nodes)) continue;

        for (const n of v.nodes) {
          const selector = Array.isArray(n.target) ? n.target[0] : null;
          n.selector = selector || null;

          // xpath from live DOM
          n.xpath = await getXPathInPage(selector);

          // approx line in snapshot html (best-effort)
          n.line = findApproxLine(n.html, htmlSnapshot);
        }
      }
    }

    return { axe: results, htmlSnapshot };
  } finally {
    await browser.close();
  }
}


async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless", "--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const options = {
      logLevel: "info",
      output: "json",
      onlyCategories: ["accessibility"],
      port: chrome.port
    };

    const runnerResult = await lighthouse(url, options);
    const lhr = runnerResult.lhr;
    return {
      score: lhr.categories?.accessibility?.score ?? null,
      audits: lhr.audits
    };
  } finally {
    await chrome.kill();
  }
}

async function runStaticTools(url) {
  const axeP = runAxe(url).catch((e) => ({ __error: e?.message || String(e) }));
  const lhP = runLighthouse(url).catch((e) => ({ __error: e?.message || String(e) }));

  const [axeRes, lhRes] = await Promise.all([axeP, lhP]);

  return {
    axe: axeRes?.axe || null,
    htmlSnapshot: axeRes?.htmlSnapshot || null,
    lighthouse: lhRes?.audits ? lhRes : null,
    errors: {
      axe: axeRes?.__error || null,
      lighthouse: lhRes?.__error || null,
    },
  };
}


// ADD inside src/services/staticTools.js

async function runAxeOnHtml(html) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();

    // setContent is perfect for uploaded HTML
    await page.setContent(String(html || ""), { waitUntil: "domcontentloaded" });

    const htmlSnapshot = await page.content();

    const axe = new AxePuppeteer(page);
    const results = await axe.analyze();

    // reuse the same enrichment logic you already do in runAxe(url)
    const getXPathInPage = async (selector) => {
      if (!selector) return null;
      try {
        return await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;

          function getXPath(node) {
            if (node.id) return `//*[@id="${node.id}"]`;
            const parts = [];
            while (node && node.nodeType === Node.ELEMENT_NODE) {
              let index = 1;
              let sib = node.previousElementSibling;
              while (sib) {
                if (sib.tagName === node.tagName) index++;
                sib = sib.previousElementSibling;
              }
              parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
              node = node.parentElement;
            }
            return "/" + parts.join("/");
          }
          return getXPath(el);
        }, selector);
      } catch {
        return null;
      }
    };

    const findApproxLine = (needle, haystack) => {
      if (!needle || !haystack) return null;
      const idx = haystack.indexOf(needle);
      if (idx === -1) return null;
      let line = 1;
      for (let i = 0; i < idx; i++) if (haystack.charCodeAt(i) === 10) line++;
      return line;
    };

    if (Array.isArray(results.violations)) {
      for (const v of results.violations) {
        if (!Array.isArray(v.nodes)) continue;
        for (const n of v.nodes) {
          const selector = Array.isArray(n.target) ? n.target[0] : null;
          n.selector = selector || null;
          n.xpath = await getXPathInPage(selector);
          n.line = findApproxLine(n.html, htmlSnapshot);
        }
      }
    }

    return { axe: results, htmlSnapshot };
  } finally {
    await browser.close();
  }
}


module.exports = {
  fetchHtml,
  detectSecurityChallenge,
  computeSeveritySummaryFromAxe,
  runAxe,
  runAxeOnHtml,
  runLighthouse,
  runStaticTools,
};
