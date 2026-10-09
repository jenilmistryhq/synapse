# Peer play for long cases

## Goal

Let a small group investigate one case over several days, with a shared evidence board, notes, recordings, and Resolution Sheet. Players can be online together or return later. The experience should support focused solo work between group sessions and make it clear who added or changed an item.

## Connection and privacy model

- Use WebRTC data channels for peer-to-peer transfer. WebRTC encrypts transport with DTLS; room content must not be sent through a signaling service in plaintext.
- Supabase Realtime carries WebRTC offers, answers, ICE candidates, and member names on a public topic named with a random room ID. It can also relay AES-GCM-encrypted investigation snapshots while a direct data channel is unavailable. The 45-character invite combines the room ID with a separate random secret. The secret stays on the devices and derives AES-GCM state-encryption and HMAC signaling-authentication keys. The invite is a bearer key: anyone who has it can join while the host is online. The host tab must remain open.
- The invite is not a player identity or account login. For durable storage, encrypt the event log before any optional relay or backup. Let the host revoke and replace invites.
- Show the actual trust boundary: direct connections are preferred, with encrypted state relayed through Realtime if direct links fail. Relays see ciphertext and connection metadata, not decrypted notes.
- Keep per-device local recovery. Case state is already saved in the browser; the current room invite and display name are also remembered on that device so a player can reopen or rejoin the same room.

## State and conflict handling

The prototype still shares whole snapshots and uses last-writer-wins. It now shows member-selected names and a short shared activity list. If an incoming snapshot overlaps with edits that have not yet been sent from this device, the local snapshot is kept in browser storage and can be restored from Group play. This does not resolve edits already sent concurrently, and the activity list is not a durable audit log. A future event-based sync should use stable IDs and idempotent application; concurrent text edits will need an explicit policy.

The host should not be a single point of failure. Every peer stores the encrypted event log locally and can offer it to reconnecting members. A peer joining late receives the current log and a clear sync status. Voice recordings need chunked encrypted transfer and size limits; do not silently upload them to the leaderboard database.

## Case and spoiler handling

Large cases should be authored as small, independently loadable evidence files. The room shares which public documents are open and players can pin or assign them, but each player can read at their own pace. Do not make the room's event log contain the solution before the group reaches the reveal. Static web hosting cannot keep a determined user from fetching public files, so spoiler protection is a game-flow boundary, not cryptographic access control.

## Delivery phases

1. **Room prototype (implemented):** room invite code, host/join handshake, HMAC-authenticated signaling, named member presence, AES-GCM-encrypted state, WebRTC data channels, and encrypted Realtime fallback when direct links fail. Each player follows the reveal locally.
2. **Local recovery (implemented):** remember the invite on-device, allow the same host or guest role to reconnect, keep a recent shared activity list, and preserve unsent local edits when an overlapping snapshot arrives.
3. **Two-browser hardening:** exercise host recovery, presence, and conflict handling across browsers and networks; add durable event-based sync if the prototype behaves well.
4. **Multi-day play:** encrypted event-log snapshots, resumable room membership, invite revocation, backups, and offline merge.
5. **Long-case authoring:** manageable evidence releases, per-player assignments, pacing tools, and a case that can be paused and resumed over 2–10 days.

## Decisions needed before implementation

- Where will the signaling endpoint run and who will operate it?
- Is a TURN relay acceptable when direct connections fail?
- Should a player be able to host a room from their own browser, or must rooms survive the host going offline?
- What is the intended maximum group size and voice-note storage limit?

The room uses the configured Supabase project for ephemeral Realtime signaling, presence, and encrypted fallback messages; it never reuses the public scores table as a room store. Voice recordings and offline merge remain unsupported. Reconnecting requires the saved invite and an available host browser to publish the current shared snapshot.
