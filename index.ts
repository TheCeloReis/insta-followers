// puppeteer-extra is a drop-in replacement for puppeteer,
// it augments the installed puppeteer with plugin functionality
import { Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
// add stealth plugin and use defaults (all evasion techniques)
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { createObjectCsvWriter } from "csv-writer";
require("dotenv").config();
puppeteer.use(StealthPlugin());

const csvWriter = createObjectCsvWriter({
  path: `${__dirname}/${getStalkUsername()}#followers.csv`,
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

  const [username, password] = getLoginInfo();

  const page = await browser.newPage();
  await page.goto("https://instagram.com");
  await page.waitForTimeout(500);
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
      console.log("Saving followers...");
      const responseData = await response.json();
      await csvWriter.writeRecords(responseData.users);
    }
  });

  await page.type("input[name=username]", username);
  await page.type("input[name=password]", password);
  await page.click("button[type=submit]");

  await page.waitForNetworkIdle();

  const stayLoggedInRoute = "https://www.instagram.com/accounts/login/";
  if (page.url() === stayLoggedInRoute) {
    await page.click("button[type=submit]:contains('Save Info')");
    console.log("Saved info");

    await page.waitForNetworkIdle();
  }

  console.log("Going to stalk page...");
  await page.goto(`https://instagram.com/${getStalkUsername()}`, {
    waitUntil: "networkidle2",
  });

  // wait the on the followers link appear
  const followersSelector = `a[href='/${getStalkUsername()}/followers/']`;

  await page.waitForSelector(followersSelector);
  await page.click(followersSelector);
  await page.waitForNetworkIdle();

  while (true) {
    await scrollFollowers(page);

    await page.waitForNetworkIdle();
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

function getStalkUsername(): string {
  const username = process.env.STALK_USERNAME;

  if (!username) {
    throw new Error("Stalk username not set");
  }

  return username;
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
