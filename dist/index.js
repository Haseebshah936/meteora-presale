"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolanaService = void 0;
const web3_js_1 = require("@solana/web3.js");
// Example TypeScript file for Solana development
class SolanaService {
    constructor(cluster = 'devnet') {
        this.connection = new web3_js_1.Connection((0, web3_js_1.clusterApiUrl)(cluster));
    }
    async getBalance(publicKey) {
        try {
            const pubKey = new web3_js_1.PublicKey(publicKey);
            const balance = await this.connection.getBalance(pubKey);
            return balance / 1e9; // Convert lamports to SOL
        }
        catch (error) {
            console.error('Error fetching balance:', error);
            throw error;
        }
    }
    async getAccountInfo(publicKey) {
        try {
            const pubKey = new web3_js_1.PublicKey(publicKey);
            const accountInfo = await this.connection.getAccountInfo(pubKey);
            return accountInfo;
        }
        catch (error) {
            console.error('Error fetching account info:', error);
            throw error;
        }
    }
}
exports.SolanaService = SolanaService;
// Example usage
async function main() {
    const solanaService = new SolanaService('devnet');
    // Example public key (replace with actual key)
    const examplePublicKey = '11111111111111111111111111111112';
    try {
        const balance = await solanaService.getBalance(examplePublicKey);
        console.log(`Balance: ${balance} SOL`);
    }
    catch (error) {
        console.error('Failed to get balance:', error);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=index.js.map