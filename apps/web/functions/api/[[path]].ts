// Cloudflare Pages Functions: /api/* 요청을 Hono 앱(apps/api)으로 넘긴다.
import { handle } from "hono/cloudflare-pages";
import { app } from "@candlemma/api";

export const onRequest = handle(app);
