import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";

export type Severidade = "erro" | "aviso" | "info";

export interface Achado {
  regra: string;
  severidade: Severidade;
  arquivo: string;
  linha?: number;
  mensagem: string;
}

export interface RelatorioComponente {
  componente: string;
  grupo: string;
  nome: string;
  ok: boolean;
  erros: number;
  avisos: number;
  achados: Achado[];
}

export function paraKebab(valor: string): string {
  return valor
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function identificarComponente(
  dir: string,
  componentsRoot?: string,
): { grupo: string; nome: string } {
  const partes = dir.split(sep).filter(Boolean);
  const idxVersao = partes.length - 1;
  const nome = partes[idxVersao - 1];
  let grupo: string | undefined;
  if (componentsRoot && dir.startsWith(componentsRoot + sep)) {
    grupo = dir.slice(componentsRoot.length + 1).split(sep)[0];
  } else {
    const tipo = partes[idxVersao - 2];
    grupo =
      tipo === "sections" || tipo === "components"
        ? partes[idxVersao - 3]
        : tipo;
  }
  if (!nome || !grupo || !/^v\d+$/.test(partes[idxVersao])) {
    throw new Error(
      `Diretório fora do padrão <grupo>/[sections|components]/<nome>/v1: ${dir}`,
    );
  }
  return { grupo, nome };
}

export function extrairPropriedade(conteudo: string, prop: string): string | null {
  const inicio = conteudo.search(/:\s*ComponentDefinition\s*=\s*\{/);
  const escopo = inicio >= 0 ? conteudo.slice(inicio) : conteudo;

  const literal = new RegExp(`\\b${prop}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).exec(escopo);
  if (literal) return literal[1];

  const identificador = new RegExp(`\\b${prop}\\s*:\\s*([A-Za-z_$][\\w$]*)`).exec(escopo)?.[1];
  if (!identificador) return null;

  const constante = new RegExp(`\\bconst\\s+${identificador}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`).exec(conteudo);
  return constante ? constante[1] : null;
}

function linhaDe(conteudo: string, indice: number): number {
  return conteudo.slice(0, indice).split("\n").length;
}

export function semComentarios(codigo: string): string {
  const branquear = (trecho: string) => trecho.replace(/[^\n]/g, " ");
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, branquear)
    .replace(
      /(^|[^:\\])(\/\/[^\n]*)/g,
      (_inteiro, antes: string, comentario: string) => antes + branquear(comentario),
    );
}

function ler(caminho: string): string | null {
  return existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
}

export function validarComponente(
  dir: string,
  componentsRoot?: string,
): RelatorioComponente {
  const { grupo, nome } = identificarComponente(dir, componentsRoot);
  const achados: Achado[] = [];
  const add = (
    regra: string,
    severidade: Severidade,
    arquivo: string,
    mensagem: string,
    linha?: number,
  ) => achados.push({ regra, severidade, arquivo, mensagem, linha });

  const arquivos = existsSync(dir) ? readdirSync(dir) : [];
  const candidatosTsx = arquivos.filter(
    (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx") && !f.endsWith(".stories.tsx"),
  );
  const tsxNome = candidatosTsx.find((f) => f === `${nome}.tsx`);
  const cssArquivos = arquivos.filter((f) => f.endsWith(".module.css"));
  const testeCaminho = join(dir, "__tests__", "mapper.test.ts");

  for (const obrigatorio of ["definition.ts", "mapper.ts"]) {
    if (!arquivos.includes(obrigatorio)) {
      add("estrutura/arquivo", "erro", obrigatorio, `Arquivo obrigatório ausente: ${obrigatorio}`);
    }
  }
  if (!arquivos.includes("index.ts")) {
    add("estrutura/index", "aviso", "index.ts", "Barrel index.ts ausente (convenção do padrão)");
  }
  if (!tsxNome) {
    const alternativa = candidatosTsx.length > 0 ? ` (encontrado: ${candidatosTsx.join(", ")})` : "";
    add("estrutura/componente", "erro", `${nome}.tsx`, `O registry importa ./${nome}: o componente precisa se chamar ${nome}.tsx${alternativa}`);
  }
  if (!existsSync(testeCaminho)) {
    add("estrutura/teste", "aviso", "__tests__/mapper.test.ts", "Teste do mapper ausente");
  } else if (!/\bdescribe\(/.test(readFileSync(testeCaminho, "utf8"))) {
    add("estrutura/teste", "aviso", "__tests__/mapper.test.ts", "Teste sem bloco describe()");
  }

  const definition = ler(join(dir, "definition.ts"));
  if (definition) {
    const group = extrairPropriedade(definition, "group");
    if (!group) add("definition/group", "erro", "definition.ts", "Campo group não encontrado (o registry ignora a definition)");
    else if (group !== grupo) {
      add("definition/group", "erro", "definition.ts", `group "${group}" difere da pasta "${grupo}"`);
    }

    const modelId = extrairPropriedade(definition, "modelId");
    const esperado = `${grupo}--${paraKebab(nome)}`;
    if (!modelId) add("definition/modelId", "erro", "definition.ts", "Campo modelId não encontrado");
    else if (!modelId.startsWith(`${grupo}--`)) {
      add("definition/modelId", "erro", "definition.ts", `modelId "${modelId}" deveria começar com "${grupo}--"`);
    } else if (modelId !== esperado) {
      add("definition/modelId", "aviso", "definition.ts", `modelId "${modelId}" difere do padrão "${esperado}"`);
    }

    const nomeCampo = extrairPropriedade(definition, "name");
    if (!nomeCampo) add("definition/name", "erro", "definition.ts", "Campo name não encontrado (o registry ignora a definition)");
    else if (nomeCampo !== nome && paraKebab(nomeCampo) !== paraKebab(nome)) {
      add("definition/name", "aviso", "definition.ts", `name "${nomeCampo}" difere da pasta "${nome}"`);
    }
    if (!extrairPropriedade(definition, "version")) {
      add("definition/version", "erro", "definition.ts", "Campo version não encontrado (o registry ignora a definition)");
    }

    if (!/\.\.\.DL_FIELDS|buildDataLayerFields|buildRichTextDataLayerFields/.test(definition)) {
      add("definition/dl-fields", "aviso", "definition.ts", "Sem ...DL_FIELDS (convenção do padrão para tagueamento)");
    }
    if (!/export\s+const\s+load\s*=/.test(definition)) {
      add("definition/load", "info", "definition.ts", "Sem export const load (o registry gerado não depende dele)");
    }
    if (!/\btab\(/.test(definition)) {
      add("definition/abas", "aviso", "definition.ts", "Nenhuma aba via tab(): dialog sem organização por abas");
    }
    if (/type:\s*["']multifield["']/.test(definition) && !/subItems/.test(definition)) {
      add("definition/multifield", "info", "definition.ts", "multifield sem subItems: aceitável só para item com UM valor escalar (padrão 1)");
    }
  }

  const mapperBruto = ler(join(dir, "mapper.ts"));
  const mapper = mapperBruto === null ? null : semComentarios(mapperBruto);
  if (mapper) {
    for (const [re, msg] of [
      [/\bfetch\s*\(/, "Mapper não pode fazer fetch (síncrono e puro)"],
      [/\bawait\s/, "Mapper não pode usar await"],
      [/\basync\s/, "Mapper não pode ser async"],
    ] as const) {
      const m = re.exec(mapper);
      if (m) add("mapper/puro", "erro", "mapper.ts", msg, linhaDe(mapper, m.index));
    }
    const nullish = /\?\?\s*undefined/.exec(mapper);
    if (nullish) {
      add("mapper/nullish", "erro", "mapper.ts", "Use `|| undefined`: string vazia do AEM passa reto pelo `??`", linhaDe(mapper, nullish.index));
    }
    if (!/MapperFn/.test(mapper)) add("mapper/tipo", "aviso", "mapper.ts", "Mapper não tipado com MapperFn");
    if (!/\bsatisfies\b/.test(mapper)) add("mapper/satisfies", "aviso", "mapper.ts", "Retorno sem `satisfies <Nome>Props`");
    if (!/export\s+default/.test(mapper)) add("mapper/export", "erro", "mapper.ts", "Falta export default do mapper");
  }

  const indice = ler(join(dir, "index.ts"));
  if (indice) {
    if (!/export\s*\{\s*default\s*\}/.test(indice)) add("index/default", "aviso", "index.ts", "Barrel sem export do componente default");
    if (!/default as definition/.test(indice)) add("index/definition", "aviso", "index.ts", "Barrel sem export de definition");
    if (!/default as mapper/.test(indice)) add("index/mapper", "aviso", "index.ts", "Barrel sem export de mapper");
  }

  if (tsxNome) {
    const tsx = semComentarios(readFileSync(join(dir, tsxNome), "utf8"));
    const aue = /data-aue-/.exec(tsx);
    if (aue) add("tsx/aue-manual", "erro", tsxNome, "data-aue-* manual: use getEditorProps() de @/server/cms", linhaDe(tsx, aue.index));
    if (!/getEditorProps/.test(tsx) && !/rootEditorProps/.test(tsx)) {
      add("tsx/editor-props", "aviso", tsxNome, "Sem getEditorProps(): componente não editável in-context");
    }

    const cliente = /^\s*["']use client["']/m.test(tsx);
    const usaEstado = /\b(useState|useEffect|useRef|useReducer|useLayoutEffect)\b|\bon[A-Z][A-Za-z]+=\{/.test(tsx);
    if (usaEstado && !cliente) add("tsx/use-client", "erro", tsxNome, "Hook ou handler sem diretiva \"use client\"");
    if (cliente && !usaEstado) add("tsx/use-client", "aviso", tsxNome, "\"use client\" sem estado, efeito ou evento: deveria ser Server Component");

    const texto = />\s*([A-Za-zÀ-ú][^<>{}\n]{7,}?)\s*</g;
    let m: RegExpExecArray | null;
    while ((m = texto.exec(tsx)) !== null) {
      add("tsx/texto-hardcoded", "aviso", tsxNome, `Possível texto hardcoded: "${m[1].slice(0, 60)}". Texto autorável deve vir de richTextHtml()`, linhaDe(tsx, m.index));
    }

    if (!/\.module\.css/.test(tsx) && cssArquivos.length === 0) {
      add("tsx/css-module", "aviso", tsxNome, "Sem CSS Module próprio nem importado (ok só se delegar a um organismo)");
    }

    if (/<button\b/.test(tsx)) {
      const css = cssArquivos.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
      if (!/cursor:\s*pointer/.test(css)) {
        add("css/cursor-pointer", "aviso", cssArquivos[0] ?? tsxNome, "<button> custom sem cursor:pointer explícito");
      }
    }
  }

  for (const css of cssArquivos) {
    const conteudo = readFileSync(join(dir, css), "utf8");
    const hex = conteudo.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    if (hex.length > 0) {
      add("css/tokens", "info", css, `${hex.length} cor(es) hex literal(is): confira se existe token equivalente no Design System`);
    }
  }

  const erros = achados.filter((a) => a.severidade === "erro").length;
  const avisos = achados.filter((a) => a.severidade === "aviso").length;
  return {
    componente: `${grupo}/${nome}@${basename(dir)}`,
    grupo,
    nome,
    ok: erros === 0,
    erros,
    avisos,
    achados,
  };
}

export function formatarRelatorio(r: RelatorioComponente): string {
  const cabecalho = `${r.ok ? "OK" : "FALHOU"} ${r.componente} — ${r.erros} erro(s), ${r.avisos} aviso(s)`;
  if (r.achados.length === 0) return `${cabecalho}\nNenhum achado.`;
  const ordem: Record<Severidade, number> = { erro: 0, aviso: 1, info: 2 };
  const linhas = [...r.achados]
    .sort((a, b) => ordem[a.severidade] - ordem[b.severidade])
    .map(
      (a) =>
        `- [${a.severidade}] ${a.regra} · ${a.arquivo}${a.linha ? `:${a.linha}` : ""} — ${a.mensagem}`,
    );
  return `${cabecalho}\n${linhas.join("\n")}`;
}

export function diretorioDeComponente(caminho: string): string {
  return basename(caminho) === "definition.ts" ? dirname(caminho) : caminho;
}
