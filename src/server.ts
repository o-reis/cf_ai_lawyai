import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest, type Schedule } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  generateText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet
} from "ai";
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are LawyAI, a Portuguese legal assistant. You help users understand Portuguese law.
When a user asks a legal question, always use the searchLegalArticles tool first to find relevant legislation, then base your answer on the retrieved articles.
Always remind the user that your answers are not a substitute for professional legal advice. NEVER use your own information, your answer must be acquired from the tool.`,
      // Prune old tool calls to save tokens on long conversations
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        // Server-side tool: runs automatically on the server
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name")
          }),
          execute: async ({ city }) => {
            // Replace with a real weather API in production
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius"
            };
          }
        }),

        // Client-side tool: no execute function — the browser handles it
        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({})
        }),

        // Approval tool: requires user confirmation before executing
        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator")
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b)
            };
          }
        }),

        // Legal semantic search: embeds the query and retrieves relevant articles from Vectorize
        searchLegalArticles: tool({
          description:
            "Search Portuguese legal articles using semantic similarity. Use this for every legal question.",
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                "The legal question or topic to search for in Portuguese"
              ),
            topK: z
              .number()
              .min(1)
              .max(10)
              .default(5)
              .describe("Number of articles to retrieve (default 5)")
          }),
          execute: async ({ query, topK = 5 }) => {
            const workersai = createWorkersAI({ binding: this.env.AI });

            // Multi-query: generate 3 alternative phrasings of the question,
            // search with each, then merge results keeping the best score per article.
            // This increases recall compared to a single embedding.
            const { text: raw } = await generateText({
              model: workersai("@cf/zai-org/glm-4.7-flash"),
              prompt: `Given this legal question, produce 3 alternative search queries that approach the topic from different angles. Return ONLY a valid JSON array of 3 strings and nothing else. The alternatives should be in Portuguese european.

Question: ${query}

JSON array:`,
              maxOutputTokens: 150
            });

            let queries: string[] = [query];
            try {
              const parsed = JSON.parse(raw.trim());
              if (Array.isArray(parsed))
                queries = [query, ...parsed].slice(0, 4);
            } catch {
              /* fallback to original query only */
            }

            // Embed all queries and search Vectorize, merging by best score
            const bestScores = new Map<string, number>();
            for (const q of queries) {
              const embedding = (await this.env.AI.run(
                "@cf/baai/bge-m3" as Parameters<typeof this.env.AI.run>[0],
                { text: [q] }
              )) as { data: number[][] };

              const results = await this.env.VECTORIZE.query(
                embedding.data[0],
                {
                  topK,
                  returnMetadata: "none"
                }
              );

              for (const match of results.matches) {
                const prev = bestScores.get(match.id) ?? -1;
                if (match.score > prev) bestScores.set(match.id, match.score);
              }
            }

            if (!bestScores.size) {
              return { articles: [], message: "No relevant articles found." };
            }

            // Sort merged results by score and take top-k
            const rankedIds = [...bestScores.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, topK)
              .map(([id]) => id);

            // Fetch matching articles from D1
            const dbResult = await this.env.lawyaidb
              .prepare(
                `SELECT a.id, a.text, c.name AS category
                 FROM Articles a
                 JOIN Categories c ON a.category_id = c.id
                 WHERE a.id IN (${rankedIds.join(",")})`
              )
              .all<{ id: number; text: string; category: string }>();

            const articleMap = new Map(
              dbResult.results.map((a) => [String(a.id), a])
            );
            const articles = rankedIds
              .map((id) => articleMap.get(id))
              .filter(Boolean);

            return { articles };
          }
        })
      },
      onFinish,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    // Do the actual work here (send email, call API, etc.)
    console.log(`Executing scheduled task: ${description}`);

    // Notify connected clients via a broadcast event.
    // We use broadcast() instead of saveMessages() to avoid injecting
    // into chat history — that would cause the AI to see the notification
    // as new context and potentially loop.
    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString()
      })
    );
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
