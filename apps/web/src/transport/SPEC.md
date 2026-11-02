---
id: submodule-web-transport
type: submodule-design
status: active
title: transport — WS client to the host
parent: module-web
depends-on: [module-contracts]
tags: [web, transport]
---

# `apps/web/src/transport` Specification

Browser transport client (`HostTransport`) implementing the `@realthing/contracts` HTTP JSON-RPC (`POST /rpc`) and Server-Sent Events (`GET /events`) protocol.

## Responsibilities

- **`call(method, params)`:** Sends a typed `RpcRequest` to `${baseUrl}/rpc`, unwraps `RpcSuccess.result`, and throws a typed `RpcClientError` (preserving `code`, `message`, and `data`) on `RpcFailure` or network error.
- **SSE Event Stream (`GET /events`):** Connects via `EventSource`, parses typed `HostEvent` payloads (`server.welcome`, `workspace.updated`, `fs.changed`, `git.changed`, `terminal.data`, `terminal.exit`, `todo.updated`, `theme.changed`, `locale.changed`, `update.state`), and notifies subscribers.
- **Reconnection & Welcome Handshake:** Automatically reconnects with bounded exponential backoff when the SSE stream drops, updating connection status and re-emitting `server.welcome` so the store can reconcile state.
- **Configurable endpoint:** Defaults to same-origin (`""`), overridable via `?host=` query parameter or runtime configuration.

## Boundary Rules

- Depends only on `@realthing/contracts`. Zero imports from sibling web sub-modules.
