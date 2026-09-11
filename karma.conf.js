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
//
// MEASURED ON A REAL CLOUD VM, 2026-09-12, because a first version of this block did not
// work there: `which google-chrome google-chrome-stable chromium chromium-browser`
// printed NOTHING - none of the five well-known paths exists on that image - and
// `require('@playwright/test').chromium.executablePath()` returned a revision-1228 path
// while the image ships revision 1194, so the one candidate that was meant to save it
// pointed at a file that was not there. The image sets PLAYWRIGHT_BROWSERS_PATH and
// keeps a stable `chromium` symlink beside the versioned directories; that symlink is a
// real file and it is what works. So: look for files that EXIST, in order of how stable
// the name is, and treat Playwright's computed path as the last guess rather than the
// first answer.
if (process.platform === 'linux' && !process.env.CHROME_BIN) {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers']
    .concat(process.env.HOME ? [path.join(process.env.HOME, '.cache', 'ms-playwright')] : [])
    .filter(Boolean);

  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];

  for (const root of roots) {
    candidates.push(path.join(root, 'chromium'));
    // The versioned layout underneath, e.g. chromium-1194/chrome-linux/chrome. Shallow and
    // guarded: a missing root is the normal case on a developer's machine.
    let dirs = [];
    try {
      dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium'));
    } catch {
      dirs = [];
    }
    for (const d of dirs) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-linux/headless_shell']) {
        candidates.push(path.join(root, d, rel));
      }
    }
  }

  try {
    candidates.push(require('@playwright/test').chromium.executablePath());
  } catch {
    // Playwright is a devDependency; if it is absent the paths above still apply.
  }

  // isFile() and not existsSync(): the stable `chromium` name is a directory in some
  // layouts, and handing karma a directory fails the same way handing it nothing does.
  // statSync follows the symlink, which is the point.
  const found = candidates.find((p) => {
    if (!p) return false;
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
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
    // NOT the builder's default of ['Chrome']: angular.json used to carry
    // `"browsers": "ChromeHeadless"` in the test target, and CLAUDE.md documents `ng test` as
    // headless by default because of it. That pin is what made this whole file a no-op on a
    // container - measured 2026-09-12, karma logged `Launching browsers ChromeHeadless` and the
    // launcher below was never selected, because a builder OPTION beats the karma config. The
    // pin moved here, where the choice can depend on the machine; the default is unchanged.
    browsers: [runningAsRoot ? 'ChromeHeadlessNoSandbox' : 'ChromeHeadless'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
