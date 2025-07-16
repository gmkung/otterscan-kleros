import { Contract, parseEther, JsonRpcProvider, BrowserProvider, JsonRpcApiProvider } from "ethers";

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

// Gnosis chain configuration
export const GNOSIS_CHAIN_ID = 100;
export const KLEROS_REGISTRY_ADDRESS = "0x66260c69d03837016d88c9877e61e08ef74c59f2";
export const KLEROS_ARBITRATOR_ADDRESS = "0x9C1dA9A04925bDfDedf0f6421bC7EEa8305F9002";

// Minimal ABI for the functions we need
const KLEROS_REGISTRY_ABI = [
  "function addItem(string memory _item) public payable",
  "function submissionBaseDeposit() public view returns (uint256)",
  "function arbitrator() public view returns (address)",
  "function arbitratorExtraData() public view returns (bytes)"
];

const ARBITRATOR_ABI = [
  "function arbitrationCost(bytes memory _extraData) public view returns (uint256)"
];

export type SubmissionCost = {
  submissionBaseDeposit: bigint;
  arbitrationCost: bigint;
  totalCost: bigint;
};

export class KlerosContractService {
  private registryContract: Contract;
  private arbitratorContract: Contract;
  private provider: JsonRpcProvider | BrowserProvider | JsonRpcApiProvider;

  constructor(provider: JsonRpcProvider | BrowserProvider | JsonRpcApiProvider) {
    this.provider = provider;
    this.registryContract = new Contract(
      KLEROS_REGISTRY_ADDRESS,
      KLEROS_REGISTRY_ABI,
      provider
    );
    this.arbitratorContract = new Contract(
      KLEROS_ARBITRATOR_ADDRESS,
      ARBITRATOR_ABI,
      provider
    );
  }

  async getSubmissionCost(): Promise<SubmissionCost> {
    try {
      const [submissionBaseDeposit, arbitratorExtraData] = await Promise.all([
        this.registryContract.submissionBaseDeposit(),
        this.registryContract.arbitratorExtraData()
      ]);

      const arbitrationCost = await this.arbitratorContract.arbitrationCost(
        arbitratorExtraData
      );

      const totalCost = submissionBaseDeposit + arbitrationCost;

      return {
        submissionBaseDeposit,
        arbitrationCost,
        totalCost
      };
    } catch (error) {
      console.error("Error getting submission cost:", error);
      throw new Error("Failed to calculate submission cost");
    }
  }

  async submitAddressTag(ipfsHash: string, signer: any): Promise<string> {
    try {
      const cost = await this.getSubmissionCost();
      const contractWithSigner = this.registryContract.connect(signer);
      
      const tx = await contractWithSigner.getFunction("addItem")(ipfsHash, {
        value: cost.totalCost
      });

      console.log("Kleros submission transaction:", tx.hash);
      return tx.hash;
    } catch (error) {
      console.error("Error submitting to Kleros:", error);
      throw error;
    }
  }
}

export async function switchToGnosisChain(): Promise<boolean> {
  if (!window.ethereum) {
    throw new Error("No wallet detected");
  }

  try {
    // Try to switch to Gnosis chain
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${GNOSIS_CHAIN_ID.toString(16)}` }],
    });
    return true;
  } catch (switchError: any) {
    // Chain not added to wallet, try to add it
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${GNOSIS_CHAIN_ID.toString(16)}`,
              chainName: 'Gnosis Chain',
              nativeCurrency: {
                name: 'xDai',
                symbol: 'XDAI',
                decimals: 18,
              },
              rpcUrls: ['https://rpc.gnosischain.com/'],
              blockExplorerUrls: ['https://gnosisscan.io/'],
            },
          ],
        });
        return true;
      } catch (addError) {
        console.error("Error adding Gnosis chain:", addError);
        throw new Error("Failed to add Gnosis chain to wallet");
      }
    } else {
      console.error("Error switching to Gnosis chain:", switchError);
      throw new Error("Failed to switch to Gnosis chain");
    }
  }
}

export function formatXDai(wei: bigint): string {
  const xdai = Number(wei) / 1e18;
  return xdai.toFixed(4);
}

// Hook for getting submission cost
export function useSubmissionCost(provider: JsonRpcProvider | BrowserProvider | JsonRpcApiProvider) {
  const getSubmissionCost = async (): Promise<SubmissionCost | null> => {
    try {
      // Create a provider specifically for Gnosis chain to read contract state
      const gnosisProvider = new JsonRpcProvider("https://rpc.gnosischain.com/");
      const service = new KlerosContractService(gnosisProvider);
      return await service.getSubmissionCost();
    } catch (error) {
      console.error("Error getting submission cost:", error);
      return null;
    }
  };

  return { getSubmissionCost };
}