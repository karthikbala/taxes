import {randomBytes} from 'node:crypto';
import {existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSQLiteDB} from '../server/sqlite.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length>1||args.length&&args[0]!=='--db-only')throw Error('Usage: npm run setup:local or npm run db:setup');
const envPath=resolve(root,'.env.local');
if(!args.length&&!existsSync(envPath)){writeFileSync(envPath,`# Standalone local development only. Never commit this file.\nINVISIA_POC_API_KEY=${randomBytes(32).toString('hex')}\nINVISIA_BROWSER_ENABLED=0\nHOST=127.0.0.1\nPORT=3000\nTAXES_DB_PATH=./runtime/taxes.sqlite\nNODE_EXTRA_CA_CERTS=./vendor/tls/letsencrypt-yr2-chain.pem\n`,{flag:'wx',mode:0o600});console.log('Created ignored .env.local with a random local key; paid source access is off.');}
else if(!args.length)console.log('Existing .env.local preserved.');
const dbPath=resolve(root,process.env.TAXES_DB_PATH||'runtime/taxes.sqlite');mkdirSync(dirname(dbPath),{recursive:true});const db=createSQLiteDB(dbPath);db.close();console.log('Local SQLite schema is ready; no spending ledger was created or reset.');
