import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raizPacote = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Config {
  raizPacote: string;
  knowledgePath: string;
  outputPath: string;
  projectPath: string;
  baseUrl: string;
  chromePath: string | undefined;
}

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resolverRelativo = (valor: string | undefined, padrao: string) =>
    resolve(raizPacote, valor && valor.length > 0 ? valor : padrao);

  return {
    raizPacote,
    knowledgePath: resolverRelativo(env.UE_PATTERN_KNOWLEDGE_PATH, "reference"),
    outputPath: resolverRelativo(env.UE_PATTERN_OUTPUT_PATH, "outputs"),
    projectPath: resolve(env.UE_PATTERN_PROJECT_PATH || process.cwd()),
    baseUrl: env.UE_PATTERN_BASE_URL ?? "http://localhost:3000",
    chromePath: env.CHROME_EXECUTABLE_PATH || undefined,
  };
}

export function exigirProjeto(config: Config): string {
  const raiz = join(config.projectPath, "src", "frontend", "components");
  if (!existsSync(raiz)) {
    throw new Error(
      `Projeto sem src/frontend/components em ${config.projectPath}. Rode a partir da raiz do projeto ou use --projeto / UE_PATTERN_PROJECT_PATH.`,
    );
  }
  return config.projectPath;
}

export function caminhoDentro(base: string, alvo: string): string {
  const absoluto = resolve(base, alvo);
  const raiz = base.endsWith("/") ? base : `${base}/`;
  if (absoluto !== base && !absoluto.startsWith(raiz)) {
    throw new Error(`Caminho fora da raiz permitida: ${alvo}`);
  }
  return absoluto;
}

export function componentesRoot(projectPath: string): string {
  return join(projectPath, "src", "frontend", "components");
}
