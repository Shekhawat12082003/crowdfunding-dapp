import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import './App.css';

const CONTRACT_ADDRESS = "0xA438A82B170B11a1D7AA2E8fD0f760cB6772A38A";

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
  // Optional: If your contract supports deleting campaigns
  "function deleteCampaign(uint256 campaignId) external",
];

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState(null);

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newCampaign, setNewCampaign] = useState({
    title: "",
    description: "",
    fundingGoal: "",
    durationDays: "",
  });

  const [milestoneInputs, setMilestoneInputs] = useState({});
  const [milestonesMap, setMilestonesMap] = useState({});

  // Connect wallet and setup contract
  useEffect(() => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    const prov = new ethers.providers.Web3Provider(window.ethereum);
    setProvider(prov);

    prov.send("eth_requestAccounts", []).then(() => {
      const signer = prov.getSigner();
      setSigner(signer);
      signer.getAddress().then(setAccount);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(contract);
    });

    // Account change listener
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

  // Load all campaigns
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

  // Create campaign handler
  async function handleCreateCampaign(e) {
    e.preventDefault();
    if (!contract) return;

    try {
      const goalWei = ethers.utils.parseEther(newCampaign.fundingGoal);
      const tx = await contract.createCampaign(
        newCampaign.title,
        newCampaign.description,
        goalWei,
        Number(newCampaign.durationDays)
      );
      await tx.wait();

      alert("Campaign created!");
      setNewCampaign({ title: "", description: "", fundingGoal: "", durationDays: "" });

      // Refresh campaigns
      const count = await contract.campaignCount();
      const c = await contract.getCampaign(count);
      setCampaigns((prev) => [
        ...prev,
        {
          id: count,
          owner: c.owner,
          title: c.title,
          description: c.description,
          fundingGoal: ethers.utils.formatEther(c.fundingGoal),
          totalFunds: ethers.utils.formatEther(c.totalFunds),
          deadline: new Date(c.deadline.toNumber() * 1000),
          isOpen: c.isOpen,
          milestoneCount: c.milestoneCount.toNumber(),
        },
      ]);
    } catch (err) {
      alert("Error creating campaign: " + err.message);
    }
  }

  // Add milestone handler
  async function handleAddMilestone(campaignId) {
    if (!contract) return;
    const input = milestoneInputs[campaignId];
    if (!input || !input.description || !input.target) {
      alert("Fill milestone description and target");
      return;
    }
    try {
      const targetWei = ethers.utils.parseEther(input.target);
      const tx = await contract.addMilestone(campaignId, input.description, targetWei);
      await tx.wait();

      alert("Milestone added!");

      // Reset milestone inputs for campaign
      setMilestoneInputs((prev) => ({ ...prev, [campaignId]: { description: "", target: "" } }));

      // Refresh campaign milestoneCount
      const c = await contract.getCampaign(campaignId);
      setCampaigns((prev) =>
        prev.map((camp) =>
          camp.id === campaignId
            ? { ...camp, milestoneCount: c.milestoneCount.toNumber() }
            : camp
        )
      );
    } catch (err) {
      alert("Error adding milestone: " + err.message);
    }
  }

  // Milestone input handler
  function handleMilestoneInputChange(campaignId, field, value) {
    setMilestoneInputs((prev) => ({
      ...prev,
      [campaignId]: {
        ...prev[campaignId],
        [field]: value,
      },
    }));
  }

  // Load milestones for a campaign
  async function loadMilestones(campaignId, milestoneCount) {
    if (!contract) return;

    try {
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
    } catch (err) {
      console.error(err);
      alert("Failed to load milestones");
    }
  }

  // Vote on milestone
  async function voteMilestone(campaignId, milestoneId, approve) {
    if (!contract) return;
    try {
      const tx = await contract.voteMilestone(campaignId, milestoneId, approve);
      await tx.wait();
      alert("Vote cast successfully!");

      // Reload milestones for campaign
      const milestoneCount = campaigns.find((c) => c.id === campaignId)?.milestoneCount || 0;
      loadMilestones(campaignId, milestoneCount);
    } catch (err) {
      alert("Voting failed: " + err.message);
    }
  }

  // Release funds
  async function releaseFunds(campaignId, milestoneId) {
    if (!contract) return;
    try {
      const tx = await contract.releaseFunds(campaignId, milestoneId);
      await tx.wait();
      alert("Funds released for milestone!");

      // Reload milestones for campaign
      const milestoneCount = campaigns.find((c) => c.id === campaignId)?.milestoneCount || 0;
      loadMilestones(campaignId, milestoneCount);
    } catch (err) {
      alert("Release funds failed: " + err.message);
    }
  }

  // Claim refund
  async function claimRefund(campaignId) {
    if (!contract) return;
    try {
      const tx = await contract.claimRefund(campaignId);
      await tx.wait();
      alert("Refund claimed if eligible.");
    } catch (err) {
      alert("Refund claim failed: " + err.message);
    }
  }

  // Contribute
  async function handleContribute(campaignId) {
    if (!contract) return;
    const amount = prompt("Enter contribution amount in ETH:");
    if (!amount) return;
    try {
      const value = ethers.utils.parseEther(amount);
      const tx = await contract.contribute(campaignId, { value });
      await tx.wait();
      alert("Contribution successful!");

      // Refresh totalFunds for campaign
      const c = await contract.getCampaign(campaignId);
      setCampaigns((prev) =>
        prev.map((camp) =>
          camp.id === campaignId
            ? { ...camp, totalFunds: ethers.utils.formatEther(c.totalFunds) }
            : camp
        )
      );
    } catch (err) {
      alert("Contribution failed: " + err.message);
    }
  }

  // Optional: Delete campaign (only if supported in contract)
  async function deleteCampaign(campaignId) {
    if (!contract) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this campaign?");
    if (!confirmDelete) return;

    try {
      const tx = await contract.deleteCampaign(campaignId);
      await tx.wait();
      alert("Campaign deleted!");

      // Remove from campaigns list locally
      setCampaigns((prev) => prev.filter((c) => c.id !== campaignId));
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }
  async function handleDeleteCampaign(campaignId) {
  if (!contract) return;
  try {
    const tx = await contract.deleteCampaign(campaignId);
    await tx.wait();
    alert("Campaign deleted successfully!");
    // Refresh campaigns after deletion
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
    alert("Delete campaign failed: " + err.message);
  }
}


  return (
    <div className="container">
      <h1>Decentralized Crowdfunding DApp</h1>
      <p>Connected account: {account ?? "Not connected"}</p>

      <section>
        <h2>Create New Campaign</h2>
        <form onSubmit={handleCreateCampaign}>
          <label>Title</label>
          <input
            required
            type="text"
            value={newCampaign.title}
            onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
          />
          <label>Description</label>
          <textarea
            required
            rows={3}
            value={newCampaign.description}
            onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
          />
          <label>Funding Goal (ETH)</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={newCampaign.fundingGoal}
            onChange={(e) => setNewCampaign({ ...newCampaign, fundingGoal: e.target.value })}
          />
          <label>Duration (days)</label>
          <input
            required
            type="number"
            min="1"
            value={newCampaign.durationDays}
            onChange={(e) => setNewCampaign({ ...newCampaign, durationDays: e.target.value })}
          />
          <button type="submit">Create Campaign</button>
        </form>
      </section>

      <section>
        <h2>All Campaigns</h2>
        {loading && <p>Loading campaigns...</p>}
        {!loading && campaigns.length === 0 && <p>No campaigns found.</p>}

        {campaigns.map((campaign) => (
          <div key={campaign.id} className="campaign">
            <h3>{campaign.title}</h3>
            <p>{campaign.description}</p>
            <p>
              Owner: {campaign.owner}
              <br />
              Funding Goal: {campaign.fundingGoal} ETH
              <br />
              Total Funds Raised: {campaign.totalFunds} ETH
              <br />
              Deadline: {campaign.deadline.toLocaleString()}
              <br />
              Status:{" "}
              <span className={campaign.isOpen ? "status-open" : "status-closed"}>
                {campaign.isOpen ? "Open" : "Closed"}
              </span>
            </p>

            {/* Delete campaign button if user is owner */}
            {account?.toLowerCase() === campaign.owner.toLowerCase() && (
              <button onClick={() => deleteCampaign(campaign.id)}>Delete Campaign</button>
            )}

            {/* Refund button if campaign is closed and user is not owner */}
          {account?.toLowerCase() === campaign.owner.toLowerCase() && !campaign.isOpen && (
             <button onClick={() => handleDeleteCampaign(campaign.id)}>Delete Campaign</button>
          )}


            {/* Milestone adding form (only if owner and campaign open) */}
            {account?.toLowerCase() === campaign.owner.toLowerCase() && campaign.isOpen && (
              <div className="add-milestone">
                <h4>Add Milestone</h4>
                <input
                  type="text"
                  placeholder="Description"
                  value={milestoneInputs[campaign.id]?.description || ""}
                  onChange={(e) =>
                    handleMilestoneInputChange(campaign.id, "description", e.target.value)
                  }
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Target Amount (ETH)"
                  value={milestoneInputs[campaign.id]?.target || ""}
                  onChange={(e) =>
                    handleMilestoneInputChange(campaign.id, "target", e.target.value)
                  }
                />
                <button onClick={() => handleAddMilestone(campaign.id)}>Add Milestone</button>
              </div>
            )}

            <button onClick={() => loadMilestones(campaign.id, campaign.milestoneCount)}>
              Load Milestones ({campaign.milestoneCount})
            </button>

            {/* Milestones List */}
            {milestonesMap[campaign.id] &&
              milestonesMap[campaign.id].map((ms) => (
                <div key={ms.id} className="milestone">
                  <h5>Milestone #{ms.id}</h5>
                  <p>Description: {ms.description}</p>
                  <p>Target: {ms.targetAmount} ETH</p>
                  <p>
                    Completed: {ms.isCompleted ? "Yes" : "No"}
                    <br />
                    Funds Released: {ms.fundsReleased ? "Yes" : "No"}
                    <br />
                    Votes For: {ms.votesFor}
                    <br />
                    Votes Against: {ms.votesAgainst}
                  </p>

                  {/* Voting Buttons if campaign is open */}
                  {campaign.isOpen && (
                    <>
                      <button onClick={() => voteMilestone(campaign.id, ms.id, true)}>
                        Vote Approve
                      </button>
                      <button onClick={() => voteMilestone(campaign.id, ms.id, false)}>
                        Vote Reject
                      </button>
                    </>
                  )}

                  {/* Release funds button if user is owner and milestone completed and not yet released */}
                  {account?.toLowerCase() === campaign.owner.toLowerCase() &&
                    ms.isCompleted &&
                    !ms.fundsReleased && (
                      <button onClick={() => releaseFunds(campaign.id, ms.id)}>
                        Release Funds
                      </button>
                    )}
                </div>
              ))}

            {/* Contribute and Refund Buttons */}
            {campaign.isOpen && (
              <button onClick={() => handleContribute(campaign.id)}>Contribute</button>
            )}

            {!campaign.isOpen && (
              <button onClick={() => claimRefund(campaign.id)}>Claim Refund</button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export default App;
