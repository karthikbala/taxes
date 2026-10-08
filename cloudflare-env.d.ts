declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    INVISIA_BROWSER_API_KEY?: string;
    INVISIA_BROWSER_ENABLED?: string;
    BUCKET?: R2Bucket;
  }
}
