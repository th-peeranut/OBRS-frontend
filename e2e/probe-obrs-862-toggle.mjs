/**
 * Side-finding probe (NOT OBRS-862): is the home page's one-way button
 * click-blocked by the decorative hero image, and at which viewports?
 * Run against whichever tree is serving 4200.
 */
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const VIEWPORTS = [[1920,1080],[1440,1000],[1440,900],[1366,768],[1280,800],[768,1024],[390,844],[360,740]];
for (const [w,h] of VIEWPORTS) {
  const p = await (await b.newContext({viewport:{width:w,height:h}})).newPage();
  await p.goto('http://localhost:4200/', { waitUntil: 'domcontentloaded' });
  await p.locator('.btn-search').waitFor({ timeout: 60000 });
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const out = {};
    for (const [name, sel] of [['oneWay','.trip-type-toggle__btn'],['search','.btn-search']]) {
      const el = document.querySelectorAll(sel)[0];
      if (!el) { out[name] = 'absent'; continue; }
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
      out[name] = { blocked: !!(top && !el.contains(top) && top !== el),
                    blocker: top ? top.tagName+'.'+((top.className||'').toString().split(' ')[0]) : null };
    }
    return out;
  });
  console.log(`${w}x${h}  oneWay=${JSON.stringify(r.oneWay)}  search=${JSON.stringify(r.search)}`);
  await p.context().close();
}
await b.close();
