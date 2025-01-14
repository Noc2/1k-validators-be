export type Address = string;
export type Stash = string;

export type NominatorConfig = {
  seed: string;
  maxNominations: number | "auto";
  isProxy?: boolean;
  proxyFor?: string;
  proxyDelay?: number;
};

export type ClaimerConfig = {
  seed: string;
};

export type EraReward = {
  stash: string;
  era: number;
};

export type BooleanResult = [boolean | null, string | null];
export type NumberResult = [number | null, string | null];
export type StringResult = [string | null, string | null];

export enum InvalidityType {
  Online,
  ValidateIntention,
  ClientUpgrade,
  ConnectionTime,
  Identity,
  MultipleIdentities,
  AccumulatedOfflineTime,
  RewardDestination,
  Commission,
  SelfStake,
  UnclaimedRewards,
  KusamaRank,
}

export type InvalidityReason = {
  valid: boolean;
  type: InvalidityType;
  details: string;
  updated: number;
};

export type Identity = {
  name: string;
  sub: string;
  verified: boolean;
};

/// The data for a candidate that's kept in the DB.
export type CandidateData = {
  /// The ID inherited from telemetry, null when no node has been connected.
  /// Cannot be used reliably to identify specific nodes. Instead use the networkId
  /// field.
  id: number | null;
  /// The network id is null when no node is connected.
  networkId: string | null;
  /// The name registered on telemetry or on the candidates list.
  name: string;
  details: any[];
  discoveredAt: number;
  nominatedAt: number;
  offlineSince: number;
  offlineAccumulated: number;
  // Records when a node came online.
  onlineSince: number;
  // Records if a node is running the latest code.
  updated: boolean;
  rank: number;
  misbehaviors: number;
  /// This will only be null for nodes that are connected to
  /// the telemetry and not registered as a candidate.
  stash: string | null;
  kusamaStash: string;
  skipSelfStake: boolean;
  bio: string;
  unclaimedEras: [number];
  version: string;
  valid: boolean;
  bonded: number;
  faults: number;
  inclusion: number;
  spanInclusion: number;
  identity: Identity;
  location: string;
  councilStake: number;
  councilVotes: any[];
  democracyVoteCount: number;
  democracyVotes: [number];
  infrastructureLocation: any;
};

export type Referendum = {
  // The unique index of the proposal, used to identity and query by
  referendumIndex: number;
  // The block at which the proposal was made
  proposedAt: number;
  // The block at which voting on the proposal ends
  proposalEnd: number;
  // the number of blocks delay between the proposal voting ending and it enacting if passed
  proposalDelay: number;
  // The kind of turnout needed, ie 'SimplyMajority', or 'SuperMajorityApprove'
  threshold: string;
  // The human denoninated deposit for the proposal
  deposit: number;
  // The address of who proposed it
  proposer: string;
  // the hash of the call
  imageHash: string;
  // The total amount of votes
  voteCount: number;
  // The total amount of votes for Aye
  voteCountAye: number;
  // The total amount of nay votes
  voteCountNay: number;
  // The amount of human denominated tokens that voted Aye
  voteAyeAmount: number;
  // The amount of human denominated tokens that voted Nay
  voteNayAmount: number;
  // The amount of human denominated tokens that voted in total
  voteTotalAmount: number;
  // Whether the vote is passing or not
  isPassing: boolean;
};

export type ReferendumVote = {
  // The unique index of the proposal, used to identity and query by
  referendumIndex: number;
  // The account the vote is from
  accountId: string;
  // Whether or not the vote was delegated
  isDelegating: boolean;
  // the human denominated amount of tokens voting
  balance: number;
  // The kind of vote, ie 'Aye' or 'Nay'
  voteDirection: string;
  // The conviction that was used to vote with
  conviction: string;
};
