
import { Connection } from "@solana/web3.js";

async function checkTx() {
  const connection = new Connection("https://api.mainnet-beta.solana.com");
  const txid = "5Af67LWXPFwR2QJiGNRmwHHc4CcCpAwNarMnwZevWACia3qbrZ11YMwAHJDxfrpx3Kjj2xDY1WCgjBxdLggRnZsA";
  
  try {
    const tx = await connection.getTransaction(txid, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      console.log("Transaction not found");
      return;
    }
    
    console.log("Transaction found");
    console.log("Status:", tx.meta?.err ? "Failed" : "Success");
    console.log("Error:", JSON.stringify(tx.meta?.err, null, 2));
    
    if (tx.meta?.logMessages) {
      console.log("Logs:");
      tx.meta.logMessages.forEach(log => console.log(log));
    }
  } catch (err) {
    console.error("Error fetching transaction:", err);
  }
}

checkTx();
