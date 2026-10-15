import { isAccessibleCoverImage, newsSources, parseFeedXml, readImageDimensions } from "../../services/NewsFeedService";

describe("news feed parsing", () => {
  const source = newsSources[0];
  const validCover = async () => true;

  it("normalizes publisher links and extracts metadata and real feed covers", async () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[Markets &amp; growth]]></title>
      <link>https://publisher.example/story?utm_source=rss&amp;id=42</link>
      <description><![CDATA[<p>Short publisher summary.</p>]]></description>
      <pubDate>Wed, 14 Oct 2026 10:00:00 GMT</pubDate>
      <dc:creator>Reporter</dc:creator>
      <enclosure url="https://images.publisher.example/cover.jpg" type="image/jpeg" />
    </item></channel></rss>`;

    const { articles, excluded } = await parseFeedXml(xml, source, validCover);
    expect(excluded).toBe(0);
    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      sourceId: source.id,
      title: "Markets & growth",
      link: "https://publisher.example/story?id=42",
      description: "Short publisher summary.",
      creator: "Reporter",
      imageUrl: "https://images.publisher.example/cover.jpg",
    });
    expect(articles[0].id).toMatch(/^[a-f0-9]{64}$/);
  });

  it("excludes records without an accessible publisher image", async () => {
    const xml = `<rss><item><title>Missing image</title><link>https://publisher.example/story</link><pubDate>Wed, 14 Oct 2026 10:00:00 GMT</pubDate></item></rss>`;
    const result = await parseFeedXml(xml, source, validCover);
    expect(result.articles).toHaveLength(0);
    expect(result.excluded).toBe(1);
  });

  it("rejects non-HTTPS and loopback image locations before requesting them", async () => {
    await expect(isAccessibleCoverImage("http://images.example/cover.jpg")).resolves.toBe(false);
    await expect(isAccessibleCoverImage("https://localhost/cover.jpg")).resolves.toBe(false);
    await expect(isAccessibleCoverImage("https://127.0.0.1/cover.jpg")).resolves.toBe(false);
  });

  it("reads cover dimensions from a PNG header", () => {
    const pngHeader = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(pngHeader, 0);
    pngHeader.writeUInt32BE(1600, 16);
    pngHeader.writeUInt32BE(900, 20);
    expect(readImageDimensions(pngHeader)).toEqual({ width: 1600, height: 900 });
    expect(readImageDimensions(Buffer.from("not an image"))).toBeNull();
  });
});
