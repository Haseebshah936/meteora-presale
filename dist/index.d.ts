declare class SolanaService {
    private connection;
    constructor(cluster?: 'devnet' | 'testnet' | 'mainnet-beta');
    getBalance(publicKey: string): Promise<number>;
    getAccountInfo(publicKey: string): Promise<import("@solana/web3.js").AccountInfo<Buffer<ArrayBufferLike>> | null>;
}
export { SolanaService };
//# sourceMappingURL=index.d.ts.map