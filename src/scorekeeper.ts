import { ApiPromise } from "@polkadot/api";
import Keyring from '@polkadot/keyring';
import { KeyringPair } from "@polkadot/keyring/types";
import { CronJob } from 'cron';

import Database from './db';

type Nomconfig = {
  seed: string,
  maxNominations: number,
};
type Stash = string;

/// 10% in per billion type.
const TEN_PERCENT: number = 10000000;

/// 50 KSM with decimals.
const FIFTY_KSM: number = 50 * 10**12;

/// It's been ONE WEEK since you looked at me...
const WEEK = 7 * 24 * 60 * 60 * 1000;

class Nominator {
  public currentlyNominating: Stash[] = [];
  public maxNominations: number;

  private api: ApiPromise;
  private db: Database;
  private signer: KeyringPair;

  constructor(api: ApiPromise, db: Database, seed: string, maxNominations: number) {
    this.api = api;
    this.db = db;
    this.maxNominations = maxNominations;

    const keyring = new Keyring({
      type: 'sr25519',
    });

    this.signer = keyring.createFromUri(seed);
    console.log(`Nominator spawned: ${this.address}`);
  }

  async nominate(targets: Array<Stash>) {
    const now = new Date().getTime();

    const tx = this.api.tx.staking.nominate(targets);
    console.log(
      `Sending extrinsic Staking::nominate from ${this.address} to targets ${targets} at ${now}`
    );
    const unsub = await tx.signAndSend(this.signer, (result: any) => {
      const { status } = result;

      console.log(`Status now: ${status.type}`);
      // console.log(status.isFinalized);
      if (status.isFinalized) {
        console.log(`Included in block ${status.asFinalized}`);
        this.currentlyNominating = targets;
        for (const stash of targets) {
          this.db.setNominatedAt(stash, now);
        }
        unsub();
      }
    });
  }

  get address() { return this.signer.address; }

}

export default class ScoreKeeper {
  public api: ApiPromise;
  public config: any;
  public currentEra: number = 0;
  public currentSet: Array<Stash> = [];
  public db: any;
  private nominators: Array<Nominator> = [];

  constructor(api: ApiPromise, db: any, config: any) {
    this.api = api;
    this.db = db;
    this.config = config;
  }

  /// Spawns a new nominator.
  async spawn(seed: string, maxNominations: number = 1) {
    this.nominators.push(
      new Nominator(this.api, this.db, seed, maxNominations)
    );
  }

  async begin(frequency: string) {
    if (!this.nominators) {
      throw new Error('No nominators spawned! Cannot begin.');
    }

    // TMP - start immediately
    await this.startRound();

    new CronJob(frequency, async () => {
      if (!this.currentSet) {
        await this.startRound();
      } else {
        await this.endRound();
        await this.startRound();
      }
    }).start(); 
  }

  /// Handles the beginning of a new round.
  async startRound() {
    const now = new Date().getTime();
    console.log(`New round starting at ${now}`);

    const set = await this._getSet();
    this.currentSet = set;
    // console.log('set', set);

    for (const nominator of this.nominators) {
      const maxNominations = nominator.maxNominations;

      let toNominate = [];
      for (let i = 0; i < maxNominations; i++) {
        if (set.length > 0) {
          toNominate.push(
            set.shift(),
          );
        } else {
          console.log('ran to the end of candidates');
          return;
        }
      }

      toNominate = toNominate.map((node: any) => node.stash);

      // console.log('toNominate', toNominate);
      await nominator.nominate(toNominate);
    }
  }

  async _getSet(): Promise<any[]> {
    let nodes = await this.db.allNodes();
    // Only take nodes that have a stash attached.
    nodes = nodes.filter((node: any) => node.stash !== null);
    // Only take nodes that are online.
    nodes = nodes.filter((node: any) => node.offlineSince === 0);
    // Only take nodes that have `goodSince` over one week.
    if (!this.config.global.test) {
      nodes = nodes.filter((node: any) => {
        const now = new Date().getTime();
        return now - Number(node.goodSince) >= WEEK;
      });
    }
    // Ensure nodes have 98% uptime (3.35 hours for one week).
    nodes = nodes.filter((node: any) => node.offlineAccumulated / WEEK <= 0.02);
    // Ensure they meet the requirements of:
    //  - Less than 10% commission.
    //  - More than 50 KSM.
    let tmpNodes = [];
    for (const node of nodes) {
      // console.log('node', node)
      const preferences = await this.api.query.staking.validators(node.stash);
      //@ts-ignore
      const { commission } = preferences.toJSON()[0];
      const exposure = await this.api.query.staking.stakers(node.stash);
      //@ts-ignore
      const { own } = exposure.toJSON();
      if (Number(commission) <= TEN_PERCENT && own >= FIFTY_KSM) {
        const index = nodes.indexOf(node);
        tmpNodes.push(nodes[index]);
      }
    }
    nodes = tmpNodes;

    // Sort by earliest connected on top.
    nodes.sort((a: any, b: any) => {
      return a.connectedAt - b.connectedAt;
    });
    // Sort so that the most recent nominations are at the bottom.
    nodes.sort((a: any, b: any) => {
      return a.nominatedAt - b.nominatedAt;
    });

    // console.log('nodes', nodes);
    return nodes;
  }
  
  /// Handles the ending of a round.
  async endRound() {
    console.log('Ending round');

    for (const nominator of this.nominators) {
      const { currentlyNominating } = nominator;
      delete nominator.currentlyNominating;

      // If not nominating any... then return.
      if (!currentlyNominating) return;

      for (const stash of currentlyNominating) {
        /// Ensure the commission wasn't raised.
        const preferences = await this.api.query.staking.validators(stash);
        //@ts-ignore
        const { commission } = preferences.toJSON()[0];
        if (commission > TEN_PERCENT) {
          await this.dockPoints(stash);
          continue;
        }
        /// Ensure the 50 KSM minimum was not removed.
        const exposure = await this.api.query.staking.stakers(stash);
        //@ts-ignore
        const { own } = exposure.toJSON();
        if (own < FIFTY_KSM) {
          await this.dockPoints(stash);
          continue;
        }

        /// Ensure the validator is still online.
        const node = await this.db.getValidator(stash);
        if (Number(node.offlineSince) !== 0) {
          await this.dockPoints(stash);
          continue;
        }

        /// TODO check against slashes in this era.
        //then if everything is all right...
        await this.addPoint(stash);
      }
    }
  }

  /// Handles the docking of points from bad behaving validators.
  async dockPoints(stash: Stash) {
    console.log(`Stash ${stash} did BAD, docking points`);

    const oldData = await this.db.getValidator(stash);
    /// This logic adds one to misbehaviors and reduces rank by half. 
    const newData = Object.assign(oldData, {
      rank: Math.floor(oldData.rank / 2),
      misbehaviors: oldData.misbehaviors + 1,
    });
    return this.db.setValidator(stash, newData);
  }

  /// Handles the adding of points to successful validators.
  async addPoint(stash: Stash) {
    console.log(`Stash ${stash} did GOOD, adding points`);

    const oldData = await this.db.getValidator(stash);
    const newData = Object.assign(oldData, {
      rank: oldData.rank + 1,
    });
    return this.db.setValidator(stash, newData);
  }
}