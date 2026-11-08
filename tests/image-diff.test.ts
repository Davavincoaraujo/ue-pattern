import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { compararImagens } from "../src/image-diff.js";

function solido(largura: number, altura: number, cor: [number, number, number]) {
  const png = new PNG({ width: largura, height: altura });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = cor[0];
    png.data[i + 1] = cor[1];
    png.data[i + 2] = cor[2];
    png.data[i + 3] = 255;
  }
  return png;
}

describe("compararImagens", () => {
  it("imagens idênticas aprovam com 0%", () => {
    const r = compararImagens(solido(50, 50, [10, 20, 30]), solido(50, 50, [10, 20, 30]));
    expect(r.pixelsDiferentes).toBe(0);
    expect(r.aprovado).toBe(true);
    expect(r.regioes).toEqual([]);
  });

  it("cores diferentes reprovam e apontam faixa", () => {
    const r = compararImagens(solido(50, 250, [255, 255, 255]), solido(50, 250, [0, 0, 0]));
    expect(r.percentual).toBe(100);
    expect(r.aprovado).toBe(false);
    expect(r.regioes[0].yInicio).toBeGreaterThanOrEqual(0);
  });

  it("dimensões diferentes reprovam mesmo com conteúdo igual", () => {
    const r = compararImagens(solido(50, 50, [1, 2, 3]), solido(50, 60, [1, 2, 3]));
    expect(r.dimensoesIguais).toBe(false);
    expect(r.aprovado).toBe(false);
  });

  it("limitePercentual aceita diferença pequena", () => {
    const a = solido(100, 100, [255, 255, 255]);
    const b = solido(100, 100, [255, 255, 255]);
    for (let i = 0; i < 10; i += 1) b.data[i * 4] = 0;
    const r = compararImagens(a, b, { limitePercentual: 1 });
    expect(r.pixelsDiferentes).toBeGreaterThan(0);
    expect(r.aprovado).toBe(true);
  });

  it("composto tem 3 painéis", () => {
    const r = compararImagens(solido(20, 20, [0, 0, 0]), solido(20, 20, [0, 0, 0]));
    expect(r.composto.width).toBe(20 * 3 + 24);
  });
});
