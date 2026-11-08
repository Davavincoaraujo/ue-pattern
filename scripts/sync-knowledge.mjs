import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(raiz, "reference");
const origemBase = process.env.UE_PATTERN_SKILLS_PATH ?? join(homedir(), ".claude", "skills");
const skills = [
  { origem: "padrao-universo-editor-adobe", destino: "construcao" },
  { origem: "padrao-autoria-ue", destino: "autoria" },
];

const PARA_CONSTRUCAO = ["padrao-pixel-perfect.md"];

const EXCLUIR = [/meta-skill\.md$/, /padrao-organizacao-conhecimento\.md$/, /design-system-liquid/i, /legacy-and-edge-routing/i, /\/design-system\//];

const LINHAS_REMOVIDAS = [/padrao-organizacao-conhecimento/, /Implementação: `seu-projeto\/documentation/, /meta-skill/, /legacy-and-edge-routing/, /referencia-design-system/, /liquid-(?:tokens|classes)/i, /AG2/, /\*\*BIA\*\*/];

const SUBSTITUICOES = [
  [/The Centurion \/ The Platinum/g, "landing pages"],
  [/The (?:Platinum|Centurion)/g, "landing page"],
  [/#cc092f/gi, "#0055ff"],
  [/showBIA/g, "showAssistant"],
  [/\bBIA\b/g, "Assistente"],
  [/Design System Seu Projeto \(Design System\)/g, "Design System do projeto"],
  [/portal Banco Seu Projeto/g, "projeto Next.js + AEM"],
  [/Banco Seu Projeto/g, "Seu Projeto"],
  [/"Seu Projeto Sans" e "Seu Projeto"/g, '"SuaFonte Sans" e "SuaFonte"'],
  [/`"Seu Projeto Sans"` e `"Seu Projeto"`/g, '`"SuaFonte Sans"` e `"SuaFonte"`'],
  [/o vermelho Seu Projeto/g, "a cor da marca"],
  [/Conheça o Seu Projeto Principal/g, "Conheça o Produto"],
  [/Só o Principal para você/g, "Só o Premium para você"],
  [/principal-(cards|header)/g, "meu-$1"],
  [/Header — Principal/g, "Header — Exemplo"],
  [/\*\*Principal\*\* \(`outro-grupo`\) e \*\*Prime\*\* \(`outro-grupo`\)/g, "**outros grupos**"],
  [/@bancobradesco/g, "@sua-org"],
  [/CDB Seu Projeto/g, "CDB Exemplo"],
  [/\b(?:principal|prime)\b(?=[`,)\s/*]*(?:`|,|\)|\/))/g, "outro-grupo"],
  [/https?:\/\/(?:static\.)?(?:banco\.)?bradesco(?:\.com\.br)?[^\s)`"']*/gi, "https://cdn.exemplo.com"],
  [/static\.bradesco\.com\.br[^\s)`"']*/gi, "cdn.exemplo.com"],
  [/banco\.bradesco[^\s)`"']*/gi, "cdn.exemplo.com"],
  [/iibr-fed-portalbradesco/g, "seu-projeto"],
  [/portal-banco-bradesco/g, "seu-projeto"],
  [/aem-banco-bradesco/g, "seu-aem"],
  [/bradesco-inovabra/g, "seu-projeto"],
  [/bradesco-aem/g, "seu-aem"],
  [/design-system-liquid-bradesco/g, "seu-design-system"],
  [/referencia-design-system-liquid/g, "referencia-design-system"],
  [/BradescoSans/g, "SuaFonte"],
  [/--brad-/g, "--ds-"],
  [/Design System Liquid(?: Bradesco)?/gi, "Design System"],
  [/\bDS Liquid\b/g, "DS"],
  [/\bLiquid\b/g, "Design System"],
  [/\btheplatinum\b/g, "meu-grupo"],
  [/\bagronegocio\b/g, "outro-grupo"],
  [/\bBradesco\b/g, "Seu Projeto"],
  [/\bbradesco\b/g, "seu-projeto"],
];

function sanitizar(texto) {
  let saida = texto
    .split("\n")
    .filter((linha) => !LINHAS_REMOVIDAS.some((r) => r.test(linha)))
    .join("\n");
  for (let passada = 0; passada < 2; passada += 1) {
    for (const [padrao, troca] of SUBSTITUICOES) saida = saida.replace(padrao, troca);
  }
  saida = saida.replace(/(outro-grupo)(?:(?:`?,\s*`?|\/)outro-grupo)+/g, "$1");
  return saida;
}

function percorrer(dir, aoArquivo) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) percorrer(caminho, aoArquivo);
    else aoArquivo(caminho);
  }
}

mkdirSync(destino, { recursive: true });

let copiados = 0;
for (const { origem: nomeOrigem, destino: nomeDestino } of skills) {
  const origem = join(origemBase, nomeOrigem);
  if (!existsSync(origem)) {
    console.warn(`skill ausente, ignorada: ${origem}`);
    continue;
  }
  const alvo = join(destino, nomeDestino);
  rmSync(alvo, { recursive: true, force: true });
  cpSync(origem, alvo, {
    recursive: true,
    filter: (src) =>
      !EXCLUIR.some((r) => r.test(src)) && (statSync(src).isDirectory() || src.endsWith(".md")),
  });
  const skillMd = join(alvo, "SKILL.md");
  if (existsSync(skillMd)) {
    const corpo = readFileSync(skillMd, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
    writeFileSync(join(alvo, "RESUMO.md"), corpo);
    rmSync(skillMd);
  }
  percorrer(alvo, (arquivo) => {
    if (arquivo.endsWith(".md")) writeFileSync(arquivo, sanitizar(readFileSync(arquivo, "utf8")));
  });
  copiados += 1;
  console.log(`ok ${nomeOrigem} -> reference/${nomeDestino}`);
}

const construcaoRef = join(destino, "construcao", "reference");
const autoriaRef = join(destino, "autoria", "reference");
const resumoAutoria = join(destino, "autoria", "RESUMO.md");

for (const nome of PARA_CONSTRUCAO) {
  const de = join(autoriaRef, nome);
  if (existsSync(de)) renameSync(de, join(construcaoRef, nome));
}

if (existsSync(resumoAutoria)) {
  const texto = readFileSync(resumoAutoria, "utf8");
  const inicio = texto.indexOf("## Decisão 11");
  if (inicio >= 0) {
    const resto = texto.slice(inicio + 1);
    const prox = resto.search(/\n## /);
    const fim = prox >= 0 ? inicio + 1 + prox + 1 : texto.length;
    const secao = texto.slice(inicio, fim);
    writeFileSync(join(construcaoRef, "decisao-pixel-perfect.md"), `# Pixel-perfect: decisão e protocolo\n\n${secao.replace(/^## /, "## ")}`);
    writeFileSync(resumoAutoria, texto.slice(0, inicio) + texto.slice(fim));
  }
}

const LINKS_AUTORIA = /\]\(\.\/(padrao-(?:listas-e-subitems|seo-texto|content-fragments))\.md/g;
const LINKS_CONSTRUCAO = /\]\(\.\/(padrao-(?:pixel-perfect|organizacao-conhecimento))\.md/g;
for (const nome of PARA_CONSTRUCAO) {
  const f = join(construcaoRef, nome);
  if (existsSync(f)) {
    writeFileSync(f, readFileSync(f, "utf8").replace(LINKS_AUTORIA, "](../../autoria/reference/$1.md"));
  }
}
if (existsSync(autoriaRef)) {
  percorrer(autoriaRef, (arquivo) => {
    if (!arquivo.endsWith(".md")) return;
    const antes = readFileSync(arquivo, "utf8");
    const depois = antes.replace(LINKS_CONSTRUCAO, "](../../construcao/reference/$1.md");
    if (depois !== antes) writeFileSync(arquivo, depois);
  });
}

if (existsSync(resumoAutoria)) {
  const limpo = readFileSync(resumoAutoria, "utf8")
    .split("\n")
    .filter((l) => !/padrao-pixel-perfect\.md/.test(l) && !/implementar do Figma com a ponte desconectada/.test(l))
    .join("\n");
  writeFileSync(
    resumoAutoria,
    `${limpo.trimEnd()}\n\n---\n\nConstrução do componente, pixel-perfect com Figma e organização do conhecimento ficam em \`../construcao/\`.\n`,
  );
}

const resumoConstrucao = join(destino, "construcao", "RESUMO.md");
if (existsSync(resumoConstrucao)) {
  const extra = [
    "",
    "## Pixel-perfect (movido do padrão de autoria)",
    "",
    "| Arquivo | Conteúdo |",
    "|---|---|",
    "| `reference/decisao-pixel-perfect.md` | A decisão e o resumo do protocolo |",
    "| `reference/padrao-pixel-perfect.md` | Protocolo de 5 fases, tabela Figma para CSS, tokens do Design System, Atomic Design, CSS moderno, fontes |",
    "",
    "A parte de **autoria** (listas, Content Fragments, SEO e RTE) fica em `../autoria/`.",
    "",
  ].join("\n");
  writeFileSync(resumoConstrucao, readFileSync(resumoConstrucao, "utf8").trimEnd() + "\n" + extra);
}

function removerSecao(texto, titulo) {
  const linhas = texto.split("\n");
  const inicio = linhas.findIndex((l) => l.startsWith("## ") && l.includes(titulo));
  if (inicio < 0) return texto;
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i += 1) {
    if (linhas[i].startsWith("## ")) {
      fim = i;
      break;
    }
  }
  return [...linhas.slice(0, inicio), ...linhas.slice(fim)].join("\n");
}

for (const [arquivo, secoes] of [
  [join(destino, "construcao", "RESUMO.md"), ["Quando usar cada agente", "Auto-educação"]],
  [join(destino, "autoria", "RESUMO.md"), ["Auto-educação"]],
]) {
  if (!existsSync(arquivo)) continue;
  let texto = readFileSync(arquivo, "utf8");
  for (const secao of secoes) texto = removerSecao(texto, secao);
  writeFileSync(arquivo, texto.replace(/\n{3,}/g, "\n\n"));
}

const NOMES = [
  [/`~\/\.claude\/skills\/aem-universal-editor\/`/g, "documentação Adobe do Universal Editor"],
  [/`~\/\.claude\.json`/g, "a configuração de MCP da sua ferramenta"],
  [/padrão "final e fechado": ela mesma se atualiza a cada rodada \(ver\s+§Auto-educação no fim\)\./g, 'padrão "final e fechado".'],
  [/skill \*\*`padrao-autoria-ue`\*\*/g, "`reference/autoria/`"],
  [/skill `padrao-autoria-ue`/g, "`reference/autoria/`"],
  [/skills? `padrao-universo-editor-adobe`/g, "`reference/construcao/`"],
  [/`padrao-universo-editor-adobe\.md`/g, "`construcao/RESUMO.md`"],
  [/padrao-universo-editor-adobe\.md/g, "construcao/RESUMO.md"],
  [/`padrao-autoria-ue`/g, "`autoria`"],
  [/`padrao-universo-editor-adobe`/g, "`construcao`"],
  [/padrao-autoria-ue/g, "autoria"],
  [/padrao-universo-editor-adobe/g, "construcao"],
];
percorrer(destino, (arquivo) => {
  if (!arquivo.endsWith(".md")) return;
  let t = readFileSync(arquivo, "utf8");
  for (const [padrao, troca] of NOMES) t = t.replace(padrao, troca);
  writeFileSync(arquivo, t);
});

const total = readdirSync(destino).length;
console.log(`${copiados} skill(s) sincronizada(s) e sanitizada(s); ${total} pasta(s) em reference/`);
