import { readFileSync } from "node:fs";
import type { Page } from "playwright-core";
import { abrirBrowser } from "./browser.js";
import {
  collectProperties,
  compare,
  compareAlign,
  compareOrder,
  cssPropertyFor,
  expectedFor,
  formatReport,
  resolveForFrame,
  type ComponentSpec,
  type Divergence,
} from "./spec.js";

export interface ResultadoFrame {
  frame: string;
  largura: number;
  comparadas: number;
  divergencias: Divergence[];
  relatorio: string;
}

export interface ResultadoSpec {
  componente: string;
  url: string;
  ok: boolean;
  frames: ResultadoFrame[];
}

export function lerSpec(caminho: string): ComponentSpec {
  return JSON.parse(readFileSync(caminho, "utf8")) as ComponentSpec;
}

async function medirFrame(
  page: Page,
  spec: ComponentSpec,
  frame: string,
  largura: number,
  baseUrl: string,
): Promise<ResultadoFrame> {
  await page.setViewportSize({ width: largura, height: 1200 });
  const resposta = await page.goto(new URL(spec.url, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  if (spec.waitFor) {
    try {
      await page.waitForSelector(spec.waitFor, { timeout: 15000 });
    } catch {
      throw new Error(
        `Seletor waitFor não apareceu em 15s: ${spec.waitFor}\nURL final: ${page.url()} (HTTP ${resposta?.status() ?? "?"}). Confira se o servidor está no ar e se o componente está nessa página.`,
      );
    }
  }
  await page.evaluate(() => document.fonts.ready);

  const divergencias: Divergence[] = [];
  let comparadas = 0;

  for (const base of spec.elements) {
    const element = resolveForFrame(base, frame);
    const locator = page.locator(element.selector).first();
    if ((await locator.count()) === 0) {
      divergencias.push({
        selector: element.selector,
        property: "(seletor)",
        expected: "presente na página",
        received: "não encontrado",
      });
      continue;
    }

    const propriedades = collectProperties(element);
    const cssProps = propriedades.map(cssPropertyFor);
    const computed = await locator.evaluate((node, props: string[]) => {
      const style = getComputedStyle(node as Element);
      const out: Record<string, string> = { "font-size": style.fontSize };
      for (const p of props) out[p] = style.getPropertyValue(p);
      return out;
    }, cssProps);
    const fontSizePx = Number.parseFloat(computed["font-size"]) || 16;

    for (const chave of propriedades) {
      const esperado = expectedFor(element, chave);
      if (!esperado) continue;
      comparadas += 1;
      const d = compare(chave, esperado, computed[cssPropertyFor(chave)], fontSizePx);
      if (d) divergencias.push({ ...d, selector: element.selector });
    }
  }

  const ordem = spec.order?.[frame];
  if (ordem) {
    const medidos: { selector: string; pos: number }[] = [];
    for (const selector of ordem.selectors) {
      const alvo = page.locator(selector).first();
      if ((await alvo.count()) === 0) continue;
      const box = await alvo.boundingBox();
      if (!box) continue;
      medidos.push({ selector, pos: ordem.by === "y" ? box.y : box.x });
    }
    comparadas += medidos.length;
    const d = compareOrder(
      ordem.selectors,
      medidos.sort((a, b) => a.pos - b.pos).map((m) => m.selector),
    );
    if (d) divergencias.push(d);
  }

  for (const alinhamento of spec.align?.[frame] ?? []) {
    const alvos = page.locator(alinhamento.selector);
    const total = await alvos.count();
    const posicoes: number[] = [];
    for (let i = 0; i < total; i += 1) {
      const box = await alvos.nth(i).boundingBox();
      if (!box) continue;
      const inicio = alinhamento.axis === "y" ? box.y : box.x;
      const tamanho = alinhamento.axis === "y" ? box.height : box.width;
      posicoes.push(alinhamento.edge === "end" ? inicio + tamanho : inicio);
    }
    comparadas += posicoes.length;
    const d = compareAlign(alinhamento, posicoes);
    if (d) divergencias.push(d);
  }

  return {
    frame,
    largura,
    comparadas,
    divergencias,
    relatorio: formatReport(spec, frame, divergencias, comparadas),
  };
}

export async function validarSpec(
  spec: ComponentSpec,
  opcoes: { baseUrl: string; chromePath?: string; frame?: string },
): Promise<ResultadoSpec> {
  const frames = Object.entries(spec.frames).filter(
    ([nome]) => !opcoes.frame || nome === opcoes.frame,
  );
  if (frames.length === 0) {
    throw new Error(`Frame "${opcoes.frame}" não existe no spec (${Object.keys(spec.frames).join(", ")})`);
  }

  const browser = await abrirBrowser(opcoes.chromePath);
  try {
    const resultados: ResultadoFrame[] = [];
    for (const [nome, largura] of frames) {
      const page = await browser.newPage();
      try {
        resultados.push(await medirFrame(page, spec, nome, largura, opcoes.baseUrl));
      } finally {
        await page.close();
      }
    }
    return {
      componente: spec.component,
      url: spec.url,
      ok: resultados.every((r) => r.divergencias.length === 0),
      frames: resultados,
    };
  } finally {
    await browser.close();
  }
}
