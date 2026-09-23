#!/usr/bin/env node
/*
 * Renders the extension's 128x128 store icon (text-only, Chrome Web Store layout:
 * 96x96 art + 16 px transparent padding) from ttd-form-helper/icons/icon-text-store.html
 * to ttd-form-helper/icons/icon-128.png — the manifest's 128 icon.
 *
 *   NODE_PATH=$(npm root -g) node tools/render-store-icon.js
 *
 * Needs playwright and a Chromium (CHROMIUM_PATH, default /opt/pw-browsers/chromium).
 * Fails if any line of text overflows its width or the art leaves the 96x96 box.
 */
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const ICONS = path.resolve(__dirname, '..', 'ttd-form-helper', 'icons');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 128, height: 128 } });
  await p.goto('file://' + path.join(ICONS, 'icon-text-store.html'));
  const check = await p.evaluate(() => {
    const t = document.querySelector('.t'), r = t.getBoundingClientRect();
    return {
      overflow: [...document.querySelectorAll('li,.h,.f')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent),
      fitsHeight: t.scrollHeight <= t.clientHeight,
      box: [r.left, r.top, r.width, r.height]
    };
  });
  if (check.overflow.length || !check.fitsHeight || check.box.join() !== '16,16,96,96') {
    console.error('icon text does not fit:', JSON.stringify(check));
    process.exit(1);
  }
  await p.screenshot({ path: path.join(ICONS, 'icon-128.png'), omitBackground: true, clip: { x: 0, y: 0, width: 128, height: 128 } });
  await b.close();
  console.log('wrote icons/icon-128.png (96x96 text art + 16 px padding)');
})().catch(e => { console.error(e); process.exit(1); });
