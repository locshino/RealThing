import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { postPath, publishedPosts } from "../../blogCollection";

export async function GET(context: APIContext) {
	const posts = await publishedPosts();
	return rss({
		title: "RealThing Blog",
		description: "Updates, tutorials, and insights from the RealThing team.",
		site: context.site ?? "https://realthing.ai",
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.excerpt,
			pubDate: post.data.date,
			link: postPath(post),
		})),
	});
}
