import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { entries } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { auth } from "@/lib/auth";

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~")
    .replace(/<del[^>]*>(.*?)<\/del>/gi, "~~$1~~")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<mark[^>]*>(.*?)<\/mark>/gi, "==$1==")
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?(ul|ol|p|br|div|hr|pre)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// GET /api/export — export all entries as streaming markdown
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const countResult = await db.select({ c: count() }).from(entries).where(eq(entries.userId, session.user.id));
  if (!countResult[0]?.c) {
    return NextResponse.json({ error: "No entries to export" }, { status: 404 });
  }

  const totalEntries = countResult[0].c;
  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Header
      controller.enqueue(encoder.encode(
        `# Moirai Journal Export\nExported: ${new Date().toISOString()}\nTotal entries: ${totalEntries}\n\n---\n\n`
      ));

      // Stream entries in batches
      const BATCH_SIZE = 100;
      let offset = 0;

      while (true) {
        const batch = await db.query.entries.findMany({
          where: eq(entries.userId, userId),
          orderBy: (e, { asc }) => [asc(e.date)],
          limit: BATCH_SIZE,
          offset,
        });

        if (batch.length === 0) break;

        for (const entry of batch) {
          const lines = [
            `## ${entry.date}${entry.title ? ` — ${entry.title}` : ""}`,
            "",
            entry.content ? htmlToMarkdown(entry.content) : "",
            "",
            `*${entry.wordCount || 0} words*`,
            "",
            "---",
            "",
          ];
          controller.enqueue(encoder.encode(lines.join("\n")));
        }

        offset += BATCH_SIZE;
        if (batch.length < BATCH_SIZE) break;
      }

      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="moirai-journal-export-${new Date().toISOString().split("T")[0]}.md"`,
    },
  });
}
