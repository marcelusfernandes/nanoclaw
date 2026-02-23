#!/usr/bin/env npx tsx
/**
 * X Integration - Search Tweets
 * Usage: echo '{"query":"AI news","count":10}' | npx tsx search.ts
 */

import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface SearchInput {
  query: string;
  count?: number;
  tab?: 'top' | 'latest' | 'people' | 'media';
}

interface TweetData {
  author: string;
  handle: string;
  text: string;
  url: string;
  metrics: { replies?: string; retweets?: string; likes?: string; views?: string };
  time?: string;
}

async function searchTweets(input: SearchInput): Promise<ScriptResult> {
  const { query, count = 10, tab = 'top' } = input;

  if (!query || query.trim().length === 0) {
    return { success: false, message: 'Search query cannot be empty' };
  }

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query${tab === 'latest' ? '&f=live' : tab === 'people' ? '&f=user' : tab === 'media' ? '&f=media' : ''}`;
    await page.goto(searchUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad + 2000);

    const tweets: TweetData[] = [];
    const articles = page.locator('article[data-testid="tweet"]');
    const articleCount = await articles.count();

    const limit = Math.min(count, articleCount, 20);

    for (let i = 0; i < limit; i++) {
      try {
        const article = articles.nth(i);

        const authorEl = article.locator('[data-testid="User-Name"]');
        const authorText = await authorEl.textContent().catch(() => '');
        const nameParts = authorText?.match(/^(.+?)(@\w+)/);
        const author = nameParts?.[1]?.trim() || '';
        const handle = nameParts?.[2] || '';

        const tweetText = await article.locator('[data-testid="tweetText"]').textContent().catch(() => '');

        // Get tweet URL from timestamp link
        const timeLink = article.locator('a[href*="/status/"] time').first();
        const timeEl = await timeLink.getAttribute('datetime').catch(() => null);
        const statusLink = article.locator('a[href*="/status/"]').first();
        const href = await statusLink.getAttribute('href').catch(() => '');
        const url = href ? `https://x.com${href}` : '';

        // Get metrics
        const replyCount = await article.locator('[data-testid="reply"] span').textContent().catch(() => '');
        const retweetCount = await article.locator('[data-testid="retweet"] span').textContent().catch(() => '');
        const likeCount = await article.locator('[data-testid="like"] span').textContent().catch(() => '');
        const viewCount = await article.locator('a[href*="/analytics"] span').textContent().catch(() => '');

        tweets.push({
          author,
          handle,
          text: tweetText || '',
          url,
          metrics: {
            replies: replyCount || undefined,
            retweets: retweetCount || undefined,
            likes: likeCount || undefined,
            views: viewCount || undefined,
          },
          time: timeEl || undefined,
        });
      } catch {
        // Skip tweets that fail to parse
      }
    }

    if (tweets.length === 0) {
      return { success: true, message: `No tweets found for "${query}"` };
    }

    const formatted = tweets.map((t, i) =>
      `${i + 1}. ${t.author} ${t.handle}${t.time ? ` · ${t.time}` : ''}\n   ${t.text.slice(0, 200)}${t.text.length > 200 ? '...' : ''}\n   ${t.url}\n   💬${t.metrics.replies || '0'} 🔁${t.metrics.retweets || '0'} ❤️${t.metrics.likes || '0'}${t.metrics.views ? ` 👁${t.metrics.views}` : ''}`
    ).join('\n\n');

    return {
      success: true,
      message: `Found ${tweets.length} tweets for "${query}":\n\n${formatted}`,
      data: tweets,
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<SearchInput>(searchTweets);
