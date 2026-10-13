import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {X509Certificate} from 'node:crypto';import {rootCertificates} from 'node:tls';
test('county intermediate chain is signed through the existing trusted ISRG Root X1, valid, and CA constrained',async()=>{
 const pem=await readFile(new URL('../vendor/tls/letsencrypt-yr2-chain.pem',import.meta.url),'utf8');
 const blocks=pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);assert.equal(blocks.length,2);
 const [issuer,crossSignedRoot]=blocks.map(p=>new X509Certificate(p));assert.match(issuer.subject,/CN=YR2/);assert.match(crossSignedRoot.subject,/CN=Root YR/);
 const trusted=rootCertificates.map(p=>new X509Certificate(p)).find(c=>c.subject===crossSignedRoot.issuer);assert.ok(trusted,'Existing Node trust root must anchor the cross-signature');
 assert.equal(crossSignedRoot.verify(trusted.publicKey),true);assert.equal(issuer.verify(crossSignedRoot.publicKey),true);
 for(const cert of [issuer,crossSignedRoot]){assert.equal(cert.ca,true);assert.ok(Date.parse(cert.validFrom)<=Date.now());assert.ok(Date.parse(cert.validTo)>Date.now());}
});
