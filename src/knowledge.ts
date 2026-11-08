import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { caminhoDentro } from "./config.js";

export interface Topico {
  id: string;
  titulo: string;
  bytes: number;
}

function listarMarkdown(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const completo = join(dir, nome);
    if (statSync(completo).isDirectory()) saida.push(...listarMarkdown(completo));
    else if (nome.endsWith(".md")) saida.push(completo);
  }
  return saida.sort();
}

function tituloDe(conteudo: string, fallback: string): string {
  const linha = conteudo.split("\n").find((l) => l.startsWith("# "));
  return linha ? linha.replace(/^#\s+/, "").trim() : fallback;
}

export function listarTopicos(raiz: string): Topico[] {
  return listarMarkdown(raiz).map((arquivo) => {
    const id = relative(raiz, arquivo).split(sep).join("/").replace(/\.md$/, "");
    const conteudo = readFileSync(arquivo, "utf8");
    return { id, titulo: tituloDe(conteudo, id), bytes: Buffer.byteLength(conteudo) };
  });
}

export function extrairSecao(conteudo: string, heading: string): string | null {
  const linhas = conteudo.split("\n");
  const alvo = heading.trim().toLowerCase();
  let inicio = -1;
  let nivel = 0;
  for (let i = 0; i < linhas.length; i += 1) {
    const m = /^(#{1,6})\s+(.*)$/.exec(linhas[i]);
    if (m && m[2].trim().toLowerCase().includes(alvo)) {
      inicio = i;
      nivel = m[1].length;
      break;
    }
  }
  if (inicio === -1) return null;
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    const m = /^(#{1,6})\s/.exec(linhas[i]);
    if (m && m[1].length <= nivel) {
      fim = i;
      break;
    }
  }
  return linhas.slice(inicio, fim).join("\n").trim();
}

export function lerTopico(raiz: string, id: string, secao?: string): string {
  const arquivo = caminhoDentro(raiz, `${id.replace(/\.md$/, "")}.md`);
  const conteudo = readFileSync(arquivo, "utf8");
  if (!secao) return conteudo;
  const trecho = extrairSecao(conteudo, secao);
  if (!trecho) throw new Error(`Seção "${secao}" não encontrada em ${id}`);
  return trecho;
}

export interface Resultado {
  topico: string;
  pontuacao: number;
  trechos: string[];
}

export function buscar(raiz: string, consulta: string, limite = 8): Resultado[] {
  const termos = consulta
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (termos.length === 0) return [];

  const resultados: Resultado[] = [];
  for (const arquivo of listarMarkdown(raiz)) {
    const id = relative(raiz, arquivo).split(sep).join("/").replace(/\.md$/, "");
    const linhas = readFileSync(arquivo, "utf8").split("\n");
    let pontuacao = 0;
    const trechos: string[] = [];
    linhas.forEach((linha, i) => {
      const minuscula = linha.toLowerCase();
      const acertos = termos.filter((t) => minuscula.includes(t)).length;
      if (acertos === 0) return;
      pontuacao += acertos * acertos;
      if (trechos.length < 3 && acertos >= Math.min(2, termos.length)) {
        trechos.push(`L${i + 1}: ${linha.trim().slice(0, 220)}`);
      }
    });
    if (pontuacao > 0) resultados.push({ topico: id, pontuacao, trechos });
  }
  return resultados.sort((a, b) => b.pontuacao - a.pontuacao).slice(0, limite);
}
