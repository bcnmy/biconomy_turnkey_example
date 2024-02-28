import React, { useState } from "react";
import { TurnkeySigner } from "@turnkey/ethers";
import { ethers } from "ethers";
import { TurnkeyClient } from "@turnkey/http";
import { ApiKeyStamper } from "@turnkey/api-key-stamper";
import {
  ECDSAOwnershipValidationModule,
  DEFAULT_ECDSA_OWNERSHIP_MODULE,
} from "@biconomy/modules";
import {
  createSmartAccountClient,
  BiconomySmartAccountV2,
  PaymasterMode,
} from "@biconomy/account";
import { IBundler, Bundler } from "@biconomy/bundler";
import { contractABI } from "../contract/contractABI";

// Create a provider for the Polygon Mumbai network
const provider = new ethers.providers.JsonRpcProvider(
  "https://rpc.ankr.com/polygon_mumbai"
);

// Specify the chain ID for Polygon Mumbai
let chainId = 80001; // Polygon Mumbai or change as per your preferred chain

export default function Home() {
  const [smartAccount, setSmartAccount] =
    useState<BiconomySmartAccountV2 | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(
    null
  );
  const [count, setCount] = useState<string | null>(null);

  const connect = async () => {
    try {
      const turnkeyClient = new TurnkeyClient(
        {
          baseUrl: process.env.NEXT_PUBLIC_BASE_URL!,
        },
        new ApiKeyStamper({
          apiPublicKey: process.env.NEXT_PUBLIC_API_PUBLIC_KEY!,
          apiPrivateKey: process.env.NEXT_PUBLIC_API_PRIVATE_KEY!,
        })
      );

      console.log(turnkeyClient, "TurnKey Client");

      // Initialize a Turnkey Signer
      const turnkeySigner = new TurnkeySigner({
        client: turnkeyClient,
        organizationId: process.env.NEXT_PUBLIC_ORGANIZATION_ID!,
        signWith: process.env.NEXT_PUBLIC_SIGN_WITH!,
      });

      console.log(turnkeySigner, "TurnKey Signer");

      console.log(provider, "Provider");
      const connectedSigner = turnkeySigner.connect(provider);

      console.log(connectedSigner, "Signer");

      const config = {
        biconomyPaymasterApiKey:
          "-RObQRX9ei.fc6918eb-c582-4417-9d5a-0507b17cfe71",
        bundlerUrl: `https://bundler.biconomy.io/api/v2/${chainId}/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44`, // <-- Read about this at https://docs.biconomy.io/dashboard#bundler-url
      };

      const smartWallet = await createSmartAccountClient({
        signer: connectedSigner,
        biconomyPaymasterApiKey: config.biconomyPaymasterApiKey,
        bundlerUrl: config.bundlerUrl,
        rpcUrl: "https://rpc.ankr.com/polygon_mumbai",
      });

      console.log("Biconomy Smart Account", smartWallet);
      setSmartAccount(smartWallet);
      const saAddress = await smartWallet.getAccountAddress();
      console.log("Smart Account Address", saAddress);
      setSmartAccountAddress(saAddress);
    } catch (error) {
      console.log(error);
    }
  };

  const getCountId = async () => {
    const contractAddress = "0xc34E02663D5FFC7A1CeaC3081bF811431B096C8C";
    const contractInstance = new ethers.Contract(
      contractAddress,
      contractABI,
      provider
    );
    const countId = await contractInstance.getCount();
    setCount(countId.toString());
  };

  const incrementCount = async () => {
    const contractAddress = "0xc34E02663D5FFC7A1CeaC3081bF811431B096C8C";
    const contractInstance = new ethers.Contract(
      contractAddress,
      contractABI,
      provider
    );
    const minTx = await contractInstance.populateTransaction.increment();
    console.log("Mint Tx Data", minTx.data);
    const tx1 = {
      to: contractAddress,
      data: minTx.data,
    };

    //@ts-ignore
    let userOp = await smartAccount?.buildUserOp([tx1], {
      paymasterServiceData: { mode: PaymasterMode.SPONSORED },
    });
    console.log("UserOp", userOp);

    //@ts-ignore
    const userOpResponse = await smartAccount?.sendUserOp(userOp);
    console.log("userOpHash", { userOpResponse });
    //@ts-ignore
    const { receipt } = await userOpResponse.wait(1);
    console.log("txHash", receipt.transactionHash);

    await getCountId();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-8 p-24">
      <div className="text-[4rem] font-bold text-orange-400">
        Biconomy Turnkey
      </div>
      {!smartAccount && (
        <button
          className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
          onClick={connect}
        >
          Turnkey Sign in
        </button>
      )}

      {smartAccount && (
        <>
          {" "}
          <span>Smart Account Address</span>
          <span>{smartAccountAddress}</span>
          <div className="flex flex-row justify-between items-start gap-8">
            <div className="flex flex-col justify-center items-center gap-4">
              <button
                className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
                onClick={getCountId}
              >
                Get Count Id
              </button>
              <span>{count}</span>
            </div>
            <div className="flex flex-col justify-center items-center gap-4">
              <button
                className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
                onClick={incrementCount}
              >
                Increment Count
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
