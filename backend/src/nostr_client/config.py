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
