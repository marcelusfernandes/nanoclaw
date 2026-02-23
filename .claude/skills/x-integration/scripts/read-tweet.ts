#!/usr/bin/env npx tsx
/**
 * X Integration - Read Tweet
 * Usage: echo '{"tweetUrl":"https://x.com/user/status/123"}' | npx tsx read-tweet.ts
 */

import { getBrowserContext, navigateToTweet, runScript, extractTweetId, config, ScriptResult } from '../lib/browser.js';

interface ReadTweetInput {
  tweetUrl: string;
}

async function readTweet(input: ReadTweetInput): Promise<ScriptResult> {
  const { tweetUrl } = input;

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

    // The main tweet on a status page is the first article
    const mainTweet = page.locator('article[data-testid="tweet"]').first();
    await mainTweet.waitFor({ timeout: config.timeouts.elementWait });

    // Author info
    const authorEl = mainTweet.locator('[data-testid="User-Name"]');
    const authorText = await authorEl.textContent().catch(() => '');
    const nameParts = authorText?.match(/^(.+?)(@\w+)/);
    const author = nameParts?.[1]?.trim() || '';
    const handle = nameParts?.[2] || '';

    // Tweet text
    const tweetText = await mainTweet.locator('[data-testid="tweetText"]').textContent().catch(() => '');

    // Timestamp
    const timeEl = mainTweet.locator('time').first();
    const datetime = await timeEl.getAttribute('datetime').catch(() => null);
    const timeText = await timeEl.textContent().catch(() => '');

    // Metrics (on detail page, metrics are more detailed)
    const replyCount = await mainTweet.locator('[data-testid="reply"] span').textContent().catch(() => '');
    const retweetCount = await mainTweet.locator('[data-testid="retweet"] span').textContent().catch(() => '');
    const likeCount = await mainTweet.locator('[data-testid="like"] span').textContent().catch(() => '');
    const viewCount = await mainTweet.locator('a[href*="/analytics"] span').textContent().catch(() => '');

    // Check for media
    const hasImage = await mainTweet.locator('[data-testid="tweetPhoto"]').count().catch(() => 0);
    const hasVideo = await mainTweet.locator('[data-testid="videoPlayer"]').count().catch(() => 0);

    // Check if it's a quote tweet
    const quotedTweet = mainTweet.locator('[data-testid="quoteTweet"]');
    const hasQuote = await quotedTweet.count().catch(() => 0);
    let quotedText = '';
    if (hasQuote > 0) {
      quotedText = await quotedTweet.locator('[data-testid="tweetText"]').textContent().catch(() => '') || '';
    }

    const tweetData = {
      author,
      handle,
      text: tweetText || '',
      url: tweetUrl,
      time: timeText || datetime || '',
      metrics: {
        replies: replyCount || '0',
        retweets: retweetCount || '0',
        likes: likeCount || '0',
        views: viewCount || undefined,
      },
      media: {
        images: hasImage,
        videos: hasVideo,
      },
      quotedTweet: hasQuote > 0 ? quotedText : undefined,
    };

    let formatted = `📝 ${author} ${handle}\n`;
    formatted += `🕐 ${tweetData.time}\n\n`;
    formatted += `${tweetData.text}\n\n`;
    if (tweetData.quotedTweet) {
      formatted += `> Quoted: ${tweetData.quotedTweet.slice(0, 200)}\n\n`;
    }
    if (hasImage > 0) formatted += `📷 ${hasImage} image(s)\n`;
    if (hasVideo > 0) formatted += `🎥 ${hasVideo} video(s)\n`;
    formatted += `\n💬${tweetData.metrics.replies} 🔁${tweetData.metrics.retweets} ❤️${tweetData.metrics.likes}${tweetData.metrics.views ? ` 👁${tweetData.metrics.views}` : ''}`;

    return {
      success: true,
      message: formatted,
      data: tweetData,
    };

  } finally {
    if (context) await context.close();
  }
}

runScript<ReadTweetInput>(readTweet);
