import React, { useEffect, useState } from "react";
import { ethers } from "ethers";

// Replace with your deployed contract address
const CONTRACT_ADDRESS = "0xb6AD66D24a8023D3813156df657387Fd1fc9F09e";

// ABI - You can replace this with your generated ABI JSON from compilation
const CONTRACT_ABI = [
  // Only essential fragments shown for brevity - expand as needed
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

  // Form states for creating campaign
  const [newCampaign, setNewCampaign] = useState({
    title: "",
    description: "",
    fundingGoal: "",
    durationDays: "",
  });

  // Form states for adding milestone per campaign
  const [milestoneInputs, setMilestoneInputs] = useState({});

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

    // Listen for account change
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

  // Load campaigns from contract
  useEffect(() => {
    async function loadCampaigns() {
      if (!contract) return;
      setLoading(true);
      try {
        const count = await contract.campaignCount();
        const loaded = [];
        for (let i = 1; i <= count; i++) {
          const c = await contract.getCampaign(i);
          // c is a tuple - unpack it
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

  // Handle campaign creation
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

  // Handle adding milestone
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
      // Reset input for campaign
      setMilestoneInputs((prev) => ({ ...prev, [campaignId]: { description: "", target: "" } }));
      // Refresh campaigns to update milestone count
      const c = await contract.getCampaign(campaignId);
      setCampaigns((prev) =>
        prev.map((camp) =>
          camp.id === campaignId
            ? {
                ...camp,
                milestoneCount: c.milestoneCount.toNumber(),
              }
            : camp
        )
      );
    } catch (err) {
      alert("Error adding milestone: " + err.message);
    }
  }

  // Handle input changes for milestone descriptions and target amounts
  function handleMilestoneInputChange(campaignId, field, value) {
    setMilestoneInputs((prev) => ({
      ...prev,
      [campaignId]: {
        ...prev[campaignId],
        [field]: value,
      },
    }));
  }

  // Handle contribution
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

  // State to store milestones per campaign
  const [milestonesMap, setMilestonesMap] = useState({});

  // Load milestones on demand per campaign
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

  // Voting on milestones
  async function voteMilestone(campaignId, milestoneId, approve) {
    if (!contract) return;
    try {
      const tx = await contract.voteMilestone(campaignId, milestoneId, approve);
      await tx.wait();
      alert("Vote cast successfully!");
      // Reload milestones for this campaign
      const milestoneCount = campaigns.find((c) => c.id === campaignId)?.milestoneCount || 0;
      loadMilestones(campaignId, milestoneCount);
    } catch (err) {
      alert("Voting failed: " + err.message);
    }
  }

  // Release funds for milestone
  async function releaseFunds(campaignId, milestoneId) {
    if (!contract) return;
    try {
      const tx = await contract.releaseFunds(campaignId, milestoneId);
      await tx.wait();
      alert("Funds released for milestone!");
      // Reload milestones
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
        {campaigns.length === 0 && !loading && <p>No campaigns found.</p>}
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

            {/* Milestone adding form (only if owner and campaign open) */}
            {account?.toLowerCase() === campaign.owner.toLowerCase() && campaign.isOpen && (
              <div>
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
                  placeholder="Target ETH"
                  step="0.01"
                  min="0"
                  value={milestoneInputs[campaign.id]?.target || ""}
                  onChange={(e) => handleMilestoneInputChange(campaign.id, "target", e.target.value)}
                />
                <button onClick={() => handleAddMilestone(campaign.id)}>Add Milestone</button>
              </div>
            )}

            <div>
              <button
                onClick={() => loadMilestones(campaign.id, campaign.milestoneCount)}
                disabled={milestonesMap[campaign.id]?.length === campaign.milestoneCount}
              >
                Load Milestones ({campaign.milestoneCount})
              </button>
            </div>

            {/* List milestones if loaded */}
            {milestonesMap[campaign.id]?.map((milestone) => (
              <div key={milestone.id} className="milestone">
                <p>
                  <strong>Milestone {milestone.id}:</strong> {milestone.description}
                  <br />
                  Target: {milestone.targetAmount} ETH
                  <br />
                  Completed: {milestone.isCompleted ? "Yes" : "No"}
                  <br />
                  Funds Released: {milestone.fundsReleased ? "Yes" : "No"}
                  <br />
                  Votes For: {milestone.votesFor} | Votes Against: {milestone.votesAgainst}
                </p>
                <div className="milestone-vote">
                  <button
                    className="vote-btn"
                    onClick={() => voteMilestone(campaign.id, milestone.id, true)}
                  >
                    Vote Approve
                  </button>
                  <button onClick={() => voteMilestone(campaign.id, milestone.id, false)}>
                    Vote Reject
                  </button>

                  {/* Only owner can release funds */}
                  {account?.toLowerCase() === campaign.owner.toLowerCase() && milestone.isCompleted && !milestone.fundsReleased && (
                    <button onClick={() => releaseFunds(campaign.id, milestone.id)}>Release Funds</button>
                  )}
                </div>
              </div>
            ))}

            {/* Contribution button if campaign open */}
            {campaign.isOpen && (
              <button onClick={() => handleContribute(campaign.id)}>Contribute</button>
            )}

            {/* Claim refund if campaign closed and goal not reached */}
            {!campaign.isOpen && Number(campaign.totalFunds) < Number(campaign.fundingGoal) && (
              <button onClick={() => claimRefund(campaign.id)}>Claim Refund</button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export default App;
