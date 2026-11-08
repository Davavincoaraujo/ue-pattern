import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { abrirBrowser } from "./browser.js";

export interface RegiaoDiferente {
  yInicio: number;
  yFim: number;
  pixelsDiferentes: number;
  percentualDaFaixa: number;
}

export interface ResultadoComparacao {
  dimensoesReferencia: { largura: number; altura: number };
  dimensoesAtual: { largura: number; altura: number };
  dimensoesIguais: boolean;
  totalPixels: number;
  pixelsDiferentes: number;
  percentual: number;
  aprovado: boolean;
  regioes: RegiaoDiferente[];
  diff: PNG;
  composto: PNG;
}

const FAIXA_PX = 100;

export function lerPng(caminho: string): PNG {
  const buffer = readFileSync(caminho);
  const assinatura = buffer.subarray(0, 8).toString("hex");
  if (assinatura !== "89504e470d0a1a0a") {
    throw new Error(`Arquivo não é PNG: ${caminho}. Exporte a imagem de referência em PNG.`);
  }
  return PNG.sync.read(buffer);
}

function preencher(origem: PNG, largura: number, altura: number): PNG {
  if (origem.width === largura && origem.height === altura) return origem;
  const destino = new PNG({ width: largura, height: altura });
  for (let i = 0; i < destino.data.length; i += 4) {
    destino.data[i] = 255;
    destino.data[i + 1] = 0;
    destino.data[i + 2] = 255;
    destino.data[i + 3] = 40;
  }
  PNG.bitblt(origem, destino, 0, 0, origem.width, origem.height, 0, 0);
  return destino;
}

function compor(imagens: PNG[], altura: number, espaco = 12): PNG {
  const largura = imagens.reduce((s, i) => s + i.width, 0) + espaco * (imagens.length - 1);
  const saida = new PNG({ width: largura, height: altura });
  for (let i = 0; i < saida.data.length; i += 4) {
    saida.data[i] = 245;
    saida.data[i + 1] = 245;
    saida.data[i + 2] = 245;
    saida.data[i + 3] = 255;
  }
  let x = 0;
  for (const img of imagens) {
    PNG.bitblt(img, saida, 0, 0, img.width, img.height, x, 0);
    x += img.width + espaco;
  }
  return saida;
}

export function compararImagens(
  referencia: PNG,
  atual: PNG,
  opcoes: { tolerancia?: number; limitePercentual?: number } = {},
): ResultadoComparacao {
  const tolerancia = opcoes.tolerancia ?? 0.1;
  const limite = opcoes.limitePercentual ?? 0;
  const largura = Math.max(referencia.width, atual.width);
  const altura = Math.max(referencia.height, atual.height);

  const a = preencher(referencia, largura, altura);
  const b = preencher(atual, largura, altura);
  const diff = new PNG({ width: largura, height: altura });

  const pixelsDiferentes = pixelmatch(a.data, b.data, diff.data, largura, altura, {
    threshold: tolerancia,
    includeAA: false,
  });

  const regioes: RegiaoDiferente[] = [];
  for (let y0 = 0; y0 < altura; y0 += FAIXA_PX) {
    const y1 = Math.min(y0 + FAIXA_PX, altura);
    let contagem = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = 0; x < largura; x += 1) {
        const idx = (y * largura + x) * 4;
        if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
          contagem += 1;
        }
      }
    }
    if (contagem > 0) {
      regioes.push({
        yInicio: y0,
        yFim: y1,
        pixelsDiferentes: contagem,
        percentualDaFaixa: Number(((contagem / ((y1 - y0) * largura)) * 100).toFixed(3)),
      });
    }
  }
  regioes.sort((x, y) => y.pixelsDiferentes - x.pixelsDiferentes);

  const totalPixels = largura * altura;
  const percentual = Number(((pixelsDiferentes / totalPixels) * 100).toFixed(4));

  return {
    dimensoesReferencia: { largura: referencia.width, altura: referencia.height },
    dimensoesAtual: { largura: atual.width, altura: atual.height },
    dimensoesIguais: referencia.width === atual.width && referencia.height === atual.height,
    totalPixels,
    pixelsDiferentes,
    percentual,
    aprovado: percentual <= limite && referencia.width === atual.width && referencia.height === atual.height,
    regioes: regioes.slice(0, 8),
    diff,
    composto: compor([a, b, diff], altura),
  };
}

export async function capturar(opcoes: {
  url: string;
  largura: number;
  seletor?: string;
  paginaInteira?: boolean;
  escala?: number;
  esperarSeletor?: string;
  chromePath?: string;
}): Promise<PNG> {
  const browser = await abrirBrowser(opcoes.chromePath);
  try {
    const context = await browser.newContext({
      viewport: { width: opcoes.largura, height: 1200 },
      deviceScaleFactor: opcoes.escala ?? 1,
    });
    const page = await context.newPage();
    await page.goto(opcoes.url, { waitUntil: "domcontentloaded" });
    if (opcoes.esperarSeletor) await page.waitForSelector(opcoes.esperarSeletor, { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
      content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
    });
    const buffer = opcoes.seletor
      ? await page.locator(opcoes.seletor).first().screenshot({ animations: "disabled" })
      : await page.screenshot({ fullPage: opcoes.paginaInteira ?? true, animations: "disabled" });
    return PNG.sync.read(buffer);
  } finally {
    await browser.close();
  }
}

export function salvarResultado(
  pasta: string,
  nome: string,
  resultado: ResultadoComparacao,
  atual: PNG,
): { atual: string; diff: string; deparaComposto: string } {
  mkdirSync(pasta, { recursive: true });
  const caminhos = {
    atual: join(pasta, `${nome}.atual.png`),
    diff: join(pasta, `${nome}.diff.png`),
    deparaComposto: join(pasta, `${nome}.depara.png`),
  };
  writeFileSync(caminhos.atual, PNG.sync.write(atual));
  writeFileSync(caminhos.diff, PNG.sync.write(resultado.diff));
  writeFileSync(caminhos.deparaComposto, PNG.sync.write(resultado.composto));
  return caminhos;
}

export function formatarComparacao(r: ResultadoComparacao, limite: number): string {
  const dim = r.dimensoesIguais
    ? `${r.dimensoesAtual.largura}x${r.dimensoesAtual.altura}`
    : `referência ${r.dimensoesReferencia.largura}x${r.dimensoesReferencia.altura} vs atual ${r.dimensoesAtual.largura}x${r.dimensoesAtual.altura} (DIMENSÕES DIFERENTES)`;
  const linhas = [
    `${r.aprovado ? "APROVADO" : "REPROVADO"} — ${r.percentual}% de pixels diferentes (limite ${limite}%)`,
    `Dimensões: ${dim}`,
    `Pixels diferentes: ${r.pixelsDiferentes} de ${r.totalPixels}`,
  ];
  if (r.regioes.length > 0) {
    linhas.push("Faixas verticais com mais diferença:");
    for (const g of r.regioes) {
      linhas.push(`- y ${g.yInicio}–${g.yFim}px: ${g.pixelsDiferentes} px (${g.percentualDaFaixa}% da faixa)`);
    }
  }
  return linhas.join("\n");
}
