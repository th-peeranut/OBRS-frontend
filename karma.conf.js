// This file exists for one reason (OBRS-1841): `ng test` could not start at all on a
// clean Linux clone. It died twice before a single spec ran -- first on
// `No binary for ChromeHeadless... set "CHROME_BIN"`, then on `Running as root without
// --no-sandbox is not supported` -- and with no karma config in the repo there was
// nowhere to hang the fix, so every Linux runner had to export CHROME_BIN by hand.
//
// EVERYTHING IN config.set() BELOW IS THE BUILDER'S OWN DEFAULT, COPIED. Declaring
// `karmaConfig` REPLACES @angular-devkit/build-angular's built-in config rather than
// extending it, so anything left out is lost. Measured 2026-09-11, a config carrying only
// `customLaunchers` produced `Executed 0 of 0 ERROR ... __karma__.start` -- at exit code 0,
// the green tail MEMORY.md warns about. The source of truth for these defaults is
// `node_modules/@angular-devkit/build-angular/src/builders/karma/index.js`,
// `getBuiltInKarmaConfig()`; keep them in step when Angular is upgraded.
//
// Only two things here are this card's, and both are guarded to Linux. Windows finds Chrome
// on its own and must keep behaving exactly as it does.

const path = require('path');
const fs = require('fs');

// karma-chrome-launcher looks up CHROME_BIN, then a short list of well-known names on
// PATH. A bare container has none of them, but it usually has the Chromium that
// Playwright downloaded for the e2e lane, which is a perfectly good headless Chrome.
if (process.platform === 'linux' && !process.env.CHROME_BIN) {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];

  try {
    candidates.unshift(require('@playwright/test').chromium.executablePath());
  } catch {
    // Playwright is a devDependency; if it is absent the plain paths still apply.
  }

  const found = candidates.find((p) => p && fs.existsSync(p));
  if (found) {
    process.env.CHROME_BIN = found;
  }
}

// Chrome refuses to launch as uid 0 unless --no-sandbox is passed, and container images run
// as root. A developer's own Linux box is not root, so it keeps the sandbox and the default
// browser, exactly as before this file existed.
const runningAsRoot =
  process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0;

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: path.join(__dirname, 'coverage', 'obrs'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }],
    },
    reporters: ['progress', 'kjhtml'],
    browsers: [runningAsRoot ? 'ChromeHeadlessNoSandbox' : 'Chrome'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
