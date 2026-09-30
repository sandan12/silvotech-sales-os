import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, executablePath: "/usr/local/bin/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];

page.on("console", (message) => {
  if (message.type() === "error") failures.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
const crmLogin = page.getByRole("button", { name: "Войти в CRM" });
if (await crmLogin.isVisible()) {
  await crmLogin.click();
  await page.getByRole("heading", { name: "Вход в CRM" }).waitFor();
  await page.getByRole("button", { name: "Подключить через открытую CRM" }).waitFor();
  await page.getByLabel("Email").fill("manager@example.com");
  await page.getByLabel("Пароль").fill("test-password");
  await page.getByRole("button", { name: "Закрыть" }).click();
}
await page.getByRole("button", { name: "Возможности" }).click();
await page.getByRole("heading", { name: "Подтверждённые потребности из CRM" }).waitFor();
await page.getByText("Нет данных CRM").waitFor();
if (await page.getByText("Aqua‑Trend").count()) failures.push("demo opportunity leaked into empty state");
await page.getByRole("button", { name: "Быстрое обновление" }).click();
await page.getByRole("heading", { name: "Расскажите, что изменилось" }).waitFor();
await page.getByRole("button", { name: "Записать голосом" }).waitFor();
await page
  .getByLabel("Сообщение об изменении")
  .fill("Созвонился с Мартой из Aqua-Trend. Ждём цену на чёрный TPV на следующей неделе.");
await page.getByRole("button", { name: "Разобрать сообщение" }).click();
await page.getByLabel("Клиент").waitFor();
await page.getByText("Звонок", { exact: true }).waitFor();
await page.getByText("Следующее действие", { exact: true }).waitFor();
const confirm = page.getByRole("button", { name: "Подтвердить и записать" });
if (!(await confirm.isDisabled())) failures.push("CRM write enabled without live connection and client");
await page.getByRole("button", { name: "Закрыть" }).click();
await page.getByRole("button", { name: "Результат" }).click();
await page.getByRole("heading", { name: "Только измеримое движение" }).waitFor();

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

console.log("QA passed: honest empty states, structured preview, write guard, metrics, responsive overflow.");
