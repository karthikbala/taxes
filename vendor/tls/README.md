# Reviewed county TLS chain

Highlands' `www.hcpao.org` handshake supplies its leaf certificate without the required Let’s Encrypt YR2 intermediates. The public bundle contains YR2 and ISRG Root YR cross-signed by the already trusted ISRG Root X1. It does not contain a county leaf certificate or a new self-signed trust root.

Downloaded 12 October 2026 from the issuer's official HTTPS endpoints:

- https://letsencrypt.org/certs/gen-y/int-yr2.pem
- https://letsencrypt.org/certs/gen-y/root-yr-by-x1.pem

Hierarchy: https://letsencrypt.org/certificates/

YR2 SHA-256 fingerprint: `23:8B:85:A0:09:9C:65:B9:70:47:7D:57:24:F1:A1:D4:75:CE:50:58:CF:FE:4E:FA:87:33:89:9B:DB:86:3C:47`.

The captured Highlands leaf verified against the existing system CA store using this chain. Offline tests verify both signatures, existing Node root anchoring, CA constraints and validity periods. Normal TLS hostname/certificate/expiry verification remains enabled; no `rejectUnauthorized: false` or insecure fetch is used.

Node must receive `NODE_EXTRA_CA_CERTS` in its initial process environment. The npm launch wrapper does this for local use. A systemd service that starts `server/index.mjs` directly needs the absolute bundle path in its EnvironmentFile. Refresh only from the official issuer and rerun chain/signature tests when issuer rotation or expiry requires it.
