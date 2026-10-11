/** Public feed registry: add sources here and in the source constraint migration. */
export const engineeringFeeds = {
  cncf: { name: 'CNCF Blog', url: 'https://www.cncf.io/feed/', topic: 'cloud-native' },
  thenewstack: { name: 'The New Stack', url: 'https://thenewstack.io/feed/', topic: 'platform' },
  infoq: { name: 'InfoQ', url: 'https://feed.infoq.com/', topic: 'architecture' },
  aws: {
    name: 'AWS What’s New',
    url: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
    topic: 'cloud',
  },
  kubernetes: {
    name: 'Kubernetes Blog',
    url: 'https://kubernetes.io/feed.xml',
    topic: 'cloud-native',
  },
  cloudflare: {
    name: 'Cloudflare Blog',
    url: 'https://blog.cloudflare.com/rss/',
    topic: 'networking',
  },
  martinfowler: {
    name: 'Martin Fowler',
    url: 'https://martinfowler.com/feed.atom',
    topic: 'architecture',
  },
  bytebytego: {
    name: 'ByteByteGo',
    url: 'https://blog.bytebytego.com/feed',
    topic: 'architecture',
  },
} as const;
export const conferences = {
  kubecon: {
    name: 'KubeCon + CloudNativeCon',
    url: 'https://www.cncf.io/events/',
    query: 'KubeCon CloudNativeCon',
    pattern: /\bkubecon\b|\bcloudnativecon\b/i,
  },
  reinvent: {
    name: 'AWS re:Invent',
    url: 'https://reinvent.awsevents.com/',
    query: 'AWS re:Invent',
    pattern: /\bre:invent\b|\baws reinvent\b/i,
  },
  next: {
    name: 'Google Cloud Next',
    url: 'https://cloud.withgoogle.com/next',
    query: 'Google Cloud Next',
    pattern: /\bgoogle cloud next\b|\bcloud next\s*['’]?\d/i,
  },
  platformcon: {
    name: 'PlatformCon',
    url: 'https://platformcon.com/',
    query: 'PlatformCon',
    pattern: /\bplatformcon\b/i,
  },
  srecon: {
    name: 'SREcon',
    url: 'https://www.usenix.org/srecon',
    query: 'SREcon',
    pattern: /\bsrecon\w*/i,
  },
  hashiconf: {
    name: 'HashiConf',
    url: 'https://www.hashicorp.com/conferences/hashiconf',
    query: 'HashiConf',
    pattern: /\bhashiconf\b/i,
  },
  identiverse: {
    name: 'Identiverse',
    url: 'https://identiverse.com/',
    query: 'Identiverse',
    pattern: /\bidentiverse\b/i,
  },
} as const;
export type Conference = keyof typeof conferences;
export function detectConferences(text: string): Conference[] {
  return (Object.keys(conferences) as Conference[]).filter((id) =>
    conferences[id].pattern.test(text),
  );
}
