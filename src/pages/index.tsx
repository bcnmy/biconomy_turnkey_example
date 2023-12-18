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
  BiconomySmartAccountV2,
  DEFAULT_ENTRYPOINT_ADDRESS,
} from "@biconomy/account";
import { ChainId } from "@biconomy/core-types";
import { IPaymaster, BiconomyPaymaster } from "@biconomy/paymaster";
import {
  IHybridPaymaster,
  SponsorUserOperationDto,
  PaymasterMode,
} from "@biconomy/paymaster";
import { IBundler, Bundler } from "@biconomy/bundler";
import { contractABI } from "../contract/contractABI";

// Create a provider for the Polygon Mumbai network
const provider = new ethers.providers.JsonRpcProvider(
  "https://rpc.ankr.com/polygon_mumbai"
);

// Specify the chain ID for Polygon Mumbai
let chainId = 80001; // Polygon Mumbai or change as per your preferred chain

// Create a Bundler instance
const bundler: IBundler = new Bundler({
  // get from biconomy dashboard https://dashboard.biconomy.io/
  // for mainnet bundler url contact us on Telegram
  bundlerUrl: `https://bundler.biconomy.io/api/v2/${chainId}/nJPK7B3ru.dd7f7861-190d-41bd-af80-6877f74b8f44`,
  chainId: ChainId.POLYGON_MUMBAI, // or any supported chain of your choice
  entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
});

// Create a Paymaster instance
const paymaster: IPaymaster = new BiconomyPaymaster({
  // get from biconomy dashboard https://dashboard.biconomy.io/
  // Use this paymaster url for testing, you'll need to create your own paymaster for gasless transactions on your smart contracts.
  paymasterUrl:
    "https://paymaster.biconomy.io/api/v1/80001/-RObQRX9ei.fc6918eb-c582-4417-9d5a-0507b17cfe71",
});

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

      const ecdsaModule = await ECDSAOwnershipValidationModule.create({
        signer: connectedSigner,
        moduleAddress: DEFAULT_ECDSA_OWNERSHIP_MODULE,
      });

      let biconomySmartAccount = await BiconomySmartAccountV2.create({
        chainId: ChainId.POLYGON_MUMBAI,
        bundler: bundler,
        paymaster: paymaster,
        entryPointAddress: DEFAULT_ENTRYPOINT_ADDRESS,
        defaultValidationModule: ecdsaModule,
        activeValidationModule: ecdsaModule,
      });
      console.log(biconomySmartAccount, "Smart Account");
      setSmartAccount(biconomySmartAccount);
      const address = await biconomySmartAccount.getAccountAddress();
      console.log(address, "Smart Wallet Address");
      setSmartAccountAddress(address);
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
    let userOp = await smartAccount?.buildUserOp([tx1]);
    console.log("UserOp", { userOp });
    const biconomyPaymaster =
      smartAccount?.paymaster as IHybridPaymaster<SponsorUserOperationDto>;
    let paymasterServiceData: SponsorUserOperationDto = {
      mode: PaymasterMode.SPONSORED,
      smartAccountInfo: {
        name: "BICONOMY",
        version: "2.0.0",
      },
    };

    //If you get AA34 Signature Error, you have to add the below try method and recalculate callGasLimit and initiate it so that you don't get the error.
    try {
      const paymasterAndDataResponse =
        await biconomyPaymaster.getPaymasterAndData(
          //@ts-ignore
          userOp,
          paymasterServiceData
        );

      //@ts-ignore
      userOp.paymasterAndData = paymasterAndDataResponse.paymasterAndData;

      if (
        paymasterAndDataResponse.callGasLimit &&
        paymasterAndDataResponse.verificationGasLimit &&
        paymasterAndDataResponse.preVerificationGas
      ) {
        // Returned gas limits must be replaced in your op as you update paymasterAndData.
        // Because these are the limits paymaster service signed on to generate paymasterAndData
        // If you receive AA34 error check here..

        //@ts-ignore
        userOp.callGasLimit = paymasterAndDataResponse.callGasLimit;
        //@ts-ignore
        userOp.verificationGasLimit =
          paymasterAndDataResponse.verificationGasLimit;
        //@ts-ignore
        userOp.preVerificationGas = paymasterAndDataResponse.preVerificationGas;
      }

      //@ts-ignore
      const userOpResponse = await smartAccount?.sendUserOp(userOp);
      console.log("userOpHash", { userOpResponse });
      //@ts-ignore
      const { receipt } = await userOpResponse.wait(1);
      console.log("txHash", receipt.transactionHash);

      await getCountId();
    } catch (e) {
      console.log("error received ", e);
    }
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
