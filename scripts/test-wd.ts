import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getWikidataById } from './lib/wikidata';

async function testWD() {
    console.log("Testing Inception by QID (Q25188):");
    const res1 = await getWikidataById("Q25188");
    console.log(JSON.stringify(res1, null, 2));
}

testWD().catch(console.error);
