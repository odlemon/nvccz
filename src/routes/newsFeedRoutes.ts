import express from "express";
import { prisma } from "../utils/database";

const router = express.Router();

// Publisher headlines and summaries are public metadata. Full articles remain
// at their original publisher URLs; only ingested records with verified covers
// are eligible for this paginated feed.
router.get("/", async (req, res): Promise<void> => {
  try {
    const parsedPage = Math.max(Number.parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(String(req.query.pageSize ?? "12"), 10) || 12, 1), 60);
    const totalResults = await prisma.newsArticle.count();
    const page = Math.min(parsedPage, Math.max(1, Math.ceil(totalResults / pageSize)));
    const results = await prisma.newsArticle.findMany({
      orderBy: [{ pubDate: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    res.json({
      status: "success",
      totalResults,
      page,
      pageSize,
      hasMore: page * pageSize < totalResults,
      results: results.map((article) => ({
        article_id: article.articleId,
        title: article.title,
        link: article.link,
        description: article.description,
        content: article.description,
        creator: article.creator ? [article.creator] : [],
        pubDate: article.pubDate.toISOString(),
        image_url: article.imageUrl,
        source_id: article.sourceId,
        source_name: article.sourceName,
        source_url: article.sourceUrl,
        category: [article.sourceName],
        language: article.language,
      })),
    });
  } catch (error) {
    console.error("[news-feed] unable to read stored headlines", error);
    res.status(503).json({ status: "error", message: "News is temporarily unavailable." });
  }
});

export default router;
