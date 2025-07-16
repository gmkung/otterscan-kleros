export type KlerosSubmissionData = {
  contractAddress: string;
  projectName: string;
  publicNameTag: string;
  publicNote: string;
  websiteLink: string;
};

export type KlerosSubmissionJSON = {
  columns: Array<{
    label: string;
    description: string;
    type: string;
    isIdentifier?: boolean;
  }>;
  values: {
    "Contract Address": string;
    "Public Name Tag": string;
    "Project Name": string;
    "UI/Website Link": string;
    "Public Note": string;
  };
};

const KLEROS_COLUMNS_SCHEMA = [
  {
    label: "Contract Address",
    description: "The address of the smart contract being tagged. Will be store in CAIP-10 format if the chain is properly selected in the UI.",
    type: "rich address",
    isIdentifier: true
  },
  {
    label: "Public Name Tag",
    description: "The Public Name tag of a contract address indicates a commonly-used name of the smart contract and clearly identifies it to avoid potential confusion. (e.g. Eth2 Deposit Contract).",
    type: "text",
    isIdentifier: true
  },
  {
    label: "Project Name",
    description: "The name of the project that the contract belongs to. Can be omitted only for contracts which do not belong to a project",
    type: "text",
    isIdentifier: true
  },
  {
    label: "UI/Website Link",
    description: "The URL of the most popular user interface used to interact with the contract tagged or the URL of the official website of the contract deployer (e.g. https://launchpad.ethereum.org/en/).",
    type: "link",
    isIdentifier: true
  },
  {
    label: "Public Note",
    description: "The Public Note is a short, mandatory comment field used to add a comment/information about the contract that could not fit in the public name tag (e.g. Official Ethereum 2.0 Beacon Chain deposit contact address).",
    type: "text"
  }
];

export function createKlerosSubmissionJSON(
  data: KlerosSubmissionData,
  chainId: bigint
): KlerosSubmissionJSON {
  return {
    columns: KLEROS_COLUMNS_SCHEMA,
    values: {
      "Contract Address": `eip155:${chainId}:${data.contractAddress}`,
      "Public Name Tag": data.publicNameTag,
      "Project Name": data.projectName,
      "UI/Website Link": data.websiteLink,
      "Public Note": data.publicNote
    }
  };
}

export async function uploadToIPFS(data: string, fileName: string): Promise<string> {
  const blob = new Blob([data], { type: "application/json" });
  const formdata = new FormData();
  formdata.append("data", blob, fileName);
  
  try {
    const response = await fetch(
      "https://kleros-api.netlify.app/.netlify/functions/upload-to-ipfs?operation=file&pinToGraph=true",
      {
        method: "POST",
        body: formdata,
        redirect: "follow",
      }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to upload to IPFS: ${response.statusText}`);
    }
    
    const result = await response.json();
    const cid = result.cids[0]; // Extract the first CID from the cids array
    console.log("Uploaded to IPFS:", cid);
    return cid;
  } catch (error) {
    console.error("IPFS upload error:", error);
    throw error;
  }
}

export async function submitToKlerosIPFS(
  submissionData: KlerosSubmissionData,
  chainId: bigint
): Promise<string> {
  const submissionJSON = createKlerosSubmissionJSON(submissionData, chainId);
  const jsonString = JSON.stringify(submissionJSON, null, 2);
  
  // Create a meaningful filename
  const fileName = `kleros-address-tag-${submissionData.contractAddress.toLowerCase()}.json`;
  
  return uploadToIPFS(jsonString, fileName);
}