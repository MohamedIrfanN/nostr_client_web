RELAYS = [
    "wss://relay.damus.io",
    "wss://relay.snort.social",
    "wss://nos.lol",
    "wss://relay.nostr.band",
    "wss://relay.mostr.pub",
    "wss://relay.nos.social",
    "wss://nostr.wine",
    "wss://relay.primal.net",
    "wss://nostr.land",
    "ws://localhost:8888"
]

GLOBAL_FEED_RELAYS = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://relay.primal.net",
    "wss://relay.nos.social",
]

# Search-capable relays (NIP-50)
# Ordered by reliability - will query all and combine results
SEARCH_RELAYS = [
    "wss://relay.nostr.band",
    "wss://search.nos.today",
    "wss://nostr.wine",
    "wss://relay.snort.social",
]

PING_INTERVAL = 20
PING_TIMEOUT = 20

READ_SINCE_SECONDS = 3 * 60 * 60   # last 3 hours
READ_LIMIT = 50

CONTACTS_FETCH_TIMEOUT = 6
CONTACTS_KIND = 3

AUTHOR_CHUNK_SIZE = 100

# Publish wait timeout per relay (seconds)
PUBLISH_TIMEOUT = 4
