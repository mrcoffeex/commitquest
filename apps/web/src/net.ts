import { Client } from "colyseus.js";

export function colyseusEndpoint(): string {
  if (import.meta.env.VITE_COLYSEUS_URL) return import.meta.env.VITE_COLYSEUS_URL;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/colyseus`;
}

export function gameClient() {
  return new Client(colyseusEndpoint());
}
