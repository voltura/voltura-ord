// Local development only. Configure the same variable names as Sites secrets for production.
import { createECDH } from 'node:crypto';
import { existsSync,writeFileSync } from 'node:fs';
if(existsSync('.dev.vars'))throw new Error('.dev.vars already exists; preserve its keys and other settings.');
const key=createECDH('prime256v1');key.generateKeys();
const privateKey=Buffer.from(key.getPrivateKey().toString('hex').padStart(64,'0'),'hex').toString('base64url');
writeFileSync('.dev.vars',`ORD_PUSH_PUBLIC_KEY=${key.getPublicKey().toString('base64url')}\nORD_PUSH_PRIVATE_KEY=${privateKey}\n`,{mode:0o600});
console.log('Local notification keys saved in ignored .dev.vars. No key values were printed.');
