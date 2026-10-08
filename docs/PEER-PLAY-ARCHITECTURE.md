# Peer play for long cases

## Goal

Let a small group investigate one case over several days, with a shared evidence board, notes, recordings, and Resolution Sheet. Players can be online together or return later. The experience should support focused solo work between group sessions and make it clear who added or changed an item.

## Connection and privacy model

- Use WebRTC data channels for peer-to-peer transfer. WebRTC encrypts transport with DTLS; room content must not be sent through a signaling service in plaintext.
- Supabase Realtime currently carries WebRTC offers, answers, and ICE candidates on a public topic named with a random room ID. The 45-character invite combines that ID with a separate random secret. The secret stays on the devices and derives AES-GCM state-encryption and HMAC signaling-authentication keys. The invite is a bearer key: anyone who has it can join while the host is online. The host tab must remain open. The topic is temporary and carries no case notes.
- The invite is not a player identity or account login. For durable storage, encrypt the event log before any optional relay or backup. Let the host revoke and replace invites.
- Show the actual trust boundary: direct connections can fall back to a TURN relay when networks block P2P. The relay sees encrypted packets and connection metadata, not decrypted notes.
- Keep per-device local recovery. A browser refresh or network outage must not erase a multi-day investigation.

## State and conflict handling

Represent edits as append-only events with room, case, actor, sequence, timestamp, and payload. Use stable IDs and idempotent application so reconnecting peers can exchange missing events safely. Cards and links can merge by ID; concurrent text edits need an explicit policy (start with last-writer-wins plus visible edit history, then consider a CRDT if real use shows a need).

The host should not be a single point of failure. Every peer stores the encrypted event log locally and can offer it to reconnecting members. A peer joining late receives the current log and a clear sync status. Voice recordings need chunked encrypted transfer and size limits; do not silently upload them to the leaderboard database.

## Case and spoiler handling

Large cases should be authored as small, independently loadable evidence files. The room shares which public documents are open and players can pin or assign them, but each player can read at their own pace. Do not make the room's event log contain the solution before the group reaches the reveal. Static web hosting cannot keep a determined user from fetching public files, so spoiler protection is a game-flow boundary, not cryptographic access control.

## Delivery phases

1. **Room prototype (implemented):** room invite code, host/join handshake, HMAC-authenticated signaling, AES-GCM-encrypted state, WebRTC DTLS data channels, and live sync for case progress, the board, notebook, highlights, Resolution Sheet, and accusations. Free Cloudflare STUN is configured. Each player follows the reveal locally.
2. **Two-browser hardening:** test across browsers and networks, make signalling expiry and access clearer, add TURN credentials for restrictive NATs, and improve reconnect handling.
3. **Small group:** mesh or host-relayed WebRTC for up to six players, conflict handling, presence, and reconnect tests across browsers.
4. **Multi-day play:** encrypted event-log snapshots, resumable room membership, invite revocation, backups, and offline merge.
5. **Long-case authoring:** manageable evidence releases, per-player assignments, pacing tools, and a case that can be paused and resumed over 2–10 days.

## Decisions needed before implementation

- Where will the signaling endpoint run and who will operate it?
- Is a TURN relay acceptable when direct connections fail?
- Should a player be able to host a room from their own browser, or must rooms survive the host going offline?
- What is the intended maximum group size and voice-note storage limit?

The first version uses the configured Supabase project for ephemeral Realtime signaling and never reuses the public scores table as a room store. Room state is currently sent directly over WebRTC; voice recordings and offline multi-day recovery are still local-only.
