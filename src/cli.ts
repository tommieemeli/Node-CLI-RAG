import { Command } from "commander";

const program = new Command();

program
  .name("rag")
  .description("Answer questions over a folder of local documents, with citations")
  .version("0.1.0");

program
  .command("ingest")
  .argument("<dir>", "directory containing .txt and .md documents")
  .description("Load, chunk, embed and persist the corpus")
  .action(() => {
    throw new Error("ingest is not implemented yet");
  });

program
  .command("ask")
  .argument("<question>", "question to answer from the ingested corpus")
  .description("Retrieve context and answer the question, citing its sources")
  .action(() => {
    throw new Error("ask is not implemented yet");
  });

try {
  await program.parseAsync();
} catch (error) {
  // A failed run should read as a message, not a stack trace.
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
