import { describe, it, expect } from 'vitest';
import { normalize, querySchema, detectConferences } from '../packages/domain';
import { parseRss } from '../packages/sources/rss';
describe('engineering discovery', () => {
  it('keeps non-AI engineering posts and distinguishes AI infrastructure', () => {
    const item = normalize({
      source: 'geeknews',
      externalId: 'k8s',
      title: 'Kubernetes SLO incident and Terraform automation',
      url: 'https://example.com/k8s',
    })!;
    expect(item.sections).toEqual(['engineering']);
    expect(item.tags).toEqual(expect.arrayContaining(['kubernetes', 'terraform', 'reliability']));
    expect(item.primaryTopic).toBe('reliability');
    const ai = normalize({
      source: 'cncf',
      externalId: 'gpu',
      title: 'AI inference on Kubernetes',
      url: 'https://example.com/ai',
    })!;
    expect(ai.sections).toEqual(['ai', 'engineering']);
    expect(ai.tags).toContain('ai-infra');
  });
  it('recognizes all seven conferences without generic Next false positives', () => {
    expect(
      detectConferences(
        'KubeCon AWS re:Invent Google Cloud Next PlatformCon SREcon26 HashiConf Identiverse',
      ),
    ).toHaveLength(7);
    expect(detectConferences('Next.js next release')).toEqual([]);
    const item = normalize({
      source: 'youtube',
      externalId: 'conf',
      title: 'SREcon: Lessons from production',
      url: 'https://youtube.com/watch?v=conf',
    })!;
    expect(item.conferences).toEqual(['srecon']);
    expect(item.sections).toContain('engineering');
  });
  it('parses RSS and Atom including CDATA and skips unsafe entries', () => {
    const rss = parseRss(
      '<rss><channel><item><guid isPermaLink="false">42</guid><title><![CDATA[Terraform & Kubernetes]]></title><link>https://example.com/post</link><description><![CDATA[<b>IaC</b>]]></description><pubDate>Sun, 11 Oct 2026 00:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>',
      'cncf',
    );
    expect(rss).toHaveLength(1);
    expect(rss[0].externalId).toBe('42');
    expect(rss[0].excerpt).toBe('IaC');
    expect(
      parseRss(
        '<feed><entry><id>id</id><title>Architecture</title><link rel="self" href="https://example.com/feed"/><link rel="alternate" href="https://example.com/post"/></entry></feed>',
        'martinfowler',
      )[0].url,
    ).toBe('https://example.com/post');
    expect(() => parseRss('<!DOCTYPE rss><rss/>', 'cncf')).toThrow();
    expect(parseRss('<rss><channel/></rss>', 'cncf')).toEqual([]);
  });
  it('validates source, section, conference and tags', () => {
    expect(
      querySchema.safeParse({ source: 'cncf', section: 'engineering', tag: 'terraform' }).success,
    ).toBe(true);
    expect(querySchema.safeParse({ conference: 'unknown' }).success).toBe(false);
  });
});
