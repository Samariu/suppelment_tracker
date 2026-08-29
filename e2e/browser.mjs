import { chromium } from 'playwright';

// Browser launch is shared by the e2e scripts. Playwright resolves its own
// download unless CHROMIUM_PATH points at an already-installed binary.
export const launch = () =>
  chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

export const fail = (message) => {
  throw new Error(`ASSERT: ${message}`);
};
