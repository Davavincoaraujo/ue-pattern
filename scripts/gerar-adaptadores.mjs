import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corpo = readFileSync(join(raiz, "agent", "AGENT.md"), "utf8");

const descricao =
  "Constrói de ponta a ponta, de forma autônoma, um componente AEM Universal Editor (definition, mapper, componente, CSS Module, testes, registry) seguindo o padrão do ue-pattern: consulta o padrão, gera o esqueleto, implementa, roda os gates e itera até passar. Use para criar componente novo, migrar uma seção do Figma ou construir uma seção em um grupo.";

const arquivos = {
  "AGENTS.md": corpo,
  "adapters/claude-code/ue-pattern-builder.md": `---\nname: ue-pattern-builder\ndescription: "${descricao}"\ntools: Read, Grep, Glob, Edit, Write, Bash, TodoWrite\n---\n\n${corpo}`,
  "adapters/cursor/ue-pattern.mdc": `---\ndescription: ${descricao}\nalwaysApply: false\n---\n\n${corpo}`,
  "adapters/copilot/ue-pattern.instructions.md": `---\napplyTo: "src/frontend/components/**"\n---\n\n${corpo}`,
};

for (const [caminho, conteudo] of Object.entries(arquivos)) {
  const destino = join(raiz, caminho);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
  console.log(`ok ${caminho}`);
}
