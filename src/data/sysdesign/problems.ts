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
  {
    id: 'gpu-workflow-cloud',
    title: 'Design a cloud service to run GPU workflows (Comfy Cloud)',
    difficulty: 'Hard',
    statement:
      'Design a service that runs user-submitted generative-AI workflows on the cloud (like Comfy Cloud / ComfyUI): a user submits a workflow graph (JSON) plus inputs, it runs on a GPU for up to ~60 minutes, streams progress, and returns outputs (images/video). Users pay only for active GPU time. Workflows can include arbitrary user-supplied (custom-node) code.',
    hints: {
      functionalReqs: [
        'Submit a workflow (graph JSON + input assets) and run it on a GPU',
        'Track execution status and stream live progress; retrieve outputs when done',
        'Async, long-running jobs (up to ~60 min); per-tier concurrency (1 active job free, parallel on higher tiers)',
      ],
      nonFunctionalReqs: [
        'GPU is the scarce, EXPENSIVE resource — cost-efficiency is the primary constraint',
        'Jobs are long-running and bursty; accurate metering of active GPU-seconds for billing',
        'Untrusted code: custom nodes run arbitrary Python → isolation and multi-tenant blast-radius control',
        'Realtime progress at low latency; durable outputs; availability of the submit/track API',
      ],
      coreEntities: ['User/Tenant', 'Workflow (graph JSON)', 'Job/Run', 'Asset (input/output)', 'GPU Worker', 'UsageEvent'],
      api: [
        'POST /jobs (workflow + input refs, idempotency key) → 202 + jobId',
        'GET /jobs/{id} (status); WebSocket/SSE for live progress; webhook on completion',
        'Presigned URLs for input upload and output download (don’t stream GB through the API)',
        'API-key auth, per-tenant rate limits / quotas, pagination',
      ],
      deepDives: [
        'GPU fleet economics: autoscaling + scale-to-zero, warm pools, bin-packing; the cold-start / model-loading problem (tens of GB of weights) and routing jobs to workers that already have the model resident (affinity / local-NVMe cache)',
        'Untrusted-code isolation: sandbox custom nodes (containers/gVisor, no network, ephemeral FS), resource limits, multi-tenant isolation on shared GPUs',
        'Long async jobs: durable queue, at-least-once + idempotency (runs are expensive/side-effecting — careful retries), worker crash mid-job, the 60-min timeout',
        'Metering & billing: capture active GPU-seconds, emit usage events, handle partial/crashed runs, enforce quotas; priority queues per tier with fairness (no tenant starvation)',
        'Realtime progress fan-out: worker → pub/sub → gateway → client WebSocket (worker isn’t directly connected to the client)',
        'Output storage + CDN with presigned URLs and retention',
      ],
      traps: [
        'Treating runs as short synchronous requests instead of durable async jobs',
        'Ignoring that custom nodes are arbitrary code — no isolation story for untrusted execution',
        'Hand-waving GPU cold starts / model loading, which dominate cost and latency',
        'Naive auto-retry of a failed job, double-charging or double-running an expensive run (no idempotency)',
      ],
    },
  },
  {
    id: 'code-execution',
    title: 'Design an online code-execution service (LeetCode-style judge)',
    difficulty: 'Hard',
    statement:
      'Design a service that runs untrusted, user-submitted code against test cases (like LeetCode or a coding-interview judge): accept code + language, compile/run it in isolation with CPU, memory and wall-clock limits and no network, return pass/fail plus output/diagnostics, at multi-tenant scale.',
    hints: {
      functionalReqs: [
        'Submit code (language + source + problem/test-case ref) → get a verdict (accepted / wrong answer / TLE / MLE / runtime error / compile error)',
        'Run against many hidden test cases; report per-case result, runtime, and memory',
        'Support multiple languages; surface compiler/stderr output to the user',
      ],
      nonFunctionalReqs: [
        'ISOLATION is the whole problem — untrusted code must not escape the sandbox or reach the network/other tenants',
        'Hard resource limits per run: CPU time, wall-clock (timeout), memory, processes/threads, output size',
        'Multi-tenant fairness: one user (or a fork bomb) cannot starve others; bound concurrency',
        'Low queueing latency under bursty load (contests); deterministic, reproducible runs',
      ],
      coreEntities: ['User/Submission', 'Problem + TestCases', 'Language/Runtime image', 'Execution Job', 'Worker/Sandbox', 'Verdict/Result'],
      api: [
        'POST /submissions (language, source, problemId, idempotency key) → 202 + submissionId',
        'GET /submissions/{id} → status + per-test verdicts; SSE/WebSocket for live progress',
        'Internal: dispatch job → sandboxed worker; results written back to the submission',
      ],
      deepDives: [
        'Sandboxing: container vs microVM (gVisor / Firecracker / nsjail), seccomp/cgroups, read-only ephemeral FS, drop network, non-root, kill on limit breach',
        'Worker pool + queue: warm pools per language to hide cold start, autoscale on queue depth, bound per-tenant concurrency for fairness',
        'Resource enforcement: cgroups for CPU/mem, a hard wall-clock timeout (TLE), output truncation; reproducible time/memory measurement',
        'Contest spikes: backpressure, priority/fair queues, graceful 429s; idempotent submission so a retry doesn’t double-run',
        'Result correctness: hidden test cases storage, exact/float/whitespace comparison, special judges/checkers',
      ],
      traps: [
        'Hand-waving isolation ("just run it in Docker") — no story for sandbox escape, syscalls, or the network',
        'Ignoring the noisy-neighbor / fork-bomb / infinite-loop (TLE) and memory-exhaustion (MLE) vectors',
        'Treating it as a synchronous request instead of a durable, bounded async job',
        'No cold-start story for per-language runtimes under contest load',
      ],
    },
  },
  {
    id: 'webhook-delivery',
    title: 'Design a reliable webhook delivery system',
    difficulty: 'Core',
    statement:
      'Design a system that delivers event notifications (webhooks) to thousands of customer-registered HTTP endpoints. Endpoints are often flaky or slow; delivery must be reliable, retried with backoff, ordered where required, and observable — without one bad consumer degrading everyone else.',
    hints: {
      functionalReqs: [
        'Register/manage endpoints (URL, secret, subscribed event types)',
        'Deliver each event via HTTP POST; retry failures with backoff until success or exhaustion',
        'Let customers inspect delivery attempts/status and replay failed deliveries',
      ],
      nonFunctionalReqs: [
        'At-least-once delivery with retries; consumers must dedupe (send a stable event id + signature)',
        'Isolation: a slow/failing endpoint must not block delivery to others (per-destination concurrency/queues)',
        'Durability: never lose an accepted event; bounded, observable delivery latency',
      ],
      coreEntities: ['Event', 'Subscription/Endpoint', 'DeliveryAttempt', 'DeadLetter'],
      api: [
        'Internal: publish(event) → durable queue',
        'POST to customer URL with HMAC signature + event id; expect 2xx',
        'GET /deliveries (status, attempts); POST /deliveries/{id}/replay',
      ],
      deepDives: [
        'Retry policy: exponential backoff + jitter, max attempts, then dead-letter; circuit-break a consistently failing endpoint',
        'Durable queue + workers; per-destination partitioning/concurrency caps so one tenant can’t hog workers (head-of-line isolation)',
        'Ordering: per-key FIFO when required vs. parallel for throughput; the tradeoff',
        'Idempotency & security: stable event id for consumer dedupe, HMAC signing + timestamp to prevent replay/spoofing',
        'Observability: attempt logs, metrics, manual + bulk replay from the dead-letter queue',
      ],
      traps: [
        'Synchronous fire-and-forget with no durable queue — events lost when a consumer is down',
        'A global worker pool where one slow endpoint starves delivery to everyone (no isolation)',
        'Retries without idempotency/signing — duplicates and spoofable payloads',
        'Infinite retries with no backoff or dead-letter',
      ],
    },
  },
  {
    id: 'job-scheduler',
    title: 'Design a distributed job scheduler',
    difficulty: 'Core',
    statement:
      'Design a system that runs jobs at a specified time or on a recurring schedule (cron-like), plus one-off delayed tasks, across a fleet of workers. Jobs must fire close to on-time, run exactly the intended number of times despite worker failures, and scale to millions of scheduled jobs.',
    hints: {
      functionalReqs: [
        'Schedule a job: run-at (one-off/delayed) or recurring (cron expression)',
        'Execute jobs on workers; track status; retry failures',
        'Cancel/pause/update a schedule; view run history',
      ],
      nonFunctionalReqs: [
        'Timeliness: jobs fire close to their due time even at high volume',
        'Exactly-the-intended-runs: a due job runs once, not zero (missed) or many (duplicate) when workers crash',
        'Durability + horizontal scale to millions of scheduled jobs; no single point of failure',
      ],
      coreEntities: ['Job/Schedule definition', 'Trigger/Run instance', 'Worker', 'Lease/Lock'],
      api: [
        'POST /jobs (payload, run_at | cron, idempotency key)',
        'Internal: poll/claim due jobs; report completion; compute next run for recurring',
        'DELETE/PATCH /jobs/{id}; GET /jobs/{id}/runs',
      ],
      deepDives: [
        'Finding due jobs at scale: time-bucketed/sharded index or a delay queue, not a full-table scan each tick',
        'Exactly-once-ish dispatch: lease/visibility-timeout or row lock so two schedulers don’t double-fire; idempotency keys on the run',
        'Failure handling: worker dies mid-run → lease expires → re-dispatch; at-least-once + idempotent jobs; retry/backoff and dead-letter',
        'Recurring jobs: compute and persist the next fire time atomically on completion; handle missed windows / catch-up policy and DST',
        'Scaling: partition the schedule space across scheduler nodes; leader/coordination (e.g. via the DB or a coordination service)',
      ],
      traps: [
        'A single scheduler scanning the whole table every second (doesn’t scale, single point of failure)',
        'No leasing/locking → duplicate or dropped executions when a worker or scheduler fails',
        'Assuming jobs are idempotent without enforcing it (double-charge / double-send)',
        'Ignoring clock skew, missed schedules, and timezone/DST for cron',
      ],
    },
  },
  {
    id: 'dropbox',
    title: 'Design a file storage & sync service (Dropbox)',
    difficulty: 'Hard',
    statement:
      'Design a cloud file storage service like Dropbox: users upload files, access them from any device, share files/folders, and have changes sync automatically across all their devices.',
    hints: {
      functionalReqs: [
        'Upload/download files and access them from any device',
        'Automatically sync changes across a user’s devices',
        'Share files/folders with permissions; keep version history',
      ],
      nonFunctionalReqs: [
        'Durability is paramount — a stored file must never be lost',
        'Efficient sync: only changed parts should move, not whole files',
        'Consistency of file metadata across devices; high availability',
      ],
      coreEntities: ['User', 'File/Folder (metadata)', 'Block/Chunk (content)', 'FileVersion', 'Device', 'ShareACL'],
      api: [
        'Presigned upload/download URLs — don’t stream file bytes through the app server',
        'GET /changes?cursor → the journal of changes since a device last synced',
        'Chunked, resumable upload API (content-addressed blocks)',
      ],
      deepDives: [
        'Split metadata service from block storage; content-addressed chunks enable dedup, resumable uploads, and syncing only changed blocks',
        'Sync protocol: a per-user change journal/cursor + push notification so devices pull just the delta',
        'Conflict resolution when two devices edit offline (conflicted copy / last-writer + history)',
        'Large files: chunking, parallel + resumable upload, compression',
      ],
      traps: [
        'Streaming whole files through the app tier instead of object storage + presigned URLs',
        'Re-uploading the entire file on a small change (no delta/chunking)',
        'No story for offline concurrent edits / conflicts',
        'Treating metadata and block storage as one store',
      ],
    },
  },
  {
    id: 'local-delivery',
    title: 'Design a rapid local delivery service (Gopuff)',
    difficulty: 'Hard',
    statement:
      'Design a rapid delivery service like Gopuff: goods are stocked across 500+ micro distribution centers (DCs); a user browses items available near them, places an order, and a courier delivers it quickly. Catalog and inventory are per-DC.',
    hints: {
      functionalReqs: [
        'Show the catalog/availability for the DC(s) that serve a user’s location',
        'Place an order, reserving inventory at a DC',
        'Assign a courier and let the user track the delivery',
      ],
      nonFunctionalReqs: [
        'Per-DC inventory accuracy — never oversell a stocked item',
        'Low-latency availability lookup by location (geo)',
        'High availability of the order path; fresh courier location',
      ],
      coreEntities: ['User', 'Item', 'Inventory (per DC)', 'DistributionCenter', 'Order', 'Courier', 'Delivery'],
      api: [
        'GET /catalog?lat,lng → resolve serving DC(s) and their stock',
        'POST /orders → reserve inventory (atomic), create order',
        'Courier location stream; GET /orders/{id}/track',
      ],
      deepDives: [
        'Geo routing: map a user to nearby DC(s) with stock via a geospatial index (geohash/quadtree)',
        'Inventory reservation: atomic decrement / reservation-with-TTL to prevent oversell under concurrency',
        'Courier assignment & dispatch (matching, ETA) and real-time tracking fan-out',
        'Demand spikes and DC capacity limits',
      ],
      traps: [
        'A single global inventory that ignores which DC actually has the item',
        'Overselling under concurrent orders (no atomic reservation)',
        'Scanning all DCs for the nearest instead of a geo index',
        'Underestimating courier-location update volume',
      ],
    },
  },
  {
    id: 'proximity-search',
    title: 'Design a proximity search / reviews service (Yelp)',
    difficulty: 'Core',
    statement:
      'Design a service like Yelp: users search for local businesses by location and category/filters, view business details, and read and write reviews with star ratings.',
    hints: {
      functionalReqs: [
        'Search businesses within a radius by location + category/filters',
        'View a business’s details and aggregate rating',
        'Write and read reviews/ratings',
      ],
      nonFunctionalReqs: [
        'Low-latency geo search; read-heavy workload',
        'Eventual consistency of rating aggregates is fine',
        'Availability of search over strict freshness',
      ],
      coreEntities: ['Business', 'Review', 'RatingAggregate', 'User', 'GeoIndex'],
      api: [
        'GET /search?lat,lng,radius,category,filters',
        'GET /business/{id}; POST /businesses/{id}/reviews',
      ],
      deepDives: [
        'Geospatial indexing (geohash / quadtree / S2) for radius + filter queries',
        'Maintain the average rating asynchronously instead of recomputing per read',
        'Search ranking: distance + rating + relevance; cache hot queries',
        'Review spam/fraud prevention',
      ],
      traps: [
        'Full table scan + distance compute per query (no geo index)',
        'Recomputing average rating on every read',
        'Ignoring the read/write split between search and reviews',
        'No anti-spam/dedup on reviews',
      ],
    },
  },
  {
    id: 'matching-app',
    title: 'Design a dating / matching app (Tinder)',
    difficulty: 'Core',
    statement:
      'Design a dating app like Tinder: users see a stack of nearby candidate profiles filtered by their preferences, swipe right (like) or left (pass), and when two users like each other it becomes a match and they can chat.',
    hints: {
      functionalReqs: [
        'Serve a stack of nearby candidate profiles (location + filters)',
        'Record swipes (like/pass); never repeat a seen profile',
        'Detect a mutual like → create a match; enable chat after matching',
      ],
      nonFunctionalReqs: [
        'Low-latency recommendation feed',
        'Swipes are extremely write-heavy — must scale',
        'Consistent, exactly-once match creation',
      ],
      coreEntities: ['Profile', 'Swipe (decision)', 'Match', 'RecommendationStack', 'GeoIndex'],
      api: [
        'GET /recommendations → next batch of candidates',
        'POST /swipes (targetId, like)',
        'GET /matches',
      ],
      deepDives: [
        'Geospatial + filter candidate generation (geohash/quadtree, precomputed pools)',
        'Swipe storage at billions scale: shard by swiper, write-optimized',
        'Mutual-match detection: on a like, check the reverse swipe and create the match idempotently',
        'Dedup already-seen profiles; relevance/ranking signal',
      ],
      traps: [
        'Scanning all users per request instead of a geo-bounded pool',
        'Race/duplicate match when both users swipe at the same time',
        'Showing already-seen profiles again',
        'A swipe store that can’t scale to the write volume',
      ],
    },
  },
  {
    id: 'live-comments',
    title: 'Design live comments on a video stream (Facebook Live)',
    difficulty: 'Core',
    statement:
      'Design Facebook Live Comments: viewers post comments on a live video and everyone watching sees a continuous stream of new comments in near-real-time. Viewers can also load earlier comments.',
    hints: {
      functionalReqs: [
        'Post a comment on a live video',
        'Viewers receive new comments in near-real-time',
        'Load recent/historical comments (pagination)',
      ],
      nonFunctionalReqs: [
        'Near-real-time fan-out to many concurrent viewers',
        'Massive read fan-out — one video, potentially millions of viewers',
        'Eventual ordering; availability over strict consistency',
      ],
      coreEntities: ['LiveVideo', 'Comment', 'Viewer/Connection', 'Channel/Topic'],
      api: [
        'WebSocket/SSE subscribe to videoId',
        'POST /comments',
        'GET /comments?videoId&before=cursor (history)',
      ],
      deepDives: [
        'Real-time delivery: writer → pub/sub → connection gateways → viewer WebSockets (writer isn’t connected to viewers)',
        'Scaling connections horizontally (connection servers, sticky sessions)',
        'Viral videos: fan-out amplification → sample/throttle which comments are displayed',
        'Durable write path + history store; backpressure',
      ],
      traps: [
        'Polling instead of push',
        'Broadcasting every comment to every viewer on a viral stream (no sampling)',
        'A single connection server that can’t scale connections',
        'Keeping comments only in memory (no history/durability)',
      ],
    },
  },
  {
    id: 'top-k',
    title: 'Design a Top-K service (YouTube top videos)',
    difficulty: 'Hard',
    statement:
      'Design a system that returns the top-K items by count over a time window — e.g. the most-viewed YouTube videos in the last hour/day/all-time — given a very high volume of view events.',
    hints: {
      functionalReqs: [
        'Ingest a high-volume stream of view events',
        'Serve top-K items for a time window (1h / 1d / all-time)',
        'Support multiple concurrent windows',
      ],
      nonFunctionalReqs: [
        'Very high write volume; approximate results are acceptable for speed/space',
        'Low-latency top-K reads',
        'Handle hot keys / skew',
      ],
      coreEntities: ['ViewEvent', 'Counter', 'Top-K sketch/heap', 'TimeWindow'],
      api: ['Stream ingest of events', 'GET /top-k?window=1h&k=100'],
      deepDives: [
        'Streaming heavy-hitters: count-min sketch + heap for space-efficient approximate counts',
        'Exact vs approximate tradeoff; when each is acceptable',
        'Windowing: time buckets / sliding windows and merging them',
        'Two-stage (lambda): fast approximate online + batch-exact offline; partition by item to spread hot keys',
      ],
      traps: [
        'A single global sorted set updated on every event (hot-key bottleneck)',
        'Exact counting at massive scale when approximate suffices',
        'Recomputing top-K from raw events on each query',
        'Ignoring window semantics (sliding vs tumbling)',
      ],
    },
  },
  {
    id: 'ad-click-aggregator',
    title: 'Design an ad click aggregator',
    difficulty: 'Hard',
    statement:
      'Design a system that ingests ad-click events and aggregates them by ad/campaign over time windows, so advertisers can see near-real-time metrics (clicks per minute/hour) and optimize campaigns.',
    hints: {
      functionalReqs: [
        'Ingest click events at high volume',
        'Aggregate by ad/campaign over time windows',
        'Query metrics (clicks per minute/hour); near-real-time dashboards',
      ],
      nonFunctionalReqs: [
        'Very high write throughput; low-latency aggregate queries',
        'Exactly-once / no double-count — clicks bill advertisers',
        'Fault tolerance; no data loss',
      ],
      coreEntities: ['ClickEvent', 'Aggregate (ad × window)', 'Campaign'],
      api: ['POST /click (or tracking pixel)', 'GET /metrics?adId&window'],
      deepDives: [
        'Pipeline: durable log (Kafka) → stream processor → OLAP/time-series store',
        'Windowed aggregation with watermarks for late/out-of-order events',
        'Exactly-once: event id + idempotent writes so retries don’t double-count (it’s money)',
        'Hot partitions for popular ads; real-time approximate + batch-exact reconciliation; click-fraud filtering',
      ],
      traps: [
        'Writing each click to a DB and aggregating on read (won’t scale)',
        'Double-counting on retries (no idempotency)',
        'Ignoring late/out-of-order events',
        'A single aggregation key hot-spotting',
      ],
    },
  },
  {
    id: 'news-aggregator',
    title: 'Design a news aggregator (Google News)',
    difficulty: 'Core',
    statement:
      'Design a news aggregator like Google News: ingest articles from thousands of publishers, group articles covering the same story, rank them, and serve users a fresh, scrollable feed by topic/region.',
    hints: {
      functionalReqs: [
        'Ingest articles from many publishers (feeds/crawl)',
        'Dedupe and cluster articles about the same story',
        'Rank/personalize and serve a scrollable feed by topic/region',
      ],
      nonFunctionalReqs: [
        'Freshness within minutes; scale of sources',
        'Read-heavy feed; relevance/ranking quality',
        'Availability',
      ],
      coreEntities: ['Publisher/Source', 'Article', 'StoryCluster', 'Topic', 'UserFeed'],
      api: ['Internal ingest pipeline', 'GET /feed?topic,region,cursor'],
      deepDives: [
        'Near-real-time ingestion (RSS/crawl) and normalization',
        'Same-story clustering: near-duplicate detection (shingling/embeddings)',
        'Ranking: freshness + source authority + personalization',
        'Feed serving: precompute vs on-the-fly + caching; shard by topic/region',
      ],
      traps: [
        'Showing many duplicates of one story (no clustering)',
        'Stale feed from batch-only ingestion',
        'Ranking purely by recency',
        'Recomputing the whole feed per request',
      ],
    },
  },
  {
    id: 'activity-tracking',
    title: 'Design a fitness activity tracker (Strava)',
    difficulty: 'Core',
    statement:
      'Design a fitness tracking app like Strava: users record activities (GPS tracks + metrics), view stats and maps, share to a followers’ feed, and compete on segment leaderboards.',
    hints: {
      functionalReqs: [
        'Record and upload an activity (GPS track + metrics)',
        'View activity stats/maps; followers’ activity feed',
        'Segments and leaderboards',
      ],
      nonFunctionalReqs: [
        'Ingest large GPS payloads efficiently; durable activities',
        'Read-heavy feed; reasonably fresh leaderboards',
      ],
      coreEntities: ['User', 'Activity (GPS stream)', 'Segment', 'SegmentEffort', 'Leaderboard', 'Feed'],
      api: ['POST /activities (upload track)', 'GET /feed', 'GET /segments/{id}/leaderboard'],
      deepDives: [
        'Store/process GPS streams (time-series, compression, map-matching)',
        'Segment matching done asynchronously after upload (spatial matching)',
        'Leaderboards: per-segment sorted sets with time windows',
        'Feed fan-out to followers (on-write vs on-read)',
      ],
      traps: [
        'Running segment matching synchronously on upload (slow)',
        'Recomputing leaderboards on read',
        'Naive feed fan-out for users with huge follower counts',
        'Storing raw GPS without compression/time-series store',
      ],
    },
  },
  {
    id: 'auction',
    title: 'Design an online auction service',
    difficulty: 'Hard',
    statement:
      'Design an online auction service: users list items with an end time, others place increasingly higher bids, watchers see the current high bid in real time, and at the end time the highest bidder wins.',
    hints: {
      functionalReqs: [
        'List an item with an end time',
        'Place a bid that must exceed the current high bid',
        'Show the current high bid in real time; close and award at end time',
      ],
      nonFunctionalReqs: [
        'Strong consistency on bids — exactly one winner, correct high bid under concurrency',
        'Real-time price updates to watchers',
        'Durability; handle bid spikes near close (sniping)',
      ],
      coreEntities: ['Auction/Item', 'Bid', 'User', 'Watcher'],
      api: ['POST /auctions/{id}/bids', 'WS subscribe to price', 'Close job at end time'],
      deepDives: [
        'Concurrency control: conditional write "bid > current_max" via atomic CAS / row lock / per-auction serialization',
        'Real-time fan-out of the new high bid (pub/sub)',
        'Auction close via scheduler/delay queue with exactly-once close; anti-sniping extension',
        'Idempotent bid submission; fairness/ordering',
      ],
      traps: [
        'Read-modify-write race → lost bids or two winners',
        'Broadcasting to all watchers without scalable pub/sub',
        'Relying on the client clock for closing',
        'No idempotency on bids (duplicates)',
      ],
    },
  },
  {
    id: 'price-tracker',
    title: 'Design a price tracker (CamelCamelCamel)',
    difficulty: 'Core',
    statement:
      'Design a price tracking service like CamelCamelCamel: it monitors product prices over time, shows price history, and alerts users when a price drops below a threshold they set. A popular browser extension also displays price history on the product page.',
    hints: {
      functionalReqs: [
        'Track product prices over time and show history',
        'Let users set price-drop thresholds/alerts',
        'Notify when a price drops below the threshold',
      ],
      nonFunctionalReqs: [
        'Scale to many products with periodic checks; timely alerts',
        'Efficient time-series storage of history',
        'Don’t hammer/abuse the price source',
      ],
      coreEntities: ['Product', 'PricePoint (time-series)', 'Watch/Alert (user threshold)', 'Notification'],
      api: ['POST /watches (productId, threshold)', 'GET /products/{id}/history', 'Ingest price updates'],
      deepDives: [
        'Price ingestion at scale: scheduled crawl/feeds, per-source rate limits, skip unchanged',
        'Time-series history with downsampling/retention',
        'Alert evaluation: on a new price, look up watches with threshold ≥ price via an index (not a scan)',
        'High-read extension path: cache price history behind a CDN',
      ],
      traps: [
        'Re-checking every product on a fixed interval regardless of change (waste)',
        'Scanning all watches per price update (no threshold index)',
        'Storing every price point forever with no downsampling',
        'Alert storms / duplicate notifications',
      ],
    },
  },
  {
    id: 'photo-sharing',
    title: 'Design a photo/video sharing feed (Instagram)',
    difficulty: 'Core',
    statement:
      'Design Instagram: users upload photos/videos, follow others, and see a home feed of posts from people they follow, with likes and comments. Handle accounts with huge follower counts.',
    hints: {
      functionalReqs: [
        'Upload photos/videos; follow/unfollow users',
        'Home feed of followed users’ posts',
        'Like and comment',
      ],
      nonFunctionalReqs: [
        'Read-heavy feed at low latency; fresh enough',
        'Efficient media storage + delivery (CDN)',
        'Handle celebrity (huge-follower) accounts',
      ],
      coreEntities: ['User', 'Post (media)', 'Follow (graph)', 'Feed', 'Like/Comment'],
      api: ['Presigned media upload', 'GET /feed?cursor', 'POST /posts; follow/unfollow'],
      deepDives: [
        'Media pipeline: upload → transcode/resize variants → object store + CDN',
        'Feed generation: fan-out-on-write vs on-read, and a hybrid for celebrities',
        'Feed storage, pagination, and caching',
        'The hot-account / write-amplification problem',
      ],
      traps: [
        'Serving media through app servers instead of a CDN',
        'Pure fan-out-on-write for a celebrity (write amplification)',
        'Recomputing the feed each request without caching',
        'No transcoding/variants for different devices',
      ],
    },
  },
  {
    id: 'stock-trading',
    title: 'Design a stock trading platform (Robinhood)',
    difficulty: 'Hard',
    statement:
      'Design a commission-free trading platform like Robinhood: stream real-time market quotes, let users place/cancel orders (market/limit) routed to market makers, and show their portfolio and order status — keeping balances and executions correct.',
    hints: {
      functionalReqs: [
        'Real-time quotes / market data',
        'Place and cancel orders (market/limit); show order status',
        'Portfolio and positions',
      ],
      nonFunctionalReqs: [
        'Low-latency quote fan-out (massive reads)',
        'Correctness of orders and balances — it’s money, no double execution',
        'Durability/audit; availability during market hours',
      ],
      coreEntities: ['Account', 'Order', 'Position/Portfolio', 'Quote/MarketData', 'Trade/Execution'],
      api: ['WS market-data stream', 'POST /orders; cancel', 'GET /portfolio; order status stream'],
      deepDives: [
        'Market-data fan-out: publishers → many clients with conflation/throttling of quote ticks',
        'Order lifecycle: submit → route to market maker → fill/partial → settle, as an idempotent state machine',
        'Balance consistency: double-entry ledger to avoid overspend / double-spend',
        'Reconciliation with external exchanges; real-time position updates',
      ],
      traps: [
        'Pushing every quote tick to every client (no conflation)',
        'Non-idempotent order submission (double orders)',
        'Eventually-consistent balances that allow overspend',
        'Treating fills as fire-and-forget (no ledger/audit)',
      ],
    },
  },
  {
    id: 'collab-editor',
    title: 'Design a collaborative document editor (Google Docs)',
    difficulty: 'Hard',
    statement:
      'Design a collaborative editor like Google Docs: multiple users edit the same rich-text document at once, see each other’s changes and cursors in real time, and the document converges to a consistent state with full history.',
    hints: {
      functionalReqs: [
        'Create/edit rich-text documents',
        'Real-time multi-user collaboration with live cursors',
        'Persistence and version history',
      ],
      nonFunctionalReqs: [
        'Low-latency convergence — all users see a consistent document',
        'Conflict-free concurrent edits',
        'Availability and durability of every edit',
      ],
      coreEntities: ['Document', 'Edit/Operation', 'Session/Collaborator', 'Version/Snapshot'],
      api: ['WS connect to docId', 'Send ops; receive ops/acks', 'Load doc + version'],
      deepDives: [
        'Concurrency model: Operational Transformation vs CRDTs — how concurrent edits converge',
        'Central server transforming/ordering ops vs peer CRDT merge',
        'Persistence: op log + periodic snapshots, replay to reconstruct',
        'Presence/cursor fan-out; offline edits & reconciliation; scaling connections per doc',
      ],
      traps: [
        'Last-write-wins or locking the doc (loses concurrent edits)',
        'No convergence strategy (OT/CRDT) for concurrent ops',
        'Storing only snapshots with no op history (can’t merge)',
        'A single server per doc with no durability',
      ],
    },
  },
  {
    id: 'metrics-monitoring',
    title: 'Design a metrics monitoring & alerting platform (Datadog)',
    difficulty: 'Hard',
    statement:
      'Design a metrics monitoring platform like Datadog/Prometheus: ingest time-series metrics (CPU, memory, latency) from many hosts/services, store them, power dashboards with aggregate queries, and fire alerts when thresholds are breached.',
    hints: {
      functionalReqs: [
        'Ingest time-series metrics from many hosts/services',
        'Store as time-series; query/aggregate for dashboards',
        'Alert when thresholds are breached',
      ],
      nonFunctionalReqs: [
        'Very high write throughput (millions of series)',
        'Efficient storage: compression, retention/downsampling',
        'Fast range/aggregation queries; reliable alerting',
      ],
      coreEntities: ['Series (name + tags)', 'DataPoint', 'Dashboard/Query', 'AlertRule'],
      api: ['Push or scrape ingest', 'GET /query?metric,tags,range,agg', 'Alert-rule CRUD'],
      deepDives: [
        'Ingestion: agent → durable buffer → TSDB; push vs pull/scrape',
        'Time-series storage: columnar, delta/Gorilla compression, retention tiers + downsampling',
        'High-cardinality tags (label explosion) and how to bound it',
        'Query via pre-aggregation/rollups; alerting engine evaluating rules on streams with flap/dedup',
      ],
      traps: [
        'A generic RDBMS for time-series (write/query won’t scale)',
        'Unbounded tag cardinality blowing up the index',
        'No downsampling/retention (storage explosion)',
        'Evaluating alerts by scanning raw data each time',
      ],
    },
  },
  {
    id: 'llm-chat',
    title: 'Design an LLM chat service (ChatGPT)',
    difficulty: 'Core',
    statement:
      'Design a conversational AI service like ChatGPT: users send natural-language prompts and get responses streamed back token-by-token from a large language model. Conversations are saved so users can resume an old chat with its context.',
    hints: {
      functionalReqs: [
        'Send a prompt; stream the model response token-by-token',
        'Persist conversations',
        'Resume an old chat with its prior context',
      ],
      nonFunctionalReqs: [
        'Low time-to-first-token and smooth streaming',
        'GPU inference is the scarce, expensive resource',
        'Conversation durability; per-user rate limits/quotas',
      ],
      coreEntities: ['User', 'Conversation', 'Message', 'InferenceJob', 'GPU Worker'],
      api: ['POST /chat (conversationId, prompt) → SSE/WebSocket token stream', 'GET /conversations/{id}'],
      deepDives: [
        'Streaming: SSE/WebSocket token streaming with backpressure and cancellation',
        'Inference serving: GPU worker pool, request batching for throughput, queueing, autoscaling scarce GPUs',
        'Context management: store history, truncate/summarize to fit the context window',
        'Rate limiting/quotas and cost control; caching (KV-cache, repeated prompts)',
      ],
      traps: [
        'Blocking request/response instead of streaming (slow, bad UX)',
        'No batching → GPU underutilization',
        'Sending unbounded history that exceeds the context window',
        'Ignoring cancellation — wasting GPU on abandoned streams',
      ],
    },
  },
]

export const DEFAULT_PROBLEM = PROBLEMS[0]

export function getProblem(id: string): Problem {
  return PROBLEMS.find((p) => p.id === id) || DEFAULT_PROBLEM
}

// Compact catalog (id + title + one-line statement) the JD→problem SELECTOR ranks over. The selector
// only ever returns ids from this list, so a recommended problem is always a real, curated library
// problem that grades on its own hand-authored hints — the LLM maps business domain → known problem,
// it never invents the problem or its answer key.
export function problemCatalog(): { id: string; title: string; statement: string }[] {
  return PROBLEMS.map((p) => ({ id: p.id, title: p.title, statement: p.statement }))
}
