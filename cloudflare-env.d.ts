interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
