declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AGENT_API_TOKEN?: string;
    OWNER_CHATGPT_EMAIL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
  }
}
