// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CrowdfundingDapp {
    struct Milestone {
        string description;
        uint256 targetAmount;
        bool isCompleted;
        bool fundsReleased;
        uint256 votesFor;
        uint256 votesAgainst;
        mapping(address => bool) voters;      // Tracks if address voted
        mapping(address => bool) votes;       // true = approve, false = reject
    }

    struct Campaign {
        address payable owner;
        string title;
        string description;
        uint256 fundingGoal;
        uint256 totalFunds;
        uint256 deadline;
        bool isOpen;
        uint256 milestoneCount;
        mapping(uint256 => Milestone) milestones;
        mapping(address => uint256) contributions;
        address[] contributors;
        uint256 releasedFunds;
        bool isRefunded;
        bool isDeleted;
    }

    uint256 public campaignCount;
    mapping(uint256 => Campaign) private campaigns;

    // New: Reputation tracking
    mapping(address => uint256) public successfulCampaigns;
    mapping(address => uint256) public refundedCampaigns;

    event CampaignCreated(uint256 campaignId, address owner, string title, uint256 goal, uint256 deadline);
    event ContributionMade(uint256 campaignId, address contributor, uint256 amount);
    event MilestoneAdded(uint256 campaignId, uint256 milestoneId, string description, uint256 target);
    event MilestoneVoted(uint256 campaignId, uint256 milestoneId, address voter, bool vote);
    event FundsReleased(uint256 campaignId, uint256 milestoneId, uint256 amount);
    event RefundIssued(uint256 campaignId, address contributor, uint256 amount);
    event CampaignClosed(uint256 campaignId);
    event CampaignDeleted(uint256 campaignId);

    modifier onlyOwner(uint256 _campaignId) {
        require(msg.sender == campaigns[_campaignId].owner, "Only owner can call");
        _;
    }

    modifier campaignExists(uint256 _campaignId) {
        require(_campaignId > 0 && _campaignId <= campaignCount, "Campaign does not exist");
        require(!campaigns[_campaignId].isDeleted, "Campaign deleted");
        _;
    }

    modifier campaignOpen(uint256 _campaignId) {
        require(campaigns[_campaignId].isOpen, "Campaign is closed");
        _;
    }

    function createCampaign(
        string calldata _title,
        string calldata _description,
        uint256 _fundingGoal,
        uint256 _durationDays
    ) external {
        require(_fundingGoal > 0, "Goal must be > 0");
        require(_durationDays > 0, "Duration must be > 0");

        campaignCount++;
        Campaign storage c = campaigns[campaignCount];
        c.owner = payable(msg.sender);
        c.title = _title;
        c.description = _description;
        c.fundingGoal = _fundingGoal;
        c.deadline = block.timestamp + (_durationDays * 1 days);
        c.isOpen = true;

        emit CampaignCreated(campaignCount, msg.sender, _title, _fundingGoal, c.deadline);
    }

    function addMilestone(uint256 _campaignId, string calldata _desc, uint256 _target)
        external
        campaignExists(_campaignId)
        onlyOwner(_campaignId)
        campaignOpen(_campaignId)
    {
        require(_target > 0, "Target must be > 0");
        Campaign storage c = campaigns[_campaignId];
        require(c.totalFunds < c.fundingGoal, "Campaign already funded");

        c.milestoneCount++;
        Milestone storage m = c.milestones[c.milestoneCount];
        m.description = _desc;
        m.targetAmount = _target;
        m.isCompleted = false;
        m.fundsReleased = false;
        m.votesFor = 0;
        m.votesAgainst = 0;

        emit MilestoneAdded(_campaignId, c.milestoneCount, _desc, _target);
    }

    function contribute(uint256 _campaignId)
        external
        payable
        campaignExists(_campaignId)
        campaignOpen(_campaignId)
    {
        Campaign storage c = campaigns[_campaignId];
        require(block.timestamp < c.deadline, "Campaign expired");
        require(msg.value > 0, "Must send some ether");

        if (c.contributions[msg.sender] == 0) {
            c.contributors.push(msg.sender);
        }

        c.contributions[msg.sender] += msg.value;
        c.totalFunds += msg.value;

        if (c.totalFunds >= c.fundingGoal) {
            c.isOpen = false;
            successfulCampaigns[c.owner]++; // Track successful campaign
            emit CampaignClosed(_campaignId);
        }

        emit ContributionMade(_campaignId, msg.sender, msg.value);
    }

    function voteMilestone(uint256 _campaignId, uint256 _milestoneId, bool approve)
        external
        campaignExists(_campaignId)
    {
        Campaign storage c = campaigns[_campaignId];
        require(c.contributions[msg.sender] > 0, "Only contributors can vote");
        require(_milestoneId > 0 && _milestoneId <= c.milestoneCount, "Invalid milestone");

        Milestone storage m = c.milestones[_milestoneId];
        require(!m.fundsReleased, "Funds already released for milestone");

        bool hasVotedBefore = m.voters[msg.sender];
        bool previousVote = m.votes[msg.sender];

        if (hasVotedBefore) {
            if (previousVote) {
                m.votesFor--;
            } else {
                m.votesAgainst--;
            }
        }

        m.voters[msg.sender] = true;
        m.votes[msg.sender] = approve;

        if (approve) {
            m.votesFor++;
        } else {
            m.votesAgainst++;
        }

        uint256 totalContributors = getContributorCount(_campaignId);
        m.isCompleted = m.votesFor > totalContributors / 2;

        emit MilestoneVoted(_campaignId, _milestoneId, msg.sender, approve);
    }

    function releaseFunds(uint256 _campaignId, uint256 _milestoneId)
        external
        onlyOwner(_campaignId)
        campaignExists(_campaignId)
    {
        Campaign storage c = campaigns[_campaignId];
        Milestone storage m = c.milestones[_milestoneId];

        require(m.isCompleted, "Milestone not approved yet");
        require(!m.fundsReleased, "Funds already released");

        uint256 availableFunds = c.totalFunds - c.releasedFunds;
        require(availableFunds >= m.targetAmount, "Insufficient available funds");

        m.fundsReleased = true;
        c.releasedFunds += m.targetAmount;

        c.owner.transfer(m.targetAmount);

        emit FundsReleased(_campaignId, _milestoneId, m.targetAmount);
    }

    function claimRefund(uint256 _campaignId)
        external
        campaignExists(_campaignId)
    {
        Campaign storage c = campaigns[_campaignId];
        require(block.timestamp > c.deadline, "Campaign not ended");
        require(c.totalFunds < c.fundingGoal, "Campaign was successful");
        require(c.contributions[msg.sender] > 0, "No contributions found");

        uint256 amount = c.contributions[msg.sender];
        c.contributions[msg.sender] = 0;
        payable(msg.sender).transfer(amount);

        if (!c.isRefunded) {
            c.isRefunded = true;
            refundedCampaigns[c.owner]++; // Track refunded campaign
        }

        emit RefundIssued(_campaignId, msg.sender, amount);
    }

    function getContributorCount(uint256 _campaignId) public view returns (uint256) {
        Campaign storage c = campaigns[_campaignId];
        return c.contributors.length;
    }

    function getContributors(uint256 _campaignId) external view returns (address[] memory) {
        return campaigns[_campaignId].contributors;
    }

    function closeCampaign(uint256 _campaignId)
        external
        campaignExists(_campaignId)
    {
        Campaign storage c = campaigns[_campaignId];
        require(block.timestamp >= c.deadline, "Deadline not reached");
        require(c.isOpen, "Campaign already closed");
        c.isOpen = false;

        emit CampaignClosed(_campaignId);
    }

    function deleteCampaign(uint256 _campaignId)
        external
        campaignExists(_campaignId)
        onlyOwner(_campaignId)
    {
        Campaign storage c = campaigns[_campaignId];
        require(!c.isOpen, "Campaign is still open");
        require(c.isRefunded || c.totalFunds == 0, "Refunds not completed");
        require(!c.isDeleted, "Campaign already deleted");

        c.isDeleted = true;

        emit CampaignDeleted(_campaignId);
    }

    function getCampaign(uint256 _campaignId)
        external
        view
        campaignExists(_campaignId)
        returns (
            address owner,
            string memory title,
            string memory description,
            uint256 fundingGoal,
            uint256 totalFunds,
            uint256 deadline,
            bool isOpen,
            uint256 milestoneCount
        )
    {
        Campaign storage c = campaigns[_campaignId];
        return (
            c.owner,
            c.title,
            c.description,
            c.fundingGoal,
            c.totalFunds,
            c.deadline,
            c.isOpen,
            c.milestoneCount
        );
    }

    function getMilestone(uint256 _campaignId, uint256 _milestoneId)
        external
        view
        campaignExists(_campaignId)
        returns (
            string memory description,
            uint256 targetAmount,
            bool isCompleted,
            bool fundsReleased,
            uint256 votesFor,
            uint256 votesAgainst
        )
    {
        Campaign storage c = campaigns[_campaignId];
        Milestone storage m = c.milestones[_milestoneId];
        return (
            m.description,
            m.targetAmount,
            m.isCompleted,
            m.fundsReleased,
            m.votesFor,
            m.votesAgainst
        );
    }

   
    function getFundingProgress(uint256 _campaignId)
        external
        view
        campaignExists(_campaignId)
        returns (uint256)
    {
        Campaign storage c = campaigns[_campaignId];
        if (c.fundingGoal == 0) return 0;
        return (c.totalFunds * 100) / c.fundingGoal;
    }
}
