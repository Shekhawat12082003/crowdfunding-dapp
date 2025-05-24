import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import CampaignAbi from './Campaign.Abi.json';
import CampaignFactoryAbi from './CampaignFactory.Abi.json';

const factoryAddress = '0xb6AD66D24a8023D3813156df657387Fd1fc9F09e';

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [factoryContract, setFactoryContract] = useState(null);
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [milestones, setMilestones] = useState(['']);

  useEffect(() => {
    if (window.ethereum) {
      const prov = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(prov);
      setSigner(prov.getSigner());
      setFactoryContract(new ethers.Contract(factoryAddress, CampaignFactoryAbi, prov.getSigner()));
    }
  }, []);

  const connectWallet = async () => {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    setAccount(accounts[0]);
  };

  const createCampaign = async () => {
    try {
      const tx = await factoryContract.createCampaign(description, ethers.utils.parseEther(goal), milestones);
      await tx.wait();
      alert('Campaign Created!');
    } catch (err) {
      console.error(err);
    }
  };

  const loadCampaigns = async () => {
    try {
      const addresses = await factoryContract.getCampaigns();
      const campaignData = await Promise.all(
        addresses.map(async (address) => {
          const contract = new ethers.Contract(address, CampaignAbi, signer);
          const desc = await contract.description();
          const balance = await provider.getBalance(address);
          return { address, desc, balance: ethers.utils.formatEther(balance) };
        })
      );
      setCampaigns(campaignData);
    } catch (err) {
      console.error(err);
    }
  };

  const contribute = async (address, amount) => {
    const contract = new ethers.Contract(address, CampaignAbi, signer);
    const tx = await contract.contribute({ value: ethers.utils.parseEther(amount) });
    await tx.wait();
    alert('Contribution successful!');
  };

  const voteMilestone = async (address, index) => {
    const contract = new ethers.Contract(address, CampaignAbi, signer);
    const tx = await contract.voteOnMilestone(index);
    await tx.wait();
    alert('Voted!');
  };

  const releaseFunds = async (address, index) => {
    const contract = new ethers.Contract(address, CampaignAbi, signer);
    const tx = await contract.releaseFunds(index);
    await tx.wait();
    alert('Funds Released!');
  };

  const claimRefund = async (address) => {
    const contract = new ethers.Contract(address, CampaignAbi, signer);
    const tx = await contract.claimRefund();
    await tx.wait();
    alert('Refund Claimed!');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">CoreFund Crowdfunding dApp</h1>
      <button className="bg-blue-600 text-white px-4 py-2 rounded mb-4" onClick={connectWallet}>
        {account ? `Connected: ${account}` : 'Connect Wallet'}
      </button>

      <div className="mb-6 p-4 border rounded">
        <h2 className="text-xl mb-2">Create Campaign</h2>
        <input placeholder="Description" className="border p-2 w-full mb-2" onChange={(e) => setDescription(e.target.value)} />
        <input placeholder="Goal in ETH" className="border p-2 w-full mb-2" onChange={(e) => setGoal(e.target.value)} />
        {milestones.map((m, idx) => (
          <input
            key={idx}
            placeholder={`Milestone ${idx + 1}`}
            className="border p-2 w-full mb-2"
            value={m}
            onChange={(e) => {
              const newMilestones = [...milestones];
              newMilestones[idx] = e.target.value;
              setMilestones(newMilestones);
            }}
          />
        ))}
        <button className="bg-gray-500 text-white px-2 py-1 mr-2" onClick={() => setMilestones([...milestones, ''])}>Add Milestone</button>
        <button className="bg-green-600 text-white px-4 py-2 mt-2" onClick={createCampaign}>Create</button>
      </div>

      <button className="bg-indigo-500 text-white px-4 py-2 rounded mb-4" onClick={loadCampaigns}>Load Campaigns</button>

      {campaigns.map((c, i) => (
        <div key={i} className="border p-4 mb-4 rounded">
          <p><strong>Description:</strong> {c.desc}</p>
          <p><strong>Address:</strong> {c.address}</p>
          <p><strong>Balance:</strong> {c.balance} ETH</p>
          <input placeholder="Amount to contribute (ETH)" className="border p-2 w-full mb-2" onBlur={(e) => (c.amount = e.target.value)} />
          <button className="bg-yellow-500 text-white px-3 py-1 mr-2" onClick={() => contribute(c.address, c.amount)}>Contribute</button>
          <button className="bg-blue-500 text-white px-3 py-1 mr-2" onClick={() => voteMilestone(c.address, 0)}>Vote Milestone 0</button>
          <button className="bg-green-500 text-white px-3 py-1 mr-2" onClick={() => releaseFunds(c.address, 0)}>Release Funds</button>
          <button className="bg-red-600 text-white px-3 py-1" onClick={() => claimRefund(c.address)}>Claim Refund</button>
        </div>
      ))}
    </div>
  );
}
