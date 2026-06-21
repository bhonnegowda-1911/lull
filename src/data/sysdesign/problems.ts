// System-design problem library. Each problem is DATA. The `hints` are the hybrid grading
// reference: a few high-signal pointers per stage that the interviewer/grader LLM reasons
// from — the analog of the behavioral prompts' tip/trap/avoid. They are deliberately short:
// enough to anchor grading for THIS problem, not a full answer key.

export interface ProblemHints {
  functionalReqs: string[]
  nonFunctionalReqs: string[]
  coreEntities: string[]
  api: string[]
  deepDives: string[]
  traps: string[]
}

export interface Problem {
  id: string
  title: string
  difficulty: string
  statement: string
  hints: ProblemHints
}

export const PROBLEMS: Problem[] = [
  {
    id: 'url-shortener',
    title: 'Design a URL shortener',
    difficulty: 'Warm-up',
    statement:
      'Design a URL shortening service like Bitly. Users submit a long URL and get back a short link; visiting the short link redirects to the original URL.',
    hints: {
      functionalReqs: [
        'Create a short URL from a long URL',
        'Redirect a short URL to the original',
        'Optional: custom aliases and link expiration',
      ],
      nonFunctionalReqs: [
        'Read-heavy: redirects vastly outnumber creates (plan the read path)',
        'Low-latency redirects (< ~100ms)',
        'High availability for redirects; short codes must be unique',
      ],
      coreEntities: ['User', 'Link (shortCode → longUrl)'],
      api: ['POST /urls (create)', 'GET /{shortCode} (redirect, 302)'],
      deepDives: [
        'Short-code generation: counter+base62 vs hashing vs key-generation service (collisions)',
        'Scaling reads: caching hot links, read replicas',
        'Analytics on clicks without slowing redirects',
      ],
      traps: [
        'Over-engineering generation before nailing the redirect read path',
        'Ignoring collision handling on custom aliases',
      ],
    },
  },
  {
    id: 'rate-limiter',
    title: 'Design a rate limiter',
    difficulty: 'Warm-up',
    statement:
      'Design a rate limiter that caps how many requests a client (by user or IP) can make in a time window, used as a shared service across many API servers.',
    hints: {
      functionalReqs: [
        'Allow or reject a request based on a per-client limit',
        'Configurable limits (e.g. 100 req/min) per client or per route',
        'Return remaining quota / retry-after to the caller',
      ],
      nonFunctionalReqs: [
        'Very low latency in the request path (the limiter is on every call)',
        'Distributed: many app servers must share one view of the count',
        'Fail-open vs fail-closed under limiter outage is a deliberate choice',
      ],
      coreEntities: ['Client (user/IP/key)', 'Rule (limit + window)', 'Counter'],
      api: ['allow(clientId, route) -> { allowed, remaining, retryAfter }'],
      deepDives: [
        'Algorithms: fixed window vs sliding window log vs sliding window counter vs token/leaky bucket',
        'Where to store counters: centralized Redis vs local memory + sync (accuracy vs latency)',
        'Atomicity of read-modify-write under concurrency (Lua scripts / INCR with TTL)',
      ],
      traps: [
        'Fixed-window counters allowing 2x burst at window boundaries',
        'Race conditions when many servers increment the same counter non-atomically',
      ],
    },
  },
  {
    id: 'twitter-feed',
    title: 'Design a Twitter / X feed',
    difficulty: 'Core',
    statement:
      'Design the core of Twitter: users can post tweets, follow others, and load a home timeline of recent tweets from people they follow.',
    hints: {
      functionalReqs: [
        'Post a tweet',
        'Follow / unfollow a user',
        'Load a home timeline of followees’ recent tweets',
      ],
      nonFunctionalReqs: [
        'Scale to >100M DAU; read-heavy timeline loads',
        'Low-latency feed reads (< ~500ms)',
        'Availability over strong consistency (eventually-consistent timelines are fine)',
      ],
      coreEntities: ['User', 'Tweet', 'Follow (graph edge)'],
      api: [
        'POST /tweets',
        'POST /follows / DELETE /follows',
        'GET /feed?cursor=… (paginated)',
      ],
      deepDives: [
        'Fanout-on-write vs fanout-on-read; the celebrity / hot-user problem',
        'Timeline caching (per-user precomputed feeds in Redis)',
        'Sharding tweets and the social graph; pagination with cursors',
      ],
      traps: [
        'Jumping to fanout before stating the read/write asymmetry',
        'Not handling celebrities (millions of followers) under fanout-on-write',
      ],
    },
  },
  {
    id: 'chat-app',
    title: 'Design a chat application',
    difficulty: 'Core',
    statement:
      'Design a messaging app like WhatsApp/Messenger: users send 1:1 and group messages in real time, with delivery and read receipts and offline delivery.',
    hints: {
      functionalReqs: [
        'Send/receive 1:1 and group messages in real time',
        'Delivery + read receipts and online/last-seen presence',
        'Deliver messages queued while a recipient was offline',
      ],
      nonFunctionalReqs: [
        'Low end-to-end latency; persistent connections at scale',
        'Per-conversation message ordering and no message loss',
        'High availability; horizontal scale of connection servers',
      ],
      coreEntities: ['User', 'Conversation', 'Message', 'Membership/Receipt'],
      api: [
        'WebSocket: send(convId, body), onMessage, typing/presence events',
        'GET /conversations/{id}/messages?cursor=… (history)',
      ],
      deepDives: [
        'Connection layer: WebSocket gateways + a registry of which server holds each user',
        'Routing a message to an offline user (per-user inbox / push notification)',
        'Ordering and dedup (client-generated message IDs, monotonic seq per conversation)',
        'Group fanout and storage (message per conversation vs per recipient)',
      ],
      traps: [
        'Assuming sender and recipient are connected to the same server',
        'No ordering/dedup strategy, so retries reorder or duplicate messages',
      ],
    },
  },
  {
    id: 'typeahead',
    title: 'Design search autocomplete (typeahead)',
    difficulty: 'Core',
    statement:
      'Design the autocomplete that suggests top completions as a user types into a search box, ranked by popularity and updated as trends change.',
    hints: {
      functionalReqs: [
        'Return the top-k completions for a given prefix',
        'Rank suggestions by popularity / frequency',
        'Reflect newly trending queries over time',
      ],
      nonFunctionalReqs: [
        'Extremely low latency (suggestions on every keystroke)',
        'Read-heavy; suggestion freshness can lag (minutes/hours) — eventual is fine',
        'Scale to a very large query vocabulary',
      ],
      coreEntities: ['Query/Term', 'Prefix', 'Frequency count'],
      api: ['GET /suggest?prefix=…&k=10'],
      deepDives: [
        'Prefix structure: trie with top-k precomputed per node vs prefix-keyed cache',
        'Building/refreshing the trie offline from query logs (batch/streaming aggregation)',
        'Serving: heavy caching/CDN of hot prefixes; sharding the trie by prefix',
        'Ranking signals and how trending queries get promoted',
      ],
      traps: [
        'Computing top-k by scanning matches at request time instead of precomputing per node',
        'Treating the index as real-time writable rather than periodically rebuilt',
      ],
    },
  },
  {
    id: 'notification-system',
    title: 'Design a notification system',
    difficulty: 'Core',
    statement:
      'Design a service that sends notifications to users across channels (push, SMS, email) from many upstream producers, reliably and at scale.',
    hints: {
      functionalReqs: [
        'Accept notification requests from many services',
        'Deliver across channels: mobile push, SMS, email',
        'Respect user preferences / opt-outs and de-dupe',
      ],
      nonFunctionalReqs: [
        'High throughput, bursty load; decouple producers from delivery',
        'At-least-once delivery with retries; avoid spamming on retry',
        'Per-provider failures isolated; observability on delivery status',
      ],
      coreEntities: ['Notification', 'User + preferences', 'Channel', 'Template'],
      api: ['POST /notifications (type, userId, payload)', 'preference + template management'],
      deepDives: [
        'Queue-based pipeline: ingest → fan to per-channel workers → 3rd-party providers',
        'Retries, dead-letter queues, and idempotency keys to avoid duplicates',
        'Rate limiting / throttling per provider and per user',
        'Preference checks, quiet hours, and delivery-status tracking',
      ],
      traps: [
        'Synchronous calls to providers in the request path (no queue/decoupling)',
        'Retries without idempotency, so users get duplicate notifications',
      ],
    },
  },
  {
    id: 'web-crawler',
    title: 'Design a web crawler',
    difficulty: 'Core',
    statement:
      'Design a web crawler that fetches billions of pages for a search index: discover URLs, download pages, extract links, and avoid re-crawling needlessly.',
    hints: {
      functionalReqs: [
        'Fetch a page and extract its links to discover new URLs',
        'Crawl at scale while respecting robots.txt and politeness',
        'Re-crawl pages periodically to stay fresh; avoid duplicates',
      ],
      nonFunctionalReqs: [
        'Massive scale and throughput; mostly I/O-bound',
        'Politeness: bounded request rate per host',
        'Robust to traps, huge pages, and slow/malicious servers',
      ],
      coreEntities: ['URL/Frontier entry', 'Page/Document', 'Host'],
      api: ['internal: enqueue(url), fetch(url), extractLinks(doc)'],
      deepDives: [
        'URL frontier: prioritization + per-host politeness queues',
        'Dedup: seen-URL set (bloom filter) and content dedup (hashing)',
        'Distributed workers, DNS caching, and handling crawl traps/loops',
        'Storage of raw pages and scheduling re-crawl by freshness',
      ],
      traps: [
        'No politeness controls — hammering a single host',
        'No URL/content dedup, so the frontier explodes on infinite/duplicate pages',
      ],
    },
  },
  {
    id: 'ride-sharing',
    title: 'Design a ride-sharing service',
    difficulty: 'Hard',
    statement:
      'Design the core of Uber/Lyft: riders request a ride from A to B, the system matches them to a nearby available driver, and both track the trip in real time.',
    hints: {
      functionalReqs: [
        'Rider requests a ride (pickup + destination)',
        'Match rider to a nearby available driver',
        'Real-time location tracking during the trip',
      ],
      nonFunctionalReqs: [
        'Low-latency matching; high write volume of driver location pings',
        'High availability; consistency on a ride’s assigned driver (no double-booking)',
        'Geo-scaled: traffic is regional and bursty',
      ],
      coreEntities: ['Rider', 'Driver', 'Ride/Trip', 'Location'],
      api: [
        'POST /rides (request)',
        'POST /drivers/{id}/location (ping)',
        'GET /rides/{id} (status + live location)',
      ],
      deepDives: [
        'Geospatial indexing for nearby drivers (geohash / quadtree / S2)',
        'High-throughput ingestion of location pings (write path, queues)',
        'Matching + locking a driver to avoid double assignment (consistency)',
        'Real-time updates to clients (websockets / push)',
      ],
      traps: [
        'Treating location pings as normal low-volume writes',
        'No mechanism to prevent assigning one driver to two riders',
      ],
    },
  },
  {
    id: 'key-value-store',
    title: 'Design a distributed key-value store',
    difficulty: 'Hard',
    statement:
      'Design a distributed key-value store like DynamoDB/Cassandra: get/put by key, scaling horizontally across many nodes with replication and fault tolerance.',
    hints: {
      functionalReqs: [
        'get(key) and put(key, value)',
        'Scale storage and throughput by adding nodes',
        'Survive node failures without data loss',
      ],
      nonFunctionalReqs: [
        'Horizontal scalability and high availability',
        'Tunable consistency (the CAP/PACELC tradeoff is the heart of the problem)',
        'Low-latency reads/writes; no single point of failure',
      ],
      coreEntities: ['Key', 'Value', 'Node/Partition', 'Replica'],
      api: ['get(key)', 'put(key, value)', 'optional: delete(key)'],
      deepDives: [
        'Partitioning: consistent hashing with virtual nodes for even, elastic distribution',
        'Replication factor N and quorum reads/writes (R + W > N for strong-ish reads)',
        'Conflict resolution: vector clocks / last-write-wins; read repair, hinted handoff',
        'Membership and failure detection (gossip)',
      ],
      traps: [
        'Hashing keys to fixed node count (re-hashes everything when a node is added)',
        'Hand-waving consistency instead of stating the R/W/N quorum tradeoff',
      ],
    },
  },
  {
    id: 'ticket-booking',
    title: 'Design a ticket booking system',
    difficulty: 'Hard',
    statement:
      'Design a system like Ticketmaster/movie seat booking: users browse events and reserve specific seats, with no seat ever sold to two people.',
    hints: {
      functionalReqs: [
        'Browse events and view available seats',
        'Hold seats during checkout, then confirm on payment',
        'Release holds that expire without payment',
      ],
      nonFunctionalReqs: [
        'Strong consistency on inventory — no double-booking, ever',
        'Handle huge read + write spikes (popular on-sale moments)',
        'Reads (browsing) can be cached; the reserve path must be correct',
      ],
      coreEntities: ['Event', 'Seat/Inventory', 'Reservation/Hold', 'Booking'],
      api: [
        'GET /events/{id}/seats',
        'POST /holds (seatIds) — temporary',
        'POST /bookings (confirm + pay)',
      ],
      deepDives: [
        'Preventing double-booking: row locking / SELECT FOR UPDATE vs status + conditional update',
        'Seat holds with TTL/expiry and how expiry frees inventory',
        'Handling thundering-herd on a hot event (queue/virtual waiting room)',
        'Payment integration and idempotent confirmation',
      ],
      traps: [
        'Read-then-write without locking/atomic compare-and-set, allowing two confirmations',
        'No expiry on holds, so abandoned carts lock seats forever',
      ],
    },
  },
  {
    id: 'payment-system',
    title: 'Design a payment system / digital wallet',
    difficulty: 'Hard',
    statement:
      'Design a payment/wallet system that moves money between accounts and to external processors, where correctness — no lost or double-charged money — is paramount.',
    hints: {
      functionalReqs: [
        'Charge a user and credit a merchant / transfer between wallets',
        'Track balances and a full transaction history (ledger)',
        'Integrate with external payment processors',
      ],
      nonFunctionalReqs: [
        'Correctness above all: exactly-once effect, no double charges, auditable',
        'Strong consistency on balances; durability of every transaction',
        'Reconciliation with external systems',
      ],
      coreEntities: ['Account/Wallet', 'Transaction', 'Ledger entry', 'PaymentIntent'],
      api: ['POST /payments (idempotencyKey, amount, …)', 'GET /transactions'],
      deepDives: [
        'Idempotency keys so client/network retries never double-charge',
        'Double-entry ledger as the source of truth (debits = credits)',
        'Exactly-once with at-least-once infra: dedup + idempotent processing',
        'Async processor calls, the SAGA/state machine for a payment, reconciliation jobs',
      ],
      traps: [
        'Mutating a balance directly instead of an append-only ledger',
        'No idempotency, so a retried request charges the user twice',
      ],
    },
  },
  {
    id: 'video-streaming',
    title: 'Design a video streaming service',
    difficulty: 'Hard',
    statement:
      'Design a video platform like YouTube/Netflix: creators upload videos that are processed for many devices, and viewers stream them smoothly worldwide.',
    hints: {
      functionalReqs: [
        'Upload a video and process it for playback',
        'Stream/watch videos at adaptive quality',
        'Metadata, search/browse, and view counts',
      ],
      nonFunctionalReqs: [
        'Very high read bandwidth; global low-latency playback',
        'Storage of huge media volume; durability',
        'Smooth playback across devices and variable networks',
      ],
      coreEntities: ['Video', 'Encoding/Rendition', 'User', 'Metadata'],
      api: [
        'POST /videos (upload, chunked)',
        'GET /videos/{id} (manifest + metadata)',
        'streaming via CDN URLs',
      ],
      deepDives: [
        'Upload + transcoding pipeline: chunk, fan-out encode to multiple bitrates/codecs',
        'Adaptive bitrate streaming (HLS/DASH) with segment manifests',
        'CDN + edge caching as the core of the read path; origin offload',
        'Separating the metadata/control plane from the media data plane',
      ],
      traps: [
        'Serving video bytes from app servers/DB instead of object storage + CDN',
        'Single-resolution encode with no adaptive bitrate for varying networks',
      ],
    },
  },
]

export const DEFAULT_PROBLEM = PROBLEMS[0]

export function getProblem(id: string): Problem {
  return PROBLEMS.find((p) => p.id === id) || DEFAULT_PROBLEM
}
