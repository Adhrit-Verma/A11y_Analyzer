// src/routes/preview.js
const express = require("express");
const { loadAnalysis } = require("../state/analysesStore");

const router = express.Router();
function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).send("Unauthorized");
  next();
}

function extractBodyContent(html) {
  if (typeof html !== "string") return "";

  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1] : html;
}

function stripScripts(html) {
  if (typeof html !== "string") return "";

  return html.replace(
    /<script[\s\S]*?<\/script>/gi,
    ""
  );
}

router.get("/preview/:analysisId", requireAuth, async (req, res) => {
  const analysis = await loadAnalysis(req.session.user.id, req.params.analysisId);

  if (!analysis || !analysis.html) {
    return res.status(404).send("<h1>No preview available</h1>");
  }
  
  const snapshotHtml = analysis.html;

  let bodyContent = extractBodyContent(snapshotHtml);
  bodyContent = stripScripts(bodyContent);

  const highlightScript = `
<script>
window.addEventListener('message', function(event) {
  var data = event.data || {};
  if (data.type === 'scrollToSelector' && data.selector) {
    try {
      var el = document.querySelector(data.selector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var oldOutline = el.style.outline;
        el.style.outline = '3px solid #ff2bd6';
        setTimeout(function(){ el.style.outline = oldOutline; }, 1800);
      }
    } catch (e) {}
  }
});
</script>`;

  const htmlShell = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Preview</title>
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, Arial; }
  </style>
</head>
<body>
  ${bodyContent}
  ${highlightScript}
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(htmlShell);
});

module.exports = router;
