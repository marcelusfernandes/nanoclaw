#!/usr/bin/env npx tsx
/**
 * X Integration - Read Replies
 * Usage: echo '{"tweetUrl":"https://x.com/user/status/123","count":10}' | npx tsx read-replies.ts
 */

import { getBrowserContext, navigateToTweet, runScript, extractTweetId, config, ScriptResult } from '../lib/browser.js';

interface ReadRepliesInput {
  tweetUrl: string;
  count?: number;
}

interface ReplyData {
  author: string;
  handle: string;
  text: string;
  metrics: { replies?: string; retweets?: string; likes?: string };
  time?: string;
}

async function readReplies(input: ReadRepliesInput): Promise<ScriptResult> {
  const { tweetUrl, count = 10 } = input;

  if (!tweetUrl) {
    return { success: false, message: 'Tweet URL is required' };
  }

  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return { success: false, message: 'Invalid tweet URL or ID' };
  }

  let context = null;
  try {
    context = await getBrowserContext();
    const { page, success, error } = await navigateToTweet(context, tweetUrl);

    if (!success) {
      return { success: false, message: error || 'Failed to load tweet' };
    }

    // Wait for replies to load (they appear below the main tweet)
    await page.waitForTimeout(2000);

    // Scroll down to load more replies
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1500);

    // All articles on the page - first one is the original tweet, rest are replies
    const articles = page.locator('article[data-testid="tweet"]');
    const articleCount = await articles.count();

    const replies: ReplyData[] = [];
    const limit = Math.min(count, articleCount - 1, 20); // Skip first (original tweet)

    for (let i = 1; i <= limit; i++) {
      try {
        const article = articles.nth(i);

        const authorEl = article.locator('[data-testid="User-Name"]');
        const authorText = await authorEl.textContent().catch(() => '');
        const nameParts = authorText?.match(/^(.+?)(@\w+)/);
        const author = nameParts?.[1]?.trim() || '';
        const handle = nameParts?.[2] || '';

        const replyText = await article.locator('[data-testid="tweetText"]').textContent().catch(() => '');

        const timeEl = article.locator('time').first();
        const datetime = await timeEl.getAttribute('datetime').catch(() => null);

        const replyCount = await article.locator('[data-testid="reply"] span').textContent().catch(() => '');
        const retweetCount = await article.locator('[data-testid="retweet"] span').textContent().catch(() => '');
        const likeCount = await article.locator('[data-testid="like"] span').textContent().catch(() => '');

        replies.push({
          author,
          handle,
          text: replyText || '',
          metrics: {
            replies: replyCount || undefined,
            retweets: retweetCount || undefined,
            likes: likeCount || undefined,
          },
          time: datetime || undefined,
        });
      } catch {
        // Skip replies that fail to parse
      }
    }

    if (replies.length === 0) {
      return { success: true, message: 'No replies found for this tweet.' };
    }

    const formatted = replies.map((r, i) =>
      `${i + 1}. ${r.author} ${r.handle}${r.time ? ` · ${r.time}` : ''}\n   ${r.text.slice(0, 200)}${r.text.length > 200 ? '...' : ''}\n   💬${r.metrics.replies || '0'} 🔁${r.metrics.retweets || '0'} ❤️${r.metrics.likes || '0'}`
    ).join('\n\n');

    return {
      success: true,
      message: `${replies.length} replies:\n\n${formatted}`,
      data: replies,
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<ReadRepliesInput>(readReplies);
