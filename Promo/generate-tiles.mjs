/**
 * Generate Chrome Web Store promotional tiles for IntelliTab.
 *
 * Outputs:
 *   assets/small-promo-tile.png   (440x280)
 *   assets/marquee-promo-tile.png (1400x560)
 *
 * Usage:
 *   node promo/generate-tiles.mjs
 */

import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, 'assets');

// ─── Shared styles ──────────────────────────────────────────────────

const sharedCSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #0f0f0f;
    color: #ffffff;
    overflow: hidden;
  }

  .gradient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.35;
  }

  .orb-1 {
    width: 300px; height: 300px;
    background: radial-gradient(circle, #6366f1, transparent);
    top: -80px; right: -60px;
  }

  .orb-2 {
    width: 250px; height: 250px;
    background: radial-gradient(circle, #ec4899, transparent);
    bottom: -60px; left: -40px;
  }

  .orb-3 {
    width: 200px; height: 200px;
    background: radial-gradient(circle, #06b6d4, transparent);
    top: 40%; left: 30%;
  }

  .container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    z-index: 1;
  }

  .logo-icon {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .logo-icon svg {
    flex-shrink: 0;
  }

  .tag {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .tag-ai    { background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3); }
  .tag-learn { background: rgba(236,72,153,0.2); color: #f9a8d4; border: 1px solid rgba(236,72,153,0.3); }
  .tag-save  { background: rgba(6,182,212,0.2);  color: #67e8f9; border: 1px solid rgba(6,182,212,0.3); }

  .tab-group-demo {
    display: flex;
    gap: 3px;
    align-items: center;
  }

  .tab-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }

  .group-label {
    font-size: 9px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    margin-right: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const sparklesSVG = `
<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #a5b4fc;">
  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
</svg>`;

// ─── Small promo tile (440x280) ─────────────────────────────────────

const smallTileHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
${sharedCSS}

body { width: 440px; height: 280px; }

.container {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 30px 35px;
  gap: 14px;
}

h1 {
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.subtitle {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  line-height: 1.5;
  max-width: 320px;
}

.tags {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.tab-strip {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  align-items: center;
}

.tab-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
}

.tg-dev   { background: rgba(59,130,246,0.2); color: #93c5fd; border: 1px solid rgba(59,130,246,0.25); }
.tg-study { background: rgba(234,179,8,0.2);  color: #fde047; border: 1px solid rgba(234,179,8,0.25); }
.tg-comm  { background: rgba(34,197,94,0.2);  color: #86efac; border: 1px solid rgba(34,197,94,0.25); }
.tg-ai    { background: rgba(168,85,247,0.2); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.25); }

</style></head><body>
  <div class="gradient-orb orb-1"></div>
  <div class="gradient-orb orb-2"></div>
  <div class="container">
    <div class="logo-icon">
      ${sparklesSVG}
      <h1>IntelliTab</h1>
    </div>
    <p class="subtitle">AI-powered tab organizer that learns how you work</p>
    <div class="tab-strip">
      <span class="tab-group tg-dev">Dev <span style="opacity:0.5">7</span></span>
      <span class="tab-group tg-study">Study <span style="opacity:0.5">4</span></span>
      <span class="tab-group tg-comm">Comms <span style="opacity:0.5">3</span></span>
      <span class="tab-group tg-ai">AI <span style="opacity:0.5">2</span></span>
    </div>
    <div class="tags">
      <span class="tag tag-ai">AI Grouping</span>
      <span class="tag tag-learn">Learns</span>
      <span class="tag tag-save">Workspaces</span>
    </div>
  </div>
</body></html>`;

// ─── Marquee promo tile (1400x560) ──────────────────────────────────

const marqueeTileHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
${sharedCSS}

body { width: 1400px; height: 560px; }

.container {
  flex-direction: row;
  align-items: center;
  padding: 60px 80px;
  gap: 60px;
}

.left {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

h1 {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.1;
}

h1 span {
  background: linear-gradient(135deg, #a5b4fc, #ec4899, #67e8f9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  font-size: 18px;
  color: rgba(255,255,255,0.55);
  line-height: 1.6;
  max-width: 460px;
}

.tags {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.tag { font-size: 12px; padding: 5px 14px; }

.right {
  flex: 0 0 500px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(10px);
}

.feature-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.fi-analyze { background: rgba(99,102,241,0.2); }
.fi-learn   { background: rgba(236,72,153,0.2); }
.fi-save    { background: rgba(6,182,212,0.2); }
.fi-restore { background: rgba(234,179,8,0.2); }

.feature-text h3 {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 3px;
}

.feature-text p {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
  line-height: 1.4;
}

.tab-strip-bottom {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  flex-wrap: wrap;
}

.tab-group {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.tg-dev     { background: rgba(59,130,246,0.15); color: #93c5fd; border: 1px solid rgba(59,130,246,0.2); }
.tg-study   { background: rgba(234,179,8,0.15);  color: #fde047; border: 1px solid rgba(234,179,8,0.2); }
.tg-comm    { background: rgba(34,197,94,0.15);  color: #86efac; border: 1px solid rgba(34,197,94,0.2); }
.tg-ai      { background: rgba(168,85,247,0.15); color: #d8b4fe; border: 1px solid rgba(168,85,247,0.2); }
.tg-markets { background: rgba(249,115,22,0.15); color: #fdba74; border: 1px solid rgba(249,115,22,0.2); }
.tg-ent     { background: rgba(239,68,68,0.15);  color: #fca5a5; border: 1px solid rgba(239,68,68,0.2); }

</style></head><body>
  <div class="gradient-orb orb-1" style="width:400px;height:400px;top:-100px;right:-80px;"></div>
  <div class="gradient-orb orb-2" style="width:350px;height:350px;bottom:-80px;left:-60px;"></div>
  <div class="gradient-orb orb-3" style="width:300px;height:300px;"></div>
  <div class="container">
    <div class="left">
      <div class="logo-icon" style="gap:12px;">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #a5b4fc;">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
        </svg>
        <h1>IntelliTab</h1>
      </div>
      <p class="subtitle">AI-powered tab organizer that learns your workflow, remembers your groups, and keeps your browser clean.</p>
      <div class="tab-strip-bottom">
        <span class="tab-group tg-dev">Dev &middot; 7</span>
        <span class="tab-group tg-study">Study &middot; 4</span>
        <span class="tab-group tg-comm">Comms &middot; 3</span>
        <span class="tab-group tg-ai">AI &middot; 2</span>
        <span class="tab-group tg-markets">Markets &middot; 5</span>
        <span class="tab-group tg-ent">Fun &middot; 3</span>
      </div>
      <div class="tags">
        <span class="tag tag-ai">AI Grouping</span>
        <span class="tag tag-learn">Adaptive Learning</span>
        <span class="tag tag-save">Workspaces</span>
      </div>
    </div>
    <div class="right">
      <div class="feature-card">
        <div class="feature-icon fi-analyze">&#10024;</div>
        <div class="feature-text">
          <h3>One-Click Organize</h3>
          <p>AI analyzes all tabs and groups them by context</p>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-learn">&#128077;</div>
        <div class="feature-text">
          <h3>Learns Your Style</h3>
          <p>Passively learns + adapts from your corrections</p>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-save">&#128190;</div>
        <div class="feature-text">
          <h3>Save Workspaces</h3>
          <p>Save entire sessions, restore them anytime</p>
        </div>
      </div>
      <div class="feature-card">
        <div class="feature-icon fi-restore">&#128295;</div>
        <div class="feature-text">
          <h3>Auto-Recovery</h3>
          <p>Groups survive browser restarts automatically</p>
        </div>
      </div>
    </div>
  </div>
</body></html>`;

// ─── Render ─────────────────────────────────────────────────────────

async function renderTile(html, width, height, outputPath) {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    // Wait for font loading
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 500));
    const screenshot = await page.screenshot({ type: 'png', omitBackground: false });
    writeFileSync(outputPath, screenshot);
    console.log(`  ✓ ${outputPath} (${width}x${height})`);
    await browser.close();
}

async function main() {
    console.log('Generating IntelliTab promo tiles...\n');

    await renderTile(smallTileHTML, 440, 280, join(ASSETS_DIR, 'small-promo-tile.png'));
    await renderTile(marqueeTileHTML, 1400, 560, join(ASSETS_DIR, 'marquee-promo-tile.png'));

    console.log('\nDone! Tiles saved to promo/assets/');
}

main().catch(err => { console.error(err); process.exit(1); });
