// Cloudflare Pages Functions: /api/* 요청을 Hono 앱(apps/api)으로 넘긴다.
import { handle } from "hono/cloudflare-pages";
import { app } from "@candlemma/api";
import { proxyRequest } from "../../../api/src/proxy";

const handler = handle(app);
export const onRequest: typeof handler = async context => {
  const request = await proxyRequest(context.request, (context.env as { TREVU_PROXY_SECRET?: string }).TREVU_PROXY_SECRET);
  return request instanceof Response ? request : handler({ ...context, request });
};
