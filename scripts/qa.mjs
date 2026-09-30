import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/local/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];

page.on("console", (message) => {
  if (message.type() === "error") failures.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Возможности" }).click();
await page.getByRole("heading", { name: "Возможности, где есть следующий шаг" }).waitFor();
await page.getByRole("button", { name: "Открыть Aqua‑Trend" }).first().click();
await page
  .getByRole("heading", { name: "Рабочая трубка перистальтического насоса", level: 2 })
  .waitFor();
await page.getByRole("button", { name: "Закрыть" }).click();
await page.getByRole("button", { name: "Быстрое обновление" }).click();
await page.getByRole("heading", { name: "Расскажите, что изменилось" }).waitFor();
await page.getByRole("button", { name: "Разобрать сообщение" }).click();
await page.getByText("Найден клиент: Aqua-Trend Łukasz Pawłowski", { exact: true }).waitFor();
await page.getByRole("button", { name: "Подтвердить изменения" }).click();
await page.getByRole("heading", { name: "Черновик подтверждён" }).waitFor();

const desktopOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
if (desktopOverflow) failures.push("desktop horizontal overflow");

await page.setViewportSize({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle" });
const mobileOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
if (mobileOverflow) failures.push("mobile horizontal overflow");

await browser.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("QA passed: navigation, drawer, change preview, confirmation, responsive overflow.");