#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { caminhoDentro, carregarConfig, componentesRoot, exigirProjeto } from "./config.js";
import {
  capturar,
  compararImagens,
  formatarComparacao,
  lerPng,
  salvarResultado,
} from "./image-diff.js";
import { buscar, lerTopico, listarTopicos } from "./knowledge.js";
import { gerarArquivos, gravarArquivos, type CampoScaffold, type TipoCampo } from "./scaffold.js";
import { lerSpec, validarSpec } from "./spec-runner.js";
import { diretorioDeComponente, formatarRelatorio, validarComponente } from "./validate-component.js";

const AJUDA = `ue-pattern: consulta ao padrão, validação, scaffold e validação visual para componentes AEM Universal Editor.

Uso: node dist/cli.js <comando> [argumentos] [opções]

Padrão
  topicos                         Lista os documentos do padrão
  ler <id> [--secao "<título>"]   Lê um documento (ou só uma seção)
  buscar "<consulta>" [--limite N]

Componentes (rodar na raiz do projeto, ou usar --projeto)
  validar <caminho>               Ex: meu-grupo/sections/hero/v1
  validar-grupo <grupo>
  criar <grupo> <nome> --titulo "<Título>" [--tipo sections|components]
        [--campos "title:Título:richtext,image:Imagem:asset"] [--gravar]

Visual (precisa do servidor do projeto rodando e de Chrome)
  specs                           Lista e2e/pixel-perfect/specs/*.figma.json
  spec <arquivo> [--frame mobile] [--base-url URL]
  comparar <referencia.png> <url-ou-rota> --largura N
        [--seletor CSS] [--pagina-inteira] [--escala 2] [--esperar CSS]
        [--tolerancia 0.1] [--limite 0] [--nome prefixo]

Opções globais
  --projeto <caminho>             Raiz do projeto (padrão: UE_PATTERN_PROJECT_PATH ou diretório atual)
  --ajuda
`;

const config = carregarConfig();

function encontrarVersoes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "__tests__") continue;
    const completo = join(dir, nome);
    if (!statSync(completo).isDirectory()) continue;
    if (/^v\d+$/.test(nome) && existsSync(join(completo, "definition.ts"))) saida.push(completo);
    else saida.push(...encontrarVersoes(completo));
  }
  return saida;
}

function raizComponentes(): string {
  return componentesRoot(exigirProjeto(config));
}

function resolverComponente(caminho: string): string {
  const raiz = raizComponentes();
  const base = isAbsolute(caminho) ? caminho : join(raiz, caminho);
  return diretorioDeComponente(caminhoDentro(raiz, base));
}

function exigir(valor: string | undefined, nome: string): string {
  if (!valor) throw new Error(`Argumento obrigatório ausente: ${nome}\n\n${AJUDA}`);
  return valor;
}

function numero(valor: string | undefined, nome: string): number | undefined {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Error(`${nome} precisa ser número: ${valor}`);
  return n;
}

function parseCampos(texto: string | undefined): CampoScaffold[] | undefined {
  if (!texto) return undefined;
  const tipos: TipoCampo[] = ["text", "richtext", "asset", "boolean"];
  return texto.split(",").map((item) => {
    const [name, label, type] = item.split(":").map((p) => p.trim());
    if (!name || !label || !tipos.includes(type as TipoCampo)) {
      throw new Error(`Campo inválido "${item}". Formato: nome:Rótulo:(${tipos.join("|")})`);
    }
    return { name, label, type: type as TipoCampo };
  });
}

async function executar(): Promise<string> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      ajuda: { type: "boolean" },
      projeto: { type: "string" },
      secao: { type: "string" },
      limite: { type: "string" },
      titulo: { type: "string" },
      tipo: { type: "string" },
      campos: { type: "string" },
      gravar: { type: "boolean" },
      frame: { type: "string" },
      "base-url": { type: "string" },
      largura: { type: "string" },
      seletor: { type: "string" },
      "pagina-inteira": { type: "boolean" },
      escala: { type: "string" },
      esperar: { type: "string" },
      tolerancia: { type: "string" },
      nome: { type: "string" },
    },
  });

  if (values.projeto) config.projectPath = values.projeto;
  const [comando, ...args] = positionals;
  if (!comando || values.ajuda) return AJUDA;

  switch (comando) {
    case "topicos":
      return listarTopicos(config.knowledgePath)
        .map((t) => `${t.id} — ${t.titulo} (${t.bytes} bytes)`)
        .join("\n");

    case "ler":
      return lerTopico(config.knowledgePath, exigir(args[0], "id"), values.secao);

    case "buscar": {
      const r = buscar(config.knowledgePath, exigir(args[0], "consulta"), numero(values.limite, "--limite") ?? 8);
      if (r.length === 0) return "Nenhum resultado.";
      return r.map((x) => `## ${x.topico} (pontuação ${x.pontuacao})\n${x.trechos.join("\n")}`).join("\n\n");
    }

    case "validar":
      return formatarRelatorio(
        validarComponente(resolverComponente(exigir(args[0], "caminho")), raizComponentes()),
      );

    case "validar-grupo": {
      const grupo = exigir(args[0], "grupo");
      const raizGeral = raizComponentes();
      const raiz = join(raizGeral, grupo);
      const versoes = encontrarVersoes(raiz);
      if (versoes.length === 0) return `Nenhum componente encontrado em ${raiz}`;
      const relatorios = versoes.map((v) => validarComponente(v, raizGeral));
      relatorios.sort((a, b) => b.erros - a.erros || b.avisos - a.avisos);
      const resumo = relatorios.map(
        (r) => `${r.ok ? "OK    " : "FALHOU"} ${r.componente} — ${r.erros} erro(s), ${r.avisos} aviso(s)`,
      );
      const detalhes = relatorios.filter((r) => r.erros > 0).map((r) => formatarRelatorio(r));
      return [`${relatorios.length} componente(s) em ${grupo}`, ...resumo, "", ...detalhes].join("\n");
    }

    case "criar": {
      const grupo = exigir(args[0], "grupo");
      const nome = exigir(args[1], "nome");
      const titulo = exigir(values.titulo, "--titulo");
      const tipo = values.tipo === "components" ? "components" : "sections";
      const raiz = raizComponentes();
      const arquivos = gerarArquivos({
        componentsRoot: raiz,
        grupo,
        nome,
        titulo,
        tipo,
        campos: parseCampos(values.campos),
      });
      if (!values.gravar) {
        return [
          "DRY-RUN: nada foi gravado. Repita com --gravar para criar.",
          ...arquivos.map((a) => `\n### ${relative(raiz, a.caminho)}\n${a.conteudo}`),
        ].join("\n");
      }
      const criados = gravarArquivos(arquivos);
      const dir = join(raiz, grupo, tipo, nome, "v1");
      return [
        `Criados ${criados.length} arquivos:`,
        ...criados.map((c) => `- ${relative(raiz, c)}`),
        "",
        formatarRelatorio(validarComponente(dir, raiz)),
        "",
        "Próximo passo: npm run generate:registries no projeto.",
      ].join("\n");
    }

    case "specs": {
      const dir = join(exigirProjeto(config), "e2e", "pixel-perfect", "specs");
      if (!existsSync(dir)) return `Pasta inexistente: ${dir}`;
      const itens = readdirSync(dir).filter((f) => f.endsWith(".figma.json"));
      return itens.length === 0 ? "Nenhum spec." : itens.join("\n");
    }

    case "spec": {
      const spec = exigir(args[0], "arquivo");
      const dir = join(exigirProjeto(config), "e2e", "pixel-perfect", "specs");
      const caminho = isAbsolute(spec) ? spec : caminhoDentro(dir, spec);
      const resultado = await validarSpec(lerSpec(caminho), {
        baseUrl: values["base-url"] ?? config.baseUrl,
        chromePath: config.chromePath,
        frame: values.frame,
      });
      return [
        `${resultado.ok ? "APROVADO" : "REPROVADO"} ${resultado.componente} (${resultado.url})`,
        ...resultado.frames.map((f) => f.relatorio),
      ].join("\n\n");
    }

    case "comparar": {
      const referencia = lerPng(exigir(args[0], "referencia.png"));
      const url = new URL(exigir(args[1], "url"), config.baseUrl).toString();
      const largura = numero(values.largura, "--largura");
      if (!largura) throw new Error("--largura é obrigatório (igual à do frame de referência)");
      const atual = await capturar({
        url,
        largura,
        seletor: values.seletor,
        paginaInteira: values["pagina-inteira"],
        escala: numero(values.escala, "--escala"),
        esperarSeletor: values.esperar,
        chromePath: config.chromePath,
      });
      const limite = numero(values.limite, "--limite") ?? 0;
      const resultado = compararImagens(referencia, atual, {
        tolerancia: numero(values.tolerancia, "--tolerancia"),
        limitePercentual: limite,
      });
      const nome = (values.nome ?? new Date().toISOString().replace(/[:.]/g, "-")).replace(/[^a-zA-Z0-9_-]/g, "_");
      const arquivos = salvarResultado(config.outputPath, nome, resultado, atual);
      return [
        formatarComparacao(resultado, limite),
        "",
        `De-para (referência | atual | diff): ${arquivos.deparaComposto}`,
        `Diff: ${arquivos.diff}`,
        `Captura atual: ${arquivos.atual}`,
      ].join("\n");
    }

    default:
      throw new Error(`Comando desconhecido: ${comando}\n\n${AJUDA}`);
  }
}

executar().then(
  (saida) => {
    process.stdout.write(`${saida}\n`);
  },
  (erro) => {
    process.stderr.write(`Erro: ${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exit(1);
  },
);
