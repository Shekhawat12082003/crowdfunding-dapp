import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import './App.css';

const CONTRACT_ADDRESS = "0xb6AD66D24a8023D3813156df657387Fd1fc9F09e";

const CONTRACT_ABI = [
  "function campaignCount() view returns (uint256)",
  "function createCampaign(string title, string description, uint256 fundingGoal, uint256 durationDays) external",
  "function getCampaign(uint256) view returns (address owner, string title, string description, uint256 fundingGoal, uint256 totalFunds, uint256 deadline, bool isOpen, uint256 milestoneCount)",
  "function addMilestone(uint256 campaignId, string description, uint256 target) external",
  "function contribute(uint256 campaignId) external payable",
  "function voteMilestone(uint256 campaignId, uint256 milestoneId, bool approve) external",
  "function getMilestone(uint256 campaignId, uint256 milestoneId) view returns (string description, uint256 targetAmount, bool isCompleted, bool fundsReleased, uint256 votesFor, uint256 votesAgainst)",
  "function releaseFunds(uint256 campaignId, uint256 milestoneId) external",
  "function claimRefund(uint256 campaignId) external",
  "function getContributorCount(uint256 campaignId) view returns (uint256)",
];

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newCampaign, setNewCampaign] = useState({ title: "", description: "", fundingGoal: "", durationDays: "" });
  const [milestoneInputs, setMilestoneInputs] = useState({});
  const [milestonesMap, setMilestonesMap] = useState({});

  useEffect(() => {
    if (!window.ethereum) return alert("Please install MetaMask!");
    const prov = new ethers.providers.Web3Provider(window.ethereum);
    setProvider(prov);
    prov.send("eth_requestAccounts", []).then(() => {
      const signer = prov.getSigner();
      setSigner(signer);
      signer.getAddress().then(setAccount);
      setContract(new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
    });

    window.ethereum.on("accountsChanged", (accounts) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        setSigner(prov.getSigner());
      } else {
        setAccount(null);
        setSigner(null);
        setContract(null);
      }
    });
  }, []);

  useEffect(() => {
    async function loadCampaigns() {
      if (!contract) return;
      setLoading(true);
      try {
        const count = await contract.campaignCount();
        const loaded = [];
        for (let i = 1; i <= count; i++) {
          const c = await contract.getCampaign(i);
          loaded.push({
            id: i,
            owner: c.owner,
            title: c.title,
            description: c.description,
            fundingGoal: ethers.utils.formatEther(c.fundingGoal),
            totalFunds: ethers.utils.formatEther(c.totalFunds),
            deadline: new Date(c.deadline.toNumber() * 1000),
            isOpen: c.isOpen,
            milestoneCount: c.milestoneCount.toNumber(),
          });
        }
        setCampaigns(loaded);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    }
    loadCampaigns();
  }, [contract]);

  async function handleCreateCampaign(e) {
    e.preventDefault();
    if (!contract) return;
    try {
      const goalWei = ethers.utils.parseEther(newCampaign.fundingGoal);
      const tx = await contract.createCampaign(newCampaign.title, newCampaign.description, goalWei, Number(newCampaign.durationDays));
      await tx.wait();
      alert("Campaign created!");
      setNewCampaign({ title: "", description: "", fundingGoal: "", durationDays: "" });
      const count = await contract.campaignCount();
      const c = await contract.getCampaign(count);
      setCampaigns((prev) => [...prev, {
        id: count,
        owner: c.owner,
        title: c.title,
        description: c.description,
        fundingGoal: ethers.utils.formatEther(c.fundingGoal),
        totalFunds: ethers.utils.formatEther(c.totalFunds),
        deadline: new Date(c.deadline.toNumber() * 1000),
        isOpen: c.isOpen,
        milestoneCount: c.milestoneCount.toNumber(),
      }]);
    } catch (err) {
      alert("Error creating campaign: " + err.message);
    }
  }

  async function handleAddMilestone(campaignId) {
    if (!contract) return;
    const input = milestoneInputs[campaignId];
    if (!input?.description || !input?.target) return alert("Fill milestone fields");
    try {
      const targetWei = ethers.utils.parseEther(input.target);
      const tx = await contract.addMilestone(campaignId, input.description, targetWei);
      await tx.wait();
      alert("Milestone added!");
      setMilestoneInputs((prev) => ({ ...prev, [campaignId]: { description: "", target: "" } }));
      const c = await contract.getCampaign(campaignId);
      setCampaigns((prev) => prev.map((camp) => camp.id === campaignId ? { ...camp, milestoneCount: c.milestoneCount.toNumber() } : camp));
    } catch (err) {
      alert("Error adding milestone: " + err.message);
    }
  }

  async function handleContribute(campaignId) {
    if (!contract) return;
    const amount = prompt("Enter contribution amount in ETH:");
    if (!amount) return;
    try {
      const value = ethers.utils.parseEther(amount);
      const tx = await contract.contribute(campaignId, { value });
      await tx.wait();
      alert("Contribution successful!");
      const c = await contract.getCampaign(campaignId);
      setCampaigns((prev) => prev.map((camp) => camp.id === campaignId ? { ...camp, totalFunds: ethers.utils.formatEther(c.totalFunds) } : camp));
    } catch (err) {
      alert("Contribution failed: " + err.message);
    }
  }

  async function loadMilestones(campaignId, milestoneCount) {
    if (!contract) return;
    const loaded = [];
    for (let i = 1; i <= milestoneCount; i++) {
      const m = await contract.getMilestone(campaignId, i);
      loaded.push({
        id: i,
        description: m.description,
        targetAmount: ethers.utils.formatEther(m.targetAmount),
        isCompleted: m.isCompleted,
        fundsReleased: m.fundsReleased,
        votesFor: m.votesFor.toNumber(),
        votesAgainst: m.votesAgainst.toNumber(),
      });
    }
    setMilestonesMap((prev) => ({ ...prev, [campaignId]: loaded }));
  }

  async function voteMilestone(campaignId, milestoneId, approve) {
    if (!contract) return;
    try {
      const tx = await contract.voteMilestone(campaignId, milestoneId, approve);
      await tx.wait();
      alert("Vote cast successfully!");
      const milestoneCount = campaigns.find((c) => c.id === campaignId)?.milestoneCount || 0;
      loadMilestones(campaignId, milestoneCount);
    } catch (err) {
      alert("Voting failed: " + err.message);
    }
  }

  async function releaseFunds(campaignId, milestoneId) {
    if (!contract) return;
    try {
      const tx = await contract.releaseFunds(campaignId, milestoneId);
      await tx.wait();
      alert("Funds released!");
      const milestoneCount = campaigns.find((c) => c.id === campaignId)?.milestoneCount || 0;
      loadMilestones(campaignId, milestoneCount);
    } catch (err) {
      alert("Release failed: " + err.message);
    }
  }

  async function claimRefund(campaignId) {
    if (!contract) return;
    try {
      const tx = await contract.claimRefund(campaignId);
      await tx.wait();
      alert("Refund claimed if eligible.");
    } catch (err) {
      alert("Refund failed: " + err.message);
    }
  }

  return (
    <div className="app-container">
      <h1>Decentralized Crowdfunding DApp</h1>
      <p>Connected account: {account ?? "Not connected"}</p>

      <section>
        <h2>Create New Campaign</h2>
        <form onSubmit={handleCreateCampaign}>
          <input required type="text" placeholder="Title" value={newCampaign.title} onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })} />
          <textarea required rows={3} placeholder="Description" value={newCampaign.description} onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })} />
          <input required type="number" step="0.01" placeholder="Funding Goal in ETH" value={newCampaign.fundingGoal} onChange={(e) => setNewCampaign({ ...newCampaign, fundingGoal: e.target.value })} />
          <input required type="number" placeholder="Duration (days)" value={newCampaign.durationDays} onChange={(e) => setNewCampaign({ ...newCampaign, durationDays: e.target.value })} />
          <button type="submit">Create</button>
        </form>
      </section>

      <section>
        <h2>Campaigns</h2>
        {loading ? <p>Loading campaigns...</p> : campaigns.map((camp) => (
          <div key={camp.id} className="campaign-card">
            <h3>{camp.title}</h3>
            <p>{camp.description}</p>
            <p><strong>Goal:</strong> {camp.fundingGoal} ETH</p>
            <p><strong>Raised:</strong> {camp.totalFunds} ETH</p>
            <p><strong>Deadline:</strong> {camp.deadline.toLocaleString()}</p>
            <p><strong>Status:</strong> {camp.isOpen ? "Open" : "Closed"}</p>
            <button onClick={() => handleContribute(camp.id)}>Contribute</button>
            <button onClick={() => claimRefund(camp.id)}>Claim Refund</button>

            <div>
              <h4>Add Milestone</h4>
              <input type="text" placeholder="Description" value={milestoneInputs[camp.id]?.description || ""} onChange={(e) => handleMilestoneInputChange(camp.id, "description", e.target.value)} />
              <input type="text" placeholder="Target in ETH" value={milestoneInputs[camp.id]?.target || ""} onChange={(e) => handleMilestoneInputChange(camp.id, "target", e.target.value)} />
              <button onClick={() => handleAddMilestone(camp.id)}>Add</button>
            </div>

            <div>
              <h4>Milestones</h4>
              <button onClick={() => loadMilestones(camp.id, camp.milestoneCount)}>Load Milestones</button>
              {milestonesMap[camp.id]?.map((m) => (
                <div key={m.id} className="milestone">
                  <p>{m.description} - {m.targetAmount} ETH</p>
                  <p>Votes: ✅ {m.votesFor} ❌ {m.votesAgainst}</p>
                  <p>Status: {m.isCompleted ? "Completed" : "In Progress"} | Released: {m.fundsReleased ? "Yes" : "No"}</p>
                  <button onClick={() => voteMilestone(camp.id, m.id, true)}>Approve</button>
                  <button onClick={() => voteMilestone(camp.id, m.id, false)}>Reject</button>
                  <button onClick={() => releaseFunds(camp.id, m.id)}>Release Funds</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

export default App;
