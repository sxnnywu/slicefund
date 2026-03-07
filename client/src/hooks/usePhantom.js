import { useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Solana network configuration
const NETWORK = 'devnet';
const CLUSTER_URL = NETWORK === 'devnet'
  ? 'https://api.devnet.solana.com'
  : 'https://api.mainnet-beta.solana.com';

const connection = new Connection(CLUSTER_URL, 'confirmed');

export default function usePhantom() {
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [phantomInstalled, setPhantomInstalled] = useState(null);

  // Get Phantom provider
  const getProvider = useCallback(() => {
    if (typeof window !== 'undefined' && 'phantom' in window) {
      const provider = window.phantom?.solana;
      if (provider?.isPhantom) {
        return provider;
      }
    }
    return null;
  }, []);

  // Check if Phantom is installed
  useEffect(() => {
    const checkPhantom = () => {
      const provider = getProvider();
      setPhantomInstalled(!!provider);
    };

    // Check immediately and after a short delay (Phantom may load async)
    checkPhantom();
    const timeout = setTimeout(checkPhantom, 500);
    return () => clearTimeout(timeout);
  }, [getProvider]);

  // Update balance
  const updateBalance = useCallback(async (publicKey) => {
    if (!publicKey) return;
    try {
      const bal = await connection.getBalance(publicKey);
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch (err) {
      console.error('Balance error:', err);
      setBalance(null);
    }
  }, []);

  // Connect wallet
  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError('Phantom wallet not found');
      return;
    }

    try {
      setConnecting(true);
      setError(null);

      const response = await provider.connect();
      const publicKey = response.publicKey;

      setWallet(publicKey);
      await updateBalance(publicKey);

      // Listen for account changes
      provider.on('accountChanged', async (newPublicKey) => {
        if (newPublicKey) {
          setWallet(newPublicKey);
          await updateBalance(newPublicKey);
        } else {
          setWallet(null);
          setBalance(null);
        }
      });

    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  }, [getProvider, updateBalance]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    const provider = getProvider();
    if (provider) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.error('Disconnect error:', err);
      }
    }
    setWallet(null);
    setBalance(null);
    setError(null);
  }, [getProvider]);

  // Send SOL transaction
  const sendSol = useCallback(async (recipientAddress, amount) => {
    const provider = getProvider();
    if (!provider || !wallet) {
      throw new Error('Wallet not connected');
    }

    // Validate recipient address
    let recipientPubkey;
    try {
      recipientPubkey = new PublicKey(recipientAddress);
    } catch {
      throw new Error('Invalid recipient address');
    }

    if (!amount || amount <= 0) {
      throw new Error('Invalid amount');
    }

    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet,
        toPubkey: recipientPubkey,
        lamports: Math.floor(amount * LAMPORTS_PER_SOL)
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    // Sign and send via Phantom
    const { signature } = await provider.signAndSendTransaction(transaction);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error('Transaction failed');
    }

    // Update balance after transaction
    await updateBalance(wallet);

    return {
      signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`
    };
  }, [getProvider, wallet, updateBalance]);

  // Try to reconnect on mount if previously connected
  useEffect(() => {
    const tryReconnect = async () => {
      const provider = getProvider();
      if (!provider) return;

      try {
        const response = await provider.connect({ onlyIfTrusted: true });
        setWallet(response.publicKey);
        await updateBalance(response.publicKey);
      } catch {
        // Not previously connected, that's fine
      }
    };

    if (phantomInstalled) {
      tryReconnect();
    }
  }, [phantomInstalled, getProvider, updateBalance]);

  return {
    wallet,
    balance,
    connecting,
    error,
    phantomInstalled,
    connect,
    disconnect,
    sendSol,
    refreshBalance: () => updateBalance(wallet),
    walletAddress: wallet?.toString() || null,
    network: NETWORK,
  };
}
