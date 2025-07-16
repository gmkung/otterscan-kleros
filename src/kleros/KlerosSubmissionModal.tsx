import React, { useState, useContext, useEffect } from "react";
import { BrowserProvider } from "ethers";
import { RuntimeContext } from "../useRuntime";
import { ChecksummedAddress } from "../types";
import { 
  KlerosSubmissionData, 
  submitToKlerosIPFS 
} from "./klerosIPFS";
import { 
  KlerosContractService, 
  switchToGnosisChain, 
  formatXDai, 
  useSubmissionCost,
  GNOSIS_CHAIN_ID,
  type SubmissionCost 
} from "./klerosContract";

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

type KlerosSubmissionModalProps = {
  address: ChecksummedAddress;
  chainId: bigint;
  isOpen: boolean;
  onClose: () => void;
};

const KlerosSubmissionModal: React.FC<KlerosSubmissionModalProps> = ({
  address,
  chainId,
  isOpen,
  onClose,
}) => {
  const { provider } = useContext(RuntimeContext);
  const { getSubmissionCost } = useSubmissionCost(provider);
  
  const [formData, setFormData] = useState<KlerosSubmissionData>({
    contractAddress: address,
    projectName: "",
    publicNameTag: "",
    publicNote: "",
    websiteLink: "",
  });
  
  const [submissionCost, setSubmissionCost] = useState<SubmissionCost | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingCost, setIsLoadingCost] = useState(true);

  // Load submission cost on modal open - only once
  useEffect(() => {
    if (isOpen && !submissionCost && !error) {
      setIsLoadingCost(true);
      setError(null);
      getSubmissionCost()
        .then((cost) => {
          setSubmissionCost(cost);
          setIsLoadingCost(false);
        })
        .catch((err) => {
          console.error("Failed to load submission cost:", err);
          setError("Failed to load submission cost");
          setIsLoadingCost(false);
        });
    }
  }, [isOpen, submissionCost, error, getSubmissionCost]);

  // Reset state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSuccess(null);
      setIsSubmitting(false);
      setIsLoadingCost(true);
      setSubmissionCost(null);
    }
  }, [isOpen]);

  const handleInputChange = (field: keyof KlerosSubmissionData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateForm = (): string | null => {
    if (!formData.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return "Invalid contract address format";
    }
    if (!formData.projectName.trim()) {
      return "Project name is required";
    }
    if (!formData.publicNameTag.trim()) {
      return "Public name tag is required";
    }
    if (!formData.publicNote.trim()) {
      return "Public note is required";
    }
    if (formData.websiteLink && !formData.websiteLink.match(/^https?:\/\/.+/)) {
      return "Website link must be a valid URL starting with http:// or https://";
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Check if wallet is connected and on correct network
      if (!window.ethereum) {
        throw new Error("No wallet detected. Please install MetaMask or another Web3 wallet.");
      }

      // Switch to Gnosis chain if needed
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainIdDecimal = parseInt(currentChainId, 16);
      
      if (currentChainIdDecimal !== GNOSIS_CHAIN_ID) {
        await switchToGnosisChain();
      }

      // Get browser provider for signing
      const browserProvider = new BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();

      // Upload to IPFS
      console.log("Uploading to IPFS...");
      const ipfsHash = await submitToKlerosIPFS(formData, chainId);
      
      // Submit to Kleros contract
      console.log("Submitting to Kleros contract...");
      const service = new KlerosContractService(browserProvider);
      const txHash = await service.submitAddressTag(ipfsHash, signer);
      
      setSuccess(`Successfully submitted! Transaction: ${txHash}`);
      
      // Reset form after success
      setTimeout(() => {
        setFormData({
          contractAddress: address,
          projectName: "",
          publicNameTag: "",
          publicNote: "",
          websiteLink: "",
        });
        setSuccess(null);
        onClose();
      }, 3000);

    } catch (err: any) {
      console.error("Submission error:", err);
      setError(err.message || "Failed to submit address tag");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop with blur - darker for better contrast */}
      <div 
        className="fixed inset-0 bg-black/15 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-skin-bg rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-skin-border">
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-skin-text">Submit Address Tag to Kleros</h2>
              <button
                onClick={onClose}
                className="text-skin-muted hover:text-skin-text transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-skin-bg-secondary border border-skin-border p-4 rounded">
                <p className="text-sm text-skin-text">
                  This will submit an address tag to the Kleros Curate registry on Gnosis Chain. 
                  The submission requires a deposit that will be returned if the submission is accepted.
                </p>
              </div>

              {/* Cost Display */}
              {isLoadingCost ? (
                <div className="bg-skin-bg-secondary p-4 rounded border border-skin-border">
                  <p className="text-sm text-skin-muted">Loading submission cost...</p>
                </div>
              ) : submissionCost ? (
                <div className="bg-skin-bg-secondary p-4 rounded border border-skin-border">
                  <div className="text-sm space-y-1">
                    <div className="text-skin-muted">Submission deposit: <span className="text-skin-text">{formatXDai(submissionCost.submissionBaseDeposit)} xDai</span></div>
                    <div className="text-skin-muted">Arbitration cost: <span className="text-skin-text">{formatXDai(submissionCost.arbitrationCost)} xDai</span></div>
                    <div className="font-semibold border-t border-skin-border pt-1 text-skin-text">
                      Total cost: {formatXDai(submissionCost.totalCost)} xDai
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 rounded">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    Failed to load submission cost. Please try again later.
                  </p>
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-skin-text mb-2">
                    Contract Address
                  </label>
                  <input
                    type="text"
                    value={formData.contractAddress}
                    onChange={(e) => handleInputChange("contractAddress", e.target.value)}
                    className="w-full px-3 py-2 border border-skin-border rounded bg-skin-bg-secondary text-skin-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="0x..."
                  />
                  <p className="text-xs text-skin-muted mt-1">
                    Will be stored as: eip155:{chainId.toString()}:{formData.contractAddress}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-skin-text mb-2">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={formData.projectName}
                    onChange={(e) => handleInputChange("projectName", e.target.value)}
                    className="w-full px-3 py-2 border border-skin-border rounded bg-skin-bg-secondary text-skin-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g. Kleros"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-skin-text mb-2">
                    Public Name Tag *
                  </label>
                  <input
                    type="text"
                    value={formData.publicNameTag}
                    onChange={(e) => handleInputChange("publicNameTag", e.target.value)}
                    className="w-full px-3 py-2 border border-skin-border rounded bg-skin-bg-secondary text-skin-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g. PNK Merkle Drop"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-skin-text mb-2">
                    Public Note *
                  </label>
                  <textarea
                    value={formData.publicNote}
                    onChange={(e) => handleInputChange("publicNote", e.target.value)}
                    className="w-full px-3 py-2 border border-skin-border rounded bg-skin-bg-secondary text-skin-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="e.g. This contract is used for..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-skin-text mb-2">
                    UI/Website Link
                  </label>
                  <input
                    type="url"
                    value={formData.websiteLink}
                    onChange={(e) => handleInputChange("websiteLink", e.target.value)}
                    className="w-full px-3 py-2 border border-skin-border rounded bg-skin-bg-secondary text-skin-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g. https://kleros.io"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                  <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-skin-border">
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-skin-text bg-skin-bg-secondary hover:bg-skin-bg-tertiary border border-skin-border rounded transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !submissionCost}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Submitting..." : `Submit (${submissionCost ? formatXDai(submissionCost.totalCost) + " xDai" : "..."})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KlerosSubmissionModal;