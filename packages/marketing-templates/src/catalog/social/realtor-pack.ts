/**
 * Realtor-focused social pack — 13 templates that round out the
 * catalog from 28 → 41. Each is a thin wrapper over createStackedTemplate
 * with unique copy + mood tags so the director can pick the right one
 * for each prompt.
 *
 * Why a single file: the layout is identical (eyebrow + headline + body
 * + CTA on a stacked column), so paste-13-times would dilute the repo
 * for no design payoff. Templates that need bespoke art (photos, grids,
 * stat heroes) still get their own files.
 */

import { createStackedTemplate } from '../../lib/factory';

export const openHouseAnnouncement = createStackedTemplate({
  catalogKey: 'social-open-house-announcement',
  name: 'Open house announcement',
  description: 'Saturday/Sunday open-house teaser with address + time block.',
  contentType: 'SOCIAL_POST',
  moodTags: ['open-house', 'realtor', 'announcement', 'social', 'event'],
  defaults: {
    eyebrow: 'OPEN HOUSE',
    headline: 'Saturday 1–3pm — come walk through.',
    body: 'New listing in the neighborhood. Bring questions, bring friends.',
    cta: 'Get the address',
  },
});

export const listingComingSoon = createStackedTemplate({
  catalogKey: 'social-listing-coming-soon',
  name: 'Listing coming soon',
  description: 'Pre-list teaser to build buyer demand before the MLS goes live.',
  contentType: 'SOCIAL_POST',
  moodTags: ['coming-soon', 'realtor', 'listing', 'announcement', 'teaser'],
  defaults: {
    eyebrow: 'COMING SOON',
    headline: 'A new listing drops next week.',
    body: 'DM for the early walkthrough — we love a soft launch with serious buyers.',
    cta: 'DM for details',
  },
});

export const soldCelebration = createStackedTemplate({
  catalogKey: 'social-sold-celebration',
  name: 'Sold celebration',
  description: 'Just-sold post celebrating a closing — congrats to the buyers.',
  contentType: 'SOCIAL_POST',
  moodTags: ['sold', 'realtor', 'celebration', 'announcement', 'social'],
  defaults: {
    eyebrow: 'SOLD',
    headline: 'Keys are in the door — congrats to the new owners!',
    body: 'Another family home. Thanks for trusting us with the biggest move of your year.',
    cta: 'Talk to me',
  },
});

export const marketUpdate = createStackedTemplate({
  catalogKey: 'social-market-update',
  name: 'Market update',
  description: 'Monthly local-market update with one big stat + a paragraph.',
  contentType: 'SOCIAL_POST',
  moodTags: ['market', 'data', 'realtor', 'professional', 'update'],
  defaults: {
    eyebrow: 'MARKET UPDATE',
    headline: 'Median price up 4.2% over last quarter.',
    body: 'Inventory still tight. Three offers per house this week. Want the full breakdown?',
    cta: 'Send me the report',
  },
});

export const mortgageRateAlert = createStackedTemplate({
  catalogKey: 'social-mortgage-rate-alert',
  name: 'Mortgage rate alert',
  description: 'Time-sensitive rate movement post for buyers on the fence.',
  contentType: 'SOCIAL_POST',
  moodTags: ['mortgage', 'rates', 'urgent', 'announcement', 'finance'],
  bandStyle: 'dark',
  defaults: {
    eyebrow: 'RATE DROP',
    headline: 'Rates ticked down — payment math just changed.',
    body: 'A quarter-point move on a $400k loan can save you $60+ a month. Worth a 10-minute chat.',
    cta: 'Run my numbers',
  },
});

export const referralThanks = createStackedTemplate({
  catalogKey: 'social-referral-thanks',
  name: 'Referral thanks',
  description: 'Public thank-you for a referral with warm, personal tone.',
  contentType: 'SOCIAL_POST',
  moodTags: ['referral', 'thanks', 'warm', 'professional', 'gratitude'],
  defaults: {
    eyebrow: 'THANK YOU',
    headline: 'A referral is the highest compliment.',
    body: 'When you tell a friend about us, you trust us with someone you care about. That means everything.',
    cta: 'Pass the word',
  },
});

export const seasonalChristmas = createStackedTemplate({
  catalogKey: 'social-seasonal-christmas',
  name: 'Christmas greeting',
  description: 'Warm holiday greeting card to send to the partner list.',
  contentType: 'SOCIAL_POST',
  moodTags: ['holiday', 'christmas', 'celebration', 'warm', 'social'],
  defaults: {
    eyebrow: 'MERRY CHRISTMAS',
    headline: 'Wishing you a warm + bright season.',
    body: 'Thanks for letting us be part of your year. See you in the new one.',
    cta: '',
  },
});

export const seasonalJuly4 = createStackedTemplate({
  catalogKey: 'social-seasonal-july4',
  name: 'July 4th greeting',
  description: 'Independence Day post — patriotic + community-focused.',
  contentType: 'SOCIAL_POST',
  moodTags: ['holiday', 'july4', 'celebration', 'social', 'community'],
  defaults: {
    eyebrow: 'HAPPY 4TH',
    headline: 'Burgers, fireworks, freedom.',
    body: "Have a safe holiday. We're grateful to serve this community.",
    cta: '',
  },
});

export const seasonalHalloween = createStackedTemplate({
  catalogKey: 'social-seasonal-halloween',
  name: 'Halloween post',
  description: 'Lighthearted Halloween post — pumpkins + neighborhood.',
  contentType: 'SOCIAL_POST',
  moodTags: ['holiday', 'halloween', 'social', 'fun', 'neighborhood'],
  defaults: {
    eyebrow: 'HAPPY HALLOWEEN',
    headline: 'Stock the candy. Charge the porch light.',
    body: 'Hope your stoop sees a hundred trick-or-treaters. Have a fun, safe night.',
    cta: '',
  },
});

export const seasonalThanksgiving = createStackedTemplate({
  catalogKey: 'social-seasonal-thanksgiving',
  name: 'Thanksgiving message',
  description: 'Gratitude-focused Thanksgiving post for clients + partners.',
  contentType: 'SOCIAL_POST',
  moodTags: ['holiday', 'thanksgiving', 'gratitude', 'warm', 'social'],
  defaults: {
    eyebrow: 'GRATEFUL',
    headline: 'Today we count the people we get to work with.',
    body: 'Thanks for trusting us with your home, your business, and your referrals.',
    cta: '',
  },
});

export const seasonalValentines = createStackedTemplate({
  catalogKey: 'social-seasonal-valentines',
  name: "Valentine's post",
  description: "Light Valentine's post — love letter to the city/community.",
  contentType: 'SOCIAL_POST',
  moodTags: ['holiday', 'valentines', 'community', 'warm', 'social'],
  defaults: {
    eyebrow: 'LOVE THIS PLACE',
    headline: 'A love note to our neighborhood.',
    body: 'Twelve months a year we get to help people put down roots here. Lucky us.',
    cta: '',
  },
});

export const seasonalEaster = createStackedTemplate({
  catalogKey: 'social-seasonal-easter',
  name: 'Easter greeting',
  description: 'Soft spring/Easter greeting card.',
  contentType: 'SOCIAL_POST',
  moodTags: ['holiday', 'easter', 'spring', 'warm', 'social'],
  defaults: {
    eyebrow: 'HAPPY EASTER',
    headline: 'Bright spring, fresh starts.',
    body: 'Wishing you and your family a great weekend together.',
    cta: '',
  },
});

export const newAgentSpotlight = createStackedTemplate({
  catalogKey: 'social-new-agent-spotlight',
  name: 'New agent spotlight',
  description: 'Welcome post for a new agent joining the team.',
  contentType: 'SOCIAL_POST',
  moodTags: ['team', 'spotlight', 'welcome', 'social', 'announcement'],
  defaults: {
    eyebrow: 'NEW TEAMMATE',
    headline: 'Meet the newest face on our team.',
    body: "Years of local-market chops + the kind of follow-through that makes you wish you'd called sooner.",
    cta: 'Say hello',
  },
});
