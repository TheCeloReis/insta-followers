// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
import { Browser, Page, Protocol } from "puppeteer";
import puppeteer from "puppeteer-extra";
// add stealth plugin and use defaults (all evasion techniques)
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { createObjectCsvWriter } from "csv-writer";
import fs from "fs";
require("dotenv").config();
puppeteer.use(StealthPlugin());

const timeBetweenScrolls = 1000;

const csvWriter = createObjectCsvWriter({
  path: `${__dirname}/out/${getTarget()}#followers.csv`,
  header: [
    { id: "pk", title: "ID" },
    { id: "username", title: "username" },
    { id: "full_name", title: "Nome" },
    { id: "is_private", title: "Privado" },
    { id: "is_verified", title: "Verificado" },
  ],
});

// puppeteer usage as normal
puppeteer.launch({ headless: false }).then(async (browser) => {
  console.log("Running tests..");

  const page = await browser.newPage();
  await page.goto("https://instagram.com");
  await page.waitForNetworkIdle();

  await setInterceptors(page, browser);

  const restoredCookies = getCookies();

  if (restoredCookies) {
    await page.setCookie(...restoredCookies);
  } else {
    await logIn(page);
  }

  console.log("Going to stalk page...");
  await page.goto(`https://instagram.com/${getTarget()}`, {
    waitUntil: "networkidle2",
  });

  // wait the on the followers link appear
  const followersSelector = `a[href='/${getTarget()}/followers/']`;

  await page.waitForSelector(followersSelector);
  await page.click(followersSelector);
  await page.waitForTimeout(1000);

  while (true) {
    await scrollFollowers(page);

    await page.waitForTimeout(timeBetweenScrolls);
  }
});

function getLoginInfo(): [string, string] {
  const username = process.env.INSTAGRAM_USERNAME;
  const password = process.env.INSTAGRAM_PASSWORD;

  if (!username || !password) {
    throw new Error("Username or password not set");
  }

  return [username, password];
}

function getTarget(): string {
  const username = process.env.TARGET;
  if (!username) {
    throw new Error("Stalk username not set");
  }

  return username;
}

async function logIn(page: Page): Promise<void> {
  const [username, password] = getLoginInfo();

  await page.type("input[name=username]", username);
  await page.type("input[name=password]", password);
  await page.click("button[type=submit]");

  await page.waitForNavigation();

  const [button] = await page.$x("//button[contains(., 'Save Info')]");
  if (!button) {
    throw new Error("Could not find save info button");
  }
  button.click();

  await page.waitForTimeout(1000);

  const cookies = await page.cookies();
  saveCookies(cookies);
}

async function scrollFollowers(page: Page): Promise<void> {
  console.log("Scrolling...");
  await page.evaluate(() => {
    const followers = document.querySelector(
      'div[aria-label="Followers"] > div > div > div + div'
    );

    if (!followers) {
      throw new Error("Could not find followers container");
    }

    followers.scrollBy(0, 6000);
  });
}

function saveCookies(cookies: Protocol.Network.Cookie[]): void {
  fs.writeFileSync(
    `${__dirname}/cookies.json`,
    JSON.stringify(cookies, null, 2)
  );

  console.log("Saved cookies");
}

function getCookies(): Protocol.Network.Cookie[] | null {
  try {
    const cookies = fs.readFileSync(`${__dirname}/cookies.json`);
    console.log("Loaded cookies");
    return JSON.parse(cookies.toString());
  } catch {
    console.log("Could not find cookies");
    return null;
  }
}

let timeout: any = 0;
let followers = 0;

async function setInterceptors(page: Page, browser: Browser): Promise<void> {
  await page.setRequestInterception(true);

  const followersRegex =
    /^https:\/\/i\.instagram\.com\/api\/v1\/friendships\/[0-9]+\/followers\//;

  page.on("request", async (request) => {
    const overrides = request.continueRequestOverrides();
    if (request.url().match(followersRegex)) {
      overrides.url = request.url().replace("?count=12", "?count=200");
      console.log("Changed request of followers..");
      request.continue(overrides);
    } else {
      request.continue();
    }
  });

  page.on("response", async (response) => {
    if (
      response.headers()["content-length"] !== "0" &&
      followersRegex.test(response.url())
    ) {
      const responseData = await response.json();
      console.log("responseData", responseData);
      followers += responseData.users.length;
      console.log(`Saving more ${responseData.users.length} followers...`);
      console.log(`Total saved followers: ${followers}`);

      await csvWriter.writeRecords(responseData.users);

      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        console.log("5s without activity, closing browser...");
        await browser.close();
      }, timeBetweenScrolls * 5);
    }
  });
}
