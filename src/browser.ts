import { chromium, type Browser } from "playwright-core";
import { existsSync } from "node:fs";

const CAMINHOS_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export function localizarChrome(explicito?: string): string {
  const candidatos = explicito ? [explicito] : CAMINHOS_CHROME;
  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) {
    throw new Error(
      "Chrome/Chromium não encontrado. Defina CHROME_EXECUTABLE_PATH.",
    );
  }
  return achado;
}

export async function abrirBrowser(chromePath?: string): Promise<Browser> {
  return chromium.launch({
    executablePath: localizarChrome(chromePath),
    headless: true,
  });
}
